/**
 * 渲染层：全部用 Canvas 2D 程序化绘制，无外部图片资源，导入即能跑。
 * 三国小小兵风格：翡翠水晶峡谷 + 黄沙跑道，左右兵牌收编，红兵潮铺满通道，
 * 红袍武将头顶血条，近战时红兵碎成白骨与烟尘。2.5D 透视近大远小。
 */
(function (global) {
  var CR = (global.CR = global.CR || {})
  var C = CR.CONFIG
  var L = CR.Logic

  function roundRect (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  function fillEllipse (ctx, x, y, rx, ry, color) {
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(1, ry / rx)
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(0, 0, rx, 0, Math.PI * 2)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  function strokeText (ctx, text, x, y, font, fill, align) {
    ctx.font = font
    ctx.textAlign = align || 'center'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 5
    ctx.lineJoin = 'round'
    ctx.strokeStyle = C.color.hudShadow
    ctx.strokeText(text, x, y)
    ctx.fillStyle = fill
    ctx.fillText(text, x, y)
  }

  function Renderer (ctx, w, h) {
    this.ctx = ctx
    this.w = w
    this.h = h
  }

  Renderer.prototype.resize = function (w, h) { this.w = w; this.h = h }

  Renderer.prototype.buttonRect = function (yRatio) {
    var bw = Math.min(280, this.w * 0.66)
    var bh = 60
    return { x: (this.w - bw) / 2, y: this.h * yRatio, w: bw, h: bh }
  }

  // 翡翠峡谷 + 黄沙跑道背景
  Renderer.prototype.background = function (traveled) {
    var ctx = this.ctx, w = this.w, h = this.h
    var horizon = h * C.horizonRatio
    var ground = h * C.playerLineRatio

    // 暖黄天空
    var sky = ctx.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, C.color.skyTop)
    sky.addColorStop(1, C.color.skyBottom)
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)

    var N = 24
    var halfNear = (w / 2) * (1 - 2 * C.trackMarginRatio)
    var leftPts = []
    var rightPts = []
    leftPts.push({ x: w / 2 - halfNear * 1.06, y: h, s: 1 })
    rightPts.push({ x: w / 2 + halfNear * 1.06, y: h, s: 1 })
    for (var k = 0; k <= N; k++) {
      var f = k / N
      var dz = C.viewFar * f * f
      var s = C.perspectiveK / (C.perspectiveK + dz)
      var sy = horizon + (ground - horizon) * s
      var hw = halfNear * s
      leftPts.push({ x: w / 2 - hw, y: sy, s: s })
      rightPts.push({ x: w / 2 + hw, y: sy, s: s })
    }
    var vpX = w / 2
    var vpY = horizon

    // 左右翡翠水晶山壁（屏幕边缘到跑道边界，向消失点收敛）
    this.drawJadeWall(leftPts, true, vpX, vpY)
    this.drawJadeWall(rightPts, false, vpX, vpY)

    // 跑道褐色护墙条带
    ctx.beginPath()
    for (var i = 0; i < leftPts.length; i++) {
      var lp = leftPts[i]
      var off = 14 * lp.s
      if (i === 0) ctx.moveTo(lp.x - off, lp.y)
      else ctx.lineTo(lp.x - off, lp.y)
    }
    for (var j = rightPts.length - 1; j >= 0; j--) ctx.lineTo(rightPts[j].x + 14 * rightPts[j].s, rightPts[j].y)
    ctx.closePath()
    ctx.fillStyle = C.color.trackWall
    ctx.fill()

    // 黄沙跑道本体
    ctx.beginPath()
    for (var a = 0; a < leftPts.length; a++) {
      if (a === 0) ctx.moveTo(leftPts[a].x, leftPts[a].y)
      else ctx.lineTo(leftPts[a].x, leftPts[a].y)
    }
    for (var b = rightPts.length - 1; b >= 0; b--) ctx.lineTo(rightPts[b].x, rightPts[b].y)
    ctx.closePath()
    ctx.fillStyle = C.color.track
    ctx.fill()

    // 透视石板横线
    var gap = 150
    var phase = traveled % gap
    for (var zz = -gap + phase; zz < C.viewFar; zz += gap) {
      var dz2 = Math.max(0, zz)
      var s2 = C.perspectiveK / (C.perspectiveK + dz2)
      var y2 = horizon + (ground - horizon) * s2
      var hw2 = halfNear * s2
      ctx.globalAlpha = 0.12 + 0.2 * s2
      ctx.strokeStyle = C.color.trackLine
      ctx.lineWidth = Math.max(0.8, 3 * s2)
      ctx.beginPath()
      ctx.moveTo(w / 2 - hw2 + 4 * s2, y2)
      ctx.lineTo(w / 2 + hw2 - 4 * s2, y2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // 中央一条虚线纵轴，提示行进方向
    ctx.strokeStyle = 'rgba(120,84,40,0.18)'
    ctx.lineWidth = 2
    ctx.setLineDash([10, 14])
    ctx.beginPath()
    ctx.moveTo(vpX, vpY)
    ctx.lineTo(w / 2, h)
    ctx.stroke()
    ctx.setLineDash([])

    // 远端景深雾
    var farS = C.perspectiveK / (C.perspectiveK + C.viewFar)
    var farY = horizon + (ground - horizon) * farS
    var fogGrad = ctx.createLinearGradient(0, farY - h * 0.02, 0, farY + h * 0.1)
    fogGrad.addColorStop(0, 'rgba(238,224,180,0.45)')
    fogGrad.addColorStop(1, 'rgba(238,224,180,0)')
    ctx.fillStyle = fogGrad
    ctx.fillRect(0, farY - h * 0.02, w, h * 0.12)
  }

  // 单侧翡翠山壁：多边形 + 水平渐变 + 向消失点收敛的水晶棱线
  Renderer.prototype.drawJadeWall = function (edgePts, isLeft, vpX, vpY) {
    var ctx = this.ctx, w = this.w, h = this.h
    var near = edgePts[0]
    ctx.beginPath()
    if (isLeft) {
      ctx.moveTo(0, h)
      ctx.lineTo(0, vpY)
      ctx.lineTo(vpX, vpY)
      ctx.lineTo(near.x, h)
    } else {
      ctx.moveTo(w, h)
      ctx.lineTo(w, vpY)
      ctx.lineTo(vpX, vpY)
      ctx.lineTo(near.x, h)
    }
    ctx.closePath()
    var g = ctx.createLinearGradient(isLeft ? 0 : w, 0, vpX, 0)
    g.addColorStop(0, C.color.jadeDark)
    g.addColorStop(0.6, C.color.jade)
    g.addColorStop(1, C.color.jadeLight)
    ctx.fillStyle = g
    ctx.fill()

    // 水晶切面棱线：从近端边缘等分点汇向消失点
    ctx.strokeStyle = C.color.jadeShine
    ctx.lineWidth = 1.5
    for (var t = 0.2; t <= 0.85; t += 0.2) {
      var bx = isLeft ? near.x * t : near.x + (w - near.x) * t
      ctx.beginPath()
      ctx.moveTo(bx, h)
      ctx.lineTo(vpX, vpY)
      ctx.stroke()
    }
  }

  // 单个小人：投影 + 暗底 + 肩 + 躯干 + 高光 + 头
  Renderer.prototype.unit = function (x, y, r, colors, phase) {
    var ctx = this.ctx
    var bob = Math.sin(phase) * r * 0.22
    y += bob
    fillEllipse(ctx, x, y + r * 1.18, r * 1.0, r * 0.42, 'rgba(0,0,0,0.22)')
    ctx.fillStyle = colors.dark
    roundRect(ctx, x - r * 0.9, y - r * 0.72, r * 1.8, r * 1.94, r * 0.74)
    ctx.fill()
    ctx.fillStyle = colors.body
    roundRect(ctx, x - r * 0.86, y - r * 0.66, r * 1.72, r * 0.62, r * 0.3)
    ctx.fill()
    roundRect(ctx, x - r * 0.66, y - r * 0.42, r * 1.32, r * 1.3, r * 0.5)
    ctx.fill()
    ctx.globalAlpha = 0.5
    ctx.fillStyle = colors.light
    roundRect(ctx, x - r * 0.56, y - r * 0.46, r * 0.4, r * 0.9, r * 0.2)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = colors.skin
    ctx.beginPath()
    ctx.arc(x, y - r * 1.08, r * 0.54, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.beginPath()
    ctx.arc(x - r * 0.16, y - r * 1.22, r * 0.18, 0, Math.PI * 2)
    ctx.fill()
  }

  // 椭圆盘人群（玩家用）；兵越多横向间距自动收窄，且整阵约束在跑道内不溢出屏幕
  Renderer.prototype.crowd = function (centerX, baseZ, count, colors, phase, scaleMul) {
    var w = this.w
    var level = this.level
    var drawN = Math.min(count, C.maxDrawnUnits)
    var cols = Math.round(L.clamp(Math.sqrt(drawN) * 1.2, 4, 12))
    var tw = level.trackWidth()
    var tl = level.trackLeft()
    // 阵型最宽不超过跑道的 92%，兵多时自动压紧横向间距
    var gapX = Math.min(w * C.formationGapRatio, (tw * 0.92) / Math.max(1, cols - 1))
    var gapZ = w * C.formationDepthGapRatio
    var offs = L.formationOffsets(drawN, gapX, gapZ)
    // 靠边时把整阵中心向内收，保证左右缘都在跑道内
    var rowW = (cols - 1) * gapX
    centerX = L.clamp(centerX, tl + rowW / 2 + 2, tl + tw - rowW / 2 - 2)
    var units = []
    for (var i = 0; i < offs.length; i++) {
      var pr = level.project(baseZ + offs[i].dz)
      var s = pr.s
      var r = w * C.unitRadiusRatio * s * (scaleMul || 1)
      units.push({ x: level.projX(centerX + offs[i].dx, s), y: pr.sy, r: r, phase: phase + i * 0.5 })
    }
    units.sort(function (a, b) { return a.y - b.y })
    for (var k = 0; k < units.length; k++) this.unit(units[k].x, units[k].y, units[k].r, colors, units[k].phase)
    return units
  }

  // 矩形方阵偏移：把红兵铺成填满通道宽度的人潮
  function waveOffsets (drawN, widthX, gapX, gapZ) {
    var cols = Math.max(4, Math.round(widthX / gapX))
    var rows = Math.ceil(drawN / cols)
    var out = []
    var n = 0
    for (var r = 0; r < rows && n < drawN; r++) {
      var inRow = Math.min(cols, drawN - n)
      var rowW = (inRow - 1) * gapX
      var dz = (rows - 1 - r) * gapZ
      for (var c = 0; c < inRow; c++) {
        out.push({ dx: -rowW / 2 + c * gapX, dz: dz })
        n++
      }
    }
    return out
  }

  Renderer.prototype.player = function (player) {
    var level = this.level
    var palette = {
      body: C.color.player, light: C.color.playerLight,
      dark: C.color.playerDark, skin: C.color.playerSkin
    }
    var scaleMul = 1 + player.pulse * 0.14
    var units = this.crowd(player.x, level.traveled, player.count, palette, player.phase, scaleMul)
    if (player.count > 0 && units.length) {
      var top = units[0]
      for (var i = 1; i < units.length; i++) if (units[i].y < top.y) top = units[i]
      strokeText(this.ctx, String(Math.round(player.count)), player.x, Math.max(46, top.y - top.r * 3.2),
        'bold ' + Math.round(this.w * 0.085) + 'px Arial', C.color.hudText)
    }
  }

  // 红兵潮：高密度矩形方阵铺满通道 + 头顶剩余兵力
  Renderer.prototype.wave = function (item) {
    var ctx = this.ctx, w = this.w
    var level = this.level
    var b = level.enemyBounds(item)
    var pr = item._proj || level.project(item.z - (item._adv || 0))
    var s = pr.s
    var palette = {
      body: C.color.enemy, light: C.color.enemyLight,
      dark: C.color.enemyDark, skin: C.color.enemySkin
    }
    var alive = Math.max(0, Math.round(item._hp))
    var drawN = Math.min(alive, C.maxDrawnUnits)
    var widthX = b.hw * 2
    var gapX = w * C.enemyUnitRatio * 1.9
    var gapZ = w * C.formationDepthGapRatio * 0.9
    var offs = waveOffsets(drawN, widthX, gapX, gapZ)
    var units = []
    for (var i = 0; i < offs.length; i++) {
      var p = level.project(item.z - (item._adv || 0) + offs[i].dz)
      var r = w * C.enemyUnitRatio * p.s
      units.push({ x: level.projX(b.cx + offs[i].dx, p.s), y: p.sy, r: r, phase: 2 + i * 0.4 })
    }
    units.sort(function (a, b2) { return a.y - b2.y })
    for (var k = 0; k < units.length; k++) this.unit(units[k].x, units[k].y, units[k].r, palette, units[k].phase)

    if (units.length) {
      var topY = units[0].y
      for (var u = 1; u < units.length; u++) if (units[u].y < topY) topY = units[u].y
      var fs = Math.max(13, Math.round(w * 0.08 * s))
      strokeText(ctx, String(alive), level.projX(b.cx, s), Math.max(38, topY - w * 0.05 * s),
        'bold ' + fs + 'px Arial', '#ffe3e3')
    }
  }

  // 兵牌：立体小石碑，蓝 +1 / 黄高值，立在左右路边
  Renderer.prototype.pickup = function (item) {
    var ctx = this.ctx, w = this.w
    var level = this.level
    var pr = item._proj || level.project(item.z - (item._adv || 0))
    var s = pr.s
    var cx = level.projX(level.pickupAnchorX(item), s)
    var sy = pr.sy
    var pw = w * 0.078 * s
    var ph = w * 0.125 * s
    var x = cx - pw / 2
    var top = sy - ph
    var isGold = item.side === 'R'
    var main = isGold ? C.color.plaqueGold : C.color.plaqueBlue
    var dark = isGold ? C.color.plaqueGoldDark : C.color.plaqueBlueDark

    // 底座阴影（厚度）
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    roundRect(ctx, x + 3 * s, top + 4 * s, pw, ph, 5 * s)
    ctx.fill()
    // 牌身
    ctx.fillStyle = dark
    roundRect(ctx, x - 2 * s, top, pw, ph, 5 * s)
    ctx.fill()
    ctx.fillStyle = main
    roundRect(ctx, x, top + 2 * s, pw - 3 * s, ph - 4 * s, 5 * s)
    ctx.fill()
    // 顶部受光
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    roundRect(ctx, x + 3 * s, top + 3 * s, pw - 9 * s, ph * 0.26, 4 * s)
    ctx.fill()
    // 文案
    ctx.fillStyle = isGold ? C.color.plaqueTextDark : '#ffffff'
    ctx.font = 'bold ' + Math.max(8, Math.round(w * 0.045 * s)) + 'px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(item.label, cx - 1 * s, top + ph * 0.58)
  }

  // 红袍三国武将：宽袍 + 紫毛领 + 黑胡子 + 头盔 + 武器，头顶红血条数字
  Renderer.prototype.general = function (item) {
    var ctx = this.ctx, w = this.w
    var level = this.level
    var b = level.enemyBounds(item)
    var pr = item._proj || level.project(item.z - (item._adv || 0))
    var s = pr.s
    var cx = level.projX(b.cx, s)
    var sy = pr.sy
    var breathe = item._engaged ? 1 + Math.sin(performance.now() / 120) * 0.02 : 1
    var rw = w * 0.26 * s * breathe
    var rh = w * 0.36 * s
    var bx = cx - rw / 2
    var by = sy - rh

    // 影子
    fillEllipse(ctx, cx, sy + rw * 0.06, rw * 0.62, rw * 0.2, 'rgba(0,0,0,0.3)')

    // 武器（右手长柄大刀，深色杆 + 银刃）
    ctx.strokeStyle = '#3a2c20'
    ctx.lineWidth = Math.max(2, 5 * s)
    ctx.beginPath()
    ctx.moveTo(bx + rw * 0.92, by + rh * 0.25)
    ctx.lineTo(bx + rw * 1.18, by + rh * 0.95)
    ctx.stroke()
    ctx.fillStyle = '#d7dde3'
    ctx.beginPath()
    ctx.moveTo(bx + rw * 0.86, by + rh * 0.16)
    ctx.lineTo(bx + rw * 1.06, by + rh * 0.3)
    ctx.lineTo(bx + rw * 0.9, by + rh * 0.36)
    ctx.closePath()
    ctx.fill()

    // 战袍（暗红大袍，下摆正梯形）
    ctx.fillStyle = C.color.generalRobeDark
    ctx.beginPath()
    ctx.moveTo(bx, by + rh)
    ctx.lineTo(bx + rw * 0.12, by + rh * 0.3)
    ctx.lineTo(bx + rw * 0.88, by + rh * 0.3)
    ctx.lineTo(bx + rw, by + rh)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = C.color.generalRobe
    ctx.beginPath()
    ctx.moveTo(bx + rw * 0.1, by + rh * 0.96)
    ctx.lineTo(bx + rw * 0.2, by + rh * 0.34)
    ctx.lineTo(bx + rw * 0.8, by + rh * 0.34)
    ctx.lineTo(bx + rw * 0.9, by + rh * 0.96)
    ctx.closePath()
    ctx.fill()
    // 金色腰带
    ctx.fillStyle = C.color.gold
    ctx.fillRect(bx + rw * 0.16, by + rh * 0.62, rw * 0.68, rw * 0.07)
    // 紫色毛领（双肩一圈）
    ctx.fillStyle = C.color.generalFur
    ctx.beginPath()
    ctx.arc(cx, by + rh * 0.3, rw * 0.3, Math.PI * 0.05, Math.PI * 0.95)
    ctx.lineTo(cx + rw * 0.26, by + rh * 0.42)
    ctx.arc(cx, by + rh * 0.3, rw * 0.18, Math.PI * 0.95, Math.PI * 0.05, true)
    ctx.closePath()
    ctx.fill()
    // 脸
    ctx.fillStyle = C.color.generalSkin
    ctx.beginPath()
    ctx.arc(cx, by + rh * 0.26, rw * 0.2, 0, Math.PI * 2)
    ctx.fill()
    // 头盔（红盔 + 黑缨）
    ctx.fillStyle = '#7d1b22'
    ctx.beginPath()
    ctx.arc(cx, by + rh * 0.2, rw * 0.22, Math.PI, 0)
    ctx.fill()
    ctx.fillStyle = '#241b1b'
    ctx.beginPath()
    ctx.arc(cx, by + rh * 0.02, rw * 0.05, 0, Math.PI * 2)
    ctx.fill()
    // 粗黑眉须 + 络腮胡
    ctx.fillStyle = C.color.generalBeard
    ctx.fillRect(cx - rw * 0.16, by + rh * 0.2, rw * 0.1, rw * 0.03)
    ctx.fillRect(cx + rw * 0.06, by + rh * 0.2, rw * 0.1, rw * 0.03)
    ctx.beginPath()
    ctx.arc(cx, by + rh * 0.34, rw * 0.13, 0, Math.PI)
    ctx.fill()

    // 头顶黑底红血条 + 数字
    var hp = item._hp
    var maxHp = item._maxHp || 1
    var bw = rw * 1.2
    var bh = Math.max(6, rw * 0.1)
    var bxx = cx - bw / 2
    var byy = by - bh * 2.6
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    roundRect(ctx, bxx - 3, byy - 3, bw + 6, bh + 6, bh)
    ctx.fill()
    ctx.fillStyle = '#3a2024'
    roundRect(ctx, bxx, byy, bw, bh, bh / 2)
    ctx.fill()
    ctx.fillStyle = C.color.generalHp
    roundRect(ctx, bxx, byy, bw * Math.max(0, hp / maxHp), bh, bh / 2)
    ctx.fill()
    strokeText(ctx, String(Math.max(0, Math.round(hp))), cx, byy - bh * 1.7,
      'bold ' + Math.max(10, Math.round(w * 0.05 * s)) + 'px Arial', '#ffffff')
  }

  Renderer.prototype.castle = function (item) {
    var ctx = this.ctx, w = this.w
    var level = this.level
    var pr = item._proj || level.project(item.z - (item._adv || 0))
    var s = pr.s
    var sy = pr.sy
    var cw = w * 0.9 * s
    var cx = w / 2
    var ch = w * 0.42 * s
    var left = cx - cw / 2
    var top = sy - ch
    ctx.fillStyle = C.color.castleDark
    roundRect(ctx, left, top, cw, ch, 8 * s)
    ctx.fill()
    ctx.fillStyle = C.color.castle
    roundRect(ctx, left + 6 * s, top + 8 * s, cw - 12 * s, ch - 8 * s, 6 * s)
    ctx.fill()
    ctx.fillStyle = C.color.castleDark
    var merlonW = cw / 7
    for (var i = 0; i < 7; i += 2) ctx.fillRect(left + i * merlonW, top - 10 * s, merlonW * 0.9, 14 * s)
    ctx.fillRect(left - 8 * s, top + ch * 0.18, 18 * s, ch * 0.82)
    ctx.fillRect(left + cw - 10 * s, top + ch * 0.18, 18 * s, ch * 0.82)
    ctx.fillStyle = 'rgba(255,255,255,0.16)'
    ctx.fillRect(left + cw * 0.82, top + 8 * s, cw * 0.12, ch - 8 * s)
    ctx.fillStyle = '#4a4034'
    roundRect(ctx, cx - cw * 0.11, sy - ch * 0.4, cw * 0.22, ch * 0.4, cw * 0.11)
    ctx.fill()
  }

  Renderer.prototype.fx = function (fx) {
    var ctx = this.ctx
    // 收编光环
    for (var ri = 0; ri < fx.rings.length; ri++) {
      var rg = fx.rings[ri]
      ctx.globalAlpha = Math.max(0, rg.life / rg.maxLife) * 0.8
      ctx.strokeStyle = rg.color
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(rg.x, rg.y, rg.r, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // 碎骨（白色小块）+ 灰烟
    for (var bi = 0; bi < fx.bones.length; bi++) {
      var bn = fx.bones[bi]
      var alpha = Math.max(0, bn.life / bn.maxLife)
      for (var sm = 0; sm < bn.smokes.length; sm++) {
        var smk = bn.smokes[sm]
        ctx.globalAlpha = alpha * 0.62
        ctx.fillStyle = C.color.smoke
        ctx.beginPath()
        ctx.arc(bn.x + smk.dx, bn.y + smk.dy, smk.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = alpha
      ctx.fillStyle = C.color.bone
      ctx.strokeStyle = 'rgba(90,80,66,0.45)'
      ctx.lineWidth = 1
      for (var j = 0; j < bn.bones.length; j++) {
        var q = bn.bones[j]
        ctx.save()
        ctx.translate(bn.x + q.dx, bn.y + q.dy)
        ctx.rotate(q.rot)
        ctx.beginPath()
        ctx.rect(-q.size / 2, -q.size / 2, q.size, q.size * 0.62)
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      }
      ctx.globalAlpha = 1
    }

    // 子弹弹道：金色发光弹丸 + 长拖尾，清晰可辨的飞行射线
    for (var bu = 0; bu < fx.bullets.length; bu++) {
      var bl2 = fx.bullets[bu]
      var f = Math.min(1, bl2.t / bl2.dur)
      var bx = bl2.x0 + (bl2.x1 - bl2.x0) * f
      var by = bl2.y0 + (bl2.y1 - bl2.y0) * f
      var tf = Math.max(0, f - 0.55)
      var tx = bl2.x0 + (bl2.x1 - bl2.x0) * tf
      var ty = bl2.y0 + (bl2.y1 - bl2.y0) * tf
      // 外层金色光晕拖尾
      ctx.strokeStyle = 'rgba(255,196,60,0.55)'
      ctx.lineWidth = 6
      ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(bx, by); ctx.stroke()
      // 内层亮金芯
      ctx.strokeStyle = 'rgba(255,236,150,0.95)'
      ctx.lineWidth = 2.6
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(bx, by); ctx.stroke()
      // 弹丸：金色外晕 + 白亮芯
      ctx.fillStyle = 'rgba(255,210,80,0.9)'
      ctx.beginPath(); ctx.arc(bx, by, 5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#fff6d8'
      ctx.beginPath(); ctx.arc(bx, by, 2.6, 0, Math.PI * 2); ctx.fill()
    }

    // 通用爆点
    for (var k = 0; k < fx.bursts.length; k++) {
      var b = fx.bursts[k]
      ctx.globalAlpha = Math.max(0, b.life / b.maxLife)
      ctx.fillStyle = b.color
      for (var jj = 0; jj < b.parts.length; jj++) {
        var p = b.parts[jj]
        ctx.beginPath()
        ctx.arc(b.x + p.dx, b.y + p.dy, p.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    // 飘字
    for (var i = 0; i < fx.floaters.length; i++) {
      var f = fx.floaters[i]
      ctx.globalAlpha = Math.max(0, f.life / f.maxLife)
      strokeText(ctx, f.text, f.x, f.y,
        'bold ' + Math.round(this.w * (f.big ? 0.085 : 0.06)) + 'px Arial', f.color)
      ctx.globalAlpha = 1
    }
  }

  Renderer.prototype.hud = function (levelIndex) {
    var ctx = this.ctx
    ctx.fillStyle = 'rgba(0,0,0,0.28)'
    roundRect(ctx, 12, 14, 96, 34, 17)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold ' + Math.round(this.w * 0.04) + 'px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('第 ' + (levelIndex + 1) + ' 关', 60, 31)
  }

  Renderer.prototype.panel = function () {
    this.ctx.fillStyle = C.color.panel
    this.ctx.fillRect(0, 0, this.w, this.h)
  }

  Renderer.prototype.button = function (rect, text) {
    var ctx = this.ctx
    ctx.fillStyle = C.color.buttonDark
    roundRect(ctx, rect.x, rect.y + 4, rect.w, rect.h, 14)
    ctx.fill()
    ctx.fillStyle = C.color.button
    roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 14)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold ' + Math.round(this.w * 0.052) + 'px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2)
  }

  Renderer.prototype.title = function (text, y, size, color) {
    strokeText(this.ctx, text, this.w / 2, y,
      'bold ' + Math.round(this.w * size) + 'px Arial', color || '#fff')
  }

  Renderer.prototype.line = function (text, y, size, color) {
    var ctx = this.ctx
    ctx.font = Math.round(this.w * size) + 'px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = color || '#eee'
    ctx.fillText(text, this.w / 2, y)
  }

  // 主渲染：远→近绘制世界，玩家最后覆盖
  Renderer.prototype.world = function (level, player, fx) {
    this.level = level
    this.background(level.traveled)
    var items = level.visibleItems()
    for (var i = 0; i < items.length; i++) {
      var it = items[i]
      if (it.type === 'castle') this.castle(it)
      else if (it.type === 'pickup') this.pickup(it)
      else if (it.type === 'wave') this.wave(it)
      else if (it.type === 'general') this.general(it)
    }
    if (player.count > 0) this.player(player)
    this.fx(fx)
    this.hud(level.levelIndex)
  }

  CR.Renderer = Renderer
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis))
