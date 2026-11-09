(function (global) {
  var CR = (global.CR = global.CR || {})

  CR.STATE = { MENU: 'menu', PLAYING: 'playing', WIN: 'win', LOSE: 'lose', CAMP: 'camp' }

  CR.CONFIG = {
    startCount: 18,
    baseSpeed: 185,
    speedGrowthPerLevel: 3.2,
    maxSpeed: 215,
    playerSpeedRatio: 3.6,
    playerMinRatio: 0.1,
    playerMaxRatio: 0.9,

    // 左右两条收编通道：左边连续+1兵墙，右边高值兵牌；贴边才收编
    leftValue: 1,
    rightBigValues: [10, 15, 20, 30],
    pickupSpacing: 112,
    pickupFirstZ: 560,
    pickupCollectDz: 100,
    pickupSideRatio: 0.27,

    // 战斗：持续射击 + 近身群殴，不再是碰到即死或一碰结算
    engageRange: 380,
    contactRange: 145,
    enemyChargeSpeed: 240,
    fireRatePerUnit: 0.6,
    enemyMeleeRatePerUnit: 0.8,
    attackDamagePerUpgrade: 0.25,
    hpPerVitalityUpgrade: 1,
    counterAdvantage: 1.35,
    counterDisadvantage: 0.8,
    generalSkillPeriod: 7,
    generalSkillRatio: 0.08,
    bossPhaseSkillRatio: 0.06,
    bossPhaseRate: [1, 1.25, 1.5],
    escortHp: 100,
    escortDamageScale: 0.35,
    timedSeconds: 120,
    defendPrepZ: 3600,
    waveCoin: 10,
    generalCoin: 25,
    bossCoin: 50,
    armyGateSides: [
      { op: 'mul', value: 2, label: '兵力 ×2' },
      { op: 'add', value: 25, label: '兵力 +25' }
    ],
    unitGateTypes: ['shield', 'archer', 'cavalry'],
    bulletSpeed: 1000,
    boneFxPerKill: 0.75,

    // 伪3D透视
    horizonRatio: 0.22,
    playerLineRatio: 0.84,
    perspectiveK: 300,
    viewFar: 2600,

    // 人群与美术
    unitRadiusRatio: 0.018,
    unitSpacingRatio: 0.04,
    formationDepthRatio: 0.4,
    enemyUnitRatio: 0.014,
    waveColsRatio: 0.72,
    maxDrawnUnits: 140,
    generalScale: 3.6,
    cameraShakePerKill: 0.015,

    color: {
      skyTop: '#a8e3df',
      skyBottom: '#e9f2cf',
      canyonDark: '#176e5c',
      canyon: '#2fae85',
      canyonLight: '#79d9a4',
      crystal: '#c1ffd4',
      sand: '#e8c98d',
      sandLight: '#f7e3b5',
      sandDark: '#cda96c',
      roadEdge: '#b58c54',
      player: '#1877e8',
      playerLight: '#5dc4ff',
      playerDark: '#0a3d92',
      enemy: '#e23d46',
      enemyLight: '#ff8178',
      enemyDark: '#8e1528',
      gold: '#ffd257',
      goldDark: '#b97914',
      plaqueBlue: '#2196f3',
      plaqueGold: '#ffb61e',
      bone: '#f4f0df',
      smoke: '#9a8f7a',
      text: '#fffdf2',
      ink: '#26332f',
      panel: 'rgba(21, 39, 34, 0.84)'
    }
  }
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis))
