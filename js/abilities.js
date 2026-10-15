/* Super Auto Pets sandbox — ability compiler.
 * Turns each pet's per-level ability text into executable battle effects.
 * Generic sentence grammar covers the common phrasing; SPECIAL handles the rest.
 */
(function (root) {
  'use strict';

  // trigger corrections discovered while verifying (dump class collapses friend variants)
  const TRIGGER_FIX = {
    Shark: 'FriendFaints', Spinosaurus: 'FriendFaints', Lamprey: 'FriendFaints', ShimaEnaga: 'FriendFaints',
    Kitsune: 'FriendFaints', MuskOx: 'FriendAheadFaints', Ox: 'FriendAheadFaints', Tatzelwurm: 'FriendAheadFaints',
    Fly: 'FriendFaints', Pteranodon: 'FriendFaints', Mosasaurus: 'Shop', FlyingSquirrel: 'Shop',
    Jackalope: 'BeforeFriendAttacks', LovelandFrogman: 'BeforeFriendAttacks', MarineIguana: 'BeforeFriendAttacks',
    Caladrius: 'BeforeFriendAttacks', RuspolisTuraco: 'BeforeFriendAttacks', WhiteBootedRacketTail: 'BeforeFriendAttacks',
  };
  Object.assign(TRIGGER_FIX, {
    // counter triggers (the game dump recorded no trigger for these)
    Vulture: 'Count:FriendFaints:2', SecretaryBird: 'Count:FriendFaints:2', SaigaAntelope: 'Count:FriendFaints:2',
    RoyalFlycatcher: 'Count:EnemyFaints:3', BlackRhino: 'Count:EnemyAttacks:8', LongcombSawfish: 'Count:EnemyAttacks:5',
    PygmyHippo: 'Count:EnemyAttacks:5', PygmyHog: 'Count:EnemyAttacks:5', AyeAye: 'Count:EnemyAttacks:7',
    GreenSeaTurtle: 'Count:EnemyAttacks:5', BombusDahlbomii: 'Count:EnemyAttacks:2', GrizzlyBear: 'Count:FriendlyAttacks:5',
    Wolverine: 'Count:FriendHurt:4',
    // level-up / experience triggers can fire mid-battle
    Fish: 'LevelUp', LuckyCat: 'LevelUp', Jellyfish: 'FriendLevelUp', TeamSpirit: 'FriendLevelUp', Cyclops: 'FriendLevelUp',
    ClownFish: 'FriendlyLevelUp', Murloc: 'FriendGainedXp',
    // passive abilities (always on; handled inside the engine)
    Panther: 'Passive', Manticore: 'Passive', Albatross: 'Passive', Tiger: 'Passive', Sparrow: 'Passive', Nurikabe: 'Passive',
    FanMussel: 'Passive', GhostKitten: 'Passive', Deinocheirus: 'Passive', FairyArmadilloBall: 'Passive', WhiteKillerRabbit: 'Passive', CuckooBaby: 'Passive',
  });
  const FAINT_LIMITS = { Fly: 3, ShimaEnaga: 2, Ox: 1, GreenSeaTurtle: 1, BombusDahlbomii: 2 };
  // activation limits checked on the wiki for each pet (number = same for all levels, array = per level)
  Object.assign(FAINT_LIMITS, {
    Pengobble: 2, AraripeManakin: 2, Bat: [1, 2, 3], Jackalope: 3, SakerFalcon: 3, AxehandleHound: 1, Hare: [1, 2, 3],
    Falcon: 3, Hippo: 3, RuspolisTuraco: [1, 2, 3], SaigaAntelope: 3, WhiteBootedRacketTail: [1, 2, 3], Boitata: [2, 4, 6],
    LovelandFrogman: 1, Racoon: [1, 2, 3], HoodedSeal: 2, Pteranodon: [1, 2, 3], Reindeer: [1, 2, 3], Wildebeest: [1, 2, 3],
    AfterFirstAttackOnce: 1,
  });
  // abilities whose effect happens several times per activation ("Triggers N times")
  const REPEATS = { Chupacabra: [2, 4, 6], Elephant: [1, 2, 3] };

  const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, both: 2, thrice: 3, twice: 2, once: 1 };
  const n = s => (s == null ? 1 : WORDS[String(s).toLowerCase()] != null ? WORDS[String(s).toLowerCase()] : parseInt(s, 10));

  const AIL = { weak: 'Weak', spooked: 'Scared', toasty: 'Toasty', cold: 'Frozen', inked: 'Ink', crisp: 'Burn',
    dazed: 'Deaf', sleepy: 'Drowsy', tasty: 'Tasty', silly: 'Silly', webbed: 'Web', confused: 'Confused',
    cursed: 'Curse', bloated: 'Bloated', icky: 'Acid', cowardly: 'Cowardly' };
  const PERK_ALIAS = { 'melon slice': 'WaterMelon', 'meat bone': 'MeatBone', rice: 'RiceBall', blueberry: 'BlueBerries',
    'mild chili': 'MildChili', 'white okra': 'WhiteOkra', 'peanut butter': 'PeanutButter', donut: 'Doughnut',
    'golden egg': 'GoldenEgg', 'fairy dust': 'FairyDust', strawberries: 'Strawberry', corncob: 'Corn' };

  function normText(t) {
    return String(t || '')
      .replace(/\{\w+Icon\}/g, '')
      .replace(/\[\[([^|\]]+)(?:\|([^\]]*))?\]\]/g, (m0, a, b) => (b && !/^food:/.test(b) ? b : a))
      .replace(/<\/?b>/g, '')
      .replace(/ /g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/ ([.,!])/g, '$1')
      .trim();
  }

  function compileAll(DATA, Engine) {
    const PETS = DATA.pets;
    const nameToKey = {};
    const nk = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [k, v] of Object.entries(PETS)) { if (!nameToKey[nk(v.n)] || !PETS[nameToKey[nk(v.n)]].r) nameToKey[nk(v.n)] = k; }
    for (const k of Object.keys(PETS)) nameToKey[nk(k)] = nameToKey[nk(k)] || k;
    const petKey = name => {
      let s = nk(name);
      if (nameToKey[s]) return nameToKey[s];
      if (s.endsWith('s') && nameToKey[s.slice(0, -1)]) return nameToKey[s.slice(0, -1)];
      if (s.endsWith('es') && nameToKey[s.slice(0, -2)]) return nameToKey[s.slice(0, -2)];
      const alias = { zombiecricket: 'CricketToken', rams: 'Ram', chicks: 'Chick', head: 'HydraHead', lizardtail: 'LizardToken',
        dirtyrat: 'RatToken', crickettoken: 'CricketToken', flytoken: 'FlyToken', fly: 'FlyToken', cracked: 'EggLadCracked',
        crackedegg: 'EggLadCracked', youngphoenix: 'BabyPhoenix', cookedroach: 'CockroachToken', cockroach: 'CockroachToken',
        smallerslug: 'SlugToken', smallestslug: 'SlugToken2', firepup: 'FirePup', mantis: 'OrchidMantis', pigs: 'Pig',
        crawler: 'DayCrawler', boat: 'Bus', bus: 'Bus', mammoth: 'Mammoth' };
      return alias[s] || alias[s.replace(/s$/, '')] || null;
    };
    const foodKeyByName = {};
    for (const [k, v] of Object.entries(DATA.foods)) {
      foodKeyByName[(v.pn || v.n).toLowerCase()] = foodKeyByName[(v.pn || v.n).toLowerCase()] || k;
      foodKeyByName[v.n.toLowerCase()] = foodKeyByName[v.n.toLowerCase()] || k;
    }
    const perkKey = name => {
      const s = name.toLowerCase().replace(/^the /, '').replace(/ perk$/, '').trim();
      return PERK_ALIAS[s] || foodKeyByName[s] || null;
    };
    const stat = (p, w) => (w === 'attack' ? p.atk : p.hp);

    // -------------------------------------------------------------- targets
    // returns selector fn (ctx) => pets[]  or null if unparsed
    function target(str) {
      let s = str.trim().replace(/^the /i, '').replace(/ in battle$/, '');
      let m;
      const E = (c) => c.B.enemiesOf(c.self), F = (c) => c.B.friendsOf(c.self);
      const ALLP = (c) => c.B.team(0).concat(c.B.team(1));
      const sortBy = (arr, f, dir) => arr.slice().sort((a, b) => dir * (f(a) - f(b)));
      if (/^(it|its target|them)$/i.test(s)) return c => {
        const ev = c.ev || {};
        let t = s === 'its target' ? ev.target : ev.pet;
        return t && c.B.alive(t) ? [t] : [];
      };
      if (/^(itself|this)$/i.test(s)) return c => [c.self];
      if ((m = s.match(/^(one|two|three|four|five) random (perk-less )?(enemy|enemies)$/i))) {
        const k = n(m[1]); const pl = !!m[2];
        return c => c.B.pick(c.self, E(c).filter(x => !pl || !x.perk), k, 'enemy');
      }
      if ((m = s.match(/^(one|two|three|four|five) random (friend|friends|friendly pet|friendly pets)$/i))) {
        const k = n(m[1]); return c => c.B.pick(c.self, F(c), k, 'friend');
      }
      if ((m = s.match(/^(?:ANY )?(one|two|three) random pets$/i))) {
        const k = n(m[1]); return c => c.B.pick(c.self, ALLP(c).filter(x => x !== c.self), k, 'any');
      }
      if ((m = s.match(/^(one|two|three|four) (?:random )?friends$/i))) { const k = n(m[1]); return c => c.B.pick(c.self, F(c), k, 'friend'); }
      if ((m = s.match(/^(one )?perk-less friend$/i))) return c => c.B.pick(c.self, F(c).filter(x => !x.perk), 1, 'friend');
      if (/^first enemy$/i.test(s) || /^opposite enemy$/i.test(s)) return c => E(c).slice(0, 1);
      if (/^second enemy$/i.test(s)) return c => E(c).slice(1, 2);
      if (/^last enemy$/i.test(s)) return c => E(c).slice(-1);
      if (/^first and last enemy$/i.test(s)) return c => { const e = E(c); return e.length > 1 ? [e[0], e[e.length - 1]] : e.slice(0, 1); };
      if ((m = s.match(/^(?:(two|three) first enemies|first (two|three) enemies)$/i))) { const k = n(m[1] || m[2]); return c => E(c).slice(0, k); }
      if ((m = s.match(/^(last|(two|three) last) perk-less (enemy|enemies)$/i))) {
        const k = m[2] ? n(m[2]) : 1; return c => E(c).filter(x => !x.perk).slice(-k).reverse();
      }
      if ((m = s.match(/^(lowest|highest) (health|attack) (enemy|friend|friendly pet)$/i))) {
        const w = m[2].toLowerCase(), dir = m[1] === 'lowest' ? 1 : -1, en = m[3] === 'enemy';
        return c => sortBy(en ? E(c) : F(c), p => stat(p, w), dir).slice(0, 1);
      }
      if ((m = s.match(/^(least|most) healthy (enemy|friend)$/i)) || (m = s.match(/^(least|most) health (enemy)$/i))) {
        const dir = m[1] === 'least' ? 1 : -1, en = m[2] === 'enemy';
        return c => sortBy(en ? E(c) : F(c), p => p.hp, dir).slice(0, 1);
      }
      if ((m = s.match(/^(lowest|highest) attack enemy$/i))) { const dir = m[1] === 'lowest' ? 1 : -1; return c => sortBy(E(c), p => p.atk, dir).slice(0, 1); }
      if ((m = s.match(/^(?:(one|two|three) )?nearest (friend|friends) (ahead|behind)$/i)) || (m = s.match(/^(?:(one) )?friend (ahead|behind)$/i))) {
        const k = m[1] ? n(m[1]) : 1; const dir = (m[3] || m[2]).toLowerCase();
        return c => {
          const t = c.B.team(c.self.side); const i = t.indexOf(c.self);
          if (i < 0) { // fainted: use slot
            const sl = c.ev && c.ev.slot != null ? c.ev.slot : 0;
            return dir === 'ahead' ? t.slice(Math.max(0, sl - k), sl).reverse() : t.slice(sl, sl + k);
          }
          return dir === 'ahead' ? t.slice(Math.max(0, i - k), i).reverse() : t.slice(i + 1, i + 1 + k);
        };
      }
      if (/^second nearest friend ahead$/i.test(s)) return c => { const t = c.B.team(c.self.side); const i = t.indexOf(c.self); return i >= 2 ? [t[i - 2]] : []; };
      if ((m = s.match(/^adjacent (friends|pets)$/i))) {
        const pets = m[1] === 'pets';
        return c => adjacent(c, 1, pets);
      }
      if ((m = s.match(/^ALL pets within (one|two|three) spaces?$/i))) { const k = n(m[1]); return c => adjacent(c, k, true); }
      if ((m = s.match(/^(?:ALL )?(adjacent )?perk-less pets$/i))) return c => adjacent(c, 1, true).filter(x => !x.perk);
      if (/^ALL other pets$/i.test(s)) return c => ALLP(c).filter(x => x !== c.self);
      if (/^ALL pets$/i.test(s)) return c => ALLP(c);
      if (/^(ALL|all) enemies$/i.test(s)) return c => E(c);
      if (/^(friends|friendly pets|all friends|ALL friends|friendly)$/i.test(s)) return c => F(c);
      if (/^ALL pets ahead$/i.test(s)) return c => { const t = c.B.team(c.self.side); const i = t.indexOf(c.self); return t.slice(0, Math.max(0, i)).concat(E(c)); };
      if (/^friends ahead$/i.test(s)) return c => { const t = c.B.team(c.self.side); return t.slice(0, Math.max(0, t.indexOf(c.self))); };
      if (/^friends behind$/i.test(s)) return c => { const t = c.B.team(c.self.side); return t.slice(t.indexOf(c.self) + 1); };
      if (/^front-most (friend|friendly pet)$/i.test(s)) return c => F(c).slice(0, 1);
      if (/^back-most (friend|friendly pet)$/i.test(s)) return c => F(c).slice(-1);
      if ((m = s.match(/^(two|three) back-most friends$/i))) { const k = n(m[1]); return c => F(c).slice(-k); }
      if ((m = s.match(/^(two|three) front-most friends$/i))) { const k = n(m[1]); return c => F(c).slice(0, k); }
      if (/^highest tier friend$/i.test(s)) return c => { const f = F(c); const mx = Math.max(...f.map(p => c.B.tier(p))); return c.B.shuffle(f.filter(p => c.B.tier(p) === mx)).slice(0, 1); };
      if ((m = s.match(/^(two|three) last enemies$/i))) { const k = n(m[1]); return c => E(c).slice(-k).reverse(); }
      if ((m = s.match(/^(two|three) (highest|lowest) (attack|health) enemies$/i))) { const k = n(m[1]), dir = m[2] === 'lowest' ? 1 : -1, w = m[3]; return c => sortBy(E(c), p => stat(p, w), dir).slice(0, k); }
      if ((m = s.match(/^(two|three) (least|most) healthy enemies$/i))) { const k = n(m[1]), dir = m[2] === 'least' ? 1 : -1; return c => sortBy(E(c), p => p.hp, dir).slice(0, k); }
      if ((m = s.match(/^nearest (two|three) friends (ahead|behind)$/i))) return target((m[1]) + ' nearest friends ' + m[2]);
      if (/^back-most friendly Strawberry pet$/i.test(s)) return c => F(c).filter(p => c.B.hasPerk(p, 'Strawberry')).slice(-1);
      if (/^front-most Strawberry friend$/i.test(s)) return c => F(c).filter(p => c.B.hasPerk(p, 'Strawberry')).slice(0, 1);
      return null;
    }
    function adjacent(c, k, includeEnemies) {
      // positions on a combined line: friends reversed (back..front) then enemies front..back
      const B = c.B, me = c.self;
      const mine = B.t[me.side].filter(p => p.onBoard && (p.hp > 0 || p === me));
      const line = mine.slice().reverse().concat(B.t[1 - me.side].filter(p => B.alive(p)));
      let i = line.indexOf(me);
      if (i < 0) { // fainted pet: virtual position
        const sl = c.ev && c.ev.slot != null ? c.ev.slot : 0;
        const fr = B.team(me.side);
        const vline = fr.slice(sl).reverse().concat([me]).concat(fr.slice(0, sl).reverse()).concat(B.team(1 - me.side));
        i = vline.indexOf(me);
        return vline.filter((p, j) => p !== me && Math.abs(j - i) <= k && (includeEnemies || p.side === me.side));
      }
      return line.filter((p, j) => p !== me && Math.abs(j - i) <= k && (includeEnemies || p.side === me.side) && B.alive(p));
    }

    // -------------------------------------------------------------- actions
    const TAIL = '(?: until (?:next turn|end of battle|after the first non-jump attack))?(?: in battle)?(?: permanently)?';
    function action(sentence, key) {
      let s = sentence.trim().replace(/\.$/, '').replace(/^Also (\w)/, (x, ch) => ch.toUpperCase());
      let m, tg;
      let dbl = 1;
      if ((m = s.match(/^(.*?)(?: twice| thrice)? (?:for|with) (double|triple) effect$/i))) { s = m[1]; dbl = m[2].toLowerCase() === 'triple' ? 3 : 2; }
      if (dbl > 1) {
        if ((m = s.match(/^Make (.+?) (Weak|Spooked|Cold|Inked|Crisp|Icky)$/i)) && (tg = target(m[1]))) { const ail = AIL[m[2].toLowerCase()]; return c => { for (const t of tg(c)) if (c.B.givePerk(t, ail, c.self)) t.perk.mult = dbl; }; }
        if ((m = s.match(/^Gain the (.+?) perk$/i)) && perkKey(m[1])) { const pk = perkKey(m[1]); return c => { if (c.B.givePerk(c.self, pk, c.self)) c.self.perk.mult = dbl; }; }
      }
      // compound "X and Y" handled by caller; here single clause
      // ---- damage
      if ((m = s.match(/^Deal (\d+) damage to (.+?)( and itself)?$/i)) && (tg = target(m[2]))) {
        const d = +m[1], self = !!m[3];
        return c => { for (const t of tg(c)) c.B.damage(c.self, t, d, 'ability'); if (self) c.B.damage(c.self, c.self, d, 'ability'); };
      }
      if ((m = s.match(/^Deal (\d+)% attack damage to (.+?)( and itself)?$/i)) && (tg = target(m[2]))) {
        const pc = +m[1] / 100, self = !!m[3];
        return c => { const d = Math.max(1, Math.round(c.self.atk * pc)); for (const t of tg(c)) c.B.damage(c.self, t, d, 'ability'); if (self) c.B.damage(c.self, c.self, d, 'ability'); };
      }
      if ((m = s.match(/^Deal attack damage to (.+)$/i)) && (tg = target(m[1]))) {
        return c => { for (const t of tg(c)) c.B.damage(c.self, t, c.self.atk, 'ability'); };
      }
      // ---- remove
      if ((m = s.match(/^Remove (\d+)(%?) (health|attack) from (.+?)(?: to a minimum of (\d+) attack)?$/i)) && (tg = target(m[4]))) {
        const v = +m[1], pc = !!m[2], w = m[3].toLowerCase(), min = m[5] ? +m[5] : 0;
        return c => {
          for (const t of tg(c)) {
            const amt = pc ? Math.floor(stat(t, w) * v / 100) : v;
            if (w === 'health') c.B.removeHealth(t, amt, c.self); else c.B.removeAttack(t, amt, c.self, min);
          }
        };
      }
      if ((m = s.match(/^Remove (\d+) attack and health from (.+)$/i)) && (tg = target(m[2]))) {
        const v = +m[1]; return c => { for (const t of tg(c)) { c.B.removeAttack(t, v, c.self); c.B.removeHealth(t, v, c.self); } };
      }
      // ---- give stats
      if ((m = s.match(new RegExp('^Give (.+?) (?:permanent )?\\+(\\d+) attack and \\+(\\d+) health' + TAIL + '$', 'i'))) && (tg = target(m[1]))) {
        const a = +m[2], h = +m[3]; return c => { for (const t of tg(c)) c.B.buff(t, a, h, c.self); };
      }
      if ((m = s.match(new RegExp('^Give (.+?) (?:permanent )?\\+(\\d+) (attack|health)' + TAIL + '$', 'i'))) && (tg = target(m[1]))) {
        const v = +m[2], w = m[3].toLowerCase(); return c => { for (const t of tg(c)) c.B.buff(t, w === 'attack' ? v : 0, w === 'health' ? v : 0, c.self); };
      }
      if ((m = s.match(/^Give \+(\d+) (attack|health) to (.+)$/i)) && (tg = target(m[3]))) {
        const v = +m[1], w = m[2].toLowerCase(); return c => { for (const t of tg(c)) c.B.buff(t, w === 'attack' ? v : 0, w === 'health' ? v : 0, c.self); };
      }
      if ((m = s.match(new RegExp('^Gain (?:permanent )?\\+(\\d+) attack and \\+(\\d+) health' + TAIL + '$', 'i')))) {
        const a = +m[1], h = +m[2]; return c => c.B.buff(c.self, a, h, c.self);
      }
      if ((m = s.match(new RegExp('^Gain (?:permanent )?\\+(\\d+) (attack|health)' + TAIL + '$', 'i')))) {
        const v = +m[1], w = m[2].toLowerCase(); return c => c.B.buff(c.self, w === 'attack' ? v : 0, w === 'health' ? v : 0, c.self);
      }
      if ((m = s.match(/^Gain \+(\d+)% (attack and health|health|attack)$/i))) {
        const pc = +m[1] / 100, w = m[2].toLowerCase();
        return c => c.B.buff(c.self, w.includes('attack') ? Math.floor(c.self.atk * pc) : 0, w.includes('health') ? Math.floor(c.self.hp * pc) : 0, c.self);
      }
      // ---- experience / mana / trumpets
      if ((m = s.match(/^Give (.+?) \+?(\d+) experience$/i)) && (tg = target(m[1]))) { const v = +m[2]; return c => { for (const t of tg(c)) c.B.gainXp(t, v, c.self); }; }
      if ((m = s.match(/^Gain \+?(\d+) experience$/i))) { const v = +m[1]; return c => c.B.gainXp(c.self, v, c.self); }
      if ((m = s.match(/^Give (.+?) \+(\d+) mana$/i)) && (tg = target(m[1]))) { const v = +m[2]; return c => { for (const t of tg(c)) c.B.gainMana(t, v, c.self); }; }
      if ((m = s.match(/^Gain \+?(\d+) (?:bonus )?mana$/i))) { const v = +m[1]; return c => c.B.gainMana(c.self, v, c.self); }
      if ((m = s.match(/^Gain \+(\d+) trumpets?$/i))) { const v = +m[1]; return c => c.B.gainTrumpets(c.self.side, v, c.self); }
      // ---- perks / ailments
      if ((m = s.match(/^Give (?:the )?(.+?) perk to (.+)$/i)) && perkKey(m[1]) && (tg = target(m[2]))) {
        const pk = perkKey(m[1]); return c => { for (const t of tg(c)) c.B.givePerk(t, pk, c.self); };
      }
      if ((m = s.match(/^Give (.+?) to (.+)$/i)) && perkKey(m[1]) && (tg = target(m[2]))) {
        const pk = perkKey(m[1]); return c => { for (const t of tg(c)) c.B.givePerk(t, pk, c.self); };
      }
      if ((m = s.match(/^Give (.+?) (?:the )?(.+?)(?: perk)?(?: until next turn)?$/i)) && perkKey(m[2]) && (tg = target(m[1]))) {
        const pk = perkKey(m[2]); return c => { for (const t of tg(c)) c.B.givePerk(t, pk, c.self); };
      }
      if ((m = s.match(/^Gain (?:the )?(.+?)(?: perk)?(?: until next turn)?$/i)) && perkKey(m[1])) {
        const pk = perkKey(m[1]); return c => c.B.givePerk(c.self, pk, c.self);
      }
      if ((m = s.match(/^Make (.+?) (?:(\d+)x )?(Weak|Spooked|Toasty|Cold|Inked|Crisp|Dazed|Sleepy|Tasty|Silly|Webbed|Confused|Cursed|Bloated|Icky|Cowardly)$/i)) && (tg = target(m[1]))) {
        const ail = AIL[m[3].toLowerCase()]; return c => { for (const t of tg(c)) c.B.givePerk(t, ail, c.self); };
      }
      // ---- summon
      if ((m = s.match(/^Summon (one|two|three) (\d+)\/(\d+) (?:level (\d) )?(.+?)( up front| in the back| in its place| behind this)?( for the (?:enemy|opponent))?$/i))) {
        const cnt = n(m[1]), a = +m[2], h = +m[3], lv = m[4] ? +m[4] : 1;
        let nm = m[5].replace(/ with .*$/, '').replace(/^level \d /, '');
        const pk = petKey(nm);
        if (!pk) return null;
        const where = (m[6] || '').trim(), foe = !!m[7];
        return c => {
          for (let i = 0; i < cnt; i++) {
            const side = foe ? 1 - c.self.side : c.self.side;
            let at = c.ev && c.ev.slot != null && !foe ? c.ev.slot : (c.B.idx(c.self) >= 0 ? c.B.idx(c.self) + (where === 'behind this' ? 1 : 0) : 0);
            if (where === 'up front' || foe) at = 0;
            if (where === 'in the back') at = 99;
            c.B.summon(side, at, pk, { atk: a, hp: h, lvl: lv, src: c.self });
          }
        };
      }
      // ---- shop-only phrasing → no battle effect
      if (/\b(gold|roll|rolls|shop|Stock|sell value|toy|turn number|Choose)\b/.test(s)) return 'shop';
      return null;
    }

    function compileText(text, key) {
      const t = normText(text);
      if (!t) return { fn: null, status: 'none' };
      // whole-text special handled outside
      const sentences = t.split(/(?<=\.)\s+(?=[A-Z])/).map(x => x.replace(/\.$/, '')).filter(Boolean);
      const parts = [];
      let shop = false;
      for (const sen of sentences) {
        if (/^Works /.test(sen)) continue;
        let a = action(sen, key);
        if (!a) {
          // try split on " and " into two actions with shared subject (e.g. "Gain X and +1 health")
          const sp = sen.match(/^(Gain|Give .+?) (.+?) and (.+)$/);
          const halves = sen.split(/ and (?=(?:make|deal|give|gain|summon|remove|push|jump)\b)/i);
          if (halves.length === 2) {
            const a1 = action(halves[0], key), a2 = action(halves[1].replace(/^./, ch => ch.toUpperCase()), key);
            if (a1 && a2 && a1 !== 'shop' && a2 !== 'shop') a = c => { a1(c); a2(c); };
            else if (a1 && a2) a = a1 === 'shop' ? a2 : a1;
          } else if (sp) {
            const a1 = action(sp[1] + ' ' + sp[2], key), a2 = action(sp[1] + ' ' + sp[3], key);
            if (a1 && a2 && a1 !== 'shop' && a2 !== 'shop') a = c => { a1(c); a2(c); };
          }
        }
        if (!a) return { fn: null, status: 'unsupported', why: sen };
        if (a === 'shop') { shop = true; continue; }
        parts.push(a);
      }
      if (!parts.length) return { fn: null, status: shop ? 'shop' : 'none' };
      return { fn: c => { for (const p of parts) p(c); }, status: 'ok' };
    }

    // -------------------------------------------------------------- specials
    const nums = t => (normText(t).match(/\d+/g) || []).map(Number);
    const H = {
      E: c => c.B.enemiesOf(c.self), F: c => c.B.friendsOf(c.self),
      firstE: c => c.B.enemiesOf(c.self)[0],
      jumpToFront: c => c.B.move(c.self, 0, c.self),
      sumAt: (c, id, a, h, o = {}) => {
        const at = c.ev && c.ev.slot != null ? c.ev.slot : Math.max(0, c.B.idx(c.self));
        return c.B.summon(c.self.side, o.at != null ? o.at : at, id, Object.assign({ atk: a, hp: h, src: c.self }, o));
      },
      randomPet: (B, filt) => { const pool = Object.keys(B.D.pets).filter(k => B.D.pets[k].r && filt(B.D.pets[k], k)); return pool.length ? pool[B.rand(pool.length)] : null; },
      corn: (B, p, times, src) => { for (let i = 0; i < times; i++) { if (p.atk <= p.hp) B.buff(p, 1, 0, src); else B.buff(p, 0, 1, src); } },
    };
    const S = {}; // key -> (text, lvl, all3texts) => fn | 'shop' | null
    const opp = c => { const e = H.E(c); const i = Math.max(0, c.B.idx(c.self)); return e[Math.min(i, e.length - 1)]; };

    S.Whale = (t, L) => c => {
      const f = c.B.team(c.self.side); const i = f.indexOf(c.self); const tgt = f[i - 1];
      if (!tgt) return;
      c.self.swallowed = { id: tgt.id, lvl: L, side: c.self.side };
      c.B.rec('swallow', { src: c.self.uid, tgt: tgt.uid });
      tgt.onBoard = false; c.B.compact();
      c.B.emit('FriendFaints', { pet: tgt });
    };
    S.GoblinShark = (t) => { const [lim] = nums(t); return c => {
      const tg = H.E(c).find(e => e.hp <= lim); if (!tg) return;
      c.self.swallowed = { id: tg.id, lvl: tg.lvl, side: tg.side, atk: tg.atk, hp: 1 };
      c.B.rec('swallow', { src: c.self.uid, tgt: tg.uid }); tg.onBoard = false; c.B.compact();
    }; };
    S.Pelican = (t) => c => {
      const f = c.B.team(c.self.side); const i = f.indexOf(c.self);
      const tg = f.slice(0, i).reverse().find(p => c.B.hasPerk(p, 'Strawberry')); if (!tg) return;
      c.self.swallowed = { id: 'Salmon', lvl: tg.lvl, side: c.self.side };
      c.B.rec('swallow', { src: c.self.uid, tgt: tg.uid }); tg.onBoard = false; c.B.compact();
    };
    S.AfricanWildDog = (t) => { const [d] = nums(t); return c => { const e = H.E(c)[1] || H.E(c)[0]; if (e) c.B.jumpAttack(c.self, e, d); }; };
    S.Takhi = (t) => { const [a, h] = nums(t); return c => { const p = H.sumAt(c, 'AfricanWildDog', a, h, { lvl: 1 }); if (p) { const e = c.B.enemiesOf(p)[1] || c.B.enemiesOf(p)[0]; if (e) c.B.jumpAttack(p, e, a); } }; };
    S.AmamiRabbit = (t) => { const [a] = nums(t); return c => { c.B.buff(c.self, a, 0, c.self); const e = H.E(c).sort((x, y) => y.atk - x.atk)[0]; if (e) c.B.jumpAttack(c.self, e); }; };
    S.SnowLeopard = (t) => { const [a, h] = nums(t); return c => { c.B.buff(c.self, a, h, c.self); const e = c.B.pick(c.self, H.E(c), 1, 'enemy')[0]; if (e) c.B.jumpAttack(c.self, e); }; };
    S.SumatranTiger = () => c => { const e = opp(c); if (e) c.B.jumpAttack(c.self, e); };
    S.TasmanianDevil = (t) => c => { const e = H.E(c).sort((x, y) => x.atk - y.atk)[0]; if (e) { c.B.givePerk(e, 'Scared', c.self); c.B.jumpAttack(c.self, e); } };
    S.DarwinsFox = () => c => { const k = c.ev && c.ev.killer; const e = k && c.B.alive(k) && k.side !== c.self.side ? k : H.firstE(c); if (e) c.B.jumpAttack(c.self, e); };
    S.Basilisk = (t) => { const [h] = nums(t); return c => { const f = c.B.team(c.self.side); const i = f.indexOf(c.self); const tg = i > 0 ? f[i - 1] : H.E(c)[0]; if (tg) { c.B.transform(tg, 'Rock', { atk: 1, hp: 1 + h, src: c.self }); } }; };
    S.Cockatrice = (t) => { const [lv] = nums(t); return c => { const tg = H.E(c).slice().reverse().find(e => e.lvl <= lv); if (tg) c.B.transform(tg, 'Rock', { atk: 1, hp: 1, src: c.self }); }; };
    S.Chihuahua = (t, L) => c => { const e = H.E(c).sort((a, b) => b.hp - a.hp)[0]; if (e) c.B.push(e, L, c.self); };
    S.Seahorse = (t, L) => c => { const e = H.E(c).slice(-1)[0]; if (e) c.B.push(e, L, c.self); };
    S.Donkey = (t) => { const [a] = nums(t); return c => { const e = H.E(c).slice(-1)[0]; if (e) { c.B.push(e, 9, c.self); c.B.removeAttack(e, a, c.self); } }; };
    S.Kakapo = () => c => { const e = H.E(c).sort((a, b) => b.atk - a.atk)[0]; if (e) { c.B.givePerk(e, 'Scared', c.self); c.B.push(e, -9, c.self); } };
    S.Crab = (t) => { const [pc] = nums(t); return c => { const m = Math.max(0, ...H.F(c).map(p => p.hp)); c.B.buff(c.self, 0, Math.floor(m * pc / 100), c.self); }; };
    S.Doberman = (t) => { const [a] = nums(t); return c => { c.B.buff(c.self, a, 0, c.self); const me = c.B.tier(c.self); if (H.F(c).every(f => c.B.tier(f) > me)) c.B.givePerk(c.self, 'Coconut', c.self); }; };
    S.Dodo = (t) => { const [pc] = nums(t); return c => { const f = c.B.team(c.self.side); const i = f.indexOf(c.self); if (i > 0) c.B.buff(f[i - 1], Math.floor(c.self.atk * pc / 100), 0, c.self); }; };
    S.Panda = (t) => { const [pc] = nums(t); return c => {
      const f = c.B.team(c.self.side); const i = f.indexOf(c.self); const tg = f[i - 1];
      if (tg) c.B.buff(tg, Math.floor(c.self.atk * pc / 100), Math.floor(c.self.hp * pc / 100), c.self);
      c.self.hp = 0; c.B.rec('remove', { tgt: c.self.uid, dh: 0 });
    }; };
    S.EggLadCovered = (t) => { const [a, h] = nums(t); return c => { const i = c.B.idx(c.self); c.self.hp = 0; c.self.onBoard = false; c.B.compact(); c.B.rec('faint', { tgt: c.self.uid }); c.B.summon(c.self.side, i, 'EggLadCracked', { atk: a, hp: h, src: c.self }); }; };
    S.PygmySeahorse = (t) => { const [a, h] = nums(t); return c => { for (const f of c.B.pick(c.self, H.F(c), 3, 'friend')) c.B.buff(f, a, h, c.self); c.self.onBoard = false; c.B.compact(); c.B.rec('faint', { tgt: c.self.uid }); }; };
    S.LeafySeaDragon = (t) => { const [x, h] = nums(t); return c => { const adj = adjacent(c, 1, false); for (const f of adj) { c.B.gainXp(f, x, c.self); c.B.buff(f, 0, h, c.self); } c.self.onBoard = false; c.B.compact(); c.B.rec('faint', { tgt: c.self.uid }); }; };
    S.Hyena = (t, L) => c => {
      const all = c.B.team(0).concat(c.B.team(1));
      for (const p of all) { const a = p.atk; c.B.setStats(p, p.hp, Math.max(1, a), c.self); }
      if (L >= 2) for (let s = 0; s < 2; s++) { c.B.t[s] = c.B.shuffle(c.B.t[s]); c.B.rec('move', { side: s }); }
    };
    S.Lion = (t) => { const [pc] = nums(t); return c => c.B.buff(c.self, Math.floor(c.self.atk * pc / 100), Math.floor(c.self.hp * pc / 100), c.self); };
    S.Eel = S.Lion;
    S.Lynx = () => c => { const sum = c.B.team(c.self.side).reduce((s, p) => s + p.lvl, 0); const e = c.B.pick(c.self, H.E(c), 1, 'enemy')[0]; if (e) c.B.damage(c.self, e, sum, 'ability'); };
    S.Macaque = (t) => { const [a, h] = nums(t); return c => H.sumAt(c, 'Orangutan', a, h, { at: c.B.idx(c.self) + 1, perk: c.self.perk && c.self.perk.id }); };
    S.OrchidMantis = (t) => { const [pc] = nums(t); return c => H.sumAt(c, 'OrchidMantis', Math.max(1, Math.floor(c.self.atk * pc / 100)), Math.max(1, Math.floor(c.self.hp * pc / 100)), { at: c.B.idx(c.self) + 1, flags: { noAbility: true } }); };
    S.Robin = (t) => { const [a, h] = nums(t); return c => H.sumAt(c, 'Nest', a, h, { at: c.B.idx(c.self) + 1, perk: 'Egg' }); };
    S.Tapir = (t) => { const [a, h] = nums(t); return c => { const b = H.F(c).filter(p => p.id !== 'Tapir').slice(-1)[0]; if (b) H.sumAt(c, b.id, a, h, { at: 99, lvl: 1 }); }; };
    S.Tadpole = (t) => { const [x] = nums(t); return c => { c.B.transform(c.self, 'Frog', { lvl: 1, src: c.self }); c.B.gainXp(c.self, x, c.self); }; };
    S.TaitaShrew = () => c => c.B.transform(c.self, 'Weasel', { lvl: 1, src: c.self });
    S.Tsuchinoko = (t) => { const [x] = nums(t); return c => { H.jumpToFront(c); c.B.emit('Jumped', { pet: c.self }); c.B.gainXp(c.self, x, c.self); }; };
    S.SwordFish = () => c => { const e = H.E(c).sort((a, b) => b.hp - a.hp)[0]; const d = c.self.atk; if (e) c.B.damage(c.self, e, d, 'ability'); c.B.damage(c.self, c.self, d, 'ability'); };
    S.Sunfish = (t) => { const [d] = nums(t); return c => { const f = c.B.team(c.self.side); const i = f.indexOf(c.self); for (const p of f.slice(0, i).concat(H.E(c))) c.B.damage(c.self, p, d, 'ability'); }; };
    S.TarantulaHawk = (t) => { const [h] = nums(t); return c => { const k = Math.max(1, Math.floor(c.self.atk / 10)); for (let i = 0; i < k; i++) for (const e of H.E(c)) c.B.removeHealth(e, h, c.self); }; };
    S.Tarasque = (t) => { const [pc] = nums(t); return c => {
      const all = c.B.team(0).concat(c.B.team(1)).filter(p => p !== c.self);
      let pa = 0, ph = 0;
      for (const p of all) { const da = Math.floor(p.atk * pc / 100), dh = Math.floor(p.hp * pc / 100); pa += da; ph += dh; c.B.setStats(p, p.atk - da, p.hp - dh, c.self); }
      const ea = Math.floor(pa / all.length || 0), eh = Math.floor(ph / all.length || 0);
      for (const p of all) c.B.buff(p, ea, eh, c.self);
    }; };
    S.Woodpecker = (t) => { const [d, k] = nums(t); return c => {
      for (let r = 0; r < (k || 2); r++) {
        const f = c.B.team(c.self.side); const i = f.indexOf(c.self);
        const line = f.slice(0, Math.max(0, i)).reverse().concat(H.E(c)).slice(0, 2);
        for (const p of line) c.B.damage(c.self, p, p.side !== c.self.side ? d * 2 : d, 'ability');
      }
    }; };
    S.FruitFly = (t) => { const [d] = nums(t); return c => { const e = opp(c); if (e) { c.B.givePerk(e, 'BlueBerries', c.self); c.B.damage(c.self, e, d, 'ability'); } }; };
    S.Gerenuk = () => c => { const e = H.E(c).filter(x => x.perk && !c.B.isAilment(x.perk.id)).sort((a, b) => ((c.B.D.foods[b.perk.id] || {}).t || 0) - ((c.B.D.foods[a.perk.id] || {}).t || 0))[0]; if (e) c.B.losePerk(e, c.self); };
    S.HighlandCow = (t) => { const [a, b] = nums(t); return c => c.B.gainTrumpets(c.self.side, a + Math.floor(c.self.hp / 3), c.self); };
    S.Hoatzin = (t) => { const [k] = nums(t); return c => { let cnt = 0; for (const f of H.F(c)) if (c.B.hasPerk(f, 'Strawberry')) { c.B.losePerk(f, c.self); cnt++; } c.B.gainTrumpets(c.self.side, cnt * k, c.self); }; };
    S.HonduranWhiteBat = (t) => { const [k] = nums(t); return c => { const tiers = new Set(H.F(c).map(p => c.B.tier(p))); c.B.gainTrumpets(c.self.side, tiers.size * k, c.self); }; };
    S.GlaucusAtlanticus = (t) => { const [tr, mn] = nums(t); return c => { const f = c.B.team(c.self.side); const i = f.indexOf(c.self); c.B.gainTrumpets(c.self.side, tr * (f.length - i - 1), c.self); for (const p of f.slice(0, i)) c.B.gainMana(p, mn, c.self); }; };
    S.Mandrake = (t) => { const [tier] = nums(t); return c => { const pool = H.E(c).filter(e => c.B.tier(e) <= tier); const fp = pool.filter(e => /Faint/.test((c.B.A[e.id] || {}).trigger || '')); const e = (fp.length ? c.B.pick(c.self, fp, 1, 'enemy') : c.B.pick(c.self, pool, 1, 'enemy'))[0]; if (e) c.B.givePerk(e, 'Deaf', c.self); }; };
    S.Nudibranchs = (t) => { const [a, h] = nums(t); return c => { const ids = c.B.team(c.self.side).map(p => p.id); if (new Set(ids).size === ids.length) c.B.buff(c.self, a, h, c.self); }; };
    S.Ogopogo = (t) => { const [x] = nums(t); return c => { const f = H.F(c)[0]; if (f) c.B.gainXp(f, x, c.self); }; };
    S.PacificFanfish = (t) => { const [a, h] = nums(t); return c => { const k = H.F(c).filter(p => p.lvl >= 3).length; c.B.buff(c.self, a * k, h * k, c.self); }; };
    S.Pangasius = () => c => { const e = H.firstE(c); if (!e) return; const own = c.self.perk && c.B.isAilment(c.self.perk.id) ? c.self.perk.id : 'Scared'; c.B.givePerk(e, own, c.self); };
    S.Roadrunner = (t) => { const [a] = nums(t); return c => { const f = c.B.team(c.self.side); const i = f.indexOf(c.self); const tg = f[i - 1]; if (tg) { c.B.givePerk(tg, 'Strawberry', c.self); c.B.buff(tg, a, 0, c.self); } }; };
    S.Roc = (t) => { const [m, k] = nums(t); return c => { const f = c.B.team(c.self.side); const i = f.indexOf(c.self); const ahead = f.slice(0, i).reverse(); if (!ahead.length) return; for (let r = 0; r < (k || 3) + 1; r++) c.B.gainMana(ahead[r % ahead.length], m, c.self); }; };
    S.Thunderbird = (t) => { const [m] = nums(t); return c => { const f = c.B.team(c.self.side); const i = f.indexOf(c.self); if (i >= 2) c.B.gainMana(f[i - 2], m, c.self); }; };
    S.Sleipnir = (t) => { const [m, per] = nums(t); return c => { const f = H.F(c)[0]; if (f) c.B.gainMana(f, m * Math.floor(c.self.atk / (per || 2)), c.self); }; };
    S.SalmonofWisdom = (t) => { const [x] = nums(t); return c => { for (const p of H.F(c).slice(0, 2).concat(H.E(c).slice(0, 2))) c.B.gainXp(p, x, c.self); }; };
    S.Stegosaurus = (t) => { const [a, h] = nums(t); return c => { const f = c.B.pick(c.self, H.F(c).filter(p => !p.perk), 1, 'friend')[0]; if (f) c.B.buff(f, a, h, c.self); }; };
    S.TerrorBird = (t) => c => { const f = H.F(c).find(p => c.B.hasPerk(p, 'Strawberry')); if (f) c.B.givePerk(f, 'Peanut', c.self); };
    S.Therizinosaurus = (t) => c => { const f = H.F(c).find(p => c.B.hasPerk(p, 'Strawberry')); if (f) c.B.givePerk(f, 'Coconut', c.self); };
    S.TreeKangaroo = (t, L) => c => {
      const e = H.E(c).filter(x => !x.perk).slice(-1)[0]; if (!e) return;
      c.B.givePerk(e, 'Silly', c.self);
      const ab = c.B.A[e.id]; if (!ab || !ab.levels[e.lvl - 1] || e.id === 'TreeKangaroo') return;
      for (let i = 0; i < L; i++) { c.B.rec('ability', { src: e.uid, id: e.id, trig: 'Activated' }); ab.levels[e.lvl - 1]({ B: c.B, self: e, ev: {}, lvl: e.lvl }); }
    };
    S.VampireParrot = (t) => { const [a, h] = nums(t); return c => { const s = new Set(H.F(c).filter(p => p.perk && c.B.isAilment(p.perk.id)).map(p => p.perk.id)); c.B.buff(c.self, a * s.size, h * s.size, c.self); }; };
    S.Werewolf = (t) => { const [pc, mana] = nums(t); return c => { if (c.B.opts.turn % 2 === 0) c.B.buff(c.self, Math.floor(c.self.atk * pc / 100), Math.floor(c.self.hp * pc / 100), c.self); else c.B.gainMana(c.self, mana, c.self); }; };
    S.WhiteBelliedHeron = () => c => { const f = c.B.team(c.self.side); const i = f.indexOf(c.self); if (i > 0) c.B.givePerk(f[i - 1], 'MeatBone', c.self); };
    S.FarmerPig = (t) => c => { for (const f of adjacent(c, 1, false)) H.corn(c.B, f, 2, c.self); };
    S.FarmerMouse = (t) => c => { const f = target('nearest friend behind')(c)[0]; if (f) H.corn(c.B, f, 1, c.self); };
    S.FarmerCrow = (t) => { const [k] = nums(t); return c => { const f = target('nearest friend behind')(c)[0]; if (f) H.corn(c.B, f, 3 * (k || 3), c.self); }; };
    S.FarmerCat = () => 'shop';
    S.Pony = () => c => { const f = target('nearest friend behind')(c)[0]; if (f) c.B.buff(f, 2, 2, c.self); };
    S.RedLippedBatfish = () => c => { const e = opp(c); if (!e) return; const k = H.randomPet(c.B, d => d.t === Math.max(1, c.B.tier(e) - 1) && /Faint/.test(d.tr)); if (k) c.B.transform(e, k, { base: true, lvl: 1, src: c.self }); };
    S.RolowayMonkey = () => c => { const f = c.B.team(c.self.side); const i = f.indexOf(c.self); const ahead = f.slice(0, i).reverse().slice(0, 2); ahead.forEach((p, j) => { const k = H.randomPet(c.B, d => d.t === 2 + j && /Faint/.test(d.tr)); if (k) c.B.transform(p, k, { base: true, lvl: 1, src: c.self }); }); };
    S.SilkySifaka = () => c => { const f = c.B.team(c.self.side); const i = f.indexOf(c.self); for (const p of f.slice(i + 1, i + 3)) { const k = H.randomPet(c.B, d => d.t === 6 && /Faint/.test(d.tr)); if (k) c.B.transform(p, k, { base: true, lvl: 1, src: c.self }); } };
    S.IriomoteCat = () => c => { const k = H.randomPet(c.B, (d, kk) => d.t === 1 && d.tr !== 'Shop' && kk !== 'IriomoteCat'); if (k) c.B.transform(c.self, k, { lvl: 1, src: c.self }); };
    S.GoldenTamarin = () => c => { const k = H.randomPet(c.B, d => d.t === 5 && d.tr === 'SOB'); if (k) c.B.transform(c.self, k, { lvl: 1, src: c.self }); };
    S.GiantOtter = (t) => { const [a, h] = nums(t); return c => { const fs = H.F(c); for (const f of fs) c.B.buff(f, a, h, c.self); (c.B.giantOtter = c.B.giantOtter || []).push({ pets: fs, a, h }); }; };
    S.BayCat = () => c => {
      const k = H.randomPet(c.B, d => d.t === 4 && d.tr === 'SOB'); if (!k) return;
      const p = H.sumAt(c, k, c.B.D.pets[k].a, c.B.D.pets[k].h, { lvl: 1 });
      if (p && c.B.A[k] && c.B.A[k].levels[0]) { c.B.rec('ability', { src: p.uid, id: k, trig: 'Activated' }); c.B.A[k].levels[0]({ B: c.B, self: p, ev: {}, lvl: 1 }); }
    };
    S.Eagle = (t) => { const [a, h] = nums(t); return c => { const k = H.randomPet(c.B, d => d.t === Math.min(6, c.B.tier(c.self) + 1)); if (k) H.sumAt(c, k, a, h, { lvl: 1 }); }; };
    S.Spider = (t) => { const [tier, a, h] = nums(t); return c => { const k = H.randomPet(c.B, d => d.t === tier); if (k) H.sumAt(c, k, a, h, { lvl: 1 }); }; };
    S.Stork = (t) => { const [a, h] = nums(t); return c => { const k = H.randomPet(c.B, d => d.t === Math.max(1, c.B.tier(c.self) - 1)); if (k) H.sumAt(c, k, a, h, { lvl: 1 }); }; };
    S.HarpyEagle = (t) => { const [a, h, tier] = nums(t); return c => { const k = H.randomPet(c.B, d => d.t === (tier || 1)); if (k) H.sumAt(c, k, a, h, { at: c.B.idx(c.self) + 1 }); }; };
    S.Kappa = (t) => { const [tier, a, h] = nums(t); return c => { for (const side of [c.self.side, 1 - c.self.side]) { const k = H.randomPet(c.B, d => d.t === tier); if (k) c.B.summon(side, 0, k, { atk: a, hp: h, src: c.self }); } }; };
    S.Anteater = (t) => { const [a, h, lv] = nums(t); return c => H.sumAt(c, 'Ant', a, h, { lvl: lv || 3 }); };
    S.Cockroach = (t) => { const [a, h, x] = nums(t); return c => { const p = H.sumAt(c, 'CockroachToken', a, h); if (p) c.B.gainXp(p, x, c.self); }; };
    S.BelugaSturgeon = (t) => { const [a, h] = nums(t); return c => H.sumAt(c, 'Dolphin', a, h, { at: 99, perk: 'RiceBall' }); };
    S.Deer = (t) => { const [a, h] = nums(t); return c => H.sumAt(c, 'Bus', a, h, { perk: 'Chili' }); };
    S.Hydra = (t) => { const [a, h, per] = nums(t); return c => { const k = Math.floor(c.self.atk / (per || 10)); for (let i = 0; i < k; i++) H.sumAt(c, 'HydraHead', a, h); }; };
    S.Nessie = (t) => { const [a, h] = nums(t); return c => { const first = !c.B.boat || !c.B.boat[c.self.side]; (c.B.boat = c.B.boat || [false, false])[c.self.side] = true; const b = first ? 1 + c.B.opts.rolls : 0; H.sumAt(c, 'Bus', a + b, h + b); }; };
    S.NightCrawler = (t) => { const [a] = nums(t); return c => H.sumAt(c, 'DayCrawler', a, 1); };
    S.Osprey = (t) => { const [a, h] = nums(t); return c => H.sumAt(c, 'Groundhog', a, h); };
    S.Hirola = (t) => { const [a, h] = nums(t); return c => H.sumAt(c, 'EthiopianWolf', a, h); };
    S.PatagonianMara = (t) => { const [tr] = nums(t); return c => { c.B.gainTrumpets(c.self.side, tr, c.self); c.B.summonRetriever(c.self.side); }; };
    S.Pteranodon = (t) => { const [a, h] = nums(t); return c => { const it = c.ev.pet; if (!it || it.id === 'Pteranodon') return; c.B.summon(c.self.side, c.B.idx(c.self) + 1, it.id, { atk: a, hp: h, lvl: it.lvl, src: c.self }); }; };
    S.Fly = (t) => { const [a, h] = nums(t); return c => { const it = c.ev.pet; if (!it || it.id === 'FlyToken') return; c.B.summon(c.self.side, c.ev.slot, 'FlyToken', { atk: a, hp: h, src: c.self }); }; };
    S.ShimaEnaga = (t) => { const [a, h] = nums(t); return c => { const it = c.ev.pet; if (!it || !(it.perk && it.perk.id === 'Strawberry')) return; const k = H.randomPet(c.B, d => true); if (k) c.B.summon(c.self.side, c.ev.slot, k, { atk: a, hp: h, src: c.self }); }; };
    S.Rat = (t) => { const [a, h] = nums(t); return c => c.B.summon(1 - c.self.side, 0, 'RatToken', { atk: a, hp: h, src: c.self, silent: true }); };
    S.Rooster = (t) => { const [hp, pc] = nums(t); return c => H.sumAt(c, 'Chick', Math.max(1, Math.floor(c.self.atk * (pc || 50) / 100)), hp); };
    S.SabertoothTiger = (t) => { const [a, h] = nums(t); return c => H.sumAt(c, 'Mammoth', c.B.D.pets.Mammoth.a + a * c.self.hurtCount, c.B.D.pets.Mammoth.h + h * c.self.hurtCount); };
    S.Slime = (t) => { const [a, h] = nums(t); return c => { const k = Math.floor(c.B.opts.battles / 2); for (let i = 0; i < k; i++) H.sumAt(c, 'SmallerSlime', a, h); }; };
    S.Slug = (t) => { const [a, h] = nums(t); return c => H.sumAt(c, 'SlugToken', a, h); };
    S.SlugToken = (t) => { const [a, h] = nums(t); return c => H.sumAt(c, 'SlugToken2', a, h); };
    S.Tardigrade = (t) => { const [a, h] = nums(t); return c => { const p = H.sumAt(c, 'Tardigrade', a, h, { lvl: 1 }); if (p) c.B.givePerk(p, 'Deaf', c.self); }; };
    S.Wolf = (t) => { const [k, a, h] = [3].concat(nums(t)); return c => { for (let i = 0; i < k; i++) H.sumAt(c, 'Pig', a, h); }; };
    S.Sheep = (t) => { const [a, h] = nums(t); return c => { H.sumAt(c, 'Ram', a, h); H.sumAt(c, 'Ram', a, h); }; };
    S.Platypus = (t) => { const [a, h] = nums(t); return c => { H.sumAt(c, 'Duck', a, h, { lvl: 1 }); H.sumAt(c, 'Beaver', a, h, { lvl: 1 }); }; };
    S.Mole = (t) => { const [a, h] = nums(t); return c => { const fs = c.B.team(c.self.side).filter(p => p.perk && !c.B.isAilment(p.perk.id)).slice(0, 2); if (fs.length < 2) return; for (const f of fs) c.B.losePerk(f, c.self); H.sumAt(c, 'Mole', a, h); }; };
    S.Badger = (t) => { const [pc] = nums(t); return c => { const d = Math.max(1, Math.floor(c.self.atk * pc / 100)); for (const p of adjacent(c, 1, true)) c.B.damage(c.self, p, d, 'ability'); }; };
    S.Lionfish = (t) => { const [d] = nums(t); return c => { const k = 1 + Math.floor(c.self.atk / 10); for (let i = 0; i < k; i++) { const e = c.B.pick(c.self, H.E(c), 1, 'enemy')[0]; if (e) c.B.damage(c.self, e, d, 'ability'); } }; };
    S.Warthog = (t) => { const [a, h, per] = nums(t); return c => { const k = Math.floor(c.self.atk / (per || 3)); for (let i = 0; i < k; i++) { const f = c.B.pick(c.self, H.F(c), 1, 'friend')[0]; if (f) c.B.buff(f, a, h, c.self); } }; };
    S.Tuna = (t) => { const [a, h] = nums(t); return c => { const f = c.B.pick(c.self, H.F(c), 1, 'friend')[0]; if (f) c.B.buff(f, a * c.self.hurtCount, h * c.self.hurtCount, c.self); }; };
    S.Stonefish = () => c => { const k = c.self.killer; if (k && c.B.alive(k)) c.B.damage(c.self, k, c.self.atk, 'ability'); };
    S.Quetzalcoatlus = (t) => { const [a, h] = nums(t); return c => { const k = c.self.killer; if (!k) return; for (const p of c.B.team(k.side)) c.B.buff(p, a, h, c.self); }; };
    S.FireAnt = () => c => { const f = target('highest tier friend')(c)[0]; if (f) c.B.buff(f, c.self.atk, 0, c.self); };
    S.SpinyBushViper = (t) => { const [d] = nums(t); return c => { const sl = c.ev.slot || 0; for (const e of c.B.pick(c.self, H.E(c), 2, 'enemy')) { const dist = sl + 1 + c.B.idx(e); c.B.damage(c.self, e, d * dist, 'ability'); } }; };
    S.Tatzelwurm = (t) => { const [d] = nums(t); return c => { const e = H.firstE(c); if (e) c.B.damage(c.self, e, c.ev.pet && c.ev.pet.lvl === 3 ? d * 2 : d, 'ability'); }; };
    S.ThornyDragon = (t) => { const [d] = nums(t); return c => { const e = H.E(c); const pr = e.filter(x => x.perk && c.B.isAilment(x.perk.id)); const tg = c.B.pick(c.self, pr.length ? pr : e, 1, 'enemy')[0]; if (tg) c.B.damage(c.self, tg, d, 'ability'); }; };
    S.Tucuxi = (t) => { const [a, h] = nums(t); return c => { const b = H.F(c).slice(-1)[0]; if (b) { c.B.move(b, 0, c.self); c.B.buff(b, a, h, c.self); } }; };
    S.YellowBoxFish = (t) => { const [v] = nums(t); return c => { const all = c.B.team(0).concat(c.B.team(1)); const tg = all.sort((a, b) => b.hp - a.hp)[0]; if (tg) c.B.setStats(tg, v, v, c.self); }; };
    S.TogianBabirusa = (t) => { const [h] = nums(t); return c => { const e = c.B.pick(c.self, H.E(c), 1, 'enemy')[0]; if (e) c.B.buff(e, 0, h, c.self); }; };
    S.Phoenix = (t) => { const [a, h] = nums(t).slice(-2); return c => { for (const p of c.B.pick(c.self, c.B.team(0).concat(c.B.team(1)), 3, 'any')) c.B.givePerk(p, 'Burn', c.self); H.sumAt(c, 'BabyPhoenix', a, h); }; };
    S.SatanicLeafTailedGecko = () => c => { const ails = ['Weak', 'Scared', 'Toasty', 'Frozen', 'Ink', 'Burn', 'Deaf', 'Drowsy', 'Tasty', 'Silly', 'Web', 'Bloated', 'Acid']; for (const p of c.B.pick(c.self, c.B.team(0).concat(c.B.team(1)), 3, 'any')) c.B.givePerk(p, ails[c.B.rand(ails.length)], c.self); };
    S.Walrus = () => c => { const f = c.B.pick(c.self, H.F(c), 1, 'friend')[0]; if (f) c.B.givePerk(f, 'PeanutButter', c.self); };
    S.Microbe = () => c => { for (const p of adjacent(c, 3, true)) c.B.givePerk(p, 'Weak', c.self); };
    S.Xenomorph = () => c => { for (const p of adjacent(c, 1, true)) c.B.givePerk(p, 'Acid', c.self); };
    S.PeacockSpider = () => c => { for (const p of adjacent(c, 1, true).filter(x => !x.perk)) c.B.givePerk(p, 'Scared', c.self); };
    S.Bear = () => c => { for (const p of adjacent(c, 1, true)) c.B.givePerk(p, 'Honey', c.self); };
    S.Cuddlefish = (t) => { const [h] = nums(t); return c => { const e = H.E(c).slice(-1)[0]; if (e) { c.B.removeHealth(e, h, c.self); if (c.B.alive(e)) c.B.givePerk(e, 'Ink', c.self); } }; };
    S.PiedTamarin = (t) => { const [k, d] = nums(t); return c => { if (!c.B.spendTrumpets(c.self.side, k)) return; for (const e of c.B.pick(c.self, H.E(c), c.lvl, 'enemy')) c.B.damage(c.self, e, d, 'ability'); }; };
    S.Squid = (t) => { const [k] = nums(t); return c => { if (!c.B.spendTrumpets(c.self.side, k)) return; const e = H.firstE(c); if (e) c.B.givePerk(e, 'Ink', c.self); }; };
    S.SurgeonFish = (t) => { const [k, h] = nums(t); return c => { if (c.B.spendTrumpets(c.self.side, k) < k) return; for (const f of target('two nearest friends behind')(c)) c.B.buff(f, 0, h, c.self); }; };
    S.NurseShark = (t) => { const [k] = nums(t); return c => { const s = c.B.spendTrumpets(c.self.side, k); const e = c.B.pick(c.self, H.E(c), 1, 'enemy')[0]; if (s && e) c.B.damage(c.self, e, s * 3, 'ability'); }; };
    S.GiantIsopod = (t) => { const [h] = nums(t); return c => { for (const f of H.F(c)) c.B.buff(f, 0, h, c.self); }; };
    S.Vaquita = (t) => { const [pc, min] = nums(t); return c => c.B.gainTrumpets(c.self.side, Math.max(min, Math.floor(c.B.trumpets[c.self.side] * pc / 100)), c.self); };
    S.Maltese = (t) => { const [k] = nums(t); return c => { const s = c.B.spendTrumpets(c.self.side, k); const fs = H.F(c); if (!fs.length) return; let m = s * 2; let i = 0; while (m-- > 0) c.B.gainMana(fs[i++ % fs.length], 1, c.self); }; };
    S.Namazu = () => c => { const m = c.self.mana; c.self.mana = 0; c.B.gainTrumpets(c.self.side, m, c.self); };
    S.Gargoyle = (t) => { const [h] = nums(t); return c => { const f = target('nearest friend behind')(c)[0]; const m = c.self.mana; c.self.mana = 0; if (f) c.B.buff(f, 0, h + m * c.lvl, c.self); }; };
    S.Akhlut = (t) => { const [m, a, h] = nums(t); return c => { if (c.self.mana < m) return; c.self.mana -= m; const f = target('nearest friend behind')(c)[0]; if (f) c.B.buff(f, a, h, c.self); }; };
    S.Calygreyhound = (t) => { const [per] = nums(t); return c => { const m = c.self.mana; c.self.mana = 0; for (const e of H.E(c).sort((a, b) => b.hp - a.hp).slice(0, 2)) c.B.removeHealth(e, m * (per || 1), c.self); }; };
    S.Lusca = (t) => { const [per] = nums(t); return c => { const m = c.self.mana; c.self.mana = 0; const e = c.B.pick(c.self, H.E(c), 1, 'enemy')[0]; if (e) { c.B.removeAttack(e, m * per, c.self); c.B.removeHealth(e, m * per, c.self); } }; };
    S.Kitsune = (t) => { const [plus] = nums(t); return c => { const f = c.B.team(c.self.side); const i = f.indexOf(c.self); const tg = f[i - 1]; if (!tg) return; let m = plus; for (const p of f) if (p !== tg) { m += p.mana; p.mana = 0; } c.B.gainMana(tg, m, c.self); }; };
    S.Caladrius = (t) => { const [m, a, h] = nums(t); return c => { const it = c.ev.pet; if (!it || it.mana < m) return; it.mana -= m; c.B.buff(it, a, h, c.self); }; };
    S.RuspolisTuraco = (t) => { const [m] = nums(t); return c => { const it = c.ev.pet; if (!it || !c.B.hasPerk(it, 'Strawberry')) return; c.B.losePerk(it, c.self); c.B.gainMana(it, m, c.self); }; };
    S.WhiteBootedRacketTail = (t) => { const [a] = nums(t); return c => { const it = c.ev.pet; if (!it) return; c.B.givePerk(it, 'Strawberry', c.self); c.B.buff(it, a, 0, c.self); }; };
    S.Jackalope = (t) => { const [a] = nums(t); return c => { const it = c.ev.pet; if (it) c.B.buff(it, it.flags.jumped ? a * 2 : a, 0, c.self); }; };
    S.LovelandFrogman = (t) => { const [a, h] = nums(t); return c => { const it = c.ev.pet; if (it && !it.flags.frogman) { it.flags.frogman = true; c.B.buff(it, a, h, c.self); } }; };
    S.MarineIguana = () => c => { const it = c.ev.pet; if (it) c.B.givePerk(it, 'Melon', c.self); };
    S.AxehandleHound = (t) => { const [d] = nums(t); return c => { const ids = H.E(c).map(p => p.id); if (new Set(ids).size < ids.length) for (const e of H.E(c)) c.B.damage(c.self, e, d, 'ability'); }; };
    S.Boitata = () => c => { const t = c.ev && c.ev.target; const e = t && c.B.alive(t) ? t : H.firstE(c); if (e) c.B.givePerk(e, 'Burn', c.self); };
    S.Dunkleosteus = (t) => c => { if (!c.self.perk || !c.B.isAilment(c.self.perk.id)) return; const a = c.B.losePerk(c.self, c.self); for (const e of H.E(c).slice(0, 2)) c.B.givePerk(e, a, c.self); };
    S.Hare = () => c => { const e = c.B.pick(c.self, H.E(c).filter(x => x.perk && !c.B.isAilment(x.perk.id)), 1, 'enemy')[0]; if (e) c.B.givePerk(c.self, e.perk.id, c.self); };
    S.Mandarinfish = (t) => { const [a, h] = nums(t); return c => { if (c.self.perk && c.B.isAilment(c.self.perk.id)) { c.B.losePerk(c.self, c.self); c.B.buff(c.self, a, h, c.self); } }; };
    S.Racoon = () => c => { const t = c.ev && c.ev.target; const e = t && c.B.alive(t) ? t : H.firstE(c); if (e && e.perk && !c.B.isAilment(e.perk.id)) { const pk = c.B.losePerk(e, c.self); c.B.givePerk(c.self, pk, c.self); } };
    S.SakerFalcon = (t) => { const [a, h] = nums(t); return c => { if (H.E(c).length > c.B.team(c.self.side).length) c.B.buff(c.self, a, h, c.self); }; };
    S.Toucan = (t) => { const [tier] = nums(t); return c => { const pk = c.self.perk && c.self.perk.id; if (!pk || c.B.isAilment(pk)) return; const f = target('nearest friend behind')(c)[0]; if (f) c.B.givePerk(f, pk, c.self); }; };
    S.Wildebeest = (t) => { const [k] = nums(t); return c => { if (c.B.spendTrumpets(c.self.side, k) >= k) c.B.givePerk(c.self, 'Coconut', c.self); }; };
    S.Wombat = () => c => { const e = H.E(c).find(x => /Faint/.test((c.B.A[x.id] || {}).trigger || '')); if (e) c.B.transform(c.self, e.id, { lvl: 1, src: c.self }); };
    S.AntLion = (t) => { const [d] = nums(t); return c => { H.jumpToFront(c); c.B.emit('Jumped', { pet: c.self }); for (const e of H.E(c).slice(0, 2)) c.B.damage(c.self, e, d, 'ability'); }; };
    S.DoorHeadAnt = (t) => { const [h] = nums(t); return c => { H.jumpToFront(c); c.B.emit('Jumped', { pet: c.self }); c.B.buff(c.self, 0, h, c.self); }; };
    S.DropBear = (t) => { const [d] = nums(t); return c => { H.jumpToFront(c); c.B.emit('Jumped', { pet: c.self }); const e = H.E(c).slice(-1)[0]; if (e) c.B.damage(c.self, e, d, 'ability'); }; };
    S.Headcrab = (t) => { const [a] = nums(t); return c => { H.jumpToFront(c); c.B.emit('Jumped', { pet: c.self }); c.B.buff(c.self, a, 0, c.self); c.B.givePerk(c.self, 'Melon', c.self); }; };
    S.SouthernRockhopperPenguin = (t) => { const [tr] = nums(t); return c => { H.jumpToFront(c); c.B.emit('Jumped', { pet: c.self }); c.B.gainTrumpets(c.self.side, tr, c.self); }; };
    S.Emu = (t) => { const [h] = nums(t); return c => { const f = target('nearest friend ahead')(c)[0] || H.F(c)[0]; if (f) { c.B.buff(f, 0, h, c.self); c.B.move(f, 0, c.self); } }; };
    S.Cerberus = (t) => { const [a, h, lv] = nums(t); return c => c.B.summon(c.self.side, 0, 'FirePup', { atk: a, hp: h, lvl: lv || 3, src: c.self }); };
    S.AmazonRiverDolphin = (t) => { const [d, a] = nums(t); return c => { const tg = c.ev.target; if (tg && c.B.alive(tg)) c.B.damage(c.self, tg, d, 'ability'); else c.B.buff(c.self, a || d, 0, c.self); }; };
    S.AtlanticPuffin = (t) => { const [d] = nums(t); return c => { const it = c.ev.pet; if (!it || !c.B.hasPerk(it, 'Strawberry')) return; c.B.losePerk(it, c.self); const e = H.E(c).slice(-1)[0]; if (e) c.B.damage(c.self, e, d, 'ability'); }; };
    S.Minotaur = (t) => { const [a, h] = nums(t); return c => { const l = (c.ev.pet || {}).lvl || 1; c.B.buff(c.self, a * l, h * l, c.self); }; };
    S.SpiderCrab = (t) => { const [h] = nums(t); return c => { const it = c.ev.pet; if (it && c.B.alive(it)) { c.B.buff(it, 0, h, c.self); c.B.move(it, 99, c.self); } }; };
    S.Velociraptor = (t) => { const [a, h] = nums(t); return c => { const f = c.B.team(c.self.side); const i = f.indexOf(c.self); const s = f.slice(0, i).reverse().find(p => c.B.hasPerk(p, 'Strawberry')); if (!s) return; c.B.losePerk(s, c.self); for (const p of H.F(c)) c.B.buff(p, a, h, c.self); }; };
    S.GiantSquirrel = () => c => { const pk = c.self.perk && c.self.perk.id; if (!pk) return; for (let s = 0; s < 2; s++) { const b = c.B.team(s).slice(-1)[0]; if (b && b !== c.self) c.B.givePerk(b, pk, c.self); } };
    S.EuropeanMink = (t) => { const [a] = nums(t); return c => { for (const p of adjacent(c, 1, false)) c.B.buff(p, a, 0, c.self); }; };
    S.Crane = (t) => { const [a] = nums(t); return c => { const it = c.ev.pet; if (it && c.B.alive(it)) { c.B.givePerk(it, 'Melon', c.self); c.B.buff(it, a, 0, c.self); } }; };
    S.Koala = () => c => { const it = c.ev.pet; if (it && c.B.alive(it)) c.B.givePerk(it, 'Eucalyptus', c.self); };
    S.Toad = () => c => { const it = c.ev.pet; if (it && c.B.alive(it)) c.B.givePerk(it, 'Weak', c.self); };
    S.Porcupine = (t) => { const [d] = nums(t); return c => { const s = c.ev.src; if (s && s.side !== c.self.side && c.B.alive(s)) c.B.damage(c.self, s, d, 'ability'); }; };
    S.GeometricTortoise = (t) => { const [pc] = nums(t); return c => { const d = Math.floor((c.ev.n || 0) * pc / 100); const e = c.B.pick(c.self, H.E(c), 1, 'enemy')[0]; if (e && d > 0) c.B.damage(c.self, e, d, 'ability'); }; };
    S.GreatPotoo = (t) => { const [h] = nums(t); return c => { if (!c.B.anyAttacked) c.B.buff(c.self, 0, h, c.self); }; };
    S.Amargasaurus = (t) => { const [cap] = nums(t); return c => { const it = c.ev.pet; if (!it || !c.B.alive(it)) return; const used = c.self.flags.restored || 0; const h = Math.min(c.ev.n || 0, cap - used); if (h > 0) { c.self.flags.restored = used + h; c.B.buff(it, 0, h, c.self); } }; };
    S.FairyArmadillo = (t) => { const [h] = nums(t); return c => { if (!c.B.alive(c.self)) return; c.B.transform(c.self, 'FairyArmadilloBall', { src: c.self }); c.B.buff(c.self, 0, h, c.self); }; };
    S.Lizard = (t) => { const [a, h] = nums(t); return c => H.sumAt(c, 'LizardToken', a, h, { at: c.B.idx(c.self) + 1 }); };
    S.EgyptianVulture = () => c => { const f = c.B.team(c.self.side); const i = f.indexOf(c.self); const tg = f.slice(i + 1).find(p => /Faint/.test((c.B.A[p.id] || {}).trigger || '')); if (!tg) return; const ab = c.B.A[tg.id]; if (!ab.levels[tg.lvl - 1]) return; c.B.rec('ability', { src: tg.uid, id: tg.id, trig: 'Activated' }); ab.levels[tg.lvl - 1]({ B: c.B, self: tg, ev: { slot: c.B.idx(tg) + 1 }, lvl: tg.lvl }); };
    S.Falcon = (t) => { const [a, h] = nums(t); return c => { const it = c.ev.pet; if (!it || it.id === 'Falcon') return; c.B.summon(c.self.side, c.B.idx(c.self) + 1, it.id, { atk: a, hp: h, lvl: 1, src: c.self }); }; };
    S.Rhino = (t) => { const [d] = nums(t); return c => { const e = H.firstE(c); if (e) c.B.damage(c.self, e, c.B.tier(e) === 1 ? d * 2 : d, 'ability'); }; };
    S.Alpaca = (t) => { const [x] = nums(t); return c => { const it = c.ev.pet; if (it && it.id !== 'Alpaca') c.B.gainXp(it, x * 3, c.self); }; };
    S.Amalgam = (t) => { const [a, m] = nums(t); return c => { const it = c.ev.pet; if (!it) return; c.B.buff(it, a, 0, c.self); c.B.gainMana(it, m, c.self); c.B.givePerk(it, 'Scared', c.self); }; };
    S.BabyCthulhu = (t) => { const [d] = nums(t); return c => { for (const p of c.B.team(0).concat(c.B.team(1))) if (p !== c.self) c.B.damage(c.self, p, p.side !== c.self.side ? d * 2 : d, 'ability'); }; };
    S.GermanShepard = (t) => { const [pc] = nums(t); return c => { const it = c.ev.pet; if (it) c.B.buff(it, Math.floor(c.self.atk * pc / 100), 0, c.self); }; };
    S.QueenBee = (t) => { const [a, h] = nums(t); return c => { const it = c.ev.pet; if (!it) return; c.B.buff(it, a, h, c.self); }; };
    S.Salmon = (t) => { const [d, per] = nums(t); return c => { const k = Math.max(1, Math.floor(c.self.hp / (per || 25))); for (let i = 0; i < k; i++) { const e = c.B.pick(c.self, H.E(c), 1, 'enemy')[0]; if (e) c.B.damage(c.self, e, d, 'ability'); } }; };
    S.Seagull = () => c => { const it = c.ev.pet; if (it && c.self.perk && !c.B.isAilment(c.self.perk.id)) c.B.givePerk(it, c.self.perk.id, c.self); };
    S.Pheasant = () => c => { const it = c.ev.pet; if (it) c.B.givePerk(it, 'Strawberry', c.self); };
    S.Axolotl = (t) => { const [a, h] = nums(t); return c => { const it = c.ev.pet; if (it) c.B.buff(it, a, h, c.self); }; };
    S.Unicorn = (t) => { const [a, h] = nums(t); return c => { const it = c.ev.pet; if (it) { c.B.losePerk(it, c.self); c.B.buff(it, a, h, c.self); } }; };
    S.VampireBat = (t) => { const [d] = nums(t); return c => { const it = c.ev.pet; if (it && c.B.alive(it)) { const x = c.B.damage(c.self, it, d, 'ability'); c.B.buff(c.self, 0, x, c.self); } }; };
    S.WhaleShark = (t) => { const [a, h] = nums(t); return c => { c.B.losePerk(c.self, c.self); c.B.buff(c.self, a * 3, h * 3, c.self); }; };
    S.SilkieChicken = () => c => { const it = c.ev.pet; if (!it) return; const pool = Object.keys(c.B.D.foods).filter(k => c.B.D.foods[k].t === 1 && Engine.USEFUL_PERKS.has(k)); if (!pool.length) return; c.B.givePerk(it, pool[c.B.rand(pool.length)], c.self); };
    S.Frigatebird = () => c => { const it = c.ev.pet; if (it) c.B.givePerk(it, 'RiceBall', c.self); };
    S.BettaFish = () => c => { const it = c.ev.pet; if (it && c.B.alive(it)) c.B.givePerk(it, 'Guava', c.self); };
    S.Bilby = () => c => { const it = c.ev.pet; if (it && c.B.alive(it)) c.B.givePerk(it, 'Garlic', c.self); };
    S.RealVelociraptor = () => c => { const it = c.ev.pet; if (it && c.B.alive(it) && c.ev.perk) c.B.givePerk(it, c.ev.perk, c.self); };
    S.YetiCrab = (t) => { const [d] = nums(t); return c => { const it = c.ev.pet; if (!it || !c.B.alive(it)) return; if (it.side === c.self.side) c.B.givePerk(it, 'WaterMelon', c.self); else c.B.damage(c.self, it, d, 'ability'); }; };
    S.Butterfly = (t) => { const [pc] = nums(t); return c => { const e = H.E(c).sort((a, b) => (b.atk + b.hp) - (a.atk + a.hp))[0]; if (e) c.B.buff(c.self, Math.floor(e.atk * pc / 100), Math.floor(e.hp * pc / 100), c.self); }; };
    S.IliPika = (t) => { const [v] = nums(t); return c => { const it = c.ev.pet; if (it) c.B.buff(it, it.atk >= it.hp ? v : 0, it.atk >= it.hp ? 0 : v, c.self); }; };
    S.BlueThroatedMacaw = (t) => { const [v] = nums(t); return c => { const it = c.ev.pet; if (!it) return; if (c.B.idx(it) < c.B.idx(c.self)) c.B.buff(it, v, 0, c.self); else c.B.buff(it, 0, v, c.self); }; };
    S.Quail = (t) => { const [a, h] = nums(t); return c => { const f = H.F(c)[0]; if (f) c.B.buff(f, a * 2, h * 2, c.self); }; };
    S.PoodleMoth = (t) => { const [x] = nums(t); return c => { const it = c.ev.pet; if (it) c.B.gainXp(it, x, c.self); }; };
    S.Warg = (t) => { const [d] = nums(t); return c => { const first = !c.self.flags.wargFired; c.self.flags.wargFired = true; const e = c.B.pick(c.self, H.E(c), 1, 'enemy')[0]; if (e) c.B.damage(c.self, e, first ? d * 3 : d, 'ability'); }; };
    S.Pengobble = (t) => { const [m] = nums(t); return c => { if (c.self.flags.pengo) return; c.self.flags.pengo = true; c.B.gainMana(c.self, m, c.self); c.self.flags.pengo = false; }; };
    S.PhilippineEagle = (t) => { const [a, h] = nums(t); return c => { const f = c.B.pick(c.self, c.B.team(c.self.side), 1, 'friend')[0]; if (f) c.B.buff(f, a, h, c.self); }; };
    S.Wolverine = (t) => { const [h] = nums(t); return c => { for (const e of H.E(c)) c.B.removeHealth(e, h, c.self, { noKill: true }); }; };
    S.Iguana = (t) => { const [d] = nums(t); return c => { const it = c.ev.pet; if (it && c.B.alive(it)) c.B.damage(c.self, it, d, 'ability'); }; };
    S.Ibex = (t) => { const [pc] = nums(t); return c => { if (c.self.flags.ibex) return; const it = c.ev.pet; if (it && c.B.alive(it)) { c.self.flags.ibex = true; c.B.removeHealth(it, Math.floor(it.hp * pc / 100), c.self); } }; };
    S.AraripeManakin = (t) => { const [h] = nums(t); return c => c.B.buff(c.self, 0, h, c.self); };
    S.Budgie = (t) => { const [h] = nums(t); return c => { c.B.givePerk(c.self, 'Popcorn', c.self); c.B.buff(c.self, 0, h, c.self); }; };
    S.Ox = (t) => { const [a] = nums(t); return c => { c.B.givePerk(c.self, 'Melon', c.self); c.B.buff(c.self, a, 0, c.self); }; };
    S.EthiopianWolf = (t) => { const [a] = nums(t); return c => { const e = H.firstE(c); if (e) c.B.removeAttack(e, a, c.self); }; };
    S.HoopoeBird = (t) => { const [d] = nums(t); return c => { const e = H.E(c); for (const x of e.length > 1 ? [e[0], e[e.length - 1]] : e) c.B.damage(c.self, x, d, 'ability'); }; };
    S.Olm = (t) => c => { const e = c.B.pick(c.self, H.E(c), 1, 'enemy')[0]; if (e) c.B.givePerk(e, 'Scared', c.self); };
    S.VolcanoSnail = () => c => { const e = c.B.pick(c.self, H.E(c).filter(x => !x.perk), 1, 'enemy')[0]; if (e) c.B.givePerk(e, 'Toasty', c.self); };
    S.ElephantSeal = (t) => { const [a, h] = nums(t); return c => { for (const f of c.B.pick(c.self, H.F(c), 3, 'friend')) c.B.buff(f, a, h, c.self); }; };
    S.Dimetrodon = (t) => { const [a, h, ba, bh] = nums(t); return c => { const k = H.randomPet(c.B, d => d.t === c.B.tier(c.self)); const p = c.B.team(c.self.side).length < 5 && k ? H.sumAt(c, k, a, h, { at: c.B.idx(c.self) + 1 }) : null; if (!p) for (const f of H.F(c)) c.B.buff(f, ba, bh, c.self); }; };
    S.HumpheadWrasse = (t) => { const [pc] = nums(t); return c => { const e = H.E(c).sort((a, b) => b.atk - a.atk)[0]; if (e) c.B.removeAttack(e, Math.floor(e.atk * pc / 100), c.self); }; };
    S.ManaHound = (t) => { const [m, max] = nums(t); return c => { const f = target('nearest friend ahead')(c)[0]; const r = Math.min(c.B.opts.rolls, max || 3); if (f && r) c.B.gainMana(f, m * r, c.self); }; };
    S.Fossa = (t) => { const [h] = nums(t); return c => { for (const e of H.E(c).slice(0, 2)) c.B.removeHealth(e, h * c.B.opts.rolls, c.self); }; };
    S.Bunyip = (t) => { const [h, max] = nums(t); return c => c.B.buff(c.self, 0, h * Math.min(c.B.opts.rolls, max), c.self); };
    S.Platybelodon = (t) => { const [k, max] = nums(t); return c => c.B.gainTrumpets(c.self.side, k * Math.min(c.B.opts.rolls, max || 8), c.self); };
    S.Hippocampus = (t) => { const [m] = nums(t); return c => c.B.gainMana(c.self, m * c.B.opts.rolls, c.self); };

    S.Blobfish = (t, L) => { const [x] = nums(t); return c => { for (const f of target((L >= 2 ? 'two' : 'one') + ' nearest friends behind')(c)) c.B.gainXp(f, x, c.self); }; };
    S.BrazillianTreehopper = () => c => { const e = H.E(c).sort((a, b) => b.hp - a.hp)[0]; if (!e) return; const tot = e.atk + e.hp; const a = 1 + c.B.rand(Math.max(1, tot - 1)); c.B.setStats(e, a, Math.max(1, tot - a), c.self); };
    const usefulPerks = (B, tier) => Object.keys(B.D.foods).filter(k => B.D.foods[k].r && (tier == null || B.D.foods[k].t === tier) && Engine.USEFUL_PERKS.has(k) && !['Pepper', 'LovePotion'].includes(k));
    S.Mink = () => c => { const pool = usefulPerks(c.B, Math.max(1, c.B.tier(c.self) - 1)); if (pool.length) c.B.givePerk(c.self, pool[c.B.rand(pool.length)], c.self); };
    S.GoodDog = () => c => { const pool = usefulPerks(c.B); for (const f of H.F(c)) c.B.givePerk(f, pool[c.B.rand(pool.length)], c.self); };
    S.BlueFootedBooby = (t) => { const [k] = nums(t); return c => { if (c.B.spendTrumpets(c.self.side, k) < k) return; const f = target('nearest friend behind')(c)[0]; if (f) c.B.givePerk(f, 'WaterMelon', c.self); }; };
    S.Markhor = (t) => { const [k, a, h] = nums(t); return c => { if (c.B.spendTrumpets(c.self.side, k) < k) return; const fs = H.F(c); if (!fs.length) return; for (let i = 0; i < a; i++) c.B.buff(fs[i % fs.length], 1, 0, c.self); for (let i = 0; i < h; i++) c.B.buff(fs[i % fs.length], 0, 1, c.self); }; };
    S.Ammonite = () => c => { const f = target('nearest friend behind')(c)[0]; if (f) { c.B.transform(f, 'MimicOctopus', { lvl: 1, src: c.self }); c.B.gainXp(f, Math.floor(c.B.opts.rolls / 2), c.self); } };
    S.EagleOwl = (t) => { const [a, h] = nums(t); return c => { const k = c.B.opts.battles; for (const f of c.B.pick(c.self, H.F(c), 3, 'friend')) c.B.buff(f, a * k, h * k, c.self); }; };
    S.BrahmaChicken = (t) => { const [a, h] = nums(t); return c => { for (const f of c.B.shuffle(H.F(c).filter(p => p.dealtDamage)).slice(0, 3)) c.B.buff(f, a, h, c.self); }; };
    S.Cuckoo = (t) => { const [a, h] = nums(t); return c => { const used = c.B.cuckoo = c.B.cuckoo || [0, 0]; if (used[c.self.side] >= 2) return; used[c.self.side]++; c.B.summon(1 - c.self.side, 0, 'CuckooBaby', { atk: a, hp: h, src: c.self }); }; };
    S.DesertRainFrog = (t) => { const [k] = nums(t); return c => { if (c.B.spendTrumpets(c.self.side, k) < k) return; const pk = H.randomPet(c.B, d => d.t === Math.min(6, c.B.tier(c.self) + 1) && /Faint/.test(d.tr)); if (pk) c.B.transform(c.self, pk, { base: true, lvl: 1, src: c.self }); }; };
    S.HoodedSeal = () => c => { const it = c.ev.pet; if (it && it.prevId) c.B.transform(it, it.prevId, { lvl: 1, src: c.self }); };
    S.LuckyCat = (t) => { const [a, h] = nums(t); return c => c.B.buff(c.self, a, h, c.self); };
    S.Cyclops = (t, L) => { const [m] = nums(t); return c => { const it = c.ev.pet; if (!it) return; c.B.gainMana(it, m, c.self); c.self.flags.cyc = (c.self.flags.cyc || 0) + 1; if (c.self.flags.cyc <= L) c.B.gainXp(it, 1, c.self); }; };
    S.PygmyHippo = (t, L) => { const [pc] = nums(t); return c => { const d = Math.max(1, Math.floor(c.self.hp * pc / 100)); for (const e of H.E(c).sort((a, b) => a.hp - b.hp).slice(0, L)) c.B.damage(c.self, e, d, 'ability'); }; };
    S.PygmyHog = (t) => { const [v] = nums(t); return c => { c.B.transform(c.self, 'AngryPygmyHog', { atk: Math.max(v, c.self.atk), hp: Math.max(v, c.self.hp), src: c.self }); c.B.givePerk(c.self, 'Garlic', c.self); }; };
    S.AyeAye = (t) => { const [a, h] = nums(t); return c => { for (let i = 0; i < 2; i++) H.sumAt(c, 'Lemur', c.B.D.pets.Lemur.a, c.B.D.pets.Lemur.h, { at: c.B.idx(c.self) + 1 }); for (const f of c.B.team(c.self.side)) c.B.buff(f, a, h, c.self); }; };
    S.GreenSeaTurtle = (t) => { const [b] = nums(t); return c => { for (const f of c.B.team(c.self.side)) if (c.B.givePerk(f, 'Melon', c.self)) f.perk.mult = b / 20; }; };
    // abilities that count shop actions: use the values from Settings
    S.DungBeetle = (t) => { const [d, , max] = nums(t); return c => { const k = Math.min(c.B.opts.foodEaten, max || 3); const e = H.E(c).sort((a, b) => a.hp - b.hp)[0]; if (e && k) c.B.damage(c.self, e, d * k, 'ability'); }; };
    S.BlueJay = (t) => { const [a, h] = nums(t); return c => { const k = c.B.opts.foodEaten; if (k) for (const f of c.B.pick(c.self, H.F(c), 3, 'friend')) c.B.buff(f, a * k, h * k, c.self); }; };
    S.BlackBear = (t) => { const [h] = nums(t); return c => { const k = c.B.opts.foodEaten; const e = c.B.pick(c.self, H.E(c), 1, 'enemy')[0]; if (e && k) c.B.removeHealth(e, h * k, c.self); }; };
    S.GiantPangasius = (t) => { const [d] = nums(t); return c => { for (let i = 0; i < c.B.opts.transforms; i++) { const e = c.B.pick(c.self, H.E(c), 1, 'enemy')[0]; if (e) c.B.damage(c.self, e, d, 'ability'); } }; };
    S.Meerkat = (t) => { const [a, per] = nums(t); return c => { const k = Math.floor(c.B.opts.goldSpent / (per || 4)); if (k) for (const f of adjacent(c, 1, false)) c.B.buff(f, a * k, 0, c.self); }; };
    S.JerseyDevil = (t) => { const [a, h, max] = nums(t); return c => { const it = c.ev.pet; const k = Math.min(c.B.opts.lvl3Sold, max || 5); if (it && k) c.B.buff(it, a * k, h * k, c.self); }; };
    // depend on shop history (food eaten / transformations this turn): nothing to count in a sandbox battle
    for (const k of ['Locust', 'Dugong', 'Tanystropheus', 'Jackal']) S[k] = () => 'shop';

    // -------------------------------------------------------------- End turn (activated in battle by Pink Robin)
    const ET = {};
    const WORDN = { one: 1, two: 2, three: 3 };
    const ahead = (c, n) => { const t = c.B.team(c.self.side), i = t.indexOf(c.self); return t.slice(Math.max(0, i - n), Math.max(0, i)).reverse(); };
    const behindAll = c => { const t = c.B.team(c.self.side), i = t.indexOf(c.self); return t.slice(i + 1); };
    const aheadAll = c => { const t = c.B.team(c.self.side), i = t.indexOf(c.self); return t.slice(0, Math.max(0, i)); };
    const shopTier = B => Math.min(6, Math.ceil((B.opts.turn || 1) / 2));
    const ail = (B, p) => p.perk && B.isAilment(p.perk.id);
    ET.Behemoth = (t) => { const [a, h] = nums(t); return c => c.B.buff(c.self, a, h, c.self); };
    ET.GiantTortoise = (t) => { const [h, a] = nums(t); return c => { c.B.setStats(c.self, a, c.self.hp + h, c.self); }; };
    ET.Bison = (t) => { const [a, h] = nums(t); return c => c.B.buff(c.self, a, h, c.self); };
    ET.Siamese = (t) => { const [a] = nums(t); return c => { for (const f of adjacent(c, 1, false)) c.B.buff(f, a, 0, c.self); }; };
    ET.Baku = (t) => { const [h] = nums(t); return c => { for (const f of c.B.shuffle(H.F(c).filter(f => ail(c.B, f))).slice(0, 2)) { c.B.losePerk(f, c.self, 'used'); c.B.buff(f, 0, h, c.self); } }; };
    ET.Leafling = (t) => { const [a] = nums(t); return c => { const f = ahead(c, 1)[0]; if (f) { c.B.buff(f, a, 0, c.self); c.B.givePerk(f, 'Scared', c.self); } }; };
    ET.Amphisbaena = (t) => { const [a, h] = nums(t); return c => { const f = ahead(c, 1)[0]; if (f) c.B.buff(f, c.B.opts.turn % 2 ? a : 0, c.B.opts.turn % 2 ? 0 : h, c.self); }; };
    ET.FarmerChicken = (t, L) => c => { for (const f of ahead(c, L)) H.corn(c.B, f, 1, c.self); };
    ET.FarmerDog = (t, L) => c => { for (const f of H.F(c)) H.corn(c.B, f, L, c.self); };
    ET.Saola = (t) => { const [a, h] = nums(t); return c => { const f = H.F(c).sort((x, y) => y.atk - x.atk)[0]; if (f) { c.B.removeAttack(f, a, c.self); c.B.buff(f, 0, h, c.self); } }; };
    ET.Yak = (t) => { const [d, a] = nums(t); return c => { c.B.damage(c.self, c.self, d, 'ability'); if (c.B.alive(c.self)) c.B.buff(c.self, a, 0, c.self); }; };
    ET.Baboon = (t) => { const [a, h] = nums(t); return c => { const f = c.B.pick(c.self, H.F(c).filter(f => c.B.tier(f) >= shopTier(c.B)), 1, 'friend')[0]; if (f) c.B.buff(f, a, h, c.self); }; };
    ET.Barnacle = (t) => { const [x] = nums(t); return c => { if (!c.B.opts.rolls) c.B.gainXp(c.self, x, c.self); }; };
    ET.Leech = (t) => { const [d] = nums(t); return c => { const f = ahead(c, 1)[0]; if (!f) return; const h0 = f.hp; c.B.damage(c.self, f, d, 'ability'); const dealt = Math.max(0, h0 - Math.max(0, f.hp)); if (dealt) c.B.buff(c.self, 0, dealt, c.self); }; };
    ET.Wendigo = () => c => { const f = ahead(c, 1)[0]; if (f) c.B.removeHealth(f, f.hp, c.self); };
    ET.Angelshark = (t) => { const [k] = nums(t); return c => { for (const f of H.F(c)) c.B.buff(f, f.atk > f.hp ? k : 0, f.atk > f.hp ? 0 : k, c.self); }; };
    ET.Manatee = (t) => { const [d, a, h] = nums(t); return c => { c.B.damage(c.self, c.self, d, 'ability'); const f = ahead(c, 1)[0]; if (f) c.B.buff(f, a, h, c.self); }; };
    ET.Rootler = (t) => { const [a, h] = nums(t); return c => { for (const f of c.B.pick(c.self, H.F(c).filter(f => f.hp < c.self.hp), 2, 'friend')) c.B.buff(f, a, h, c.self); }; };
    ET.Sandworm = (t) => { const [a, h, per, max] = nums(t); return c => { const k = Math.floor(Math.min(c.B.opts.rolls, max || 8) / (per || 4)); if (k) for (const f of adjacent(c, 1, false)) c.B.buff(f, a * k, h * k, c.self); }; };
    ET.Sealion = (t) => { const [a, h] = nums(t); return c => { for (const f of behindAll(c)) c.B.buff(f, a, 0, c.self); for (const f of aheadAll(c)) c.B.buff(f, 0, h, c.self); }; };
    ET.ThorGoat1 = (t) => { const [h] = nums(t); return c => { const f = c.B.pick(c.self, H.F(c).filter(f => f.id === 'ThorGoat2'), 1, 'friend')[0]; if (f) c.B.buff(f, 0, h, c.self); }; };
    ET.ThorGoat2 = (t) => { const [a] = nums(t); return c => { const f = c.B.pick(c.self, H.F(c).filter(f => f.id === 'ThorGoat1'), 1, 'friend')[0]; if (f) c.B.buff(f, a, 0, c.self); }; };
    const oneOfEach = (key) => (t) => { const [a, h] = nums(t); return c => { const seen = new Set(); for (const f of c.B.shuffle(H.F(c))) { const v = key(c.B, f); if (seen.has(v)) continue; seen.add(v); c.B.buff(f, a, h, c.self); } }; };
    ET.Dragonfly = oneOfEach((B, f) => f.lvl);
    ET.Poodle = oneOfEach((B, f) => B.tier(f));
    ET.SiberianHusky = (t) => { const [a, h] = nums(t); return c => { for (const f of c.B.pick(c.self, H.F(c).filter(f => !f.perk || ail(c.B, f)), 3, 'friend')) c.B.buff(f, a, h, c.self); }; };
    ET.ForestSpirit = (t) => { const [m] = nums(t); return c => { for (const f of ahead(c, 2)) c.B.gainMana(f, m, c.self); }; };
    ET.Komodo = (t) => { const [a, h] = nums(t); return c => {
      const fs = aheadAll(c); for (const f of fs) c.B.buff(f, a, h, c.self);
      const arr = c.B.t[c.self.side], slots = fs.map(f => arr.indexOf(f)), mixed = c.B.shuffle(fs);
      slots.forEach((s, i) => { arr[s] = mixed[i]; });
      if (fs.length > 1) c.B.rec('note', { tgt: c.self.uid, text: 'Shuffled' });
    }; };
    ET.Quetzalcoatl = (t) => { const [mt, x] = nums(t); return c => { const f = c.B.pick(c.self, H.F(c).filter(f => c.B.tier(f) <= mt), 1, 'friend')[0]; if (f) c.B.gainXp(f, x, c.self); }; };
    ET.VampireSquid = (t) => { const [a, h] = nums(t); return c => { const seen = new Set(); for (const f of H.F(c)) { if (!ail(c.B, f) || seen.has(f.perk.id)) continue; seen.add(f.perk.id); c.B.buff(f, a, h, c.self); } }; };
    // shop-only end turn effects (gold, shop, toys, copying for next turn)
    for (const k of ['Magpie', 'Cardinal', 'Ahuizotl', 'Andrewsarchus', 'Chameleon', 'Elk', 'MantaRay', 'Parrot', 'Shoggoth', 'Fox', 'Moose']) ET[k] = () => 'shop';

    // Pink Robin: before faint, activate End Turn on one random friend of tier <= 2/4/6
    S.PinkRobin = (t) => { const [mt] = nums(t); return c => {
      const fs = H.F(c).filter(f => c.B.tier(f) <= mt && c.B.A[f.id] && c.B.A[f.id].endTurn && c.B.A[f.id].endTurn.some(Boolean));
      const f = c.B.pick(c.self, fs, 1, 'friend')[0];
      if (f) c.B.activateEndTurn(f, c.self);
    }; };

    // -------------------------------------------------------------- compile
    const out = {};
    const status = {};
    for (const [key, def] of Object.entries(PETS)) {
      const trig = TRIGGER_FIX[key] || def.tr;
      const levels = [null, null, null];
      let st = 'ok', why = '', shopLevels = 0;
      if (trig === 'Passive') {
        st = 'passive';
      } else if (trig === 'Shop' || trig === 'None') {
        st = def.ab.some(Boolean) ? 'shop' : 'none';
      } else {
        for (let i = 0; i < 3; i++) {
          const txt = def.ab[i];
          if (S[key]) {
            const r = S[key](txt, i + 1, def.ab);
            if (r === 'shop') { st = 'shop'; break; }
            if (typeof r === 'function') { levels[i] = r; continue; }
          }
          if (/^No ability\.?$/i.test(normText(txt)) || !normText(txt)) continue;
          const r = compileText(txt, key);
          if (r.status === 'ok') levels[i] = r.fn;
          else if (r.status === 'shop' || r.status === 'none') { shopLevels++; }
          else { st = 'unsupported'; why = r.why; break; }
        }
        if (st === 'unsupported') levels.fill(null);
        if (st === 'ok' && !levels.some(Boolean)) st = shopLevels ? 'shop' : 'none';
      }
      if (REPEATS[key]) for (let i = 0; i < 3; i++) if (levels[i]) { const f = levels[i], n = REPEATS[key][i]; levels[i] = c => { for (let k = 0; k < n; k++) f(c); }; }
      let limit = FAINT_LIMITS[key] || def.lim || 0;
      const fp = (def.fp || [])[0] || '';
      const m = fp.match(/Works (\d+) times?/i) || normText(def.ab[0]).match(/Works (\d+) times?/i);
      if (m && !limit) {
        const per = [0, 1, 2].map(i => { const mm = (((def.fp || [])[i] || '') + ' ' + normText(def.ab[i])).match(/Works (\d+) times?/i); return mm ? +mm[1] : +m[1]; });
        limit = per.every(x => x === per[0]) ? per[0] : per;
      }
      if (/Works on one (friend|enemy)/i.test(fp + def.ab[0]) && !limit) limit = 1;
      if (!limit && (trig === 'AfterFirstAttack' || trig === 'EmptyFront')) limit = 1;
      out[key] = { trigger: trig, levels, limit };
      status[key] = { status: st, why, trigger: trig };
      // End turn abilities, compiled so Pink Robin can activate them in battle
      if (/end turn/i.test(def.tl || '')) {
        const et = [null, null, null];
        for (let i = 0; i < 3; i++) {
          const txt = def.ab[i];
          if (ET[key]) { const r = ET[key](txt, i + 1); if (r === 'shop') break; if (typeof r === 'function') { et[i] = r; continue; } }
          const r = compileText(txt, key);
          if (r.status === 'ok') et[i] = r.fn;
        }
        out[key].endTurn = et;
        status[key].endTurn = et.some(Boolean) ? 'ok' : 'shop';
      }
    }
    /**
     * Custom pet: run each level's (edited) text through the source pet's handler, or the general text compiler.
     * def = { src, texts: [t1, t2, t3], trigger, limit: [l1, l2, l3] }
     */
    function compileCustom(def) {
      const levels = [null, null, null]; const errors = [];
      for (let i = 0; i < 3; i++) {
        const txt = def.texts[i]; if (!txt) continue;
        let fn = null;
        try {
          if (S[def.src]) { const r = S[def.src](txt, i + 1, def.texts); if (typeof r === 'function') fn = r; }
          if (!fn) { const r = compileText(txt, def.src); if (r.status === 'ok') fn = r.fn; }
        } catch (e) { fn = null; }
        if (fn) levels[i] = fn; else errors.push(i + 1);
      }
      const lim = (def.limit || []).map(n => Math.max(0, n | 0));
      const limit = lim.some(Boolean) ? lim : 0;
      return { ability: { trigger: def.trigger, levels, limit }, status: { status: levels.some(Boolean) ? 'ok' : 'unsupported', why: '', trigger: def.trigger }, errors };
    }
    return { abilities: out, status, normText, compileCustom };
  }

  const api = { compileAll, normText };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SAPAbilities = api;
})(typeof window !== 'undefined' ? window : globalThis);
