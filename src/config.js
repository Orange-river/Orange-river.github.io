/**
 * 全局常量与配色、数值平衡配置（三国小小兵风格：三路收兵 + 持续群殴武将）。
 * 布局以屏幕宽高比例表示，实际像素在运行时按设备尺寸换算，保证不同机型一致。
 */
(function (global) {
  var CR = (global.CR = global.CR || {})

  CR.CONFIG = {
    // 跑道两侧留白（占屏宽比例）
    trackMarginRatio: 0.07,
    // 2.5D 透视：地平线高度、玩家脚下位置（均占屏高比例）
    horizonRatio: 0.07,
    playerLineRatio: 0.86,
    // 透视收敛系数：越大越平缓（纵深拉伸），越小远处收得越快
    perspectiveK: 620,
    // 阵型纵深间距（占屏宽比例），让队伍在前后铺开成有厚度的盘
    formationDepthGapRatio: 0.030,
    // 最大可见纵深：只看到前方一段，远处交给雾，避免整关被压扁
    viewFar: 1700,
    // 前进基础速度（逻辑像素/秒），刻意放慢让玩家看清兵牌与敌军
    baseSpeed: 185,
    speedGrowthPerLevel: 7,
    maxSpeed: 290,

    // 兵牌（左右两路可收编的小兵石碑）
    pickupSpacing: 150,       // 同侧相邻兵牌的纵深间隔
    pickupFirstZ: 520,        // 第一块兵牌的纵深
    pickupCollectDz: 150,     // 兵牌进入玩家线前后多少纵深内可被收集
    pickupSideRatio: 0.40,    // 队伍中心越过该横向比例即算作贴到对应侧边
    gateSideRatio: 0.40,      // 倍率/兵种门必须明确选边，居中不会自动生效
    leftValue: 1,             // 左侧蓝色兵牌：稳定 +1
    rightBigValues: [10, 15, 20, 30], // 右侧黄色兵牌：高值补给

    // 战斗：我方远程射击与敌方近战伤害独立计算
    engageRange: 380,         // 敌军进入玩家线前多少纵深即驻足交战
    fireRatePerUnit: 0.6,     // 每个我方小兵每秒发射的子弹数（远程阶段无损杀伤）
    enemyChargeSpeed: 240,    // 敌兵向玩家阵线冲锋的速度（逻辑像素/秒）
    enemyMeleeRatePerUnit: 0.8, // 每个实际接敌敌兵每秒造成的伤害，受双方接敌对数限制
    bulletSpeed: 1000,        // 子弹飞行速度（屏幕像素/秒，纯视觉）
    boneFxPerKill: 0.9,       // 每点射击伤害生成多少碎骨特效（节流控性能）

    // 局间成长：每关通关后免费二选一，并立即带入下一关
    attackDamagePerUpgrade: 0.25, // 每级攻击 +25% 单发子弹伤害
    hpPerVitalityUpgrade: 1,      // 每级体质让每名小兵 +1 生命

    // 扩展战斗：循环克制、武将技能与Boss三阶段（设计初值）
    counterAdvantage: 1.35,
    counterDisadvantage: 0.8,
    generalSkillInterval: 7,
    generalSkillHpRatio: 0.08,
    bossPhaseSkillRatio: 0.06,
    bossPhaseRate: [1, 1.25, 1.5],

    // 关卡模式与单机金币经济
    modeTimeLimit: 120,
    escortMaxHp: 100,
    escortDamageFactor: 0.35,
    waveCoinReward: 10,
    generalCoinReward: 25,
    bossCoinReward: 50,
    gateMultiplier: 2,
    gateAddition: 25,

    // 人群
    startCount: 18,          // 初始兵力
    maxDrawnUnits: 140,      // 单队最多绘制的小人数量，超出靠头顶数字体现（控性能）
    unitRadiusRatio: 0.020,  // 单个小人半径相对屏宽
    formationGapRatio: 0.038,// 小人阵型横向间距相对屏宽
    enemyUnitRatio: 0.015,   // 红兵潮里单个小人更小，以便铺出“人潮”密度
    waveColsRatio: 0.74,     // 红兵潮铺满的通道宽度比例

    // 颜色（翡翠峡谷 + 黄沙道 + 红蓝对抗）
    color: {
      skyTop: '#e9d9a8',
      skyBottom: '#dcc186',
      // 翡翠水晶峡谷壁
      jadeLight: '#16b58d',
      jade: '#0e8f6e',
      jadeDark: '#0a6b53',
      jadeShine: 'rgba(150,255,224,0.35)',
      // 黄沙赛道
      track: '#d8b577',
      trackEdge: '#c2985c',
      trackWall: '#a87f49',
      trackLine: 'rgba(120,84,40,0.22)',
      fog: 'rgba(238,224,180,0.5)',
      // 玩家蓝兵
      player: '#2f9bff',
      playerLight: '#7fc4ff',
      playerDark: '#1c7fe0',
      playerSkin: '#ffd9b3',
      // 敌军红兵
      enemy: '#ff4447',
      enemyLight: '#ff8587',
      enemyDark: '#d92f32',
      enemySkin: '#ffd2a8',
      // 兵牌
      plaqueBlue: '#2f7dff',
      plaqueBlueDark: '#1c5fd0',
      plaqueGold: '#ffd21f',
      plaqueGoldDark: '#e0a800',
      plaqueTextDark: '#5a3d00',
      // 武将
      generalRobe: '#b02733',
      generalRobeDark: '#831a24',
      generalFur: '#7d3c98',
      generalBeard: '#241b1b',
      generalSkin: '#f2c39b',
      generalHp: '#ff4d55',
      // 城堡 / HUD
      castle: '#9a8f7d',
      castleDark: '#746a5b',
      hudText: '#ffffff',
      hudShadow: 'rgba(0,0,0,0.4)',
      panel: 'rgba(20,26,22,0.8)',
      button: '#22b573',
      buttonDark: '#178f59',
      gold: '#ffd34d',
      bone: '#f4f2ea',
      smoke: 'rgba(170,158,138,0.55)'
    }
  }

  // 游戏状态机枚举
  CR.STATE = {
    MENU: 'menu',
    PLAYING: 'playing',
    WIN: 'win',
    CAMP: 'camp',
    LOSE: 'lose'
  }
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis))
