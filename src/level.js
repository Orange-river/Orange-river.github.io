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

  Level.prototype.load = function (levelIndex, upgrades) {
    this.levelIndex = levelIndex
    this.data = L.generateLevel(levelIndex, upgrades)
    this.mode = this.data.mode || 'standard'
    this.traveled = 0
    this.completed = false
    this.failed = false
    this.timeLeft = this.data.timeLimit || C.modeTimeLimit
    this.escortHp = C.escortMaxHp
    this.defendPrepZ = 3600
    this.defendReady = false
    this.fence = null
    this.squeeze = 0
    this.speed = Math.min(C.maxSpeed, C.baseSpeed + levelIndex * C.speedGrowthPerLevel)
    for (var i = 0; i < this.data.items.length; i++) {
      var it = this.data.items[i]
      it._done = false; it._dead = false; it._proj = null; it._engaged = false
      it._fxKills = 0; it._adv = 0; it._melee = false; it._skillClock = 0; it._skillFx = 0
      it._phase = 1; it._defendActive = false
      it._fenceSide = null; it._chosen = null; it._missed = false; it._fly = null
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
    // 门牌内侧贴近中线栅栏，外侧让出兵牌的位置
    return side === 'L' ? tl + tw * 0.315 : tl + tw * 0.685
  }

  // 中线栅栏两侧的可活动范围（逻辑纵深上的半宽按屏宽计）
  Level.prototype.fenceLimits = function (side) {
    var half = this.w * C.fenceHalfRatio
    return side === 'L'
      ? { min: this.trackLeft(), max: this.w / 2 - half }
      : { min: this.w / 2 + half, max: this.trackLeft() + this.trackWidth() }
  }

  // 人群前后排的纵深：栅栏到达前排时开始定边
  Level.prototype.crowdDepth = function (count) {
    var drawN = Math.min(Math.max(0, count), C.maxDrawnUnits)
    var cols = Math.round(L.clamp(Math.sqrt(drawN) * 1.2, 4, 12))
    var rows = Math.ceil(drawN / cols)
    return Math.max(0, rows - 1) * this.w * C.formationDepthGapRatio
  }

  // 当前贴着人群的栅栏（没有则返回 null）
  Level.prototype.activeFence = function (player) {
    if (!this.data) return null
    var front = this.traveled + this.crowdDepth(player.count)
    for (var i = 0; i < this.data.items.length; i++) {
      var it = this.data.items[i]
      if (!L.isFenced(it)) continue
      if (L.fenceStart(it) <= front && L.fenceEnd(it) >= this.traveled) return it
    }
    return null
  }

  // 栅栏贴身期间人群的横向边界（带缓动，避免阵型突然收窄）；无栅栏时为 null
  Level.prototype.crowdBounds = function (player) {
    var f = this.activeFence(player)
    if (!f || !f._fenceSide) return null
    var lim = this.fenceLimits(f._fenceSide)
    var tl = this.trackLeft(), tr = tl + this.trackWidth()
    var k = this.squeeze
    return { minX: tl + (lim.min - tl) * k, maxX: tr + (lim.max - tr) * k }
  }

  // 栅栏按纵深切成小段，供渲染层远近排序
  Level.prototype.fenceSegments = function () {
    var out = []
    if (!this.data) return out
    for (var i = 0; i < this.data.items.length; i++) {
      var it = this.data.items[i]
      if (!L.isFenced(it)) continue
      var start = L.fenceStart(it), end = L.fenceEnd(it)
      if (end - this.traveled < -20 || start - this.traveled > C.viewFar) continue
      for (var za = start; za < end; za += C.fenceStep) {
        var zb = Math.min(end, za + C.fenceStep)
        if (zb - this.traveled < -10) continue
        out.push({ item: it, za: za, zb: zb, dz: zb - this.traveled })
      }
    }
    return out
  }

  Level.prototype.visibleItems = function () {
    var out = []
    if (!this.data) return out
    for (var i = 0; i < this.data.items.length; i++) {
      var it = this.data.items[i]
      if ((it.type === 'wave' || it.type === 'general') && it._dead) continue
      var pr = it._proj || this.project(it.z)
      if (L.isFenced(it)) {
        // 门通过后仍画到人群身后，用于显示选边结果
        if (pr.dz < -70) continue
      } else if (it.type === 'pickup' || it.type === 'event') {
        if (it._done && it._fly == null) continue
      }
      if (pr.dz > -90 && pr.dz < C.viewFar) out.push(it)
    }
    out.sort(function (a, b) { return (b._proj ? b._proj.dz : b.z) - (a._proj ? a._proj.dz : a.z) })
    return out
  }

  Level.prototype.enemyBounds = function (item) {
    var tl = this.trackLeft(), tw = this.trackWidth()
    var cx = tl + item.centerRatio * tw, hw = item.widthRatio * tw / 2
    return { cx: cx, hw: hw, left: cx - hw, right: cx + hw }
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
        // 停下后前方的牌与门永远够不到，直接作废，避免一直堆在远处
        for (var di = 0; di < this.data.items.length; di++) {
          var dit = this.data.items[di]
          if ((dit.type === 'pickup' || dit.type === 'event' || L.isFenced(dit)) && dit.z > this.defendPrepZ + 60) dit._done = true
        }
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

    // 中线栅栏：到达人群前排时定边；已偏向一侧就锁死该侧，不能再横穿。
    // 居中进入不定边（居中不自动选门），之后向任一侧明确移动才锁定。
    this.fence = this.activeFence(player)
    if (this.fence && !this.fence._fenceSide) {
      if (ratio <= C.gateSideRatio) this.fence._fenceSide = 'L'
      else if (ratio >= 1 - C.gateSideRatio) this.fence._fenceSide = 'R'
    }
    if (this.fence && this.fence._fenceSide) {
      var flim = this.fenceLimits(this.fence._fenceSide)
      player.x = L.clamp(player.x, flim.min, flim.max)
      player.targetX = L.clamp(player.targetX, flim.min, flim.max)
    }
    this.squeeze += ((this.fence && this.fence._fenceSide ? 1 : 0) - this.squeeze) * Math.min(1, dt * 10)
    if (this.squeeze < 0.001) this.squeeze = 0

    this.data.items.forEach(function (it) {
      it._proj = self.project(it.z - (it._adv || 0))
      var d = it._proj.dz
      if (it._fly != null) {
        it._fly += dt / C.pickupFlyTime
        if (it._fly >= 1) it._fly = null
      }
      if (it.type === 'wave' || it.type === 'general') {
        it._fxKills = 0
        it._skillFx = Math.max(0, (it._skillFx || 0) - dt)
      }

      // 所有牌、门和事件都必须由玩家手动贴边选择，错过不自动补发
      if (it.type === 'pickup' || it.type === 'gate' || it.type === 'troopGate' || it.type === 'event') {
        if (it._done) return
        if (d < -60) {
          it._done = true
          if (L.isFenced(it) && !it._chosen) {
            it._missed = true
            events.push({ type: 'gateMiss', item: it,
              x: self.w / 2, y: self.groundY - self.w * 0.42 })
          }
          return
        }
        if (d <= C.pickupCollectDz) {
          if (it.type === 'pickup') {
            var onSide = it.side === 'L' ? ratio <= C.pickupSideRatio : ratio >= 1 - C.pickupSideRatio
            if (onSide) {
              var value = Math.max(1, Math.round(it.value * (player.recruitMultiplier || 1)))
              L.addArmyUnits(player, value)
              it._done = true
              it._fly = 0
              var ax = self.pickupAnchorX(it)
              events.push({ type: 'pickup', item: it, value: value, x: self.projX(ax, it._proj.s), y: it._proj.sy })
            }
          } else if (it.type === 'gate') {
            // 栅栏已锁边时按锁定边生效，否则仍按贴边程度判断
            var side = (self.fence === it && it._fenceSide) ? it._fenceSide
              : (ratio <= C.gateSideRatio ? 'L' : (ratio >= 1 - C.gateSideRatio ? 'R' : null))
            if (side) {
              var option = side === 'L' ? it.left : it.right
              var after = L.applyArmyGate(player, option)
              it._done = true
              it._chosen = side
              events.push({ type: 'gate', item: it, side: side, option: option, value: after,
                x: self.projX(self.sideAnchorX(side), it._proj.s), y: it._proj.sy })
            }
          } else if (it.type === 'troopGate') {
            var troopSide = (self.fence === it && it._fenceSide) ? it._fenceSide
              : (ratio <= C.gateSideRatio ? 'L' : (ratio >= 1 - C.gateSideRatio ? 'R' : null))
            if (troopSide) {
              player.unitType = troopSide === 'L' ? it.left : it.right
              it._done = true
              it._chosen = troopSide
              events.push({ type: 'troop', item: it, side: troopSide, unitType: player.unitType,
                x: self.projX(self.sideAnchorX(troopSide), it._proj.s), y: it._proj.sy })
            }
          } else {
            var eventSide = it.side === 'L' ? ratio <= C.pickupSideRatio : ratio >= 1 - C.pickupSideRatio
            if (eventSide) {
              var outcome = L.resolveEvent(it, player)
              it._done = true
              it._fly = 0
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
