/**
 * 运行时关卡：手动收兵/选门、兵种切换、持续战斗、技能、随机事件与四种关卡目标。
 * 所有可收集对象均带一次性完成标记，仿真与实战共用 Logic.battleStep。
 */
(function (global) {
  var CR = (global.CR = global.CR || {})
  var C = CR.CONFIG
  var L = CR.Logic
  var Content = CR.Content

  function Level (w, h) {
    this.data = null
    this.levelIndex = 0
    this.traveled = 0
    this.completed = false
    this.failed = false
    this.speed = C.baseSpeed
    this.mode = 'standard'
    this.timeLeft = 0
    this.escortHp = C.escortMaxHp
    this.setMetrics(w, h)
  }

  Level.prototype.setMetrics = function (w, h) {
    this.w = w; this.h = h
    this.horizonY = h * C.horizonRatio
    this.groundY = h * C.playerLineRatio
    this.playerLineY = this.groundY
  }
  Level.prototype.resize = function (w, h) { this.setMetrics(w, h) }

  Level.prototype.load = function (levelIndex) {
    this.levelIndex = levelIndex
    this.data = L.generateLevel(levelIndex)
    this.mode = this.data.mode || 'standard'
    this.traveled = 0
    this.completed = false
    this.failed = false
    this.timeLeft = this.data.timeLimit || C.modeTimeLimit
    this.escortHp = C.escortMaxHp
    this.defendPrepZ = 3600
    this.defendReady = false
    this.speed = Math.min(C.maxSpeed, C.baseSpeed + levelIndex * C.speedGrowthPerLevel)
    for (var i = 0; i < this.data.items.length; i++) {
      var it = this.data.items[i]
      it._done = false; it._dead = false; it._proj = null; it._engaged = false
      it._fxKills = 0; it._adv = 0; it._melee = false; it._skillClock = 0; it._skillFx = 0
      it._phase = 1; it._defendActive = false
      if (it.type === 'wave') { it._hp = it.count; it._maxHp = it.count }
      if (it.type === 'general') { it._hp = it.hp; it._maxHp = it.maxHp }
    }
    return this.data
  }

  Level.prototype.trackLeft = function () { return this.w * C.trackMarginRatio }
  Level.prototype.trackWidth = function () { return this.w * (1 - 2 * C.trackMarginRatio) }
  Level.prototype.project = function (z) {
    var dz = z - this.traveled
    var d = Math.max(0, dz)
    var s = C.perspectiveK / (C.perspectiveK + d)
    return { dz: dz, s: s, sy: this.horizonY + (this.groundY - this.horizonY) * s }
  }
  Level.prototype.projX = function (x, s) { return this.w / 2 + (x - this.w / 2) * s }
  Level.prototype.playerRatio = function (player) { return (player.x - this.trackLeft()) / this.trackWidth() }
  Level.prototype.pickupAnchorX = function (item) {
    var tl = this.trackLeft(), tw = this.trackWidth()
    return item.side === 'L' ? tl + tw * 0.11 : tl + tw * 0.89
  }
  Level.prototype.sideAnchorX = function (side) {
    var tl = this.trackLeft(), tw = this.trackWidth()
    return side === 'L' ? tl + tw * 0.25 : tl + tw * 0.75
  }
  Level.prototype.enemyBounds = function (item) {
    var tl = this.trackLeft(), tw = this.trackWidth()
    var cx = tl + item.centerRatio * tw, hw = item.widthRatio * tw / 2
    return { cx: cx, hw: hw, left: cx - hw, right: cx + hw }
  }

  Level.prototype.visibleItems = function () {
    var out = []
    if (!this.data) return out
    for (var i = 0; i < this.data.items.length; i++) {
      var it = this.data.items[i]
      if ((it.type === 'wave' || it.type === 'general') && it._dead) continue
      if ((it.type === 'pickup' || it.type === 'gate' || it.type === 'troopGate' || it.type === 'event') && it._done) continue
      var pr = it._proj || this.project(it.z)
      if (pr.dz > -90 && pr.dz < C.viewFar) out.push(it)
    }
    out.sort(function (a, b) { return (b._proj ? b._proj.dz : b.z) - (a._proj ? a._proj.dz : a.z) })
    return out
  }

  Level.prototype.liveEnemies = function () {
    if (!this.data) return []
    return this.data.items.filter(function (it) { return (it.type === 'wave' || it.type === 'general') && !it._dead })
  }

  Level.prototype.defeatedEnemyCount = function () {
    if (!this.data) return 0
    return this.data.items.filter(function (it) { return (it.type === 'wave' || it.type === 'general') && it._dead }).length
  }

  Level.prototype.pushLose = function (events, reason) {
    if (this.completed || this.failed) return
    this.failed = true
    events.push({ type: 'lose', reason: reason || 'army' })
  }

  Level.prototype.update = function (dt, player) {
    var events = []
    if (!this.data || this.completed || this.failed) return events

    // 守城先手动布防，抵达阵线后不再前进，上一场清空后下一场原地接续
    if (this.mode === 'defend') {
      if (!this.defendReady && this.traveled >= this.defendPrepZ) {
        this.defendReady = true
        this.speed = 0
      }
      if (this.defendReady) {
        var next = this.liveEnemies()[0]
        if (next && !next._defendActive) {
          next._defendActive = true
          next.z = this.traveled + C.engageRange - 35
          next._adv = 0
        }
      }
    }

    var fighting = false
    for (var fi = 0; fi < this.data.items.length; fi++) {
      var fe = this.data.items[fi]
      if ((fe.type === 'wave' || fe.type === 'general') && !fe._dead && (this.mode !== 'defend' || fe._defendActive)) {
        var fd = (fe.z - (fe._adv || 0)) - this.traveled
        if (fd <= C.engageRange && fd > -400) { fighting = true; break }
      }
    }
    if (!fighting && (this.mode !== 'defend' || !this.defendReady)) this.traveled += this.speed * dt
    if (this.mode === 'timed') this.timeLeft = Math.max(0, this.timeLeft - dt)

    var self = this
    var ratio = this.playerRatio(player)
    this.data.items.forEach(function (it) {
      it._proj = self.project(it.z - (it._adv || 0))
      var d = it._proj.dz
      if (it.type === 'wave' || it.type === 'general') {
        it._fxKills = 0
        it._skillFx = Math.max(0, (it._skillFx || 0) - dt)
      }

      // 所有牌、门和事件都必须由玩家手动贴边选择，错过不自动补发
      if (it.type === 'pickup' || it.type === 'gate' || it.type === 'troopGate' || it.type === 'event') {
        if (it._done) return
        if (d < -60) { it._done = true; return }
        if (d <= C.pickupCollectDz) {
          if (it.type === 'pickup') {
            var onSide = it.side === 'L' ? ratio <= C.pickupSideRatio : ratio >= 1 - C.pickupSideRatio
            if (onSide) {
              var value = Math.max(1, Math.round(it.value * (player.recruitMultiplier || 1)))
              L.addArmyUnits(player, value)
              it._done = true
              var ax = self.pickupAnchorX(it)
              events.push({ type: 'pickup', item: it, value: value, x: self.projX(ax, it._proj.s), y: it._proj.sy })
            }
          } else if (it.type === 'gate') {
            var side = ratio <= C.gateSideRatio ? 'L' : (ratio >= 1 - C.gateSideRatio ? 'R' : null)
            if (side) {
              var option = side === 'L' ? it.left : it.right
              var after = L.applyArmyGate(player, option)
              it._done = true
              events.push({ type: 'gate', item: it, side: side, option: option, value: after,
                x: self.projX(self.sideAnchorX(side), it._proj.s), y: it._proj.sy })
            }
          } else if (it.type === 'troopGate') {
            var troopSide = ratio <= C.gateSideRatio ? 'L' : (ratio >= 1 - C.gateSideRatio ? 'R' : null)
            if (troopSide) {
              player.unitType = troopSide === 'L' ? it.left : it.right
              it._done = true
              events.push({ type: 'troop', item: it, side: troopSide, unitType: player.unitType,
                x: self.projX(self.sideAnchorX(troopSide), it._proj.s), y: it._proj.sy })
            }
          } else {
            var eventSide = it.side === 'L' ? ratio <= C.pickupSideRatio : ratio >= 1 - C.pickupSideRatio
            if (eventSide) {
              var outcome = L.resolveEvent(it, player)
              it._done = true
              var ex = self.pickupAnchorX(it)
              events.push({ type: 'event', item: it, outcome: outcome, coins: outcome.coins,
                x: self.projX(ex, it._proj.s), y: it._proj.sy })
            }
          }
        }
        return
      }

      if (it._done || it._dead) return

      if ((it.type === 'wave' || it.type === 'general') && !it._dead && (self.mode !== 'defend' || it._defendActive)) {
        if (!it._engaged && d <= C.engageRange && d > -400) it._engaged = true
        if (it._engaged) {
          if (!it._melee) it._adv += C.enemyChargeSpeed * dt
          var pratio = self.playerRatio(player)
          it.centerRatio += (pratio - it.centerRatio) * Math.min(1, 3 * dt)
          if (d <= 0) it._melee = true

          var enemyRate = 1
          if (it.skill === 'rage' && it._hp <= it._maxHp * 0.5) enemyRate *= 1.5
          if (it.boss) enemyRate *= C.bossPhaseRate[it._phase - 1]
          var mods = {
            playerType: player.unitType, enemyType: it.unitType,
            damage: player.damageMultiplier || 1, fireRate: player.fireRateMultiplier || 1,
            incoming: player.incomingMultiplier || 1, enemyRate: enemyRate
          }
          var combat = L.battleStep(player, it._hp, dt, it._melee, player.attackLevel || 0, C, mods)
          it._hp = Math.max(0, it._hp - combat.damage)
          it._fxKills = combat.damage
          it._enemyDamage = combat.taken
          if (self.mode === 'escort' && it._melee) {
            self.escortHp = Math.max(0, self.escortHp - combat.taken * C.escortDamageFactor)
          }

          // Boss阈值按顺序各触发一次；已经被当帧击杀时不补放阶段技
          if (it.boss && it._hp > 0) {
            var targetPhase = it._hp <= it._maxHp * 0.33 ? 3 : (it._hp <= it._maxHp * 0.66 ? 2 : 1)
            while (it._phase < targetPhase && L.armyHp(player) > 0) {
              it._phase++
              it._skillFx = 0.8
              var phaseDamage = Math.max(1, L.armyHp(player) * C.bossPhaseSkillRatio)
              L.damageArmy(player, phaseDamage)
              events.push({ type: 'bossPhase', item: it, phase: it._phase, damage: phaseDamage,
                x: player.x, y: self.groundY - 100 })
            }
          }

          // 普通武将横扫：固定周期、固定伤害比例，切关后计时清零
          if (it.skill === 'sweep' && it._hp > 0 && L.armyHp(player) > 0) {
            it._skillClock += dt
            if (it._skillClock >= C.generalSkillInterval) {
              it._skillClock -= C.generalSkillInterval
              it._skillFx = 0.8
              var skillDamage = Math.max(1, L.armyHp(player) * C.generalSkillHpRatio)
              L.damageArmy(player, skillDamage)
              events.push({ type: 'enemySkill', item: it, damage: skillDamage,
                x: self.projX(self.enemyBounds(it).cx, it._proj.s), y: it._proj.sy })
            }
          }

          if (it._hp <= 0) {
            it._dead = true
            var eb = self.enemyBounds(it)
            if (it.type === 'wave') {
              events.push({ type: 'waveClear', item: it, coins: C.waveCoinReward,
                x: self.projX(eb.cx, it._proj.s), y: it._proj.sy })
            } else {
              events.push({ type: 'generalDown', item: it, coins: it.boss ? C.bossCoinReward : C.generalCoinReward,
                x: self.projX(eb.cx, it._proj.s), y: it._proj.sy })
              if (it.boss && !self.completed && !self.failed) {
                if (self.mode === 'escort' && self.escortHp <= 0) self.pushLose(events, 'escort')
                else { self.completed = true; events.push({ type: 'levelComplete', item: it }) }
              }
            }
          }
        }
      }

      if (it.type === 'castle' && d <= 0) { it._done = true; events.push({ type: 'castle', item: it }) }
    })

    if (!this.completed && !this.failed) {
      if (L.armyHp(player) <= 0) { player.count = 0; this.pushLose(events, 'army') }
      else if (this.mode === 'escort' && this.escortHp <= 0) this.pushLose(events, 'escort')
      else if (this.mode === 'timed' && this.timeLeft <= 0) this.pushLose(events, 'timeout')
    }
    return events
  }

  CR.Level = Level
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis))
