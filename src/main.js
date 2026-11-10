/**
 * 主控：菜单/战斗/成长/营地/失败状态机，统一处理手动输入与一次性事件奖励。
 */
(function (global) {
  var CR = (global.CR = global.CR || {})
  var C = CR.CONFIG
  var S = CR.STATE
  var Content = CR.Content

  function inRect (p, r) { return p && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h }

  function Main () {
    this.platform = CR.Platform.init()
    this.canvas = this.platform.canvas
    this.ctx = this.platform.ctx
    this.dpr = this.platform.dpr
    this.w = this.platform.width
    this.h = this.platform.height
    this.applySize(this.w, this.h)
    this.renderer = new CR.Renderer(this.ctx, this.w, this.h)
    this.fx = new CR.Entities.Fx()
    this.level = new CR.Level(this.w, this.h)
    this.player = null
    this.attackLevel = 0
    this.vitalityLevel = 0
    this.coins = 0
    this.equipment = []
    this.talents = []
    this.talentOptions = []
    this.equipmentOptions = []
    this.talentChosen = false
    this.checkpoint = null
    this.loseReason = 'army'
    this.state = S.MENU
    this.lastTs = 0
    this.calibrated = false
    this.bindEvents()
    var self = this
    this.platform.onResize(function (size) { self.reconcile(size.width, size.height, size.dpr) })
    this.rafPending = false
    this._tickBound = this._tick.bind(this)
    if (this.platform.isWx && typeof wx !== 'undefined' && wx.onShow) wx.onShow(function () { self.schedule() })
    else if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () { if (!document.hidden) self.schedule() })
      global.addEventListener('focus', function () { self.schedule() })
    }
    this.schedule()
  }

  Main.prototype.schedule = function () {
    if (this.rafPending) return
    this.rafPending = true
    global.requestAnimationFrame(this._tickBound)
  }
  Main.prototype.reconcile = function (w, h, dpr) {
    if (dpr) this.dpr = dpr
    if (w === this.w && h === this.h) return
    this.w = w; this.h = h
    this.applySize(w, h)
    this.renderer.resize(w, h)
    this.level.resize(w, h)
    if (this.player) this.player.resize(w, h)
  }
  Main.prototype.applySize = function (w, h) {
    this.canvas.width = Math.round(w * this.dpr)
    this.canvas.height = Math.round(h * this.dpr)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }
  Main.prototype.bindEvents = function () {
    var self = this
    this.platform.bindPointer({
      down: function (p) { self.onPress(p) },
      move: function (p) { if (self.state === S.PLAYING && self.player) self.player.setTarget(p.x) },
      up: function () {}
    })
  }

  Main.prototype.onPress = function (p) {
    if (this.state === S.PLAYING) { this.player.setTarget(p.x); return }
    if (this.state === S.MENU) {
      if (inRect(p, this.renderer.buttonRect(0.72))) this.startLevel(0)
      return
    }
    if (this.state === S.WIN) {
      if (inRect(p, this.renderer.upgradeRect('attack'))) this.chooseUpgrade('attack')
      else if (inRect(p, this.renderer.upgradeRect('vitality'))) this.chooseUpgrade('vitality')
      return
    }
    if (this.state === S.CAMP) {
      for (var i = 0; i < this.talentOptions.length; i++) {
        if (inRect(p, this.renderer.talentRect(i))) { this.chooseTalent(this.talentOptions[i].id); return }
      }
      for (var j = 0; j < this.equipmentOptions.length; j++) {
        if (inRect(p, this.renderer.equipmentRect(j))) { this.buyEquipment(this.equipmentOptions[j].id); return }
      }
      if (inRect(p, this.renderer.buttonRect(0.76))) this.nextLevel()
      return
    }
    if (this.state === S.LOSE && inRect(p, this.renderer.buttonRect(0.66))) this.startLevel(this.level.levelIndex)
  }

  Main.prototype.saveCheckpoint = function () {
    this.checkpoint = { coins: this.coins, equipment: this.equipment.slice(), talents: this.talents.slice() }
  }

  Main.prototype.startLevel = function (idx) {
    var retry = this.state === S.LOSE
    if (this.state === S.MENU && idx === 0) {
      this.attackLevel = 0; this.vitalityLevel = 0; this.coins = 0
      this.equipment = []; this.talents = []; this.checkpoint = null
    }
    if (retry && this.checkpoint) {
      this.coins = this.checkpoint.coins
      this.equipment = this.checkpoint.equipment.slice()
      this.talents = this.checkpoint.talents.slice()
    }
    var data = this.level.load(idx)
    this.player = new CR.Entities.Player(this.w, this.h, data.start, {
      attackLevel: this.attackLevel, vitalityLevel: this.vitalityLevel,
      equipment: this.equipment, talents: this.talents
    })
    this.saveCheckpoint()
    this.fx.clear()
    this.loseReason = 'army'
    this.state = S.PLAYING
  }

  Main.prototype.chooseUpgrade = function (kind) {
    if (this.state !== S.WIN) return
    if (kind === 'attack') this.attackLevel++
    else if (kind === 'vitality') this.vitalityLevel++
    else return
    this.talentOptions = CR.Logic.talentChoices(this.level.levelIndex, this.talents)
    this.equipmentOptions = CR.Logic.equipmentOffers(this.equipment)
    this.talentChosen = this.talentOptions.length === 0
    this.state = S.CAMP
  }

  Main.prototype.chooseTalent = function (id) {
    if (this.state !== S.CAMP || this.talentChosen) return
    var valid = this.talentOptions.some(function (t) { return t.id === id })
    if (!valid) return
    this.talents.push(id)
    this.talentChosen = true
  }

  Main.prototype.buyEquipment = function (id) {
    if (this.state !== S.CAMP || this.equipment.indexOf(id) >= 0) return false
    var item = Content.equipmentById(id)
    var offered = this.equipmentOptions.some(function (e) { return e.id === id })
    if (!item || !offered || this.coins < item.cost) return false
    this.coins -= item.cost
    this.equipment.push(id)
    return true
  }

  Main.prototype.nextLevel = function () {
    if (this.state !== S.CAMP || !this.talentChosen) return
    this.startLevel(this.level.levelIndex + 1)
  }

  Main.prototype.emitCombatFx = function () {
    var enemies = this.level.liveEnemies()
    for (var i = 0; i < enemies.length; i++) {
      var it = enemies[i]
      if (!it._engaged || !(it._fxKills > 0)) continue
      var b = this.level.enemyBounds(it)
      var tx = this.level.projX(b.cx, it._proj.s)
      var ty = it._proj.sy - this.w * 0.05 * it._proj.s
      var sx = this.player.x + (Math.random() - 0.5) * this.w * 0.22
      var sy = this.level.groundY - this.w * 0.07
      var boneN = Math.max(1, Math.min(6, Math.round(it._fxKills * C.boneFxPerKill)))
      this.fx.addBullet(sx, sy, tx, ty, boneN)
    }
  }

  Main.prototype.handleEvents = function (events) {
    for (var i = 0; i < events.length; i++) {
      var e = events[i]
      if (e.coins > 0) {
        var gained = Math.max(1, Math.round(e.coins * (this.player.coinMultiplier || 1)))
        this.coins += gained
        this.fx.addFloat('+' + gained + '金币', this.player.x, this.level.groundY - 155, C.color.gold, false)
      }
      if (e.type === 'pickup') {
        this.player.addPulse()
        var ringColor = e.item.side === 'R' ? C.color.plaqueGold : C.color.playerLight
        this.fx.addRing(e.x, e.y, ringColor)
        this.fx.addFloat('+' + e.value, e.x, e.y - 30, ringColor, true)
      } else if (e.type === 'gate') {
        this.player.addPulse()
        this.fx.addRing(e.x, e.y, '#7dff9b')
        this.fx.addFloat('选择 ' + e.option.label + ' → ' + e.value + '兵', e.x, e.y - 35, '#b9ffc7', true, 1.6)
      } else if (e.type === 'troop') {
        this.fx.addRing(e.x, e.y, Content.unit(e.unitType).color)
        this.fx.addFloat('切换' + Content.unit(e.unitType).name, e.x, e.y - 35, Content.unit(e.unitType).color, true, 1.6)
      } else if (e.type === 'event') {
        this.fx.addBurst(e.x, e.y, C.color.gold, 18)
        this.fx.addFloat(Content.eventTypes[e.item.eventKind].label + ' · ' + e.outcome.text, e.x, e.y - 35, C.color.gold, true, 1.6)
      } else if (e.type === 'waveClear') {
        this.fx.addBurst(e.x, e.y, C.color.enemy, 24)
        this.fx.addFloat('全歼', e.x, e.y - 40, '#ffd9d9', true)
      } else if (e.type === 'generalDown') {
        this.fx.addBurst(e.x, e.y - this.w * 0.1, C.color.gold, 36)
        this.fx.addFloat(e.item.boss ? 'Boss击破' : '武将击破', this.player.x, this.level.groundY - 120, C.color.gold, true)
      } else if (e.type === 'enemySkill') {
        this.fx.addBurst(e.x, e.y, '#ff774d', 28)
        this.fx.addFloat('武将横扫', this.player.x, this.level.groundY - 190, '#ffad8a', true)
      } else if (e.type === 'bossPhase') {
        this.fx.addBurst(this.player.x, this.level.groundY - 90, '#ff3344', 40)
        this.fx.addFloat('Boss ' + e.phase + '阶段技！', this.player.x, this.level.groundY - 205, '#ff7b83', true)
      } else if (e.type === 'lose') {
        this.loseReason = e.reason || 'army'
        this.state = S.LOSE
      } else if (e.type === 'levelComplete') this.state = S.WIN
    }
  }

  Main.prototype.update = function (dt) {
    if (this.state !== S.PLAYING) { this.fx.update(dt); return }
    this.player.update(dt)
    var events = this.level.update(dt, this.player)
    this.emitCombatFx()
    this.handleEvents(events)
    this.fx.update(dt)
  }

  Main.prototype.render = function () {
    var r = this.renderer
    if (this.state === S.MENU) {
      r.background(0); r.panel()
      r.title('倍增兵团', this.h * 0.19, 0.125, C.color.gold)
      r.line('手动左右收兵 · 倍率门 · 兵种克制', this.h * 0.32, 0.041)
      r.line('武将技能 · Boss三阶段 · 随机事件', this.h * 0.38, 0.038)
      r.line('破军 / 护送 / 守城 / 限时 四关轮换', this.h * 0.44, 0.038)
      r.line('攻击体质成长 + 金币装备 + 天赋三选一', this.h * 0.50, 0.035, '#d8e5dc')
      r.line('全程单机，不自动收兵', this.h * 0.57, 0.032, '#aebbb1')
      r.button(r.buttonRect(0.72), '开始游戏')
      return
    }

    r.world(this.level, this.player, this.fx, this.coins)
    if (this.state === S.WIN) {
      r.panel()
      r.title('Boss击破！', this.h * 0.24, 0.105, C.color.gold)
      r.line('剩余兵力：' + Math.round(this.player.count) + ' · 金币：' + this.coins, this.h * 0.35, 0.045)
      r.line('先选一项永久成长，再进入战后营地', this.h * 0.44, 0.038, '#e9eee9')
      r.line('当前：攻击Lv.' + this.attackLevel + ' · 体质Lv.' + this.vitalityLevel, this.h * 0.50, 0.035, '#cfd6cf')
      r.upgradeButton(r.upgradeRect('attack'), '攻击强化', '子弹伤害 +25%', '#d89a22', '#a66c12')
      r.upgradeButton(r.upgradeRect('vitality'), '体质强化', '每兵生命 +1', '#258fda', '#1769a8')
    } else if (this.state === S.CAMP) {
      r.panel()
      r.title('战后营地', this.h * 0.12, 0.09, C.color.gold)
      r.line('金币 ' + this.coins + ' · 攻击Lv.' + this.attackLevel + ' · 体质Lv.' + this.vitalityLevel, this.h * 0.185, 0.036)
      r.line(this.talentChosen ? '天赋已选，可继续购买装备' : '天赋三选一', this.h * 0.25, 0.042)
      for (var i = 0; i < this.talentOptions.length; i++) {
        var t = this.talentOptions[i]
        r.campCard(r.talentRect(i), t.name, t.detail, this.talentChosen && this.talents.indexOf(t.id) >= 0 ? '已选择' : '', '#8b5cf6', '#5b3ca8')
      }
      r.line('金币装备（可选，不购买也能继续）', this.h * 0.46, 0.034, '#d8e5dc')
      for (var j = 0; j < this.equipmentOptions.length; j++) {
        var eq = this.equipmentOptions[j]
        var owned = this.equipment.indexOf(eq.id) >= 0
        r.campCard(r.equipmentRect(j), eq.name, eq.detail, owned ? '已装备' : eq.cost + '金币', '#c18b28', '#886016')
      }
      r.button(r.buttonRect(0.76), this.talentChosen ? '进入第 ' + (this.level.levelIndex + 2) + ' 关' : '请先选择天赋')
    } else if (this.state === S.LOSE) {
      r.panel()
      var title = this.loseReason === 'timeout' ? '时间耗尽' : (this.loseReason === 'escort' ? '粮车被毁' : '兵力打光了')
      var tip = this.loseReason === 'timeout' ? '多吃倍率门、选对克制兵种，加快击破' :
        (this.loseReason === 'escort' ? '尽快清掉近身敌军，别让粮车持续受损' : '左右多吃兵牌壮大兵力，再去群殴')
      r.title(title, this.h * 0.3, 0.1, '#ff8a8d')
      r.line(tip, this.h * 0.42, 0.04)
      r.line('重试保留此前成长，本关未结算奖励不保留', this.h * 0.49, 0.034, '#cfd6cf')
      r.button(r.buttonRect(0.66), '重新挑战')
    }
  }

  Main.prototype._tick = function (ts) {
    this.rafPending = false
    if (!this.calibrated) {
      this.calibrated = true
      var m = this.platform.measure()
      this.reconcile(m.width, m.height, m.dpr)
    }
    var now = ts || 0
    var dt = this.lastTs ? Math.min(0.05, (now - this.lastTs) / 1000) : 0
    this.lastTs = now
    this.update(dt)
    this.render()
    this.schedule()
  }

  CR.Main = Main
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis))
