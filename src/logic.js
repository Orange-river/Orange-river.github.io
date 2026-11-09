/**
 * 纯逻辑层：不依赖画布/DOM/wx，可被 Node 直接 require 做单元测试。
 * 三国小小兵玩法：左右两路兵牌收编 + 红兵潮/武将持续群殴。
 * 战斗拆成独立的我方射击伤害与敌方近战伤害；关卡仿真和实战共用 battleStep。
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

  // 每级攻击让单发子弹伤害增加 25%，不改变射速
  function attackMultiplier (attackLevel, cfg) {
    cfg = cfg || CFG
    return 1 + Math.max(0, attackLevel || 0) * cfg.attackDamagePerUpgrade
  }

  function armyHp (army) {
    if (typeof army.hp === 'number') return army.hp
    return Math.max(0, army.count) * (army.hpPerUnit || 1)
  }

  // 收编同时增加人数和总生命；体质升级后，新兵也使用当前每兵生命
  function addArmyUnits (army, value) {
    if (typeof army.addUnits === 'function') { army.addUnits(value); return }
    army.count = Math.max(0, army.count + value)
    if (typeof army.hp === 'number') army.hp += value * (army.hpPerUnit || 1)
  }

  // 敌方伤害只扣总生命；人数由总生命÷每兵生命向上取整，避免小数十进制兵力
  function damageArmy (army, amount) {
    if (typeof army.takeDamage === 'function') { army.takeDamage(amount); return }
    if (typeof army.hp === 'number') {
      army.hp = Math.max(0, army.hp - amount)
      army.count = army.hp <= 0 ? 0 : Math.ceil(army.hp / (army.hpPerUnit || 1) - 1e-9)
    } else {
      army.count = Math.max(0, army.count - amount)
    }
  }

  /**
   * 单个战斗帧，仿真和实战唯一伤害入口。
   * 我方输出随人数、射速、攻击等级增长；敌方近战输出随“实际接敌对数”增长。
   * 关键：我方攻击越高不会反噬自己，大军伤亡也不再等于自己的射击伤害。
   */
  function battleStep (army, enemyHp, dt, melee, attackLevel, cfg) {
    cfg = cfg || CFG
    var count = Math.max(0, army.count)
    var damage = Math.min(enemyHp, count * cfg.fireRatePerUnit * attackMultiplier(attackLevel, cfg) * dt)
    var taken = 0
    if (melee && count > 0 && enemyHp > 0) {
      var engagedPairs = Math.min(count, enemyHp)
      taken = Math.min(armyHp(army), engagedPairs * cfg.enemyMeleeRatePerUnit * dt)
      damageArmy(army, taken)
    }
    return { damage: damage, taken: taken }
  }

  // 离散仿真一个战斗节点，使用与 Level.update 相同的远程→冲锋→近战顺序
  function simulateBattle (startCount, enemyHp, options) {
    options = options || {}
    var cfg = options.config || CFG
    var hpPerUnit = Math.max(1, options.hpPerUnit || 1)
    var army = { count: startCount, hpPerUnit: hpPerUnit, hp: startCount * hpPerUnit }
    var attackLevel = options.attackLevel || 0
    var distance = cfg.engageRange
    var melee = false
    var hp = enemyHp
    var dt = 1 / 120
    var steps = 0
    while (hp > 0 && army.hp > 0 && steps < 60000) {
      if (!melee) {
        distance -= cfg.enemyChargeSpeed * dt
        if (distance <= 0) melee = true
      }
      var result = battleStep(army, hp, dt, melee, attackLevel, cfg)
      hp = Math.max(0, hp - result.damage)
      steps++
    }
    return {
      won: hp <= 0 && army.hp > 0,
      count: army.count,
      hp: army.hp,
      lost: startCount - army.count,
      enemyHp: hp,
      steps: steps
    }
  }

  // 保留查询接口：返回一个节点的人数减员，实际公式由 simulateBattle 决定
  function battleLoss (player, hp, options) {
    return simulateBattle(player, hp, options).lost
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

  // 每关两波兵潮、两名武将；最后一名武将就是最终 Boss，阵亡即通关
  function nodeTemplate (levelIndex) {
    return [
      { type: 'wave', z: 1500, factor: 1.10 },
      { type: 'general', z: 2350, hpFactor: 1.20 },
      { type: 'wave', z: 3050, factor: 1.15 },
      { type: 'general', z: 3800, hpFactor: 1.35, boss: true }
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

    // 2) 逐节点设定强度并做可解性仿真，伤害公式与运行时完全一致
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
      var result = simulateBattle(sim, hp)
      sim = result.count
      if (!result.won || sim <= 0) { sim = 0; solvable = false; break }
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
    attackMultiplier: attackMultiplier,
    armyHp: armyHp,
    addArmyUnits: addArmyUnits,
    damageArmy: damageArmy,
    battleStep: battleStep,
    simulateBattle: simulateBattle,
    battleLoss: battleLoss,
    formationOffsets: formationOffsets,
    buildLevel: buildLevel,
    generateLevel: generateLevel
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = CR.Logic
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis))
