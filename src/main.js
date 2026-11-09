(function (global) {
  var CR = (global.CR = global.CR || {})
  var C = CR.CONFIG
  var S = CR.STATE

  function inRect (p, r) {
    return p && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
  }

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
    this.talentChoice = []
    this.shopChoice = []
    this.talentSelected = ''
    this.checkpoint = null
    this.eventLog = []
    this.state = S.MENU
    this.lastTs = 0
    this.calibrated = false

    this.bindEvents()
    var self = this
    this.platform.onResize(function (size) { self.reconcile(size.width, size.height, size.dpr) })

    this.rafPending = false
    this._tickBound = this._tick.bind(this)
    if (this.platform.isWx && typeof wx !== 'undefined' && wx.onShow) {
      wx.onShow(function () { self.schedule() })
    } else if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) self.schedule()
      })
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
    this.w = w
    this.h = h
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
      move: function (p) {
        if (self.state === S.PLAYING && self.player) self.player.setTarget(p.x)
      },
      up: function () {}
    })
  }

  Main.prototype.onPress = function (p) {
    if (this.state === S.PLAYING) {
      this.player.setTarget(p.x)
      return
    }
    if (this.state === S.MENU) {
      if (inRect(p, this.renderer.buttonRect(0.66))) this.startLevel(0)
      return
    }
    if (this.state === S.WIN) {
      if (inRect(p, this.renderer.upgradeRect('attack'))) this.chooseUpgrade('attack')
      else if (inRect(p, this.renderer.upgradeRect('vitality'))) this.chooseUpgrade('vitality')
      return
    }
    if (this.state === S.CAMP) {
      for (var i = 0; i < this.talentChoice.length; i++) {
        if (inRect(p, this.renderer.campTalentRect(i))) { this.chooseTalent(i); return }
      }
      for (var j = 0; j < this.shopChoice.length; j++) {
        if (inRect(p, this.renderer.campShopRect(j))) { this.buyEquipment(j); return }
      }
      if (inRect(p, this.renderer.campNextRect())) this.nextLevel()
      return
    }
    if (this.state === S.LOSE) {
      if (inRect(p, this.renderer.buttonRect(0.66))) this.startLevel(this.level.levelIndex)
    }
  }

  Main.prototype.startLevel = function (idx) {
    var retrying = this.state === S.LOSE && this.checkpoint && this.checkpoint.levelIndex === idx
    if (retrying) {
      this.coins = this.checkpoint.coins
      this.equipment = this.checkpoint.equipment.slice()
      this.talents = this.checkpoint.talents.slice()
    } else if (this.state === S.MENU && idx === 0) {
      this.attackLevel = 0
      this.vitalityLevel = 0
      this.coins = 0
      this.equipment = []
      this.talents = []
    }
    this.checkpoint = { levelIndex: idx, coins: this.coins, equipment: this.equipment.slice(), talents: this.talents.slice() }
    var data = this.level.load(idx)
    data.escortHp = C.escortHp
    this.player = new CR.Entities.Player(this.w, this.h, data.start, {
      attackLevel: this.attackLevel,
      vitalityLevel: this.vitalityLevel,
      equipment: this.equipment,
      talents: this.talents
    })
    this.fx.clear()
    this.talentSelected = ''
    this.state = S.PLAYING
  }

  Main.prototype.chooseUpgrade = function (kind) {
    if (this.state !== S.WIN) return
    if (kind === 'attack') this.attackLevel++
    else if (kind === 'vitality') this.vitalityLevel++
    else return
    this.talentChoice = CR.Logic.talentChoices(this.level.levelIndex, this.talents)
    this.shopChoice = CR.Content.equipment.filter(function (e) { return this.equipment.indexOf(e.id) < 0 }, this).slice(0, 2)
    this.talentSelected = ''
    this.state = S.CAMP
  }

  Main.prototype.chooseTalent = function (idx) {
    if (this.state !== S.CAMP || this.talentSelected) return
    var talent = this.talentChoice[idx]
    if (!talent || this.talents.indexOf(talent.id) >= 0) return
    this.talents.push(talent.id)
    this.talentSelected = talent.id
  }

  Main.prototype.buyEquipment = function (idx) {
    if (this.state !== S.CAMP) return
    var item = this.shopChoice[idx]
    if (!item || this.equipment.indexOf(item.id) >= 0 || this.coins < item.cost) return
    this.coins -= item.cost
    this.equipment.push(item.id)
  }

  Main.prototype.nextLevel = function () {
    if (this.state !== S.CAMP || (!this.talentSelected && this.talentChoice.length)) return
    this.startLevel(this.level.levelIndex + 1)
  }

  // 持续交战：从我方阵线向敌人发射可见弹道子弹，子弹命中时才爆出碎骨
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
      this.eventLog.push({ type: e.type, reason: e.reason || '', phase: e.phase || 0, t: this.level.elapsed })
      if (e.coins) {
        var gain = Math.max(0, Math.round(e.coins * (this.player ? this.player.coinMultiplier : 1)))
        this.coins += gain
      }
      if (e.type === 'pickup') {
        this.player.addPulse()
        var ringColor = e.item.side === 'R' ? C.color.plaqueGold : C.color.playerLight
        this.fx.addRing(e.x, e.y, ringColor)
        this.fx.addFloat('+' + e.value, e.x, e.y - 30, ringColor, true)
      } else if (e.type === 'armyGate') {
        this.fx.addFloat(e.text, e.x, e.y - 30, C.color.gold, true)
      } else if (e.type === 'unitGate') {
        this.fx.addFloat(CR.Content.unitTypes[e.unitType].name, e.x, e.y - 30, CR.Content.unitTypes[e.unitType].color, true)
      } else if (e.type === 'randomEvent') {
        this.fx.addFloat(e.event.name + ' ' + e.event.desc, e.x, e.y - 30, C.color.gold, true)
      } else if (e.type === 'waveClear') {
        this.fx.addBurst(e.x, e.y, C.color.enemy, 24)
        this.fx.addFloat('全歼 +' + e.coins + '金币', e.x, e.y - 40, '#ffd9d9', true)
      } else if (e.type === 'generalDown') {
        this.fx.addBurst(e.x, e.y - this.w * 0.1, C.color.gold, 36)
        this.fx.addFloat('武将击破 +' + e.coins + '金币', this.player.x, this.level.groundY - 120, C.color.gold, true)
      } else if (e.type === 'generalSkill' || e.type === 'bossPhase') {
        this.fx.addRing(e.x, e.y, '#ff5b52')
        this.fx.addFloat(e.type === 'bossPhase' ? 'Boss阶段 ' + e.phase : '武将横扫', e.x, e.y - 60, '#ff8a8d', true)
        this.fx.shake = 8
      } else if (e.type === 'lose') {
        this.state = S.LOSE
      } else if (e.type === 'levelComplete') {
        this.state = S.WIN
      }
    }
  }

  Main.prototype.update = function (dt) {
    if (this.state !== S.PLAYING) {
      this.fx.update(dt)
      return
    }
    this.player.update(dt)
    var events = this.level.update(dt, this.player)
    this.emitCombatFx()
    this.handleEvents(events)
    this.fx.update(dt)
  }

  Main.prototype.render = function () {
    var r = this.renderer
    if (this.state === S.MENU) {
      r.background(0)
      r.panel()
      r.title('倍增兵团', this.h * 0.2, 0.115, C.color.gold)
      r.line('手动收兵 · 倍率门 · 兵种克制', this.h * 0.32, 0.041)
      r.line('护送 / 守城 / 限时 · 随机事件', this.h * 0.385, 0.036)
      r.line('武将技能与Boss三阶段', this.h * 0.445, 0.036)
      r.line('金币装备 · 天赋三选一 · 攻击体质成长', this.h * 0.505, 0.031, '#cfd6cf')
      r.button(r.buttonRect(0.66), '开始游戏')
      return
    }

    r.world(this.level, this.player, this.fx)

    if (this.state === S.WIN) {
      r.panel()
      r.title('Boss击破！', this.h * 0.26, 0.105, C.color.gold)
      r.line('剩余兵力：' + Math.round(this.player.count) + ' · 金币：' + this.coins, this.h * 0.36, 0.045)
      r.line('先选攻击或体质，再进入战后营地', this.h * 0.45, 0.036, '#e9eee9')
      r.line('当前：攻击Lv.' + this.attackLevel + ' · 体质Lv.' + this.vitalityLevel, this.h * 0.5, 0.035, '#cfd6cf')
      r.upgradeButton(r.upgradeRect('attack'), '攻击强化', '子弹伤害 +25%', '#d89a22', '#a66c12')
      r.upgradeButton(r.upgradeRect('vitality'), '体质强化', '每兵生命 +1', '#258fda', '#1769a8')
    } else if (this.state === S.CAMP) {
      r.camp(this)
    } else if (this.state === S.LOSE) {
      r.panel()
      r.title(this.level.data.mode === 'escort' && this.level.data.escortHp <= 0 ? '粮车被毁' : '兵力打光了', this.h * 0.3, 0.1, '#ff8a8d')
      r.line('手动选门与兵种，利用克制减少伤亡', this.h * 0.42, 0.04)
      r.line('重试恢复本关金币、装备和天赋检查点', this.h * 0.475, 0.032, '#cfd6cf')
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
