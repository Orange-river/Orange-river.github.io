(function (global) {
  var CR = (global.CR = global.CR || {})
  var C = CR.CONFIG
  var COL = C.color

  function Renderer (ctx, w, h) {
    this.ctx = ctx
    this.w = w
    this.h = h
  }

  Renderer.prototype.resize = function (w, h) {
    this.w = w
    this.h = h
  }

  Renderer.prototype.text = function (str, x, y, size, color, align, weight) {
    var ctx = this.ctx
    ctx.save()
    ctx.font = (weight || 'bold') + ' ' + size + 'px "PingFang SC", "Microsoft YaHei", sans-serif'
    ctx.textAlign = align || 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(20,30,25,0.65)'
    ctx.lineWidth = Math.max(2, size * 0.1)
    ctx.strokeText(str, x, y)
    ctx.fillStyle = color || COL.text
    ctx.fillText(str, x, y)
    ctx.restore()
  }

  Renderer.prototype.title = function (str, y, ratio, color) {
    this.text(str, this.w / 2, y, this.w * ratio, color)
  }

  Renderer.prototype.line = function (str, y, ratio, color) {
    this.text(str, this.w / 2, y, this.w * ratio, color || COL.text, 'center', 'normal')
  }

  // ---------- 翡翠峡谷 + 黄沙跑道 ----------
  Renderer.prototype.background = function (traveled) {
    var ctx = this.ctx
    var w = this.w
    var h = this.h
    var horizon = h * C.horizonRatio

    var sky = ctx.createLinearGradient(0, 0, 0, horizon * 1.4)
    sky.addColorStop(0, COL.skyTop)
    sky.addColorStop(1, COL.skyBottom)
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)

    // 远山
    ctx.fillStyle = '#8fcfa8'
    ctx.beginPath()
    ctx.moveTo(0, horizon)
    for (var i = 0; i <= 10; i++) {
      var x = i * w / 10
      var y = horizon - (i % 2 ? 0.06 : 0.12) * h - Math.sin(i * 2.3) * h * 0.02
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w, horizon)
    ctx.closePath()
    ctx.fill()

    // 两侧翡翠山壁：大块多边形 + 水晶切面
    for (var side = 0; side < 2; side++) {
      var dir = side === 0 ? -1 : 1
      var baseX = side === 0 ? 0 : w
      ctx.fillStyle = COL.canyonDark
      ctx.beginPath()
      ctx.moveTo(baseX, horizon * 0.55)
      ctx.lineTo(w / 2 + dir * w * 0.1, horizon)
      ctx.lineTo(w / 2 + dir * w * 0.17, h * 0.56)
      ctx.lineTo(baseX, h)
      ctx.closePath()
      ctx.fill()

      for (var j = 0; j < 8; j++) {
        var t = j / 8
        var y0 = horizon + t * (h - horizon)
        var y1 = y0 + (h - horizon) / 7
        var inner0 = w / 2 + dir * w * (0.1 + t * 0.33)
        var inner1 = w / 2 + dir * w * (0.1 + (t + 0.14) * 0.33)
        ctx.fillStyle = j % 3 === 0 ? COL.canyonLight : (j % 2 ? COL.canyon : '#278f72')
        ctx.beginPath()
        ctx.moveTo(baseX, y0)
        ctx.lineTo(inner0, y0)
        ctx.lineTo(inner1, y1)
        ctx.lineTo(baseX, y1)
        ctx.closePath()
        ctx.fill()
        // 水晶棱线
        ctx.strokeStyle = 'rgba(193,255,212,0.5)'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(inner0, y0)
        ctx.lineTo(inner1, y1)
        ctx.stroke()
      }
    }

    // 中央沙道（透视梯形）
    ctx.fillStyle = COL.sand
    ctx.beginPath()
    ctx.moveTo(w * 0.43, horizon)
    ctx.lineTo(w * 0.57, horizon)
    ctx.lineTo(w * 0.98, h)
    ctx.lineTo(w * 0.02, h)
    ctx.closePath()
    ctx.fill()

    // 沙道横向移动纹理，强化前进速度感
    ctx.strokeStyle = 'rgba(181,140,84,0.35)'
    ctx.lineWidth = 2
    var off = (traveled || 0) % 160
    for (var k = 0; k < 14; k++) {
      var z = k * 160 + off
      var t = Math.pow((z % 2240) / 2240, 0.72)
      var y = horizon + t * (h - horizon)
      var half = w * (0.07 + t * 0.41)
      ctx.beginPath()
      ctx.moveTo(w / 2 - half, y)
      ctx.lineTo(w / 2 + half, y)
      ctx.stroke()
    }

    // 沙粒
    ctx.fillStyle = 'rgba(181,140,84,0.35)'
    for (var m = 0; m < 24; m++) {
      var sx = ((m * 73 + (traveled || 0) * 0.2) % 100) / 100 * w
      var sy = horizon + (((m * 41 + (traveled || 0) * 0.5) % 100) / 100) * (h - horizon)
      ctx.fillRect(sx, sy, 2, 2)
    }

    // 路缘
    ctx.strokeStyle = COL.roadEdge
    ctx.lineWidth = Math.max(2, w * 0.008)
    ctx.beginPath()
    ctx.moveTo(w * 0.43, horizon)
    ctx.lineTo(w * 0.02, h)
    ctx.moveTo(w * 0.57, horizon)
    ctx.lineTo(w * 0.98, h)
    ctx.stroke()
  }

  // ---------- 小人 ----------
  Renderer.prototype.soldier = function (x, y, r, faction, phase, unitType) {
    var ctx = this.ctx
    var blue = faction === 'player'
    var unit = CR.Content.unitTypes[unitType || (blue ? 'shield' : 'shield')]
    var main = blue ? (unit ? unit.color : COL.player) : COL.enemy
    var light = blue ? COL.playerLight : COL.enemyLight
    var dark = blue ? COL.playerDark : COL.enemyDark
    var bob = Math.sin(phase || 0) * r * 0.15
    y += bob

    // 椭圆投影
    ctx.fillStyle = 'rgba(40,35,20,0.25)'
    ctx.beginPath()
    ctx.ellipse(x, y + r * 1.55, r * 0.95, r * 0.35, 0, 0, Math.PI * 2)
    ctx.fill()

    // 双腿
    ctx.strokeStyle = dark
    ctx.lineWidth = Math.max(1, r * 0.32)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x - r * 0.25, y + r * 0.65)
    ctx.lineTo(x - r * 0.38, y + r * 1.4)
    ctx.moveTo(x + r * 0.25, y + r * 0.65)
    ctx.lineTo(x + r * 0.38, y + r * 1.4)
    ctx.stroke()

    // 身体
    ctx.fillStyle = main
    ctx.beginPath()
    ctx.ellipse(x, y + r * 0.3, r * 0.62, r * 0.78, 0, 0, Math.PI * 2)
    ctx.fill()
    // 高光
    ctx.fillStyle = light
    ctx.beginPath()
    ctx.ellipse(x - r * 0.2, y + r * 0.05, r * 0.22, r * 0.4, -0.3, 0, Math.PI * 2)
    ctx.fill()

    // 兵种兵器：刀盾、弓、骑兵长枪
    if (unitType === 'archer') {
      ctx.strokeStyle = '#7b4a20'
      ctx.lineWidth = Math.max(1, r * 0.16)
      ctx.beginPath()
      ctx.arc(x + r * 0.65, y + r * 0.25, r * 0.55, -1.2, 1.2)
      ctx.stroke()
    } else if (unitType === 'cavalry') {
      ctx.strokeStyle = '#5a4028'
      ctx.lineWidth = Math.max(1, r * 0.18)
      ctx.beginPath()
      ctx.moveTo(x + r * 0.55, y + r * 1.1)
      ctx.lineTo(x + r * 0.9, y - r * 1.2)
      ctx.stroke()
    } else {
      ctx.fillStyle = blue ? '#d7edf7' : '#9d2935'
      ctx.beginPath()
      ctx.arc(x - r * 0.58, y + r * 0.28, r * 0.38, 0, Math.PI * 2)
      ctx.fill()
    }

    // 头盔
    ctx.fillStyle = dark
    ctx.beginPath()
    ctx.arc(x, y - r * 0.55, r * 0.5, Math.PI, Math.PI * 2)
    ctx.fill()
    // 头
    ctx.fillStyle = '#ffd9ae'
    ctx.beginPath()
    ctx.arc(x, y - r * 0.42, r * 0.42, 0, Math.PI * 2)
    ctx.fill()
    // 盔檐
    ctx.fillStyle = dark
    ctx.fillRect(x - r * 0.48, y - r * 0.62, r * 0.96, r * 0.16)
  }

  // ---------- 红袍武将 ----------
  Renderer.prototype.general = function (x, y, r, boss, phase, stage) {
    var ctx = this.ctx
    var bob = Math.sin(phase || 0) * r * 0.06
    y += bob

    // 大投影
    ctx.fillStyle = 'rgba(40,20,15,0.3)'
    ctx.beginPath()
    ctx.ellipse(x, y + r * 1.15, r * 0.95, r * 0.25, 0, 0, Math.PI * 2)
    ctx.fill()

    // 红袍下摆
    ctx.fillStyle = stage >= 3 ? '#6f0d22' : (boss ? '#a3132c' : '#c42635')
    ctx.beginPath()
    ctx.moveTo(x - r * 0.52, y - r * 0.2)
    ctx.lineTo(x + r * 0.52, y - r * 0.2)
    ctx.lineTo(x + r * 0.85, y + r * 1.1)
    ctx.lineTo(x - r * 0.85, y + r * 1.1)
    ctx.closePath()
    ctx.fill()
    // 袍子高光
    ctx.fillStyle = '#e2484c'
    ctx.beginPath()
    ctx.moveTo(x - r * 0.25, y - r * 0.1)
    ctx.lineTo(x + r * 0.05, y - r * 0.1)
    ctx.lineTo(x - r * 0.05, y + r)
    ctx.lineTo(x - r * 0.42, y + r)
    ctx.closePath()
    ctx.fill()

    // 金腰带
    ctx.fillStyle = COL.gold
    ctx.fillRect(x - r * 0.55, y + r * 0.42, r * 1.1, r * 0.16)
    ctx.fillStyle = COL.goldDark
    ctx.beginPath()
    ctx.arc(x, y + r * 0.5, r * 0.14, 0, Math.PI * 2)
    ctx.fill()

    // 上身铠甲
    ctx.fillStyle = '#5c2430'
    ctx.beginPath()
    ctx.ellipse(x, y - r * 0.12, r * 0.55, r * 0.5, 0, 0, Math.PI * 2)
    ctx.fill()
    // 紫色毛领
    ctx.fillStyle = '#6d3c8e'
    for (var i = 0; i < 7; i++) {
      var a = Math.PI + i * Math.PI / 6
      ctx.beginPath()
      ctx.arc(x + Math.cos(a) * r * 0.45, y - r * 0.42 + Math.sin(a) * r * 0.12, r * 0.18, 0, Math.PI * 2)
      ctx.fill()
    }

    // 脸 + 黑胡子
    ctx.fillStyle = '#e8b083'
    ctx.beginPath()
    ctx.arc(x, y - r * 0.72, r * 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#241a1c'
    ctx.beginPath()
    ctx.moveTo(x - r * 0.24, y - r * 0.62)
    ctx.lineTo(x + r * 0.24, y - r * 0.62)
    ctx.lineTo(x + r * 0.12, y - r * 0.25)
    ctx.lineTo(x, y - r * 0.32)
    ctx.lineTo(x - r * 0.12, y - r * 0.25)
    ctx.closePath()
    ctx.fill()

    // 头盔 + 黑缨
    ctx.fillStyle = '#3c3438'
    ctx.beginPath()
    ctx.arc(x, y - r * 0.86, r * 0.32, Math.PI, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#191418'
    ctx.lineWidth = r * 0.1
    ctx.beginPath()
    ctx.moveTo(x, y - r * 1.12)
    ctx.quadraticCurveTo(x + r * 0.2, y - r * 1.45, x + r * 0.38, y - r * 1.3)
    ctx.stroke()

    // 长柄刀
    ctx.strokeStyle = '#4a3526'
    ctx.lineWidth = r * 0.07
    ctx.beginPath()
    ctx.moveTo(x + r * 0.72, y + r * 0.9)
    ctx.lineTo(x + r * 0.72, y - r * 1.35)
    ctx.stroke()
    ctx.fillStyle = '#d8dee2'
    ctx.beginPath()
    ctx.moveTo(x + r * 0.72, y - r * 1.35)
    ctx.quadraticCurveTo(x + r * 1.2, y - r * 1.4, x + r * 1.05, y - r * 1.05)
    ctx.quadraticCurveTo(x + r * 0.85, y - r * 1.12, x + r * 0.72, y - r * 1.05)
    ctx.closePath()
    ctx.fill()
  }

  // ---------- 兵牌 ----------
  Renderer.prototype.pickup = function (x, y, s, value, side) {
    var ctx = this.ctx
    var gold = side === 'R'
    var w = this.w * 0.12 * s
    var h = w * 1.15
    var r = w * 0.18

    // 底座阴影
    ctx.fillStyle = 'rgba(40,30,15,0.25)'
    ctx.beginPath()
    ctx.ellipse(x, y + h * 0.45, w * 0.65, h * 0.16, 0, 0, Math.PI * 2)
    ctx.fill()

    // 牌体
    var grad = ctx.createLinearGradient(x, y - h / 2, x, y + h / 2)
    if (gold) {
      grad.addColorStop(0, '#ffd968')
      grad.addColorStop(1, '#f29b12')
    } else {
      grad.addColorStop(0, '#62c1ff')
      grad.addColorStop(1, '#1673d1')
    }
    ctx.fillStyle = grad
    ctx.strokeStyle = gold ? COL.goldDark : '#0c4e96'
    ctx.lineWidth = Math.max(1, w * 0.05)
    ctx.beginPath()
    ctx.moveTo(x - w / 2 + r, y - h / 2)
    ctx.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, r)
    ctx.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, r)
    ctx.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, r)
    ctx.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, r)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // 牌面小兵 + 数值
    this.soldier(x, y - h * 0.12, w * 0.16, 'player', 0)
    this.text('+' + value, x, y + h * 0.27, Math.max(9, w * 0.3), '#ffffff')
  }

  // ---------- 敌潮 ----------
  Renderer.prototype.wave = function (level, o) {
    var dz = o.z - level.traveled
    if (dz < -C.contactRange || dz > C.viewFar) return
    var s = level.projScale(dz)
    var y = level.projY(dz)
    var count = Math.max(0, o._liveCount == null ? o.size : o._liveCount)
    if (count <= 0) return
    var cols = 9
    var rows = Math.ceil(count / cols)
    var r = this.w * C.enemyUnitRatio * s
    var gap = r * 2.5
    var drawn = 0
    // 后排先画，前排后画形成遮挡
    for (var row = rows - 1; row >= 0; row--) {
      for (var col = 0; col < cols; col++) {
        var idx = row * cols + col
        if (idx >= count) continue
        if (drawn++ >= 90) break
        var x = this.w / 2 + (col - (cols - 1) / 2) * gap
        var yy = y - row * gap * 0.75
        this.soldier(x, yy, r, 'enemy', level.elapsed * 9 + idx, o.unitType)
      }
    }
    // 血条
    if (o._engaged) {
      var bw = this.w * 0.36 * s
      this.healthBar(this.w / 2, y - rows * gap * 0.75 - r * 2.2, bw, Math.max(4, 8 * s), o.hp / o.maxHp, COL.enemy)
      this.text(CR.Content.unitTypes[o.unitType].name + ' ' + count, this.w / 2, y - rows * gap * 0.75 - r * 3.2, Math.max(10, 18 * s), '#ffd8d8')
    }
  }

  Renderer.prototype.healthBar = function (x, y, w, h, ratio, color) {
    var ctx = this.ctx
    ratio = Math.max(0, Math.min(1, ratio))
    ctx.fillStyle = 'rgba(30,20,20,0.65)'
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2)
    ctx.fillStyle = '#4b1515'
    ctx.fillRect(x - w / 2, y, w, h)
    ctx.fillStyle = color
    ctx.fillRect(x - w / 2, y, w * ratio, h)
  }

  // ---------- 玩家兵团 ----------
  Renderer.prototype.army = function (level, player) {
    var f = player.formation
    var r = player.radius
    var count = Math.min(player.count, C.maxDrawnUnits)
    var drawn = 0
    for (var row = f.rows - 1; row >= 0; row--) {
      for (var col = 0; col < f.perRow; col++) {
        var idx = row * f.perRow + col
        if (idx >= count) continue
        var x = player.x + (col - (f.perRow - 1) / 2) * f.spacing
        var y = f.top + row * f.spacing
        this.soldier(x, y, r, 'player', level.elapsed * 10 + idx * 0.7, player.unitType)
        drawn++
      }
    }
    // 收编脉冲
    if (player.pulse > 0) {
      var ctx = this.ctx
      ctx.strokeStyle = 'rgba(93,196,255,' + player.pulse + ')'
      ctx.lineWidth = 4
      ctx.beginPath()
      ctx.arc(player.x, level.groundY - r, (1.6 - player.pulse) * r * 3, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  // ---------- 特效 ----------
  Renderer.prototype.effects = function (fx) {
    var ctx = this.ctx
    var i
    for (i = 0; i < fx.rings.length; i++) {
      var r = fx.rings[i]
      var t = r.age / r.life
      ctx.strokeStyle = r.color
      ctx.globalAlpha = 1 - t
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(r.x, r.y, 12 + t * 55, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // 金色发光弹道，带拖尾
    for (i = 0; i < fx.bullets.length; i++) {
      var b = fx.bullets[i]
      ctx.save()
      ctx.strokeStyle = 'rgba(255,210,87,0.55)'
      ctx.lineWidth = 5
      ctx.shadowColor = COL.gold
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.moveTo(b.x - (b.tx - b.sx) * 0.06, b.y - (b.ty - b.sy) * 0.06)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      ctx.fillStyle = '#fff3b0'
      ctx.beginPath()
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // 碎骨与灰烟
    for (i = 0; i < fx.bursts.length; i++) {
      var p = fx.bursts[i]
      var a = 1 - p.age / p.life
      ctx.save()
      ctx.globalAlpha = a
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      if (p.smoke) {
        ctx.fillStyle = COL.smoke
        ctx.beginPath()
        ctx.arc(0, 0, p.size * (1 + p.age * 3), 0, Math.PI * 2)
        ctx.fill()
      } else {
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
      }
      ctx.restore()
    }

    for (i = 0; i < fx.floats.length; i++) {
      var f = fx.floats[i]
      ctx.globalAlpha = Math.max(0, 1 - f.age / f.life)
      this.text(f.text, f.x, f.y, this.w * (f.big ? 0.055 : 0.04), f.color)
    }
    ctx.globalAlpha = 1
  }

  Renderer.prototype.armyGate = function (level, o) {
    var dz = o.z - level.traveled
    if (dz < -C.pickupCollectDz || dz > C.viewFar) return
    var s = level.projScale(dz)
    var y = level.projY(dz)
    var ctx = this.ctx
    for (var i = 0; i < 2; i++) {
      var option = i === 0 ? o.left : o.right
      var x = level.projX(i === 0 ? 0.25 : 0.75, s)
      var w = this.w * 0.3 * s
      var h = this.h * 0.16 * s
      ctx.fillStyle = i === 0 ? 'rgba(34,151,229,0.72)' : 'rgba(232,169,44,0.75)'
      ctx.fillRect(x - w / 2, y - h, w, h)
      ctx.strokeStyle = '#fff4c2'
      ctx.lineWidth = Math.max(1, 3 * s)
      ctx.strokeRect(x - w / 2, y - h, w, h)
      this.text(option.label, x, y - h * 0.52, Math.max(10, this.w * 0.05 * s), '#ffffff')
    }
    this.text('倍率门 · 贴边选择', this.w / 2, y - this.h * 0.19 * s, Math.max(9, this.w * 0.032 * s), '#fff6ce')
  }

  Renderer.prototype.unitGate = function (level, o) {
    var dz = o.z - level.traveled
    if (dz < -C.pickupCollectDz || dz > C.viewFar) return
    var s = level.projScale(dz)
    var y = level.projY(dz)
    for (var i = 0; i < 2; i++) {
      var id = i === 0 ? o.left : o.right
      var unit = CR.Content.unitTypes[id]
      var x = level.projX(i === 0 ? 0.25 : 0.75, s)
      this.soldier(x, y - 22 * s, this.w * 0.035 * s, 'player', 0, id)
      this.text(unit.name, x, y + 22 * s, Math.max(9, this.w * 0.04 * s), unit.color)
    }
    this.text('兵种门', this.w / 2, y - this.h * 0.1 * s, Math.max(9, this.w * 0.035 * s), '#ffffff')
  }

  Renderer.prototype.eventObject = function (level, o) {
    var dz = o.z - level.traveled
    if (dz < -C.pickupCollectDz || dz > C.viewFar) return
    var s = level.projScale(dz)
    var x = level.projX(0.88, s)
    var y = level.projY(dz)
    var ctx = this.ctx
    ctx.fillStyle = o.event.id === 'ambush' ? '#a83a36' : '#d99a25'
    ctx.beginPath()
    ctx.arc(x, y - 18 * s, 28 * s, 0, Math.PI * 2)
    ctx.fill()
    this.text(o.event.name, x, y - 18 * s, Math.max(9, this.w * 0.038 * s), '#ffffff')
    this.text(o.event.desc, x, y + 16 * s, Math.max(8, this.w * 0.026 * s), '#fff2b0')
  }

  Renderer.prototype.escort = function (level, player) {
    if (level.data.mode !== 'escort') return
    var ctx = this.ctx
    var x = player.x + this.w * 0.18
    var y = level.groundY + this.w * 0.06
    var r = this.w * 0.055
    ctx.fillStyle = 'rgba(40,30,20,0.25)'
    ctx.beginPath()
    ctx.ellipse(x, y + r * 0.45, r, r * 0.3, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#9b632c'
    ctx.fillRect(x - r * 0.75, y - r * 0.55, r * 1.5, r * 0.8)
    ctx.fillStyle = '#e6bc63'
    ctx.beginPath()
    ctx.moveTo(x - r * 0.85, y - r * 0.55)
    ctx.lineTo(x, y - r * 1.2)
    ctx.lineTo(x + r * 0.85, y - r * 0.55)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#3c2c22'
    ctx.beginPath()
    ctx.arc(x - r * 0.55, y + r * 0.35, r * 0.25, 0, Math.PI * 2)
    ctx.arc(x + r * 0.55, y + r * 0.35, r * 0.25, 0, Math.PI * 2)
    ctx.fill()
    var hp = level.data.escortHp == null ? C.escortHp : level.data.escortHp
    this.healthBar(x, y - r * 1.6, r * 2, 6, hp / C.escortHp, '#e9b94d')
  }

  Renderer.prototype.castle = function (level, o) {
    var dz = o.z - level.traveled
    if (dz < -100 || dz > C.viewFar) return
    var ctx = this.ctx
    var s = level.projScale(dz)
    var x = this.w / 2
    var y = level.projY(dz)
    var w = this.w * 0.5 * s
    var h = w * 0.65
    ctx.fillStyle = '#b9c2bd'
    ctx.fillRect(x - w / 2, y - h, w, h)
    ctx.fillStyle = '#87958c'
    for (var i = 0; i < 5; i++) ctx.fillRect(x - w / 2 + i * w / 5, y - h - w * 0.12, w * 0.1, w * 0.12)
    ctx.fillStyle = '#5d4632'
    ctx.beginPath()
    ctx.arc(x, y - h * 0.35, w * 0.14, Math.PI, 0)
    ctx.lineTo(x + w * 0.14, y)
    ctx.lineTo(x - w * 0.14, y)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#d3483f'
    ctx.beginPath()
    ctx.moveTo(x, y - h - w * 0.35)
    ctx.lineTo(x + w * 0.25, y - h - w * 0.28)
    ctx.lineTo(x, y - h - w * 0.2)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#6b4b2d'
    ctx.lineWidth = Math.max(1, 3 * s)
    ctx.beginPath()
    ctx.moveTo(x, y - h - w * 0.36)
    ctx.lineTo(x, y - h)
    ctx.stroke()
  }

  Renderer.prototype.hud = function (level, player) {
    var ctx = this.ctx
    var w = this.w
    // 顶部信息
    ctx.fillStyle = 'rgba(20,40,34,0.45)'
    ctx.fillRect(0, 0, w, this.h * 0.075)
    var mode = CR.Content.modes[level.levelIndex % 4]
    this.text('第 ' + (level.levelIndex + 1) + ' 关 · ' + mode.name, w * 0.04, this.h * 0.036, w * 0.039, COL.text, 'left')
    this.text(CR.Content.unitTypes[player.unitType].name, w * 0.52, this.h * 0.036, w * 0.034, CR.Content.unitTypes[player.unitType].color, 'center')
    this.text('兵力 ' + player.count, w * 0.96, this.h * 0.036, w * 0.047, COL.gold, 'right')
    var sub = '每兵' + player.maxHpPerUnit.toFixed(0) + '生命 · 单发' + player.damage.toFixed(2) + ' · ' + mode.desc
    this.text(sub, w * 0.04, this.h * 0.083, w * 0.025, '#f4e6b0', 'left', 'normal')
    this.text('金币 ' + (this.gameCoins == null ? '' : this.gameCoins), w * 0.96, this.h * 0.083, w * 0.028, COL.gold, 'right')
    if (level.data.mode === 'timed') {
      var remain = Math.max(0, C.timedSeconds - level.elapsed)
      this.text('倒计时 ' + remain.toFixed(1) + 's', w / 2, this.h * 0.125, w * 0.045, remain < 20 ? '#ff7676' : '#ffffff')
    } else if (level.data.mode === 'escort') {
      var hp = level.data.escortHp == null ? C.escortHp : level.data.escortHp
      this.text('粮车 ' + Math.ceil(hp) + '/' + C.escortHp, w / 2, this.h * 0.125, w * 0.037, '#ffe083')
    } else if (level.data.mode === 'defend') {
      this.text(level.traveled >= C.defendPrepZ ? '原地守城 · 逐场迎敌' : '前往布防线 · 仍可手动收兵', w / 2, this.h * 0.125, w * 0.032, '#d7f0db')
    }
    // 进度条
    var ratio = Math.min(1, level.traveled / level.data.length)
    ctx.fillStyle = 'rgba(30,40,35,0.35)'
    ctx.fillRect(w * 0.08, this.h * 0.155, w * 0.84, 5)
    ctx.fillStyle = COL.gold
    ctx.fillRect(w * 0.08, this.h * 0.155, w * 0.84 * ratio, 5)
  }

  Renderer.prototype.world = function (level, player, fx) {
    var ctx = this.ctx
    this.gameCoins = level && level._mainCoins
    ctx.save()
    if (fx.shake > 0) ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake)
    this.background(level.traveled)

    // 远到近绘制
    var drawables = []
    var i
    for (i = 0; i < level.data.pickups.length; i++) {
      var p = level.data.pickups[i]
      if (!p._taken) drawables.push({ z: p.z, kind: 'pickup', o: p })
    }
    for (i = 0; i < level.data.objects.length; i++) {
      var o = level.data.objects[i]
      if (o.type === 'wave' || o.type === 'general') {
        if (!o._dead) drawables.push({ z: o.z, kind: o.type, o: o })
      } else if (o.type === 'armyGate' || o.type === 'unitGate' || o.type === 'event') {
        if (!o._done) drawables.push({ z: o.z, kind: o.type, o: o })
      } else if (o.type === 'castle') drawables.push({ z: o.z, kind: 'castle', o: o })
    }
    drawables.sort(function (a, b) { return b.z - a.z })

    for (i = 0; i < drawables.length; i++) {
      var d = drawables[i]
      var dz = d.z - level.traveled
      if (dz < -C.contactRange || dz > C.viewFar) continue
      if (d.kind === 'pickup') {
        var p2 = d.o
        var s = level.projScale(dz)
        var px = p2.side === 'L' ? 0.12 : 0.88
        this.pickup(level.projX(px, s), level.projY(dz), s, p2.value, p2.side)
      } else if (d.kind === 'wave') this.wave(level, d.o)
      else if (d.kind === 'general') {
        var g = d.o
        var gs = level.projScale(dz)
        var gx = level.projX(0.5, gs)
        var gy = level.projY(dz)
        var gr = this.w * 0.036 * gs
        this.general(gx, gy, gr, g.boss, level.elapsed * 4, g._phase || 1)
        var bw = this.w * (g.boss ? 0.42 : 0.32) * gs
        this.healthBar(gx, gy - gr * 1.85, bw, Math.max(5, 10 * gs), g.hp / g.maxHp, g.boss ? '#ffb020' : '#e23d46')
        this.text((g.boss ? '最终BOSS ' : '武将 ') + CR.Content.unitTypes[g.unitType].name + (g.boss ? ' · 阶段' + (g._phase || 1) : ''), gx, gy - gr * 2.25, Math.max(11, this.w * (g.boss ? 0.04 : 0.032) * gs), g.boss ? '#ffd257' : '#ffd8d8')
      } else if (d.kind === 'castle') this.castle(level, d.o)
      else if (d.kind === 'armyGate') this.armyGate(level, d.o)
      else if (d.kind === 'unitGate') this.unitGate(level, d.o)
      else if (d.kind === 'event') this.eventObject(level, d.o)
    }

    this.escort(level, player)
    this.army(level, player)
    this.effects(fx)
    ctx.restore()
    this.hud(level, player)
  }

  // ---------- 菜单 / 结算 ----------
  Renderer.prototype.panel = function () {
    var ctx = this.ctx
    ctx.fillStyle = COL.panel
    ctx.fillRect(0, 0, this.w, this.h)
  }

  Renderer.prototype.buttonRect = function (yRatio) {
    return { x: this.w * 0.18, y: this.h * yRatio, w: this.w * 0.64, h: this.h * 0.075 }
  }

  Renderer.prototype.button = function (r, label) {
    var ctx = this.ctx
    var grad = ctx.createLinearGradient(0, r.y, 0, r.y + r.h)
    grad.addColorStop(0, '#ffd968')
    grad.addColorStop(1, '#f0a51b')
    ctx.fillStyle = grad
    ctx.beginPath()
    var rad = r.h * 0.3
    ctx.moveTo(r.x + rad, r.y)
    ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, rad)
    ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, rad)
    ctx.arcTo(r.x, r.y + r.h, r.x, r.y, rad)
    ctx.arcTo(r.x, r.y, r.x + r.w, r.y, rad)
    ctx.closePath()
    ctx.fill()
    this.text(label, r.x + r.w / 2, r.y + r.h / 2, this.w * 0.052, '#4a2c06')
  }

  Renderer.prototype.upgradeRect = function (kind) {
    return {
      x: this.w * (kind === 'attack' ? 0.07 : 0.53),
      y: this.h * 0.59,
      w: this.w * 0.4,
      h: this.h * 0.17
    }
  }

  Renderer.prototype.upgradeButton = function (r, title, desc, top, bottom) {
    var ctx = this.ctx
    var grad = ctx.createLinearGradient(0, r.y, 0, r.y + r.h)
    grad.addColorStop(0, top)
    grad.addColorStop(1, bottom)
    ctx.fillStyle = grad
    ctx.fillRect(r.x, r.y, r.w, r.h)
    ctx.strokeStyle = '#ffe6a0'
    ctx.lineWidth = 2
    ctx.strokeRect(r.x, r.y, r.w, r.h)
    this.text(title, r.x + r.w / 2, r.y + r.h * 0.32, this.w * 0.045, '#ffffff')
    this.text(desc, r.x + r.w / 2, r.y + r.h * 0.68, this.w * 0.029, '#fff4cf', 'center', 'normal')
  }

  Renderer.prototype.campTalentRect = function (idx) {
    return { x: this.w * (0.04 + idx * 0.32), y: this.h * 0.26, w: this.w * 0.28, h: this.h * 0.18 }
  }

  Renderer.prototype.campShopRect = function (idx) {
    return { x: this.w * (0.08 + idx * 0.44), y: this.h * 0.52, w: this.w * 0.4, h: this.h * 0.13 }
  }

  Renderer.prototype.campNextRect = function () {
    return { x: this.w * 0.2, y: this.h * 0.75, w: this.w * 0.6, h: this.h * 0.075 }
  }

  Renderer.prototype.camp = function (game) {
    this.panel()
    this.title('战后营地', this.h * 0.1, 0.085, COL.gold)
    this.line('金币 ' + game.coins + ' · 先选天赋，装备自愿购买', this.h * 0.17, 0.033, '#e8eadf')
    this.line('天赋三选一', this.h * 0.225, 0.04, '#ffffff')
    for (var i = 0; i < game.talentChoice.length; i++) {
      var t = game.talentChoice[i]
      var r = this.campTalentRect(i)
      var selected = game.talentSelected === t.id
      this.ctx.fillStyle = selected ? '#267b55' : '#29433b'
      this.ctx.fillRect(r.x, r.y, r.w, r.h)
      this.ctx.strokeStyle = selected ? '#ffe07a' : '#729083'
      this.ctx.lineWidth = selected ? 3 : 1
      this.ctx.strokeRect(r.x, r.y, r.w, r.h)
      this.text(t.name, r.x + r.w / 2, r.y + r.h * 0.28, this.w * 0.043, selected ? '#ffe07a' : '#ffffff')
      this.text(t.desc, r.x + r.w / 2, r.y + r.h * 0.62, this.w * 0.027, '#dce9df', 'center', 'normal')
      if (selected) this.text('已选择', r.x + r.w / 2, r.y + r.h * 0.86, this.w * 0.024, '#ffe07a')
    }
    if (!game.talentChoice.length) this.line('全部天赋已学完，可直接下一关', this.h * 0.34, 0.035, '#ffe07a')
    this.line('装备商店（可不买）', this.h * 0.48, 0.036, '#ffffff')
    for (var j = 0; j < game.shopChoice.length; j++) {
      var item = game.shopChoice[j]
      var sr = this.campShopRect(j)
      var owned = game.equipment.indexOf(item.id) >= 0
      this.ctx.fillStyle = owned ? '#345146' : (game.coins >= item.cost ? '#71521d' : '#403d35')
      this.ctx.fillRect(sr.x, sr.y, sr.w, sr.h)
      this.ctx.strokeStyle = owned ? '#8fd4a9' : '#c7a85d'
      this.ctx.strokeRect(sr.x, sr.y, sr.w, sr.h)
      this.text(item.name + ' · ' + item.cost + '金币', sr.x + sr.w / 2, sr.y + sr.h * 0.27, this.w * 0.034, '#ffe3a0')
      this.text(item.desc, sr.x + sr.w / 2, sr.y + sr.h * 0.58, this.w * 0.028, '#ffffff', 'center', 'normal')
      this.text(owned ? '已购买' : (game.coins >= item.cost ? '点击购买' : '金币不足'), sr.x + sr.w / 2, sr.y + sr.h * 0.84, this.w * 0.024, '#d8e4d9', 'center', 'normal')
    }
    this.button(this.campNextRect(), game.talentSelected || !game.talentChoice.length ? '进入下一关' : '请先选择天赋')
    this.line('装备与天赋将在下一关生效 · 失败重试恢复检查点', this.h * 0.88, 0.027, '#cfd6cf')
  }

  CR.Renderer = Renderer
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis))
