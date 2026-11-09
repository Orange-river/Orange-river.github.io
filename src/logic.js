/**
 * 纯逻辑层：不依赖画布/DOM/wx，可被 Node 直接 require 做单元测试。
 * 三国小小兵玩法：左右两路兵牌收编 + 红兵潮/武将持续群殴。
 * 战斗公式为纯函数，关卡生成时的“可解性仿真”与运行时实战调用同一套公式，
 * 从根上保证：吃满兵牌的最优路线一定能通关，漏吃太多才会失败。
 */
(function (global) {
  var CR = (global.CR = global.CR || {})
  var CFG = CR.CONFIG

  function clamp (v, min, max) {
    return v < min ? min : (v > max ? max : v)
  }

  // 可复现的种子随机（mulberry32），同一关卡序号生成稳定布局
  function mulberry32 (seed) {
    var a = seed >>> 0
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0
      var t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  function randRange (rng, min, max) { return min + rng() * (max - min) }
  function pick (rng, arr) { return arr[Math.floor(rng() * arr.length)] }

  function applyGate (count, option) {
    var c = count
    if (option.op === '*') c = c * option.value
    else if (option.op === '+') c = c + option.value
    else if (option.op === '-') c = c - option.value
    return Math.max(0, Math.round(c))
  }

  function gateLabel (option) {
    if (option.op === '*') return '×' + option.value
    if (option.op === '-') return '−' + option.value
    return '+' + option.value
  }

  /**
   * 交战收益系数 K：驻足交战时，敌人从交战纵深冲到阵线所需时间 T=engageRange/enemyChargeSpeed，
   * 我方每个小兵在 T 内能发射 fireRatePerUnit*T 发子弹（每发消灭1点敌血，远程阶段无损）。
   * K 越大我方越强。与运行时实战共用同一套“远程免费 + 近身1:1”模型。
   */
  function combatK (cfg) {
    cfg = cfg || CFG
    return cfg.fireRatePerUnit * cfg.engageRange / cfg.enemyChargeSpeed
  }

  /**
   * 一个战斗节点我方的总减员（闭式）：
   * 远程阶段我方免费杀伤 player*K 点敌血；剩余敌人冲到阵线后进入近身 1:1 抵消，
   * 近身阶段我方每造成1点伤害损失1兵。故 playerLost = max(0, hp - player*K)。
   * 敌人被全歼（hp 清零）时我方恰好损失该值；若我方先清零则失败。
   */
  function battleLoss (player, hp, K) {
    return Math.max(0, hp - player * K)
  }

  /**
   * 人群阵型的 3D 偏移（以队伍中心为原点）：dx 横向、dz 纵深。
   * 最近一排 dz=0（前排），往后逐排增大，透视投影后形成近大远小、有厚度的盘。
   */
  function formationOffsets (drawN, gapX, gapZ) {
    var out = []
    if (drawN <= 0) return out
    var cols = Math.round(clamp(Math.sqrt(drawN) * 1.2, 4, 12))
    var rows = Math.ceil(drawN / cols)
    var n = 0
    for (var r = 0; r < rows && n < drawN; r++) {
      var inThisRow = Math.min(cols, drawN - n)
      var rowWidth = (inThisRow - 1) * gapX
      var dz = (rows - 1 - r) * gapZ
      for (var c = 0; c < inThisRow; c++) {
        out.push({ dx: -rowWidth / 2 + c * gapX, dz: dz })
        n++
      }
    }
    return out
  }

  // 战斗节点模板（纵深位置 + 难度系数）。factor/hpFactor 表示敌人血量相对“抵达时我方兵力”的倍数。
  // > K 的部分会进入近身 1:1 抵消，所以系数越高我方战损越大；< 1+K 保证满编可解。
  function nodeTemplate (levelIndex) {
    return [
      { type: 'wave', z: 1500, factor: 1.10 },
      { type: 'general', z: 2350, hpFactor: 1.20 },
      { type: 'wave', z: 3050, factor: 1.15 },
      { type: 'general', z: 3800, hpFactor: 1.35 }
    ]
  }

  /**
   * 按给定难度缩放生成一关，并离散仿真“吃满全部兵牌”的最优路线是否可解。
   * scale 在重试时逐次下调，直到最优路线确认能通关。
   */
  function buildLevel (levelIndex, scale) {
    var rng = mulberry32(20261106 + levelIndex * 9973)
    var start = CFG.startCount + Math.min(levelIndex, 6) * 3
    var castleZ = 4350
    var items = []

    // 1) 左右两路连续兵牌：每 4 块里前 3 块蓝 +1、第 4 块黄色高值，逼玩家左右移动
    var z = CFG.pickupFirstZ
    var idx = 0
    var pickups = []
    while (z < castleZ - 280) {
      var isRight = (idx % 4 === 3)
      var value = isRight ? CFG.rightBigValues[idx % CFG.rightBigValues.length] : CFG.leftValue
      var pk = {
        type: 'pickup', z: Math.round(z), side: isRight ? 'R' : 'L',
        op: '+', value: value, label: '+' + value, _done: false
      }
      pickups.push(pk)
      z += CFG.pickupSpacing
      idx++
    }

    // 2) 逐节点设定强度并做可解性仿真（前向实际兵力模型）
    // 敌人血量 = 抵达时我方兵力 × 系数；战斗用 combatK/battleLoss 闭式结算，
    // 与运行时“远程免费 + 近身1:1”同源。难度随关卡温和增长并封顶。
    var K = combatK(CFG)
    var diff = clamp((1 + levelIndex * 0.05), 1, 1.3) * scale
    var nodes = nodeTemplate(levelIndex)
    var sim = start
    var pi = 0
    var solvable = true
    for (var ni = 0; ni < nodes.length; ni++) {
      var nd = nodes[ni]
      // 只计入交战开始前能收到的兵牌：进入交战纵深即驻足群殴，前方 engageRange 内的牌本节点收不到
      while (pi < pickups.length && pickups[pi].z <= nd.z - CFG.engageRange) { sim += pickups[pi].value; pi++ }
      var hp
      if (nd.type === 'wave') {
        nd.count = Math.max(4, Math.round(sim * nd.factor * diff))
        nd.centerRatio = 0.5
        nd.widthRatio = CFG.waveColsRatio
        hp = nd.count
      } else {
        nd.hp = Math.max(20, Math.round(sim * nd.hpFactor * diff))
        nd.maxHp = nd.hp
        nd.centerRatio = 0.5
        nd.widthRatio = 0.5
        hp = nd.hp
      }
      sim = sim - battleLoss(sim, hp, K)   // 该节点战后剩余，作为下一节点的兵力基础
      if (sim <= 0.5) { sim = 0; solvable = false; break }
    }

    // 3) 合并并按纵深排序
    items = pickups.concat(nodes)
    items.push({ type: 'castle', z: castleZ })
    items.sort(function (a, b) { return a.z - b.z })

    return {
      level: levelIndex,
      start: start,
      length: castleZ,
      items: items,
      bestPossible: Math.round(sim),
      solvable: solvable
    }
  }

  // 逐档下调难度直到最优路线可解（正常首轮即过，重试只是兜底）
  function generateLevel (levelIndex) {
    var scale = 1
    var data = buildLevel(levelIndex, scale)
    var tries = 0
    while (!data.solvable && tries < 8) {
      scale *= 0.8
      data = buildLevel(levelIndex, scale)
      tries++
    }
    return data
  }

  CR.Logic = {
    clamp: clamp,
    mulberry32: mulberry32,
    randRange: randRange,
    pick: pick,
    applyGate: applyGate,
    gateLabel: gateLabel,
    combatK: combatK,
    battleLoss: battleLoss,
    formationOffsets: formationOffsets,
    buildLevel: buildLevel,
    generateLevel: generateLevel
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = CR.Logic
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis))
