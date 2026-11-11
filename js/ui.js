/* Super Auto Pets sandbox — UI */
(function () {
  'use strict';
  const D = window.SAP_DATA;
  for (const b of ['WhiteBattle', 'DarkGrayBattle']) if (!D.bgs.includes(b)) D.bgs.unshift(b); // plain themes, listed first
  const Engine = window.SAPEngine;
  const COMPILED = window.SAPAbilities.compileAll(D, Engine);
  // Editor info (battle / shop-only, trigger limits, charge counters) from the game's own abilities (js/game/info.js);
  // the trigger wording stays the site's
  const GINFO = window.SAPGame.info.build(D, window.SAPGame.data, window.SAPGame.adapter);
  const AB = GINFO.abilities, STATUS = {};
  for (const k of Object.keys(D.pets)) {
    const g = GINFO.status[k] || { status: 'none', endTurn: false }; const o = COMPILED.status[k] || {};
    STATUS[k] = { trigger: o.trigger || D.pets[k].tr, status: g.status === 'goldshop' ? 'shop' : g.status, goldShop: g.status === 'goldshop', endTurn: g.endTurn };
  }

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null) e.setAttribute(k, v);
    }
    for (const k of kids) if (k != null) e.append(k.nodeType ? k : document.createTextNode(k));
    return e;
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const petImg = id => `img/pets/${(D.pets[id] && D.pets[id].sprite) || id}.webp`;
  const foodImg = id => `img/food/${id}.webp`;
  const UI = n => `img/ui/${n}.webp`;
  const lvlOf = xp => Engine.levelFromXp(xp);
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // ------------------------------------------------------------------ labels
  const TRIG_LABEL = { EatsFood: 'Eats food', EatsApple: 'Eats apple', FriendAteFood: 'Friend ate food', FriendlyAteFood: 'Friendly ate food', PetAteFood: 'Pet ate food', FriendAteCorncob: 'Friend ate Corncob', EndTurn: 'End turn (Pink Robin)', SOB: 'Start of battle', BeforeBattle: 'Before battle', BeforeAttack: 'Before attack', BeforeFriendAttacks: 'Before friend attacks',
    Hurt: 'Hurt', FriendAheadHurt: 'Friend ahead hurt', FriendHurt: 'Friend hurt', EnemyHurt: 'Enemy hurt', EnemyHurtOrPushed: 'Enemy hurt or pushed',
    AnyoneBehindHurt: 'Anyone behind hurt', AnyoneHurt: 'Anyone hurt', FourFriendsHurt: 'Four friends hurt', BeforeFaint: 'Faint', Faint: 'Faint',
    FriendFaints: 'Friend faints', FriendAheadFaints: 'Friend ahead faints', KnockOut: 'Knock out', Summoned: 'Summoned', FriendSummoned: 'Friend summoned',
    BeeSummoned: 'Bee summoned', EnemySummoned: 'Enemy summoned', EnemySummonedOrPushed: 'Enemy summoned or pushed', AfterAttack: 'After attack',
    AfterFirstAttack: 'After first attack', FriendAheadAttacks: 'Friend ahead attacks', AdjFriendAttacked: 'Adjacent friend attacked', FriendAttacks: 'Friend attacks',
    FriendlyAttacked: 'Friendly attacked', EmptyFront: 'Empty front space', EnemyPushed: 'Enemy pushed', GainPerk: 'Gain perk', GainPerkOrAilment: 'Gain perk or ailment',
    FriendlyGainedPerk: 'Friendly gained perk', FriendlyGainedStrawberry: 'Friendly gained Strawberry', FriendGainedAilment: 'Friend gained ailment',
    EnemyGainedAilment: 'Enemy gained ailment', AnyoneGainedAilment: 'Anyone gained ailment', FriendLostPerk: 'Friend lost perk', PetLostPerk: 'Pet lost perk',
    LevelUp: 'Level-up', FriendLevelUp: 'Friend level-up', FriendlyLevelUp: 'Friendly level-up', FriendGainedXp: 'Friend gained experience', EnemyFaints: 'Enemy faints', Tiger: 'Tiger repeat',
    Transformed: 'Transformed', FriendTransformed: 'Friend transformed', FriendJumpedOrTransformed: 'Friend jumped or transformed', GainsMana: 'Gains mana' };
  const SHOP_TL = { 'Other summoned': 'Buy', Composite: '', Charged: '', '?': '' };
  function trigLabel(id) {
    const st = STATUS[id]; const t = st ? st.trigger : D.pets[id].tr;
    if (TRIG_LABEL[t]) return TRIG_LABEL[t];
    if (t === 'Passive') return '';
    if (t && t.startsWith('Count:')) {
      const [, w, k] = t.split(':');
      const num = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'][+k] || k;
      return num + ' ' + { FriendFaints: 'friends faint', EnemyFaints: 'enemies faint', EnemyAttacks: 'enemy attacks', FriendlyAttacks: 'friendly attacks', FriendHurt: 'friends hurt' }[w];
    }
    const tl = D.pets[id].tl || '';
    return SHOP_TL[tl] != null ? SHOP_TL[tl] : tl;
  }
  const AIL_INFO = { Weak: ['Weak', 'Take +3 damage.'], Scared: ['Spooked', 'Take +1 damage.'], Toasty: ['Toasty', 'Anyone attacks: take 1 damage, once.'],
    Frozen: ['Cold', 'Take +5 damage, once.'], Ink: ['Inked', 'Attack and ability deal 3 less damage.'], Burn: ['Crisp', 'Anyone attacks: take 6 damage, once.'],
    Deaf: ['Dazed', 'Prevent ability from activating.'], Drowsy: ['Sleepy', 'Attack with half damage, once.'],
    Tasty: ['Tasty', 'Faint: give one random enemy +2 attack and +2 health.'], Silly: ['Silly', 'Ability has random targets in battle.'],
    Web: ['Webbed', 'Faint: summon one 2/2 Spider up front for the opponent.'], Confused: ['Confused', 'Before attack: transform into a pet from one tier below, once.'],
    Curse: ['Cursed', 'Faint: make one random friend Cursed.'], Bloated: ['Bloated', "Can't gain perk, once."], Acid: ['Icky', 'Take double damage, twice.'],
    Cowardly: ['Cowardly', 'Before attack: move to the back, once.'] };
  const ICON_MAP = { AttackIcon: UI('Fist'), HealthIcon: UI('Heart_1'), ManaIcon: UI('Mana'), TrumpetIcon: UI('Trumpet'), GoldIcon: UI('Coin'), ExpIcon: UI('Star'),
    ScaredIcon: foodImg('Scared'), ToastyIcon: foodImg('Toasty'), WeakIcon: foodImg('Weak'), SillyIcon: foodImg('Silly'), ConfusedIcon: foodImg('Confused'),
    DrowsyIcon: foodImg('Drowsy'), BurnIcon: foodImg('Burn'), CurseIcon: foodImg('Curse'), DeafIcon: foodImg('Deaf'), InkIcon: foodImg('Ink'),
    BloatedIcon: foodImg('Bloated'), TastyIcon: foodImg('Tasty'), WebIcon: foodImg('Web'), AcidIcon: foodImg('Acid'), FrozenIcon: foodImg('Frozen') };
  const SETTINGS_DEP = { Fossa: 'rolls', ManaHound: 'rolls', Bunyip: 'rolls', Platybelodon: 'rolls', Hippocampus: 'rolls', Nessie: 'rolls', Ammonite: 'rolls',
    Werewolf: 'turn', Slime: 'battles', EagleOwl: 'battles', DungBeetle: 'foodEaten', BlueJay: 'foodEaten', BlackBear: 'foodEaten',
    GiantPangasius: 'transforms', Meerkat: 'goldSpent', JerseyDevil: 'lvl3Sold' };
  // per-pet shop/turn values, edited in the pet editor (blank = use Settings)
  const PET_CTX = {
    rolls: ['Fossa', 'ManaHound', 'Bunyip', 'Platybelodon', 'Hippocampus', 'Nessie', 'Ammonite', 'Olm', 'Okapi', 'Barnacle', 'Sandworm'],
    foodEaten: ['BlueJay', 'BlackBear', 'DungBeetle'],
    summoned: ['NightCrawler'],
    battles: ['Slime', 'EagleOwl'],
    turn: ['Werewolf', 'Amphisbaena'],
    transforms: ['GiantPangasius'],
    goldSpent: ['Meerkat'],
    lvl3Sold: ['JerseyDevil'],
    swallowed: ['WhiteWhale', 'SarcasticFringehead'],
  };
  const CTX_LABEL = { rolls: ['Rolls this turn', 0, 20], foodEaten: ['Food it ate this turn', 0, 10], summoned: ['Friends summoned this turn', 0, 20],
    battles: ['Battles fought', 0, 40], turn: ['Turn number', 1, 40], transforms: ['Transformations this turn', 0, 10], goldSpent: ['Gold spent this turn', 0, 40],
    lvl3Sold: ['Level 3 pets sold', 0, 10] };
  // values with one setting for the whole battle: the pet editor edits the Settings value itself (every such pet follows)
  const SHARED_CTX = new Set(['goldSpent', 'rolls', 'transforms', 'summoned', 'lvl3Sold', 'turn']);
  const CARRIES_OVER = new Set(['Okapi', 'WhiteWhale', 'SarcasticFringehead']); // shop abilities whose result shows up in battle
  const ctxKeys = id => Object.keys(PET_CTX).filter(k => PET_CTX[k].includes(id));
  const SETTING_NAMES = { rolls: 'Rolls this turn', turn: 'Turn number', battles: 'Battles fought', foodEaten: 'Food eaten this turn', transforms: 'Transformations this turn', goldSpent: 'Gold spent this turn', lvl3Sold: 'Level 3 pets sold' };

  function noBattleText(id) { if (CARRIES_OVER.has(id)) return 'Shop ability: set what it did this turn in the pet editor and it carries into the battle.';
    return noBattleText0(id); }
  function noBattleText0(id) { if (STATUS[id].goldShop) return 'Triggers in battle, but only affects gold or the shop.'; if (STATUS[id].endTurn) return 'End turn ability: only runs in battle when another pet activates it.'; return 'Shop ability: no effect in battle.'; }
  function limitAt(id, lv) { const ab = AB[id]; return ab ? ab.limit[lv - 1] || 0 : 0; }
  function editTrig(id, lv) {
    const ab = AB[id]; if (!ab) return null;
    const lim = limitAt(id, lv); if (lim) return { left: lim, max: lim };
    if (ab.charges[lv - 1]) return { cnt: 0, need: ab.charges[lv - 1] };
    return null;
  }
  function limitText(id, lv) { const n = limitAt(id, lv); return n ? `Works ${n} time${n === 1 ? '' : 's'} per battle.` : ''; }
  function perkName(id) { if (!id) return 'None'; if (AIL_INFO[id]) return AIL_INFO[id][0]; const f = D.foods[id]; return f ? (f.pn || f.n) : id; }
  const PERK_TEXT = { GeecheeRedPea: 'Remove 5 attack from target, once.', BrusselsSprout: 'Block being pushed or 5 damage, once.',
    EasterEgg: 'Summon one 3/3 Monty that attacks for double damage.', Strawberry: 'Give the back-most friend +1 attack and +1 health.' };
  const PERK_TRIG = { Croissant: 'End turn', Cucumber: 'End turn', Carrot: 'End turn', Bread: 'End turn', MagicBeans: 'Start of turn', Grapes: 'Start of turn', SardinianCurrant: 'Start of turn', Sausage: 'Start of turn', RiceBall: 'Sell', BirthdayCake: 'Sell' };
  function perkDesc(id) {
    if (AIL_INFO[id]) return AIL_INFO[id][1];
    const f = D.foods[id]; if (!f) return '';
    const txt = PERK_TEXT[id] || f.ab;
    const t = Engine.PERKS[id] ? Engine.PERK_TRIGGER_LABEL[Engine.PERKS[id].t] : PERK_TRIG[id];
    return (t ? `<b>${t}</b> → ` : '') + txt + (Engine.SHOP_PERKS.includes(id) ? ' <i>(no effect in battle)</i>' : '');
  }
  function fmtAbility(t) {
    let s = esc(t || '');
    s = s.replace(/\{(\w+Icon)\}/g, (m, k) => ICON_MAP[k] ? `<img class="ico" src="${ICON_MAP[k]}" alt="">` : '');
    s = s.replace(/\[\[([^|\]]+)(?:\|([^\]]*))?\]\]/g, (m, a, b) => {
      const fk = b && b.startsWith('food:') ? Object.keys(D.foods).find(k => k.toLowerCase() === b.slice(5).toLowerCase()) : null;
      return `<b>${a}</b>${fk ? `<img class="ico" src="${foodImg(fk)}" alt="">` : ''}`;
    });
    s = s.replace(/&lt;(\/?)(b|i)&gt;/g, '<$1$2>');
    return s;
  }

  // ------------------------------------------------------------------ state
  // every food perk in the game (from your game's localization: "Give one pet the X perk"), by tier
  const FOOD_PERKS = Object.keys(Engine.PERKS).concat(Engine.PASSIVE_PERKS, Engine.SHOP_PERKS)
    .filter((k, i, arr) => D.foods[k] && arr.indexOf(k) === i)
    .sort((a, b) => D.foods[a].t - D.foods[b].t || perkName(a).localeCompare(perkName(b)));
  const BATTLE_PERKS = FOOD_PERKS.filter(k => !Engine.SHOP_PERKS.includes(k));
  const AILMENT_LIST = Object.keys(AIL_INFO);
  const PACKS = ['Turtle', 'Puppy', 'Star', 'Golden', 'Unicorn', 'Danger'];
  const ROLLABLE = Object.keys(D.pets).filter(k => D.pets[k].r);
  { // tab icon: a random Turtle pack pet each time the page opens
    const turtle = ROLLABLE.filter(k => (D.pets[k].p || []).includes('Turtle'));
    const ico = document.querySelector('link[rel="icon"]');
    if (ico && turtle.length) ico.href = `img/pets/${turtle[Math.floor(Math.random() * turtle.length)]}.webp`;
  }

  const S = {
    teams: [Array(5).fill(null), Array(5).fill(null)],
    names: ['Team 1', 'Team 2'],
    bg: 'FieldBattle',
    settings: { turn: 10, rolls: 0, battles: 5, foodEaten: 0, transforms: 0, goldSpent: 0, summoned: 0, lvl3Sold: 0, fixedSeed: false, seed: 1234, speed: 1 },
    rnd: { pack: 'All', maxTier: 6, size: 5, levels: true, perks: true, bonus: 8, theme: 'Random' },
  };
  let perkQuery = '';
  function save() { try { localStorage.setItem('sap-sandbox', JSON.stringify({ teams: S.teams, names: S.names, bg: S.bg, settings: S.settings, rnd: S.rnd })); } catch (e) { } }
  function load() {
    let st = null;
    try { if (/^#[tr]=/.test(location.hash)) st = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(3))))); } catch (e) { }
    if (!st) try { st = JSON.parse(localStorage.getItem('sap-sandbox') || 'null'); } catch (e) { }
    if (st) {
      if (st.teams) S.teams = st.teams.map(t => Array.from({ length: 5 }, (_, i) => (t[i] && D.pets[t[i].id] ? t[i] : null)));
      if (st.names) S.names = st.names;
      if (st.bg && D.bgs.includes(st.bg)) S.bg = st.bg;
      if (st.settings) Object.assign(S.settings, st.settings);
      if (st.rnd) Object.assign(S.rnd, st.rnd);
      // shared values used to be per pet: an older save or link's pet value becomes the Settings one
      for (const key of SHARED_CTX) {
        const p = S.teams.flat().find(x => x && x.ctx && x.ctx[key] != null && x.ctx[key] !== '');
        if (p) S.settings[key] = +p.ctx[key];
        for (const x of S.teams.flat()) if (x && x.ctx) delete x.ctx[key];
      }
      return true;
    }
    return false;
  }
  const newPet = id => ({ id, atk: D.pets[id].a, hp: D.pets[id].h, xp: 0, perk: null });

  // ------------------------------------------------------------------ stage scaling
  const stage = $('#stage');
  let scale = 1;
  function fit() {
    scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    stage.style.transform = `scale(${scale})`;
  }
  window.addEventListener('resize', fit);
  const toStage = (cx, cy) => { const r = stage.getBoundingClientRect(); return [(cx - r.left) / scale, (cy - r.top) / scale]; };

  // ------------------------------------------------------------------ geometry
  const PET_W = 104, PET_H = 150, TOP = 255; // pets stand on the path like in the game (feet about 3/4 down it)
  const slotX = (side, i) => (side === 0 ? 578 - i * 114 : 702 + i * 114) - PET_W / 2;
  const center = (side, i) => [slotX(side, i) + PET_W / 2, TOP + 70];

  // ------------------------------------------------------------------ pet element
  function petEl(side, d) {
    const e = el('div', { class: `pet side-${side}` });
    e.innerHTML = `<div class="lvl"><span class="lt"></span><div class="xp"></div></div>
      <div class="shadow"></div><div class="sprite-wrap"><img class="sprite" alt=""></div>
      <div class="perk"><img alt=""></div><div class="mana"></div><div class="trig" title=""><img src="${UI('Lightning')}" alt=""><span></span></div>
      <div class="stats"><div class="stat atk"><img src="${UI('Fist')}" alt=""><span></span></div><div class="stat hp"><img src="${UI('Heart_1')}" alt=""><span></span></div></div>`;
    updatePetEl(e, d, true);
    return e;
  }
  function updatePetEl(e, d, first) {
    if (e.dataset.id !== d.id) { e.dataset.id = d.id; $('.sprite', e).src = petImg(d.id); }
    const a = $('.atk span', e), h = $('.hp span', e);
    if (a.textContent !== String(d.a)) { a.textContent = d.a; if (!first) flash(a.parentNode); }
    if (h.textContent !== String(d.h)) { h.textContent = d.h; if (!first) flash(h.parentNode); }
      a.classList.toggle('w3', String(d.a).length > 2); h.classList.toggle('w3', String(d.h).length > 2);
    const lv = lvlOf(d.x);
    $('.lt', e).textContent = 'Lvl ' + lv;
    const pips = lv === 1 ? 2 : lv === 2 ? 3 : 0;
    const filled = lv === 1 ? d.x : lv === 2 ? d.x - 2 : 0;
    $('.xp', e).innerHTML = Array.from({ length: pips }, (_, i) => `<i class="${i < filled ? 'on' : ''}"></i>`).join('');
    const pk = $('.perk', e);
    if ((pk.dataset.p || '') !== (d.p || '')) {
      pk.dataset.p = d.p || '';
      pk.classList.toggle('on', !!d.p);
      if (d.p) $('img', pk).src = foodImg(d.p);
    }
    const tg = $('.trig', e), tr = d.tr;
    if (!tr) { tg.className = 'trig'; }
    else {
      const txt = tr.need ? `${tr.cnt}/${tr.need}` : String(tr.left);
      const sp = $('span', tg);
      const changed = sp.textContent !== txt && sp.textContent && !first;
      sp.textContent = txt;
      tg.className = 'trig on' + (tr.need ? ' count' : '') + (tr.left === 0 ? ' spent' : '');
      if (changed) flash(tg);
      tg.title = tr.need ? `Counter: ${tr.cnt} of ${tr.need} toward the next activation` : `${tr.left} of ${tr.max} activations left this battle`;
    }
    const mn = $('.mana', e);
    mn.classList.toggle('on', d.m > 0); mn.textContent = d.m > 0 ? d.m : '';
  }
  function flash(n) { n.classList.remove('flash'); void n.offsetWidth; n.classList.add('flash'); }

  // ------------------------------------------------------------------ edit mode rendering
  const arena = $('#arena');
  function renderEdit() {
    arena.innerHTML = '';
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i < 5; i++) {
        const slot = el('div', { class: 'slot' + (i === 0 ? ' front' : '') });
        slot.style.left = slotX(s, i) + 'px'; slot.style.top = TOP + 'px';
        slot.dataset.side = s; slot.dataset.i = i;
        slot.addEventListener('click', () => openPicker(s, i));
        arena.append(slot);
        const p = S.teams[s][i];
        if (!p) { slot.style.display = ''; continue; }
        slot.style.visibility = 'hidden';
        const e = petEl(s, { id: p.id, a: p.atk, h: p.hp, x: p.xp, p: p.perk, m: p.mana || 0, tr: editTrig(p.id, lvlOf(p.xp)) });
        e.style.left = slotX(s, i) + 'px'; e.style.top = TOP + 'px';
        e.dataset.side = s; e.dataset.i = i;
        const st = STATUS[p.id];
        if (st && st.status === 'unsupported') { const w = el('div', { class: 'warn ol' }, '!'); e.append(w); }
        attachDrag(e, s, i);
        attachTip(e, () => tipFor(p.id, lvlOf(p.xp), p.perk, p.ctx, undefined, { atk: p.atk, hp: p.hp }));
        arena.append(e);
      }
    }
    $$('.tname').forEach((n, k) => { if (document.activeElement !== n) n.textContent = S.names[k]; });
    save();
  }

  // drag reorder (also across teams)
  function attachDrag(e, s, i) {
    e.addEventListener('pointerdown', ev => {
      if (!document.body.classList.contains('edit') || ev.button !== 0) return;
      ev.preventDefault();
      const [sx, sy] = toStage(ev.clientX, ev.clientY);
      const ox = sx - parseFloat(e.style.left), oy = sy - parseFloat(e.style.top);
      let dragging = false, target = null;
      e.setPointerCapture(ev.pointerId);
      const move = m => {
        const [x, y] = toStage(m.clientX, m.clientY);
        if (!dragging && Math.hypot(x - sx, y - sy) > 7) { dragging = true; e.classList.add('dragging'); hideTip(); }
        if (!dragging) return;
        e.style.left = (x - ox) + 'px'; e.style.top = (y - oy) + 'px';
        target = null; let best = 80;
        for (let ss = 0; ss < 2; ss++) for (let ii = 0; ii < 5; ii++) {
          const [cx, cy] = center(ss, ii); const dd = Math.hypot(cx - x, cy - y);
          if (dd < best) { best = dd; target = [ss, ii]; }
        }
        $$('.slot').forEach(sl => sl.classList.toggle('drop', !!target && +sl.dataset.side === target[0] && +sl.dataset.i === target[1]));
      };
      const up = () => {
        e.removeEventListener('pointermove', move); e.removeEventListener('pointerup', up); e.removeEventListener('pointercancel', up);
        if (!dragging) { openEditor(s, i); return; }
        if (target && !(target[0] === s && target[1] === i)) {
          const [ts, ti] = target;
          const tmp = S.teams[ts][ti]; S.teams[ts][ti] = S.teams[s][i]; S.teams[s][i] = tmp;
        }
        renderEdit();
      };
      e.addEventListener('pointermove', move); e.addEventListener('pointerup', up); e.addEventListener('pointercancel', up);
    });
  }

  // tooltip
  const tip = $('#tooltip');
  function attachTip(node, fn) {
    node.addEventListener('pointerenter', ev => { if (ev.pointerType === 'touch') return; tip.innerHTML = fn(); tip.hidden = false; posTip(node); });
    node.addEventListener('pointerleave', hideTip);
  }
  function posTip(node) {
    const r = node.getBoundingClientRect(); const sr = stage.getBoundingClientRect();
    let x = (r.left - sr.left) / scale + r.width / scale / 2 - 150, y = (r.top - sr.top) / scale - tip.offsetHeight - 8;
    if (y < 4) y = (r.bottom - sr.top) / scale + 8;
    tip.style.left = Math.max(4, Math.min(1276 - 300, x)) + 'px'; tip.style.top = y + 'px';
  }
  function hideTip() { tip.hidden = true; }
  // "3 foods eaten this turn", "Swallowed Slug"... for pets that use this-turn values
  function ctxLines(id, ctx, swallowedNow) {
    const out = [];
    for (const key of ctxKeys(id)) {
      if (key === 'swallowed') {
        const sw = swallowedNow !== undefined ? swallowedNow : ctx && ctx.swallowed;
        out.push(sw && D.pets[sw] ? `Swallowed <b>${esc(D.pets[sw].n)}</b>` : 'Nothing swallowed');
        continue;
      }
      const shared = SHARED_CTX.has(key);
      const own = !shared && ctx && ctx[key] != null && ctx[key] !== '';
      const n = own ? +ctx[key] : S.settings[key];
      const txt = { rolls: `${n} roll${n === 1 ? '' : 's'} this turn`, foodEaten: `${n} food${n === 1 ? '' : 's'} eaten this turn`, summoned: `${n} friend${n === 1 ? '' : 's'} summoned this turn`,
        battles: `${n} battle${n === 1 ? '' : 's'} fought`, turn: `Turn ${n}`, transforms: `${n} transformation${n === 1 ? '' : 's'} this turn`,
        goldSpent: `${n} gold spent this turn`, lvl3Sold: `${n} level 3 pet${n === 1 ? '' : 's'} sold` }[key];
      out.push(txt + (own || shared ? '' : ' <i>(Settings)</i>'));
    }
    return out.length ? `<br><span style="color:#2f6f2a">${out.join(' · ')}</span>` : '';
  }
  // abilities worked out from the pet's own attack / health: show the number they come to right now
  const MIN1 = new Set(['Badger', 'PygmyHippo', 'OrchidMantis', 'Rooster']);
  function currentValue(id, lv, atk, hp) {
    if (atk == null || hp == null) return '';
    const t = COMPILED.normText((D.pets[id] || {}).ab ? D.pets[id].ab[lv - 1] || '' : '');
    const f = (v, pc) => { const n = Math.floor(v * pc / 100); return MIN1.has(id) ? Math.max(1, n) : n; };
    let m;
    if ((m = t.match(/(\d+)% of health as damage/i))) return f(hp, +m[1]);
    if ((m = t.match(/(\d+)% (?:of )?attack damage/i))) return f(atk, +m[1]);
    if ((m = t.match(/(\d+)% (?:of )?attack and health/i)) || (m = t.match(/with (\d+)% attack and health/i))) return `${f(atk, +m[1])}/${f(hp, +m[1])}`;
    if ((m = t.match(/(\d+)% (?:of )?attack(?! and| from)/i))) return f(atk, +m[1]);
    if ((m = t.match(/\+(\d+)% health/i))) return f(hp, +m[1]);
    return '';
  }
  function tipFor(id, lv, perk, ctx, swallowedNow, stats) {
    const d = D.pets[id]; const st = STATUS[id];
    const tl = trigLabel(id);
    let h = `<b>${esc(d.n)}</b> · Tier ${d.t}<br>`;
    if (d.ab[lv - 1]) {
      h += `${tl ? `<b>${esc(tl)}</b> → ` : ''}${fmtAbility(d.ab[lv - 1])}`;
      if (limitText(id, lv)) h += ` <i>${limitText(id, lv)}</i>`;
    } else h += '<i>No ability</i>';
    if (st.status === 'unsupported') h += `<br><span style="color:#b3261e">Battle ability not simulated.</span>`;
    else if (st.status === 'shop') h += `<br><span style="color:#7a6a55">${noBattleText(id)}</span>`;
    else if (st.status === 'passive') h += `<br><span style="color:#2f6f2a">Passive: always active in battle.</span>`;
    if (perk) h += `<br><b>${esc(perkName(perk))}</b>: ${fmtAbility(perkDesc(perk))}`;
    h += ctxLines(id, ctx, swallowedNow);
    const cv = stats ? currentValue(id, lv, stats.atk, stats.hp) : '';
    if (cv !== '') h += `<br><span style="color:#b04a00"><b>Current Value:</b> ${cv}</span>`;
    return h;
  }

  // ------------------------------------------------------------------ modal helpers
  const modal = $('#modal'), panel = $('#panel');
  function openModal(cls, build) {
    hideTip();
    panel.className = 'panel ' + cls; panel.innerHTML = '';
    build(panel);
    const x = el('button', { class: 'close', title: 'Close', onclick: closeModal }, el('img', { src: UI('Cross'), alt: '' }));
    panel.append(x);
    modal.hidden = false;
  }
  function closeModal() { modal.hidden = true; panel.innerHTML = ''; renderEdit(); }
  $('.modal-backdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 1800); }

  // ------------------------------------------------------------------ picker
  const pickerState = { tier: 1, pack: 'All', q: '', tokens: false };
  function openPicker(side, i, replace) {
    openModal('picker', p => {
      p.append(el('div', { class: 'head' }, el('h2', {}, replace ? 'Change pet' : 'Choose a pet')));
      const filters = el('div', { class: 'filters' });
      const tabs = ['All', 1, 2, 3, 4, 5, 6, 'Tokens'];
      for (const t of tabs) {
        const b = el('button', { class: 'tier-tab' }, typeof t === 'number' ? 'Tier ' + t : t);
        b.addEventListener('click', () => { pickerState.tier = t; draw(); });
        b.dataset.t = t; filters.append(b);
      }
      const search = el('input', { class: 'search', placeholder: 'Search pets, abilities or triggers…', value: pickerState.q });
      search.addEventListener('input', () => { pickerState.q = search.value; draw(); });
      filters.append(search);
      const packs = el('div', { class: 'filters' });
      for (const pk of ['All'].concat(PACKS, ['Other'])) {
        const b = el('button', { class: 'chip' }, pk === 'All' ? 'All packs' : pk);
        b.dataset.pk = pk; b.addEventListener('click', () => { pickerState.pack = pk; draw(); });
        packs.append(b);
      }
      const body = el('div', { class: 'body' }); const grid = el('div', { class: 'grid' }); body.append(grid);
      p.append(filters, packs, body);
      function draw() {
        $$('.tier-tab', filters).forEach(b => b.classList.toggle('on', String(b.dataset.t) === String(pickerState.tier)));
        $$('.chip', packs).forEach(b => b.classList.toggle('on', b.dataset.pk === pickerState.pack));
        const q = pickerState.q.trim().toLowerCase();
        let list = Object.keys(D.pets).filter(k => {
          const d = D.pets[k];
          if (q) { // name, ability text or trigger ("faint", "start of battle", "hurt"...); every word must match
            const trig = (trigLabel(k) || '').toLowerCase();
            const hay = (d.n + ' ' + COMPILED.normText(d.ab[0] || '') + ' ' + trig).toLowerCase();
            return trig.includes(q) || hay.includes(q) || q.split(/\s+/).every(w => hay.includes(w));
          }
          if (pickerState.tier === 'Tokens') return !d.r;
          if (!d.r) return false;
          if (pickerState.tier !== 'All' && d.t !== pickerState.tier) return false;
          if (pickerState.pack === 'Other') return !d.p;
          if (pickerState.pack !== 'All') return (d.p || []).includes(pickerState.pack);
          return true;
        });
        list.sort((a, b) => D.pets[a].t - D.pets[b].t || D.pets[a].n.localeCompare(D.pets[b].n));
        grid.innerHTML = '';
        if (!list.length) grid.append(el('div', { class: 'section-title' }, pickerState.pack === 'Puppy' ? 'No pack list available for this pack — use All packs.' : 'No pets match.'));
        let lastTier = null;
        for (const k of list) {
          const d = D.pets[k];
          if (pickerState.tier === 'All' && !q && d.t !== lastTier) { lastTier = d.t; grid.append(el('div', { class: 'section-title' }, 'Tier ' + d.t)); }
          const st = STATUS[k].status;
          const card = el('div', { class: 'pcard' },
            el('img', { class: 'sp', src: petImg(k), alt: '', loading: 'lazy' }),
            el('div', { class: 'pname' }, d.n),
            el('div', { class: 'pst' }, el('img', { src: UI('Fist'), alt: '' }), String(d.a), el('img', { src: UI('Heart_1'), alt: '' }), String(d.h)),
            el('div', { class: 'tier' }, 'T' + d.t));
          if (st === 'shop' && CARRIES_OVER.has(k)) card.append(el('div', { class: 'tag good', title: 'Set its shop result in the pet editor' }, 'set in editor'));
          else if (st === 'shop') card.append(el('div', { class: 'tag', title: noBattleText(k) }, STATUS[k].goldShop ? 'no battle effect' : 'shop'));
          else if (st === 'passive') card.append(el('div', { class: 'tag good', title: 'Passive: always active in battle' }, 'passive'));
          card.addEventListener('click', () => {
            const old = S.teams[side][i];
            S.teams[side][i] = replace && old ? Object.assign(newPet(k), { xp: old.xp, perk: old.perk }) : newPet(k);
            closeModal();
            if (replace) openEditor(side, i);
          });
          attachTip(card, () => tipFor(k, 1, null, null, undefined, { atk: d.a, hp: d.h }));
          grid.append(card);
        }
        body.scrollTop = 0;
      }
      draw();
      setTimeout(() => search.focus(), 50);
    });
  }

  // ------------------------------------------------------------------ editor
  function openEditor(side, i) {
    perkQuery = '';
    const p = S.teams[side][i]; if (!p) return;
    openModal('editor', panel => {
      const d = D.pets[p.id];
      const draw = () => {
        panel.querySelectorAll(':scope > :not(.close)').forEach(n => n.remove());
        const lv = lvlOf(p.xp);
        const st = STATUS[p.id];
        panel.prepend(el('div', { class: 'head' }, el('h2', {}, d.n), el('div', { class: 'ol', style: 'font-size:20px;margin-left:auto;margin-right:40px' }, `Tier ${d.t}${d.p ? ' · ' + d.p.join(', ') + ' Pack' : ''}`)));
        const body = el('div', { class: 'body' });
        const top = el('div', { class: 'ed-top' });
        const spr = el('div', { class: 'ed-sprite' }, el('img', { class: 'big', src: petImg(p.id), alt: '', style: side === 0 ? 'transform:scaleX(-1)' : '' }));
        if (p.perk) spr.append(el('img', { class: 'perk-badge', src: foodImg(p.perk), alt: '' }));
        const info = el('div');
        const tl = trigLabel(p.id);
        info.append(el('div', { class: 'ed-meta' }, `Base ${d.a}/${d.h}` + (tl ? ` · Trigger: ${tl}` : '')));
        for (let k = 0; k < 3; k++) {
          const txt = d.ab[k];
          const row = el('div', { class: 'ab-level' + (k + 1 === lv ? ' cur' : '') });
          row.innerHTML = `<span class="lv">Lvl ${k + 1}</span><span>${txt ? `${tl ? `<b class="trig">${esc(tl)}</b> → ` : ''}${fmtAbility(txt)}${limitText(p.id, k + 1) ? ` <i>${limitText(p.id, k + 1)}</i>` : d.fp && d.fp[k] ? ` <i>${esc(d.fp[k])}</i>` : ''}` : '<i>No ability.</i>'}</span>`;
          info.append(row);
        }
        if (st.status === 'unsupported') info.append(el('div', { class: 'support-note' }, "This pet's battle ability isn't simulated yet, so it fights with stats only."));
        else if (st.status === 'shop' && CARRIES_OVER.has(p.id)) info.append(el('div', { class: 'support-note good' }, 'Shop ability, but what it did this turn carries into the battle: set it under "This turn" below.'));
        else if (st.status === 'shop') info.append(el('div', { class: 'support-note shop' }, !st.goldShop ? 'This ability only works in the shop, so it has no effect in battle (same as the game).' : 'This ability triggers in battle, but it only affects gold or the shop, so it changes nothing in the fight.'));
        else if (st.status === 'passive') info.append(el('div', { class: 'support-note good' }, 'Passive ability: always active in battle.'));
        if (ctxKeys(p.id).length) info.append(el('div', { class: 'support-note good' }, ctxKeys(p.id).every(k => SHARED_CTX.has(k))
          ? 'Set what happened in the shop this turn below. It’s shared with Settings and every pet that uses it.'
          : 'Set what happened in the shop this turn below (blank uses Settings).'));
        top.append(spr, info);
        body.append(top);

        const ctr = el('div', { class: 'ed-controls' });
        const stepper = (label, key, icon) => {
          const c = el('div', { class: 'ctl' }, el('label', {}, label));
          const max = key === 'mana' ? 50 : Engine.capOf(p.id, key);
          const inp = el('input', { type: 'number', min: key === 'hp' ? 1 : 0, max, value: p[key] });
          const set = v => { p[key] = Math.max(key === 'hp' ? 1 : 0, Math.min(max, v | 0)); inp.value = p[key]; save(); if (key === 'mana') draw(); };
          inp.addEventListener('change', () => set(+inp.value));
          const minus = el('button', {}, '−'), plus = el('button', {}, '+');
          minus.addEventListener('click', () => set(p[key] - 1)); plus.addEventListener('click', () => set(p[key] + 1));
          c.append(el('div', { class: 'stepper' }, minus, el('div', { class: 'val ' + key }, el('img', { src: UI(icon), alt: '' }), inp), plus));
          return c;
        };
        ctr.append(stepper('Attack', 'atk', 'Fist'), stepper('Health', 'hp', 'Heart_1'));
        if (p.mana == null) p.mana = 0;
        const xpc = el('div', { class: 'ctl' }, el('label', {}, 'Experience'));
        const pick = el('div', { class: 'xp-pick' });
        for (let x = 1; x <= 5; x++) {
          const b = el('button', { class: x <= p.xp ? 'on' : '', title: `${x} experience` });
          b.addEventListener('click', () => { p.xp = p.xp === x ? x - 1 : x; save(); draw(); });
          pick.append(b); if (x === 2) pick.append(el('span', { class: 'sep' }));
        }
        xpc.append(pick, el('div', { class: 'lvl-read ol' }, `Level ${lv}` + (lv < 3 ? ` · ${p.xp}/${lv === 1 ? 2 : 5} xp` : ' · max')));
        ctr.append(xpc);
        const mc = stepper('Mana', 'mana', 'Mana'); mc.title = 'Starting mana (what Mana Potions give)'; ctr.append(mc);
        body.append(ctr);
        // shop / turn values this pet's ability uses
        const keys = ctxKeys(p.id);
        if (keys.length) {
          const box = el('div', { class: 'ctl ctx-box' }, el('label', {}, 'This turn'));
          const rows = el('div', { class: 'ctx-rows' });
          for (const key of keys) {
            if (key === 'swallowed') {
              const sel = el('select', { class: 'cb-select ctx-pet' });
              sel.append(el('option', { value: '' }, 'Nothing swallowed'));
              for (const k of ROLLABLE.slice().sort((a, b) => D.pets[a].n.localeCompare(D.pets[b].n))) sel.append(el('option', { value: k }, `${D.pets[k].n} (T${D.pets[k].t})`));
              sel.value = (p.ctx && p.ctx.swallowed) || '';
              sel.addEventListener('change', () => { p.ctx = Object.assign({}, p.ctx, { swallowed: sel.value || undefined }); save(); draw(); });
              const pic = (p.ctx && p.ctx.swallowed) ? el('img', { class: 'ctx-pic', src: petImg(p.ctx.swallowed), alt: '' }) : null;
              rows.append(el('div', { class: 'ctx-row' }, el('span', {}, p.id === 'WhiteWhale' ? 'Swallowed shop pet (released on faint)' : 'Swallowed shop pet (a 1/1 copy goes to the opponent on faint)'), pic, sel));
              continue;
            }
            const [label, min, max] = CTX_LABEL[key];
            if (SHARED_CTX.has(key)) {
              // one value for the whole battle: this edits Settings, and every pet that uses it follows
              const inp = el('input', { type: 'number', class: 'cb-num', min, max, value: S.settings[key] });
              inp.title = 'Same value as in Settings; changing it here changes it for every pet';
              inp.addEventListener('change', () => {
                S.settings[key] = Math.max(min, Math.min(max, inp.value | 0)); inp.value = S.settings[key];
                for (const x of S.teams.flat()) if (x && x.ctx) delete x.ctx[key];
                save();
              });
              rows.append(el('div', { class: 'ctx-row' }, el('span', {}, label, el('small', {}, ' (all pets, same as Settings)')), inp));
              continue;
            }
            const v = p.ctx && p.ctx[key] != null ? p.ctx[key] : '';
            const inp = el('input', { type: 'number', class: 'cb-num', min, max, value: v, placeholder: String(S.settings[key]) });
            inp.addEventListener('change', () => {
              const n = inp.value === '' ? undefined : Math.max(min, Math.min(max, inp.value | 0));
              p.ctx = Object.assign({}, p.ctx, { [key]: n }); if (n != null) inp.value = n; save();
            });
            rows.append(el('div', { class: 'ctx-row' }, el('span', {}, label), inp));
          }
          box.append(rows); body.append(box);
        }

        const pc = el('div', { class: 'ctl', style: 'margin-top:14px;align-items:stretch' });
        const cur = el('div', { class: 'perk-cur' });
        cur.innerHTML = p.perk ? `<img src="${foodImg(p.perk)}" alt=""><span><b>${esc(perkName(p.perk))}</b>: <span style="font-family:Pangolin;font-size:15px">${fmtAbility(perkDesc(p.perk))}</span></span>` : '<span>No perk or ailment.</span>';
        pc.append(el('label', {}, 'Perk / ailment'), cur);
        const psearch = el('input', { class: 'search perksearch', placeholder: 'Search perks and ailments…', value: perkQuery });
        pc.append(psearch);
        const grid = el('div', { class: 'perkgrid' });
        const noMatch = el('div', { class: 'perk-nomatch', hidden: '' }, 'No perks match.');
        const none = el('div', { class: 'perkcell none' + (!p.perk ? ' on' : '') }, 'None');
        none.addEventListener('click', () => { p.perk = null; save(); draw(); });
        grid.append(none);
        for (const k of FOOD_PERKS.concat(AILMENT_LIST)) {
          const c = el('div', { class: 'perkcell' + (p.perk === k ? ' on' : '') }, el('img', { src: foodImg(k), alt: '', loading: 'lazy' }), perkName(k));
          c.addEventListener('click', () => { p.perk = k; save(); draw(); });
          attachTip(c, () => `<b>${esc(perkName(k))}</b><br>${fmtAbility(perkDesc(k))}`);
          c.dataset.q = (perkName(k) + ' ' + k + ' ' + (AILMENT_LIST.includes(k) ? 'ailment ' : 'perk food ') + String(perkDesc(k) || '').replace(/<[^>]+>|\{[^}]*\}/g, ' ')).toLowerCase();
          grid.append(c);
        }
        const filterPerks = () => {
          const q = perkQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
          let shown = 0;
          for (const c of grid.querySelectorAll('.perkcell')) {
            const hit = c.classList.contains('none') ? !q.length : q.every(w => c.dataset.q.includes(w));
            c.hidden = !hit; if (hit) shown++;
          }
          noMatch.hidden = shown > 0;
        };
        psearch.addEventListener('input', () => { perkQuery = psearch.value; filterPerks(); });
        psearch.addEventListener('keydown', e => { if (e.key === 'Escape' && psearch.value) { e.stopPropagation(); psearch.value = perkQuery = ''; filterPerks(); } });
        filterPerks();
        pc.append(grid, noMatch);
        body.append(pc);
        panel.insertBefore(body, panel.querySelector('.close'));
        const acts = el('div', { class: 'ed-actions' });
        const btn = (txt, icon, fn, cls = '') => { const b = el('button', { class: 'obtn ' + cls }, el('img', { src: UI(icon), alt: '' }), el('span', {}, txt)); b.addEventListener('click', fn); return b; };
        acts.append(
          btn('Change pet', 'Refresh', () => openPicker(side, i, true), 'ghost'),
          btn('Reset stats', 'Replay', () => { p.atk = d.a; p.hp = d.h; save(); draw(); }, 'ghost'),
          btn('Remove', 'Cross', () => { S.teams[side][i] = null; closeModal(); }, 'ghost'),
          btn('Done', 'Checkmark', closeModal));
        panel.insertBefore(acts, panel.querySelector('.close'));
      };
      draw();
    });
  }

  // ------------------------------------------------------------------ randomize
  // ------------------------------------------------------------------ team themes (synergy)
  // core = pets that do the thing, support = pets that pay off on it (Albatross for snipes, Turkey for summons,
  // Lusca / Caladrius for mana...). Worked out from ability text and triggers.
  const abText = k => COMPILED.normText((D.pets[k].ab || []).find(Boolean) || '');
  const trigOf = k => (STATUS[k] && STATUS[k].trigger) || '';
  const THEMES = {
    Snipe: { core: k => /deal \d+ damage to (?!itself|the nearest friend|adjacent friends|friends|all pets)/i.test(abText(k)) || /damage to (one|two|three) random enem/i.test(abText(k)),
      support: k => /ability damage|repeats? their ability/i.test(abText(k)) || (/^Count:FriendFaints/.test(trigOf(k)) && /damage/i.test(abText(k))), perks: ['Chili', 'MeatBone', 'Garlic'] },
    Summon: { core: k => /\bsummon\b/i.test(abText(k)) && !/for the (enemy|opponent)/i.test(abText(k)),
      support: k => /^(FriendSummoned|BeeSummoned)$/.test(trigOf(k)), perks: ['Honey', 'Mushroom', 'Popcorn'] },
    Faint: { core: k => /^(Faint|BeforeFaint)$/.test(trigOf(k)),
      support: k => /^(FriendFaints|FriendAheadFaints|Count:FriendFaints)/.test(trigOf(k)) || /repeats? their ability/i.test(abText(k)), perks: ['Mushroom', 'Honey'] },
    Mana: { core: k => /(gain|give|gives).{0,40}\bmana\b/i.test(abText(k)) && !/(spend|replace|per mana|for each mana)/i.test(abText(k)),
      support: k => (/(spend|replace|per mana|for each mana|mana on)/i.test(abText(k)) && /mana/i.test(abText(k))) || trigOf(k) === 'GainsMana', perks: [] },
    Hurt: { core: k => /Hurt/.test(trigOf(k)),
      support: k => /damage to (itself|the nearest friend|adjacent friends|friends|all pets|all friends|.*friends? (ahead|behind))/i.test(abText(k)), perks: ['Melon', 'Garlic', 'Coconut'] },
    Trumpet: { core: k => /(gain|give).{0,30}trumpet/i.test(abText(k)), support: k => /spend.{0,20}trumpet/i.test(abText(k)), perks: [] },
    Strawberry: { core: k => /strawberry/i.test(abText(k)), support: k => /strawberry/i.test(abText(k)) && /(friend|it\b)/i.test(abText(k)), perks: ['Strawberry'] },
    Food: { core: k => /(Ate|Eats)/.test(trigOf(k)), support: k => /\bfeed\b/i.test(abText(k)), perks: [] },
    'Level-up': { core: k => /LevelUp|GainedXp/.test(trigOf(k)), support: k => /experience/i.test(abText(k)), perks: [] },
  };
  const THEME_NAMES = Object.keys(THEMES);
  const ORDER = window.SAPOrder.create(D, STATUS, COMPILED.normText);
  const battleReady = k => STATUS[k] && ['ok', 'passive'].includes(STATUS[k].status);
  const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];
  function themedPicks(pool, size, themeName) {
    const ready = pool.filter(battleReady);
    const options = (themeName && THEMES[themeName] ? [themeName] : THEME_NAMES).map(n => {
      const th = THEMES[n];
      return { n, core: ready.filter(th.core), sup: ready.filter(th.support) };
    }).filter(o => o.core.length >= 2 || (o.n === themeName && o.core.length));
    if (!options.length) return null;
    const ch = pickOne(options);
    const used = new Set(); const take = (arr) => { const left = arr.filter(k => !used.has(k)); const k = pickOne(left.length ? left : arr); used.add(k); return k; };
    const nSup = size >= 4 ? 2 : size >= 2 ? 1 : 0;
    const sup = []; for (let i = 0; i < nSup && ch.sup.length; i++) sup.push(take(ch.sup));
    const core = []; while (core.length + sup.length < size) core.push(take(ch.core.length ? ch.core : ready));
    // core pets up front, support behind them; adjacency supports (Albatross, Tiger) sit right behind a core pet
    const adj = sup.filter(k => /adjacent|friend ahead repeats|repeats? their ability/i.test(abText(k)));
    const rest = sup.filter(k => !adj.includes(k));
    const order = core.slice();
    adj.forEach((k, j) => order.splice(Math.min(order.length, 1 + j * 2), 0, k));
    return { theme: ch.n, ids: order.concat(rest), perks: THEMES[ch.n].perks };
  }
  function randomTeam(side) {
    const o = S.rnd;
    let pool = ROLLABLE.filter(k => D.pets[k].t <= o.maxTier && (o.pack === 'All' || (D.pets[k].p || []).includes(o.pack)));
    if (!pool.length) pool = ROLLABLE;
    const themed = o.theme !== 'None' ? themedPicks(pool, o.size, o.theme && o.theme !== 'Random' ? o.theme : null) : null;
    // lineup that sets up the triggers (Shark / Vulture in back, Woodpecker behind hurt pets, Albatross between snipers...)
    const ids = ORDER.bestOrder(themed ? themed.ids : Array.from({ length: o.size }, () => pickOne(pool)));
    const t = Array(5).fill(null);
    ids.forEach((k, i) => {
      const p = newPet(k);
      if (o.levels) p.xp = [0, 0, 0, 1, 2, 2, 3, 5][Math.floor(Math.random() * 8)];
      const lv = lvlOf(p.xp);
      p.atk = Math.min(Engine.capOf(k, 'atk'), p.atk + (lv - 1) + Math.floor(Math.random() * (o.bonus + 1)));
      p.hp = Math.min(Engine.capOf(k, 'hp'), p.hp + (lv - 1) + Math.floor(Math.random() * (o.bonus + 1)));
      if (o.perks && Math.random() < 0.45) {
        const fav = themed && themed.perks.filter(x => BATTLE_PERKS.includes(x));
        p.perk = fav && fav.length && Math.random() < 0.65 ? pickOne(fav) : pickOne(BATTLE_PERKS);
      }
      t[i] = p;
    });
    S.teams[side] = t;
    S.themes = S.themes || [null, null]; S.themes[side] = themed ? themed.theme : null;
    return themed ? themed.theme : null;
  }
  function orderTeam(side) {
    const pets = S.teams[side].filter(Boolean);
    // order pets (not ids, so duplicates and custom pets keep their own stats)
    const byIdx = ORDER.bestOrder(pets.map(p => p.id));
    const left = pets.slice(); const out = byIdx.map(id => left.splice(left.findIndex(p => p.id === id), 1)[0]);
    S.teams[side] = out.concat(Array(5 - out.length).fill(null)); save();
  }
  function openRandomizer(side) {
    openModal('form', p => {
      p.append(el('div', { class: 'head' }, el('h2', {}, `Randomize ${S.names[side]}`)));
      const body = el('div', { class: 'body' });
      const o = S.rnd;
      const row = (label, sub, ctl) => el('div', { class: 'frow' }, el('div', {}, label, sub ? el('small', {}, sub) : null), ctl);
      const sel = (opts, key, conv = x => x) => { const s = el('select'); for (const v of opts) s.append(el('option', { value: v }, String(v))); s.value = o[key]; s.addEventListener('change', () => { o[key] = conv(s.value); save(); }); return s; };
      const tog = key => { const t = el('button', { class: 'toggle' + (o[key] ? ' on' : '') }); t.addEventListener('click', () => { o[key] = !o[key]; t.classList.toggle('on', o[key]); save(); }); return t; };
      body.append(
        row('Team theme', 'Pets that work together (snipe + Albatross, summon + Turkey, mana + Lusca…)', sel(['Random', 'None'].concat(THEME_NAMES), 'theme')),
        row('Pack', 'Pets are drawn from this pack', sel(['All'].concat(PACKS.filter(x => x !== 'Puppy')), 'pack')),
        row('Highest tier', 'Pets up to this shop tier', sel([1, 2, 3, 4, 5, 6], 'maxTier', Number)),
        row('Team size', null, sel([1, 2, 3, 4, 5], 'size', Number)),
        row('Bonus stats', 'Random extra attack/health per pet, up to', sel([0, 2, 4, 8, 12, 20, 30], 'bonus', Number)),
        row('Random levels', null, tog('levels')),
        row('Random perks', null, tog('perks')));
      p.append(body);
      const go = el('button', { class: 'obtn' }, el('img', { src: UI('Dice'), alt: '' }), el('span', {}, 'Roll!'));
      const say = th => th ? `${th} team` : 'Random team';
      go.addEventListener('click', () => { const th = randomTeam(side); renderEdit(); toast(`${S.names[side]}: ${say(th)}`); });
      const both = el('button', { class: 'obtn ghost' }, el('span', {}, 'Roll both teams'));
      both.addEventListener('click', () => { const a = randomTeam(0), b = randomTeam(1); renderEdit(); toast(`${say(a)} vs ${say(b)}`); });
      const ord = el('button', { class: 'obtn ghost' }, el('span', {}, 'Best order'));
      ord.title = 'Rearrange this team so its triggers line up (keeps the same pets)';
      ord.addEventListener('click', () => { orderTeam(side); renderEdit(); toast('Team re-ordered'); });
      p.append(el('div', { class: 'rnd-acts' }, ord, both, go));
    });
  }

  // ------------------------------------------------------------------ settings / bg / share
  function openSettings() {
    openModal('form bgsize', p => {
      p.append(el('div', { class: 'head' }, el('h2', {}, 'Settings')));
      const body = el('div', { class: 'body' });
      const o = S.settings;
      const num = (key, min, max) => { const i = el('input', { type: 'number', min, max, value: o[key], style: 'width:90px' }); i.addEventListener('change', () => { o[key] = Math.max(min, Math.min(max, +i.value | 0)); i.value = o[key]; save(); }); return i; };
      const tog = key => { const t = el('button', { class: 'toggle' + (o[key] ? ' on' : '') }); t.addEventListener('click', () => { o[key] = !o[key]; t.classList.toggle('on', o[key]); save(); }); return t; };
      const row = (label, sub, ctl) => el('div', { class: 'frow' }, el('div', {}, label, sub ? el('small', {}, sub) : null), ctl);
      body.append(
        row('Turn number', 'For turn-based abilities (e.g. Werewolf)', num('turn', 1, 40)),
        row('Rolls this turn', 'For roll-based abilities (Fossa, Bunyip, Mana Hound…)', num('rolls', 0, 20)),
        row('Transformations this turn', 'For Giant Pangasius', num('transforms', 0, 10)),
        row('Gold spent this turn', 'For Meerkat', num('goldSpent', 0, 40)),
        row('Friends summoned this turn', 'For Night Crawler', num('summoned', 0, 20)),
        row('Level 3 pets sold', 'For Jersey Devil', num('lvl3Sold', 0, 10)));
      // the sandbox's background
      body.append(el('div', { class: 'section-title', style: 'margin-top:10px' }, 'Background'));
      const g = el('div', { class: 'bggrid' });
      for (const b of D.bgs) {
        const c = el('div', { class: 'bgcell' + (b === S.bg ? ' on' : ''), style: `background-image:url('img/bg/${b}.webp')` }, el('span', {}, b.replace(/Battle$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')));
        c.addEventListener('click', () => { S.bg = b; setBg(); save(); $$('.bgcell', g).forEach(x => x.classList.toggle('on', x === c)); });
        g.append(c);
      }
      body.append(g);
      p.append(body);
      const built = window.SAP_BUILD && new Date(window.SAP_BUILD);
      if (built && !isNaN(built)) {
        const h = built.getHours(), hh = h % 12 || 12, mm = String(built.getMinutes()).padStart(2, '0');
        const yy = String(built.getFullYear()).slice(-2);
        p.append(el('div', { class: 'build-stamp', title: built.toString() }, `Last updated ${hh}:${mm}${h < 12 ? 'AM' : 'PM'} ${built.getMonth() + 1}/${built.getDate()}/${yy}`));
      }
    });
  }
  function setBg() { $('#bg').style.backgroundImage = `url('img/bg/${S.bg}.webp')`; document.body.classList.toggle('bg-white', S.bg === 'WhiteBattle'); }
  function share() {
    // settings travel with the link: shared values like gold spent live only there
    const st = { teams: S.teams, names: S.names, bg: S.bg, settings: S.settings };
    const h = '#t=' + btoa(unescape(encodeURIComponent(JSON.stringify(st))));
    history.replaceState(null, '', h);
    const url = location.href;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Link copied!'), () => toast('Link is in the address bar'));
  }

  // ------------------------------------------------------------------ battle (played by the game itself)
  // "Test Battle" sends both teams to the game bridge (tools/game-bridge), which starts Super Auto Pets if needed and
  // plays them in the game's own debug battle, offline, with the game's engine and animations.
  const BRIDGE = 'http://127.0.0.1:47823';
  const GE = window.SAPGame.data.enums;
  const levelOf = xp => (xp >= 5 ? 3 : xp >= 2 ? 2 : 1);
  // a pet's own "This turn" value from the pet editor, else the Settings one
  const own = (p, k) => p && p.ctx && p.ctx[k] != null && p.ctx[k] !== '';
  function bridgeTeam(t) {
    return t.filter(Boolean).map(p => ({
      enum: +GE.minion[p.id], level: levelOf(p.xp || 0), exp: p.xp || 0, attack: p.atk, health: p.hp, mana: p.mana || 0,
      perk: p.perk != null && p.perk !== '' && GE.perk[p.perk] != null ? +GE.perk[p.perk] : null,
      // foods it ate this turn (MinionModel.SpellCountsThisTurn: Blue Jay, Black Bear, Dung Beetle)
      spells: +(own(p, 'foodEaten') ? p.ctx.foodEaten : S.settings.foodEaten || 0),
    }));
  }
  // one team's BoardModel counters (the game copies team 2's into the battle board's Opponent* fields)
  const BOARD_KEYS = { rolls: 'RollsThisTurn', goldSpent: 'GoldSpent', transforms: 'TransformationsThisTurn', summoned: 'MinionsSummonedThisTurn',
    lvl3Sold: 'MaxLevelMinionsSold', battles: 'Victories' };
  function bridgeBoard(t) {
    const out = {};
    for (const [k, f] of Object.entries(BOARD_KEYS)) { const p = !SHARED_CTX.has(k) && t.find(x => own(x, k)); out[f] = +(p ? p.ctx[k] : S.settings[k] || 0); }
    return out;
  }
  // the battle's turn number (shared: Werewolf and Amphisbaena edit the Settings value)
  const bridgeTurn = () => +(S.settings.turn || 1);
  let sending = false;
  async function testBattle() {
    if (!S.teams[0].some(Boolean) || !S.teams[1].some(Boolean)) { toast('Both teams need at least one pet'); return; }
    if (sending) return;
    const bad = S.teams.flat().filter(p => p && GE.minion[p.id] == null);
    if (bad.length) { toast(`The game has no pet called ${bad[0].id}`); return; }
    const btn = $('#btn-test'); sending = true; btn.classList.add('busy');
    toast('Sending the battle to the game…');
    try {
      const r = await fetch(BRIDGE + '/battle', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        // both teams are stored front pet first. The game fills the player's board from the end of the list (last pet = front),
        // so team 1 goes back to front; the opponent's board is mirrored by the game and takes front-first order
        body: JSON.stringify({ player: bridgeTeam(S.teams[0]).reverse(), opponent: bridgeTeam(S.teams[1]), turn: bridgeTurn(),
          boards: { player: bridgeBoard(S.teams[0]), opponent: bridgeBoard(S.teams[1]) } }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error || 'The bridge returned an error'), { bridge: true });
      toast('Playing in Super Auto Pets');
    } catch (e) {
      if (e.bridge) toast("The game couldn't play this battle: " + e.message);
      else bridgeHelp();
    } finally { sending = false; btn.classList.remove('busy'); }
  }
  // the How to use guide; missing = opened because Test Battle couldn't reach the bridge
  const REPO = 'https://github.com/jaymzhun/SAP-Sandbox';
  function openGuide(missing) {
    openModal('form guide', p => {
      const a = (href, text) => el('a', { href, target: '_blank', rel: 'noopener' }, text);
      const h = t => el('div', { class: 'section-title' }, t);
      p.append(el('div', { class: 'head' }, el('h2', {}, missing ? 'Start the game bridge' : 'How to use')));
      p.append(el('div', { class: 'body' },
        missing ? el('p', { class: 'support-note bad' }, 'Test Battle couldn’t reach the game bridge on this PC. Set it up once with the steps below, then press Test Battle again.') : null,
        h('Build your teams'),
        el('ul', {},
          el('li', {}, 'Click an empty slot to add a pet. Click a pet to change its level, stats, perk and mana.'),
          el('li', {}, 'Drag pets to reorder them. The pets nearest the middle are at the front.'),
          el('li', {}, 'Settings holds the shop values some pets use (rolls, gold spent, turn…). Changing one in a pet’s editor changes it in Settings and for every pet that uses it.'),
          el('li', {}, 'Share copies a link to these teams and settings.')),
        h('Test Battle: play it in the real game'),
        el('p', {}, 'Test Battle plays your teams in Super Auto Pets itself, with the game’s own rules and animations. It needs a little program, the game bridge, running on your PC. One-time setup (Windows only):'),
        el('ol', {},
          el('li', {}, 'Install Super Auto Pets from Steam.'),
          el('li', {}, 'Install ', a('https://www.python.org/downloads/', 'Python 3'), '. In the installer, tick “Add python.exe to PATH”.'),
          el('li', {}, 'Download the sandbox: on ', a(REPO, 'GitHub'), ', press Code → Download ZIP, then unzip it.'),
          el('li', {}, 'Open the tools/game-bridge folder and double-click start-bridge.bat. The first time, it installs Frida, the tool it uses to talk to the game. Keep its window open while you use Test Battle.'),
          el('li', {}, 'Press Test Battle. The game starts if it isn’t open, and plays the battle.')),
        h('Good to know'),
        el('ul', {},
          el('li', {}, 'Your browser may ask to let this site access devices on your local network. Allow it: that’s how the page reaches the bridge.'),
          el('li', {}, 'The battle runs offline inside the game; nothing is sent to the game’s servers. Don’t play online while the bridge is running: close it first.'),
          el('li', {}, 'Some antivirus programs warn about Frida, because it attaches to another program.'),
          el('li', {}, 'A game update can break the bridge until it’s updated. Macs aren’t supported.'),
          el('li', {}, 'Each battle uses a new random seed, so luck-based abilities can differ between runs.'))));
    });
  }
  const bridgeHelp = () => openGuide(true);

  // ------------------------------------------------------------------ wiring
  $('#btn-test').addEventListener('click', testBattle);
  $('#btn-swap').addEventListener('click', () => { S.teams.reverse(); S.names.reverse(); renderEdit(); });
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-share').addEventListener('click', share);
  $('#btn-help').addEventListener('click', () => openGuide(false));
  $$('.team-tools .sbtn').forEach(b => b.addEventListener('click', () => {
    const s = +b.dataset.side;
    if (b.dataset.act === 'random') openRandomizer(s);
    else { S.teams[s] = Array(5).fill(null); renderEdit(); }
  }));
  $$('.tname').forEach((n, k) => {
    n.addEventListener('input', () => { S.names[k] = n.textContent.trim().slice(0, 20) || `Team ${k + 1}`; save(); });
    n.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); n.blur(); } });
  });

  // ------------------------------------------------------------------ boot
  if (!load()) {
    S.teams[0] = [newPet('Ant'), newPet('Fish'), newPet('Cricket'), newPet('Mosquito'), null];
    S.teams[1] = [newPet('Horse'), newPet('Beaver'), newPet('Pig'), newPet('Otter'), null];
  }
  document.body.classList.add('edit');
  fit(); setBg(); renderEdit();
  window.SAP_SANDBOX = { S, STATUS, AB, testBattle, bridgeTeam, bridgeBoard };
})();
