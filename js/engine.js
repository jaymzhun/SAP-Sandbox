/* Super Auto Pets sandbox — battle engine core.
 * Deterministic for a given seed. Produces a step log with board snapshots for playback.
 */
(function (root) {
  'use strict';

  const MAX_TEAM = 5;
  const STAT_CAP = 50;
  // Pets whose ability text says their stats can go past 50 ("can go up to 100!")
  const CAP_OVERRIDES = { Behemoth: { atk: 100, hp: 100 }, GiantTortoise: { hp: 100 } };
  const capOf = (id, stat) => (id === 'CuckooBaby' ? 1 : (CAP_OVERRIDES[id] && CAP_OVERRIDES[id][stat]) || STAT_CAP);

  // ------------------------------------------------------------------ RNG
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function levelFromXp(xp) { return xp >= 5 ? 3 : xp >= 2 ? 2 : 1; }

  // ------------------------------------------------------------------ perks
  // Battle behaviour of held food perks and ailments. Keys are game ids.
  const AILMENTS = new Set(['Weak', 'Scared', 'Toasty', 'Frozen', 'Ink', 'Burn', 'Deaf', 'Drowsy', 'Tasty',
    'Silly', 'Web', 'Confused', 'Curse', 'Bloated', 'Acid', 'Cowardly']);
  // Uses for perks that wear out (blocks/attacks); "once" perks with a trigger are removed after firing.
  const PERK_USES = {
    Melon: 1, WaterMelon: 1, Coconut: 1, Walnut: 1, Eucalyptus: 1, Guava: 1, HoneydewMelon: 1, Ambrosia: 1,
    Lemon: 2, WhiteOkra: 2, Potato: 2, MapleSyrup: 3, Steak: 1, Cheese: 1, Salt: 1, PeanutButter: 1,
    Pineapple: 3, Kiwano: 1, BrusselsSprout: 1, BokChoy: 1, Pepper: 1,
    Frozen: 1, Acid: 2, Drowsy: 1, Toasty: 1, Burn: 1, Bloated: 1, Cowardly: 1, Confused: 1,
  };
  // Perks that work passively inside the damage / attack / targeting code.
  const PASSIVE_PERKS = ['Melon', 'WaterMelon', 'Coconut', 'Walnut', 'Eucalyptus', 'Guava', 'HoneydewMelon', 'Ambrosia', 'Lemon',
    'WhiteOkra', 'Potato', 'MapleSyrup', 'Steak', 'Cheese', 'Salt', 'PeanutButter', 'Peanut', 'Pineapple', 'Kiwano', 'Garlic', 'Lime',
    'MeatBone', 'FortuneCookie', 'Chili', 'MildChili', 'Skewer', 'BokChoy', 'Pepper', 'BrusselsSprout', 'BlueBerries', 'Doughnut',
    'Churros', 'Macaron'];
  // Perks with no effect inside a battle (end turn / start of turn / selling).
  const SHOP_PERKS = ['Croissant', 'Cucumber', 'Carrot', 'Bread', 'Grapes', 'SardinianCurrant', 'Sausage', 'RiceBall', 'BirthdayCake', 'MagicBeans'];
  // Panther can't strengthen these.
  const NO_PANTHER = new Set(['Strawberry', 'Pepper', 'Peanut', 'PeanutButter', 'Coconut']);
  const randPet = (B, filt) => { const pool = Object.keys(B.D.pets).filter(k => B.D.pets[k].r && filt(B.D.pets[k], k)); return pool.length ? pool[B.rand(pool.length)] : null; };
  const summonHere = (B, p, ev, id, a, h, extra = {}) => {
    const at = ev && ev.slot != null ? ev.slot : Math.max(0, B.idx(p));
    return B.summon(p.side, at, id, Object.assign({ atk: a, hp: h, src: p }, extra));
  };
  /**
   * Triggered perks. t = when it fires; once = removed after firing; rep = Panther repeats the effect
   * (snipes, summons, stat buffs, trumpets). Numeric effects use c.m directly instead.
   */
  const PERKS = {
    // ---- before battle (before Start of battle abilities)
    LovePotion: { t: 'beforeBattle', once: true, rep: true, fn: (B, p) => B.summon(p.side, B.idx(p) + 1, p.id, { atk: 5, hp: 5, lvl: p.lvl, src: p }) },
    Cherries: { t: 'beforeBattle', once: true, rep: true, fn: (B, p) => B.gainTrumpets(p.side, 2, p) },
    Pie: { t: 'beforeBattle', rep: true, fn: (B, p) => B.buff(p, 4, 3, p) },
    Pancakes: { t: 'beforeBattle', rep: true, fn: (B, p) => { for (const f of B.friendsOf(p)) B.buff(f, 2, 2, p); } },
    HealthPotion: { t: 'beforeBattle', rep: true, fn: (B, p) => { const f = B.team(p.side)[0]; if (f) B.buff(f, 0, 2, p); } },
    EggPlant: { t: 'beforeBattle', rep: true, fn: (B, p) => { const e = B.enemiesOf(p); const o = e[Math.min(B.idx(p), e.length - 1)]; if (o) B.push(o, 1, p); } },
    GingerbreadMan: { t: 'beforeBattle', rep: true, fn: (B, p) => B.gainXp(p, 1, p) },
    Radish: {
      t: 'beforeBattle', fn: (B, p) => {
        const pool = Object.keys(B.D.foods).filter(k => B.D.foods[k].t === B.tier(p) && USEFUL_PERKS.has(k) && k !== 'Radish');
        if (pool.length) B.givePerk(p, pool[B.rand(pool.length)], p);
      },
    },
    // ---- start of battle
    Unagi: { t: 'sob', rep: true, fn: (B, p) => { const e = B.pick(p, B.enemiesOf(p), 1, 'enemy')[0]; if (e) B.damage(p, e, 2, 'perk'); } },
    // ---- before attack (holder is the front pet about to attack)
    Egg: { t: 'beforeAttack', once: true, rep: true, fn: (B, p, c) => { const e = (c.ev && c.ev.target && B.alive(c.ev.target) ? c.ev.target : B.enemiesOf(p)[0]); if (e) B.damage(p, e, 2, 'perk'); } },
    GoldenEgg: { t: 'beforeAttack', once: true, rep: true, fn: (B, p, c) => { const e = (c.ev && c.ev.target && B.alive(c.ev.target) ? c.ev.target : B.enemiesOf(p)[0]); if (e) B.damage(p, e, 6, 'perk'); } },
    Squash: { t: 'beforeAttack', once: true, rep: true, fn: (B, p, c) => { const e = (c.ev && c.ev.target && B.alive(c.ev.target) ? c.ev.target : B.enemiesOf(p)[0]); if (e) B.removeHealth(e, 6, p); } },
    GeecheeRedPea: { t: 'beforeAttack', once: true, rep: true, fn: (B, p, c) => { const e = (c.ev && c.ev.target && B.alive(c.ev.target) ? c.ev.target : B.enemiesOf(p)[0]); if (e) B.removeAttack(e, 5, p); } },
    Tomato: { t: 'beforeAttack', once: true, rep: true, fn: (B, p) => { const e = B.enemiesOf(p).slice(-1)[0]; if (e) B.damage(p, e, 10, 'perk'); } },
    Fig: { t: 'beforeAttack', once: true, rep: true, fn: (B, p) => { const e = B.enemiesOf(p).sort((a, b) => a.hp - b.hp)[0]; if (e) B.damage(p, e, 4, 'perk'); } },
    CashewNut: { t: 'beforeAttack', once: true, rep: true, fn: (B, p) => { const e = B.enemiesOf(p)[1]; if (e) B.damage(p, e, 2, 'perk'); } },
    Durian: { t: 'beforeAttack', once: true, rep: true, fn: (B, p) => { const e = B.enemiesOf(p).sort((a, b) => b.hp - a.hp)[0]; if (e) B.removeHealth(e, Math.floor(e.hp * 0.33), p); } },
    Baguette: { t: 'beforeAttack', once: true, rep: true, fn: (B, p) => { const e = B.enemiesOf(p).find(x => x.perk && !B.isAilment(x.perk.id)); if (e) B.losePerk(e, p); } },
    Caramel: {
      t: 'beforeAttack', once: true, rep: true, fn: (B, p) => {
        const others = B.friendsOf(p).filter(x => B.hasPerk(x, 'Caramel'));
        const e = B.enemiesOf(p).sort((a, b) => b.hp - a.hp)[0];
        if (e) B.damage(p, e, 3 * (1 + others.length), 'perk');
        for (const o of others) B.losePerk(o, p, 'used');
      },
    },
    Onion: { t: 'beforeAttack', once: true, fn: (B, p) => B.move(p, 99, p) },
    OysterMushroom: { t: 'beforeAttack', once: true, fn: (B, p, c) => B.setStats(p, Math.max(9 * c.m, p.atk), Math.max(9 * c.m, p.hp), p) },
    Rambutan: { t: 'beforeAttack', rep: true, fn: (B, p) => B.gainMana(p, 3, p) },
    Nachos: { t: 'beforeAttack', rep: true, fn: (B, p) => { const k = Math.min(3, p.hp - 1); if (k > 0) { p.hp -= k; B.buff(p, k, 0, p); B.rec('buff', { tgt: p.uid, da: 0, dh: -k }); } } },
    ChocolateCake: { t: 'beforeAttack', once: true, fn: (B, p, c) => { B.gainXp(p, 3 * c.m, p); p.hp = 0; B.rec('remove', { tgt: p.uid, dh: 0 }); } },
    CocoaBean: { t: 'beforeAttack', once: true, fn: (B, p) => { const k = randPet(B, d => /Summon/.test(d.ab[0] || '')); if (k) B.transform(p, k, { src: p }); } },
    GrosMichelBanana: { t: 'beforeAttack', once: true, fn: (B, p) => B.transform(p, 'Ant', { src: p }) },
    Seaweed: { t: 'beforeAttack', once: true, fn: (B, p) => B.transform(p, 'BabySeaUrchin', { src: p }) },
    // ---- faint (holder is gone; summons appear in its place)
    Honey: { t: 'faint', rep: true, fn: (B, p, c) => summonHere(B, p, c.ev, 'Bee', 1, 1) },
    Mushroom: { t: 'faint', rep: true, fn: (B, p, c) => summonHere(B, p, c.ev, p.id, 1, 1, { lvl: p.lvl }) },
    Banana: { t: 'faint', rep: true, fn: (B, p, c) => summonHere(B, p, c.ev, 'Monkey', 4, 4) },
    CodRoe: { t: 'faint', rep: true, fn: (B, p, c) => summonHere(B, p, c.ev, 'Fish', 2, 3) },
    EasterEgg: { t: 'faint', rep: true, fn: (B, p, c) => summonHere(B, p, c.ev, 'WhiteKillerRabbit', 3, 3) },
    YggdrasilFruit: { t: 'faint', rep: true, fn: (B, p, c) => { summonHere(B, p, c.ev, 'ThorGoat1', 5, 5); summonHere(B, p, c.ev, 'ThorGoat2', 5, 5); } },
    Popcorn: { t: 'faint', rep: true, fn: (B, p, c) => { const k = randPet(B, d => d.t === B.tier(p)); if (k) summonHere(B, p, c.ev, k, B.D.pets[k].a, B.D.pets[k].h); } },
    DeadBread: { t: 'faint', rep: true, fn: (B, p, c) => { const k = randPet(B, d => d.t === 1 && /Faint/.test(d.tr)); if (k) summonHere(B, p, c.ev, k, B.D.pets[k].a, B.D.pets[k].h); } },
    Strawberry: { t: 'faint', fn: (B, p) => { const f = B.team(p.side).slice(-1)[0]; if (f) B.buff(f, 1, 1, p); } },
    // ---- hurt / knock out / other
    PitaBread: { t: 'hurt', once: true, fn: (B, p, c) => { if (B.alive(p)) B.buff(p, 0, 15 * c.m, p); } },
    SudduthTomato: { t: 'hurt', once: true, rep: true, fn: (B, p) => { if (B.alive(p)) B.buff(p, 0, 1, p); } },
    Cauliflower: { t: 'knockout', once: true, rep: true, fn: (B, p) => { if (B.alive(p)) B.buff(p, 1, 1, p); } },
    WhiteTruffle: { t: 'friendFaints', once: true, fn: (B, p, c) => { B.buff(p, 4 * c.m, 0, p); const e = B.enemiesOf(p).sort((a, b) => b.atk - a.atk)[0]; if (e) B.jumpAttack(p, e); } },
    FairyDust: { t: 'emptyFront', once: true, fn: (B, p, c) => { B.move(p, 0, p); B.gainMana(p, 2 * c.m, p); } },
    Blackberry: { t: 'gain', rep: true, fn: (B, p) => B.buff(p, 1, 2, p) },
  };
  // perks that do something in battle (used when abilities hand out random "useful" perks)
  const USEFUL_PERKS = new Set(PASSIVE_PERKS.concat(Object.keys(PERKS)).filter(k => !['BlueBerries', 'Doughnut', 'Churros', 'Macaron', 'Strawberry', 'Blackberry'].includes(k)));
  const PERK_TRIGGER_LABEL = { beforeBattle: 'Before battle', sob: 'Start of battle', beforeAttack: 'Before attack', faint: 'Faint', hurt: 'Hurt',
    knockout: 'Knock out', friendFaints: 'Friend faints', emptyFront: 'Empty front space', gain: 'When gained' };
  const AILMENTS_LIST = ['Weak', 'Scared', 'Toasty', 'Frozen', 'Ink', 'Burn', 'Deaf', 'Drowsy', 'Tasty', 'Silly', 'Web', 'Confused', 'Curse', 'Bloated', 'Acid', 'Cowardly'];
  const PERK_SUPPORTED = new Set(PASSIVE_PERKS.concat(Object.keys(PERKS), AILMENTS_LIST));
  let UID = 1;

  // ------------------------------------------------------------------ Battle
  class Battle {
    /**
     * @param {object} data  window.SAP_DATA
     * @param {object} abilities compiled abilities: abilities[id] = {trigger, levels:[fn|null x3], limit}
     * @param {Array} teams  [[{id,atk,hp,xp,perk}], [...]]  index 0 = front
     * @param {object} opts {seed, turn, rolls}
     */
    constructor(data, abilities, teams, opts = {}) {
      this.D = data; this.A = abilities;
      this.rng = mulberry32(opts.seed == null ? (Math.random() * 1e9) | 0 : opts.seed);
      this.opts = Object.assign({ turn: 10, rolls: 0, battles: 5, lives: 5, foodEaten: 0, transforms: 0, goldSpent: 0, lvl3Sold: 0 }, opts);
      this.t = [[], []];
      this.queue = [];
      this.log = [];
      this.trumpets = [0, 0];
      this.retriever = [false, false];
      this.phase = 'init';
      this.steps = 0;
      this.attackCount = 0;
      this.anyAttacked = false;
      for (let s = 0; s < 2; s++) {
        for (const p of teams[s]) {
          if (!p || !this.D.pets[p.id]) continue;
          const pet = this.makePet(p.id, s, p);
          pet.slot0 = p.slot != null ? p.slot : this.t[s].length; // slot it was put in (teams can have gaps)
          this.t[s].push(pet);
        }
      }
      // empty spaces left in the lineup are kept until the battle starts (Emu can use an empty front space)
      this.gaps = this.t.some(t => t.some((p, i) => p.slot0 !== i));
    }

    // ---------------- pet helpers
    makePet(id, side, o = {}) {
      const def = this.D.pets[id] || { a: 1, h: 1, t: 1, n: id };
      const xp = o.xp != null ? o.xp : (o.lvl ? [0, 0, 2, 5][o.lvl] : 0);
      const p = {
        uid: UID++, id, side,
        atk: Math.min(capOf(id, 'atk'), Math.max(0, o.atk != null ? o.atk : def.a)),
        hp: Math.min(capOf(id, 'hp'), Math.max(1, o.hp != null ? o.hp : def.h)),
        xp, lvl: levelFromXp(xp),
        perk: null, mana: o.mana || 0,
        onBoard: true, uses: {}, flags: {}, hurtCount: 0, dealtDamage: false, counter: 0,
      };
      if (o.perk) this.setPerkRaw(p, o.perk);
      return p;
    }
    name(p) { return (this.D.pets[p.id] || {}).n || p.id; }
    tier(p) { return (this.D.pets[p.id] || {}).t || 1; }
    alive(p) { return p && p.onBoard && p.hp > 0; }
    team(s) { const sk = this.skip; return this.t[s].filter(p => this.alive(p) && !(sk && p !== sk.keep && sk.pred(p))); }
    /** run fn while pets that already have perk `id` are skipped by targeting (perk givers pick the next pet instead) */
    withPerkSkip(id, self, fn) {
      const prev = this.skip; this.skip = { pred: p => !!(p.perk && p.perk.id === id), keep: self };
      try { return fn(); } finally { this.skip = prev; }
    }
    enemiesOf(p) { return this.team(1 - p.side); }
    friendsOf(p) { return this.team(p.side).filter(x => x !== p); }
    idx(p) { return this.t[p.side].indexOf(p); }
    rand(n) { return Math.floor(this.rng() * n); }
    shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = this.rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
    perkId(p) { return p.perk ? p.perk.id : null; }
    /** activation limit for p's ability at its current level (0 = unlimited) */
    limitOf(p) { const ab = this.A[p.id]; if (!ab || !ab.limit) return 0; return Array.isArray(ab.limit) ? ab.limit[p.lvl - 1] || 0 : ab.limit; }
    /** what the triggers-left badge shows: { left, max } for limited abilities, { cnt, need } for counters */
    triggerInfo(p) {
      const ab = this.A[p.id]; if (!ab || !ab.levels[p.lvl - 1]) return null;
      const lim = this.limitOf(p);
      if (lim) return { left: Math.max(0, lim - (p.uses.ab || 0)), max: lim };
      if (ab.trigger && ab.trigger.startsWith('Count:')) { const need = +ab.trigger.split(':')[2]; return { cnt: p.counter % need, need }; }
      return null;
    }
    hasPerk(p, id) { return !!p.perk && p.perk.id === id; }
    isAilment(id) { return AILMENTS.has(id); }

    /** random picks honouring Silly (random any), Blueberry (enemy prio) and Donut (friend prio) */
    pick(src, pool, n, side) {
      if (src && this.hasPerk(src, 'Silly')) {
        pool = this.t[0].concat(this.t[1]).filter(x => this.alive(x) && x !== src);
      }
      let pri = [], rest = [];
      for (const x of this.shuffle(pool)) {
        const prio = (side === 'enemy' && this.hasPerk(x, 'BlueBerries')) || (side === 'friend' && this.hasPerk(x, 'Doughnut'));
        (prio ? pri : rest).push(x);
      }
      return pri.concat(rest).slice(0, n);
    }

    // ---------------- logging
    snap() {
      const s = p => ({ u: p.uid, id: p.id, a: p.atk, h: p.hp, l: p.lvl, x: p.xp, p: p.perk ? p.perk.id : null, m: p.mana, tr: this.triggerInfo(p), s: this.gaps && p.slot0 != null ? p.slot0 : undefined });
      const vis = p => p.onBoard && !p.swallowedBy;
      return { t: [this.t[0].filter(vis).map(s), this.t[1].filter(vis).map(s)], tr: this.trumpets.slice() };
    }
    rec(kind, data = {}) {
      data.kind = kind; data.snap = this.snap();
      this.log.push(data);
      if (this.log.length > 4000) throw new Error('log overflow');
    }

    // ---------------- stats
    buff(p, da, dh, src, opts = {}) {
      if (!p || !p.onBoard) return;
      if (p.hp <= 0 && !opts.allowDead) return;
      const a0 = p.atk, h0 = p.hp;
      // never cut stats that are already above the cap (e.g. after transforming out of a Behemoth)
      const add = (v, d, cap) => (d >= 0 ? Math.max(Math.min(v, cap), Math.min(cap, v + d)) : v + d);
      p.atk = Math.max(opts.minAtk || 0, add(p.atk, da, capOf(p.id, 'atk')));
      p.hp = add(p.hp, dh, capOf(p.id, 'hp'));
      // logged even when capped (a 50/50 pet shows +0/+0); ra / rh = which stats it tried to raise
      if (p.atk !== a0 || p.hp !== h0 || da > 0 || dh > 0) this.rec('buff', { tgt: p.uid, src: src && src.uid, da: p.atk - a0, dh: p.hp - h0, ra: da !== 0, rh: dh !== 0 });
    }
    setStats(p, a, h, src) {
      const a0 = p.atk, h0 = p.hp;
      p.atk = Math.max(0, Math.min(capOf(p.id, 'atk'), Math.round(a)));
      p.hp = Math.max(1, Math.min(capOf(p.id, 'hp'), Math.round(h)));
      this.rec('buff', { tgt: p.uid, src: src && src.uid, da: p.atk - a0, dh: p.hp - h0 });
    }
    removeHealth(p, amt, src, opts = {}) {
      if (!this.alive(p) || amt <= 0) return 0;
      let a = Math.round(amt);
      if (opts.noKill) a = Math.min(a, p.hp - 1);
      if (a <= 0) return 0;
      p.hp -= a;
      if (p.hp <= 0) p.killer = src;
      this.rec('remove', { tgt: p.uid, src: src && src.uid, dh: -a });
      return a;
    }
    removeAttack(p, amt, src, min = 0) {
      if (!this.alive(p)) return;
      const a0 = p.atk; p.atk = Math.max(min, p.atk - Math.round(amt));
      if (p.atk !== a0) this.rec('buff', { tgt: p.uid, src: src && src.uid, da: p.atk - a0, dh: 0 });
    }
    gainXp(p, n, src) {
      if (!this.alive(p) || n <= 0) return;
      const before = p.lvl;
      const xp0 = p.xp;
      p.xp = Math.min(5, p.xp + n);
      const gained = p.xp - xp0;
      if (gained <= 0) return;
      p.lvl = levelFromXp(p.xp);
      p.atk = Math.max(p.atk, Math.min(capOf(p.id, 'atk'), p.atk + gained)); p.hp = Math.max(p.hp, Math.min(capOf(p.id, 'hp'), p.hp + gained));
      this.rec('xp', { tgt: p.uid, src: src && src.uid, n: gained, lvlup: p.lvl > before });
      this.emit('GainedXp', { pet: p, n: gained });
      if (p.lvl > before) this.emit('LevelUp', { pet: p });
    }
    gainMana(p, n, src) {
      if (!this.alive(p) || n <= 0) return;
      p.mana += n;
      this.rec('mana', { tgt: p.uid, src: src && src.uid, n });
      this.emit('GainsMana', { pet: p, n });
    }
    gainTrumpets(side, n, src) {
      if (n <= 0 || this.retriever[side]) return;
      this.trumpets[side] = Math.min(50, this.trumpets[side] + n);
      this.rec('trumpet', { side, n, src: src && src.uid });
    }
    spendTrumpets(side, n) {
      const s = Math.min(n, this.trumpets[side]);
      this.trumpets[side] -= s;
      if (s) this.rec('trumpet', { side, n: -s });
      return s;
    }

    // ---------------- perks
    setPerkRaw(p, id) { p.perk = id ? { id, uses: PERK_USES[id] || 0 } : null; }
    givePerk(p, id, src, opts = {}) {
      if (!this.alive(p) && !opts.allowDead) return false;
      if (!id) return false;
      const ail = this.isAilment(id);
      const old = p.perk ? p.perk.id : null;
      if (ail) {
        // blocked by Ambrosia / White Okra
        if (old === 'Ambrosia' || old === 'WhiteOkra') { this.losePerk(p, src, 'blocked'); return false; }
        if (this.hasPerk(p, 'Strawberry') && this.sparrowLevel(p.side)) { this.losePerk(p, src, 'blocked'); return false; }
      } else if (old === 'Bloated') { this.usePerk(p); return false; }
      if (old) this.losePerk(p, src, 'replaced', true);
      this.setPerkRaw(p, id);
      this.rec('perk', { tgt: p.uid, src: src && src.uid, perk: id });
      if (PERKS[id] && PERKS[id].t === 'gain') this.firePerk(p, 'gain');
      this.emit(ail ? 'GainAilment' : 'GainPerk', { pet: p, perk: id, src });
      return true;
    }
    losePerk(p, src, why, silent) {
      if (!p.perk) return null;
      const id = p.perk.id; p.perk = null;
      if (!silent) this.rec('perk', { tgt: p.uid, src: src && src.uid, perk: null, lost: id });
      if (!this.isAilment(id)) this.emit('LosePerk', { pet: p, perk: id, src });
      return id;
    }
    usePerk(p) {
      if (!p.perk) return;
      p.perk.uses -= 1;
      if (p.perk.uses <= 0) this.losePerk(p, null, 'used');
    }

    // ---------------- damage pipeline
    /** how strong p's current perk/ailment is (double-effect perks, Panther, enemy Manticore) */
    perkMult(p) {
      if (!p || !p.perk) return 1;
      let m = p.perk.mult || 1;
      if (this.isAilment(p.perk.id)) {
        let worst = 1;
        for (const e of this.team(1 - p.side)) if (e.id === 'Manticore' && !this.hasPerk(e, 'Deaf')) worst = Math.max(worst, e.lvl + 1);
        m *= worst;
      } else if (p.id === 'Panther' && !NO_PANTHER.has(p.perk.id) && !this.hasPerk(p, 'Deaf')) m *= p.lvl + 1;
      return m;
    }
    passiveOn(p) { return p && this.alive(p) && !this.hasPerk(p, 'Deaf'); }
    /** passive damage reduction from the defender's own ability */
    passiveReduce(t, kind) {
      if (!this.passiveOn(t)) return 0;
      switch (t.id) {
        case 'Nurikabe': return 4 * t.lvl;
        case 'FanMussel': return 1 * t.lvl;
        case 'FairyArmadilloBall': return 2 * t.lvl;
        case 'GhostKitten': return kind === 'ability' ? 3 * t.lvl : 0;
      }
      return 0;
    }
    sparrowLevel(side) {
      let l = 0; for (const p of this.team(side)) if (p.id === 'Sparrow' && this.passiveOn(p)) l = Math.max(l, p.lvl);
      return l;
    }
    damage(src, tgt, amount, kind = 'ability', opts = {}) {
      if (!tgt || !tgt.onBoard || tgt.hp <= 0) return 0;
      let d = Math.max(0, amount);
      if (kind === 'ability' && src && !opts.raw) {
        const sm = this.perkMult(src);
        if (this.hasPerk(src, 'Pineapple')) { d += 2 * sm; this.usePerk(src); }
        else if (this.hasPerk(src, 'Kiwano')) { d += 8 * sm; this.usePerk(src); }
        // Albatross: adjacent tier 4 or lower friends deal extra ability damage
        if (this.tier(src) <= 4) {
          const t = this.t[src.side]; const i = t.indexOf(src);
          for (const a of [t[i - 1], t[i + 1]]) if (a && a.id === 'Albatross' && this.passiveOn(a)) d += 3 * a.lvl;
        }
        if (this.hasPerk(src, 'Ink')) d = Math.max(0, d - 3 * sm);
      }
      if (d <= 0) return 0;
      // defender modifiers
      const dp = this.perkId(tgt);
      const mu = this.perkMult(tgt);
      if (this.phase === 'sob' && dp === 'CarrotParisier') d = Math.max(0, d - 3 * mu);
      if ((kind === 'ability' || kind === 'perk') && dp === 'Potato') { d = Math.max(0, d - 10 * mu); this.usePerk(tgt); }
      const rev = tgt.id === 'Deinocheirus' && this.passiveOn(tgt) ? -tgt.lvl : 1; // ailments work in reverse
      if (dp === 'Weak') d = Math.max(0, d + 3 * mu * rev);
      if (dp === 'Scared') d = Math.max(0, d + 1 * mu * rev);
      if (dp === 'Frozen') { d = Math.max(0, d + 5 * mu * rev); this.usePerk(tgt); }
      if (dp === 'Acid') { d = rev > 0 ? d * (1 + mu) : Math.ceil(d / (1 + mu * -rev)); this.usePerk(tgt); }
      switch (this.perkId(tgt)) {
        case 'Coconut': d = 0; this.usePerk(tgt); break;
        case 'BrusselsSprout': d = Math.max(0, d - 5 * mu); this.usePerk(tgt); break;
        case 'Melon': d = Math.max(0, d - 20 * mu); this.usePerk(tgt); break;
        case 'WaterMelon': d = Math.max(0, d - 10 * mu); this.usePerk(tgt); break;
        case 'Lemon': d = Math.max(0, d - 7 * mu); this.usePerk(tgt); break;
        case 'Walnut': d = Math.max(0, d - 2 * mu); this.usePerk(tgt); break;
        case 'Guava': d = Math.max(0, d - 3 * mu); break; // used up on its attack
        case 'HoneydewMelon': d = Math.max(0, d - 10 * mu); break;
        case 'Ambrosia': d = Math.max(0, d - 8 * mu); this.usePerk(tgt); break;
        case 'WhiteOkra': d = Math.max(0, d - 10 * mu); this.usePerk(tgt); break;
        case 'MapleSyrup': d = Math.ceil(d / (1 + mu)); break;
        case 'Garlic': d = Math.max(Math.min(1, d), d - 2 * mu); break;
        case 'Lime': d = Math.max(Math.min(1, d), d - 1 * mu); break;
        case 'Eucalyptus': if (src && src.side !== tgt.side) { d = Math.max(0, d - 4 * mu); this.usePerk(tgt); } break;
        case 'Strawberry': {
          const sl = this.sparrowLevel(tgt.side);
          if (sl && d > 0) {
            d = Math.max(0, d - 5 * sl * mu);
            tgt.perk.sparrow = (tgt.perk.sparrow || 0) + 1;
            if (tgt.perk.sparrow >= 2) this.losePerk(tgt, null, 'used');
          }
          break;
        }
      }
      d = Math.max(0, d - this.passiveReduce(tgt, kind));
      if (opts.exact != null) d = opts.exact;
      if (d <= 0) { this.rec('block', { tgt: tgt.uid, src: src && src.uid }); return 0; }
      let dealt = d;
      tgt.hp -= d;
      if (this.hasPerk(tgt, 'Pepper') && tgt.hp < 1) { tgt.hp = 1; this.losePerk(tgt, null, 'used'); }
      if (kind === 'attack' && src && (this.hasPerk(src, 'Peanut') || this.hasPerk(src, 'PeanutButter')) && tgt.hp > 0) {
        tgt.hp = 0; if (this.hasPerk(src, 'PeanutButter')) this.usePerk(src);
      }
      if (tgt.hp <= 0 && this.hasPerk(tgt, 'BokChoy')) { tgt.hp += 3 * mu; this.usePerk(tgt); }
      tgt.hurtCount++;
      if (src) src.dealtDamage = true;
      if (tgt.hp <= 0) tgt.killer = src;
      this.rec('damage', { tgt: tgt.uid, src: src && src.uid, n: dealt, dk: kind, mana: opts.mana || undefined });
      this.emit('Hurt', { pet: tgt, src, n: dealt, kind });
      const hp = this.perkId(tgt);
      if (hp && PERKS[hp] && PERKS[hp].t === 'hurt') this.queue.push({ pet: tgt, ev: {}, perkFx: hp });
      return dealt;
    }

    attackDamage(a, d) {
      let dmg = a.atk;
      const pk = this.perkId(a);
      const m = this.perkMult(a);
      switch (pk) {
        case 'MeatBone': dmg += 3 * m; break;
        case 'Steak': dmg += 20 * m; this.usePerk(a); break;
        case 'Cheese': dmg = Math.max(15 * m, dmg); this.usePerk(a); break;
        case 'Salt': dmg *= 1 + m; this.usePerk(a); break;
        case 'FortuneCookie': if (this.rng() < Math.min(1, 0.5 * m)) dmg *= 2; break;
        case 'Guava': dmg += 3 * m; this.usePerk(a); break;
        case 'HoneydewMelon': dmg += 5 * m; this.usePerk(a); break;
        case 'MapleSyrup': dmg = Math.ceil(dmg / (1 + m)); this.usePerk(a); break;
        case 'Drowsy': dmg = a.id === 'Deinocheirus' ? dmg * (1 + m * a.lvl) : Math.floor(dmg / (1 + m)); this.usePerk(a); break;
        case 'Ink': dmg = a.id === 'Deinocheirus' ? dmg + 3 * m * a.lvl : Math.max(0, dmg - 3 * m); break;
      }
      if (a.flags.doubleAttack) dmg *= 2;
      if (a.id === 'WhiteKillerRabbit' && this.passiveOn(a)) dmg *= a.lvl + 1;
      return dmg;
    }

    // ---------------- summon / move / transform
    summon(side, index, id, opts = {}) {
      const team = this.t[side].filter(p => p.onBoard);
      if (team.length >= MAX_TEAM) { this.rec('summonfail', { side, id }); return null; }
      if (!this.D.pets[id]) return null;
      const def = this.D.pets[id];
      const p = this.makePet(id, side, {
        atk: opts.atk != null ? opts.atk : def.a, hp: opts.hp != null ? opts.hp : def.h,
        xp: opts.lvl ? [0, 0, 2, 5][opts.lvl] : (opts.xp || 0), perk: opts.perk, mana: opts.mana,
      });
      if (opts.flags) Object.assign(p.flags, opts.flags);
      const arr = this.t[side];
      // insert relative to on-board pets
      const ob = arr.filter(x => x.onBoard);
      let i = Math.max(0, Math.min(index == null ? ob.length : index, ob.length));
      const ref = ob[i];
      const pos = ref ? arr.indexOf(ref) : arr.length;
      arr.splice(pos, 0, p);
      this.compact();
      this.rec('summon', { tgt: p.uid, src: opts.src && opts.src.uid });
      if (!opts.silent) {
        this.emit('Summoned', { pet: p });
        if (id === 'Bee') this.emit('BeeSummoned', { pet: p });
      }
      return p;
    }
    compact() { for (let s = 0; s < 2; s++) this.t[s] = this.t[s].filter(p => p.onBoard); }
    move(p, newIndex, src) {
      this.gaps = false; // anything moving closes the starting gaps
      const arr = this.t[p.side];
      const i = arr.indexOf(p); if (i < 0) return;
      arr.splice(i, 1);
      const j = Math.max(0, Math.min(newIndex, arr.length));
      arr.splice(j, 0, p);
      if (i !== j) this.rec('move', { tgt: p.uid, src: src && src.uid, from: i, to: j });
      return i !== j;
    }
    push(p, spaces, src) { // positive = forward (toward front)
      const i = this.idx(p); if (i < 0) return;
      if (src && src.side !== p.side && this.hasPerk(p, 'BrusselsSprout')) { this.rec('block', { tgt: p.uid, src: src.uid }); this.usePerk(p); return; }
      const moved = this.move(p, i - spaces, src);
      if (moved && src && src.side !== p.side) {
        this.emit('EnemyPushed', { pet: p, src });
        this.emit('PetPushed', { pet: p, src });
      }
    }
    transform(p, id, opts = {}) {
      if (!this.D.pets[id]) return;
      const def = this.D.pets[id];
      p.id = id;
      if (opts.base) { p.atk = def.a; p.hp = def.h; }
      if (opts.atk != null) p.atk = opts.atk;
      if (opts.hp != null) p.hp = opts.hp;
      if (opts.lvl) { p.xp = [0, 0, 2, 5][opts.lvl]; p.lvl = opts.lvl; }
      p.uses = {};
      this.rec('transform', { tgt: p.uid, src: opts.src && opts.src.uid, id });
      this.emit('Transformed', { pet: p });
    }
    jumpAttack(src, tgt, dmgOverride) {
      if (!src || !src.onBoard || !this.alive(tgt)) return;
      // a jump attack is a normal fight between the two pets: before-attack abilities, perks and ailments
      // of both pets go off first, then both hit each other at the same time
      this.rec('jump', { src: src.uid, tgt: tgt.uid });
      src.flags.jumped = true; // so Jackalope / Loveland Frogman see it as a jumping pet
      this.beforeAttackStep([[src, tgt], [tgt, src]]);
      if (!src.onBoard || src.hp <= 0 || !this.alive(tgt)) return;
      const dmg = dmgOverride != null ? dmgOverride : this.attackDamage(src, tgt);
      const back = this.attackDamage(tgt, src);
      // the jumper's splash perks hit the pets behind its target
      const en = this.enemiesOf(src), ti = en.indexOf(tgt), pk = this.perkId(src), sm = this.perkMult(src), extra = [];
      if (pk === 'Chili' && en[ti + 1]) extra.push([en[ti + 1], 5 * sm]);
      if (pk === 'MildChili' && en[ti + 1]) extra.push([en[ti + 1], 4 * sm]);
      if (pk === 'Skewer') { if (en[ti + 1]) extra.push([en[ti + 1], 3 * sm]); if (en[ti + 2]) extra.push([en[ti + 2], 3 * sm]); }
      this.damage(src, tgt, dmg, 'attack');
      this.damage(tgt, src, back, 'attack');
      for (const [t, n] of extra) this.damage(src, t, n, 'perk');
      if (src.onBoard) this.emit('Attack', { pet: src, target: tgt, jump: true });
      this.emit('Jumped', { pet: src });
    }

    // ---------------- triggers / queue
    emit(type, ev) {
      ev.type = type;
      if (type === 'Jumped' && ev.pet) ev.pet.flags.jumped = true;
      const all = this.t[0].concat(this.t[1]);
      for (const p of all) {
        if (!p.onBoard) continue;
        const ab = this.A[p.id];
        if (ab && ab.levels[p.lvl - 1]) {
          for (const tr of this.listens(p, ab.trigger, type, ev)) this.queue.push({ pet: p, ev, tr, petId: p.id });
        }
      }
      // ailments / perks reacting to events
      if (type === 'Attack') {
        for (const p of all) {
          if (!this.alive(p)) continue;
          const pk = this.perkId(p);
          if (pk === 'Toasty' || pk === 'Burn') this.queue.push({ pet: p, ev, perkFx: pk });
        }
      }
      if (type === 'FriendFaints' && ev.pet) {
        for (const p of this.team(ev.pet.side)) if (this.hasPerk(p, 'WhiteTruffle')) this.queue.push({ pet: p, ev: {}, perkFx: 'WhiteTruffle' });
      }
    }

    /** returns trigger labels this pet reacts to for event type (usually 0 or 1) */
    listens(p, trig, type, ev) {
      const e = ev.pet;
      const friend = e && e !== p && e.side === p.side;
      const enemy = e && e.side !== p.side;
      const i = this.idx(p);
      const out = [];
      const ok = c => { if (c) out.push(trig); };
      switch (trig) {
        case 'SOB': ok(type === 'SOB'); break;
        case 'BeforeBattle': ok(type === 'BeforeBattle'); break;
        case 'BeforeAttack': ok(type === 'BeforeAttack' && e === p); break;
        case 'BeforeFriendAttacks': ok(type === 'BeforeAttack' && friend); break;
        case 'Hurt': ok(type === 'Hurt' && e === p); break;
        case 'FriendAheadHurt': ok(type === 'Hurt' && friend && this.idx(e) === i - 1 && i > 0); break;
        case 'FriendHurt': ok(type === 'Hurt' && friend); break;
        case 'EnemyHurt': ok(type === 'Hurt' && enemy); break;
        case 'EnemyHurtOrPushed': ok((type === 'Hurt' || type === 'EnemyPushed') && enemy); break;
        case 'AnyoneBehindHurt': ok(type === 'Hurt' && friend && this.idx(e) > i); break;
        case 'AnyoneHurt': ok(type === 'Hurt'); break;
        case 'BeforeFaint': ok(type === 'BeforeFaint' && e === p); break;
        case 'Faint': ok(type === 'Faint' && e === p); break;
        case 'FriendFaints': ok(type === 'Faint' && friend); break;
        case 'FriendAheadFaints': ok(type === 'Faint' && friend && ev.behind === p); break;
        case 'KnockOut': ok(type === 'KnockOut' && ev.killer === p); break;
        case 'Summoned': ok(type === 'Summoned' && e === p); break;
        case 'FriendSummoned': ok(type === 'Summoned' && friend); break;
        case 'BeeSummoned': ok(type === 'BeeSummoned' && e && e.side === p.side); break;
        case 'EnemySummoned': ok(type === 'Summoned' && enemy); break;
        case 'EnemySummonedOrPushed': ok((type === 'Summoned' || type === 'EnemyPushed') && enemy); break;
        case 'AfterAttack': ok(type === 'Attack' && e === p); break;
        case 'AfterFirstAttack': ok(type === 'Attack' && e === p && !p.flags.firstAttackDone); break;
        case 'FriendAheadAttacks': ok(type === 'Attack' && friend && this.idx(e) === i - 1); break;
        case 'AdjFriendAttacked': ok(type === 'Attack' && friend && Math.abs(this.idx(e) - i) === 1); break;
        case 'FriendAttacks': ok(type === 'Attack' && friend); break;
        case 'FriendlyAttacked': ok(type === 'Attack' && e && e.side === p.side); break;
        case 'EmptyFront': ok(type === 'EmptyFront' && ev.side === p.side && !p.flags.emptyFrontDone); break;
        case 'EnemyPushed': ok(type === 'EnemyPushed' && enemy); break;
        case 'GainPerk': ok(type === 'GainPerk' && e === p); break;
        case 'GainPerkOrAilment': ok((type === 'GainPerk' || type === 'GainAilment') && e === p); break;
        case 'FriendlyGainedPerk': ok(type === 'GainPerk' && e && e.side === p.side); break;
        case 'FriendlyGainedStrawberry': ok(type === 'GainPerk' && e && e.side === p.side && ev.perk === 'Strawberry'); break;
        case 'FriendGainedAilment': ok(type === 'GainAilment' && friend); break;
        case 'EnemyGainedAilment': ok(type === 'GainAilment' && enemy); break;
        case 'AnyoneGainedAilment': ok(type === 'GainAilment'); break;
        case 'FriendLostPerk': ok(type === 'LosePerk' && friend); break;
        case 'PetLostPerk': ok(type === 'LosePerk' && e !== p); break;
        case 'Transformed': ok(type === 'Transformed' && e === p); break;
        case 'FriendTransformed': ok(type === 'Transformed' && friend); break;
        case 'FriendJumpedOrTransformed': ok((type === 'Transformed' || type === 'Jumped') && friend); break;
        case 'GainsMana': ok(type === 'GainsMana' && e === p); break;
        case 'LevelUp': ok(type === 'LevelUp' && e === p); break;
        case 'FriendLevelUp': ok(type === 'LevelUp' && friend && !(p.id === 'Cyclops' && e.id === 'Cyclops') && !(p.id === 'TeamSpirit' && e.id === 'TeamSpirit')); break;
        case 'FriendlyLevelUp': ok(type === 'LevelUp' && e && e.side === p.side); break;
        case 'FriendGainedXp': ok(type === 'GainedXp' && friend); break;
        case 'EnemyFaints': ok(type === 'Faint' && enemy); break;
        // eating food (PlayedSpellOn in the game data)
        case 'EatsFood': ok(type === 'AteFood' && e === p); break;
        case 'EatsApple': ok(type === 'AteFood' && e === p && /^Apple/.test(ev.food)); break;
        case 'FriendAteFood': ok(type === 'AteFood' && friend); break;
        case 'FriendlyAteFood': ok(type === 'AteFood' && e && e.side === p.side); break;
        case 'PetAteFood': ok(type === 'AteFood'); break;
        case 'FriendAteCorncob': ok(type === 'AteFood' && friend && ev.food === 'Corn'); break;
        default:
          if (trig && trig.startsWith('Count:')) {
            const [, what, nStr] = trig.split(':'); const need = +nStr;
            let hit = false;
            if (what === 'FriendFaints') hit = type === 'Faint' && friend;
            else if (what === 'EnemyFaints') hit = type === 'Faint' && enemy;
            else if (what === 'EnemyAttacks') hit = type === 'Attack' && enemy;
            else if (what === 'FriendlyAttacks') hit = type === 'Attack' && friend;
            else if (what === 'FriendHurt') hit = type === 'Hurt' && friend;
            if (hit) { p.counter++; ok(p.counter % need === 0); }
          }
      }
      return out;
    }

    /**
     * Order a sequence: pets by attack (Churros first, Macaron last, random tie-break per pet), and for the same
     * pet its perk / ailment always goes before its own ability.
     */
    byAttackOrder(list) {
      const r = new Map();
      const key = q => { if (!r.has(q.pet)) r.set(q.pet, this.rng()); return r.get(q.pet); };
      for (const q of list) key(q);
      const pri = q => (this.hasPerk(q.pet, 'Churros') ? 1 : this.hasPerk(q.pet, 'Macaron') ? -1 : 0);
      const isPerk = q => (q.perkFx || q.bap ? 0 : 1);
      return list.sort((x, y) => (pri(y) - pri(x)) || (y.pet.atk - x.pet.atk) || (key(x) - key(y)) || (isPerk(x) - isPerk(y)));
    }

    /**
     * Resolve queued abilities as one sequence: everything triggered goes off (in attack order), including pets
     * that are knocked out partway through - nothing leaves the board until the sequence is finished. Then deaths
     * resolve, and faint / friend-faint triggers start the next sequence.
     */
    flush() {
      let guard = 0;
      for (;;) {
        if (!this.queue.length) { this.resolveDeaths(); if (!this.queue.length) break; }
        if (++guard > 400) { this.rec('note', { text: 'Ability loop stopped' }); this.queue = []; this.resolveDeaths(); break; }
        const batch = this.byAttackOrder(this.queue.splice(0));
        for (const q of batch) this.execute(q);
      }
    }

    over() { return this.team(0).length === 0 || this.team(1).length === 0; }

    execute(q) {
      const p = q.pet;
      if (q.perkFx) return this.perkEffect(q.perkFx, p, q.ev);
      if (q.bap) { if (p.onBoard && p.hp > 0) this.beforeAttackPerks(p, q.ev.target); return; }
      if (q.petId && q.petId !== p.id) return; // transformed earlier in this sequence
      const ab = this.A[p.id];
      if (!ab) return;
      // pets knocked out during the current sequence are still on the board and still activate
      const deadOk = q.tr === 'Faint' || q.tr === 'BeforeFaint' || p.onBoard;
      if (!deadOk) return;
      if (deadOk && q.tr === 'BeforeFaint' && !p.onBoard) return;
      if (this.hasPerk(p, 'Deaf')) { this.rec('note', { tgt: p.uid, text: 'Dazed' }); return; }
      const fn = ab.levels[p.lvl - 1];
      if (!fn) return;
      const key = 'ab';
      const limit = this.limitOf(p);
      if (limit && (p.uses[key] || 0) >= limit) return;
      p.uses[key] = (p.uses[key] || 0) + 1;
      if (q.tr === 'AfterFirstAttack') p.flags.firstAttackDone = true;
      if (q.tr === 'EmptyFront' && limit) p.flags.emptyFrontDone = true; // unlimited ones (Emu) can go again
      this.steps++;
      this.rec('ability', { src: p.uid, id: p.id, trig: q.tr });
      try {
        const at = this.log.length;
        if (fn({ B: this, self: p, ev: q.ev, lvl: p.lvl }) === false) {
          p.uses[key]--; this.steps--;
          if (this.log.length === at) this.log.pop(); // drop the "activates" line: nothing happened
          return;
        }
        // Tiger behind: repeat the ability as if level = Tiger's level
        const t = this.t[p.side]; const i = t.indexOf(p);
        const tg = i >= 0 ? t[i + 1] : (q.ev && q.ev.slot != null ? t[q.ev.slot] : null);
        if (tg && tg !== p && tg.id === 'Tiger' && p.id !== 'Tiger' && this.passiveOn(tg) && !this.over()) {
          const f2 = ab.levels[tg.lvl - 1];
          if (f2) { this.rec('ability', { src: p.uid, id: p.id, trig: 'Tiger' }); f2({ B: this, self: p, ev: q.ev, lvl: tg.lvl }); }
        }
      } catch (err) {
        this.rec('note', { tgt: p.uid, text: 'Ability error: ' + err.message });
        if (typeof console !== 'undefined' && root.SAP_DEBUG) console.error(p.id, err);
      }
      // Silly: activate tree kangaroo style re-activations handled in ability
    }

    /** Pink Robin: run p's End Turn ability now, in battle */
    activateEndTurn(p, src) {
      const ab = this.A[p.id]; const fn = ab && ab.endTurn && ab.endTurn[p.lvl - 1];
      if (!fn || !this.alive(p)) return;
      if (this.hasPerk(p, 'Deaf')) { this.rec('note', { tgt: p.uid, text: 'Dazed' }); return; }
      this.rec('ability', { src: p.uid, id: p.id, trig: 'EndTurn', by: src && src.uid });
      try { fn({ B: this, self: p, ev: {}, lvl: p.lvl }); }
      catch (err) { this.rec('note', { tgt: p.uid, text: 'Ability error: ' + err.message }); }
    }

    /** fire p's held perk if it has trigger t. Returns true if it fired. */
    firePerk(p, t, ev) {
      const pk = this.perkId(p); const def = pk && PERKS[pk];
      if (!def || def.t !== t) return false;
      if (t !== 'faint' && !(p && p.onBoard)) return false;
      this.rec('perkfx', { src: p.uid, perk: pk });
      const m = this.perkMult(p);
      const reps = def.rep ? m : 1;
      for (let k = 0; k < reps; k++) { if (this.over() && t !== 'faint') break; def.fn(this, p, { m, ev }); }
      if (def.once && this.hasPerk(p, pk)) this.losePerk(p, null, 'used');
      return true;
    }
    perkEffect(id, p, ev) {
      if (PERKS[id]) { if (PERKS[id].t === 'faint' || this.hasPerk(p, id)) this.firePerk(p, PERKS[id].t, ev); return; }
      if (!p.onBoard && !['Tasty', 'Web', 'Curse', 'ManaBurst'].includes(id)) return;
      const B = this;
      const slot = ev && ev.slot;
      const sum = (pid, a, h, extra = {}) => B.summon(p.side, slot, pid, Object.assign({ atk: a, hp: h, src: p }, extra));
      if (id !== 'ManaBurst') this.rec('perkfx', { src: p.uid, perk: id });
      switch (id) {
        case 'Toasty': case 'Burn':
          if (!this.alive(p) || this.perkId(p) !== id) return;
          this.usePerk(p);
          this.damage(null, p, id === 'Toasty' ? 1 : 6, 'perk');
          break;
        case 'Tasty': {
          const e = B.pick(null, B.enemiesOf(p), 1, 'enemy')[0];
          if (e) B.buff(e, 2, 2, p);
          break;
        }
        case 'Web': B.summon(1 - p.side, 0, 'Spider', { atk: 2, hp: 2, src: p }); break;
        case 'Curse': { const f = B.pick(null, B.friendsOf(p), 1, 'friend')[0]; if (f) B.givePerk(f, 'Curse', p); break; }
        case 'ManaBurst': {
          const e = B.pick(p, B.enemiesOf(p), 1, 'enemy')[0];
          if (e) B.damage(p, e, ev.n, 'ability', { raw: true, mana: true });
          break;
        }
      }
    }

    resolveDeaths() {
      let guard = 0;
      while (++guard < 50) {
        const dying = this.t[0].concat(this.t[1]).filter(p => p.onBoard && p.hp <= 0 && !p.dying);
        if (!dying.length) break;
        // Before faint (pet still on board)
        for (const p of dying) p.dying = true;
        const pre = [];
        for (const p of dying) {
          const ab = this.A[p.id];
          if (ab && ab.trigger === 'BeforeFaint' && ab.levels[p.lvl - 1]) pre.push({ pet: p, ev: { type: 'BeforeFaint', pet: p }, tr: 'BeforeFaint' });
        }
        // other listeners of BeforeFaint-type friend triggers are handled through Faint events
        for (const q of this.byAttackOrder(pre)) this.execute(q);
        // remove and fire faint triggers
        for (const p of this.byAttackOrder(dying.map(p => ({ pet: p }))).map(q => q.pet)) {
          const arr = this.t[p.side];
          const slot = arr.indexOf(p);
          if (slot < 0) continue;
          const behind = arr.slice(slot + 1).find(x => this.alive(x));
          arr.splice(slot, 1);
          p.onBoard = false; p.slot = slot;
          this.rec('faint', { tgt: p.uid });
          const ev = { pet: p, slot, behind, killer: p.killer };
          // own faint ability
          const ab = this.A[p.id];
          if (ab && ab.trigger === 'Faint' && ab.levels[p.lvl - 1]) this.queue.push({ pet: p, ev, tr: 'Faint' });
          // perk on faint
          const pk = this.perkId(p);
          if ((PERKS[pk] && PERKS[pk].t === 'faint') || ['Tasty', 'Web', 'Curse'].includes(pk)) this.queue.push({ pet: p, ev, perkFx: pk });
          if (p.mana > 0) this.queue.push({ pet: p, ev: { n: p.mana }, perkFx: 'ManaBurst' });
          // swallowed pets (Whale / Goblin Shark / Pelican)
          if (p.swallowed) this.queue.push({ pet: p, ev, tr: 'Release', release: true });
          // friends / enemies react (Friend faints, Friend ahead faints, Enemy faints, faint counters)
          this.emit('Faint', ev);
          this.emit('FriendFaints', { pet: p });
          if (p.killer && this.alive(p.killer)) {
            const k = p.killer; const kab = this.A[k.id];
            if (this.perkId(k) && PERKS[this.perkId(k)] && PERKS[this.perkId(k)].t === 'knockout') this.queue.push({ pet: k, ev, perkFx: this.perkId(k) });
            if (kab && kab.trigger === 'KnockOut' && kab.levels[k.lvl - 1]) this.queue.push({ pet: k, ev: { pet: p, killer: k }, tr: 'KnockOut' });
          }
          if (slot === 0 && this.team(p.side).length) this.emit('EmptyFront', { side: p.side });
          // Fairy Dust on friends
          if (slot === 0) for (const f of this.team(p.side)) if (this.hasPerk(f, 'FairyDust')) this.queue.push({ pet: f, ev: {}, perkFx: 'FairyDust' });
        }
        // release swallowed pets & queued faint triggers run in flush; handle releases now
        const rel = this.queue.filter(q => q.release); this.queue = this.queue.filter(q => !q.release);
        for (const q of rel) this.release(q.pet, q.ev.slot);
        this.checkRetriever();
      }
    }

    /**
     * A pet eats food in battle (Farmer pets' Corncobs, Pony's Better Apples...). Applies the food and fires the
     * food triggers: Eats food, Eats apple, Friend / Friendly / Pet ate food, Friend ate Corncob.
     * mult = "with double/triple effect".
     */
    feed(p, food, src, mult = 1) {
      if (!this.alive(p)) return false;
      const name = { Corn: 'Corncob', Apple: 'Apple', Apple2: 'Better Apple', Apple3: 'Best Apple', Pear: 'Pear' }[food] || food;
      this.rec('note', { tgt: p.uid, text: 'Ate ' + name });
      const stats = { Apple: 1, Apple2: 2, Apple3: 3, Pear: 2 }[food];
      if (food === 'Corn') { for (let i = 0; i < mult; i++) { if (p.atk <= p.hp) this.buff(p, 1, 0, src); else this.buff(p, 0, 1, src); } }
      else if (stats) this.buff(p, stats * mult, stats * mult, src);
      this.emit('AteFood', { pet: p, food, src });
      return true;
    }

    /** swallowing knocks the pet out: it faints (faint abilities fire) and the swallower gets the knock out */
    swallow(src, tgt, stored) {
      src.swallowed = stored;
      this.rec('swallow', { src: src.uid, tgt: tgt.uid });
      tgt.swallowedBy = src; tgt.killer = src; tgt.hp = 0;
    }

    release(p, slot) {
      const s = p.swallowed; p.swallowed = null;
      if (!s) return;
      this.summon(s.side != null ? s.side : p.side, slot, s.id, { atk: s.atk, hp: s.hp, lvl: s.lvl, perk: s.perk, src: p });
    }

    checkRetriever() {
      for (let s = 0; s < 2; s++) {
        if (this.retriever[s] || this.trumpets[s] <= 0) continue;
        if (this.team(s).length <= 1) this.summonRetriever(s);
      }
    }
    summonRetriever(s) {
      if (this.retriever[s] || this.trumpets[s] <= 0) return;
      const n = Math.min(50, this.trumpets[s]);
      this.retriever[s] = true;
      this.trumpets[s] = 0;
      this.summon(s, 0, 'GoldenRetriever', { atk: n, hp: n });
    }

    /**
     * Before-attack step for fighting pairs [[pet, its opponent], ...]: the pets' before-attack perks / ailments
     * and Before attack abilities (and friends' "before friend attacks") fire as one sequence in attack order,
     * each pet's perk before its own ability.
     * Runs inside the current sequence: new triggers it causes join the outer queue, nothing faints here.
     */
    beforeAttackStep(pairs) {
      const saved = this.queue; this.queue = [];
      for (const [p, t] of pairs) {
        if (!p.onBoard) continue;
        this.emit('BeforeAttack', { pet: p, target: t });
        if (this.perkId(p)) this.queue.push({ pet: p, ev: { target: t }, bap: true });
      }
      // the attacking pets' own before-attack perks / ailments go first (Rambutan's mana is there for Caladrius),
      // then everyone's Before attack / Before friend attacks abilities in attack order
      const all = this.queue.splice(0);
      const pre = this.byAttackOrder(all.filter(q => q.bap)).concat(this.byAttackOrder(all.filter(q => !q.bap)));
      for (const q of pre) this.execute(q);
      this.queue = saved.concat(this.queue);
    }

    // ---------------- phases
    beforeAttackPerks(p, tgt) {
      const pk = this.perkId(p);
      if (!pk) return;
      const B = this;
      const fx = (fn) => { this.rec('perkfx', { src: p.uid, perk: pk }); fn(); };
      if (PERKS[pk]) { if (PERKS[pk].t === 'beforeAttack') this.firePerk(p, 'beforeAttack', { target: tgt || B.enemiesOf(p)[0] }); return; }
      switch (pk) {
        case 'Cowardly': fx(() => { B.usePerk(p); B.move(p, 99, p); }); break;
        case 'Confused': {
          const t = B.tier(p) - 1;
          const pool = Object.keys(B.D.pets).filter(k => B.D.pets[k].r && B.D.pets[k].t === Math.max(1, t));
          if (pool.length) fx(() => { B.usePerk(p); B.transform(p, pool[B.rand(pool.length)], { src: p }); });
          break;
        }
      }
    }

    attackRound() {
      let a = this.team(0)[0], b = this.team(1)[0];
      if (!a || !b) return;
      // before attack
      this.beforeAttackStep([[a, b], [b, a]]);
      this.flush(); this.resolveDeaths();
      if (this.over()) return;
      a = this.team(0)[0]; b = this.team(1)[0];
      if (!a || !b) return;
      this.attackCount++;
      this.anyAttacked = true;
      const da = this.attackDamage(a, b), db = this.attackDamage(b, a);
      this.rec('attack', { a: a.uid, b: b.uid });
      // splash perks
      const splash = (p, list) => {
        const pk = this.perkId(p);
        const en = this.enemiesOf(p);
        const sm = this.perkMult(p);
        if (pk === 'Chili' && en[1]) list.push([p, en[1], 5 * sm]);
        if (pk === 'MildChili' && en[1]) list.push([p, en[1], 4 * sm]);
        if (pk === 'Skewer') { if (en[1]) list.push([p, en[1], 3 * sm]); if (en[2]) list.push([p, en[2], 3 * sm]); }
      };
      const extra = []; splash(a, extra); splash(b, extra);
      this.damage(a, b, da, 'attack');
      this.damage(b, a, db, 'attack');
      for (const [s, t, n] of extra) this.damage(s, t, n, 'perk');
      for (const p of [a, b].sort((x, y) => y.atk - x.atk)) {
        if (p.onBoard) this.emit('Attack', { pet: p, target: p === a ? b : a });
      }
      // after-attack abilities resolve before faints, so they still activate if the attacker was knocked out
      const after = this.queue.filter(q => q.tr === 'AfterAttack' || q.tr === 'AfterFirstAttack');
      if (after.length) {
        this.queue = this.queue.filter(q => !after.includes(q));
        for (const q of this.byAttackOrder(after)) this.execute(q);
      }
      this.flush(); this.resolveDeaths();
      for (const p of [a, b]) p.flags.firstAttackDone = true;
      if (this.giantOtter) this.giantOtterExpire();
    }

    giantOtterExpire() {
      for (const g of this.giantOtter) {
        for (const f of g.pets) if (this.alive(f) && !f.flags.otterExpired) {
          if (f.flags.firstAttackDone) { f.flags.otterExpired = true; this.buff(f, -g.a, 0, null); f.hp = Math.max(1, f.hp - g.h); this.rec('buff', { tgt: f.uid, da: 0, dh: -g.h }); }
        }
      }
    }

    run() {
      this.rec('start');
      if (this.gaps) {
        // front space left empty: "Empty front space" abilities (Emu...) go off first, then everyone moves up
        for (let s = 0; s < 2; s++) if (this.t[s].length && Math.min(...this.t[s].map(p => p.slot0)) > 0) this.emit('EmptyFront', { side: s });
        this.flush();
        if (this.gaps) { this.gaps = false; this.rec('move', { closeGaps: true }); }
      }
      // perks that fire before battle, in attack order
      this.phase = 'before';
      for (const p of this.team(0).concat(this.team(1)).sort((x, y) => y.atk - x.atk)) this.firePerk(p, 'beforeBattle');
      this.resolveDeaths();
      this.emit('BeforeBattle', {});
      this.flush(); this.resolveDeaths();
      this.phase = 'sob';
      this.emit('SOB', {});
      for (const p of this.team(0).concat(this.team(1))) if (PERKS[this.perkId(p)] && PERKS[this.perkId(p)].t === 'sob') this.queue.push({ pet: p, ev: {}, perkFx: this.perkId(p) });
      this.flush(); this.resolveDeaths(); this.flush();
      this.phase = 'battle';
      let rounds = 0;
      while (!this.over() && rounds < 200) {
        rounds++;
        this.attackRound();
        this.flush(); this.resolveDeaths(); this.flush();
      }
      const l = this.team(0).length, r = this.team(1).length;
      const result = l && !r ? 'win' : r && !l ? 'lose' : 'draw';
      this.rec('end', { result, rounds });
      return { result, log: this.log };
    }
  }

  const api = { Battle, levelFromXp, AILMENTS, PERK_SUPPORTED, PERKS, PASSIVE_PERKS, SHOP_PERKS, PERK_TRIGGER_LABEL, USEFUL_PERKS, MAX_TEAM, STAT_CAP, capOf, mulberry32 };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SAPEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
