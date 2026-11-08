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

  // ---------------------------------------------------------------- Parameters (ParameterInt.GetValue)
  /** pa: ParameterArgs {B, TargetId, SourceId, TriggerTargetId, TriggerSourceId, AimId, Random, TriggerEvent, Owner} */
  function paramValue(p, pa) {
    if (p == null) return null;
    let v = paramBase(p, pa);
    if (p.Calculator) unported('Calculator');
    if (p.Op1_Invert) v = -v;
    if (p.Op2_Addition != null) v += p.Op2_Addition;
    if (p.Op3_Multiplier != null) { const m = decimal(p.Op3_Multiplier); const x = v * m; v = p.RoundUp ? Math.ceil(x - 1e-12) : Math.floor(x + 1e-12); }
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
    if (f.HasPlayTrigger != null || f.HasSellTrigger != null || f.HasDeathTrigger != null || f.HasBeforeDeathTrigger != null || f.HasHurtTrigger != null ||
      f.HasStartBattleTrigger != null || f.HasStartTurnTrigger != null || f.HasEndTurnTrigger != null || f.HasDamageEffect != null) unported('MinionFinder.Has*Trigger');
    if (f.ExcludeTypeSelf && owner && owner.Enum === cand.Enum) return false;
    if (f.ExcludeType != null && f.ExcludeType === cand.Enum) return false;
    if (f.ExcludeTypes && f.ExcludeTypes.values && f.ExcludeTypes.values.includes(cand.Enum)) return false;
    if (f.IncludeTypes && f.IncludeTypes.values && !f.IncludeTypes.values.includes(cand.Enum)) return false;
    if (f.IsPlayerMinion != null && cand.Owner !== 1) return false;
    if (f.HasSibling != null || f.AllowUniques != null) unported('MinionFinder.HasSibling/AllowUniques');
    if (f.DamageTaken != null && cand.DamageTaken !== f.DamageTaken) return false;
    if (f.DamageDealt != null && (cand.DamageDealtThisBattle > 0) !== f.DamageDealt) return false;
    if (f.FoodEaten != null || f.LastTargetThisTurn != null || f.OldTargetsThisTurn != null || f.InPack != null || f.IsPreviousSurvivor != null || f.InWackyParameters != null || f.WithoutMemoryAbility != null) unported('MinionFinder.shop fields');
    if (f.IsEnemyCheck && cand.Owner !== 2) return false;
    return true;
  }
  /** MinionExtensions.GetDistance */
  function getDistance(board, a, b, emptySpaces, skipDead) {
    if (!a || !b) return 0;
    if (emptySpaces) return Math.abs(a.Point.x - b.Point.x);
    unported('MinionExtensions.GetDistance(counting pets)');
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
    const pa = { B, SourceId: ca.OwnerId, TriggerSourceId: sourceOf(ca.TriggerEvent) || null, TriggerTargetId: targetOf(ca.TriggerEvent) || null, Random: ca.Random, TriggerEvent: ca.TriggerEvent };
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
    if (ab.Enum === 928) unported('ActivateAbilityTry jump-attack precompute (928)');
    if (ab.Enum === 941 || ab.Enum === 931) unported('ActivateAbilityTry transform precompute');
    const acts = buildRepeatActivations(B, e, minion, model, ab, rand);
    for (const a of acts) B.add(wrap('Try', a));
    B.add(wrap('Done', t));
    if (t.RemovePerk != null) unported('AbilityTriggered.RemovePerk');
  }
  function newActivate(t, n) {
    return ev('AbilityActivate', { Owner: t.Owner, Ability: t.Ability, MinionId: t.MinionId, Level: t.Level, Aim: t.Aim, TriggerEvent: t.TriggerEvent, Type: t.Type, Reversed: false,
      Force: t.Force, RepeatIndex: 0, RepeatMax: 0, DisableAfterTemp: t.DisableAfterTemp || false, FailCause: { Status: 0, Loud: false }, MinionActivationNumber: n,
      EffectMultiplier: t.EffectMultiplier, PrecomputedEvents: null });
  }
  function buildRepeatActivations(B, e, minion, model, ab, rand) {
    const t = e.Event; const list = [];
    let reps = ab.Repeat ?? 1;
    if (ab.RepeatParameter) reps = paramValue(ab.RepeatParameter, { B, SourceId: minion.Id, TriggerSourceId: sourceOf(t.TriggerEvent) || null, TriggerTargetId: targetOf(t.TriggerEvent) || null, Random: rand, TriggerEvent: t.TriggerEvent });
    const base = ab.Repeat ?? 1;
    for (let i = 0; i < reps; i++) list.push(newActivate(t, ++minion.AbilityActivations));
    if (t.Type === 1) { const extra = (minion.PerkMultiplier ?? 1) - 1; for (let i = 0; i < extra; i++) for (let j = 0; j < base; j++) { const a = newActivate(t, ++minion.AbilityActivations); a.Force = true; a.Level = 1; list.push(a); } }
    if (t.Type === 2) { const extra = (minion.PerkMultiplier ?? 1) - 1; if (extra > 0) unported('ailment repeats'); }
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
        else { const sub = []; for (const x of pair.Effect.Effects || []) { const r = effectSingle(x, sa); if (r && r.length) sub.push(ev('CastEffect', { Owner: owner.Owner, EffectResult: { Events: r, Effect: x } })); } if (sub.length) perTarget.push(wrapList(sub)); }
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
      default: return unported(t + '.OnGlobal');
    }
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
      default: return unported(t);
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
  };
  /** MinionExtensions.AddAttack: attack never drops below 1 (decompiled alongside AddHealth). */
  function addAttack(m, amount, dur) { m.Attack.Add(amount, dur !== 0); if (m.Attack.Permanent < 1) m.Attack.Set(1, false); }
  /** DamageMinion.Setup: remember HoneydewMelon/Guava/MapleSyrup holders (perks 93, 105, 110) and their multipliers. */
  function setupDamage(dm, B, source, target) {
    if (source && [93, 105, 110].includes(source.Perk)) { dm.AttackerInitialPerk = source.Perk; dm.AttackerInitialPerkMultiplier = source.PerkMultiplier ?? 1; }
    if (target && [93, 105, 110].includes(target.Perk)) { dm.DefenderInitialPerk = target.Perk; dm.DefenderInitialPerkMultiplier = target.PerkMultiplier ?? 1; }
  }

  const triggers = {
    /** TriggerChargedMinionSystem: Done<ChargedMinion> -> Charged */
    TriggerChargedMinionSystem(B, e) { const c = e.Event; B.add(ev('Charged', { SourceId: c.MinionId, Ability: c.Ability })); },
    /** TriggerGainedHealthSystem: Done<BuffMinion> with health gained -> HealthGained */
    TriggerGainedHealthSystem(B, e) { const b = e.Event; if (b.ResultHealthGained > 0) B.add(ev('HealthGained', { SourceId: b.TargetId, TargetId: b.Source, Value: b.ResultHealthGained })); },
    /** TriggerPetActivatedSystem */
    TriggerPetActivatedSystem(B, e) { const a = e.Event; B.add(ev('PetActivated', { PetActivatedId: a.MinionId, AbilityEnum: a.Ability })); },
  };

  const hooks = {
    tryTriggerMinion, activateAbilityTry, activateAbilityDo,
    castEffectWrapper(B, e) { B.add(e.CastEffects); },
    castEffect(B, e) { B.add(e.EffectResult.Events); },
    abilityCleanup(B, e) { const m = B.board.findLiveMinion(e.Event.MinionId); if (!m) return; if (m.Abilities.some((a) => { const ab = getAbility(a.Enum, a.Level); return ab && ab.PersistTargets; })) unported('AbilityCleanup PersistTargets'); },
    mutators, triggers,
    attacksWithHealth: (m) => !!((D.minions[m.Enum] || {}).raw || {}).AttackWithHealth, // MinionTemplate.AttackWithHealth (+0x120)
  };

  const api = { hooks, getAbility, paramValue, predicate, findMinions, getTargets, conditionCheck, isTriggered, fastShuffle };
  if (isNode) module.exports = api; else { root.SAPGame = root.SAPGame || {}; root.SAPGame.abilities = api; }
})(typeof window !== 'undefined' ? window : globalThis);
