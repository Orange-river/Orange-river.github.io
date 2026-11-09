(function (global) {
  var CR = (global.CR = global.CR || {})
  var C = CR.CONFIG
  var CONTENT = CR.Content

  // 唯一伤害入口：我方射击与敌方近战完全独立；大军伤亡只取决于接敌上限和敌方攻速
  // enemyUnits 是敌潮人数；武将按 warriorUnits 折算接敌面，避免大军被自身DPS放大反噬
  function battleStep (state, dt, opts) {
    opts = opts || {}
    var playerHp = state.playerHp
    var playerMaxHpPerUnit = state.playerMaxHpPerUnit || 1
    var playerDamage = state.playerDamage || 1
    var enemyHp = state.enemyHp
    var enemyMaxHp = Math.max(1, state.enemyMaxHp || state.enemyHp)
    var enemyUnits = Math.max(1, Math.round(state.enemyUnits || 1))
    var meleeCap = Math.min(enemyUnits, Math.max(1, Math.round(opts.meleeCap || 20)))
    var dps = Math.max(0, playerHp / playerMaxHpPerUnit) * C.fireRatePerUnit * playerDamage
    dps *= opts.damageMultiplier || 1
    var unitType = opts.unitType || 'shield'
    var enemyType = opts.enemyType || 'shield'
    var counter = CONTENT.unitTypes[unitType] && CONTENT.unitTypes[unitType].counter === enemyType
      ? C.counterAdvantage
      : (CONTENT.unitTypes[enemyType] && CONTENT.unitTypes[enemyType].counter === unitType ? C.counterDisadvantage : 1)
    dps *= counter
    var enemyDps = meleeCap * C.enemyMeleeRatePerUnit * (opts.enemyMeleeRateMultiplier || 1)
    enemyDps *= opts.incomingMultiplier || 1
    enemyHp = Math.max(0, enemyHp - dps * dt)
    playerHp = Math.max(0, playerHp - enemyDps * dt)
    state.playerHp = playerHp
    state.enemyHp = enemyHp
    state.playerCount = Math.max(0, Math.ceil(playerHp / playerMaxHpPerUnit))
    state.enemyCount = Math.max(0, Math.ceil(enemyHp / enemyMaxHp * enemyUnits))
    state.playerDamageDone = (state.playerDamageDone || 0) + dps * dt
    state.enemyDamageDone = (state.enemyDamageDone || 0) + enemyDps * dt
    state.dead = playerHp <= 0
    state.won = enemyHp <= 0
    return state
  }

  function applyArmyGate (count, hp, hpPerUnit, option) {
    var nextCount = option.op === 'mul'
      ? Math.max(1, Math.round(count * option.value))
      : Math.max(0, count + option.value)
    var delta = nextCount - count
    return { count: nextCount, hp: Math.max(0, hp + delta * hpPerUnit), delta: delta }
  }

  function buildModifiers (equipment, talents) {
    var mods = { damage: 1, fireRate: 1, incoming: 1, hpPerUnit: 0, recruit: 1, coins: 1 }
    var all = (equipment || []).concat(talents || [])
    for (var i = 0; i < all.length; i++) {
      var id = all[i]
      var def = null
      var pools = [CONTENT.equipment, CONTENT.talents]
      for (var p = 0; p < pools.length && !def; p++) {
        for (var j = 0; j < pools[p].length; j++) if (pools[p][j].id === id) def = pools[p][j]
      }
      if (!def) continue
      if (def.damage) mods.damage += def.damage
      if (def.fireRate) mods.fireRate += def.fireRate
      if (def.incoming) mods.incoming = Math.max(0.2, mods.incoming + def.incoming)
      if (def.hp) mods.hpPerUnit += def.hp
      if (def.recruit) mods.recruit += def.recruit
      if (def.coins) mods.coins += def.coins
    }
    return mods
  }

  function talentChoices (levelIndex, owned) {
    var available = CONTENT.talents.filter(function (t) { return owned.indexOf(t.id) < 0 })
    var result = []
    var cursor = (levelIndex * 2) % Math.max(1, available.length)
    while (available.length && result.length < Math.min(3, available.length + result.length)) {
      result.push(available.splice(cursor % available.length, 1)[0])
      cursor += 2
      if (result.length >= 3) break
    }
    return result
  }

  function randomEvent (levelIndex, slot) {
    return CONTENT.events[Math.floor(rng(levelIndex * 97 + slot * 17)() * CONTENT.events.length)]
  }

  // 1..depth 排布纵深：后排不能在同一帧瞬间全部接敌
  function formation (count, w, h) {
    var spacing = w * C.unitSpacingRatio
    var perRow = Math.max(4, Math.floor((w * 0.52) / spacing))
    var rows = Math.ceil(count / perRow)
    var depth = rows * spacing
    var top = h * C.playerLineRatio - Math.min(h * C.formationDepthRatio, depth)
    return { perRow: perRow, spacing: spacing, rows: rows, top: top }
  }

  // 确定性种子：同一关刷新布局一致，方便玩家背板与调优
  function rng (seed) {
    var s = seed >>> 0
    return function () {
      s = (s + 0x6D2B79F5) | 0
      var t = Math.imul(s ^ (s >>> 15), 1 | s)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  function hpToCount (hp, hpPerUnit) {
    return Math.max(0, Math.ceil(hp / Math.max(1, hpPerUnit)))
  }

  // 兵牌两侧循环展开，保证“左边连续+1、右边高值牌”的收兵选择一直存在
  function makePickups (level, endZ, random) {
    var arr = []
    var i = 0
    for (var z = C.pickupFirstZ; z < endZ; z += C.pickupSpacing) {
      var big = C.rightBigValues[(i + level) % C.rightBigValues.length]
      arr.push({ side: 'L', z: z, value: C.leftValue })
      arr.push({ side: 'R', z: z, value: big })
      i++
    }
    return arr
  }

  function buildLevel (level, scale) {
    var random = rng(1000 + level * 137)
    var lv = level + 1
    var z = 0
    var objects = []
    var path = [{ count: C.startCount, z: 0, label: '起点' }]
    var n = C.startCount
    var bigValueSum = 0
    var smallValueSum = 0
    var bigCount = 0

    function advance (dz) {
      z += dz
      // 按右侧高值兵牌估算最优路线兵力（生成器只做难度标定；实战仍需手动收兵）
      var startZ = z - dz
      var gained = 0
      for (var pz = C.pickupFirstZ; pz < z; pz += C.pickupSpacing) {
        if (pz > startZ) {
          var idx = Math.round((pz - C.pickupFirstZ) / C.pickupSpacing)
          var value = C.rightBigValues[(idx + level) % C.rightBigValues.length]
          gained += value
          bigValueSum += value
          smallValueSum += C.leftValue
          bigCount++
        }
      }
      n += gained
      path.push({ count: n, z: Math.round(z), label: '收兵后', gained: gained })
    }

    function wave (size) {
      var hp = Math.round(size * scale)
      objects.push({ type: 'wave', z: Math.round(z), size: size, hp: hp, maxHp: hp })
      path.push({ count: n, z: Math.round(z), label: '兵潮×' + size })
    }

    function general (size, boss) {
      var hp = Math.round(size * scale * 1.15)
      objects.push({ type: 'general', z: Math.round(z), size: size, hp: hp, maxHp: hp, boss: !!boss })
      path.push({ count: n, z: Math.round(z), label: boss ? '最终Boss×' + size : '武将×' + size })
    }

    advance(1500 + random() * 350)
    wave(13 + lv * 3 + Math.floor(n * 0.1))
    advance(1050 + random() * 300)
    general(24 + lv * 4 + Math.floor(n * 0.18), false)
    advance(1400 + random() * 400)
    wave(22 + lv * 4 + Math.floor(n * 0.16))
    advance(1100 + random() * 300)
    // 最后一名武将就是最终Boss：死亡当帧直接通关
    general(40 + lv * 6 + Math.floor(n * 0.32), true)
    advance(760)
    objects.push({ type: 'castle', z: Math.round(z) })

    return {
      levelIndex: level,
      length: Math.round(z),
      objects: objects,
      pickups: makePickups(level, z - 500, random),
      path: path,
      start: C.startCount,
      scale: scale,
      stats: { bigValueSum: bigValueSum, smallValueSum: smallValueSum, bigCount: bigCount }
    }
  }

  function countPickupsBefore (pickups, z, side) {
    var sum = 0
    for (var i = 0; i < pickups.length; i++) {
      var p = pickups[i]
      if (p.z < z && p.side === side) sum += p.value
    }
    return sum
  }

  // 与实战 Level.update 共用 battleStep，保证“可解性仿真”不会与真实伤害口径漂移
  function simulateCombat (armyHp, hpPerUnit, damage, obj) {
    var st = {
      playerHp: armyHp,
      playerMaxHpPerUnit: hpPerUnit,
      playerDamage: damage,
      enemyHp: obj.hp,
      enemyMaxHp: obj.maxHp,
      enemyUnits: obj.size
    }
    var chargeTime = Math.max(0, (C.engageRange - C.contactRange) / C.enemyChargeSpeed)
    var elapsed = 0
    var dt = 1 / 120
    var opts = {
      meleeCap: obj.type === 'general' ? 34 : 18,
      unitType: 'shield',
      enemyType: obj.unitType || 'shield'
    }
    // 敌军先冲锋，我方远程无损输出；进入近战后才按接敌对数受伤
    while (elapsed < chargeTime && !st.won) {
      battleStep(st, Math.min(dt, chargeTime - elapsed), opts)
      elapsed += dt
    }
    var guard = 0
    while (!st.won && !st.dead && guard < 120 * 180) {
      battleStep(st, dt, opts)
      guard++
    }
    return st
  }

  // 满吃高值兵牌的“可解性”检查；若失败则下调整关难度后重新生成
  function verifyLevel (data) {
    var hpPerUnit = 1
    var damage = 1
    var army = C.startCount * hpPerUnit
    var results = []
    for (var i = 0; i < data.objects.length; i++) {
      var obj = data.objects[i]
      if (obj.type === 'castle') continue
      army += countPickupsBefore(data.pickups, obj.z, 'R') * hpPerUnit
      var st = simulateCombat(army, hpPerUnit, damage, obj)
      results.push({ z: obj.z, type: obj.type, remainHp: st.playerHp, remainCount: st.playerCount, won: st.won })
      if (!st.won || st.playerHp <= 0) return { ok: false, results: results }
      army = st.playerHp
    }
    return { ok: true, results: results, remainHp: army, remainCount: hpToCount(army, hpPerUnit) }
  }

  function generateLevel (level) {
    // 难度随关卡上升，但始终保证“满吃路线”能通关
    var scale = 0.36 + level * 0.05
    for (var attempt = 0; attempt < 40; attempt++) {
      var data = buildLevel(level, scale)
      data.mode = CONTENT.modes[level % CONTENT.modes.length].id
      var gates = []
      var combatObjects = data.objects.filter(function (o) { return o.type === 'wave' || o.type === 'general' })
      for (var i = 0; i < combatObjects.length; i++) {
        var obj = combatObjects[i]
        obj.unitType = CONTENT.modes.length ? ['shield', 'archer', 'cavalry'][(level + i + 1) % 3] : 'shield'
        if (obj.type === 'general') obj.skillClock = 0
        if (obj.boss) obj.phase = 1
        var before = obj.z - 260
        gates.push({ type: 'armyGate', z: Math.max(250, before - 320), left: C.armyGateSides[0], right: C.armyGateSides[1] })
        gates.push({
          type: 'unitGate', z: Math.max(420, before - 120),
          left: C.unitGateTypes[(level + i) % 3],
          right: C.unitGateTypes[(level + i + 1) % 3]
        })
      }
      for (var e = 0; e < 2; e++) {
        gates.push({ type: 'event', z: 950 + e * 1750 + (level % 3) * 90, event: randomEvent(level, e) })
      }
      data.objects = data.objects.concat(gates).sort(function (a, b) { return a.z - b.z })
      var check = verifyLevel(data)
      if (check.ok) {
        data.verification = check
        return data
      }
      scale *= 0.85
    }
    // 极端保底：始终返回可玩的布局
    var fallback = buildLevel(level, 0.1)
    fallback.mode = CONTENT.modes[level % CONTENT.modes.length].id
    fallback.verification = verifyLevel(fallback)
    return fallback
  }

  CR.Logic = {
    battleStep: battleStep,
    formation: formation,
    rng: rng,
    hpToCount: hpToCount,
    applyArmyGate: applyArmyGate,
    buildModifiers: buildModifiers,
    talentChoices: talentChoices,
    randomEvent: randomEvent,
    simulateCombat: simulateCombat,
    generateLevel: generateLevel,
    verifyLevel: verifyLevel
  }
})(typeof GameGlobal !== 'undefined' ? GameGlobal : (typeof window !== 'undefined' ? window : globalThis))
