/*
 * Runs a site battle on the game-exact engine (js/game/sim.js + abilities.js) and turns the game's event log into the
 * step log that js/battle.js plays back (the same kinds and board snapshots the old site engine produced).
 *
 * Mapping (all from the game's own data, no hand tables):
 *  - site pet ids and perk/ailment ids are the game's MinionEnum / Perk enum names (data.enums);
 *  - team slot 0 is the front: the player stands at x = 4 - slot, the opponent at x = 5 + slot;
 *  - Settings / "This turn" values become the board counters the game keeps (rolls, gold spent, ...); Tier follows the
 *    turn (BoardConstants.DefaultShopUpgradeTierOnTurn = 3, 5, 7, 9, 11, read from the running game).
 */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = isNode ? require('./data.js') : root.SAPGame.data;
  const S = isNode ? require('./sim.js') : root.SAPGame.sim;
  const M = isNode ? require('./model.js') : root.SAPGame.model;
  const A = isNode ? require('./abilities.js') : root.SAPGame.abilities;

  const MINION = {}, MINION_NAME = {}, PERK = {}, PERK_NAME = {};
  for (const [k, v] of Object.entries(D.enums.minion)) { MINION[k] = +v; MINION_NAME[+v] = k; }
  for (const [k, v] of Object.entries(D.enums.perk)) { PERK[k] = +v; PERK_NAME[+v] = k; }
  const UPGRADE_TURNS = [3, 5, 7, 9, 11];
  const tierForTurn = (turn) => Math.min(6, 1 + UPGRADE_TURNS.filter((t) => t <= turn).length);
  const levelFromXp = (xp) => (xp >= 5 ? 3 : xp >= 2 ? 2 : 1);
  const key = (id) => (id ? M.idKey(id) : null);

  /** three BattleState seeds from the site's single seed (any int) */
  function seedsFrom(seed) {
    let a = seed | 0;
    const next = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return 1 + (((t ^ (t >>> 14)) >>> 0) % 1073741823); };
    return { seed: next(), playerSeed: next(), opponentSeed: next() };
  }

  /** a site pet ({id, atk, hp, xp, perk, mana, slot, ctx}) as the game's MinionModel input */
  // opts.packBack (tests only): the recording harness packs the player's n pets at x = n-1..0 instead of the front
  function petInput(p, owner, uid, opts = {}) {
    const e = MINION[p.id]; if (e == null) throw new Error('Unknown pet ' + p.id);
    const t = D.minions[e]; const xp = p.xp || 0; const level = levelFromXp(xp);
    const perk = p.perk != null && p.perk !== '' ? PERK[p.perk] : null;
    if (p.perk && perk == null) throw new Error('Unknown perk ' + p.perk);
    const slot = p.slot != null ? p.slot : 0;
    const abilities = t.abilities.map((a) => {
      const m = new M.MinionAbilityModel(a.e, level, a.native); m.Group = a.group;
      const lv = (D.abilities[a.e] || {})[level]; m.AlwaysIgnoreMinionLevel = !!(lv && lv.AlwaysIgnoreMinionLevel);
      return m;
    });
    return {
      Id: M.itemId(owner === 1 ? 'P' : 'M', uid), Owner: owner, Enum: e, x: opts.packBack != null && owner === 1 ? opts.packBack - 1 - slot : owner === 1 ? 4 - slot : 5 + slot, Level: level, Exp: xp, Mana: p.mana || 0,
      Relic: t.type === 1, SpellCountsThisTurn: +((p.ctx && p.ctx.foodEaten !== '' && p.ctx.foodEaten != null ? p.ctx.foodEaten : opts.foodEaten) || 0), Attack: p.atk, AttackTemp: 0, Health: p.hp, HealthTemp: 0, Perk: perk,
      PerkDurability: perk != null ? ((D.perks[perk] || {}).durability ?? null) : null, PerkMultiplier: null, Tribe: t.tribe, Abilities: abilities,
    };
  }

  /** the site value for one side: a pet's own "This turn" value, else the Settings one */
  function sideValue(team, settings, k) {
    for (const p of team) if (p && p.ctx && p.ctx[k] != null && p.ctx[k] !== '') return +p.ctx[k];
    return +(settings[k] || 0);
  }

  function boardFields(teams, settings) {
    const [L, R] = teams; const v = (t, k) => sideValue(t, settings, k);
    const turn = +(settings.turn || 1);
    return {
      Turn: turn, Tier: tierForTurn(turn), Victories: v(L, 'battles'),
      RollsThisTurn: v(L, 'rolls'), OpponentRolls: v(R, 'rolls'),
      GoldSpent: v(L, 'goldSpent'), OpponentGoldSpent: v(R, 'goldSpent'),
      TransformationsThisTurn: v(L, 'transforms'), OpponentTransformations: v(R, 'transforms'),
      MinionsSummonedThisTurn: v(L, 'summoned'), OpponentSummons: v(R, 'summoned'),
      MaxLevelMinionsSold: v(L, 'lvl3Sold'), OpponentMatchMinionsSoldFinalLevel: v(R, 'lvl3Sold'),
    };
  }

  /** board snapshot in the old engine's shape: t[side] front-first, tr = trumpets */
  function snapshot(B, ctxOf) {
    const b = B.board; const side = (owner) => {
      const xs = owner === 1 ? [4, 3, 2, 1, 0] : [5, 6, 7, 8, 9]; const out = [];
      for (const x of xs) {
        const m = b.get({ x, y: 0 }); if (!m || m.Destroyed) continue;
        const ab = m.Abilities[0]; const def = ab ? (D.abilities[ab.Enum] || {})[ab.Level] : null;
        const tr = def && def.TriggerLimit != null ? { left: Math.max(0, def.TriggerLimit - (ab.TriggerCount || 0)), max: def.TriggerLimit } : null;
        out.push({ u: key(m.Id), id: MINION_NAME[m.Enum], a: m.Attack.Total, h: m.Health.Total, l: m.Level, x: m.Exp, p: m.Perk != null ? PERK_NAME[m.Perk] : null, m: m.Mana, tr, c: ctxOf(m.Id) });
      }
      return out;
    };
    return { t: [side(1), side(2)], tr: [b.Trumpets || 0, b.OpponentTrumpets || 0] };
  }

  // the perk whose ability this is (PerkTemplate abilities), and an ability's own projectile (ProjectileModel.Projectile:
  // 0 Damage, 2 Health, 3 Attack, 4 HealthAndAttack, 9 GasYellow, 12 Absorb, 14 None, 15 ManaBurst, 16 Mouth)
  let PERK_OF_ABILITY = null;
  const perkOfAbility = (ab) => {
    if (!PERK_OF_ABILITY) { PERK_OF_ABILITY = {}; for (const [p, pk] of Object.entries(D.perks || {})) for (const a of (pk && pk.abilities) || []) PERK_OF_ABILITY[a] = PERK_NAME[+p]; }
    return PERK_OF_ABILITY[ab] || null;
  };
  const PROJ_OF_ABILITY = {};
  const projOfAbility = (ab, lv) => {
    const k = ab + ':' + lv; if (k in PROJ_OF_ABILITY) return PROJ_OF_ABILITY[k];
    let found = null; const walk = (o) => { if (found != null || !o || typeof o !== 'object') return; if (/ProjectileModel$/.test(o.$type || '') && typeof o.Projectile === 'number') { found = o.Projectile; return; } for (const v of Object.values(o)) walk(v); };
    walk(((D.abilities[ab] || {})[lv]) || null); return (PROJ_OF_ABILITY[k] = found);
  };
  // what the renderer needs from the activation an effect belongs to (set on Done<AbilityActivate>, cleared by a trade)
  let cur = null;
  const fromCur = (src, st) => { if (cur && cur.src === src) { if (cur.perk) st.perkSrc = cur.perk; if (cur.proj != null) st.proj = cur.proj; } return st; };

  /** one game log event -> zero or one site step (without its snapshot) */
  function step(e) {
    const w = e.cls, x = e.Event, c = x ? x.cls : null;
    if (w === 'Try' && c === 'MinionTrade') { cur = null; return { kind: 'attack', a: key(x.attackerId), b: key(x.defenderId) }; }
    if (w === 'Try' && c === 'MinionJumpAttack') { cur = null; return { kind: 'jump', src: key(x.TargetToThrow), tgt: key(x.TargetToThrowAt) }; }
    if (w === 'Done' && c === 'AbilityActivate') {
      // AbilityActivate.Type: 0 the pet's own ability, 1 a perk's, 2 an ailment's
      cur = { src: key(x.MinionId), perk: x.Type ? perkOfAbility(x.Ability) : null, proj: projOfAbility(x.Ability, x.Level) };
      return { kind: 'ability', src: cur.src, trig: 'Activated' };
    }
    if (w === 'Done' && c === 'DamageMinion') return x.Amount > 0 ? fromCur(key(x.SourceId), { kind: 'damage', src: key(x.SourceId), tgt: key(x.TargetId), n: x.Amount, dk: x.DamageType === 0 ? 'attack' : 'ability' }) : { kind: 'block', tgt: key(x.TargetId) };
    if (w === 'Done' && c === 'BuffMinion') return x.ResultAttackGained || x.ResultHealthGained ? fromCur(key(x.Source), { kind: 'buff', src: key(x.Source), tgt: key(x.TargetId), da: x.ResultAttackGained || 0, dh: x.ResultHealthGained || 0 }) : null;
    // BoardView.SetMinionStats: a stat set that is not Positive plays the Gas splash, and a health loss shows as an orange number
    if (w === 'Done' && c === 'SetMinionStats') return fromCur(key(x.Source), { kind: 'buff', set: true, pos: !!x.Positive, src: key(x.Source), tgt: key(x.Target), da: x.ResultAttackDelta || 0, dh: x.ResultHealthDelta || 0 });
    if (w === 'Done' && c === 'CopyMinionStats') return { kind: 'buff', src: key(x.CopyFrom), tgt: key(x.CopyTo), da: x.ResultAttackGained || 0, dh: x.ResultHealthGained || 0 };
    if (w === 'Done' && c === 'GiveMinionPerk') return { kind: 'perk', src: key(x.Source), tgt: key(x.TargetId), perk: PERK_NAME[x.Perk] };
    if (w === 'PerkLost') return { kind: 'perk', tgt: key(e.SourceId), lost: PERK_NAME[e.Perk] };
    // DestroyMinion's last field (the mark's damage type): 0 = killed by attack damage, anything else = abilities and destroy effects
    if (w === 'Done' && c === 'DestroyMinion') return { kind: 'faint', tgt: key(x.TargetId), dt: x.DamageType || 0 };
    if (w === 'Done' && c === 'SummonMinion') return { kind: 'summon', src: key(x.SourceId), tgt: key(x.Minion && x.Minion.Id) };
    if (w === 'Done' && c === 'TransformMinion') return { kind: 'transform', tgt: key(x.Target) };
    if (w === 'Done' && (c === 'MoveMinion' || c === 'PushMinion')) return { kind: 'move', tgt: key(x.MinionId || x.TargetId) };
    if (w === 'Done' && c === 'ChangeMinionMana') return { kind: 'mana', src: key(x.SourceId), tgt: key(x.TargetId), n: x.ResultAmount ?? x.Amount };
    if (w === 'Done' && c === 'GiveMinionExp') return { kind: 'xp', src: key(x.Source || x.SourceId), tgt: key(x.Target || x.TargetId), n: x.Amount, lvlup: !!x.ResultLevelUp };
    if (w === 'Done' && c === 'ChangeTrumpets') return { kind: 'trumpet', side: x.Owner === 2 ? 1 : 0, n: x.DeltaTrumpets };
    return null;
  }

  /**
   * run(teams, settings, seed) -> { result: 'win'|'lose'|'draw', log, outcome }
   * teams: the site's [[{id, atk, hp, xp, perk, mana, slot, ctx}], [...]], index 0 = the left (player) team
   */
  function run(teams, settings = {}, seed = 1, test = {}) {
    let uid = 0; const ctx = new Map(); const pets = [];
    // the opponent's ids first (M1..), then the player's (P..), like the recorded boards
    for (const [s, owner] of [[1, 2], [0, 1]]) for (const p of teams[s] || []) {
      if (!p) continue; const inp = petInput(p, owner, ++uid, { packBack: owner === 1 && test.packBack ? teams[0].filter(Boolean).length : null, foodEaten: settings.foodEaten }); pets.push(inp); if (p.ctx) ctx.set(key(inp.Id), p.ctx);
    }
    const log = []; cur = null;
    const ctxOf = (id) => ctx.get(key(id));
    let B = null;
    const push = (st) => {
      st.snap = snapshot(B, ctxOf);
      const prev = log[log.length - 1];
      if (st.kind === 'move' && prev && prev.kind === 'move') { prev.snap = st.snap; return; } // one "pets move" step per run of moves
      log.push(st);
    };
    const onLog = (e, battle) => { B = battle; const st = step(e); if (st) push(st); };
    const sd = test.seeds || seedsFrom(seed); // test.seeds / test.fields: the oracle check feeds the recorded seeds and board counters
    B = new S.Battle({ pets, seed: sd.seed, playerSeed: sd.playerSeed, opponentSeed: sd.opponentSeed, unique: uid, hooks: A.hooks, boardFields: Object.assign(boardFields(teams, settings), test.fields || {}), onLog });
    // a swallowed shop pet (White Whale, ...) is the pet's memory under the ability its Memory catalogue reads
    for (const m of B.board.cells.concat(B.board.Relics)) {
      const c = m && ctxOf(m.Id); if (!c || !c.swallowed || MINION[c.swallowed] == null) continue;
      for (const a of m.Abilities) { const ab = (D.abilities[a.Enum] || {})[a.Level]; const mem = ab && JSON.stringify(ab).match(/MinionCatalogueMemory"[^}]*?"Ability":(\d+)/);
        if (mem) { m.Brain = m.Brain || {}; m.Brain[+mem[1]] = [{ MinionEnum: MINION[c.swallowed], Attack: null, Health: null, Mana: null, Perk: null, Level: null, Experience: null, Power: null, Duration: null }]; } }
    }
    log.push({ kind: 'start', snap: snapshot(B, ctxOf) });
    const r = B.run();
    const result = r.outcome === 1 ? 'win' : r.outcome === 2 ? 'lose' : 'draw';
    log.push({ kind: 'end', result, snap: snapshot(B, ctxOf) });
    return { result, log, outcome: r.outcome };
  }

  const api = { run, seedsFrom, tierForTurn, MINION, PERK, MINION_NAME, PERK_NAME };
  if (isNode) module.exports = api; else { root.SAPGame = root.SAPGame || {}; root.SAPGame.adapter = api; }
})(typeof window !== 'undefined' ? window : globalThis);
