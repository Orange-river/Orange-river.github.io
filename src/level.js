(function (global) {
  var CR = (global.CR = global.CR || {})
  var C = CR.CONFIG

  function Level (w, h) {
    this.w = w
    this.h = h
    this.horizonY = h * C.horizonRatio
    this.groundY = h * C.playerLineRatio
    this.data = null
    this.traveled = 0
    this.speed = C.baseSpeed
    this.levelIndex = 0
    this.elapsed = 0
    this.completed = false
    this.failed = false
  }

  Level.prototype.load = function (idx) {
    this.data = CR.Logic.generateLevel(idx)
    this.levelIndex = idx
    this.traveled = 0
    this.speed = Math.min(C.maxSpeed, C.baseSpeed + idx * C.speedGrowthPerLevel)
    this.elapsed = 0
    this.completed = false
    this.failed = false
    return this.data
  }

  Level.prototype.resize = function (w, h) {
    this.w = w
    this.h = h
    this.horizonY = h * C.horizonRatio
    this.groundY = h * C.playerLineRatio
  }

  // dz=0 在脚底；dz 越大越远越小，形成纵深
  Level.prototype.projScale = function (dz) {
    var d = Math.max(0, Math.min(C.viewFar, dz))
    return C.perspectiveK / (C.perspectiveK + d * 0.55)
  }

  Level.prototype.projX = function (xNorm, s) {
    return this.w / 2 + (xNorm - 0.5) * this.w * s
  }

  Level.prototype.projY = function (dz) {
    var d = Math.max(0, Math.min(C.viewFar, dz))
    var t = Math.pow(d / C.viewFar, 0.72)
    return this.groundY - t * (this.groundY - this.horizonY)
  }

  Level.prototype.liveEnemies = function () {
    if (!this.data) return []
    var out = []
    for (var i = 0; i < this.data.objects.length; i++) {
      var o = this.data.objects[i]
      if ((o.type === 'wave' || o.type === 'general') && !o._dead) out.push(o)
    }
    return out
  }

  Level.prototype.playerNorm = function (player) {
    return player.x / this.w
  }

  Level.prototype.enemyBounds = function (o) {
    var width = o.type === 'general' ? 0.2 : C.waveColsRatio
    return { left: 0.5 - width / 2, right: 0.5 + width / 2, cx: 0.5 }
  }

  Level.prototype.horizontalContact = function (o, pn) {
    var b = this.enemyBounds(o)
    return pn >= b.left - 0.1 && pn <= b.right + 0.1
  }

  Level.prototype.applyPickup = function (player, p) {
    var n = Math.max(1, Math.round(p.value * (player.recruitMultiplier || 1)))
    player.addUnits(n)
    player.addPulse()
    return n
  }

  Level.prototype.update = function (dt, player) {
    var events = []
    if (!this.data || this.completed || this.failed) return events
    this.elapsed += dt
    if (this.data.mode === 'timed' && this.elapsed >= C.timedSeconds) {
      this.failed = true
      events.push({ type: 'lose', reason: 'timeout' })
      return events
    }
    // 进入交战射程即驻足群殴，打死当前目标才继续前进
    var engaged = null
    var engagedDz = Infinity
    var live = this.liveEnemies()
    var pn = this.playerNorm(player)
    for (var i = 0; i < live.length; i++) {
      var o = live[i]
      var dz = o.z - this.traveled
      if (this.data.mode === 'defend' && !o._defendActive) continue
      if (dz <= C.engageRange && dz > -C.contactRange && this.horizontalContact(o, pn) && dz < engagedDz) {
        engaged = o
        engagedDz = dz
      }
    }
    var defendingReady = this.data.mode === 'defend' && this.traveled >= C.defendPrepZ
    if (!engaged && !defendingReady) this.traveled = Math.min(this.data.length + 400, this.traveled + this.speed * dt)

    // 玩家横向贴到左/右通道才收兵；中路不会自动全吃
    for (var j = 0; j < this.data.pickups.length; j++) {
      var p = this.data.pickups[j]
      if (p._taken) continue
      var pdz = p.z - this.traveled
      if (pdz < -C.pickupCollectDz) {
        p._taken = true
        continue
      }
      if (Math.abs(pdz) <= C.pickupCollectDz) {
        var px = p.side === 'L' ? 0.12 : 0.88
        if (Math.abs(pn - px) < C.pickupSideRatio) {
          p._taken = true
          var gained = this.applyPickup(player, p)
          var s = this.projScale(pdz)
          events.push({
            type: 'pickup', value: gained,
            x: this.projX(px, s), y: this.projY(pdz),
            item: p
          })
        }
      }
    }

    // 所有门与事件均须明确贴边；居中不会自动生效
    for (var g = 0; g < this.data.objects.length; g++) {
      var gate = this.data.objects[g]
      if ((gate.type !== 'armyGate' && gate.type !== 'unitGate' && gate.type !== 'event') || gate._done) continue
      var gdz = gate.z - this.traveled
      if (gdz < -C.pickupCollectDz) { gate._done = true; continue }
      if (Math.abs(gdz) > C.pickupCollectDz) continue
      var side = pn < 0.38 ? 'left' : (pn > 0.62 ? 'right' : '')
      if (!side) continue
      gate._done = true
      var gs = this.projScale(gdz)
      var gx = this.projX(side === 'left' ? 0.25 : 0.75, gs)
      var gy = this.projY(gdz)
      if (gate.type === 'armyGate') {
        var applied = CR.Logic.applyArmyGate(player.count, player.hp, player.maxHpPerUnit, gate[side])
        player.hp = applied.hp
        player.syncCount()
        player.rebuildFormation()
        events.push({ type: 'armyGate', x: gx, y: gy, text: gate[side].label, delta: applied.delta })
      } else if (gate.type === 'unitGate') {
        player.unitType = gate[side]
        events.push({ type: 'unitGate', x: gx, y: gy, unitType: player.unitType })
      } else {
        var ev = gate.event
        if (ev.units) {
          if (ev.units > 0) player.addUnits(Math.max(1, Math.round(ev.units * player.recruitMultiplier)))
          else {
            player.hp = Math.max(0, player.hp + ev.units * player.maxHpPerUnit)
            player.syncCount()
            player.rebuildFormation()
          }
        }
        events.push({ type: 'randomEvent', x: gx, y: gy, event: ev, coins: ev.coins || 0 })
      }
    }

    // 逐敌结算：远程先打，敌人冲锋拐弯贴脸后近战；武将按更大接敌面折算
    for (var k = 0; k < live.length; k++) {
      var e = live[k]
      var edz = e.z - this.traveled
      if (this.data.mode === 'defend' && !e._defendActive) continue
      if (edz <= C.engageRange && edz > -C.contactRange && this.horizontalContact(e, pn)) {
        e._engaged = true
        e._proj = { s: this.projScale(edz), sy: this.projY(edz) }
        // 前段：敌人冲锋，我方远程无损射击
        var charge = edz > C.contactRange
        if (charge) e.z = Math.max(this.traveled + C.contactRange, e.z - C.enemyChargeSpeed * dt)
        var st = {
          playerHp: player.hp,
          playerMaxHpPerUnit: player.maxHpPerUnit,
          playerDamage: player.damage,
          enemyHp: e.hp,
          enemyMaxHp: e.maxHp,
          enemyUnits: e.size,
          playerDamageDone: 0,
          enemyDamageDone: 0
        }
        var phaseRate = e.boss ? C.bossPhaseRate[Math.max(0, (e._phase || 1) - 1)] : 1
        CR.Logic.battleStep(st, dt, {
          meleeCap: charge ? 0 : (e.type === 'general' ? 34 : 18),
          unitType: player.unitType,
          enemyType: e.unitType,
          damageMultiplier: player.damageMultiplier * player.fireRateMultiplier,
          incomingMultiplier: player.incomingMultiplier,
          enemyMeleeRateMultiplier: phaseRate
        })
        player.hp = st.playerHp
        player.syncCount()
        e.hp = st.enemyHp
        e._liveCount = st.enemyCount
        e._fxKills = Math.max(0, Math.round(st.playerDamageDone))
        if (e.type === 'general') {
          e._skillClock = (e._skillClock || 0) + dt
          if (e._skillClock >= C.generalSkillPeriod && e.hp > 0) {
            e._skillClock -= C.generalSkillPeriod
            player.hp = Math.max(0, player.hp - Math.max(1, player.hp * C.generalSkillRatio))
            player.syncCount()
            events.push({ type: 'generalSkill', x: this.w / 2, y: this.projY(edz), name: '横扫', target: e })
          }
        }
        if (e.boss && e.hp > 0) {
          var ratio = e.hp / e.maxHp
          var nextPhase = ratio <= 0.33 ? 3 : (ratio <= 0.66 ? 2 : 1)
          while ((e._phase || 1) < nextPhase && e.hp > 0) {
            e._phase = (e._phase || 1) + 1
            player.hp = Math.max(0, player.hp - Math.max(1, player.hp * C.bossPhaseSkillRatio))
            player.syncCount()
            events.push({ type: 'bossPhase', x: this.w / 2, y: this.projY(edz), phase: e._phase, target: e })
          }
        }
        if (this.data.mode === 'escort') {
          this.data.escortHp = Math.max(0, (this.data.escortHp == null ? C.escortHp : this.data.escortHp) - st.enemyDamageDone * C.escortDamageScale)
        }
        if (e.hp <= 0) {
          e._dead = true
          e._engaged = false
          events.push({
            type: e.type === 'general' ? 'generalDown' : 'waveClear',
            x: this.projX(0.5, e._proj.s),
            y: e._proj.sy,
            boss: !!e.boss,
            coins: e.boss ? C.bossCoin : (e.type === 'general' ? C.generalCoin : C.waveCoin),
            target: e
          })
          if (e.boss) {
            if (this.data.mode === 'escort' && this.data.escortHp <= 0) {
              this.failed = true
              events.push({ type: 'lose', reason: 'escort' })
            } else {
              this.completed = true
              events.push({ type: 'levelComplete', boss: true })
            }
            break
          }
        }
      } else {
        e._engaged = false
        e._fxKills = 0
      }
    }

    if (this.data.mode === 'defend' && this.traveled >= C.defendPrepZ) {
      var combats = this.data.objects.filter(function (o) { return o.type === 'wave' || o.type === 'general' })
      var activeFound = false
      for (var d = 0; d < combats.length; d++) {
        if (!combats[d]._dead && !activeFound) {
          if (!combats[d]._defendActive) {
            combats[d]._defendActive = true
            combats[d].z = this.traveled + C.engageRange - 20
            events.push({ type: 'defendWave', index: d + 1 })
          }
          activeFound = true
        }
      }
    }

    // 最终Boss死亡当帧立即通关；上面已发事件，这里不再要求走到城堡
    if (!this.completed && !this.failed) {
      if (this.data.mode === 'escort' && (this.data.escortHp == null ? C.escortHp : this.data.escortHp) <= 0) {
        this.failed = true
        events.push({ type: 'lose', reason: 'escort' })
      } else if (player.hp <= 0 || player.count <= 0) {
        this.failed = true
        events.push({ type: 'lose' })
      }
    }
    return events
  }

  CR.Level = Level
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis))
