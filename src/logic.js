/**
 * 纯逻辑层：不依赖画布/DOM/wx，可被 Node 直接 require 做单元测试。
 * 仿真与实战共用战斗公式；倍率门、兵种克制、装备、天赋和随机事件均可复现。
 */
(function (global) {
  var CR = (global.CR = global.CR || {})
  var CFG = CR.CONFIG
  var Content = CR.Content

  function clamp (v, min, max) { return v < min ? min : (v > max ? max : v) }

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

  function attackMultiplier (attackLevel, cfg) {
    cfg = cfg || CFG
    return 1 + Math.max(0, attackLevel || 0) * cfg.attackDamagePerUpgrade
  }

  function armyHp (army) {
    if (typeof army.hp === 'number') return army.hp
    return Math.max(0, army.count) * (army.hpPerUnit || 1)
  }

  function addArmyUnits (army, value) {
    value = Math.max(0, Math.round(value))
    if (typeof army.addUnits === 'function') { army.addUnits(value); return }
    army.count = Math.max(0, army.count + value)
    if (typeof army.hp === 'number') army.hp += value * (army.hpPerUnit || 1)
  }

  function damageArmy (army, amount) {
    amount = Math.max(0, amount)
    if (typeof army.takeDamage === 'function') { army.takeDamage(amount); return }
    if (typeof army.hp === 'number') {
      army.hp = Math.max(0, army.hp - amount)
      army.count = army.hp <= 0 ? 0 : Math.ceil(army.hp / (army.hpPerUnit || 1) - 1e-9)
    } else army.count = Math.max(0, army.count - amount)
  }

  // 倍率或减法先换算成人数差，再同步总生命；同一道门只应由运行时调用一次
  function applyArmyGate (army, option) {
    var before = Math.max(0, army.count)
    var after = applyGate(before, option)
    var delta = after - before
    if (delta > 0) addArmyUnits(army, delta)
    else if (delta < 0) damageArmy(army, -delta * (army.hpPerUnit || 1))
    return after
  }

  // 刀盾克骑兵、骑兵克弓手、弓手克刀盾；同兵种与未知兵种均为1倍
  function unitCounter (attacker, defender, cfg) {
    cfg = cfg || CFG
    if (!attacker || !defender || attacker === defender) return 1
    var a = Content.unit(attacker)
    if (a.strongAgainst === defender) return cfg.counterAdvantage
    var d = Content.unit(defender)
    if (d.strongAgainst === attacker) return cfg.counterDisadvantage
    return 1
  }

  // 装备与天赋统一折算为战斗/经济修正，玩家实体与测试共用
  function buildModifiers (upgrades) {
    upgrades = upgrades || {}
    var equipment = upgrades.equipment || []
    var talents = upgrades.talents || []
    var mods = { damage: 1, fireRate: 1, incoming: 1, coin: 1, recruit: 1, hpBonus: 0 }
    if (equipment.indexOf('blade') >= 0) mods.damage *= 1.2
    if (equipment.indexOf('armor') >= 0) mods.hpBonus += 1
    if (equipment.indexOf('bag') >= 0) mods.recruit *= 1.2
    if (talents.indexOf('rapid') >= 0) mods.fireRate *= 1.2
    if (talents.indexOf('ironwall') >= 0) mods.incoming *= 0.85
    if (talents.indexOf('berserk') >= 0) mods.damage *= 1.15
    if (talents.indexOf('medic') >= 0) mods.hpBonus += 2
    if (talents.indexOf('lucky') >= 0) mods.coin *= 1.5
    if (talents.indexOf('recruiter') >= 0) mods.recruit *= 1.25
    return mods
  }

  /**
   * 单个战斗帧。第七个参数为可选修正：兵种、装备、天赋与敌方技能攻速。
   * 我方输出与敌方近战伤害仍完全独立，提高攻击不会反噬自身。
   */
  function battleStep (army, enemyHp, dt, melee, attackLevel, cfg, mods) {
    cfg = cfg || CFG
    mods = mods || {}
    var count = Math.max(0, army.count)
    var outgoingCounter = unitCounter(mods.playerType, mods.enemyType, cfg)
    var damage = Math.min(enemyHp,
      count * cfg.fireRatePerUnit * (mods.fireRate || 1) * attackMultiplier(attackLevel, cfg) *
      (mods.damage || 1) * outgoingCounter * dt)
    var taken = 0
    if (melee && count > 0 && enemyHp > 0) {
      var engagedPairs = Math.min(count, enemyHp)
      var incomingCounter = unitCounter(mods.enemyType, mods.playerType, cfg)
      taken = Math.min(armyHp(army), engagedPairs * cfg.enemyMeleeRatePerUnit *
        (mods.enemyRate || 1) * (mods.incoming || 1) * incomingCounter * dt)
      damageArmy(army, taken)
    }
    return { damage: damage, taken: taken }
  }

  // 离散仿真一个战斗节点，包含武将横扫、狂暴与Boss阶段技
  function simulateBattle (startCount, enemyHp, options) {
    options = options || {}
    var cfg = options.config || CFG
    var hpPerUnit = Math.max(1, options.hpPerUnit || 1)
    var army = { count: startCount, hpPerUnit: hpPerUnit, hp: options.startHp == null ? startCount * hpPerUnit : options.startHp }
    var attackLevel = options.attackLevel || 0
    var distance = cfg.engageRange
    var melee = false
    var hp = enemyHp
    var maxHp = Math.max(1, options.maxHp || enemyHp)
    var phase = 1
    var skillClock = 0
    var dt = 1 / 120
    var steps = 0
    var baseMods = options.modifiers || buildModifiers(options.upgrades)
    while (hp > 0 && army.hp > 0 && steps < 60000) {
      if (!melee) {
        distance -= cfg.enemyChargeSpeed * dt
        if (distance <= 0) melee = true
      }
      var enemyRate = 1
      if (options.skill === 'rage' && hp <= maxHp * 0.5) enemyRate *= 1.5
      if (options.boss) enemyRate *= cfg.bossPhaseRate[phase - 1]
      var mods = {
        playerType: options.playerType || 'shield', enemyType: options.enemyType || 'shield',
        damage: baseMods.damage, fireRate: baseMods.fireRate, incoming: baseMods.incoming,
        enemyRate: enemyRate
      }
      var result = battleStep(army, hp, dt, melee, attackLevel, cfg, mods)
      hp = Math.max(0, hp - result.damage)
      if (options.boss && hp > 0) {
        var targetPhase = hp <= maxHp * 0.33 ? 3 : (hp <= maxHp * 0.66 ? 2 : 1)
        while (phase < targetPhase && army.hp > 0) {
          phase++
          damageArmy(army, Math.max(1, armyHp(army) * cfg.bossPhaseSkillRatio))
        }
      }
      if (options.skill === 'sweep' && hp > 0 && army.hp > 0) {
        skillClock += dt
        if (skillClock >= cfg.generalSkillInterval) {
          skillClock -= cfg.generalSkillInterval
          damageArmy(army, Math.max(1, armyHp(army) * cfg.generalSkillHpRatio))
        }
      }
      steps++
    }
    return { won: hp <= 0 && army.hp > 0, count: army.count, hp: army.hp,
      lost: startCount - army.count, enemyHp: hp, steps: steps, phase: phase }
  }

  function battleLoss (player, hp, options) { return simulateBattle(player, hp, options).lost }

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

  function nodeTemplate () {
    return [
      { type: 'wave', z: 1500, factor: 1.10 },
      { type: 'general', z: 2350, hpFactor: 1.20, skill: 'sweep' },
      { type: 'wave', z: 3050, factor: 1.15 },
      { type: 'general', z: 3800, hpFactor: 1.35, boss: true, skill: 'rage' }
    ]
  }

  function makeSupportItems (levelIndex, rng) {
    var gates = [
      { type: 'gate', z: 950, left: { op: '*', value: CFG.gateMultiplier, label: '×' + CFG.gateMultiplier },
        right: { op: '+', value: CFG.gateAddition, label: '+' + CFG.gateAddition }, _done: false },
      { type: 'gate', z: 2700, left: { op: '*', value: CFG.gateMultiplier, label: '×' + CFG.gateMultiplier },
        right: { op: '+', value: CFG.gateAddition, label: '+' + CFG.gateAddition }, _done: false }
    ]
    var troopGates = [
      { type: 'troopGate', z: 1200, left: 'shield', right: 'archer', _done: false },
      { type: 'troopGate', z: 3250, left: 'cavalry', right: 'shield', _done: false }
    ]
    var kinds = ['cache', 'reinforce', 'ambush']
    var events = [1850, 3420].map(function (z, i) {
      var kind = kinds[Math.floor(rng() * kinds.length)]
      return { type: 'event', z: z, side: (levelIndex + i) % 2 ? 'R' : 'L', eventKind: kind, _done: false }
    })
    return gates.concat(troopGates, events)
  }

  /** 生成一关并用“全收兵牌 + 更优门选项 + 更优兵种”验证一条可通路线。 */
  function buildLevel (levelIndex, scale) {
    var rng = mulberry32(20261106 + levelIndex * 9973)
    var start = CFG.startCount + Math.min(levelIndex, 6) * 3
    var castleZ = 4350
    var pickups = []
    var z = CFG.pickupFirstZ
    var idx = 0
    while (z < castleZ - 280) {
      var isRight = idx % 4 === 3
      var value = isRight ? CFG.rightBigValues[idx % CFG.rightBigValues.length] : CFG.leftValue
      pickups.push({ type: 'pickup', z: Math.round(z), side: isRight ? 'R' : 'L',
        op: '+', value: value, label: '+' + value, _done: false })
      z += CFG.pickupSpacing
      idx++
    }

    var support = makeSupportItems(levelIndex, rng).concat(pickups).sort(function (a, b) { return a.z - b.z })
    var diff = clamp(1 + levelIndex * 0.05, 1, 1.3) * scale
    var nodes = nodeTemplate()
    var simArmy = { count: start, hpPerUnit: 1, hp: start }
    var simType = 'shield'
    var si = 0
    var solvable = true
    var unitCycle = ['cavalry', 'shield', 'archer', 'cavalry']

    for (var ni = 0; ni < nodes.length; ni++) {
      var nd = nodes[ni]
      nd.unitType = unitCycle[(levelIndex + ni) % unitCycle.length]
      while (si < support.length && support[si].z <= nd.z - CFG.engageRange) {
        var sp = support[si]
        if (sp.type === 'pickup') addArmyUnits(simArmy, sp.value)
        else if (sp.type === 'gate') {
          var leftCount = applyGate(simArmy.count, sp.left)
          var rightCount = applyGate(simArmy.count, sp.right)
          applyArmyGate(simArmy, leftCount >= rightCount ? sp.left : sp.right)
        } else if (sp.type === 'troopGate') {
          var leftScore = unitCounter(sp.left, nd.unitType)
          var rightScore = unitCounter(sp.right, nd.unitType)
          var stayScore = unitCounter(simType, nd.unitType)
          if (leftScore >= rightScore && leftScore >= stayScore) simType = sp.left
          else if (rightScore >= stayScore) simType = sp.right
        }
        si++
      }
      var hp
      if (nd.type === 'wave') {
        nd.count = Math.max(4, Math.round(simArmy.count * nd.factor * diff))
        nd.centerRatio = 0.5
        nd.widthRatio = CFG.waveColsRatio
        hp = nd.count
      } else {
        nd.hp = Math.max(20, Math.round(simArmy.count * nd.hpFactor * diff))
        nd.maxHp = nd.hp
        nd.centerRatio = 0.5
        nd.widthRatio = 0.5
        hp = nd.hp
      }
      var result = simulateBattle(simArmy.count, hp, {
        startHp: simArmy.hp, playerType: simType, enemyType: nd.unitType,
        skill: nd.skill, boss: nd.boss, maxHp: nd.maxHp || hp
      })
      simArmy = { count: result.count, hpPerUnit: 1, hp: result.hp }
      if (!result.won || simArmy.count <= 0) { solvable = false; break }
    }

    var items = support.concat(nodes)
    items.push({ type: 'castle', z: castleZ })
    items.sort(function (a, b) { return a.z - b.z })
    return {
      level: levelIndex, start: start, length: castleZ, items: items,
      mode: Content.modeForLevel(levelIndex).id,
      timeLimit: CFG.modeTimeLimit,
      bestPossible: Math.round(simArmy.count), solvable: solvable
    }
  }

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

  // 随机事件结果在生成时确定，收集时只结算一次
  function resolveEvent (item, army) {
    var kind = item.eventKind
    if (kind === 'cache') return { coins: 40, units: 0, text: '+40金币' }
    if (kind === 'reinforce') {
      var mods = buildModifiers(army)
      var units = Math.round(12 * (army.recruitMultiplier || mods.recruit || 1))
      addArmyUnits(army, units)
      return { coins: 0, units: units, text: '+' + units + '援军' }
    }
    var damage = Math.min(armyHp(army), 6 * (army.hpPerUnit || 1))
    damageArmy(army, damage)
    return { coins: 60, units: 0, damage: damage, text: '夺金60 · 遭伏击' }
  }

  // 每次三选一无放回；已拥有天赋不进入候选，全部学完后允许直接下一关
  function talentChoices (levelIndex, owned) {
    owned = owned || []
    var pool = Content.talents.filter(function (t) { return owned.indexOf(t.id) < 0 })
    var rng = mulberry32(92021 + levelIndex * 7919 + owned.length * 101)
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1))
      var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp
    }
    return pool.slice(0, 3)
  }

  function equipmentOffers (owned) {
    owned = owned || []
    return Content.equipment.filter(function (e) { return owned.indexOf(e.id) < 0 }).slice(0, 2)
  }

  CR.Logic = {
    clamp: clamp, mulberry32: mulberry32, randRange: randRange, pick: pick,
    applyGate: applyGate, gateLabel: gateLabel, applyArmyGate: applyArmyGate,
    attackMultiplier: attackMultiplier, armyHp: armyHp, addArmyUnits: addArmyUnits, damageArmy: damageArmy,
    unitCounter: unitCounter, buildModifiers: buildModifiers, battleStep: battleStep,
    simulateBattle: simulateBattle, battleLoss: battleLoss, formationOffsets: formationOffsets,
    buildLevel: buildLevel, generateLevel: generateLevel, resolveEvent: resolveEvent,
    talentChoices: talentChoices, equipmentOffers: equipmentOffers
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = CR.Logic
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis))
