/**
 * 运行时实体：玩家人群、飘字、爆点粒子、近战碎骨/烟尘特效。
 * 只存状态与运动，不含具体绘制（绘制在 render.js）。
 */
(function (global) {
  var CR = (global.CR = global.CR || {})
  var C = CR.CONFIG
  var clamp = CR.Logic.clamp

  // 玩家人群：人数为整数，总生命独立计算；体质升级增加每兵生命
  function Player (w, h, startCount, upgrades) {
    upgrades = upgrades || {}
    this.w = w
    this.h = h
    this.attackLevel = upgrades.attackLevel || 0
    this.vitalityLevel = upgrades.vitalityLevel || 0
    this.equipment = (upgrades.equipment || []).slice()
    this.talents = (upgrades.talents || []).slice()
    this.unitType = 'shield'
    this.mods = CR.Logic.buildModifiers(upgrades)
    this.hpPerUnit = 1 + this.vitalityLevel * C.hpPerVitalityUpgrade + this.mods.hpBonus
    this.damageMultiplier = this.mods.damage
    this.fireRateMultiplier = this.mods.fireRate
    this.incomingMultiplier = this.mods.incoming
    this.recruitMultiplier = this.mods.recruit
    this.coinMultiplier = this.mods.coin
    this.count = startCount
    this.hp = startCount * this.hpPerUnit
    this.x = w / 2
    this.targetX = w / 2
    this.phase = 0          // 行走摆动相位
    this.pulse = 0          // 收编/变强时的鼓胀脉冲（0~1）
    this.trackLeft = w * C.trackMarginRatio
    this.trackRight = w * (1 - C.trackMarginRatio)
  }

  Player.prototype.addUnits = function (value) {
    this.count += value
    this.hp += value * this.hpPerUnit
  }

  Player.prototype.takeDamage = function (amount) {
    this.hp = Math.max(0, this.hp - amount)
    this.count = this.hp <= 0 ? 0 : Math.ceil(this.hp / this.hpPerUnit - 1e-9)
  }

  Player.prototype.resize = function (w, h) {
    var ratio = this.x / this.w
    this.w = w; this.h = h
    this.trackLeft = w * C.trackMarginRatio
    this.trackRight = w * (1 - C.trackMarginRatio)
    this.x = clamp(ratio * w, this.trackLeft, this.trackRight)
    this.targetX = this.x
  }

  Player.prototype.setTarget = function (x) {
    this.targetX = clamp(x, this.trackLeft + 6, this.trackRight - 6)
  }

  Player.prototype.update = function (dt) {
    var k = Math.min(1, dt * 14)
    this.x += (this.targetX - this.x) * k
    this.phase += dt * 10
    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - dt * 3.2)
  }

  Player.prototype.addPulse = function () { this.pulse = 1 }

  // 飘字与粒子特效集合
  function Fx () {
    this.floaters = []
    this.bursts = []
    this.bones = []   // 红兵被击杀的白色碎骨 + 灰烟
    this.rings = []   // 收编兵牌时的扩散光环
    this.bullets = [] // 我方射击的可见弹道子弹
  }

  // 发射一颗可见弹道的子弹：从 (x0,y0) 飞向 (x1,y1)，命中时在终点爆出 boneN 块碎骨
  Fx.prototype.addBullet = function (x0, y0, x1, y1, boneN) {
    if (this.bullets.length > 80) return
    var dist = Math.hypot(x1 - x0, y1 - y0)
    this.bullets.push({
      x0: x0, y0: y0, x1: x1, y1: y1,
      t: 0, dur: Math.max(0.06, dist / C.bulletSpeed), boneN: boneN || 2
    })
  }

  Fx.prototype.addFloat = function (text, x, y, color, big, duration) {
    var life = duration || 0.9
    this.floaters.push({
      text: text, x: x, y: y,
      vy: -58, life: life, maxLife: life,
      color: color || C.color.gold, big: !!big
    })
  }

  Fx.prototype.addBurst = function (x, y, color, n) {
    var parts = []
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2
      var sp = 60 + Math.random() * 150
      parts.push({
        dx: 0, dy: 0,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 40,
        r: 2 + Math.random() * 3
      })
    }
    this.bursts.push({ x: x, y: y, color: color, life: 0.7, maxLife: 0.7, parts: parts })
  }

  // 收编光环：蓝色/金色圆环向外扩散并淡出
  Fx.prototype.addRing = function (x, y, color) {
    this.rings.push({ x: x, y: y, r: 6, life: 0.5, maxLife: 0.5, color: color })
  }

  // 近战击杀的碎骨（白色小块带旋转）+ 灰烟（膨胀变淡）
  Fx.prototype.addBones = function (x, y, n) {
    var bones = []
    for (var i = 0; i < n; i++) {
      var ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6
      var sp = 70 + Math.random() * 160
      bones.push({
        dx: 0, dy: 0, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        size: 3.5 + Math.random() * 4.5, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 12
      })
    }
    var smokes = []
    for (var s = 0; s < Math.max(1, Math.round(n / 3)); s++) {
      smokes.push({ dx: (Math.random() - 0.5) * 18, dy: (Math.random() - 0.5) * 12, r: 5 + Math.random() * 6 })
    }
    this.bones.push({ x: x, y: y, life: 0.65, maxLife: 0.65, bones: bones, smokes: smokes })
  }

  Fx.prototype.update = function (dt) {
    var i, j
    // 子弹飞行，命中终点爆出碎骨
    for (i = this.bullets.length - 1; i >= 0; i--) {
      var bl = this.bullets[i]
      bl.t += dt
      if (bl.t >= bl.dur) {
        this.addBones(bl.x1, bl.y1, bl.boneN)
        this.bullets.splice(i, 1)
      }
    }
    for (i = this.floaters.length - 1; i >= 0; i--) {
      var f = this.floaters[i]
      f.life -= dt
      f.y += f.vy * dt
      f.vy *= 0.96
      if (f.life <= 0) this.floaters.splice(i, 1)
    }
    for (i = this.bursts.length - 1; i >= 0; i--) {
      var b = this.bursts[i]
      b.life -= dt
      for (j = 0; j < b.parts.length; j++) {
        var p = b.parts[j]
        p.dx += p.vx * dt
        p.dy += p.vy * dt
        p.vy += 320 * dt
      }
      if (b.life <= 0) this.bursts.splice(i, 1)
    }
    for (i = this.rings.length - 1; i >= 0; i--) {
      var rg = this.rings[i]
      rg.life -= dt
      rg.r += 240 * dt
      if (rg.life <= 0) this.rings.splice(i, 1)
    }
    for (i = this.bones.length - 1; i >= 0; i--) {
      var bn = this.bones[i]
      bn.life -= dt
      for (j = 0; j < bn.bones.length; j++) {
        var q = bn.bones[j]
        q.dx += q.vx * dt
        q.dy += q.vy * dt
        q.vy += 420 * dt
        q.rot += q.vr * dt
      }
      for (j = 0; j < bn.smokes.length; j++) bn.smokes[j].r += 26 * dt
      if (bn.life <= 0) this.bones.splice(i, 1)
    }
  }

  Fx.prototype.clear = function () {
    this.floaters.length = 0
    this.bursts.length = 0
    this.bones.length = 0
    this.rings.length = 0
    this.bullets.length = 0
  }

  CR.Entities = { Player: Player, Fx: Fx }
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis))
