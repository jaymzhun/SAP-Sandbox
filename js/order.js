/* Super Auto Pets sandbox — team ordering.
 * Picks the lineup (of all orderings) that best sets up each pet's trigger:
 *   - where it wants to stand: front (hurt / before attack / knock out / faint summoners) or back (friend faints,
 *     friend hurt, friend summoned, counters, ...),
 *   - who it wants next to it: pets that hit / feed / buff / repeat "the friend ahead" or "the friend behind" want
 *     the right pets there (Woodpecker behind hurt pets, Farmer Mouse ahead of food pets, Albatross next to snipers,
 *     Tiger behind a strong ability, Kangaroo right behind the front attacker...).
 */
(function (root) {
  'use strict';
  function create(D, STATUS, normText) {
    const txt = k => normText(((D.pets[k] || {}).ab || []).find(Boolean) || '');
    const trig = k => (STATUS[k] && STATUS[k].trigger) || '';
    const tier = k => (D.pets[k] || {}).t || 1;
    const active = k => STATUS[k] && STATUS[k].status === 'ok';

    // --- who benefits from what
    const hurtLover = k => trig(k) === 'Hurt';
    const foodLover = k => /Ate|Eats/.test(trig(k));
    const abilityPet = k => active(k) && !/^(Passive|Shop|None)$/.test(trig(k));
    const sniper = k => /deal \d+ damage to (?!itself|the nearest friend|adjacent friends|friends|all pets)/i.test(txt(k)) || /damage to (one|two|three) random enem/i.test(txt(k));
    const faintPet = k => /^(Faint|BeforeFaint)$/.test(trig(k));
    const summoner = k => faintPet(k) && /\bsummon\b/i.test(txt(k));
    const any = () => true;

    // --- where a pet wants to stand: -1 front ... +1 back
    function pref(k) {
      const t = trig(k), s = txt(k);
      if (/^(FriendFaints|EnemyFaints|FriendHurt|FriendSummoned|BeeSummoned|FriendAttacks|FriendlyAttacked|FriendLevelUp|FriendlyLevelUp|FriendGainedXp|FriendlyGainedPerk|FriendTransformed|FriendJumpedOrTransformed|FriendGainedAilment|FriendLostPerk|FriendAteFood|FriendlyAteFood|FriendAteCorncob|AnyoneHurt|AnyoneBehindHurt|EnemyHurt|EnemySummoned|EmptyFront)$/.test(t)) return 1;
      if (/^Count:/.test(t)) return 1;
      if (/^(Hurt|BeforeAttack|AfterAttack|AfterFirstAttack|KnockOut)$/.test(t)) return -1;
      if (summoner(k)) return -0.8;
      if (faintPet(k)) return -0.4;
      if (/^(SOB|BeforeBattle)$/.test(t) && sniper(k)) return 0.3;
      if (/^Passive$/.test(t)) return 0;
      return 0;
    }
    // pets that want one exact spot
    const wantsIndex1 = k => /^(FriendAheadAttacks|FriendAheadFaints|FriendAheadHurt)$/.test(trig(k));
    // only the front pet attacks: attack-triggered pets want to be first
    const wantsIndex0 = k => /^(BeforeAttack|AfterAttack|AfterFirstAttack|KnockOut)$/.test(trig(k));

    // --- relations: which neighbours a pet acts on, and who should be there
    function relation(k) {
      const s = txt(k), t = trig(k);
      const n = /\b(two|2)\b nearest|nearest (two|2)\b/i.test(s) ? 2 : /\b(three|3)\b nearest|nearest (three|3)\b/i.test(s) ? 3 : /\b(all|ALL) (pets|friends)\b|friends (ahead|behind)\b/i.test(s) ? 5 : 1;
      const dmg = /damage/i.test(s), feed = /\bfeed\b/i.test(s);
      const who = k === 'Albatross' ? sniper : /repeats? their ability/i.test(s) ? abilityPet : feed ? foodLover : dmg ? hurtLover : any;
      if (/^FriendAhead/.test(t)) return { dir: 'ahead', n: 1, who: any, dmg: false };
      if (/repeats? their ability/i.test(s)) return { dir: 'ahead', n: 1, who, dmg: false };
      if (/adjacent/i.test(s)) return { dir: 'adj', n: 1, who, dmg };
      if (/(friend|friends|pets?) ahead/i.test(s)) return { dir: 'ahead', n, who, dmg };
      if (/(friend|friends) behind/i.test(s)) return { dir: 'behind', n, who, dmg };
      return null;
    }

    function score(order) {
      const L = order.length; let sc = 0;
      order.forEach((k, i) => {
        const x = L > 1 ? i / (L - 1) : 0.5;
        sc += pref(k) * (x - 0.5) * 2 * 2;
        if (wantsIndex1(k)) sc += i === 1 ? 3 : i === 0 ? -2 : 0;
        if (wantsIndex0(k)) sc += i === 0 ? 3 : 0;
        const r = relation(k);
        if (!r) return;
        const near = r.dir === 'ahead' ? order.slice(Math.max(0, i - r.n), i) : r.dir === 'behind' ? order.slice(i + 1, i + 1 + r.n) : [order[i - 1], order[i + 1]].filter(Boolean);
        if (!near.length) { sc -= 1.5; return; } // nothing to act on
        for (const f of near) {
          if (r.who(f)) sc += 2.2; // every neighbour it helps counts
          else if (r.dmg) sc -= 1; // hitting a friend that gets nothing out of it
        }
      });
      // a little extra health up front for everyone else
      order.forEach((k, i) => { if (!pref(k)) sc += ((D.pets[k] || {}).h || 0) * 0.02 * (L - 1 - i) / Math.max(1, L - 1); });
      return sc;
    }

    function perms(a) {
      if (a.length <= 1) return [a.slice()];
      const out = [];
      a.forEach((x, i) => { for (const p of perms(a.slice(0, i).concat(a.slice(i + 1)))) out.push([x].concat(p)); });
      return out;
    }
    /** best order for a list of pet ids (front first); ties broken randomly */
    function bestOrder(ids, rnd = Math.random) {
      let best = null, bs = -Infinity;
      for (const p of perms(ids)) { const s = score(p) + rnd() * 0.01; if (s > bs) { bs = s; best = p; } }
      return best || ids.slice();
    }
    return { bestOrder, score, pref, relation };
  }
  const api = { create };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SAPOrder = api;
})(typeof window !== 'undefined' ? window : globalThis);
