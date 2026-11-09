(function (global) {
  var CR = (global.CR = global.CR || {})
  var C = CR.CONFIG

  function Player (w, h, count, progression) {
    this.w = w
    this.h = h
    this.progression = progression || {}
    this.maxHpPerUnit = 1 + (this.progression.vitalityLevel || 0) * C.hpPerVitalityUpgrade
    this.maxHp = count * this.maxHpPerUnit
    this.hp = this.maxHp
    this.damage = 1 + (this.progression.attackLevel || 0) * C.attackDamagePerUpgrade
    this.equipment = this.progression.equipment || []
    this.talents = this.progression.talents || []
    this.unitType = this.progression.unitType || 'shield'
    this.mods = CR.Logic.buildModifiers(this.equipment, this.talents)
    this.damageMultiplier = this.mods.damage
    this.fireRateMultiplier = this.mods.fireRate
    this.incomingMultiplier = this.mods.incoming
    this.recruitMultiplier = this.mods.recruit
    this.coinMultiplier = this.mods.coins
    this.maxHpPerUnit += this.mods.hpPerUnit
    this.maxHp = count * this.maxHpPerUnit
    this.hp = this.maxHp
    this.count = count
    this.formation = CR.Logic.formation(count, w, h)
    this.syncCount()
    this.x = w / 2
    this.targetX = this.x
    this.radius = w * C.unitRadiusRatio
    this.recoil = 0
    this.pulse = 0
  }

  Player.prototype.setTarget = function (x) {
    this.targetX = Math.max(this.w * C.playerMinRatio, Math.min(this.w * C.playerMaxRatio, x))
  }

  Player.prototype.syncCount = function () {
    this.count = CR.Logic.hpToCount(this.hp, this.maxHpPerUnit)
    return this.count
  }

  Player.prototype.rebuildFormation = function () {
    this.formation = CR.Logic.formation(this.count, this.w, this.h)
  }

  Player.prototype.rebuildProgression = function () {
    var oldMax = this.maxHp
    var oldRatio = oldMax > 0 ? this.hp / oldMax : 0
    this.mods = CR.Logic.buildModifiers(this.equipment, this.talents)
    this.damageMultiplier = this.mods.damage
    this.fireRateMultiplier = this.mods.fireRate
    this.incomingMultiplier = this.mods.incoming
    this.recruitMultiplier = this.mods.recruit
    this.coinMultiplier = this.mods.coins
    this.maxHpPerUnit = 1 + (this.progression.vitalityLevel || 0) * C.hpPerVitalityUpgrade + this.mods.hpPerUnit
    this.maxHp = this.count * this.maxHpPerUnit
    this.hp = Math.max(0, this.maxHp * oldRatio)
    this.syncCount()
    this.rebuildFormation()
  }

  Player.prototype.addUnits = function (n) {
    // 新兵也拥有当前体质生命，不能只加数字不加生命
    this.hp += n * this.maxHpPerUnit
    this.syncCount()
    this.rebuildFormation()
  }

  Player.prototype.addPulse = function () {
    this.pulse = 1
  }

  Player.prototype.update = function (dt) {
    var dx = this.targetX - this.x
    this.x += dx * Math.min(1, dt * C.playerSpeedRatio)
    this.recoil = Math.max(0, this.recoil - dt * 5)
    this.pulse = Math.max(0, this.pulse - dt * 2.5)
  }

  Player.prototype.resize = function (w, h) {
    var ratio = this.x / this.w
    this.w = w
    this.h = h
    this.x = ratio * w
    this.targetX = this.x
    this.radius = w * C.unitRadiusRatio
    this.rebuildFormation()
  }

  function Bullet (sx, sy, tx, ty, onHit) {
    this.x = sx
    this.y = sy
    this.sx = sx
    this.sy = sy
    this.tx = tx
    this.ty = ty
    var dx = tx - sx
    var dy = ty - sy
    var dist = Math.max(1, Math.sqrt(dx * dx + dy * dy))
    this.life = dist / C.bulletSpeed
    this.age = 0
    this.onHit = onHit
    this.dead = false
  }

  Bullet.prototype.update = function (dt) {
    this.age += dt
    var t = Math.min(1, this.age / this.life)
    this.x = this.sx + (this.tx - this.sx) * t
    this.y = this.sy + (this.ty - this.sy) * t
    if (t >= 1 && !this.dead) {
      this.dead = true
      if (this.onHit) this.onHit()
    }
  }

  function Fx () {
    this.floats = []
    this.rings = []
    this.bullets = []
    this.bursts = []
    this.shake = 0
  }

  Fx.prototype.addFloat = function (text, x, y, color, big) {
    this.floats.push({ text: text, x: x, y: y, color: color || '#fff', age: 0, life: 0.95, big: !!big })
  }

  Fx.prototype.addRing = function (x, y, color) {
    this.rings.push({ x: x, y: y, color: color, age: 0, life: 0.5 })
  }

  Fx.prototype.addBullet = function (sx, sy, tx, ty, boneN) {
    var self = this
    this.bullets.push(new Bullet(sx, sy, tx, ty, function () {
      self.addBurst(tx, ty, C.color.bone, boneN)
    }))
  }

  Fx.prototype.addBurst = function (x, y, color, n) {
    // 碎骨 + 灰烟：有初速度、重力、旋转和衰减
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2
      var sp = 50 + Math.random() * 190
      this.bursts.push({
        x: x, y: y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 90,
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 12,
        color: color,
        smoke: i % 4 === 0,
        size: 2 + Math.random() * 5,
        age: 0,
        life: 0.45 + Math.random() * 0.5
      })
    }
    this.shake = Math.min(10, this.shake + n * C.cameraShakePerKill)
  }

  Fx.prototype.update = function (dt) {
    var i
    for (i = this.floats.length - 1; i >= 0; i--) {
      var f = this.floats[i]
      f.age += dt
      f.y -= dt * 55
      if (f.age > f.life) this.floats.splice(i, 1)
    }
    for (i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].age += dt
      if (this.rings[i].age > this.rings[i].life) this.rings.splice(i, 1)
    }
    for (i = this.bullets.length - 1; i >= 0; i--) {
      this.bullets[i].update(dt)
      if (this.bullets[i].dead) this.bullets.splice(i, 1)
    }
    for (i = this.bursts.length - 1; i >= 0; i--) {
      var b = this.bursts[i]
      b.age += dt
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.vy += 420 * dt
      b.vx *= Math.pow(0.15, dt)
      b.rot += b.vr * dt
      if (b.age > b.life) this.bursts.splice(i, 1)
    }
    this.shake = Math.max(0, this.shake - dt * 18)
  }

  Fx.prototype.clear = function () {
    this.floats.length = 0
    this.rings.length = 0
    this.bullets.length = 0
    this.bursts.length = 0
    this.shake = 0
  }

  CR.Entities = { Player: Player, Bullet: Bullet, Fx: Fx }
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis))
