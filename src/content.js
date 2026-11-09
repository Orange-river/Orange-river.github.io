/**
 * 玩法内容表：兵种、关卡模式、随机事件、装备与天赋。
 * 只包含静态定义，战斗公式与结算仍集中在 logic.js / level.js。
 */
(function (global) {
  var CR = (global.CR = global.CR || {})

  CR.Content = {
    unitTypes: {
      shield: { name: '刀盾兵', short: '盾', strongAgainst: 'cavalry', color: '#45a5ff' },
      archer: { name: '弓手', short: '弓', strongAgainst: 'shield', color: '#45d68a' },
      cavalry: { name: '骑兵', short: '骑', strongAgainst: 'archer', color: '#ffbd45' }
    },

    modes: [
      { id: 'standard', name: '破军', objective: '击破最终Boss' },
      { id: 'escort', name: '护送', objective: '粮车存活并击破Boss' },
      { id: 'defend', name: '守城', objective: '原地抵御四轮进攻' },
      { id: 'timed', name: '限时', objective: '倒计时结束前击破Boss' }
    ],

    eventTypes: {
      cache: { name: '金币宝箱', label: '宝箱', detail: '+40金币' },
      reinforce: { name: '义军来投', label: '援军', detail: '+12兵力' },
      ambush: { name: '伏击夺金', label: '伏击', detail: '+60金币 / 损6兵' }
    },

    equipment: [
      { id: 'blade', name: '青龙刀', cost: 60, detail: '全队伤害 +20%' },
      { id: 'armor', name: '明光铠', cost: 60, detail: '每兵生命 +1' },
      { id: 'bag', name: '行军囊', cost: 40, detail: '收编兵力 +20%' }
    ],

    talents: [
      { id: 'rapid', name: '连射', detail: '射速 +20%' },
      { id: 'ironwall', name: '铁壁', detail: '受到伤害 -15%' },
      { id: 'berserk', name: '破阵', detail: '全队伤害 +15%' },
      { id: 'medic', name: '强健', detail: '每兵生命 +2' },
      { id: 'lucky', name: '掠夺', detail: '金币获取 +50%' },
      { id: 'recruiter', name: '号令', detail: '收编兵力 +25%' }
    ]
  }

  CR.Content.modeForLevel = function (levelIndex) {
    return this.modes[Math.abs(levelIndex || 0) % this.modes.length]
  }

  CR.Content.unit = function (id) { return this.unitTypes[id] || this.unitTypes.shield }
  CR.Content.equipmentById = function (id) {
    return this.equipment.filter(function (it) { return it.id === id })[0] || null
  }
  CR.Content.talentById = function (id) {
    return this.talents.filter(function (it) { return it.id === id })[0] || null
  }
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis))
