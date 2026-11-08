/*
 * Battle resolver, ported system by system from the game's Spacewood.Core.Actions.Resolver (BoardResolver, SystemManager,
 * BoardSystemCoordinator and the 170 systems/mutators in registration order). Event and field names follow the game so the
 * produced EventLog can be compared line by line with logs recorded from the game itself (tools/compare-oracle.mjs).
 * Source: decompiled GameAssembly.dll, build 26131463 (docs/game-internals/SCHEDULER.md, BATTLE-LOOP.md).
 */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const M = isNode ? require('./model.js') : root.SAPGame.model;
  const R = isNode ? require('./rng.js') : root.SAPGame.rng;
  const { BoardModel, idEq, getFrontDistance, damageMinion, addHealth } = M;

  // ---------------------------------------------------------------- events
  /** A BoardEvent. `cls` is the game's class name (wrappers: 'Try' | 'Do' | 'Done' | 'Fail' with .Event = inner event). */
  function ev(cls, fields = {}) { return Object.assign({ cls, Owner: 0, Depth: 0, Number: 0 }, fields); }
  const wrap = (w, inner, extra) => ev(w, Object.assign({ Owner: inner.Owner, Event: inner }, extra));
  const isW = (e, w, inner) => e.cls === w && e.Event && (inner === undefined || e.Event.cls === inner);
  const isDone = (e, inner) => isW(e, 'Done', inner);
  const isFail = (e, inner) => isW(e, 'Fail', inner);
  const TRIGGER_EVENTS = new Set(['BeforeStartBattle', 'StartBattle', 'Levelup', 'BeforeAttackEarly', 'BeforeAttack', 'Attack', 'HurtEarly', 'Hurt',
    'ManaGained', 'Summon', 'Pushed', 'BeforeDeath', 'DeathEarly', 'Death', 'Kill', 'BeforeTransform', 'Transform', 'AllFaint', 'BeforeRoll',
    'GiveExperience', 'BeforeSell', 'EmptyFront', 'EndTurn', 'StartTurn', 'Sell', 'Infront', 'BuffGained', 'PlaySpell', 'PlayedSpellOn', 'Charged',
    'UpgradeTier', 'GoldSpent', 'Play', 'BattleDefeat', 'RollShop', 'SpendAttack', 'SpendHealth', 'LostAttack', 'HealthGained', 'PerkLost',
    'PerkGained', 'Flung', 'PetActivated', 'StartBattleEnded', 'MinionsStocked']);
  /** TriggerAbilitySystem.All.ExecutionOrder (get_ExecutionOrder): TriggerMinions batches resolve by this type order. */
  const EXECUTION_ORDER = ['BeforeStartBattle', 'StartBattle', 'Levelup', 'BeforeAttackEarly', 'BeforeAttack', 'Attack', 'HurtEarly', 'Hurt', 'ManaGained',
    'Summon', 'Pushed', 'BeforeDeath', 'DeathEarly', 'Death', 'Kill', 'BeforeTransform', 'Transform', 'AllFaint', 'BeforeRoll', 'GiveExperience', 'BeforeSell',
    'EmptyFront', 'EndTurn', 'StartTurn', 'Sell', 'Infront', 'BuffGained', 'PlaySpell', 'PlayedSpellOn', 'Charged', 'UpgradeTier', 'GoldSpent', 'Play',
    'BattleDefeat', 'RollShop', 'SpendAttack', 'SpendHealth', 'LostAttack', 'HealthGained', 'PerkLost', 'PerkGained', 'Flung', 'PetActivated',
    'StartBattleEnded', 'MinionsStocked'];
  const ORDER_INDEX = new Map(EXECUTION_ORDER.map((t, i) => [t, i]));
  const ITRIGGER_DEATH = new Set(['BeforeDeath', 'DeathEarly', 'Death']); // Abilities.ITriggerDeath
  const PHASE = (cls, group) => ev(cls, { Group: group, Lane: 0, phase: true });
  /** TriggerEventExtensions.GetSourceOrNull / GetTargetOrNull (ITriggerSource / ITriggerTarget: first and second id fields). */
  const NO_SOURCE = new Set(['StartBattle', 'BeforeStartBattle', 'StartBattleEnded', 'EmptyFront', 'AllFaint', 'EndTurn', 'StartTurn', 'RollShop', 'BeforeRoll', 'UpgradeTier', 'GoldSpent', 'PlaySpell', 'MinionsStocked', 'BattleDefeat']);
  function sourceOf(e) { if (!e || NO_SOURCE.has(e.cls)) return undefined; return e.SourceId !== undefined ? e.SourceId : e.AttackerId !== undefined ? e.AttackerId : e.PetActivatedId; }
  function targetOf(e) { if (!e) return undefined; return e.TargetId !== undefined ? e.TargetId : e.DefenderId; }

  // ---------------------------------------------------------------- coordinators / scheduler
  /** WoodQueue (FIFO) or TypeSortedList (TriggerAbilitySystem.All): GetFirstOfSameTypes(remove=true) takes the first type bucket. */
  class WoodQueue { constructor() { this.items = []; } add(e) { this.items.push(e); } get count() { return this.items.length; }
    pop() { return this.items.shift(); } takeAll() { const r = this.items; this.items = []; return r; } }
  class TypeSortedList {
    constructor(getType) { this.getType = getType; this.buckets = new Map(); this.unindexed = []; }
    add(e) { const i = ORDER_INDEX.get(this.getType(e)); if (i === undefined) { this.unindexed.push(e); return; } if (!this.buckets.has(i)) this.buckets.set(i, []); this.buckets.get(i).push(e); }
    get count() { let n = this.unindexed.length; for (const b of this.buckets.values()) n += b.length; return n; }
    takeFirstOfSameTypes() {
      if (this.buckets.size) {
        const k = Math.min(...this.buckets.keys()); const list = this.buckets.get(k); const t = this.getType(list[0]); const out = [];
        while (list.length && this.getType(list[0]) === t) out.push(list.shift());
        if (!list.length) this.buckets.delete(k); return out;
      }
      const out = []; if (!this.unindexed.length) return out; const t = this.getType(this.unindexed[0]);
      while (this.unindexed.length && this.getType(this.unindexed[0]) === t) out.push(this.unindexed.shift());
      return out;
    }
  }

  // ---------------------------------------------------------------- the resolver
  class Battle {
    /**
     * @param {object} o
     *   o.pets: [{Id:{BoardId,Unique}, Owner:1|2, Enum, x, Level, Attack, Health, Perk, ...}] already placed on the merged board
     *   o.seed, o.playerSeed, o.opponentSeed: the BattleState seeds (BoardResolver.RunBattle)
     *   o.unique: merged board's UniqueNumberCounter (summons get counter+1, with BoardId 'M')
     *   o.hooks: { tryTriggerMinion(battle, minion, triggerEvent, rand) -> events|null, ...ability systems }
     */
    constructor(o) {
      this.o = o;
      this.board = new BoardModel();
      this.board.UniqueNumberCounter = o.unique ?? 0;
      for (const p of o.pets) { if (p.Relic) continue; this.board.setMinion({ x: p.x, y: 0 }, new M.MinionModel(p)); }
      // Relics live in their own grid (BoardModel.Relics), iterated by cell index.
      this.board.Relics = o.pets.filter((p) => p.Relic).sort((a, b) => a.x - b.x).map((p) => { const m = new M.MinionModel(p); m.Point = { x: p.x, y: 0 }; return m; });
      if (o.trumpets) Object.assign(this.board, o.trumpets);
      if (o.boardCapacity != null) this.board.BoardCapacity = o.boardCapacity;
      // o.boardFields: the board's own counters before the battle (rolls, gold spent, transformations, ...), as BoardModel names them
      if (o.boardFields) for (const [k, v] of Object.entries(o.boardFields)) if (!/^(UniqueNumberCounter|ReverseMinionAccess|Hash|Dirty|TurnOver|Attacks)/.test(k)) this.board[k] = v;
      if (o.hooks && o.hooks.initMinion) for (const m of this.board.cells.concat(this.board.Relics)) if (m) o.hooks.initMinion(m);
      this.state = { Seed: o.seed, PlayerSeed: o.playerSeed, OpponentSeed: o.opponentSeed, Turn: 0, Outcome: 0, StartingPlayer: 0, CurrentPriority: 0,
        DamageDealt: 0, DamageTaken: 0, EventLog: [], DisableCrits: false };
      this.hooks = o.hooks || {};
      this.counter = 0; this.logged = new Set(); this.executing = null; this.iterations = 0;
      // BoardResolver.ProcessBattle: starting player = higher CoreRandom(seed).Next(int.MaxValue); ties redraw (101 tries).
      const pr = new R.DotNetRandom(o.playerSeed), orr = new R.DotNetRandom(o.opponentSeed);
      for (let i = 0; i < 101; i++) { const a = pr.next(2147483647), b = orr.next(2147483647); if (b < a) { this.state.StartingPlayer = 1; break; } if (a < b) { this.state.StartingPlayer = 2; break; } }
      this.state.CurrentPriority = this.state.StartingPlayer;
      this.board.ReverseMinionAccess = this.state.StartingPlayer === 2;
      // Shared System.Random streams handed to every system (BoardSystem.InitializeSystem).
      this.rand = { 1: new R.DotNetRandom((o.playerSeed - o.seed) | 0), 2: new R.DotNetRandom((o.opponentSeed - o.seed) | 0), 0: new R.DotNetRandom(o.seed) };
      this.phases = {
        1: [PHASE('PhaseBeforeStartBattle', 1), PHASE('PhaseStartBattle', 1), PHASE('PhaseEmptyFront', 1), PHASE('PhaseMove', 1), PHASE('PhaseHasCompletedCleanup', 1)],
        2: [PHASE('PhaseTrade', 2), PHASE('PhaseEmptyFront', 2), PHASE('PhaseMove', 2), PHASE('PhaseHasCompletedCleanup', 2)],
        3: [PHASE('PhaseFinalCleanup', 3)],
      };
      this.jumpAttackCounter = 0;
      this.systems = buildSystems(this);
    }
    randomizer(owner) { return this.rand[owner]; }
    /** BoardSystem.RandomInt(owner, n): draws the other side's stream first, then the owner's (the owner's result is used). */
    randomInt(owner, n) { this.rand[owner === 1 ? 2 : owner === 2 ? 1 : 0].next(n); return this.rand[owner].next(n); }

    /** SystemManager.Add */
    add(e) {
      if (!e) return;
      if (Array.isArray(e)) { for (const x of e) this.add(x); return; }
      if (e.Number === 0) e.Number = this.counter;
      if (e.Depth === 0) { const p = this.executing && this.executing[0]; e.Depth = p ? p.Depth + 1 : 0; }
      if (e.Depth >= 201) return; // the game silently drops events nested deeper than 200
      this.counter++;
      for (const s of this.systems) if (s.accepts(e)) s.queue.add(e);
    }
    /** SystemManager.Loop: run the lowest-index coordinator with pending events; log each event on its first execution. */
    loop() {
      for (;;) {
        const s = this.systems.find((x) => x.queue.count > 0);
        if (!s) return;
        if (++this.iterations > 2000000) throw new Error('EndlessLoopException');
        const batch = s.mode === 'all' ? s.queue.takeAll() : s.mode === 'typed' ? s.queue.takeFirstOfSameTypes() : [s.queue.pop()];
        this.executing = batch;
        try { if (s.mode === 'one') s.execute(batch[0]); else s.execute(batch); } finally { this.executing = null; }
        for (const e of batch) if (!this.logged.has(e.Number)) { this.logged.add(e.Number); this.state.EventLog.push(e); }
      }
    }
    /** BoardResolver.ProcessBattle */
    run() {
      this.add(ev('InitiatePhaseGroupEvent', { Group: 1 })); this.loop();
      const r = this.isBattleResolved();
      if (!r.resolved) {
        for (let turn = 0; ; turn++) {
          if (turn > 9999) throw new Error('EndlessLoopException');
          this.state.Turn = turn;
          this.add(ev('InitiatePhaseGroupEvent', { Group: 2 })); this.loop();
          const q = this.isBattleResolved(); if (q.resolved) { this.state.Outcome = q.outcome; break; }
        }
        this.add(ev('InitiatePhaseGroupEvent', { Group: 3 })); this.loop();
      } else this.state.Outcome = r.outcome;
      return { outcome: this.state.Outcome, turn: this.state.Turn, log: this.state.EventLog, board: this.board, state: this.state };
    }
    /** BoardExtensions.IsBattleResolved: 1 = player won, 2 = opponent won, 3 = draw (also at turn >= 70 with both alive). */
    isBattleResolved() {
      const live = this.board.findLiveMinions();
      const p = live.some((m) => m.Owner === 1), o = live.some((m) => m.Owner === 2);
      const tp = this.board.Trumpets > 0 && !this.board.TrumpetsDone, to = this.board.OpponentTrumpets > 0 && !this.board.OpponentTrumpetsDone;
      if (!p && !o && (to || tp)) return { resolved: false, outcome: 0 };
      if (!p && !o) return { resolved: true, outcome: 3 };
      if (!(p || tp)) return { resolved: true, outcome: 2 };
      if (!(o || to)) return { resolved: true, outcome: 1 };
      if (this.state.Turn < 70) { this.state.Outcome = 0; return { resolved: false, outcome: 0 }; }
      this.state.Outcome = 3; return { resolved: true, outcome: 3 };
    }
  }

  // ---------------------------------------------------------------- damage (DamageAttemptMutator / DamageCalculation)
  function newCalc() {
    return { BaseAmount: 0, BaseMultiplier: 1, FlatBonus: 0, Multiplier: 1, Fixed: null, Min: null, Max: null, Halfer: 0, FlatReduction: 0, CeilReduction: 0,
      CeilReductionLimit: 1, Nullify: false, Killify: false, KillifyRemove: null, Protectify: false, Bottomfy: false, IsAbility: false, IsSplash: false,
      IgnorePerks: false, Attacker: null, Defender: null, CriticalHit: false, Random: null, ResultingEvents: [], Event: null };
  }
  const calcMinion = (m) => ({ Minion: m, PerkMultiplier: 1, AilmentMultiplier: 1, AilmentReversed: false, LostPerk: null, Exhausted: null, InitialPerk: null, InitialPerkMultiplier: 1 });
  /** MinionExtensions.TryRemovePerk -> PerkResult (durability perks lose one charge first). */
  function tryRemovePerk(m) {
    if (!m || m.Perk == null) return null;
    const res = { LostPerk: null, NewPerk: m.Perk, NewDurability: null, NewDurabilityMax: null, NewDuration: m.PerkDuration, Multiplier: m.PerkMultiplier ?? 1 };
    if (m.PerkDurability != null) {
      m.PerkDurability = m.PerkDurability - 1;
      if (m.PerkDurability < 1) { m.PerkDurability = null; m.PerkDurabilityMax = null; }
      res.NewDurability = m.PerkDurability; res.NewDurabilityMax = m.PerkDurabilityMax;
      if (m.PerkDurability != null) { res.NewPerk = m.Perk; return res; }
    }
    const lost = m.Perk; m.Perk = null; m.PerkDurability = null; m.PerkDurabilityMax = null; m.PerkMultiplier = null;
    res.LostPerk = lost; res.NewPerk = lost; return res;
  }
  const dmRemove = (dm) => { dm.LostPerk = tryRemovePerk(dm.Minion); };
  const perkIs = (dm, p) => dm && dm.Minion && dm.Minion.Perk === p;

  /** DamageCalculation.Calculate */
  function calculate(c) {
    if (c.Nullify) return 0;
    if (c.Bottomfy) return 1;
    let d = (c.BaseMultiplier * c.BaseAmount + c.FlatBonus) * c.Multiplier;
    if (c.Min != null && d < c.Min) d = c.Min;
    if (c.Max != null && c.Max < d) d = c.Max;
    if (c.Fixed != null) d = c.Fixed;
    if (c.Halfer !== 0) { let f = Math.fround(d); for (let i = 0; i < c.Halfer; i++) f = Math.fround(f * 0.5); d = Math.ceil(f) | 0; }
    if (c.CeilReductionLimit < d) d = Math.max(c.CeilReductionLimit, d - c.CeilReduction);
    if (0 < d) d = Math.max(0, d - c.FlatReduction);
    const hp = c.Defender.Minion.Health.Total;
    if (c.Killify && d >= 1) {
      if (c.KillifyRemove != null && c.Attacker.Minion && c.Attacker.Minion.Perk === c.KillifyRemove) c.Attacker.LostPerk = tryRemovePerk(c.Attacker.Minion);
      return Math.max(hp, d);
    }
    if (c.Protectify && d >= hp) return hp - 1;
    return Math.max(0, d);
  }

  // ---------------------------------------------------------------- systems table
  function buildSystems(B) {
    const board = B.board, st = B.state;
    const hooks = B.hooks;
    const S = [];
    const sys = (name, accepts, execute, mode = 'one', queue) => S.push({ name, accepts, execute, mode, queue: queue || new WoodQueue() });
    const none = () => false;
    const stub = (name) => sys(name, none, () => {});

    // DamageAttemptMutator.ProcessAttacker (perk/tribe part; auras via hooks)
    function processAttacker(c) {
      const A = c.Attacker, D = c.Defender, am = A.Minion;
      if (!am) return;
      const dm = D.Minion;
      if (am.Tribe != null && dm.Tribe != null) {
        const a = am.Tribe, d = dm.Tribe; // TribeEnum: 0 Fire > 1 Grass > 3 Thunder > 2 Water > 0 Fire
        if ((a === 0 && d === 1) || (a === 1 && d === 3) || (a === 3 && d === 2) || (a === 2 && d === 0)) c.Multiplier += 1;
      }
      if (c.IsSplash) { const n = A.PerkMultiplier - 1; if (0 < n) c.BaseMultiplier += n; }
      if (!c.IsAbility) {
        for (const ref of (hooks.findAuras ? hooks.findAuras(B, am, 0) : [])) { c.Multiplier += ref.value; c.CriticalHit = true; }
        if (perkIs(A, 6)) c.FlatBonus += A.PerkMultiplier * 3;
        if (A.InitialPerk === 110) { c.FlatBonus += A.InitialPerkMultiplier * 5; if (perkIs(A, 110)) dmRemove(A); }
        else if (perkIs(A, 110)) { c.FlatBonus += A.PerkMultiplier * 5; dmRemove(A); }
        if (A.InitialPerk === 105) { c.FlatBonus += A.InitialPerkMultiplier * 3; if (perkIs(A, 105)) dmRemove(A); }
        else if (perkIs(A, 105)) { c.FlatBonus += A.PerkMultiplier * 3; dmRemove(A); }
        if (perkIs(A, 3)) { c.Multiplier += A.PerkMultiplier; dmRemove(A); }
        if (perkIs(A, 23)) { c.Min = A.PerkMultiplier * 15; dmRemove(A); }
        if (perkIs(A, 12)) { c.FlatBonus += A.PerkMultiplier * 20; dmRemove(A); }
        if (perkIs(A, 90)) { c.FlatBonus += A.PerkMultiplier * 10; dmRemove(A); }
        if (perkIs(A, 11)) { if (c.Random.nextDouble() < 0.5) { c.Multiplier += A.PerkMultiplier; c.CriticalHit = true; } }
        if (perkIs(A, 2)) { c.Killify = true; c.KillifyRemove = null; }
        if (perkIs(A, 88)) { c.Killify = true; c.KillifyRemove = 88; }
        if (perkIs(A, 84)) { if (A.AilmentMultiplier < 1) c.Multiplier += -A.AilmentMultiplier; else c.Halfer += 1; dmRemove(A); }
        if (perkIs(A, 98)) { c.Max = 5; dmRemove(A); }
        if (A.InitialPerk === 93) c.Halfer += A.PerkMultiplier;
      } else {
        if (!(c.Event && c.Event.SourcePerk === 57)) for (const ref of (hooks.findAuras ? hooks.findAuras(B, am, 3) : [])) c.FlatBonus += ref.value;
        if (perkIs(A, 21)) { c.FlatBonus += A.PerkMultiplier * 2; dmRemove(A); }
        if (perkIs(A, 78)) { c.FlatBonus += A.PerkMultiplier * 8; dmRemove(A); }
        if (!c.IsAbility) return; // (unreachable; kept to mirror the decompiled control flow)
      }
      if (perkIs(A, 37)) c.CeilReduction += A.AilmentMultiplier * 3, c.CeilReductionLimit = Math.max(c.CeilReductionLimit, 1);
      if (hooks.findAuras && hooks.findAuras(B, am, 0x10).length) c.Multiplier += 1;
    }
    // DamageAttemptMutator.ProcessDefenderPerks
    function processDefenderPerks(c) {
      if (c.IgnorePerks) return;
      const A = c.Attacker, D = c.Defender, am = A.Minion, dm = D.Minion;
      if (am && am.Perk === 40) return;
      if (perkIs(D, 0)) { c.Nullify = true; dmRemove(D); }
      if (perkIs(D, 29) && c.IsAbility) { c.FlatReduction += D.PerkMultiplier * 10; dmRemove(D); }
      if (perkIs(D, 13)) { c.FlatReduction += D.PerkMultiplier * 20; dmRemove(D); }
      if (perkIs(D, 79)) { c.FlatReduction += D.PerkMultiplier * 10; dmRemove(D); }
      if (perkIs(D, 60)) { c.FlatReduction += D.PerkMultiplier * 8; dmRemove(D); }
      if (perkIs(D, 66)) { c.FlatReduction += D.PerkMultiplier * 5; dmRemove(D); }
      if (perkIs(D, 18)) { c.Protectify = true; dmRemove(D); }
      if (perkIs(D, 22)) { c.FlatReduction += D.PerkMultiplier * 7; dmRemove(D); }
      if (perkIs(D, 108)) { c.CeilReduction += D.PerkMultiplier; c.CeilReductionLimit = Math.max(c.CeilReductionLimit, 1); }
      if (perkIs(D, 9)) { c.CeilReduction += D.PerkMultiplier * 2; c.CeilReductionLimit = Math.max(c.CeilReductionLimit, 2); }
      if (perkIs(D, 68) && am && am.Owner !== dm.Owner) { c.FlatReduction += D.PerkMultiplier * 4; dmRemove(D); }
      if (D.InitialPerk === 110) { c.FlatReduction += D.InitialPerkMultiplier * 10; if (perkIs(D, 110)) dmRemove(D); }
      else if (perkIs(D, 110)) { c.FlatReduction += D.PerkMultiplier * 10; dmRemove(D); }
      if (D.InitialPerk === 105) { c.FlatReduction += D.InitialPerkMultiplier * 3; if (perkIs(D, 105)) dmRemove(D); }
      else if (perkIs(D, 105)) { c.FlatReduction += D.PerkMultiplier * 3; dmRemove(D); }
      if (perkIs(D, 14)) {
        const auras = hooks.findAuras ? hooks.findAuras(B, dm, 0xb) : [];
        if (auras.length > 0) { for (const ref of auras) c.FlatReduction += ref.value; dmRemove(D); }
      }
      if (perkIs(D, 101)) { c.FlatReduction += D.PerkMultiplier * 10; dmRemove(D); }
      if (perkIs(D, 80)) { c.FlatReduction += D.PerkMultiplier * 2; dmRemove(D); }
      if (D.InitialPerk === 93) { c.Halfer += D.PerkMultiplier; if (perkIs(D, 93)) dmRemove(D); }
    }
    // DamageAttemptMutator.ProcessDefenderAilments
    function processDefenderAilments(c) {
      const D = c.Defender; const p = D.Minion.Perk;
      const reversed = (amount) => { c.FlatReduction += amount; if (D.Minion.PerkDurability == null) D.Minion.PerkDurability = 3; dmRemove(D); };
      if (p === 10) { if (0 < D.AilmentMultiplier) { c.FlatBonus += D.AilmentMultiplier * 3; return; } reversed(D.AilmentMultiplier * -3); return; } // Weak
      if (p === 63) { if (0 < D.AilmentMultiplier) { c.FlatBonus += D.AilmentMultiplier; return; } reversed(-D.AilmentMultiplier); return; } // Scared
      if (p === 56) { if (D.AilmentMultiplier < 1) c.Halfer += -D.AilmentMultiplier; else c.Multiplier += D.AilmentMultiplier; dmRemove(D); return; } // Acid
      if (p === 54) { c.FlatBonus += D.AilmentMultiplier * 5; dmRemove(D); } // Frozen
    }
    function processDefender(c) {
      processDefenderPerks(c); processDefenderAilments(c);
      const dm = c.Defender.Minion;
      if (c.IsAbility && hooks.findAuras) for (const ref of hooks.findAuras(B, dm, 6)) c.FlatReduction += ref.value;
      if (hooks.findAuras) for (const ref of hooks.findAuras(B, dm, 10)) { if (ref.ceil) { c.CeilReduction += ref.value; } else c.FlatReduction += ref.value; if (hooks.countAura) hooks.countAura(B, c.Defender, ref); }
    }
    /** DamageAttemptMutator.TryDamage(target, source, event, splash?) -> resulting events */
    function tryDamage(target, source, e, splash) {
      const c = newCalc(); c.Event = e; c.Random = B.randomizer(e.Owner);
      c.BaseAmount = splash == null ? e.Amount + c.Random.next(0, e.Range + 1) : splash;
      c.IsAbility = e.DamageType !== 0 || splash != null; c.IsSplash = splash != null; c.IgnorePerks = !!e.IgnorePerks;
      c.Attacker = calcMinion(source); c.Defender = calcMinion(target);
      c.Attacker.PerkMultiplier = source ? (hooks.getPerkMultiplier ? hooks.getPerkMultiplier(B, source) : (source.Perk != null ? (source.PerkMultiplier ?? 1) : 1)) : 1;
      c.Attacker.AilmentMultiplier = hooks.getNegativePerkMultiplier ? hooks.getNegativePerkMultiplier(B, source) : (source && source.PerkMultiplier != null ? source.PerkMultiplier : 1);
      c.Attacker.AilmentReversed = source ? !!(hooks.ailmentReversed && hooks.ailmentReversed(B, source)) : false;
      c.Attacker.InitialPerk = e.AttackerInitialPerk ?? null; c.Attacker.InitialPerkMultiplier = e.AttackerInitialPerkMultiplier ?? 1;
      c.Defender.PerkMultiplier = hooks.getPerkMultiplier ? hooks.getPerkMultiplier(B, target) : (target.Perk != null ? (target.PerkMultiplier ?? 1) : 1);
      c.Defender.AilmentMultiplier = hooks.getNegativePerkMultiplier ? hooks.getNegativePerkMultiplier(B, target) : (target.PerkMultiplier != null ? target.PerkMultiplier : 1);
      c.Defender.AilmentReversed = !!(hooks.ailmentReversed && hooks.ailmentReversed(B, target));
      c.Defender.InitialPerk = e.DefenderInitialPerk ?? null; c.Defender.InitialPerkMultiplier = e.DefenderInitialPerkMultiplier ?? 1;
      if (c.Attacker.AilmentReversed) c.Attacker.AilmentMultiplier = -c.Attacker.AilmentMultiplier;
      if (c.Defender.AilmentReversed) c.Defender.AilmentMultiplier = -c.Defender.AilmentMultiplier;
      processAttacker(c); processDefender(c);
      const d = calculate(c);
      damageMinion(target, d);
      if (target.Health.Total < 1 && c.Defender.Minion.Perk === 111 && !c.Killify) { target.Health.Add(3); dmRemove(c.Defender); }
      if (d >= 1) { target.HurtCountsThisTurn++; if (board.IsBattle) target.HurtCountsThisBattle++; if (source) source.DamageDealtThisBattle += d; }
      const inner = ev('DamageMinion', { Owner: target.Owner, Amount: d, Range: 0, TargetId: target.Id, SourceId: source ? source.Id : null, CriticalHit: c.CriticalHit,
        DamageType: e.DamageType, AttackType: 0, Absorb: !!e.Absorb, ResultHealth: target.Health.ShallowCopy(), ResultExhausted: c.Defender.Exhausted,
        ResultChangeAttackerPerk: source ? c.Attacker.LostPerk : null, ResultChangeDefenderPerk: c.Defender.LostPerk });
      c.ResultingEvents.push(wrap('Done', inner));
      return c.ResultingEvents;
    }
    /**
     * BoardExtensions.DoTradeDamage(board, defender, attacker, disableCrits, doHealthDamage, splashDamage?, ignoreAdjacents?, damageMultiplier?, fixedDamage?, attackType)
     * -> Try<DamageMinion> list (one hit, two with perk 4); a hit of 0 is left out. o: { splash, ignoreAdjacents, multiplier, fixed, attackType }
     */
    function doTradeDamage(targetId, sourceId, useHealth, o = {}) {
      const out = []; const src = board.findMinion(sourceId, true, true); const tgt = board.findMinion(targetId, true, true);
      if (!src) return out;
      const hits = (src.Perk === 4 ? 1 : 0) + 1;
      for (let i = 0; i < hits; i++) {
        let amount = useHealth ? src.Health.Total : src.Attack.Total;
        if (o.multiplier != null) throw Object.assign(new Error('Unported: DoTradeDamage damageMultiplier'), { unported: 'DoTradeDamage damageMultiplier' });
        if (o.fixed != null) amount = o.fixed;
        const inner = ev('DamageMinion', { Owner: src.Owner, Amount: amount, Range: 0, TargetId: targetId, SourceId: src.Id, DamageType: 0, AttackType: o.attackType || 0,
          SplashDamage: o.splash ?? null, AttackerInitialPerk: null, AttackerInitialPerkMultiplier: 1, DefenderInitialPerk: null, DefenderInitialPerkMultiplier: 1 });
        if (hooks.setupDamage) hooks.setupDamage(inner, B, src, tgt);
        if (o.ignoreAdjacents) inner.AdjacentDisabled = true;
        if (B.state.DisableCrits) inner.CriticalDisabled = true;
        if (inner.Amount > 0) out.push(wrap('Try', inner));
      }
      return out;
    }
    B.doTradeDamage = doTradeDamage;

    // ---- 0..169, in BoardResolver.get_AllSystems order
    sys('PhaseInitiateGroupSystem', (e) => e.cls === 'InitiatePhaseGroupEvent', (e) => { const g = B.phases[e.Group]; if (g && g.length) B.add(g[0]); });
    for (let i = 1; i <= 5; i++) stub(['', 'Collector<MinionJumpAttackStart>', 'Collector<PlayMinionResult>', 'Collector<ChargedMinionPartially>', 'Collector<RollShopResult>', 'Collector<ChangeFreeRolls>'][i]);
    S[1].accepts = (e) => e.cls === 'MinionJumpAttackStart'; S[3].accepts = (e) => e.cls === 'ChargedMinionPartially';
    sys('Collector<IDone>', (e) => e.cls === 'Done', () => {});
    sys('Collector<IFail>', (e) => e.cls === 'Fail', () => {});
    sys('SetBattleStateMutator.Cleanup', (e) => e.cls === 'PhaseHasCompletedCleanup', () => { board.State = 0; });
    sys('SetBattleStateMutator.StartBattle', (e) => e.cls === 'PhaseStartBattle', () => { board.State = 1; });
    sys('SetBattleStateMutator.Move', (e) => e.cls === 'PhaseMove', () => { board.State = 2; });
    sys('SetBattleStateMutator.Trade', (e) => e.cls === 'PhaseTrade', () => { board.State = 3; });
    stub('EndTurnEarlyMutator');
    // 13 TradeSystem
    sys('TradeSystem', (e) => isW(e, 'Do', 'MinionTrade'), (e) => {
      const t = e.Event; const a = board.findLiveMinion(t.attackerId), d = board.findLiveMinion(t.defenderId);
      if (!a || !d) return;
      B.add(doTradeDamage(t.defenderId, t.attackerId, hooks.attacksWithHealth ? hooks.attacksWithHealth(a) : false));
      B.add(doTradeDamage(t.attackerId, t.defenderId, hooks.attacksWithHealth ? hooks.attacksWithHealth(d) : false));
      B.add(wrap('Done', t));
    });
    // 14 MarkDeadSystem.Damage
    sys('MarkDeadSystem.Damage', (e) => isDone(e, 'DamageMinion'), (e) => {
      const d = e.Event; const m = board.findLiveMinion(d.TargetId);
      if (!m || m.Health.Total > 0) return;
      B.add(wrap('Try', ev('MarkMinionDead', { Owner: d.Owner, TargetId: m.Id, SourceId: d.SourceId, DamageType: d.DamageType, TriggerDisabled: false })));
    });
    stub('MarkDeadSystem.Spend');
    // 16 DamageAttemptMutator
    sys('DamageAttemptMutator', (e) => isW(e, 'Try', 'DamageMinion'), (e) => {
      const d = e.Event; const target = board.findLiveMinion(d.TargetId);
      if (!target) return;
      const source = d.SourceId ? board.findMinion(d.SourceId) : null;
      if (d.DamageType === 0) { board.Attacks = (board.Attacks || 0) + 1; if (source) { source.AttackCountsThisTurn++; if (board.IsBattle) { source.AttackCountsThisBattle++; if (d.AttackType === 1) source.JumpsThisBattle++; } } }
      const out = tryDamage(target, source, d, null);
      if (!d.AdjacentDisabled && hooks.tryAttackAdjacent) hooks.tryAttackAdjacent(B, source, target, out, d, tryDamage);
      B.add(out);
    });
    stub('ClearSpaceSystem');
    // 18 MoveMutator
    sys('MoveMutator', (e) => isW(e, 'Do', 'MoveMinion'), (e) => { board.move(e.Event.From, e.Event.To); B.add(wrap('Done', e.Event)); });
    // 19 MoveAttemptSystem.TryMove
    sys('MoveAttemptSystem', (e) => isW(e, 'Try', 'MoveMinion'), (e) => {
      const m = board.findMinion(e.Event.MinionId);
      if (!m || m.Destroyed) return;
      const front = m.Owner === 1 ? board.Width / 2 - 1 : board.Width / 2; const dir = m.Owner === 1 ? 1 : -1;
      const from = m.Point; if (from.x === front) return;
      let p = { x: from.x + dir, y: from.y }, last = null;
      for (let i = 0; i < 100000; i++) { if (board.isOccupied(p)) break; if (p.x === front + dir) break; last = { x: p.x, y: p.y }; p = { x: p.x + dir, y: p.y }; }
      if (last) B.add(wrap('Do', ev('MoveMinion', { Owner: m.Owner, MinionId: m.Id, From: { x: from.x, y: from.y }, To: last, Quick: false, Forced: false })));
    });
    // 20 CheckAuraSystem (greedy): aura bookkeeping, no events of its own
    sys('CheckAuraSystem', (e) => isDone(e, 'MoveMinion'), (batch) => { if (hooks.checkAura) hooks.checkAura(B, batch); }, 'all');
    stub('EscapeMutator'); stub('EscapeSpellMutator');
    sys('RemoveMinionMutator', (e) => isW(e, 'Try', 'RemoveMinion'), (e) => hooks.removeMinion && hooks.removeMinion(B, e));
    sys('SummonMinionMutator', (e) => isW(e, 'Do', 'SummonMinion'), (e) => hooks.summonMutator && hooks.summonMutator(B, e));
    sys('SummonMinionAttemptSystem', (e) => isW(e, 'Try', 'SummonMinion'), (e) => hooks.summonAttempt && hooks.summonAttempt(B, e));
    stub('SummonRelicMutator');
    // 27 DestroyMinionMutator
    sys('DestroyMinionMutator', (e) => isW(e, 'Try', 'DestroyMinion'), (e) => {
      const d = e.Event; const m = board.findMinion(d.TargetId, true, false);
      if (m) {
        m.Destroyed = true; m.DestroyedBy = d.SourceId; m.Location = 2;
        if (d.SourceId) { const s = board.findMinion(d.SourceId); if (s && s.Owner === 1 && m.Owner === 2) st.PetsDefeated = (st.PetsDefeated || 0) + 1; }
        board.MinionGraveyard.push(m);
        const i = board.cells.indexOf(m); if (i >= 0) board.cells[i] = null;
      }
      B.add(wrap('Done', d));
    });
    // 28 MarkMinionDeadSystem / 29 MarkMinionDeadMutator
    sys('MarkMinionDeadSystem', (e) => isW(e, 'Try', 'MarkMinionDead'), (e) => B.add(wrap('Do', e.Event)));
    sys('MarkMinionDeadMutator', (e) => isW(e, 'Do', 'MarkMinionDead'), (e) => {
      const d = e.Event; const m = board.findLiveMinion(d.TargetId);
      if (m) { if (m.Owner === 1) board.PlayerFaintsThisBattle++; else if (m.Owner === 2) board.OpponentFaintsThisBattle++; }
      const x = board.findMinion(d.TargetId, true, true); if (x) x.Dead = true;
      B.add(wrap('Done', d));
    });
    sys('MinionAbilityDestroySystem', (e) => isW(e, 'Try', 'MinionAbilityDestroy'), (e) => hooks.abilityDestroy && hooks.abilityDestroy(B, e));
    stub('TriggerBeforeRollSystem');
    sys('PlayedSpellOnMutator', (e) => isDone(e, 'PlayedSpellOn'), () => {});
    sys('ForceActivateAbilitySystem', (e) => e.cls === 'ForceActivateAbility', (e) => hooks.forceActivateAbility && hooks.forceActivateAbility(B, e));
    sys('ForceActivatePerkSystem', (e) => e.cls === 'ForceActivatePerk', (e) => hooks.forceActivatePerk && hooks.forceActivatePerk(B, e));
    // 35..100: mutators reached only through abilities; each is provided by the abilities module (hooks.mutators[name]).
    const MUT = ['RememberMinionMutator:Try:RememberMinion', 'RememberPerkMutator:Try:RememberPerk', 'UpgradeTierMutator:Try:UpgradeTier', 'AddMinionPowerMutator:Try:AddMinionPower',
      'AddMinionChargeMutator:Try:AddMinionCharge', 'StartTurnMutator:Try:StartTurn', 'GainLivesMutator:Try:GainLives', 'RollShopMutator:Do:RollShop', 'GainTrumpetsMutator:Try:GainTrumpets',
      'ChangeTrumpetsMutator:Do:ChangeTrumpets', 'GainRollsMutator:Try:GainRolls', 'PlaySpellMutator:Try:PlaySpell', 'ReorderMutator:Try:ReorderMinion', 'PushMutator:Try:PushMinion',
      'RollShopDoSystem:Try:RollShop', 'PermarizeMinionMutator:Try:PermanizeMinion', 'ShuffleMinionsMutator:Try:ShuffleMinions', 'SortMinionsMutator:Try:SortMinions',
      'StealMinionPerkMutator:Try:StealMinionPerk', 'StealSpellMutator:Try:StealSpell', 'StealMinionMutator:Try:StealMinion', 'GainGoldMutator:Try:GainGold', 'SpendGoldMutator:Try:SpendGold',
      'SpendAttackMutator:Try:SpendAttack', 'SpendHealthMutator:Try:SpendHealth', 'TransformMinionMutator:Try:TransformMinion', 'SetMinionStatsMutator:Try:SetMinionStats',
      'ShuffleStatsMutator:Try:ShuffleStats', 'SetMinionPriceMutator:Try:SetMinionPrice', 'SetSpellPriceMutator:Try:SetSpellPrice', 'GiveMinionSellValueMutator:Try:AddSellValue',
      'RefreshLimitMutator:Try:RefreshLimit', 'GiveMinionBuffMutator:Try:BuffMinion', 'GiveMinionPowerMutator:Try:GiveMinionPower', 'GiveMinionDebuffMutator:Try:DebuffMinion',
      'ChangeMinionManaMutator:Try:ChangeMinionMana', 'GiveShopMinionBuffMutator:Try:BuffShopMinion', 'GiveShopMinionPermanentBuffMutator:Try:BuffShopMinionPermanent',
      'GiveMinionAbilityMutator:Try:GiveMinionAbility', 'PerkMutator:Try:GiveMinionPerk', 'ChangeVictoryMutator:Try:ChangeVictoryMax', 'LoseMinionPerkMutator:Try:LoseMinionPerk',
      'GiveMinionExpMutator:Try:GiveMinionExp', 'CopyMinionStatsMutator:Try:CopyMinionStats', 'CopyMinionAbilityMutator:Try:CopyMinionAbility', 'PlayMinionMutator::PlayMinion',
      'StackMinionMutator:Try:StackMinion', 'AbilityDamageSystem:Try:MinionAbilityDamage', 'ReplaceMinionShopMutator:Try:ReplaceMinionShop', 'ReplaceSpellShopMutator:Try:ReplaceSpellShop',
      'DiscountMutator:Try:DiscountItems', 'OrderMinionMutator:Try:OrderMinion', 'AddSpellToShopMutator:Try:AddShopSpells', 'AddMinionToShopMutator:Try:AddShopMinions',
      'ForgetMutator:Try:Forget', 'SwapStatsMutator:Try:SwapStats', 'BalanceStatsMutator:Try:BalanceStats', 'ExchangeStatsMutator:Try:ExchangeStats', 'SwallowShopMutator:Try:SwallowShop',
      'FreezeShopMutator:Try:FreezeItem', 'ThrowMinionMutator:Try:MinionJumpAttack', 'TrumpetsMutator.Force:Try:ForceTrumpets', 'RemoveRelicMutator:Try:RemoveRelic',
      'OfferHardRelicsMutator:Try:OfferHardRelics', 'OfferChoicesMutator:Try:OfferChoice', 'ChooseMutator:Try:Choose'];
    for (const spec of MUT) {
      const [name, w, inner] = spec.split(':');
      const mode = name === 'RollShopDoSystem' ? 'all' : 'one';
      sys(name, w ? (e) => isW(e, w, inner) : (e) => e.cls === inner, (x) => { const f = hooks.mutators && hooks.mutators[name]; if (f) f(B, x); }, mode);
    }
    // 101 AbilityEffectResultSystem, 102 AbilityEffectWrapperSystem, 103 SpendMinionManaMutator, 104 ActivateAbilityDoSystem, 105 ActivateAbilityTrySystem.All
    sys('AbilityEffectResultSystem', (e) => e.cls === 'CastEffect', (e) => hooks.castEffect && hooks.castEffect(B, e));
    sys('AbilityEffectWrapperSystem', (e) => e.cls === 'CastEffectsSequentially' || e.cls === 'CastEffectsParallel', (e) => hooks.castEffectWrapper && hooks.castEffectWrapper(B, e));
    sys('SpendMinionManaMutator', (e) => isW(e, 'Try', 'SpendMinionMana'), (e) => hooks.mutators && hooks.mutators.SpendMinionManaMutator && hooks.mutators.SpendMinionManaMutator(B, e));
    sys('ActivateAbilityDoSystem', (e) => isW(e, 'Try', 'AbilityActivate'), (e) => hooks.activateAbilityDo && hooks.activateAbilityDo(B, e));
    sys('ActivateAbilityTrySystem.All', (e) => isW(e, 'Do', 'AbilityTriggered'), (e) => hooks.activateAbilityTry && hooks.activateAbilityTry(B, e));
    // 106 TriggerHurtSystem
    sys('TriggerHurtSystem', (e) => isDone(e, 'DamageMinion'), (e) => {
      const d = e.Event;
      B.add(ev('HurtEarly', { SourceId: d.TargetId, TargetId: d.SourceId, Amount: d.Amount }));
      B.add(ev('Hurt', { SourceId: d.TargetId, TargetId: d.SourceId, Amount: d.Amount }));
      if (d.ResultChangeDefenderPerk && d.ResultChangeDefenderPerk.LostPerk != null) B.add(ev('PerkLost', { SourceId: d.TargetId, Perk: d.ResultChangeDefenderPerk.LostPerk }));
      if (d.SourceId && d.ResultChangeAttackerPerk && d.ResultChangeAttackerPerk.LostPerk != null) B.add(ev('PerkLost', { SourceId: d.SourceId, Perk: d.ResultChangeAttackerPerk.LostPerk }));
    });
    stub('TriggerUpgradeTierSystem');
    sys('TriggerBeforeStartBattleSystem', (e) => e.cls === 'PhaseBeforeStartBattle', () => B.add(ev('BeforeStartBattle')));
    sys('TriggerStartBattleSystem', (e) => e.cls === 'PhaseStartBattle', () => B.add(ev('StartBattle')));
    stub('TriggerEndTurnSystem'); stub('TriggerRollSystem');
    // 112..123 ability-driven trigger systems
    const TRIG = ['TriggerGainedManaSystem:Done:ChangeMinionMana', 'TriggerGainedHealthSystem:Done:BuffMinion', 'TriggerPetActivatedSystem:Done:AbilityActivate',
      'TriggerStockMinionSystem:Done:AddShopMinions', 'TriggerSpendGoldSystem:Done:SpendGold', 'TriggerGiveExpSystem:Done:GiveMinionExp', 'TriggerLevelUp:Done:GiveMinionExp',
      'TriggerPlaySpellOnSystem:Done:PlayedSpellOn', 'TriggerPlaySpellSystem:Done:PlaySpell', 'TriggerPerkGainedSystem:Done:GiveMinionPerk', 'TriggerStealPerkSystem:Done:StealMinionPerk',
      'TriggerPerkLostSystem:Done:PerkLost'];
    for (const spec of TRIG) { const [name, w, inner] = spec.split(':'); sys(name, (e) => isW(e, w, inner), (x) => { const f = hooks.triggers && hooks.triggers[name]; if (f) f(B, x); }); }
    // 124 TriggerInfrontSystem: PhaseStartBattle, IDone<MoveMinion>, IDone<PushMinion>
    sys('TriggerInfrontSystem', (e) => e.cls === 'PhaseStartBattle' || isDone(e, 'MoveMinion') || isDone(e, 'PushMinion'), () => {
      let fronts = [board.get({ x: 4, y: 0 }), board.get({ x: 5, y: 0 })];
      if (st.StartingPlayer === 2) fronts = fronts.reverse();
      for (const m of fronts) if (m) B.add(ev('Infront', { SourceId: m.Id }));
    });
    // 125 TriggerBeforeAttackSystem
    sys('TriggerBeforeAttackSystem', (e) => isW(e, 'Try', 'MinionTrade'), (e) => {
      const t = e.Event; const a = board.findMinion(t.attackerId), d = board.findMinion(t.defenderId);
      B.add(ev('BeforeAttackEarly', { AttackerId: t.attackerId, DefenderId: t.defenderId }));
      B.add(ev('BeforeAttackEarly', { AttackerId: t.defenderId, DefenderId: t.attackerId }));
      if (a) B.add(ev('BeforeAttack', { AttackerId: t.attackerId, DefenderId: t.defenderId, IsFirstAttack: a.AttackCountsThisBattle === 0 }));
      if (d) B.add(ev('BeforeAttack', { AttackerId: t.defenderId, DefenderId: t.attackerId, IsFirstAttack: d.AttackCountsThisBattle === 0 }));
    });
    // 126 TriggerAttackSystem.Trade
    sys('TriggerAttackSystem.Trade', (e) => isDone(e, 'MinionTrade'), (e) => {
      const t = e.Event;
      B.add(ev('Attack', { AttackerId: t.attackerId, DefenderId: t.defenderId }));
      B.add(ev('Attack', { AttackerId: t.defenderId, DefenderId: t.attackerId }));
    });
    // 127 TriggerAttackSystem.JumpAttack: both pets get an Attack (type 1)
    sys('TriggerAttackSystem.JumpAttack', (e) => isDone(e, 'MinionJumpAttack'), (e) => {
      const j = e.Event;
      B.add(ev('Attack', { AttackerId: j.TargetToThrow, DefenderId: j.TargetToThrowAt, AttackType: 1 }));
      B.add(ev('Attack', { AttackerId: j.TargetToThrowAt, DefenderId: j.TargetToThrow, AttackType: 1 }));
    });
    // 128 TriggerKillSystem
    sys('TriggerKillSystem', (e) => isDone(e, 'MarkMinionDead'), (e) => {
      const d = e.Event; if (d.TriggerDisabled || !d.SourceId) return;
      B.add(ev('Kill', { SourceId: d.SourceId, TargetId: d.TargetId }));
    });
    const TRIG2 = ['TriggerTransformSystem:Done:TransformMinion', 'TriggerSummonSystem:Done:SummonMinion', 'TriggerSummonFailSystem:Fail:SummonMinion',
      'TriggerSummonRelicSystem:Done:SummonRelic', 'TriggerPushMinionSystem:Done:PushMinion', 'TriggerPushMinionFailSystem:Fail:PushMinion', 'TriggerJumpAttackSystem:Done:MinionJumpAttack'];
    for (const spec of TRIG2) { const [name, w, inner] = spec.split(':'); sys(name, (e) => isW(e, w, inner), (x) => { const f = hooks.triggers && hooks.triggers[name]; if (f) f(B, x); }); }
    stub('TriggerBeforeSellSystem'); stub('TriggerSellSystem');
    sys('TriggerChargedMinionSystem', (e) => isDone(e, 'ChargedMinion'), (x) => { const f = hooks.triggers && hooks.triggers.TriggerChargedMinionSystem; if (f) f(B, x); });
    // 139 TriggerDestroyEarlySystem / 140 TriggerDestroySystem
    sys('TriggerDestroyEarlySystem', (e) => isDone(e, 'DestroyMinion'), (e) => { const d = e.Event; if (d.TriggerDisabled) return; B.add(ev('DeathEarly', { SourceId: d.TargetId, TargetId: d.SourceId })); });
    sys('TriggerDestroySystem', (e) => isDone(e, 'DestroyMinion'), (e) => { const d = e.Event; if (d.TriggerDisabled) return; B.add(ev('Death', { SourceId: d.TargetId, TargetId: d.SourceId, Depth: 1 })); });
    sys('AbilityCleanupMutator', (e) => isDone(e, 'AbilityActivate'), (e) => hooks.abilityCleanup && hooks.abilityCleanup(B, e));
    // 142 TriggerBeforeDeathSystem
    sys('TriggerBeforeDeathSystem', (e) => isDone(e, 'MarkMinionDead'), (e) => {
      const d = e.Event; if (d.TriggerDisabled) return;
      const bd = ev('BeforeDeath', { SourceId: d.TargetId, TargetId: d.SourceId }); B.add(bd);
      const m = board.findMinion(d.TargetId);
      if (!m || m.Mana < 1) return;
      if (m.Perk !== 55 && hooks.blocksManaRelease && hooks.blocksManaRelease(m)) return;
      B.add(wrap('Try', ev('ReleaseMana', { Owner: d.Owner, TargetId: d.TargetId, TriggerEvent: bd })));
    });
    // 143 TriggerMinionsSystem.All (greedy): one TriggerMinions per trigger event, grouped by event type
    sys('TriggerMinionsSystem.All', (e) => TRIGGER_EVENTS.has(e.cls), (batch) => {
      const groups = new Map();
      for (const e of batch) { if (!groups.has(e.cls)) groups.set(e.cls, []); groups.get(e.cls).push(e); }
      for (const [type, list] of groups) for (const te of list) {
        const mins = board.findMinions(true, false);
        if (ITRIGGER_DEATH.has(te.cls)) mins.unshift(board.findMinion(te.SourceId));
        const ids = mins.filter(Boolean).map((m) => m.Id).concat(board.findRelics().map((m) => m.Id));
        B.add(ev('TriggerMinions', { TriggerType: type, MinionsToTrigger: ids.map((id) => ({ id, ev: te })), AlreadyTriggered: [], Depth: te.Depth + 1 }));
      }
    }, 'all');
    // 144 TriggerAbilitySystem.All (TypeSortedList, takes the first type bucket)
    sys('TriggerAbilitySystem.All', (e) => e.cls === 'TriggerMinions', (batch) => {
      if (!batch.length) return;
      const merged = ev('TriggerMinions', { TriggerType: batch[0].TriggerType, MinionsToTrigger: batch.flatMap((x) => x.MinionsToTrigger),
        AlreadyTriggered: batch.flatMap((x) => x.AlreadyTriggered || []), Depth: Math.min(...batch.map((x) => x.Depth)), Number: Math.min(...batch.map((x) => x.Number)) });
      // GetSortedTriggerMinions
      const sorted = [];
      for (const ent of merged.MinionsToTrigger) {
        if (merged.AlreadyTriggered.some((a) => idEq(a.id, ent.id) && a.ev === ent.ev)) continue;
        const m = board.findMinion(ent.id);
        if (!m) continue;
        if (m.Destroyed && !ITRIGGER_DEATH.has(ent.ev.cls) && ent.ev.cls !== 'Sell') continue;
        const tie = B.randomizer(m.Owner).nextUlong();
        sorted.push({ ev: ent.ev, minion: m, tie, seq: sorted.length });
      }
      const prio = (m) => m.Attack.Total + (m.Perk === 70 ? 1000 : 0) - (m.Perk === 117 ? 1000 : 0); // MinionModel.Priority: Churros +1000, Macaron -1000
      const srcOf = (e) => sourceOf(e); // ITriggerSource: the event's first id field
      const compareTo = (a, b) => {
        const sa = srcOf(a.ev), sb = srcOf(b.ev);
        if (sa !== undefined && sb !== undefined) {
          if (idEq(sa, a.minion.Id) && !idEq(sb, b.minion.Id)) return 1;
          if (!idEq(sa, a.minion.Id) && idEq(sb, b.minion.Id)) return -1;
        }
        const pa = hooks.priority ? hooks.priority(a.minion) : prio(a.minion), pb = hooks.priority ? hooks.priority(b.minion) : prio(b.minion);
        return pb < pa ? 1 : pa < pb ? -1 : 0;
      };
      sorted.sort((a, b) => { const c = compareTo(a, b); if (c !== 0) return -c; if (a.tie !== b.tie) return a.tie < b.tie ? -1 : 1; return a.seq - b.seq; });
      for (const s of sorted) {
        merged.AlreadyTriggered.push({ id: s.minion.Id, ev: s.ev });
        const res = hooks.tryTriggerMinion ? hooks.tryTriggerMinion(B, s.minion, s.ev, B.randomizer(s.minion.Owner)) : null;
        if (res && res.length >= 1) { B.add(res); B.add(merged); return; }
      }
    }, 'typed', new TypeSortedList((e) => e.TriggerType));
    sys('ReleaseManaSystem', (e) => isW(e, 'Try', 'ReleaseMana'), (e) => hooks.mutators && hooks.mutators.ReleaseManaSystem && hooks.mutators.ReleaseManaSystem(B, e));
    // 146 DestroySystem (greedy): Done<MarkMinionDead> -> Try<DestroyMinion>, depth = mark depth + 1
    sys('DestroySystem', (e) => isDone(e, 'MarkMinionDead'), (batch) => {
      for (const e of batch) { const d = e.Event; const w = wrap('Try', ev('DestroyMinion', { Owner: d.Owner, TargetId: d.TargetId, SourceId: d.SourceId, DamageType: d.DamageType, TriggerDisabled: d.TriggerDisabled })); w.Depth = e.Depth + 1; B.add(w); }
    }, 'all');
    sys('MarkDamageTakenMutator', (e) => isDone(e, 'DamageMinion'), (e) => { const m = board.findMinion(e.Event.TargetId); if (e.Event.Amount > 0 && m) m.DamageTaken = true; });
    // 148/149/150 TriggerEmptyFrontSystem
    function triggerEmptyFront(depth) {
      const front = board.findMinions(true, false).filter((m) => getFrontDistance(board, m) === 0);
      const out = [];
      if (!front.some((m) => m.Owner === 1)) out.push(ev('EmptyFront', { Owner: 1, Depth: depth }));
      if (!front.some((m) => m.Owner === 2)) out.push(ev('EmptyFront', { Owner: 2, Depth: depth }));
      if (st.StartingPlayer === 2) out.reverse();
      return out;
    }
    sys('TriggerEmptyFrontSystem.OnDestroy', (e) => isDone(e, 'DestroyMinion'), (batch) => B.add(triggerEmptyFront(Math.max(...batch.map((x) => x.Depth)) + 1)), 'all');
    sys('TriggerEmptyFrontSystem.OnRemove', (e) => isDone(e, 'RemoveMinion'), (batch) => B.add(triggerEmptyFront(Math.max(...batch.map((x) => x.Depth + 1)))), 'all');
    sys('TriggerEmptyFrontSystem.OnStartBattle', (e) => e.cls === 'PhaseStartBattle', (e) => B.add(triggerEmptyFront(e.Depth + 1)));
    stub('CountdownMinionMutator');
    sys('GainRewardMutator', (e) => isW(e, 'Try', 'GainReward'), () => {});
    stub('SellMinionMutator'); stub('EndTurnMutator'); stub('TriggerStartTurnSystem');
    sys('TriggerStartOfBattleEnded', (e) => e.cls === 'PhaseStartBattle', () => B.add(ev('StartBattleEnded')));
    stub('TriggerPlaySystem');
    sys('TrumpetsMutator.Destroy', (e) => isDone(e, 'DestroyMinion'), () => { if (hooks.summonTrumpetMinion) { hooks.summonTrumpetMinion(B, 1, 2); hooks.summonTrumpetMinion(B, 2, 2); } });
    sys('TrumpetsMutator.Remove', (e) => isDone(e, 'RemoveMinion'), () => { if (hooks.summonTrumpetMinion) { hooks.summonTrumpetMinion(B, 1, 2); hooks.summonTrumpetMinion(B, 2, 2); } });
    sys('TrumpetsMutator.Trade', (e) => e.cls === 'PhaseTrade', () => { if (hooks.trumpetsTrade) hooks.trumpetsTrade(B); });
    // 161 TradePrepareSystem
    sys('TradePrepareSystem', (e) => isW(e, 'Try', 'MinionTrade'), (e) => {
      const t = e.Event; const a = board.findMinion(t.attackerId), d = board.findMinion(t.defenderId);
      if (!a || (a.Point.x !== 4 && a.Point.x !== 5) || !d) return;
      if (d.Point.x === 4 || d.Point.x === 5) B.add(wrap('Do', t));
    });
    // 162 TradePhaseSystem
    sys('TradePhaseSystem', (e) => e.cls === 'PhaseTrade', (e) => {
      for (let x = 0; x < board.Width; x++) {
        const m = board.findLiveMinion({ x, y: e.Lane });
        if (!m || m.Owner === 2 || !m.IsAlive) continue;
        const o = board.findLiveMinion({ x: m.Point.x + 1, y: m.Point.y });
        if (!o || o.Owner === m.Owner) continue;
        // MinionExtensions.HasPriority(player, opponent, playerRandomizer, opponentRandomizer)
        let pri;
        if (o.Attack.Total < m.Attack.Total) pri = true;
        else if (m.Attack.Total < o.Attack.Total) pri = false;
        else { const a = R.Randomizer.positiveInteger(B.rand[1]), b = R.Randomizer.positiveInteger(B.rand[2]); pri = b < a; }
        const t = pri ? ev('MinionTrade', { Owner: 0, attackerId: m.Id, defenderId: o.Id }) : ev('MinionTrade', { Owner: 0, attackerId: o.Id, defenderId: m.Id });
        B.add(wrap('Try', t));
      }
    });
    sys('TriggerAllFaintSystem', (e) => isDone(e, 'DestroyMinion'), (batch) => {
      if (!board.IsBattle) return;
      const depth = Math.max(...batch.map((x) => x.Depth));
      const live = board.findLiveMinions();
      const pDied = batch.some((x) => x.Event.Owner === 1), oDied = batch.some((x) => x.Event.Owner === 2);
      if (oDied && live.filter((m) => m.Owner === 2).length < 1) B.add(ev('AllFaint', { Owner: 2, Depth: depth + 1 }));
      if (pDied && live.filter((m) => m.Owner === 1).length < 1) B.add(ev('AllFaint', { Owner: 1, Depth: depth + 1 }));
    }, 'all');
    // 164 MovePhaseSystem: the side holding priority moves first; each scans from its front backwards
    sys('MovePhaseSystem', (e) => e.cls === 'PhaseMove', (e) => {
      const lane = e.Lane;
      const player = () => { for (let x = board.Width - 1; x >= 0; x--) { const m = board.findLiveMinion({ x, y: lane }); if (m && m.Owner === 1) B.add(wrap('Try', ev('MoveMinion', { Owner: 1, MinionId: m.Id, From: { x: 0, y: 0 }, To: { x: 0, y: 0 }, Quick: false, Forced: false }))); } };
      const opp = () => { for (let x = 0; x < board.Width; x++) { const m = board.findLiveMinion({ x, y: lane }); if (m && m.Owner === 2) B.add(wrap('Try', ev('MoveMinion', { Owner: 2, MinionId: m.Id, From: { x: 0, y: 0 }, To: { x: 0, y: 0 }, Quick: false, Forced: false }))); } };
      if (st.StartingPlayer === 1) { player(); opp(); } else { opp(); player(); }
    });
    // 165 RollPriorityMutator: the starting player's stream draws first; the higher draw takes priority (ties redraw, 101 tries)
    sys('RollPriorityMutator', (e) => e.cls === 'PhaseHasCompletedCleanup', () => {
      for (let i = 0; i <= 100; i++) {
        let p, o;
        if (st.StartingPlayer === 1) { p = B.rand[1].next(2147483647); o = B.rand[2].next(2147483647); } else { o = B.rand[2].next(2147483647); p = B.rand[1].next(2147483647); }
        if (o < p) { st.CurrentPriority = 1; return; }
        if (p < o) { st.CurrentPriority = 2; return; }
      }
    });
    sys('CleanupBoardModelSystem', (e) => e.cls === 'PhaseHasCompletedCleanup', () => { board.MinionGraveyard.length = 0; board.MinionSold.length = 0; });
    sys('EventCollecterSystem', () => true, () => {});
    sys('FinalCleanupMutator', (e) => e.cls === 'PhaseFinalCleanup', () => { if (hooks.finalCleanup) hooks.finalCleanup(B); });
    // 169 PhaseManagerSystem
    sys('PhaseManagerSystem', (e) => !!e.phase, (e) => {
      if (board.IsBattle && B.isBattleResolved().resolved) return;
      const g = B.phases[e.Group]; const i = g.findIndex((x) => x.cls === e.cls);
      if (i !== -1 && i < g.length - 1) { const nx = g[i + 1]; nx.Depth = e.Depth; nx.Number = 0; B.add(nx); }
    });
    if (S.length !== 170) throw new Error('system table has ' + S.length + ' entries, expected 170');
    return S;
  }

  const api = { Battle, ev, wrap, isW, EXECUTION_ORDER, calculate, newCalc, sourceOf, targetOf };
  if (isNode) module.exports = api; else { root.SAPGame = root.SAPGame || {}; root.SAPGame.sim = api; }
})(typeof window !== 'undefined' ? window : globalThis);
