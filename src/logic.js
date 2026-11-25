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
    // 门放在两组兵牌的中点，避免门牌与紧邻的兵牌在画面里互相遮挡
    var gates = [
      { type: 'gate', z: 895, left: { op: '*', value: CFG.gateMultiplier, label: '×' + CFG.gateMultiplier },
        right: { op: '+', value: CFG.gateAddition, label: '+' + CFG.gateAddition }, _done: false },
      { type: 'gate', z: 2695, left: { op: '*', value: CFG.gateMultiplier, label: '×' + CFG.gateMultiplier },
        right: { op: '+', value: CFG.gateAddition, label: '+' + CFG.gateAddition }, _done: false }
    ]
    var troopGates = [
      { type: 'troopGate', z: 1495, left: 'shield', right: 'archer', _done: false },
      { type: 'troopGate', z: 3295, left: 'cavalry', right: 'shield', _done: false }
    ]
    var kinds = ['cache', 'reinforce', 'ambush']
    // 事件放在两道栅栏之间的自由区，不会因为被锁边而吃不到
    var events = [1850, 3595].map(function (z, i) {
      var kind = kinds[Math.floor(rng() * kinds.length)]
      return { type: 'event', z: z, side: (levelIndex + i) % 2 ? 'R' : 'L', eventKind: kind, _done: false }
    })
    return gates.concat(troopGates, events)
  }

  function isFenced (item) { return item.type === 'gate' || item.type === 'troopGate' }

  // 栅栏区间：从门前 fenceLead 开始，延伸到门后 fenceTail
  function fenceStart (item) { return item.z - (item.fenceLead || CFG.fenceLeadMin) }
  function fenceEnd (item) { return item.z + CFG.fenceTail }

  /**
   * 给每道大奖励门分配栅栏长度（需按 z 升序传入）。
   * 最长 fenceLeadMax；与上一道栅栏之间必须留出 fenceGap 的自由区，但不少于 fenceLeadMin，
   * 保证门进入可收取范围前栅栏已贴身。
   */
  function assignFenceLeads (sortedItems) {
    var prevEnd = -Infinity
    for (var i = 0; i < sortedItems.length; i++) {
      var it = sortedItems[i]
      if (!isFenced(it)) continue
      var room = it.z - prevEnd - CFG.fenceGap
      it.fenceLead = clamp(room, CFG.fenceLeadMin, CFG.fenceLeadMax)
      prevEnd = fenceEnd(it)
    }
  }

  /** 生成一关并用“栅栏内按更优一侧选边 + 该侧兵牌全收”验证一条可通路线；upgrades 为玩家当前成长，用于让敌人跟上玩家强度。 */
  function buildLevel (levelIndex, scale, upgrades) {
    upgrades = upgrades || {}
    // 只取输出类成长：敌人血量与仿真输出同步放大，相对挑战保持与第 1 关一致；体质仍是玩家自己的防御优势
    var outMods = buildModifiers(upgrades)
    var mods = { damage: outMods.damage, fireRate: outMods.fireRate, recruit: outMods.recruit }
    var attackLevel = upgrades.attackLevel || 0
    var hpPerUnit = 1
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
    assignFenceLeads(support)
    // 难度曲线：前两关略松让玩家熟悉栅栏选边，第 3 关起与原口径一致
    var diff = clamp(0.9 + levelIndex * 0.05, 0.9, 1.3) * scale
    var nodes = nodeTemplate()
    var simArmy = { count: start, hpPerUnit: hpPerUnit, hp: start * hpPerUnit }
    var simType = 'shield'
    var si = 0
    var solvable = true
    var unitCycle = ['cavalry', 'shield', 'archer', 'cavalry']
    var fenced = support.filter(isFenced)
    var lockedSide = null
    var lockUntil = -1

    // 栅栏内只能走一侧：该侧的兵牌收益计入选边比较
    var sideGain = function (f, side) {
      var gain = 0
      for (var k = 0; k < support.length; k++) {
        var sp0 = support[k]
        if (sp0.z > fenceEnd(f)) break
        if (sp0.type === 'pickup' && sp0.side === side && sp0.z > fenceStart(f)) gain += sp0.value
      }
      return gain
    }
    // 抵达栅栏起点时定边：倍率门比两侧结果，兵种门比克制关系，持平时取兵牌收益高的一侧
    var decideFence = function (f, nd) {
      if (f.type === 'gate') {
        var l = applyGate(simArmy.count, f.left) + sideGain(f, 'L')
        var r = applyGate(simArmy.count, f.right) + sideGain(f, 'R')
        lockedSide = l >= r ? 'L' : 'R'
        applyArmyGate(simArmy, lockedSide === 'L' ? f.left : f.right)
      } else {
        var ls = unitCounter(f.left, nd.unitType)
        var rs = unitCounter(f.right, nd.unitType)
        var ss = unitCounter(simType, nd.unitType)
        lockedSide = ls > rs ? 'L' : (rs > ls ? 'R' : (sideGain(f, 'L') >= sideGain(f, 'R') ? 'L' : 'R'))
        var pickScore = unitCounter(lockedSide === 'L' ? f.left : f.right, nd.unitType)
        if (pickScore >= ss) simType = lockedSide === 'L' ? f.left : f.right
      }
      lockUntil = fenceEnd(f)
    }

    for (var ni = 0; ni < nodes.length; ni++) {
      var nd = nodes[ni]
      nd.unitType = unitCycle[(levelIndex + ni) % unitCycle.length]
      while (si < support.length && support[si].z <= nd.z - CFG.engageRange) {
        var sp = support[si]
        // 先结算已经贴身的栅栏（栅栏起点可能早于本节点的交战距离）
        while (fenced.length && fenceStart(fenced[0]) < sp.z && fenced[0].z <= nd.z - CFG.engageRange) decideFence(fenced.shift(), nd)
        if (isFenced(sp)) { if (fenced.length && fenced[0] === sp) decideFence(fenced.shift(), nd) }
        else if (sp.type === 'pickup') {
          if (sp.z > lockUntil || sp.side === lockedSide) addArmyUnits(simArmy, Math.round(sp.value * mods.recruit))
        }
        si++
      }
      var hp
      // 敌人血量/数量按玩家输出等比放大（只跟攻击、伤害与攻速，不跟防御），使每一关的相对挑战与第 1 关一致
      var power = attackMultiplier(attackLevel) * (mods.damage || 1) * (mods.fireRate || 1) * diff
      if (nd.type === 'wave') {
        nd.count = Math.max(4, Math.round(simArmy.count * nd.factor * power))
        nd.centerRatio = 0.5
        nd.widthRatio = CFG.waveColsRatio
        hp = nd.count
      } else {
        nd.hp = Math.max(20, Math.round(simArmy.count * nd.hpFactor * power))
        nd.maxHp = nd.hp
        nd.centerRatio = 0.5
        nd.widthRatio = 0.5
        hp = nd.hp
      }
      var result = simulateBattle(simArmy.count, hp, {
        startHp: simArmy.hp, playerType: simType, enemyType: nd.unitType,
        skill: nd.skill, boss: nd.boss, maxHp: nd.maxHp || hp,
        attackLevel: attackLevel, modifiers: mods
      })
      simArmy = { count: result.count, hpPerUnit: hpPerUnit, hp: result.hp }
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

  function generateLevel (levelIndex, upgrades) {
    var scale = 1
    var data = buildLevel(levelIndex, scale, upgrades)
    var tries = 0
    while (!data.solvable && tries < 8) {
      scale *= 0.8
      data = buildLevel(levelIndex, scale, upgrades)
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
    isFenced: isFenced, fenceStart: fenceStart, fenceEnd: fenceEnd, assignFenceLeads: assignFenceLeads,
    buildLevel: buildLevel, generateLevel: generateLevel, resolveEvent: resolveEvent,
    talentChoices: talentChoices, equipmentOffers: equipmentOffers
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = CR.Logic
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis))
