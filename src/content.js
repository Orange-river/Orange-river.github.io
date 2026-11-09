(function (global) {
  var CR = (global.CR = global.CR || {})
  CR.Content = {
    unitTypes: {
      shield: { name: '刀盾兵', color: '#46a8f2', counter: 'cavalry' },
      archer: { name: '弓手', color: '#e8b94f', counter: 'shield' },
      cavalry: { name: '骑兵', color: '#66d6a3', counter: 'archer' }
    },
    modes: [
      { id: 'standard', name: '破军', desc: '击破最终Boss' },
      { id: 'escort', name: '护送', desc: '保护粮车抵达并击破Boss' },
      { id: 'defend', name: '守城', desc: '原地布防，连续迎敌' },
      { id: 'timed', name: '限时', desc: '倒计时内击破Boss' }
    ],
    events: [
      { id: 'chest', name: '宝箱', desc: '+40金币', coins: 40 },
      { id: 'reinforce', name: '义军', desc: '+12兵力', units: 12 },
      { id: 'ambush', name: '伏击', desc: '+60金币 / -6兵', coins: 60, units: -6 }
    ],
    equipment: [
      { id: 'blade', name: '青龙刀', cost: 60, desc: '全队伤害 +20%', damage: 0.2 },
      { id: 'armor', name: '明光铠', cost: 60, desc: '每兵生命 +1', hp: 1 },
      { id: 'bag', name: '行军囊', cost: 40, desc: '收编兵力 +20%', recruit: 0.2 }
    ],
    talents: [
      { id: 'rapid', name: '连射', desc: '射速 +20%', fireRate: 0.2 },
      { id: 'ironwall', name: '铁壁', desc: '受伤 -15%', incoming: -0.15 },
      { id: 'berserk', name: '破阵', desc: '伤害 +15%', damage: 0.15 },
      { id: 'medic', name: '强健', desc: '每兵生命 +2', hp: 2 },
      { id: 'lucky', name: '掠夺', desc: '金币 +50%', coins: 0.5 },
      { id: 'recruiter', name: '号令', desc: '收编 +25%', recruit: 0.25 }
    ]
  }
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis))
