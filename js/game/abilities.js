/*
 * Ability interpreter, ported from the game's Spacewood.Core.Models.Abilities (Ability, TriggerBase and the Trigger*
 * classes, ConditionBase and the Condition* classes, ParameterInt, MinionFinder, Targets*, Effect*) and the resolver
 * systems that drive them (TryTriggerMinion, ActivateAbilityTry/Do, AbilityEffect*, the mutators the effects feed).
 * The ability definitions themselves are the game's own objects (js/game/data.js). Rules: docs/game-internals/RESOLVER-NOTES.md.
 *
 * Anything not ported yet throws `Unported: <class>` so a gap can never pass silently as a wrong result.
 */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = isNode ? require('./data.js') : root.SAPGame.data;
  const S = isNode ? require('./sim.js') : root.SAPGame.sim;
  const M = isNode ? require('./model.js') : root.SAPGame.model;
  const { ev, wrap, sourceOf, targetOf } = S;
  const { idEq, getFrontDistance } = M;

  const unported = (what) => { const e = new Error('Unported: ' + what); e.unported = what; throw e; };
  const T = (o) => (o && o.$type) || '';
  const short = (t) => t.replace(/^(Triggers|Effects|Conditions|Parameters|Catalogue)\./, '');

  // ---------------------------------------------------------------- object graph ($id / $ref) from data.js
  const refCache = new Map();
  function resolveRefs(root) {
    if (refCache.has(root)) return refCache.get(root);
    const byId = new Map();
    const collect = (o) => { if (Array.isArray(o)) return o.forEach(collect); if (o && typeof o === 'object') { if (o.$id !== undefined && !byId.has(o.$id)) byId.set(o.$id, o); for (const v of Object.values(o)) collect(v); } };
    collect(root);
    const fix = (o) => {
      if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) { const v = o[i]; if (v && v.$ref !== undefined && byId.has(v.$ref)) o[i] = byId.get(v.$ref); else fix(v); } return; }
      if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object' && v.$ref !== undefined && byId.has(v.$ref)) o[k] = byId.get(v.$ref); else fix(v); }
    };
    fix(root); refCache.set(root, root); return root;
  }
  /** AbilityConstants.GetAbility(enum, level) */
  function getAbility(e, level) {
    const a = D.abilities[e]; if (!a) return null;
    const x = a[level] || a[1]; return x ? resolveRefs(x) : null;
  }

  // ---------------------------------------------------------------- System.Decimal (Op3_Multiplier) and helpers
  const decimal = (d) => { if (d == null) return null; const scale = (d.flags >> 16) & 0xff; const neg = (d.flags >>> 31) === 1; let v = Number(BigInt(d.ulomidLE ?? d.lo)) + (d.hi ? d.hi * 2 ** 64 : 0); v /= 10 ** scale; return neg ? -v : v; };
  const opCheck = (op, a, b) => op === 0 ? a === b : op === 1 ? a < b : op === 2 ? a <= b : op === 3 ? b < a : op === 4 ? b <= a : false; // OperatorUtility.Check
  const tdiv = (a, b) => (a / b) < 0 ? Math.ceil(a / b) : Math.floor(a / b);

  /**
   * System.Decimal arithmetic for the values the game computes in decimal (Calculator, ParameterInt.Op3). Values are BigInt
   * fixed-point at scale 10^28 (a decimal below 7.9 keeps 28 fractional digits); products and quotients round half to even
   * at the last digit, as decimal does.
   */
  const Dec = (() => {
    const S = 10n ** 28n;
    const divRound = (n, d) => { if (d < 0n) { n = -n; d = -d; } let q = n / d; const r = n - q * d; const twice = 2n * (r < 0n ? -r : r);
      if (twice > d || (twice === d && (q % 2n !== 0n))) q += r < 0n ? -1n : 1n; return q; };
    const floorDiv = (n) => { let q = n / S; if (n < 0n && q * S !== n) q -= 1n; return q * S; };
    return {
      int: (v) => BigInt(Math.trunc(v)) * S,
      from(d) { const scale = (d.flags >> 16) & 0xff; let m = BigInt(d.ulomidLE ?? d.lo) + (BigInt(d.hi || 0) << 64n); if (d.flags >>> 31) m = -m; return m * 10n ** BigInt(28 - scale); },
      add: (a, b) => a + b, sub: (a, b) => a - b,
      mul: (a, b) => divRound(a * b, S),
      div: (a, b) => { if (b === 0n) throw new Error('DivideByZeroException'); return divRound(a * S, b); },
      mod: (a, b) => { if (b === 0n) throw new Error('DivideByZeroException'); return a % b; },
      floor: floorDiv,
      ceil: (n) => -floorDiv(-n),
      round: (n) => divRound(n, S) * S, // Decimal.Round(d): to even
      toInt: (n) => Number(n / S), // (int) truncates toward zero
    };
  })();
  /** Calculator.Sum(start): each item applies its operation (0 +, 1 -, 2 *, 3 /, 4 min, 5 max, 6 %) and its rounding, then the calculator's rounding, then (int). */
  function calculatorSum(c, start) {
    const rounding = (r, x) => (r === 1 ? Dec.ceil(x) : r === 2 ? Dec.floor(x) : r === 3 ? Dec.round(x) : x);
    let v = Dec.int(start);
    for (const it of c.Items || []) {
      const x = Dec.from(it.Value);
      switch (it.Operation) {
        case 0: v = Dec.add(v, x); break;
        case 1: v = Dec.sub(v, x); break;
        case 2: v = Dec.mul(v, x); break;
        case 3: v = Dec.div(v, x); break;
        case 4: if (v > x) v = x; break;
        case 5: if (v < x) v = x; break;
        case 6: v = Dec.mod(v, x); break;
        default: break;
      }
      v = rounding(it.Rounding || 0, v);
    }
    return Dec.toInt(rounding(c.Rounding || 0, v));
  }

  // ---------------------------------------------------------------- Parameters (ParameterInt.GetValue)
  /** pa: ParameterArgs {B, TargetId, SourceId, TriggerTargetId, TriggerSourceId, AimId, Random, TriggerEvent, Owner} */
  function paramValue(p, pa) {
    if (p == null) return null;
    let v = paramBase(p, pa);
    if (p.Calculator) v = calculatorSum(p.Calculator, v);
    if (p.Op1_Invert) v = -v;
    if (p.Op2_Addition != null) v += p.Op2_Addition;
    if (p.Op3_Multiplier != null) { const x = Dec.mul(Dec.int(v), Dec.from(p.Op3_Multiplier)); v = Dec.toInt(p.RoundUp ? Dec.ceil(x) : Dec.floor(x)); }
    if (p.Op4_Divider != null && p.Op4_Divider !== 0) v = tdiv(v, p.Op4_Divider);
    if (p.Op5_Addition != null) v += p.Op5_Addition;
    if (p.Op6_Addition) v += paramValue(p.Op6_Addition, pa);
    if (p.Op7_Min) { const mn = paramValue(p.Op7_Min, pa); if (v < mn) v = mn; }
    if (p.Op8_Max) { const mx = paramValue(p.Op8_Max, pa); if (mx < v) v = mx; }
    if (p.Tracker != null && p.TrackerLimit != null) {
      const src = pa.SourceId && pa.B.board.findMinion(pa.SourceId);
      if (src) { const pow = src.Power[p.Tracker] || 0; if (p.TrackerLimit - pow < v) v = p.TrackerLimit - pow; }
    }
    return v;
  }
  function paramMinion(p, pa) {
    const id = [pa.SourceId, pa.TargetId, pa.TriggerSourceId, pa.TriggerTargetId, pa.AimId][p.Origin ?? 0];
    if (id) { const m = pa.B.board.findMinion(id); if (!m) throw new Error('Tried to get a minion, but no minion was found'); return m; }
    if (pa.TriggerEvent && pa.TriggerEvent.cls === 'Force') return null;
    throw new Error('Tried to get a minion, but no point was given');
  }
  function paramBase(p, pa) {
    const t = short(T(p));
    switch (t) {
      case 'ParameterFlat': return p.Value;
      case 'ParameterMinionAttack': { const m = paramMinion(p, pa); return m ? m.Attack.Total : 1; }
      case 'ParameterMinionHealth': { const m = paramMinion(p, pa); return m ? m.Health.Total : 1; }
      case 'ParameterMinionLevel': { const m = paramMinion(p, pa); return m ? m.Level : 1; }
      case 'ParameterMinionMana': { const m = paramMinion(p, pa); return m ? m.Mana : 1; }
      case 'ParameterRolls': { const m = pa.SourceId ? pa.B.board.findMinion(pa.SourceId) : null; if (!m) return 0; return m.Owner === 1 ? pa.B.board.RollsThisTurn || 0 : m.Owner === 2 ? pa.B.board.OpponentRolls || 0 : 0; } // BuildExtensions.CountRolls
      case 'ParameterTrumpets': { const m = pa.SourceId ? pa.B.board.findMinion(pa.SourceId) : null; return m ? getTrumpets(pa.B.board, m.Owner) : 0; }
      default: return unported(t);
    }
  }

  // ---------------------------------------------------------------- MinionFinder
  const PERKS = () => D.perks || {};
  const perkPositive = (perk) => { const p = PERKS()[perk]; if (!p) unported('PerkConstants.IsPositive(' + perk + ')'); return !!p.positive; };
  /** MinionFinder.Predicate(board, candidate, owner) */
  function predicate(f, B, cand, owner, aim) {
    if (!f) return true;
    if (f.FinderRequired && !owner) return false;
    if (f.Alive != null && !f.IncludeDead && cand.IsAlive !== f.Alive) return false;
    if (f.Other != null) { if (!owner) return false; if (f.Other === false && !idEq(owner.Id, cand.Id)) return false; if (f.Other === true && idEq(owner.Id, cand.Id)) return false; }
    if (f.Team != null && owner) { if (cand.Owner === owner.Owner ? f.Team === 1 : f.Team === 0) return false; }
    if (f.Perk != null && cand.Perk !== f.Perk) return false;
    if (f.WithoutPerk != null && cand.Perk != null && cand.Perk === f.WithoutPerk) { if (f.WithoutPerkAndDurability == null) return false; if (f.WithoutPerkAndDurability === cand.PerkDurability) return false; }
    if (f.WithoutPerkPara) unported('MinionFinder.WithoutPerkPara');
    const pa = { B, TargetId: cand.Id, SourceId: owner ? owner.Id : null };
    if (f.AttackEven != null) { const r = cand.Attack.Total % 2; if ((r === 0 && f.AttackEven === false) || (r !== 0 && f.AttackEven === true)) return false; }
    if (f.AttackMax != null && cand.Attack.IsMax !== f.AttackMax) return false;
    if (f.Attack) { const v = paramValue(f.Attack, pa); const s = f.AttackDuration == null ? cand.Attack.Total : f.AttackDuration === 0 ? cand.Attack.Permanent : f.AttackDuration === 1 ? cand.Attack.Temporary : cand.Attack.Total; if (!opCheck(f.AttackOperator, s, v)) return false; }
    if (f.AttackCountThisTurn != null && !opCheck(f.AttackCountThisTurnOperator, cand.AttackCountsThisTurn, f.AttackCountThisTurn)) return false;
    if (f.JumpCountThisTurn != null && !opCheck(f.JumpCountThisTurnOperator, cand.JumpsThisBattle, f.JumpCountThisTurn)) return false;
    if (f.HealthEven != null) { const r = cand.Health.Total % 2; if ((r === 0 && f.HealthEven === false) || (r !== 0 && f.HealthEven === true)) return false; }
    if (f.HealthMax != null && cand.Health.IsMax !== f.HealthMax) return false;
    if (f.Health) { const v = paramValue(f.Health, pa); const s = f.HealthDuration == null ? cand.Health.Total : f.HealthDuration === 0 ? cand.Health.Permanent : f.HealthDuration === 1 ? cand.Health.Temporary : cand.Health.Total; if (!opCheck(f.HealthOperator, s, v)) return false; }
    if (f.TriggerCount || f.ActivationCount) unported('MinionFinder.TriggerCount/ActivationCount');
    if (f.StatsMax != null && (cand.Attack.IsMax && cand.Health.IsMax) !== f.StatsMax) return false;
    if (f.Mana) { const v = paramValue(f.Mana, pa); if (!opCheck(f.ManaOperator, cand.Mana, v)) return false; }
    if (f.Level != null && !opCheck(f.LevelOperator, cand.Level, f.Level)) return false;
    if (f.Power || f.Charge) unported('MinionFinder.Power/Charge');
    if (f.LevelMax != null && (cand.Level > 2) !== f.LevelMax) return false;
    if (f.Countdown != null) unported('MinionFinder.Countdown');
    if (f.Tier) { const v = paramValue(f.Tier, pa); const tier = (D.minions[cand.Enum] || {}).tier; if (!opCheck(f.TierOperator, tier, v)) return false; }
    if (f.ActiveAbility != null || f.SameAbility != null || f.SellValue != null) unported('MinionFinder.ActiveAbility/SameAbility/SellValue');
    if (f.Minion != null && cand.Enum !== f.Minion) return false;
    if (f.ExcludeDifficulty && (D.minions[cand.Enum] || {}).relicType === 1) return false; // MinionTemplate.RelicType (+0x100) == 1
    if (f.Types && f.Types.length) { const tt = (D.minions[cand.Enum] || {}).type ?? 0; if (!f.Types.includes(tt)) return false; }
    if (f.SameTribe != null && owner) { const same = owner.Tribe != null && cand.Tribe != null && owner.Tribe === cand.Tribe; if (same !== f.SameTribe) return false; }
    if (f.Direction != null) {
      if (!owner) return false;
      if (!(f.DirectionIncludeSelf != null && idEq(cand.Id, owner.Id))) {
        let ahead, behind;
        if (owner.Owner === 1) { ahead = owner.Point.x < cand.Point.x; behind = cand.Point.x < owner.Point.x; } else { ahead = cand.Point.x < owner.Point.x; behind = owner.Point.x < cand.Point.x; }
        if (f.Direction === 0 && !ahead) return false;
        if (f.Direction === 1 && !behind) return false;
      }
    }
    if (f.Distance != null) { const d = getDistance(B.board, cand, owner, f.DistanceEmptySpaces, f.DistanceSkipDead); if (!opCheck(f.DistanceOperator, d, f.Distance)) return false; }
    if (f.FrontDistance != null) { const d = getFrontDistance(B.board, cand, !!f.FrontDistanceConsiderEmptySpaces); if (!opCheck(f.FrontDistanceOperator, d, f.FrontDistance)) return false; }
    if (f.BackDistance != null) unported('MinionFinder.BackDistance');
    if (f.PerkTier || f.WithRollablePerk != null) unported('MinionFinder.PerkTier/WithRollablePerk');
    if (f.HasAim != null) { const has = !!aim && idEq(aim, cand.Id); if (has !== f.HasAim) return false; }
    if (f.HasPerk != null && (cand.Perk != null) !== f.HasPerk) return false;
    if (f.HasMidBattlePerk != null || f.HasUniversalPerk != null) unported('MinionFinder.HasMidBattlePerk/HasUniversalPerk');
    if (f.HasPositivePerk != null) { const has = cand.Perk != null; if (has !== f.HasPositivePerk) return false; if (has && perkPositive(cand.Perk) !== f.HasPositivePerk) return false; }
    if (f.HasNegativePerk != null) { const has = cand.Perk != null; if (has !== f.HasNegativePerk) return false; if (has && !perkPositive(cand.Perk) !== f.HasNegativePerk) return false; }
    if (f.HasNoPositivePerk != null && cand.Perk != null && !perkPositive(cand.Perk) !== f.HasNoPositivePerk) return false;
    if (f.HasNoNegativePerk != null && cand.Perk != null && perkPositive(cand.Perk) !== f.HasNoNegativePerk) return false;
    if (f.HasTempStats != null) { const has = cand.Attack.Temporary > 0 || cand.Health.Temporary > 0; if (has !== f.HasTempStats) return false; }
    // Has*Trigger: any one set field that matches is enough (HasBeforeDeathTrigger tests the death effect against HasDeathTrigger's value)
    if (f.HasPlayTrigger != null || f.HasSellTrigger != null || f.HasDeathTrigger != null || f.HasBeforeDeathTrigger != null || f.HasHurtTrigger != null ||
      f.HasStartBattleTrigger != null || f.HasStartTurnTrigger != null || f.HasEndTurnTrigger != null) {
      let ok = false;
      if (f.HasPlayTrigger != null) ok = hasPlayEffect(cand) === f.HasPlayTrigger;
      if (f.HasSellTrigger != null && hasSellEffect(cand) === f.HasSellTrigger) ok = true;
      if (f.HasHurtTrigger != null && hasHurtEffect(cand) === f.HasHurtTrigger) ok = true;
      if ((f.HasDeathTrigger != null || f.HasBeforeDeathTrigger != null) && hasDeathEffect(cand) === !!f.HasDeathTrigger) ok = true;
      if (f.HasStartBattleTrigger != null && hasTrigger(cand, ['TriggerStartBattle'], false) === f.HasStartBattleTrigger) ok = true;
      if (f.HasStartTurnTrigger != null && hasTrigger(cand, ['TriggerStartTurn'], false) === f.HasStartTurnTrigger) ok = true;
      if (f.HasEndTurnTrigger != null && hasTrigger(cand, ['TriggerEndTurn'], false) === f.HasEndTurnTrigger) ok = true;
      if (!ok) return false;
    }
    if (f.HasDamageEffect != null && cand.Abilities.some((a) => hasEffect(a, 'EffectDamage')) !== f.HasDamageEffect) return false;
    if (f.ExcludeTypeSelf && owner && owner.Enum === cand.Enum) return false;
    if (f.ExcludeType != null && f.ExcludeType === cand.Enum) return false;
    if (f.ExcludeTypes && f.ExcludeTypes.values && f.ExcludeTypes.values.includes(cand.Enum)) return false;
    if (f.IncludeTypes && f.IncludeTypes.values && !f.IncludeTypes.values.includes(cand.Enum)) return false;
    if (f.IsPlayerMinion != null && cand.Owner !== 1) return false;
    if (f.HasSibling != null || f.AllowUniques != null) unported('MinionFinder.HasSibling/AllowUniques');
    if (f.DamageTaken != null && cand.DamageTaken !== f.DamageTaken) return false;
    if (f.DamageDealt != null && (cand.DamageDealtThisBattle > 0) !== f.DamageDealt) return false;
    if (f.FoodEaten != null && !opCheck(f.FoodEatenOperator || 0, cand.SpellCountsThisTurn || 0, f.FoodEaten)) return false;
    if (f.LastTargetThisTurn != null) { if (!owner) return false; if ((owner.LastTargetsThisTurn || []).some((x) => idEq(x, cand.Id)) !== f.LastTargetThisTurn) return false; }
    if (f.OldTargetsThisTurn != null) { if (!owner) return false; if ((owner.OldTargetsThisTurn || []).some((x) => idEq(x, cand.Id)) !== f.OldTargetsThisTurn) return false; }
    if (f.InPack != null || f.IsPreviousSurvivor != null || f.InWackyParameters != null || f.WithoutMemoryAbility != null) unported('MinionFinder.shop fields (InPack/IsPreviousSurvivor/InWackyParameters/WithoutMemoryAbility)');
    if (f.IsEnemyCheck && cand.Owner !== 2) return false;
    return true;
  }
  /** MinionExtensions.GetDistance */
  function getDistance(board, a, b, emptySpaces, skipDead) {
    if (!a || !b) return 0;
    if (emptySpaces) return Math.abs(a.Point.x - b.Point.x);
    // walk from a to b counting occupied cells (dead pets too unless skipDead); arriving at b counts as one more
    let x = a.Point.x, n = 0;
    while (x !== b.Point.x) {
      x += b.Point.x <= a.Point.x ? -1 : 1;
      if (x === b.Point.x) return n + 1;
      const c = board.get({ x, y: 0 }); if (c && (!skipDead || !c.Dead)) n++;
    }
    return n;
  }
  /** MinionExtensions.GetRelativeDirection(from, to): null on the same cell; 0 Forward / 1 Backward from `from`'s side. */
  function getRelativeDirection(from, to) {
    if (!from || !to || from.Point.x === to.Point.x) return null;
    if (from.Owner === 1) return to.Point.x <= from.Point.x ? 1 : 0;
    if (from.Owner === 2) return from.Point.x <= to.Point.x ? 1 : 0;
    return null;
  }

  // ---------------------------------------------------------------- auras (BoardExtensions.FindAuras / FindAuraAbilities / CheckAura)
  const minionType = (m) => (D.minions[m.Enum] || {}).type || 0;
  const minionTier = (m) => (D.minions[m.Enum] || {}).tier;
  /** abilities of `holder` with this AuraEnum whose AuraType is the target's MinionType */
  function findAuraAbilities(target, aura, holder) {
    const out = [];
    for (const a of holder.Abilities) { const ab = getAbility(a.Enum, a.Level); if (!ab || ab.AuraEnum == null) continue; if (aura != null && ab.AuraEnum !== aura) continue; if ((ab.AuraType || 0) === minionType(target)) out.push(a); }
    return out;
  }
  function checkAura(B, target, model, holder) {
    if (!model) return false;
    const ab = getAbility(model.Enum, model.Level); if (!ab) return false;
    if (ab.AuraExcludeSelf && idEq(target.Id, holder.Id)) return false;
    if (canAbilityCountLimit(B, model, ab) && !(model.TriggerCount < ab.TriggerLimit)) return false;
    if (ab.AuraDirection != null) { const rd = getRelativeDirection(holder, target); if (rd == null || rd !== ab.AuraDirection) return false; }
    if (ab.AuraDistance != null) {
      if (ab.AuraDistance === 0 && !idEq(target.Id, holder.Id)) return false;
      if (ab.AuraDistance < getDistance(B.board, holder, target, false, false)) return false;
    }
    if (ab.AuraTierMin != null && minionTier(target) < ab.AuraTierMin) return false;
    if (ab.AuraTierMax != null && ab.AuraTierMax < minionTier(target)) return false;
    return true;
  }
  /** FindAuras(board, m, aura) -> [{Minion, Ability, value, ceil}]; value = the aura ability's MagicVariable; ceil = no TriggerLimit. */
  function findAuras(B, m, aura) {
    if (!m) return [];
    if ((D.minions[m.Enum] || {}).relicType === 1) return [];
    const ref = (holder, a) => { const ab = getAbility(a.Enum, a.Level); return { Minion: holder, Ability: a, value: ab.MagicVariable || 0, ceil: ab.TriggerLimit == null, Template: ab }; };
    if (!m.IsAlive) { const a = findAuraAbilities(m, aura, m)[0]; return a && checkAura(B, m, a, m) ? [ref(m, a)] : []; }
    const out = []; const cells = B.board.cells;
    for (let i = 0; i < cells.length; i++) {
      const x = cells[m.Owner !== 1 ? cells.length - i - 1 : i];
      if (!x || x.Destroyed || x.Perk === 55 || x.Owner !== m.Owner) continue;
      for (const a of findAuraAbilities(m, aura, x)) if (checkAura(B, m, a, x)) out.push(ref(x, a));
    }
    return out;
  }
  /** BoardExtensions.GetAdjacent(m, dir, dist): dir 0 = towards the enemy, 1 = behind (from m's side). */
  function getAdjacent(board, m, dir, dist) {
    let d = m.Owner !== 1 ? 3 : 1; if (dir === 1) d = d === 1 ? 3 : 1;
    const x = m.Point.x + (d === 1 ? 1 : -1) * dist;
    return x < 0 || x >= board.Width ? null : board.get({ x, y: m.Point.y });
  }
  /**
   * DamageAttemptMutator.TryAttackAdjacent (attacks only): Chili (5) hits 1 pet behind for 5, perk 123 1 pet for 4, perk 26 2 pets for 3,
   * and an event SplashDamage hits 1 pet each side. Each looks up to 5 cells out for live pets of the target's team.
   */
  function tryAttackAdjacent(B, source, target, out, e, tryDamage) {
    if (!source || e.DamageType !== 0) return;
    const jobs = [];
    if (source.Perk === 5) jobs.push([1, 5, [1]]);
    else if (source.Perk === 123) jobs.push([1, 4, [1]]);
    else if (source.Perk === 26) jobs.push([2, 3, [1]]);
    if (e.SplashDamage != null && e.SplashDamage > 0) jobs.push([1, e.SplashDamage, [1, 0]]);
    for (const [count, amount, dirs] of jobs) {
      for (const dir of dirs) {
        let hit = 0;
        for (let i = 0; i < 5; i++) {
          const adj = getAdjacent(B.board, target, dir, i + 1);
          if (!adj || adj.Destroyed || adj.Dead || adj.Owner !== target.Owner) continue;
          const saved = [e.AttackerInitialPerk, e.AttackerInitialPerkMultiplier, e.DefenderInitialPerk, e.DefenderInitialPerkMultiplier];
          e.SourcePerk = source.Perk; e.AttackerInitialPerk = null; e.AttackerInitialPerkMultiplier = 1; e.DefenderInitialPerk = null; e.DefenderInitialPerkMultiplier = 1;
          const r = tryDamage(adj, source, e, amount);
          e.SourcePerk = null; [e.AttackerInitialPerk, e.AttackerInitialPerkMultiplier, e.DefenderInitialPerk, e.DefenderInitialPerkMultiplier] = saved;
          out.push(...r);
          if (++hit === count) break;
        }
      }
    }
  }
  /** DamageCalculationMinion.TryIncreaseAbilityTriggerCount: count the use; an aura at its limit goes to Exhausted. */
  function countAura(B, calc, r) {
    if (r.Template.TriggerLimit == null || !canAbilityCountLimit(B, r.Ability, r.Template)) return;
    r.Ability.TriggerCount++;
    if (r.Ability.TriggerCount < r.Template.TriggerLimit) return;
    (calc.Exhausted = calc.Exhausted || []).push({ Minion: r.Minion, Ability: r.Ability });
  }
  /** ListExtensions.FastShuffle: Fisher-Yates from the end with Next(0, n). */
  function fastShuffle(list, rand) { for (let n = list.length; n >= 2; n--) { const k = rand.next(0, n); const t = list[k]; list[k] = list[n - 1]; list[n - 1] = t; } return list; }
  const ORDER_KEYS = {
    0: [(m) => m.Health.Total, true], 1: [(m) => m.Health.Total, false], 4: [(m) => (D.minions[m.Enum] || {}).tier, true], 5: [(m) => (D.minions[m.Enum] || {}).tier, false],
    6: [(m) => m.Attack.Total, true], 7: [(m) => m.Attack.Total, false], 8: [(m) => m.Attack.Total + m.Health.Total, true], 9: [(m) => m.Attack.Total + m.Health.Total, false],
    10: [(m) => (m.Owner !== 1 ? m.Point.x : -m.Point.x), false], 11: [(m) => (m.Owner !== 1 ? -m.Point.x : m.Point.x), true],
    12: [(m) => (m.Attack.IsMax ? 1 : 0), false], 13: [(m) => (m.Health.IsMax ? 1 : 0), false], 14: [(m) => (m.Attack.IsMax && m.Health.IsMax ? 1 : 0), false],
    15: [(m) => (m.Level > 2 ? 1 : 0), false], 19: [(m) => m.Level, true], 20: [(m) => m.Level, false], 22: [(m) => m.Exp, true], 23: [(m) => m.Exp, false],
    21: [(m) => (m.Perk == null ? -1 : perkPositive(m.Perk) ? -1 : 1), true], 24: [(m) => (m.Perk != null && perkPositive(m.Perk) ? 1 : -1), true],
    25: [(m) => (m.Perk != null && perkPositive(m.Perk) ? -1 : 1), true],
  };
  /** MinionFinder.FindMinions(board, owner, aim, rand) */
  function findMinions(f, B, owner, aim, rand) {
    const board = B.board; let list = [];
    const types = f.Types;
    if (!types || !types.length || types.includes(0)) list = list.concat(f.IncludeDead ? board.findMinions(true, false) : board.findLiveMinions());
    if (!types || !types.length || types.includes(1)) list = list.concat(board.Relics.filter(Boolean));
    if (!list.length) return list;
    let out = list.filter((m) => predicate(f, B, m, owner, aim));
    if (f.Duplicates != null) unported('MinionFinder.Duplicates');
    if (f.Randomize || f.Limit != null) fastShuffle(out, rand);
    if (!f.ForceUnordered) {
      const keys = [];
      for (const o of f.Orders || []) {
        if (o === 2 || o === 3) { if (!owner) continue; keys.push([(m) => Math.abs(owner.Point.x - m.Point.x), o === 2]); continue; }
        if (o === 18 || o === 16 || o === 17) unported('MinionFinder order ' + o);
        const k = ORDER_KEYS[o]; if (!k) unported('MinionFinder order ' + o); keys.push(k);
      }
      if (f.Limit != null && owner) {
        if (owner.Owner === 2) keys.push([(m) => ((m.Owner === 1 && m.Perk === 28) || (m.Owner === 2 && m.Perk === 36) ? 1 : 0), true]);
        else if (owner.Owner === 1) keys.push([(m) => ((m.Owner === 2 && m.Perk === 28) || (m.Owner === 1 && m.Perk === 36) ? 1 : 0), true]);
      }
      if (keys.length) {
        const idx = out.map((m, i) => ({ m, i, k: keys.map(([fn]) => fn(m)) }));
        idx.sort((a, b) => { for (let j = 0; j < keys.length; j++) { const d = keys[j][1] ? b.k[j] - a.k[j] : a.k[j] - b.k[j]; if (d) return d; } return a.i - b.i; });
        out = idx.map((x) => x.m);
      }
    }
    if (f.UniqueLevels || f.UniqueTiers || f.UniqueAilments) unported('MinionFinder.Unique*');
    if (f.Limit != null) out = out.slice(0, f.Limit);
    if (f.Reverse) out.reverse();
    return out;
  }

  // ---------------------------------------------------------------- Targets (TargetsBase.GetTargets)
  /** ta: TargetsArgs {B, TriggerEvent, OwnerMinion, Aim, Random, Reversed} -> ItemId[] | null */
  function getTargets(t, ta) {
    const B = ta.B, board = B.board, owner = ta.OwnerMinion;
    if (t.Condition) { if (!owner) return null; const ca = { B, TriggerEvent: ta.TriggerEvent, Random: ta.Random, OwnerId: owner.Id, Reversed: ta.Reversed }; if (!conditionCheck(t.Condition, ca)) return null; }
    let out = getTargetsRaw(t, ta);
    if (!out) return null;
    if (owner && owner.Perk === 75 && !t.ImmuneToSilly) unported('Silly targets');
    if (t.RemoveRelics) out = out.filter((id) => { const m = board.findMinion(id); const ty = m ? (D.minions[m.Enum] || {}).type : 0; return !(ty !== 0 && ty !== 2); });
    if (owner && owner.CurrentTargetsThisTurn && owner.CurrentTargetsThisTurn.length) unported('TargetsBase persisted targets');
    return out;
  }
  function getTargetsRaw(t, ta) {
    const B = ta.B, board = B.board, owner = ta.OwnerMinion; const tn = short(T(t));
    switch (tn) {
      case 'TargetsEmpty': return [];
      case 'TargetsSelf': {
        if (!owner) return null;
        if (t.Alive && !owner.IsAlive) return null;
        if (t.ExcludeType != null && owner.Enum === t.ExcludeType) return [];
        if (!t.MinionFinder || predicate(t.MinionFinder, B, owner, null)) return [owner.Id];
        return null;
      }
      case 'TargetsTriggerSource': {
        if (ta.TriggerEvent && ta.TriggerEvent.cls === 'Force') unported('TargetsTriggerSource on Force');
        const s = sourceOf(ta.TriggerEvent); if (!s) return [];
        if (t.MinionFinder) { const m = board.findMinion(s); if (!m || !predicate(t.MinionFinder, B, m, owner)) return []; }
        return [s];
      }
      case 'TargetsTriggerTarget': {
        if (!t.ImmuneToSilly && owner && owner.Perk === 75) unported('Silly targets');
        const x = targetOf(ta.TriggerEvent); if (x !== undefined) return x ? [x] : [];
        unported('TargetsTriggerTarget without ITriggerTarget');
      }
      case 'TargetsLastSummoned': return owner ? (owner.LastSummoned || []).slice() : [];
      case 'TargetsFind': {
        const f = t.MinionFinder; const limit = t.Limit ? paramValue(t.Limit, paramArgs(ta)) : null;
        if (f.Duplicates == null) f.Alive = true; // the game sets this on the shared finder
        f.Limit = limit;
        let origin = owner;
        if (t.RelativeOrigin != null) { origin = null; const ev2 = ta.TriggerEvent; if (t.RelativeOrigin === 2 && sourceOf(ev2)) origin = board.findMinion(sourceOf(ev2)); else if (t.RelativeOrigin === 3 && targetOf(ev2)) origin = board.findMinion(targetOf(ev2)); }
        let list = findMinions(f, B, origin, ta.Aim, ta.Random);
        if (t.SecondaryMinionFinder) unported('TargetsFind.SecondaryMinionFinder');
        if (!t.ImmuneToSilly && owner && owner.Perk === 75) unported('Silly targets');
        return list.map((m) => m.Id);
      }
      case 'TargetsRelative': {
        let origin = owner;
        if (t.RelativeToSource && sourceOf(ta.TriggerEvent)) origin = board.findMinion(sourceOf(ta.TriggerEvent));
        if (!origin) return null;
        const out = [];
        if (t.IncludeSelf && (!t.MinionFinder || predicate(t.MinionFinder, B, origin, origin))) out.push(origin.Id);
        const pa = paramArgs(ta);
        const scan = (dir) => {
          let n = paramValue(t.Distance, pa);
          for (let i = 0; i < n; i++) {
            const p = { x: origin.Point.x + dir * (i + 1), y: origin.Point.y };
            if (p.x < 0 || p.x >= board.Width) break;
            const m = board.get(p);
            if (!t.IncludeDead && !(m && m.IsAlive)) { n++; continue; }
            if (!t.MinionFinder || predicate(t.MinionFinder, B, m, origin)) out.push(m.Id);
            else if (t.KeepFinding) n++;
          }
        };
        const ahead = origin.Owner === 1 ? 1 : -1; // Position 0 = ahead, 1 = behind, 2 = both (behind is scanned first)
        if (t.Position === 1 || t.Position === 2) scan(-ahead);
        if (t.Position === 0 || t.Position === 2) scan(ahead);
        if (t.Amount) { const a = paramValue(t.Amount, pa); if (a < out.length) unported('TargetsRelative.Amount random take'); }
        return out;
      }
      case 'TargetsAbsolute': {
        if (!owner) return null;
        let team = t.Team; if (owner.Owner === 2) team = team === 0 ? 1 : 0;
        let x = 0, step = 0;
        if (team === 0) step = 1; else if (team === 1) { x = 9; step = -1; }
        let nth = null;
        if (t.Position === 2 || t.Position === 3) { x += step * 4; nth = 1; step = -step; }
        if (t.Position === 1 || t.Position === 3) nth = 2;
        if (t.Position === 4) nth = 3;
        const out = []; let found = 0, last = null; let end = t.Offset - 1;
        for (let i = 0; i <= end && i <= 9; i++, x += step) {
          const m = board.get({ x, y: owner.Point.y });
          if (!m || (!t.IncludeDead && m.Dead) || m.Destroyed) { end++; continue; }
          if (!t.MinionFinder || predicate(t.MinionFinder, B, m, owner)) { found++; last = m; if (nth != null && nth !== found) { end++; continue; } out.push(m.Id); }
          else if (t.KeepFinding) end++;
        }
        if (!out.length && last) out.push(last.Id);
        return out;
      }
      case 'TargetsScan': {
        if (!owner) return null;
        const out = [];
        if (!t.MinionFinder) return out;
        t.MinionFinder.ForceUnordered = true; // the game sets this on the shared finder
        let list = findMinions(t.MinionFinder, B, owner, ta.Aim, ta.Random);
        if (!list.length) return out;
        if (board.ReverseMinionAccess) list = list.slice().reverse();
        const move = owner.Owner === 1 ? 1 : 3; // MinionExtensions.GetMoveDirection
        const dir = t.Direction ? (move === 1 ? 3 : move === 3 ? 1 : move === 0 ? 2 : 0) : move; // DirectionUtility.Relative
        if (!t.Amount) return out;
        const amount = paramValue(t.Amount, paramArgs(ta));
        for (let i = 0; i < amount; i++) {
          const idx = dir === 3 ? list.length - i - 1 : i;
          let m;
          if (!t.Wrap) { m = idx >= 0 && idx < list.length ? list[idx] : null; if (!m) return out; }
          else { m = list[((idx % list.length) + list.length) % list.length]; if (!m) break; }
          out.push(m.Id);
        }
        return out;
      }
      default: return unported(tn);
    }
  }
  const paramArgs = (ta, targetId) => ({ B: ta.B, TargetId: targetId || null, SourceId: ta.OwnerMinion ? ta.OwnerMinion.Id : null,
    TriggerSourceId: sourceOf(ta.TriggerEvent) || null, TriggerTargetId: targetOf(ta.TriggerEvent) || null, AimId: ta.Aim || null, Random: ta.Random, TriggerEvent: ta.TriggerEvent });

  // ---------------------------------------------------------------- Conditions
  /** ConditionBase.Check(ConditionArgs {B, TriggerEvent, Random, OwnerId, Reversed}) */
  function conditionCheck(c, ca) {
    const owner = ca.OwnerId ? ca.B.board.findMinion(ca.OwnerId) : null;
    if (c.TrueWhenSilly && owner && owner.Perk === 75) return true;
    let r = conditionBase(c, ca, owner);
    if (c.Invert) r = !r;
    return r;
  }
  function conditionBase(c, ca, owner) {
    const B = ca.B; const t = short(T(c));
    // ParameterArgs(ConditionArgs): Source and Target are both the owner
    const pa = { B, SourceId: ca.OwnerId, TargetId: ca.OwnerId, TriggerSourceId: sourceOf(ca.TriggerEvent) || null, TriggerTargetId: targetOf(ca.TriggerEvent) || null, Random: ca.Random, TriggerEvent: ca.TriggerEvent };
    switch (t) {
      case 'ConditionBattle': return !!B.board.IsBattle;
      case 'ConditionAll': return (c.Conditions || []).every((x) => conditionCheck(x, ca));
      case 'ConditionAny': return (c.Conditions || []).some((x) => conditionCheck(x, ca));
      case 'ConditionInt': { const v = paramValue(c.Parameter, pa); if (c.Min != null && v < c.Min) return false; if (c.Max != null && c.Max < v) return false; return true; }
      case 'ConditionIsPositive': { const v = paramValue(c.Parameter, pa); return c.IncludeZero ? v > -1 : v > 0; }
      case 'ConditionHasMinion': { const n = c.MinionFinder ? findMinions(c.MinionFinder, B, owner, null, ca.Random).length : B.board.cells.filter((m) => m && m.IsAlive).length; return c.MustHave <= n; }
      case 'ConditionCountMinions': { const n = c.MinionFinder ? findMinions(c.MinionFinder, B, owner, null, ca.Random).length : B.board.cells.filter((m) => m && m.IsAlive).length; return !(c.Maximum != null && c.Maximum < n) && !(c.Minimum != null && n < c.Minimum); }
      case 'ConditionMinion': {
        const ids = getTargets(c.Target, { B, TriggerEvent: ca.TriggerEvent, OwnerMinion: owner, Aim: null, Random: ca.Random });
        if (!ids) return false;
        for (const id of ids) {
          const m = B.board.findMinion(id); if (!m) return false;
          if (!predicate(c.MinionFinder, B, m, owner)) return false;
          if (c.HasEventPerk) { const e = ca.TriggerEvent; if (!(e && e.cls === 'PerkLost' && e.Perk === m.Perk)) return false; }
        }
        return true;
      }
      case 'ConditionHighestTier': case 'ConditionLowestTier': {
        // every other candidate (finder, else every grid pet) must have a strictly lower (higher) tier than the owner
        if (!owner) return false;
        const list = c.MinionFinder ? findMinions(c.MinionFinder, B, owner, null, ca.Random) : B.board.cells.filter(Boolean);
        const hi = t === 'ConditionHighestTier';
        for (const m of list) { if (idEq(m.Id, owner.Id)) continue; const a = minionTier(m), o = minionTier(owner); if (hi ? !(a < o) : !(o < a)) return false; }
        return true;
      }
      case 'ConditionHasTrumpets': { if (!owner) return false; const v = getTrumpets(B.board, owner.Owner); if (c.Min != null && v < c.Min) return false; if (c.Max != null && c.Max < v) return false; return true; }
      case 'ConditionHasRelic': return B.board.Relics.some((m) => m && owner && m.Owner === owner.Owner && (D.minions[m.Enum] || {}).type !== 1 && (!c.MinionFinder || predicate(c.MinionFinder, B, m, owner)));
      default: return unported(t);
    }
  }

  // ---------------------------------------------------------------- Triggers (TriggerBase.IsTriggered)
  const TRIGGER_EVENT = { TriggerStartBattle: 'StartBattle', TriggerBeforeStartBattle: 'BeforeStartBattle', TriggerBeforeStartBattleEnded: 'StartBattleEnded',
    TriggerAttack: 'Attack', TriggerBeforeAttack: 'BeforeAttack', TriggerBeforeAttackEarly: 'BeforeAttackEarly', TriggerBeforeDeath: 'BeforeDeath', TriggerDeath: 'Death',
    TriggerDeathEarly: 'DeathEarly', TriggerHurt: 'Hurt', TriggerHurtEarly: 'HurtEarly', TriggerKill: 'Kill', TriggerSummon: 'Summon', TriggerInfront: 'Infront',
    TriggerPerkGained: 'PerkGained', TriggerPerkLost: 'PerkLost', TriggerCharged: 'Charged', TriggerPushed: 'Pushed', TriggerTransform: 'Transform', TriggerBeforeTransform: 'BeforeTransform',
    TriggerLevelup: 'Levelup', TriggerExpGained: 'GiveExperience', TriggerManaGained: 'ManaGained', TriggerFlung: 'Flung', TriggerPetActivated: 'PetActivated',
    TriggerHealthGained: 'HealthGained', TriggerLostAttack: 'LostAttack', TriggerBuffGained: 'BuffGained', TriggerPlayedSpellOn: 'PlayedSpellOn',
    TriggerSell: 'Sell', TriggerBeforeSell: 'BeforeSell', TriggerPlayMinion: 'Play', TriggerSpendAttack: 'SpendAttack', TriggerSpendHealth: 'SpendHealth' };
  const SHOP_ONLY = new Set(['TriggerEndTurn', 'TriggerStartTurn', 'TriggerRoll', 'TriggerBeforeRoll', 'TriggerGoldSpent', 'TriggerUpgradeShopTier', 'TriggerPlaySpell', 'TriggerSell', 'TriggerBeforeSell', 'TriggerPlayMinion', 'TriggerStockMinions']);
  /** returns { Status: 0 ok | 1 not triggered | 2 condition failed, Loud } */
  function isTriggered(tr, args) {
    if (!args.Force && !isTriggeredRaw(tr, args)) return { Status: 1, Loud: false };
    if (args.TriggerPhase !== 0) return checkConditions(tr, args);
    return { Status: 0, Loud: false };
  }
  function checkConditions(tr, args) {
    if (!tr.Conditions || !tr.Conditions.length) return { Status: 0, Loud: false };
    const ca = { B: args.B, TriggerEvent: args.TriggerEvent, Random: args.Random, OwnerId: args.OwnerId, Reversed: args.Reversed };
    for (const c of tr.Conditions) if (conditionCheck(c, ca) === !!tr.Invert) return { Status: 2, Loud: !!c.Fumble };
    return { Status: 0, Loud: false };
  }
  function isTriggeredRaw(tr, args) {
    const e = args.TriggerEvent; const t = short(T(tr)); const B = args.B;
    const owner = args.OwnerId ? B.board.findMinion(args.OwnerId) : null;
    if (SHOP_ONLY.has(t)) return false;
    switch (t) {
      case 'TriggerStartBattle': return !!e && e.cls === 'StartBattle';
      case 'TriggerBeforeStartBattle': return !!e && e.cls === 'BeforeStartBattle';
      case 'TriggerBeforeStartBattleEnded': return !!e && e.cls === 'StartBattleEnded';
      case 'TriggerAllEnemiesFaint': return !!e && e.cls === 'AllFaint' && !!owner && e.Owner === (owner.Owner === 1 ? 2 : owner.Owner === 2 ? 1 : 0);
      case 'TriggerAllFriendsFaint': return !!e && e.cls === 'AllFaint' && !!owner && e.Owner === owner.Owner;
      case 'TriggerEmptyFriendlyFront': return !!e && e.cls === 'EmptyFront' && !!owner && e.Owner === owner.Owner;
      case 'TriggerComposite': return (tr.Triggers || []).some((x) => isTriggered(x, args).Status === 0);
      case 'TriggerAura': return false;
      default: break;
    }
    const want = TRIGGER_EVENT[t]; if (!want) return unported(t);
    if (!e || e.cls !== want) return false;
    if (!byEvent(t, tr, e)) return false;
    const id = t === 'TriggerExpGained' ? e.TargetId : sourceOf(e);
    const m = id ? B.board.findMinion(id) : null;
    if (tr.MinionFinder && !predicate(tr.MinionFinder, B, m, owner)) return false;
    return true;
  }
  function byEvent(t, tr, e) {
    switch (t) {
      case 'TriggerHurt': if (!tr.IncludeZero && e.Amount === 0) return false; if (tr.CanRestore && e.Amount - (e.Restored || 0) < 1) return false; return true;
      case 'TriggerHurtEarly': return !!tr.IncludeZero || e.Amount !== 0;
      case 'TriggerKill': return !idEq(e.SourceId, e.TargetId);
      case 'TriggerAttack': return tr.OnlyAttackType == null || (e.AttackType || 0) === tr.OnlyAttackType;
      case 'TriggerBeforeAttack': if (tr.AttackType != null && (e.AttackType || 0) !== tr.AttackType) return false; if (tr.FirstAttack != null && !!e.IsFirstAttack !== tr.FirstAttack) return false; return true;
      case 'TriggerCharged': return e.Ability === tr.Ability;
      case 'TriggerPetActivated': return tr.Ability == null || e.AbilityEnum === tr.Ability;
      case 'TriggerPerkGained': if (e.Disabled && !tr.AllowDisabledTrigger) return false; if (tr.Perk != null && e.Perk !== tr.Perk) return false; if (tr.Positive != null && perkPositive(e.Perk) !== tr.Positive) return false; return true;
      case 'TriggerPerkLost': if (tr.LostPerk != null && e.Perk !== tr.LostPerk) return false; if (tr.Positive != null && perkPositive(e.Perk) !== tr.Positive) return false; if (tr.ExcludeReplaced && e.ReplacedBy != null) { if (tr.ExcludeReplacedPositive == null) return false; if (perkPositive(e.ReplacedBy) === tr.ExcludeReplacedPositive) return false; } return true;
      case 'TriggerBuffGained': if (tr.Health && !(e.HealthValue > 0)) return false; if (tr.Attack && !(e.AttackValue > 0)) return false; return true;
      case 'TriggerPushed': case 'TriggerTransform': if ((t === 'TriggerPushed' && tr.Type != null) || (t === 'TriggerTransform' && (tr.IgnoreBack || tr.IgnoreStacking))) unported(t + ' filters'); return true;
      default: return true;
    }
  }

  // ---------------------------------------------------------------- Ability.Triggered / limits
  const canAbilityCountLimit = (B, model, ab) => { if (!model || !ab || ab.TriggerLimit == null) return false; const ty = ab.TriggerLimitType || 0; return ty === 0 || (ty === 1 && B.board.IsBattle) || (ty === 2 && !B.board.IsBattle); };
  const canMinionAbilityTrigger = (B, model, ab) => !canAbilityCountLimit(B, model, ab) || model.TriggerCount < ab.TriggerLimit;
  /** Ability.Triggered -> {Status, Loud} (0 Success, 1 NotTriggered, 2 Fail, 3 limit) */
  function abilityTriggered(ab, model, trig, force, B, rand, ownerId) {
    if (!ab || !ab.Trigger || (model && (model.Disabled || model.DisabledTemp))) return { Status: 1, Loud: false };
    const owner = B.board.findMinion(ownerId);
    if (owner) {
      if (owner.Location === 6) return { Status: 1, Loud: false };
      if (ab.Perk == null) { if (ab.Enum !== 686 && !owner.Abilities.some((a) => a.Enum === ab.Enum)) return { Status: 1, Loud: false }; }
      else if (owner.Perk !== ab.Perk && ab.Perk !== 89) return { Status: 1, Loud: false };
    }
    const r = isTriggered(ab.Trigger, { B, TriggerEvent: trig, Force: force, Random: rand, OwnerId: ownerId, TriggerPhase: 1, Reversed: false });
    if (r.Status !== 0) return r;
    if (!model || canMinionAbilityTrigger(B, model, ab)) return { Status: 0, Loud: false };
    return { Status: 3, Loud: true };
  }

  // ---------------------------------------------------------------- BoardExtensions.TryTriggerMinion
  function tryTriggerMinion(B, minion, trig, rand) {
    const out = [];
    if (!minion.Abilities) return out;
    for (const model of minion.Abilities) {
      const ab = getAbility(model.Enum, model.Level);
      // Ability.PowerTriggered -> Try<AddMinionPower>(1)
      if (ab && ab.PowerTrigger && isTriggered(ab.PowerTrigger, { B, TriggerEvent: trig, Force: false, Random: rand, OwnerId: minion.Id, TriggerPhase: 1 }).Status === 0 && ab.PowerAbility != null)
        out.push(wrap('Try', ev('AddMinionPower', { Owner: 0, TargetId: minion.Id, Amount: 1, Ability: ab.PowerAbility, ResultCurrent: null })));
      if (minion.Perk === 55 && model.Enum !== 686 && model.Enum !== 806) continue; // Deaf
      // Ability.ChargeTriggered -> Try<AddMinionCharge>(trigger value or 1)
      if (ab && ab.Charges != null && ab.Charges !== 0 && ab.ChargeTrigger && !(ab.ChargesMax != null && ab.ChargesMax <= (model.Charges || 0)) &&
        isTriggered(ab.ChargeTrigger, { B, TriggerEvent: trig, Force: false, Random: rand, OwnerId: minion.Id, TriggerPhase: 1 }).Status === 0)
        out.push(wrap('Try', ev('AddMinionCharge', { Owner: 0, TargetId: minion.Id, Ability: model.Enum, Amount: trig.Value !== undefined ? trig.Value : 1 })));
      const r = abilityTriggered(ab, model, trig, false, B, rand, minion.Id);
      if (r.Status === 1 || r.Status === 3) continue;
      const at = ev('AbilityTriggered', { Owner: minion.Owner, Ability: model.Enum, Level: model.Level, MinionId: minion.Id, Aim: null, TriggerEvent: trig, UpdateLevel: true, Type: 0,
        Force: false, FailCause: r, PerkSource: null, RemovePerk: null, EffectMultiplier: null });
      if (model.AlwaysIgnoreMinionLevel) at.UpdateLevel = false;
      if (ab && ab.TriggerLevel && trig.TriggerLevel != null) { at.UpdateLevel = false; at.Level = trig.TriggerLevel; }
      out.push(r.Status === 2 ? wrap('Fail', at) : wrap('Do', at));
    }
    if (minion.Perk != null) {
      const pk = (D.perks || {})[minion.Perk]; // PerkConstants.GetPerk returns null for some perks (e.g. Date, Sticky): no perk abilities
      for (const e of (pk && pk.abilities) || []) {
        const ab = getAbility(e, 1);
        const r = abilityTriggered(ab, null, trig, false, B, rand, minion.Id);
        if (r.Status !== 0) continue;
        const at = ev('AbilityTriggered', { Owner: minion.Owner, Ability: e, Level: 1, MinionId: minion.Id, Aim: null, TriggerEvent: trig, UpdateLevel: false, Type: pk.positive ? 1 : 2,
          Force: false, FailCause: r, PerkSource: minion.Perk, RemovePerk: null, EffectMultiplier: null });
        out.push(wrap('Do', at));
      }
    }
    for (const x of out) x.Depth = trig.Depth + 1;
    return out;
  }

  // ---------------------------------------------------------------- ActivateAbilityTrySystem / ActivateAbilityDoSystem
  function activateAbilityTry(B, e) {
    const t = e.Event; const board = B.board;
    const minion = board.findMinion(t.MinionId); if (!minion) return;
    if (t.UpdateLevel) t.Level = minion.Level;
    const model = minion.Abilities.find((a) => a.Enum === t.Ability) || null;
    const rand = B.randomizer(t.Owner);
    const ab = getAbility(t.Ability, t.Level);
    if (!ab) return;
    if (abilityTriggered(ab, model, t.TriggerEvent, t.Force, B, rand, t.MinionId).Status !== 0) return;
    const acts = buildRepeatActivations(B, e, minion, model, ab, rand);
    if (ab.Enum === 928 || hasEffect(model, 'EffectJumpAttack')) unported('ActivateAbilityTry jump-attack precompute');
    // Transforms are run once ahead (Ability.Activate, consuming RNG) to fire BeforeTransform on the pets about to change.
    // Only every other activation gets this pass: each one handled is removed from the list while the index still advances.
    if (ab.Enum === 941 || ab.Enum === 931 || hasEffect(model, 'EffectTransform')) {
      const perkOnly = !minion.Abilities.some((x) => hasEffect(x, 'EffectTransform')) && (minion.Perk === 94 || minion.Perk === 103);
      for (let i = 0; i < acts.length; i++) {
        const a = acts[i];
        const r = activate(B, ab, model, a.TriggerEvent, a.Force, a.MinionId, a.Aim, B.randomizer(a.Owner), a.EffectMultiplier, perkOnly, a.Reversed);
        if (!r || !r.length) return;
        for (const x of flattenEvents(r)) if (x.cls === 'Try' && x.Event && x.Event.cls === 'TransformMinion') tryActivate(B, ev('BeforeTransform', { SourceId: x.Event.Target }));
        B.add(wrap('Try', a)); acts.splice(i, 1);
      }
    }
    for (const a of acts) B.add(wrap('Try', a));
    B.add(wrap('Done', t));
    if (t.RemovePerk != null) unported('AbilityTriggered.RemovePerk');
  }
  /**
   * BoardExtensions.GetPerkMultiplier(m): PerkMultiplier (default 1); times the level of an own ability whose PerkMultiplier names
   * this perk, otherwise (in battle) times the pet's aura-2 value.
   */
  function getPerkMultiplier(B, m) {
    if (!m || m.Perk == null) return 1;
    const mult = m.PerkMultiplier ?? 1;
    const a = m.Abilities.find((x) => { const ab = getAbility(x.Enum, x.Level); return ab && ab.PerkMultiplier != null; });
    if (a && getAbility(a.Enum, a.Level).PerkMultiplier === m.Perk) return mult * a.Level;
    if (B.board.IsBattle) { const v = getAuraValue(m, 2); if (v != null) return v * mult; }
    return mult;
  }
  /** BoardExtensions.GetAuraValue(m, aura): sum of the MagicVariable of the pet's own abilities with that AuraEnum (null if none). */
  function getAuraValue(m, aura) {
    if (!m || (D.minions[m.Enum] || {}).relicType === 1 || m.Perk === 55) return null;
    let v = null;
    for (const a of m.Abilities) { const ab = getAbility(a.Enum, a.Level); if (ab && ab.AuraEnum === aura) v = (v ?? 0) + (ab.MagicVariable || 0); }
    return v;
  }
  /** BoardExtensions.GetNegativePerkMultiplier(m): 1 (pet 748: its level), plus the MagicVariable of ability 388 on non-deaf enemies, times PerkMultiplier. */
  function getNegativePerkMultiplier(B, m) {
    if (!m) return 1;
    let v = m.Enum === 748 ? m.Level : 1;
    for (const x of B.board.cells) {
      if (!x || x.Owner === m.Owner || x.Perk === 55) continue;
      for (const a of x.Abilities) if (a.Enum === 388) { const ab = getAbility(a.Enum, a.Level); v += (ab && ab.MagicVariable) || 0; }
    }
    return m.PerkMultiplier != null ? v * m.PerkMultiplier : v;
  }
  /** MinionExtensions.HasEffect<T>(model): a visible ability with a pair whose effect is T, looking inside EffectComposite. */
  function hasEffect(model, type) {
    if (!model) return false; const ab = getAbility(model.Enum, model.Level); if (!ab || ab.HiddenTriggersAndEffects) return false;
    const has = (e) => !!e && (short(T(e)) === type || (short(T(e)) === 'EffectComposite' && (e.Effects || []).some(has)));
    return (ab.Pairs || []).some((p) => has(p.Effect));
  }
  /**
   * MinionExtensions.HasTrigger<T>(m, filter): a visible ability whose (non-hidden) trigger is one of the types, looking inside
   * TriggerComposite. ownOnly is the filter the Has*Effect helpers pass: the trigger's MinionFinder has Other == false.
   */
  function hasTrigger(m, types, ownOnly) {
    const has = (t) => {
      if (!t || t.Hidden) return false;
      if (types.includes(short(T(t))) && (!ownOnly || (t.MinionFinder && t.MinionFinder.Other === false))) return true;
      return short(T(t)) === 'TriggerComposite' && (t.Triggers || []).some(has);
    };
    return m.Abilities.some((a) => { const ab = getAbility(a.Enum, a.Level); return ab && !ab.HiddenTriggersAndEffects && has(ab.Trigger); });
  }
  const hasPlayEffect = (m) => hasTrigger(m, ['TriggerPlayMinion'], true);
  const hasSellEffect = (m) => hasTrigger(m, ['TriggerSell'], true) || hasTrigger(m, ['TriggerBeforeSell'], true);
  const hasHurtEffect = (m) => hasTrigger(m, ['TriggerHurt'], true);
  const hasDeathEffect = (m) => hasTrigger(m, ['TriggerDeath'], true) || hasTrigger(m, ['TriggerBeforeDeath'], true);
  /** All events inside CastEffects wrappers, depth first. */
  function flattenEvents(list) {
    const out = [];
    const walk = (e) => { if (!e) return; if (e.cls === 'CastEffectsSequentially' || e.cls === 'CastEffectsParallel') e.CastEffects.forEach(walk); else if (e.cls === 'CastEffect') e.EffectResult.Events.forEach(walk); else out.push(e); };
    list.forEach(walk); return out;
  }
  /** ActivateAbilityTrySystem.TryActivate(trigger): triggers resolved at once, without tie-breaks; only Do<AbilityTriggered> results are kept, as their activations. */
  function tryActivate(B, trig) {
    for (const m of B.board.findMinions(false, false)) {
      const res = tryTriggerMinion(B, m, trig, B.randomizer(m.Owner)) || [];
      for (const r of res) {
        if (!(r.cls === 'Do' && r.Event && r.Event.cls === 'AbilityTriggered')) continue;
        const t = r.Event; const mm = B.board.findMinion(t.MinionId); if (!mm) continue;
        const model = mm.Abilities.find((x) => x.Enum === t.Ability) || null;
        for (const a of buildRepeatActivations(B, r, mm, model, getAbility(t.Ability, t.Level), B.randomizer(t.Owner))) B.add(wrap('Try', a));
      }
    }
  }
  function newActivate(t, n) {
    return ev('AbilityActivate', { Owner: t.Owner, Ability: t.Ability, MinionId: t.MinionId, Level: t.Level, Aim: t.Aim, TriggerEvent: t.TriggerEvent, Type: t.Type, Reversed: false,
      Force: t.Force, RepeatIndex: 0, RepeatMax: 0, DisableAfterTemp: t.DisableAfterTemp || false, FailCause: { Status: 0, Loud: false }, MinionActivationNumber: n,
      EffectMultiplier: t.EffectMultiplier, PrecomputedEvents: null });
  }
  function buildRepeatActivations(B, e, minion, model, ab, rand) {
    const t = e.Event; const list = [];
    let reps = ab.Repeat ?? 1;
    if (ab.RepeatParameter) reps = paramValue(ab.RepeatParameter, { B, TargetId: minion.Id, SourceId: minion.Id, TriggerSourceId: sourceOf(t.TriggerEvent) || null, TriggerTargetId: targetOf(t.TriggerEvent) || null, Random: rand, TriggerEvent: t.TriggerEvent });
    const base = ab.Repeat ?? 1;
    for (let i = 0; i < reps; i++) list.push(newActivate(t, ++minion.AbilityActivations));
    if (t.Type === 1) { const extra = getPerkMultiplier(B, minion) - 1; for (let i = 0; i < extra; i++) for (let j = 0; j < base; j++) { const a = newActivate(t, ++minion.AbilityActivations); a.Force = true; a.Level = 1; list.push(a); } }
    if (t.Type === 2) { const extra = getNegativePerkMultiplier(B, minion) - 1; for (let i = 0; i < extra; i++) for (let j = 0; j < base; j++) { const a = newActivate(t, ++minion.AbilityActivations); a.Force = true; a.Level = 1; a.Reversed = minion.Abilities.some((x) => x.Enum === 839); list.push(a); } }
    if (t.Type === 0 && !(ab.RepeatFromAuraDisabled || t.RepeatFromAuraDisabled) && B.hooks.auraRepeats) B.hooks.auraRepeats(B, e, minion, model, ab, list);
    return list;
  }
  function activateAbilityDo(B, e) {
    const a = e.Event; const board = B.board;
    const minion = board.findMinion(a.MinionId);
    const model = minion ? minion.Abilities.find((x) => x.Enum === a.Ability) || null : null;
    const ab = getAbility(a.Ability, a.Level);
    if (model && !canMinionAbilityTrigger(B, model, ab)) return;
    const rand = B.randomizer(e.Owner);
    const events = a.PrecomputedEvents && a.PrecomputedEvents.length ? a.PrecomputedEvents : activate(B, ab, model, a.TriggerEvent, a.Force, a.MinionId, a.Aim, rand, a.EffectMultiplier, false, a.Reversed);
    if (!events || !events.length) return;
    B.add(events);
    B.add(wrap('Done', a));
    if (ab && ab.ManaSpender) unported('ManaSpender');
    if (model) { if (canAbilityCountLimit(B, model, ab)) model.TriggerCount++; if (a.DisableAfterTemp) model.DisabledTemp = true; }
  }

  // ---------------------------------------------------------------- Ability.Activate
  function activate(B, ab, model, trig, force, ownerId, aim, rand, effectMultiplier, perkOnly, reversed) {
    if (!ab || !ab.Pairs || !ab.Trigger) return null;
    const board = B.board; const owner = board.findMinion(ownerId);
    if (!owner || owner.Location === 6) return null;
    if (!reversed && ab.Perk != null) { const pk = (D.perks || {})[ab.Perk]; if (pk && !pk.positive && B.hooks.ailmentReversed) reversed = B.hooks.ailmentReversed(B, owner); }
    const targs = { B, TriggerEvent: trig, Force: force, Random: rand, OwnerId: ownerId, TriggerPhase: 1, Reversed: reversed };
    if (isTriggered(ab.Trigger, targs).Status !== 0) return [];
    if (checkConditions(ab.Trigger, targs).Status !== 0) return [];
    if (model) model.ActivatedCount++;
    const outer = [];
    if (ab.Trigger.TypeLimit != null) {
      trig.Exhausted = trig.Exhausted || {};
      const n = trig.Exhausted[owner.Enum] || 0; if (ab.Trigger.TypeLimit <= n) return [];
      trig.Exhausted[owner.Enum] = n + 1;
    }
    owner.LastSummoned = [];
    const parallel = !!ab.ForceParallelEffectsRenderings;
    const wrapList = (list) => ev(parallel ? 'CastEffectsParallel' : 'CastEffectsSequentially', { CastEffects: list });
    for (const pair of ab.Pairs) {
      if (perkOnly && !(pair.Effect && pair.Effect.PerkSource != null)) continue;
      const ta = { B, TriggerEvent: trig, OwnerMinion: owner, Aim: aim, Random: rand, Reversed: reversed };
      const targets = getTargets(pair.Targets, ta);
      const ga = { B, Level: ab.Level, Owner: owner.Owner, TargetIds: targets, SourceId: owner.Id, TriggerEvent: trig, Random: rand, EffectMultiplier: effectMultiplier, Reversed: reversed, AimId: aim };
      const effects = short(T(pair.Effect)) === 'EffectComposite' ? null : [pair.Effect];
      if (effects) { const r = effectGlobal(pair.Effect, ga); if (r && r.length) outer.push(ev('CastEffect', { Owner: owner.Owner, EffectResult: { Events: r, Effect: pair.Effect } })); }
      else { const inner = []; for (const sub of pair.Effect.Effects || []) { const r = effectGlobal(sub, ga); if (r && r.length) inner.push(ev('CastEffect', { Owner: owner.Owner, EffectResult: { Events: r, Effect: sub } })); } if (inner.length) outer.push(wrapList(inner)); }
      if (!pair.Global && (!targets || !targets.length)) { if ((ab.Interuptor || 0) === 0) return outer; continue; } // returned unwrapped (may be empty)
      const perTarget = [];
      for (const tid of targets || []) {
        const sa = { B, Level: ab.Level, Owner: owner.Owner, TargetId: tid, SourceId: owner.Id, TriggerEvent: trig, Random: rand, EffectMultiplier: effectMultiplier, Reversed: reversed };
        if (effects) { const r = effectSingle(pair.Effect, sa); if (r && r.length) perTarget.push(ev('CastEffect', { Owner: owner.Owner, EffectResult: { Events: r, Effect: pair.Effect } })); }
        else { const sub = []; for (const x of pair.Effect.Effects || []) { const r = effectSingle(x, sa); if (r && r.length) sub.push(ev('CastEffect', { Owner: owner.Owner, EffectResult: { Events: r, Effect: x } })); } if (sub.length) outer.push(wrapList(sub)); } // a composite target's wrapper goes straight to the outer list
      }
      if (perTarget.length) outer.push(ev('CastEffectsParallel', { CastEffects: perTarget }));
      if (ab.PersistTargets) unported('PersistTargets');
      if ((ab.Interuptor || 0) === 1) return outer; // returned unwrapped
    }
    return [wrapList(outer)];
  }

  // ---------------------------------------------------------------- Effects (OnGlobal / OnSingle)
  const singleParamArgs = (sa) => ({ B: sa.B, TargetId: sa.TargetId, SourceId: sa.SourceId, TriggerSourceId: sourceOf(sa.TriggerEvent) || null, TriggerTargetId: targetOf(sa.TriggerEvent) || null,
    AimId: null, Random: sa.Random, TriggerEvent: sa.TriggerEvent, Owner: sa.Owner });
  /** Effect classes that override EffectBase.OnGlobal (from the metadata; the base returns null). */
  const GLOBAL_EFFECTS = new Set(['EffectAddSharedPower','EffectAddShopMinion','EffectAddShopSpell','EffectBalance','EffectBuffShopMinions','EffectBuffShopPermanent','EffectChangeVictoryMax','EffectChooseMinion','EffectChooseSpell','EffectComposite','EffectCondition','EffectDiscountMinion','EffectDiscountSpell','EffectExchangeStats','EffectFreezeShop','EffectFumble','EffectGainGold','EffectGainLives','EffectGainRolls','EffectGainTrumpets','EffectRandom','EffectRepeat','EffectReplaceMinionShop','EffectReplaceSpellShop','EffectRollShop','EffectSetGold','EffectSetPrice','EffectShuffle','EffectSort','EffectSpendGold','EffectStealMinion','EffectSummonGlobal','EffectSummonRetriever','EffectSwallowShop']);
  function effectGlobal(eff, ga) {
    const t = short(T(eff));
    if (!GLOBAL_EFFECTS.has(t)) return null;
    switch (t) {
      case 'EffectGainTrumpets': {
        // EffectGainTrumpets.OnGlobal
        if (!eff.Points) return null;
        const points = paramValue(eff.Points, { B: ga.B, SourceId: ga.SourceId, TargetId: null, TriggerSourceId: sourceOf(ga.TriggerEvent) || null, TriggerTargetId: targetOf(ga.TriggerEvent) || null,
          Random: ga.Random, TriggerEvent: ga.TriggerEvent, Owner: ga.Owner });
        const g = ev('GainTrumpets', { Owner: ga.Owner, Points: points, SourceId: ga.SourceId, SetPower: eff.Power ?? null, Perk: null, PerkInherit: !!eff.PerkInherit, PerkMultiplier: eff.PerkMultiplier ?? null });
        if (eff.PerkCatalogue) unported(short(T(eff.PerkCatalogue)).replace(/^Ability\.PerkCatalogue\./, ''));
        return [wrap('Try', g)];
      }
      default: return unported(t + '.OnGlobal');
    }
  }
  // ---------------------------------------------------------------- trumpets (BuildExtensions *Trumpets*, GainTrumpets/ChangeTrumpets/TrumpetsMutator)
  const getTrumpets = (board, o) => (o === 1 ? board.Trumpets : o === 2 ? board.OpponentTrumpets : 0);
  const areTrumpetsDone = (board, o) => (o === 1 ? !!board.TrumpetsDone : o === 2 ? !!board.OpponentTrumpetsDone : false);
  const getTrumpetsPerk = (board, o) => (o === 1 ? board.TrumpetsPerk ?? null : o === 2 ? board.OpponentTrumpetsPerk ?? null : null);
  function setTrumpets(board, o, v) { v = Math.max(0, Math.min(50, v)); if (o === 1) board.Trumpets = v; else if (o === 2) board.OpponentTrumpets = v; return v; }
  /** BuildExtensions.GainTrumpets: only in battle and while not done; clamps to 0..50; returns the change (null when not allowed). */
  function gainTrumpets(board, o, n) {
    if (!board.IsBattle) return null;
    if (o === 1 || o === 2) { if (areTrumpetsDone(board, o)) return null; }
    const before = getTrumpets(board, o); const after = Math.max(0, Math.min(50, before + n));
    if (o === 1) board.Trumpets = after; else if (o === 2) board.OpponentTrumpets = after;
    return after - before;
  }
  /** TrumpetsMutator.SummonTrumpetMinion(owner, max): with trumpets left and fewer than `max` live pets, summon pet 188 at the front, once per battle. */
  function summonTrumpetMinion(B, o, max) {
    const board = B.board;
    if (areTrumpetsDone(board, o) || getTrumpets(board, o) < 1) return;
    if (board.findLiveMinions().filter((m) => m.Owner === o).length >= max) return;
    const n = getTrumpets(board, o); const perk = getTrumpetsPerk(board, o);
    const m = generateMinion(B, 188, 1, o);
    setAttack(m, n);
    m.Health.Set(Math.min(m.Health.Max, n), false); m.Health.Set(0, true);
    setPerk(m, perk);
    if (o === 1) board.TrumpetsDone = true; else board.OpponentTrumpetsDone = true;
    const p = { x: o === 1 ? 4 : 5, y: 0 };
    B.add(wrap('Try', ev('SummonMinion', { Owner: o, Minion: m, Type: 2, SubType: 0, Jumped: false, TriggerDisabled: false, TargetPoint: p, FailCause: 0, SourceId: null, Projectile: false,
      ForceActivateAbility: false, PushDirection: null })));
    B.add(wrap('Do', ev('ChangeTrumpets', { Owner: o, SourceId: M.itemId('M', 0), OldTrumpets: n, NewTrumpets: 0, DeltaTrumpets: -n, NewPerk: null, Finale: true })));
  }
  function effectSingle(eff, sa) {
    const t = short(T(eff)); const pa = singleParamArgs(sa);
    switch (t) {
      case 'EffectGiveBuff': {
        let atk = eff.Attack ? paramValue(eff.Attack, pa) : 0, atkR = eff.AttackRange ? paramValue(eff.AttackRange, pa) : 0;
        let hp = eff.Health ? paramValue(eff.Health, pa) : 0, hpR = eff.HealthRange ? paramValue(eff.HealthRange, pa) : 0;
        const restore = eff.HealthRestore ? paramValue(eff.HealthRestore, pa) : 0;
        if (sa.EffectMultiplier != null) { atk *= sa.EffectMultiplier; atkR *= sa.EffectMultiplier; hp *= sa.EffectMultiplier; hpR *= sa.EffectMultiplier; }
        const b = ev('BuffMinion', { Owner: sa.Owner, TargetId: sa.TargetId, Source: sa.SourceId, Attack: atk, AttackRange: atkR, Health: hp, HealthRange: hpR, HealthRestore: restore,
          HealthRestoreAbility: eff.HealthRestoreAbility || 0, Duration: eff.Duration || 0, Future: !!eff.Future, Trigger: sa.TriggerEvent,
          AttackParameter: eff.LateParameters ? eff.Attack : null, HealthParameter: eff.LateParameters ? eff.Health : null });
        if (!sa.Reversed) return [wrap('Try', b)];
        unported('EffectGiveBuff reversed');
      }
      case 'EffectDamage': {
        if (!sa.SourceId || !sa.B.board.findMinion(sa.SourceId)) return null; // no source point
        const d = ev('MinionAbilityDamage', { Owner: sa.Owner, AmountParameter: eff.Parameter, Amount: paramValue(eff.Parameter, pa), Range: eff.Range ? paramValue(eff.Range, pa) : 0,
          TargetId: sa.TargetId, SourceId: sa.SourceId, TriggerTargetId: targetOf(sa.TriggerEvent) || null, TriggerSourceId: sourceOf(sa.TriggerEvent) || null, TriggerEvent: sa.TriggerEvent,
          CriticalDisabled: !!eff.CriticalDisabled, SourcePerk: eff.PerkSource ?? null, Absorb: !!eff.Absorb, IgnorePerks: !!eff.IgnorePerks, AbsorbMax: eff.AbsorbMax ?? null, AbsorbPercent: eff.AbsorbPercent ?? null });
        if (!sa.Reversed) return [wrap('Try', d)];
        unported('EffectDamage reversed');
      }
      case 'EffectSetStats': {
        const s = ev('SetMinionStats', { Owner: sa.Owner, Target: sa.TargetId, Source: sa.SourceId, Attack: eff.Attack ? paramValue(eff.Attack, pa) : null, Health: eff.Health ? paramValue(eff.Health, pa) : null,
          Positive: !!eff.Positive, SourcePerk: eff.PerkSource ?? null });
        return [wrap('Try', s)];
      }
      case 'EffectSummon': return effectSummon(eff, sa);
      case 'EffectMana': {
        // EffectMana.OnSingle; the mutator evaluates Value again (AmountParameter)
        if (!eff.Value) return null;
        let v = paramValue(eff.Value, pa);
        if (eff.SpellPower) unported('EffectMana.SpellPower');
        const c = ev('ChangeMinionMana', { Owner: sa.Owner, TargetId: sa.TargetId, SourceId: sa.SourceId || null, Amount: v, AmountParameter: eff.Value, Absolute: !!eff.Absolute,
          Transfer: eff.Transfer ?? null, SetPower: false, TriggerDisabled: !!eff.TriggerDisabled, TriggerTargetId: targetOf(sa.TriggerEvent) || null, TriggerSourceId: sourceOf(sa.TriggerEvent) || null,
          TriggerEvent: sa.TriggerEvent, SourceSpell: null, ProjectileDisabled: !!eff.ProjectileDisabled, ResultAmount: 0, ResultMana: 0, ResultTransferedFrom: null });
        return [wrap('Try', c)];
      }
      case 'EffectGiveExp': {
        // EffectGiveExp.OnSingle
        if (!eff.Amount) return null;
        const g = ev('GiveMinionExp', { Owner: sa.Owner, TargetId: sa.TargetId, SourceId: sa.SourceId || null, Amount: paramValue(eff.Amount, pa), ExpType: 0, Result: null, DisableReward: false, Projectile: null });
        return [wrap('Try', g)];
      }
      case 'EffectTransform': {
        // EffectTransform.OnSingle
        if (eff.Back && sa.TriggerEvent && sa.TriggerEvent.cls === 'Transform') unported('EffectTransform.Back');
        const tm = sa.TargetId ? sa.B.board.findMinion(sa.TargetId) : null;
        const level = eff.Level != null ? eff.Level : tm ? tm.Level : 1;
        const nm = catalogueMinions(eff.Catalogue, { B: sa.B, Level: level, Amount: 1, TargetId: sa.TargetId, SourceId: sa.SourceId, Random: sa.Random, Owner: sa.Owner, TriggerEvent: sa.TriggerEvent })[0];
        if (!nm) return null; // EffectUtility.NoEffect
        if (eff.PerkCatalogue) unported(short(T(eff.PerkCatalogue)).replace(/^Ability\.PerkCatalogue\./, ''));
        const stat = (prm, own) => (eff.CopyStats ? own : prm ? new M.IntegerStat(paramValue(prm, pa)) : null);
        const t = ev('TransformMinion', { Owner: sa.Owner, IncludeDead: !!eff.IncludeDead, Source: sa.SourceId || null, Target: sa.TargetId, NewMinion: nm, Back: !!eff.Back, BackUpToLevel: eff.BackUpToLevel ?? null,
          Stacking: false, ResetStats: !!eff.ResetStats, RemovePerkIf: eff.RemovePerkIf ?? null, ForceActivate: !!eff.ForceActivate, Attack: stat(eff.Attack, nm.Attack), Health: stat(eff.Health, nm.Health),
          Perk: null, Experience: null, Level: eff.Level ?? null, ExtraAttack: eff.Catalogue.ExtraAttack ?? null, ExtraHealth: eff.Catalogue.ExtraHealth ?? null, ExtraExperience: eff.Catalogue.ExtraExperience ?? null,
          Processors: eff.Processors || null, ResultOldMinion: null, ResultMinion: null });
        const src = sa.SourceId ? sa.B.board.findMinion(sa.SourceId) : null;
        if (src) (src.LastSummoned = src.LastSummoned || []).push(sa.TargetId);
        return [wrap('Try', t)];
      }
      case 'EffectPush': {
        // EffectPush.OnSingle; To = 1 pushes to a random cell of the target's side
        let dir = eff.Direction || 0, dist = eff.Distance || 0;
        if (eff.To === 1) {
          const tm = sa.B.board.findMinion(sa.TargetId); if (!tm) return null;
          const lo = tm.Owner === 1 ? 0 : 5, hi = tm.Owner === 1 ? 4 : 9;
          const x = Math.trunc(sa.Random.nextDouble() * (hi - lo + 1)) + lo;
          const d = x - tm.Point.x; dir = d < 1 ? 1 : 0; if (tm.Owner === 2) dir = dir === 0 ? 1 : 0; dist = Math.abs(d);
        }
        return [wrap('Try', ev('PushMinion', { Owner: sa.Owner, TargetId: sa.TargetId, SourceId: sa.SourceId || null, Direction: dir, Distance: dist, Type: eff.Type || 0,
          FinalDelta: null, SourcePerk: null, FailCause: 0, ProjectileDisabled: !!eff.ProjectileDisabled, ResultLostPerk: null }))];
      }
      case 'EffectLosePerk': {
        // EffectLosePerk.OnSingle
        const l = loseMinionPerk(sa.Owner, sa.TargetId, sa.SourceId || null, eff.Perk ?? null, !!eff.IgnoreDurability);
        Object.assign(l, { IncludeDestroyed: !!eff.IncludeDestroyed, IncludeDead: !!eff.IncludeDead, RenderDelay: !!eff.RenderDelay, RenderLost: !!eff.RenderLost, Positive: eff.Positive ?? null });
        return [wrap('Try', l)];
      }
      case 'EffectGivePerk': {
        // EffectGivePerk.OnSingle: Perk, or PerkCatalogue.GetPerk(args) when a catalogue is set
        if (eff.PerkCatalogue) unported(short(T(eff.PerkCatalogue)).replace(/^Ability\.PerkCatalogue\./, ''));
        const g = ev('GiveMinionPerk', { Owner: sa.Owner, Perk: eff.Perk, Duration: eff.Duration || 0, Source: sa.SourceId || null, TargetId: sa.TargetId, Inherit: !!eff.Inherit,
          SourceSpell: null, Durability: eff.Durability ?? null, DurabilityParameter: eff.DurabilityParameter || null, Multiplier: eff.Multiplier ?? null,
          MultiplierParameter: eff.MultiplierParameter || null, Future: !!eff.Future, Compound: !!eff.Compound, TriggersDisabled: !!eff.TriggersDisabled,
          ProjectileDisabled: !!eff.ProjectileDisabled, ResultPerkReplaced: null, Result: null });
        return [wrap('Try', g)];
      }
      default: return unported(t);
    }
  }

  // ---------------------------------------------------------------- summons (EffectSummon, MinionCatalogue*, GenerateMinion)
  /** MinionExtensions.SetMana / AddMana: 0..50 (the cap is GameConstants.StatsMax). */
  const setMana = (m, v) => { m.Mana = Math.max(0, Math.min(50, v)); };
  /**
   * MinionExtensions.ResetAbility (after a level change): drop the native abilities and add the template's again at the new level,
   * keeping their charges. AddAbility marks every ability added after the first as IgnoreRepeats.
   */
  function resetAbility(m) {
    if (m.AbilitiesDisabled) return;
    const charges = new Map(); for (const a of m.Abilities) if (a.Charges != null) charges.set(a.Enum, a.Charges);
    m.Abilities = m.Abilities.filter((a) => !a.Native);
    const t = D.minions[m.Enum]; if (!t) return;
    for (const { e } of t.abilities) {
      const ab = getAbility(e, m.Level); if (!ab) continue;
      if (ab.Regain && m.Abilities.length >= 1) continue;
      if (ab.Singleton && m.Abilities.some((a) => a.Enum === e)) continue;
      const x = new M.MinionAbilityModel(e, m.Level, true); x.AlwaysIgnoreMinionLevel = !!ab.AlwaysIgnoreMinionLevel; x.IgnoreRepeats = m.Abilities.length > 0;
      m.Abilities.push(x);
      if (ab.MaxAttack != null || ab.MaxHealth != null) updateStatsMax(m);
      if (charges.has(e)) x.Charges = charges.get(e);
    }
  }
  /** MinionExtensions.AddExp(m, n): each point gives +1/+1 (not while Sad unless it has ability 839) and one experience; levels at LEVEL_EXP. */
  function addExp(m, n) {
    if (n === 0) return { NewLevel: 0, NewExp: 0, LevelsGained: 0, ExpGained: 0, AttackGained: 0, HealthGained: 0 };
    const lvl0 = m.Level, exp0 = m.Exp, atk0 = m.Attack.Total, hp0 = m.Health.Total;
    const stat = (d) => { m.Attack.Add(d, false); if (m.Attack.Permanent < 1) m.Attack.Set(1, false); const h = m.Health.Permanent; m.Health.Add(d, false); if (m.Health.Permanent < 1 && h > 0) m.Health.Set(1, false); };
    for (let i = 0; i < Math.abs(n); i++) {
      if (n < 1) {
        stat(-1);
        if (m.Exp !== 0) { m.Exp--; const l = m.Level - 1; if (l >= 0 && l < LEVEL_EXP.length && m.Exp < LEVEL_EXP[l] && m.Level !== 1) { m.Level--; resetAbility(m); } }
      } else {
        if (m.Perk !== 121 || m.Abilities.some((a) => a.Enum === 839)) stat(1);
        if (!(LEVEL_EXP.length <= m.Level)) { m.Exp++; if (m.Level >= 0 && m.Level < LEVEL_EXP.length && LEVEL_EXP[m.Level] === m.Exp && m.Level < LEVEL_EXP.length) { m.Level++; resetAbility(m); } }
      }
    }
    return { NewLevel: m.Level, NewExp: m.Exp, NewAttack: m.Attack.ShallowCopy(), NewHealth: m.Health.ShallowCopy(), LevelsGained: m.Level - lvl0, ExpGained: m.Exp - exp0,
      AttackGained: m.Attack.Total - atk0, HealthGained: m.Health.Total - hp0 };
  }
  /** MinionExtensions.ResetLevel(m, level): level 1..3 with that level's starting experience. */
  function resetLevel(m, lvl) { lvl = Math.min(3, Math.max(1, lvl)); m.Level = lvl; m.Exp = LEVEL_EXP[lvl - 1]; resetAbility(m); }
  /** MinionExtensions.ResetLevelFromExperience: clamp experience, then the level is the number of thresholds reached. */
  function resetLevelFromExperience(m) {
    m.Exp = Math.max(0, Math.min(Math.max(...LEVEL_EXP), m.Exp)); m.Level = 0;
    for (const t of LEVEL_EXP) { if (m.Exp < t) break; m.Level++; }
    resetAbility(m);
  }
  const LEVEL_EXP = [0, 2, 5]; // BoardConstants experience per level (level 2 = 2 seen on recorded boards; level 3 still to verify)
  /** MinionExtensions.UpdateStatsMax: ability MaxAttack/MaxHealth (SetMaxStats), else the template's AttackMax/HealthMax. */
  function updateStatsMax(m) {
    let ma = null, mh = null;
    for (const a of m.Abilities) { const ab = getAbility(a.Enum, a.Level); if (!ab) continue; if (ab.MaxHealth != null) mh = ab.MaxHealth; if (ab.MaxAttack != null) ma = ab.MaxAttack; }
    const raw = (D.minions[m.Enum] || {}).raw || {};
    m.Attack.MaxOverride = ma != null ? ma : (raw.AttackMax ?? null);
    m.Health.MaxOverride = mh != null ? mh : (raw.HealthMax ?? null);
    m.Attack.Set(m.Attack.Permanent, false); m.Attack.Set(m.Attack.Temporary, true);
    m.Health.Set(m.Health.Permanent, false); m.Health.Set(m.Health.Temporary, true);
  }
  /** BoardExtensions.GenerateMinion: a new MinionModel with the next id on the merged board. */
  function generateMinion(B, e, level, owner) {
    const t = D.minions[e]; if (!t) throw new Error("Template does not exist for '" + e + "'.");
    const id = M.itemId('M', B.board.nextUnique());
    const m = new M.MinionModel({ Id: id, Owner: owner, Enum: e, x: 0, Level: level, Exp: LEVEL_EXP[level - 1] ?? 0, Attack: t.attack, Health: t.health, Tribe: t.tribe,
      Abilities: t.abilities.map((a) => { const x = new M.MinionAbilityModel(a.e, level, true); const ab = getAbility(a.e, level); x.AlwaysIgnoreMinionLevel = !!(ab && ab.AlwaysIgnoreMinionLevel); return x; }) });
    m.Location = 1;
    updateStatsMax(m);
    return m;
  }
  /** ListExtensions random take: partial Fisher-Yates from the front with Next(i, count). */
  function takeRandom(list, n, rand) { const l = list.slice(); for (let i = 0; i < n && i !== l.length; i++) { const k = rand.next(i, l.length); const x = l[k]; l[k] = l[i]; l[i] = x; } return n < l.length ? l.slice(0, Math.max(0, n)) : l; }
  function setAttack(m, v) { if (m.Attack.Max < v) v = m.Attack.Max; if (v < 1) v = 1; m.Attack.Set(v, false); m.Attack.Set(0, true); }
  function setHealth(m, v) { if (m.Health.Max < v) v = m.Health.Max; m.Health.Set(v, false); m.Health.Set(0, true); }
  /** MinionCatalogueBase.GetMinions */
  function catalogueMinions(c, ca) {
    const t = short(T(c)); let base;
    switch (t) {
      case 'MinionCatalogueFixed': base = (c.Minions || []).map((e) => generateMinion(ca.B, e, ca.Level, ca.Owner)); break;
      case 'MinionCatalogueList': base = takeRandom(c.Minions || [], ca.Amount, ca.Random).map((e) => generateMinion(ca.B, e, ca.Level, ca.Owner)); break;
      default: return unported(t);
    }
    const pa = { B: ca.B, TargetId: ca.TargetId, SourceId: ca.SourceId, Random: ca.Random, TriggerEvent: ca.TriggerEvent, Owner: ca.Owner };
    for (const m of base) {
      if (c.Attack) setAttack(m, paramValue(c.Attack, pa));
      if (c.AttackRange) { let v = m.Attack.Total; const r = paramValue(c.AttackRange, pa); if (r > 0) v += ca.Random.next(0, r + 1); setAttack(m, v); }
      if (c.ExtraAttack != null) setAttack(m, m.Attack.Total + c.ExtraAttack);
      if (c.Health) setHealth(m, paramValue(c.Health, pa));
      if (c.HealthRange) { let v = m.Health.Total; const r = paramValue(c.HealthRange, pa); if (r > 0) v += ca.Random.next(0, r + 1); setHealth(m, v); }
      if (c.ExtraHealth != null) setHealth(m, m.Health.Total + c.ExtraHealth);
      if (c.Perk) unported('MinionCatalogue.Perk');
      if (c.Countdown) unported('MinionCatalogue.Countdown');
      if (c.DisableAbility) unported('MinionCatalogue.DisableAbility');
      if (c.ExtraExperience != null) unported('MinionCatalogue.ExtraExperience');
    }
    return base;
  }
  function effectSummon(eff, sa) {
    const B = sa.B, board = B.board; const pa = singleParamArgs(sa);
    const level = eff.Level ? paramValue(eff.Level, pa) : 1;
    let side = sa.Owner;
    const tm = board.findMinion(sa.TargetId); let point = tm ? { x: tm.Point.x, y: tm.Point.y } : { x: 0, y: 0 };
    if ((point.x < 5 && side !== 1) || (point.x > 4 && side === 1)) side = side === 1 ? 2 : side === 2 ? 1 : 0;
    const ca = { B, Level: level, Amount: 1, TargetId: sa.TargetId, SourceId: sa.SourceId, Random: sa.Random, Owner: side, TriggerEvent: sa.TriggerEvent };
    let push = eff.PushDirection ?? null;
    if (eff.SummonDirection != null) {
      const dv = (sa.Owner === 1 && eff.SummonDirection === 0) || (sa.Owner === 2 && eff.SummonDirection === 1) ? 1 : -1;
      let x = point.x + dv; const lo = side !== 1 ? 5 : 0, hi = side !== 1 ? 9 : 4;
      push = eff.SummonDirection === 0 ? 1 : 0; // RelativeDirection.Reverse
      if (x >= lo && x <= hi) {
        do { if (!board.cells[x]) { push = eff.SummonDirection; point = { x: point.x + dv, y: point.y }; break; } x += dv; } while (lo <= x && x <= hi);
      }
    }
    if (eff.Back) point = side === 1 ? { x: 0, y: 0 } : { x: 9, y: 0 };
    const source = sa.SourceId ? board.findMinion(sa.SourceId) : null;
    const make = (m) => {
      if (!m) return null;
      if (source) { source.LastSummoned = source.LastSummoned || []; source.LastSummoned.push(m.Id); }
      for (const pr of eff.Processors || []) summonProcess(pr, { B, SummonPoint: point, Minion: m, Parent: source, Reversed: sa.Reversed });
      const s = ev('SummonMinion', { Owner: m.Owner, Minion: m, Type: 1, SubType: eff.SubType || 0, Jumped: false, TriggerDisabled: false, TargetPoint: { x: point.x, y: point.y },
        FailCause: 0, SourceId: source ? source.Id : null, Projectile: !!eff.Projectile, ForceActivateAbility: !!eff.ForceActivate, PushDirection: push });
      return wrap('Try', s);
    };
    const out = [];
    if (eff.SinglePass) { for (const m of catalogueMinions(eff.Catalogue, ca)) { const x = make(m); if (x) out.push(x); } }
    else { const n = eff.Amount ? paramValue(eff.Amount, pa) : 1; for (let i = 0; i < n; i++) { const x = make(catalogueMinions(eff.Catalogue, ca)[0]); if (x) out.push(x); } }
    return out.length ? out : null;
  }
  function summonProcess(pr, a) {
    const t = short(T(pr)).replace(/^BoardEvents\./, ''); const m = a.Minion, p = a.Parent;
    switch (t) {
      case 'EffectSummonProcessorSetAttack': if (short(T(pr.Value)) !== 'ParameterFlat') unported(t + ' non-flat'); setAttack(m, pr.Value.Value); return;
      case 'EffectSummonProcessorSetHealth': if (short(T(pr.Value)) !== 'ParameterFlat') unported(t + ' non-flat'); setHealth(m, pr.Value.Value); return;
      case 'EffectSummonProcessorMakeEnemy': if (!a.Reversed) m.Owner = m.Owner === 1 ? 2 : m.Owner === 2 ? 1 : 0; return;
      case 'EffectSummonProcessorSetAttackToBase': setAttack(m, D.minions[m.Enum].attack * pr.Multiplier); return;
      case 'EffectSummonProcessorSetHealthToBase': setHealth(m, D.minions[m.Enum].health * pr.Multiplier); return;
      case 'EffectSummonProcessorCopyAttack': case 'EffectSummonProcessorCopyHealth': {
        if (!p) return; const atk = t.endsWith('Attack'); let v = atk ? p.Attack.Total : p.Health.Total;
        if (pr.Multiplier != null) v = Math.trunc(v * decimal(pr.Multiplier)); if (pr.Addition != null) v += pr.Addition;
        if (atk) setAttack(m, v); else setHealth(m, v); return;
      }
      case 'EffectSummonProcessorCopyLevel': if (p) m.Level = p.Level; return;
      default: return unported(t);
    }
  }
  // BoardExtensions push helpers. RelativeDirection: 0 forward, 1 backward. DirectionEnum: 1 right (+x), 3 left (-x).
  const fwd = (owner) => (owner === 1 ? 1 : 3), bwd = (owner) => (owner === 1 ? 3 : 1);
  const toDx = (dir) => (dir === 1 ? 1 : dir === 3 ? -1 : 0);
  const isInside = (p, owner) => p.y === 0 && (owner === 1 ? p.x >= 0 && p.x <= 4 : owner === 2 ? p.x >= 5 && p.x <= 9 : true);
  function canPushMinion(board, m, rel) {
    const np = { x: m.Point.x + toDx(rel === 0 ? fwd(m.Owner) : bwd(m.Owner)), y: 0 };
    if (!isInside(np, m.Owner)) return false;
    const c = board.get(np); const o = c ? board.findMinion(c.Id, true, false) : null;
    if (o) { if (idEq(o.Id, m.Id) || o.Point.x === m.Point.x) throw new Error('EndlessLoopException: CanPushMinion'); return canPushMinion(board, o, rel); }
    return true;
  }
  /** BoardExtensions.CanSummonMinion: cell in bounds, free or pushable, and fewer live pets than BoardCapacity. */
  function canSummonMinion(board, m, p) {
    if (p.x < 0 || p.x >= board.Width || p.y !== 0) return false;
    const c = board.get(p);
    if (c && c.IsAlive && !canPushMinion(board, c, 0) && !canPushMinion(board, c, 1)) return false;
    return board.cells.filter((x) => x && x.IsAlive).length < board.BoardCapacity;
  }
  /** BoardExtensions.TryMove: Do<MoveMinion>(quick, forced) for the chain of pushed pets, returned in reverse order. */
  function tryMove(board, m, dir) {
    const out = []; let p = { x: m.Point.x, y: 0 };
    for (let i = 0; ;) {
      const c = board.get(p); if (!c) break; const o = board.findMinion(c.Id, true, false); if (!o) break;
      const np = { x: p.x + toDx(dir), y: 0 };
      if (!isInside(np, m.Owner)) return null;
      out.push(wrap('Do', ev('MoveMinion', { Owner: m.Owner, MinionId: o.Id, From: { x: p.x, y: 0 }, To: np, Quick: true, Forced: true })));
      p = np; if (++i > 4) return null;
    }
    return out.reverse();
  }
  function tryClearSpace(board, p, rel) {
    const c = board.get(p); const o = c ? board.findMinion(c.Id, true, false) : null;
    if (!o) return { ok: true, events: [], rel };
    if (!canPushMinion(board, o, rel)) { rel = rel === 0 ? 1 : 0; if (!canPushMinion(board, o, rel)) return { ok: false, events: [], rel }; }
    const evs = tryMove(board, o, rel === 0 ? fwd(o.Owner) : bwd(o.Owner));
    return evs ? { ok: true, events: evs, rel } : { ok: false, events: [], rel };
  }
  /** SummonMinionAttemptSystem */
  function summonAttempt(B, e) {
    const s = e.Event, board = B.board; let p = { x: s.TargetPoint.x, y: s.TargetPoint.y }; const m = s.Minion;
    if (s.SubType !== 1) m.Owner = s.Owner;
    const fail = (cause) => { s.FailCause = cause; B.add(wrap('Fail', s)); };
    if (!canSummonMinion(board, m, p)) return fail(1);
    let rel = s.PushDirection ?? 0;
    if (rel === 1) { const o = board.findLiveMinion(p); if (o && !canPushMinion(board, o, 1)) { p = { x: p.x + (p.x > 4 ? -1 : 1), y: 0 }; rel = 0; } }
    const r = tryClearSpace(board, p, rel);
    if (!r.ok) return fail(1);
    m.Point = { x: p.x, y: p.y }; s.TargetPoint = { x: p.x, y: p.y }; s.PushDirection = r.rel;
    B.add(r.events.concat([wrap('Do', s)]));
  }
  function deepCopy(m) {
    const c = Object.assign(Object.create(Object.getPrototypeOf(m)), m);
    c.Attack = m.Attack.ShallowCopy(); c.Health = m.Health.ShallowCopy(); c.Point = { x: m.Point.x, y: m.Point.y };
    c.Abilities = m.Abilities.map((a) => Object.assign(Object.create(Object.getPrototypeOf(a)), a)); c.Power = Object.assign({}, m.Power); c.LastSummoned = (m.LastSummoned || []).slice();
    return c;
  }
  /** SummonMinionMutator */
  function summonMutator(B, e) {
    const s = e.Event, board = B.board;
    let m = s.Minion; if (s.Type !== 3 && s.Type !== 5) m = deepCopy(m);
    const p = s.TargetPoint;
    if (canSummonMinion(board, m, p)) {
      m.Location = 1;
      if ((p.x < 5 && m.Owner !== 1) || (p.x > 4 && m.Owner === 1)) m.Owner = m.Owner === 1 ? 2 : 1;
      board.setMinion(p, m);
    } else unported('SummonMinionMutator when the summon fails at Do');
    if (s.Jumped && board.IsBattle) m.JumpsThisBattle++;
    if (!s.TriggerDisabled) { if (e.Owner === 1) board.MinionsSummonedThisTurn++; else board.OpponentSummons = (board.OpponentSummons || 0) + 1; }
    B.add(wrap('Done', s));
    if (s.ForceActivateAbility) {
      const filter = m.Abilities.filter((a) => { const ab = getAbility(a.Enum, a.Level); return ab && !ab.HiddenTriggersAndEffects; }).map((a) => a.Enum);
      B.add(ev('ForceActivateAbility', { Owner: e.Owner, Level: null, TargetId: m.Id, AbilityFilter: filter, SourceId: null, RepeatFromAuraDisabled: false, DisableAfterTemp: false }));
    }
  }
  /** ForceActivateAbilitySystem: Do<AbilityTriggered>(forced) for each listed ability, on a TriggerEvent.Force. */
  function forceActivateAbility(B, e) {
    if (!e.AbilityFilter) return;
    const m = B.board.findMinion(e.TargetId); if (!m || !m.Abilities.length) return;
    if (((D.minions[m.Enum] || {}).raw || {}).ForceActivateImmune) return;
    for (const a of m.Abilities) {
      if (!e.AbilityFilter.includes(a.Enum)) continue;
      if (e.Level) unported('ForceActivateAbility.Level');
      const trig = ev('Force', { SourceId: e.SourceId });
      B.add(wrap('Do', ev('AbilityTriggered', { Owner: e.Owner, Ability: a.Enum, Level: a.Level, MinionId: e.TargetId, Aim: null, TriggerEvent: trig, UpdateLevel: false, Type: 0,
        Force: true, RepeatFromAuraDisabled: e.RepeatFromAuraDisabled, DisableAfterTemp: e.DisableAfterTemp, FailCause: { Status: 0, Loud: false }, PerkSource: null, RemovePerk: null, EffectMultiplier: null })));
    }
  }

  // ---------------------------------------------------------------- mutators fed by effects
  const mutators = {
    /** AddMinionChargeMutator: whole charges emit Done<ChargedMinion>, partial progress emits ChargedMinionPartially */
    AddMinionChargeMutator(B, e) {
      const c = e.Event; const m = B.board.findMinion(c.TargetId); if (!m) return;
      const model = m.Abilities.find((a) => a.Enum === c.Ability); if (!model) return;
      if (model.Charges == null) model.Charges = 0;
      const ab = getAbility(model.Enum, model.Level);
      if (ab.ChargesMax != null && ab.ChargesMax <= model.Charges) return;
      if (!canMinionAbilityTrigger(B, model, ab)) return;
      const before = ab.Charges != null ? tdiv(model.Charges, ab.Charges) : null;
      model.Charges = model.Charges + c.Amount;
      const after = ab.Charges != null ? tdiv(model.Charges, ab.Charges) : null;
      const diff = before != null && after != null ? after - before : null;
      if (!(diff > 0)) { if (ab.Charges != null) B.add(ev('ChargedMinionPartially', { Owner: m.Owner, MinionId: m.Id, Ability: model.Enum, Max: ab.Charges, Current: model.Charges, Hidden: false })); return; }
      for (let i = 0; i < diff; i++) B.add(wrap('Done', ev('ChargedMinion', { Owner: m.Owner, MinionId: m.Id, Ability: model.Enum, Hidden: false })));
    },
    /** AddMinionPowerMutator */
    AddMinionPowerMutator(B, e) {
      const p = e.Event; const m = B.board.findMinion(p.TargetId); if (!m) return;
      const ab = getAbility(p.Ability, 1); if (ab && ab.PowerMax != null) unported('AddPowerToAbility with PowerMax');
      m.Power[p.Ability] = (m.Power[p.Ability] || 0) + p.Amount;
      p.ResultCurrent = m.Power[p.Ability];
      B.add(wrap('Done', p));
    },
    /** AbilityDamageSystem: MinionAbilityDamage -> DamageMinion (DamageType 1, owner = target's owner) */
    AbilityDamageSystem(B, e) {
      const d = e.Event; const board = B.board;
      const target = board.findLiveMinion(d.TargetId); if (!target) return;
      const source = d.SourceId ? board.findLiveMinion(d.SourceId) : null;
      if (d.AmountParameter) d.Amount = paramValue(d.AmountParameter, { B, TargetId: d.TargetId, SourceId: d.SourceId, TriggerTargetId: d.TriggerTargetId, TriggerSourceId: d.TriggerSourceId, Random: B.randomizer(e.Owner), TriggerEvent: d.TriggerEvent });
      const dm = ev('DamageMinion', { Owner: target.Owner, Amount: d.Amount, Range: d.Range, TargetId: d.TargetId, SourceId: d.SourceId, DamageType: 1, AttackType: 0, CriticalDisabled: d.CriticalDisabled,
        Absorb: d.Absorb, AbsorbMax: d.AbsorbMax, AbsorbPercent: d.AbsorbPercent, IgnorePerks: d.IgnorePerks, SourcePerk: d.SourcePerk });
      setupDamage(dm, B, source, target);
      B.add(wrap('Try', dm));
      B.add(wrap('Done', d));
    },
    /** GiveMinionBuffMutator */
    GiveMinionBuffMutator(B, e) {
      const b = e.Event; const board = B.board;
      const m = board.findMinion(b.TargetId, true, false); if (!m) return;
      const rand = B.randomizer(e.Owner);
      const source = b.Source ? board.findMinion(b.Source) : null;
      if (source && (b.AttackParameter || b.HealthParameter)) unported('BuffMinion late parameters');
      const atk0 = m.Attack.Total, hp0 = m.Health.Total;
      let atk = b.Attack; if (b.AttackRange > 0) { const r = rand.next(0, b.AttackRange + 1); b.Attack += r; atk += r; }
      let hp = b.Health; if (b.HealthRange > 0) { const r = rand.next(0, b.HealthRange + 1); hp += r; b.Health += r; }
      if (b.HealthRestore) unported('BuffMinion.HealthRestore');
      if (m.Perk === 121 && !(B.hooks.sadImmune && B.hooks.sadImmune(m))) { atk = 0; hp = 0; b.Attack = 0; b.Health = 0; }
      const dur = b.Duration || 0;
      if (dur === 2) unported('BuffMinion removable (Duration 2)');
      addAttack(m, atk, dur);
      M.addHealth(m, hp, dur !== 0);
      b.ResultGiveAttack = atk; b.ResultGiveHealth = hp; b.ResultAttackGained = m.Attack.Total - atk0; b.ResultHealthGained = m.Health.Total - hp0;
      b.ResultAttack = m.Attack.ShallowCopy(); b.ResultHealth = m.Health.ShallowCopy();
      if (b.Future) unported('BuffMinion.Future');
      if ((b.Health < 0 || b.Attack < 0) && b.ResultAttackGained < 0) B.add(ev('LostAttack', { SourceId: b.TargetId }));
      B.add(wrap('Done', b));
    },
    /** ReleaseManaSystem (Try<ReleaseMana>): a fainting pet with mana force-runs ability 686 at level 1 */
    ReleaseManaSystem(B, e) {
      const r = e.Event; const m = B.board.findMinion(r.TargetId); if (!m || m.Mana < 1) return;
      B.add(wrap('Do', ev('AbilityTriggered', { Owner: m.Owner, Ability: 686, Level: 1, MinionId: m.Id, Aim: null, TriggerEvent: r.TriggerEvent, UpdateLevel: false, Type: 0, Force: true,
        RepeatFromAuraDisabled: false, DisableAfterTemp: false, FailCause: { Status: 0, Loud: false }, PerkSource: null, RemovePerk: null, EffectMultiplier: null })));
    },
    /** PushMutator (Try<PushMinion>): lift the pet, clear the landing cell, re-summon it there (type 5, triggers off) */
    PushMutator(B, e) {
      const pm = e.Event; const board = B.board;
      const target = board.findMinion(pm.TargetId, true, false);
      const source = (pm.SourceId && board.findMinion(pm.SourceId)) || target; if (!source) return;
      if (!target) return;
      if (target.Perk === 66 && (pm.Type || 0) === 0) { const f = wrap('Fail', pm); pm.ResultLostPerk = tryRemovePerk(target); B.add(f); return; } // perk 66 resists pushes
      let d = source.Owner !== 1 ? 3 : 1; if (pm.Direction) d = d === 1 ? 3 : d === 3 ? 1 : d === 0 ? 2 : 0; // DirectionUtility.Relative
      const from = { x: target.Point.x, y: target.Point.y };
      let x = from.x + toDx(d) * pm.Distance;
      const lo = target.Owner === 1 ? 0 : 5, hi = target.Owner === 1 ? 4 : 9; x = Math.max(lo, Math.min(hi, x)); // GetMinMaxPoint
      const to = { x, y: from.y };
      board.cells[board.index(from)] = null;
      const r = tryClearSpace(board, to, pm.Direction === 0 ? 1 : 0);
      if (!r.ok) { board.cells[board.index(from)] = target; return; }
      B.add(r.events);
      B.add(wrap('Try', ev('SummonMinion', { Owner: target.Owner, Minion: target, Type: 5, SubType: 2, Jumped: (pm.Type || 0) === 1, TriggerDisabled: true, TargetPoint: to, FailCause: 0,
        SourceId: null, Projectile: false, ForceActivateAbility: false, PushDirection: null })));
      pm.FinalDelta = { x: to.x - from.x, y: 0 };
      B.add(wrap('Done', pm));
    },
    /** TransformMinionMutator (Try<TransformMinion>) */
    TransformMinionMutator(B, e) {
      const t = e.Event; const board = B.board;
      const old = t.IncludeDead ? board.findMinion(t.Target, true, false) : board.findLiveMinion(t.Target);
      if (!old || (old.Location ?? 1) !== 1) return;
      // BoardExtensions.RemoveMinion(id, 1): destroyed, off the grid, Location 6 (not to the graveyard)
      old.Destroyed = true; board.cells[board.index(old.Point)] = null; old.Location = 6;
      const n = deepCopy(t.NewMinion);
      n.Id = old.Id; n.Perk = old.Perk; n.Owner = old.Owner; n.Point = { x: old.Point.x, y: old.Point.y };
      n.Dead = false; n.Destroyed = false; n.DestroyedBy = null;
      let atk = old.Attack.Permanent, atkT = old.Attack.Temporary, hp = old.Health.Permanent, hpT = old.Health.Temporary;
      if (t.ResetStats) { atk = n.Attack.Permanent; hp = n.Health.Permanent; }
      if (t.Attack) { atk = t.Attack.Permanent; atkT = t.Attack.Temporary; }
      if (t.Health) { hp = t.Health.Permanent; hpT = t.Health.Temporary; }
      if (t.ExtraAttack != null) atk += t.ExtraAttack;
      if (t.ExtraHealth != null) hp += t.ExtraHealth;
      n.Attack.Set(atk, false); n.Attack.Set(atkT, true); n.Health.Set(hp, false); n.Health.Set(hpT, true);
      n.Mana = old.Mana; n.SellValue = old.SellValue;
      if (t.RemovePerkIf != null && n.Perk === t.RemovePerkIf) setPerk(n, null, 0, null, null);
      else if (t.Perk != null) setPerk(n, t.Perk, 0, null, null);
      else setPerk(n, old.Perk, old.PerkDuration, old.PerkMultiplier, old.PerkDurability);
      if (t.BackUpToLevel != null && t.BackUpToLevel <= old.Level) resetLevel(n, t.BackUpToLevel);
      else if (t.Level != null) resetLevel(n, t.Level);
      else { let x = t.Experience != null ? t.Experience : old.Exp; if (t.ExtraExperience != null) x += t.ExtraExperience; n.Exp = Math.max(0, x); resetLevelFromExperience(n); }
      if (findAuras(B, old, 12).length && B.randomizer(old.Owner).next(0, 2) === 1) { n.Enum = old.Enum; n.Abilities = old.Abilities; }
      if (t.ForceActivate) {
        const filter = n.Abilities.filter((a) => { const ab = getAbility(a.Enum, a.Level); return ab && !ab.HiddenTriggersAndEffects; }).map((a) => a.Enum);
        B.add(ev('ForceActivateAbility', { Owner: e.Owner, Level: null, TargetId: n.Id, AbilityFilter: filter, SourceId: null, RepeatFromAuraDisabled: false, DisableAfterTemp: false }));
      }
      // BoardExtensions.SummonMinion(new, old point)
      if (!canSummonMinion(board, n, old.Point)) return;
      n.Location = 1;
      if ((old.Point.x < 5 && n.Owner !== 1) || (old.Point.x > 4 && n.Owner === 1)) n.Owner = n.Owner === 1 ? 2 : 1;
      board.setMinion(old.Point, n);
      for (const pr of t.Processors || []) summonProcess(pr, { B, SummonPoint: old.Point, Minion: n, Parent: old, Reversed: false });
      if (old.Owner === 1) board.TransformationsThisTurn = (board.TransformationsThisTurn || 0) + 1; else board.OpponentTransformations = (board.OpponentTransformations || 0) + 1;
      t.ResultMinion = n; t.ResultOldMinion = old; t.ResultNewTransformations = board.TransformationsThisTurn || 0; t.ResultNewOpponentTransformations = board.OpponentTransformations || 0;
      B.add(wrap('Done', t));
    },
    /** ChangeMinionManaMutator (Try<ChangeMinionMana>) */
    ChangeMinionManaMutator(B, e) {
      const c = e.Event; const board = B.board; const m = board.findLiveMinion(c.TargetId); if (!m) return;
      if (c.AmountParameter) c.Amount = paramValue(c.AmountParameter, { B, TargetId: c.TargetId, SourceId: c.SourceId, TriggerTargetId: c.TriggerTargetId, TriggerSourceId: c.TriggerSourceId,
        TriggerEvent: c.TriggerEvent, Random: B.randomizer(c.Owner), Owner: c.Owner });
      let amount = c.Amount;
      if (c.Transfer != null) {
        c.ResultTransferedFrom = [];
        for (const x of board.cells) {
          if (!x || !(x.Mana > 0) || idEq(x.Id, m.Id) || x.Owner !== m.Owner || !(c.Transfer > 0)) continue;
          const take = Math.min(c.Transfer, x.Mana); amount += take; x.Mana -= take; c.ResultTransferedFrom.push({ Id: x.Id, Amount: take, Remaining: x.Mana });
        }
      }
      setMana(m, c.Absolute ? amount : m.Mana + amount);
      c.ResultAmount = amount; c.ResultMana = m.Mana;
      B.add(wrap('Done', c));
    },
    /** GiveMinionExpMutator (Try<GiveMinionExp>): Done, then Try<GainReward> for a level gained (shop rewards) */
    GiveMinionExpMutator(B, e) {
      const g = e.Event; const m = B.board.findLiveMinion(g.TargetId); if (!m) return;
      const r = addExp(m, g.Amount); g.Result = r;
      B.add(wrap('Done', g));
      if (!(r.LevelsGained > 0) || ((D.minions[m.Enum] || {}).raw || {}).Rewardless || g.DisableReward) return;
      if (m.Perk !== 55 && m.Abilities.some((a) => a.Enum === 760)) return;
      B.add(wrap('Try', ev('GainReward', { Owner: e.Owner, Rewards: r.LevelsGained, SourceLevel: m.Level, SourceTier: (D.minions[m.Enum] || {}).tier })));
    },
    /** SetMinionStatsMutator (Try<SetMinionStats>); DamageRemovableBuffs only touches shop buffs, which battles never hold */
    SetMinionStatsMutator(B, e) {
      const s = e.Event; const m = B.board.findLiveMinion(s.Target); if (!m) return;
      const atk0 = m.Attack.Total, hp0 = m.Health.Total;
      if (s.Attack != null) { setAttack(m, s.Attack); s.ResultAttackDelta = m.Attack.Total - atk0; s.ResultAttack = m.Attack.ShallowCopy(); }
      if (s.Health != null) { m.Health.Set(Math.min(m.Health.Max, s.Health), false); m.Health.Set(0, true); s.ResultHealthDelta = m.Health.Total - hp0; s.ResultHealth = m.Health.ShallowCopy(); }
      B.add(wrap('Done', s));
    },
    /** GainTrumpetsMutator (Try<GainTrumpets>): Do<ChangeTrumpets>, or Done<DenyTrumpets> once the trumpets were used */
    GainTrumpetsMutator(B, e) {
      const g = e.Event; const board = B.board; const o = e.Owner;
      const old = getTrumpets(board, o);
      if (areTrumpetsDone(board, o)) { B.add(wrap('Done', ev('DenyTrumpets', { Owner: o, SourceId: g.SourceId, Value: g.Points }))); return; }
      if (gainTrumpets(board, o, g.Points) == null) return;
      const now = getTrumpets(board, o);
      const c = ev('ChangeTrumpets', { Owner: o, SourceId: g.SourceId, OldTrumpets: old, NewTrumpets: now, DeltaTrumpets: now - old, NewPerk: null, Finale: false });
      if (g.SetPower != null && g.SourceId) { const s = board.findMinion(g.SourceId); if (s) s.Power[g.SetPower] = Math.abs(g.Points); }
      let perk = g.Perk;
      if (g.PerkInherit && g.SourceId) { const s = board.findMinion(g.SourceId); if (s) perk = s.Perk; }
      if (perk != null) { if (o === 1) board.TrumpetsPerk = perk; else if (o === 2) board.OpponentTrumpetsPerk = perk; c.NewPerk = perk; }
      B.add(wrap('Do', c));
    },
    /** ChangeTrumpetsMutator (Do<ChangeTrumpets>) */
    ChangeTrumpetsMutator(B, e) { const c = e.Event; if (e.Owner === 1) B.board.Trumpets = c.NewTrumpets; else B.board.OpponentTrumpets = c.NewTrumpets; B.add(wrap('Done', c)); },
    /** TrumpetsMutator.Force (Try<ForceTrumpets>) */
    'TrumpetsMutator.Force'(B, e) { summonTrumpetMinion(B, e.Event.Owner, 5); },
    /** PerkMutator (Try<GiveMinionPerk>) */
    PerkMutator(B, e) {
      const g = e.Event; const board = B.board;
      const m = board.findLiveMinion(g.TargetId); if (!m) return;
      let source = null;
      if (g.Source && g.Inherit) { source = board.findMinion(g.Source); if (source && source.Perk != null) g.Perk = source.Perk; }
      if (g.Perk == null) return;
      const pk = PERKS()[g.Perk]; if (!pk) unported('PerkConstants.GetPerk(' + g.Perk + ')');
      if (!pk.positive) {
        // Ambrosia (60) and White Okra (101) block an ailment and are lost; Strawberry (14) only with an aura of type 11
        if (m.Perk === 60 || m.Perk === 101 || (m.Perk === 14 && findAuras(B, m, 11).length > 0)) { B.add(wrap('Try', loseMinionPerk(g.Owner, g.TargetId, g.Source, m.Perk, true))); return; }
      } else if (m.Perk === 120 && !m.Abilities.some((a) => a.Enum === 839)) { // Bloated is lost unless the pet has ability 839
        B.add(wrap('Try', loseMinionPerk(g.Owner, g.TargetId, g.Source, m.Perk, false))); return;
      }
      let duration = g.Duration || 0;
      if ((source && source.Perk === 32) || m.Perk === 32) duration = 1; // Corn
      const pa = () => ({ B, SourceId: g.Source, TargetId: g.TargetId, Random: B.randomizer(g.Owner), Owner: g.Owner });
      let mult = g.Multiplier;
      if (g.MultiplierParameter) mult = paramValue(g.MultiplierParameter, pa());
      const old = m.Perk;
      if (g.Compound && old === g.Perk) { if (mult == null) mult = 0; mult = (m.PerkMultiplier || 1) + 1 + mult; }
      let dur = g.Durability;
      if (g.DurabilityParameter) dur = paramValue(g.DurabilityParameter, pa());
      setPerk(m, g.Perk, duration, mult ?? null, dur ?? null);
      g.ResultPerkReplaced = old; g.Result = perkResult(m, null);
      if (g.Future) unported('GiveMinionPerk.Future');
      if (g.SourceSpell == null && pk.positive) m.SpellCountsThisTurn++;
      B.add(wrap('Done', g));
    },
    /** LoseMinionPerkMutator (Try<LoseMinionPerk>) */
    LoseMinionPerkMutator(B, e) {
      const l = e.Event; const m = B.board.findMinion(l.Target, !l.IncludeDestroyed, !l.IncludeDead); if (!m) return;
      const lost = (res) => ev('PerkLost', { Owner: l.Owner, TargetId: l.Target, SourceId: l.Source, Perk: res, Projectile: null, RenderDelay: false, RenderSfx: l.RenderSfx, RenderLost: l.RenderLost, FailCause: 0 });
      if (m.Perk == null) { const f = lost(perkResult(m, null)); f.FailCause = 1; B.add(wrap('Fail', f)); return; }
      if (l.Perk != null && m.Perk !== l.Perk) return;
      if (l.Positive != null && perkPositive(m.Perk) !== l.Positive) return;
      const was = m.Perk;
      let res; if (!l.IgnoreDurability) res = tryRemovePerk(m); else { setPerk(m, null); res = perkResult(m, was); }
      B.add(wrap('Done', lost(res)));
    },
  };
  /** MinionExtensions.SetPerk(m, perk, duration, multiplier, durability): durability defaults to the template's (only when a perk is set). */
  function setPerk(m, perk, duration = 0, multiplier = null, durability = null) {
    m.Perk = perk ?? null; m.PerkDuration = duration; m.PerkMultiplier = multiplier;
    if (perk != null) { const pk = PERKS()[perk]; if (pk && durability == null) durability = pk.durability ?? null; m.PerkDurability = durability; m.PerkDurabilityMax = durability; }
  }
  const perkResult = (m, lost) => ({ LostPerk: lost ?? null, NewPerk: m.Perk, NewDurability: m.PerkDurability, NewDurabilityMax: m.PerkDurabilityMax, NewDuration: m.PerkDuration, Multiplier: m.PerkMultiplier });
  /** MinionExtensions.TryRemovePerk: a durability perk loses one charge first; the perk goes when none are left. */
  function tryRemovePerk(m) {
    if (m.Perk == null) return null;
    const res = { LostPerk: null, NewPerk: null, NewDurability: null, NewDurabilityMax: null, NewDuration: 0, Multiplier: m.PerkMultiplier };
    if (m.PerkDurability != null) {
      m.PerkDurability = m.PerkDurability - 1;
      if (m.PerkDurability < 1) { m.PerkDurability = null; m.PerkDurabilityMax = null; }
      res.NewDuration = m.PerkDuration; res.NewDurability = m.PerkDurability; res.NewDurabilityMax = m.PerkDurabilityMax;
      if (m.PerkDurability != null) { res.NewPerk = m.Perk; return res; }
    }
    const lost = m.Perk; setPerk(m, null); res.LostPerk = lost; res.NewPerk = m.Perk; return res;
  }
  const loseMinionPerk = (owner, target, source, perk, ignoreDurability) => ev('LoseMinionPerk', { Owner: owner, IncludeDestroyed: false, IncludeDead: false, Source: source, Target: target,
    Perk: perk, Projectile: null, RenderDelay: false, RenderSfx: true, RenderLost: true, IgnoreDurability: !!ignoreDurability, Positive: null });
  /** MinionExtensions.AddAttack: attack never drops below 1 (decompiled alongside AddHealth). */
  function addAttack(m, amount, dur) { m.Attack.Add(amount, dur !== 0); if (m.Attack.Permanent < 1) m.Attack.Set(1, false); }
  /** DamageMinion.Setup: remember HoneydewMelon/Guava/MapleSyrup holders (perks 93, 105, 110) and their multipliers. */
  function setupDamage(dm, B, source, target) {
    if (source && [93, 105, 110].includes(source.Perk)) { dm.AttackerInitialPerk = source.Perk; dm.AttackerInitialPerkMultiplier = source.PerkMultiplier ?? 1; }
    if (target && [93, 105, 110].includes(target.Perk)) { dm.DefenderInitialPerk = target.Perk; dm.DefenderInitialPerkMultiplier = target.PerkMultiplier ?? 1; }
  }

  const triggers = {
    /** TriggerSummonSystem */
    TriggerSummonSystem(B, e) {
      const s = e.Event; if (s.TriggerDisabled) return;
      if (s.SubType === 1) B.add(ev('Transform', { SourceId: s.Minion.Id }));
      else if (s.SubType === 3) B.add(ev('PetActivated', { PetActivatedId: s.Minion.Id, AbilityEnum: 10000 }));
      else B.add(ev('Summon', { SourceId: s.Minion.Id, SubType: s.SubType }));
    },
    /** TriggerSummonFailSystem: a summon that fails for lack of space flings the pet */
    TriggerSummonFailSystem(B, e) { const s = e.Event; if (s.TriggerDisabled || s.FailCause !== 1) return; B.add(ev('Flung', { SourceId: s.Minion.Id, Minion: s.Minion })); },
    /** TriggerChargedMinionSystem: Done<ChargedMinion> -> Charged */
    TriggerChargedMinionSystem(B, e) { const c = e.Event; B.add(ev('Charged', { SourceId: c.MinionId, Ability: c.Ability })); },
    /** TriggerGainedHealthSystem: Done<BuffMinion> with health gained -> HealthGained */
    TriggerGainedHealthSystem(B, e) { const b = e.Event; if (b.ResultHealthGained > 0) B.add(ev('HealthGained', { SourceId: b.TargetId, TargetId: b.Source, Value: b.ResultHealthGained })); },
    /** TriggerPetActivatedSystem */
    TriggerPetActivatedSystem(B, e) { const a = e.Event; B.add(ev('PetActivated', { PetActivatedId: a.MinionId, AbilityEnum: a.Ability })); },
    /** TriggerPerkGainedSystem (Done<GiveMinionPerk>): PerkLost for a replaced perk, PerkGained, then PlayedSpellOn for a positive food perk */
    TriggerPerkGainedSystem(B, e) {
      const g = e.Event; if (g.Perk == null) return;
      if (g.ResultPerkReplaced != null) B.add(ev('PerkLost', { SourceId: g.TargetId, Perk: g.ResultPerkReplaced, ReplacedBy: g.Perk }));
      B.add(ev('PerkGained', { SourceId: g.TargetId, Perk: g.Perk, Disabled: g.TriggersDisabled }));
      if (g.SourceSpell != null) return;
      const pk = PERKS()[g.Perk]; if (!pk || pk.spell == null || !pk.positive) return;
      B.add(ev('PlayedSpellOn', { Owner: g.Owner, Spell: pk.spell, TargetId: g.TargetId, SourceId: g.Source, Shop: false, Disabled: g.TriggersDisabled }));
    },
    /** TriggerPushMinionSystem (Done<PushMinion>) */
    TriggerPushMinionSystem(B, e) { const pm = e.Event; B.add(ev('Pushed', { SourceId: pm.TargetId, Type: pm.Type || 0 })); },
    /** TriggerPushMinionFailSystem (Fail<PushMinion>): the resisting perk is used up */
    TriggerPushMinionFailSystem(B, e) { const pm = e.Event; if (pm.ResultLostPerk && pm.ResultLostPerk.LostPerk != null) B.add(ev('PerkLost', { SourceId: pm.TargetId, Perk: pm.ResultLostPerk.LostPerk })); },
    /** TriggerTransformSystem (Done<TransformMinion>) */
    TriggerTransformSystem(B, e) { const t = e.Event; B.add(ev('Transform', { SourceId: t.Target, Back: t.Back, Stacking: t.Stacking, OldMinion: t.ResultOldMinion })); },
    /** TriggerGainedManaSystem (Done<ChangeMinionMana>) */
    TriggerGainedManaSystem(B, e) { const c = e.Event; if (c.TriggerDisabled || !(c.ResultAmount > 0)) return; B.add(ev('ManaGained', { SourceId: c.TargetId, TargetId: c.SourceId || M.itemId('M', 0), Value: c.Amount })); },
    /** TriggerGiveExpSystem (Done<GiveMinionExp>) */
    TriggerGiveExpSystem(B, e) { const g = e.Event; if (!(g.Amount > 0)) return; B.add(ev('GiveExperience', { SourceId: g.SourceId || M.itemId('M', 0), TargetId: g.TargetId })); },
    /** TriggerLevelUp (Done<GiveMinionExp>): one Levelup per level gained, TriggerLevel = the level reached */
    TriggerLevelUp(B, e) {
      const g = e.Event; const r = g.Result; if (!r) return;
      for (let i = 0; i < r.LevelsGained; i++) B.add(ev('Levelup', { SourceId: g.TargetId, TriggerLevel: r.NewLevel - r.LevelsGained + 1 + i }));
    },
    /** TriggerPerkLostSystem (Done<PerkLost>) */
    TriggerPerkLostSystem(B, e) { const l = e.Event; if (l.Perk && l.Perk.LostPerk != null) B.add(ev('PerkLost', { SourceId: l.TargetId, Perk: l.Perk.LostPerk })); },
  };

  const hooks = {
    tryTriggerMinion, activateAbilityTry, activateAbilityDo,
    castEffectWrapper(B, e) { B.add(e.CastEffects); },
    castEffect(B, e) { B.add(e.EffectResult.Events); },
    abilityCleanup(B, e) { const m = B.board.findLiveMinion(e.Event.MinionId); if (!m) return; if (m.Abilities.some((a) => { const ab = getAbility(a.Enum, a.Level); return ab && ab.PersistTargets; })) unported('AbilityCleanup PersistTargets'); },
    mutators, triggers,
    summonAttempt, summonMutator, forceActivateAbility, initMinion: updateStatsMax,
    findAuras, countAura, tryAttackAdjacent, getPerkMultiplier, getNegativePerkMultiplier,
    summonTrumpetMinion, trumpetsTrade(B) { summonTrumpetMinion(B, 1, 2); summonTrumpetMinion(B, 2, 2); },
    attacksWithHealth: (m) => !!((D.minions[m.Enum] || {}).raw || {}).AttackWithHealth, // MinionTemplate.AttackWithHealth (+0x120)
  };

  const api = { hooks, getAbility, paramValue, predicate, findMinions, getTargets, conditionCheck, isTriggered, fastShuffle };
  if (isNode) module.exports = api; else { root.SAPGame = root.SAPGame || {}; root.SAPGame.abilities = api; }
})(typeof window !== 'undefined' ? window : globalThis);
