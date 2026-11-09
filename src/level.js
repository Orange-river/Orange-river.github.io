/**
 * 运行时关卡：推进镜头、兵牌收编、红兵潮/武将持续群殴、胜负判定。
 * 世界坐标 z 沿跑道向远处增大；透视投影把 z 映射到屏幕（近大远小）形成 2.5D。
 * 战斗数值与 logic.js 的可解性仿真共用 battleStep，保证实战与仿真同源。
 */
(function (global) {
  var CR = (global.CR = global.CR || {})
  var C = CR.CONFIG
  var L = CR.Logic

  function Level (w, h) {
    this.data = null
    this.levelIndex = 0
    this.traveled = 0
    this.completed = false
    this.speed = C.baseSpeed
    this.setMetrics(w, h)
  }

  Level.prototype.setMetrics = function (w, h) {
    this.w = w
    this.h = h
    this.horizonY = h * C.horizonRatio
    this.groundY = h * C.playerLineRatio
    this.playerLineY = this.groundY
  }

  Level.prototype.resize = function (w, h) { this.setMetrics(w, h) }

  Level.prototype.load = function (levelIndex) {
    this.levelIndex = levelIndex
    this.data = L.generateLevel(levelIndex)
    this.traveled = 0
    this.completed = false
    this.speed = Math.min(C.maxSpeed, C.baseSpeed + levelIndex * C.speedGrowthPerLevel)
    for (var i = 0; i < this.data.items.length; i++) {
      var it = this.data.items[i]
      it._done = false
      it._dead = false
      it._proj = null
      it._engaged = false
      it._fxKills = 0
      it._adv = 0
      it._melee = false
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
    return { dz: dz, s: s, sy: this.horizonY + (this.groundY - horizonY) * s }
  }

  Level.prototype.projX = function (x, s) { return this.w / 2 + (x - this.w / 2) * s }

  // 队伍中心在跑道中的横向比例（0 最左、1 最右），用于判定贴到哪一侧吃牌
  Level.prototype.playerRatio = function (player) {
    return (player.x - this.trackLeft()) / this.trackWidth()
  }

  // 兵牌在 s=1 参考系下的横向中心：左右各贴近跑道边缘
  Level.prototype.pickupAnchorX = function (item) {
    var tl = this.trackLeft()
    var tw = this.trackWidth()
    return item.side === 'L' ? tl + tw * 0.11 : tl + tw * 0.89
  }

  Level.prototype.enemyBounds = function (item) {
    var tl = this.trackLeft()
    var tw = this.trackWidth()
    var cx = tl + item.centerRatio * tw
    var hw = item.widthRatio * tw / 2
    return { cx: cx, hw: hw, left: cx - hw, right: cx + hw }
  }

  Level.prototype.visibleItems = function () {
    var out = []
    if (!this.data) return out
    for (var i = 0; i < this.data.items.length; i++) {
      var it = this.data.items[i]
      if ((it.type === 'wave' || it.type === 'general') && it._dead) continue
      if (it.type === 'pickup' && it._done) continue
      var pr = it._proj || this.project(it.z)
      if (pr.dz > -90 && pr.dz < C.viewFar) out.push(it)
    }
    out.sort(function (a, b) {
      return (b._proj ? b._proj.dz : b.z) - (a._proj ? a._proj.dz : a.z)
    })
    return out
  }

  // 当前仍存活的敌实体（武将/兵潮），供渲染与主控查询
  Level.prototype.liveEnemies = function () {
    if (!this.data) return []
    return this.data.items.filter(function (it) {
      return (it.type === 'wave' || it.type === 'general') && !it._dead
    })
  }

  /**
   * 推进一帧
   * @returns {Array} 本帧事件（收编/兵潮清空/武将击破/失败/通关）
   */
  Level.prototype.update = function (dt, player) {
    var events = []
    // 有敌人进入交战纵深即驻足群殴（远程射击+敌冲锋+独立近战伤害），打光再继续前进
    var fighting = false
    for (var fi = 0; fi < this.data.items.length; fi++) {
      var fe = this.data.items[fi]
      if ((fe.type === 'wave' || fe.type === 'general') && !fe._dead) {
        var fd = (fe.z - (fe._adv || 0)) - this.traveled
        if (fd <= C.engageRange && fd > -400) { fighting = true; break }
      }
    }
    if (!fighting) this.traveled += this.speed * dt
    var self = this
    var ratio = this.playerRatio(player)

    this.data.items.forEach(function (it) {
      it._proj = self.project(it.z - (it._adv || 0))
      var d = it._proj.dz
      if (it.type === 'wave' || it.type === 'general') it._fxKills = 0

      // 兵牌收编：进入收集窗口且队伍贴到对应侧边；若已越过则标记错过
      if (it.type === 'pickup') {
        if (it._done) return
        if (d < -60) { it._done = true; return }
        if (d <= C.pickupCollectDz) {
          var onSide = it.side === 'L' ? ratio <= C.pickupSideRatio : ratio >= (1 - C.pickupSideRatio)
          if (onSide) {
            L.addArmyUnits(player, it.value)
            it._done = true
            var ax = self.pickupAnchorX(it)
            events.push({ type: 'pickup', item: it, value: it.value, x: self.projX(ax, it._proj.s), y: it._proj.sy })
          }
        }
        return
      }

      if (it._done || it._dead) return

      // 持续群殴：我方远程射击与敌方近战伤害独立计算
      if ((it.type === 'wave' || it.type === 'general') && !it._dead) {
        if (!it._engaged && d <= C.engageRange && d > -400) it._engaged = true
        if (it._engaged) {
          // 敌兵向阵线冲锋并横向拐弯逼近我方，躲不开
          if (!it._melee) it._adv += C.enemyChargeSpeed * dt
          var pratio = self.playerRatio(player)
          it.centerRatio += (pratio - it.centerRatio) * Math.min(1, 3 * dt)
          if (d <= 0) it._melee = true
          var combat = L.battleStep(player, it._hp, dt, it._melee, player.attackLevel || 0)
          it._hp = Math.max(0, it._hp - combat.damage)
          it._fxKills = combat.damage
          it._enemyDamage = combat.taken
          if (it._hp <= 0) {
            it._dead = true
            var eb = self.enemyBounds(it)
            if (it.type === 'wave') {
              events.push({ type: 'waveClear', item: it, x: self.projX(eb.cx, it._proj.s), y: it._proj.sy })
            } else {
              events.push({ type: 'generalDown', item: it, x: self.projX(eb.cx, it._proj.s), y: it._proj.sy })
              // 最终 Boss 死亡就是本关终点，不再要求玩家空走到城堡
              if (it.boss && !self.completed) {
                self.completed = true
                events.push({ type: 'levelComplete', item: it })
              }
            }
          }
        }
      }

      if (it.type === 'castle' && d <= 0) {
        it._done = true
        events.push({ type: 'castle', item: it })
      }
    })

    if (L.armyHp(player) <= 0 && !this.completed) { player.count = 0; events.push({ type: 'lose' }) }
    return events
  }

  CR.Level = Level
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis))
