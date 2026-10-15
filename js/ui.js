/* Super Auto Pets sandbox — UI */
(function () {
  'use strict';
  const D = window.SAP_DATA;
  for (const b of ['WhiteBattle', 'DarkGrayBattle']) if (!D.bgs.includes(b)) D.bgs.unshift(b); // plain themes, listed first
  const Engine = window.SAPEngine;
  const COMPILED = window.SAPAbilities.compileAll(D, Engine);
  const AB = COMPILED.abilities, STATUS = COMPILED.status;

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
  const TRIG_LABEL = { EndTurn: 'End turn (Pink Robin)', SOB: 'Start of battle', BeforeBattle: 'Before battle', BeforeAttack: 'Before attack', BeforeFriendAttacks: 'Before friend attacks',
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
  const SETTING_NAMES = { rolls: 'Rolls this turn', turn: 'Turn number', battles: 'Battles fought', foodEaten: 'Food eaten this turn', transforms: 'Transformations this turn', goldSpent: 'Gold spent this turn', lvl3Sold: 'Level 3 pets sold' };
  const SHOP_TRIGGERS = new Set(['Shop', 'None']);

  function noBattleText(id) { if (STATUS[id].endTurn === 'ok') return 'End turn ability: only runs in battle when a Pink Robin activates it.'; return SHOP_TRIGGERS.has(STATUS[id].trigger) ? 'Shop ability: no effect in battle.' : 'Triggers in battle, but only affects gold or the shop.'; }
  function limitAt(id, lv) { const ab = AB[id]; if (!ab || !ab.limit || !ab.levels[lv - 1]) return 0; return Array.isArray(ab.limit) ? ab.limit[lv - 1] || 0 : ab.limit; }
  function editTrig(id, lv) {
    const ab = AB[id]; if (!ab || !ab.levels[lv - 1]) return null;
    const lim = limitAt(id, lv); if (lim) return { left: lim, max: lim };
    if (ab.trigger && ab.trigger.startsWith('Count:')) return { cnt: 0, need: +ab.trigger.split(':')[2] };
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

  const S = {
    teams: [Array(5).fill(null), Array(5).fill(null)],
    names: ['Team 1', 'Team 2'],
    meta: [{ player: 'Player 1', mascot: 'Tyrannosaurus', bg: 'FieldBattle', trophies: 0, lives: 5 }, { player: 'Player 2', mascot: 'Bee', bg: 'FrontYardBattle', trophies: 0, lives: 5 }],
    bg: 'FieldBattle',
    settings: { turn: 10, rolls: 0, battles: 5, foodEaten: 0, transforms: 0, goldSpent: 0, lvl3Sold: 0, fixedSeed: false, seed: 1234, speed: 1 },
    rnd: { pack: 'All', maxTier: 6, size: 5, levels: true, perks: true, bonus: 8 },
    custom: [], // custom pets: { id, name, sprite, tier, atk, hp, trigger, tkey, vals: [[..],[..],[..]], lim: [0,0,0] }
  };
  let pendingReplay = null;
  let perkQuery = '';
  function save() { try { localStorage.setItem('sap-sandbox', JSON.stringify({ teams: S.teams, names: S.names, bg: S.bg, meta: S.meta, settings: S.settings, rnd: S.rnd, custom: S.custom })); } catch (e) { } }
  function load() {
    let st = null;
    try { if (/^#[tr]=/.test(location.hash)) st = JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(3))))); } catch (e) { }
    if (st && location.hash.startsWith('#r=') && st.replay) { pendingReplay = st.replay; st.settings = Object.assign({}, S.settings, st.replay.settings); }
    if (!st) try { st = JSON.parse(localStorage.getItem('sap-sandbox') || 'null'); } catch (e) { }
    if (st) {
      if (Array.isArray(st.custom)) { S.custom = st.custom.filter(c => c && c.id); for (const c of S.custom) registerCustom(c); }
      if (st.teams) S.teams = st.teams.map(t => Array.from({ length: 5 }, (_, i) => (t[i] && D.pets[t[i].id] ? t[i] : null)));
      if (st.names) S.names = st.names;
      if (st.meta) st.meta.forEach((m, k) => { if (m && S.meta[k]) Object.assign(S.meta[k], m); if (!D.bgs.includes(S.meta[k].bg)) S.meta[k].bg = 'FieldBattle'; });
      if (st.bg && D.bgs.includes(st.bg)) S.bg = st.bg;
      if (st.settings) Object.assign(S.settings, st.settings);
      if (st.rnd) Object.assign(S.rnd, st.rnd);
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
  const PET_W = 104, PET_H = 150, TOP = 300;
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
        attachTip(e, () => tipFor(p.id, lvlOf(p.xp), p.perk));
        arena.append(e);
      }
    }
    $$('.tname').forEach((n, k) => { if (document.activeElement !== n) n.textContent = S.names[k]; });
    $$('.sbtn[data-act="look"]').forEach(b => { $('img', b).src = `img/mascot/${S.meta[+b.dataset.side].mascot}_Battle.webp`; });
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
  function tipFor(id, lv, perk) {
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
      const tabs = ['All', 1, 2, 3, 4, 5, 6, 'Tokens', 'Custom'];
      for (const t of tabs) {
        const b = el('button', { class: 'tier-tab' }, t === 'All' || t === 'Tokens' ? t : 'Tier ' + t);
        b.addEventListener('click', () => { pickerState.tier = t; draw(); });
        b.dataset.t = t; filters.append(b);
      }
      const newBtn = el('button', { class: 'tier-tab new-custom', title: 'Build your own pet' }, '+ Custom pet');
      newBtn.addEventListener('click', () => openCustomBuilder(null, { side, i, replace }));
      filters.append(newBtn);
      const search = el('input', { class: 'search', placeholder: 'Search pets or abilities…', value: pickerState.q });
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
          if (q) return d.n.toLowerCase().includes(q) || (d.ab[0] || '').toLowerCase().includes(q);
          if (pickerState.tier === 'Custom') return !!d.custom;
          if (d.custom) return false;
          if (pickerState.tier === 'Tokens') return !d.r;
          if (!d.r) return false;
          if (pickerState.tier !== 'All' && d.t !== pickerState.tier) return false;
          if (pickerState.pack === 'Other') return !d.p;
          if (pickerState.pack !== 'All') return (d.p || []).includes(pickerState.pack);
          return true;
        });
        list.sort((a, b) => D.pets[a].t - D.pets[b].t || D.pets[a].n.localeCompare(D.pets[b].n));
        grid.innerHTML = '';
        if (pickerState.tier === 'Custom' && !q) {
          const nc = el('div', { class: 'pcard newcard' }, el('div', { class: 'plus' }, '+'), el('div', { class: 'pname' }, 'New custom pet'));
          nc.addEventListener('click', () => openCustomBuilder(null, { side, i, replace }));
          grid.append(nc);
          if (!list.length) grid.append(el('div', { class: 'section-title' }, 'No custom pets yet. Make one with the + card.'));
        } else if (!list.length) grid.append(el('div', { class: 'section-title' }, pickerState.pack === 'Puppy' ? 'No pack list available for this pack — use All packs.' : 'No pets match.'));
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
          if (st === 'unsupported') card.append(el('div', { class: 'tag bad', title: 'Battle ability not simulated' }, 'not simulated'));
          else if (st === 'shop') card.append(el('div', { class: 'tag', title: noBattleText(k) }, SHOP_TRIGGERS.has(STATUS[k].trigger) ? 'shop' : 'no battle effect'));
          else if (st === 'passive') card.append(el('div', { class: 'tag good', title: 'Passive: always active in battle' }, 'passive'));
          card.addEventListener('click', () => {
            const old = S.teams[side][i];
            S.teams[side][i] = replace && old ? Object.assign(newPet(k), { xp: old.xp, perk: old.perk }) : newPet(k);
            closeModal();
            if (replace) openEditor(side, i);
          });
          if (d.custom) {
            card.append(el('div', { class: 'tag custom' }, 'custom'));
            const eb = el('button', { class: 'cedit', title: 'Edit custom pet' }, '✎');
            eb.addEventListener('click', ev => { ev.stopPropagation(); openCustomBuilder(k, { side, i, replace }); });
            card.append(eb);
          }
          attachTip(card, () => tipFor(k, 1));
          grid.append(card);
        }
        body.scrollTop = 0;
      }
      draw();
      setTimeout(() => search.focus(), 50);
    });
  }

  // ------------------------------------------------------------------ custom pets
  // Abilities come from every battle ability text in the game (duplicates merged). Numbers in the text become
  // editable values; the edited text is compiled with the original pet's ability code.
  const NUMW = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const SLOT_RE = /(\[\[[^\]]*\]\]|\{\w+\})|(\d+)|\b(one|two|three|four|five)\b/gi;
  function parseTemplate(raw) {
    const parts = []; let last = 0, m; SLOT_RE.lastIndex = 0;
    while ((m = SLOT_RE.exec(raw))) {
      if (m.index > last) parts.push({ t: raw.slice(last, m.index) });
      if (m[1]) parts.push({ t: m[1] });
      else if (m[2]) parts.push({ slot: 'd', v: +m[2] });
      else parts.push({ slot: 'w', v: NUMW.indexOf(m[3].toLowerCase()), cap: /^[A-Z]/.test(m[3]) });
      last = SLOT_RE.lastIndex;
    }
    if (last < raw.length) parts.push({ t: raw.slice(last) });
    const key = parts.map(p => (p.slot ? (p.slot === 'd' ? '#' : '@') : p.t)).join('').toLowerCase();
    return { parts, key, vals: parts.filter(p => p.slot).map(p => p.v) };
  }
  const PLURAL = { enemy: 'enemies', friend: 'friends', pet: 'pets', ally: 'allies' };
  const SINGULAR = Object.fromEntries(Object.entries(PLURAL).map(([a, b]) => [b, a]));
  // keep "one random enemy" / "three random enemies" agreeing with a count in front of it
  const agree = (t, count) => t.replace(/^(\s+(?:(?:random|nearest|other|perk-less|last|first|healthiest|strongest|weakest|most|least|healthy|friendly|adjacent)\s+)*)(enemy|enemies|friend|friends|pet|pets|ally|allies)\b/i,
    (m, pre, noun) => pre + (count > 1 ? PLURAL[noun.toLowerCase()] || noun : SINGULAR[noun.toLowerCase()] || noun));
  function fillTemplate(parts, vals) {
    let k = 0, count = null; const out = [];
    for (const p of parts) {
      if (!p.slot) {
        let t = p.t;
        if (count != null) { t = agree(t, count); count = null; }
        out.push(t); continue;
      }
      const v = vals[k++];
      if (p.slot === 'w') { const n = Math.max(1, Math.min(5, v | 0)); const w = NUMW[n]; count = n; out.push(p.cap ? w[0].toUpperCase() + w.slice(1) : w); }
      else { count = null; out.push(String(Math.max(0, Math.min(999, v | 0)))); }
    }
    return out.join('');
  }
  let TEMPLATES = null;
  function templates() {
    if (TEMPLATES) return TEMPLATES;
    TEMPLATES = new Map();
    for (const k of Object.keys(D.pets).sort((a, b) => (D.pets[b].r || 0) - (D.pets[a].r || 0) || D.pets[a].t - D.pets[b].t || a.localeCompare(b))) {
      const d = D.pets[k]; if (d.custom || !STATUS[k] || STATUS[k].status !== 'ok') continue;
      for (let i = 0; i < 3; i++) {
        if (!AB[k].levels[i] || !d.ab[i]) continue;
        const t = parseTemplate(d.ab[i]);
        if (TEMPLATES.has(t.key)) continue;
        // default values for each level: the source pet's own levels when they read the same, else this level's
        const defaults = [0, 1, 2].map(j => { const o = d.ab[j] && parseTemplate(d.ab[j]); return o && o.key === t.key ? o.vals : t.vals; });
        const plain = COMPILED.normText(fillTemplate(t.parts, t.vals));
        TEMPLATES.set(t.key, { key: t.key, parts: t.parts, src: k, defaults, srcTrig: STATUS[k].trigger, q: (plain + ' ' + d.n).toLowerCase() });
      }
    }
    return TEMPLATES;
  }
  const COUNT_LABEL = { FriendFaints: 'friends faint', EnemyFaints: 'enemies faint', EnemyAttacks: 'enemy attacks', FriendlyAttacks: 'friendly attacks', FriendHurt: 'friends hurt' };
  const TRIG_PICK_LABEL = { Faint: 'Faint (after it leaves the board)', BeforeFaint: 'Faint (while still on the board)' };
  let TRIGS = null;
  function triggerOptions() {
    if (TRIGS) return TRIGS;
    const n = new Map();
    for (const k of Object.keys(AB)) {
      const st = STATUS[k]; if (!st || st.status !== 'ok' || D.pets[k].custom) continue;
      const t = st.trigger; if (!t || SHOP_TRIGGERS.has(t) || t === 'Passive') continue;
      const base = t.startsWith('Count:') ? 'Count:' + t.split(':')[1] : t;
      n.set(base, (n.get(base) || 0) + 1);
    }
    const label = b => b.startsWith('Count:') ? 'Counter: every N ' + COUNT_LABEL[b.split(':')[1]] : (TRIG_PICK_LABEL[b] || TRIG_LABEL[b] || b);
    TRIGS = [...n.keys()].map(b => ({ code: b, label: label(b) })).sort((a, b) => a.label.localeCompare(b.label));
    return TRIGS;
  }
  function customTexts(cp) {
    const T = templates().get(cp.tkey); if (!T) return null;
    return [0, 1, 2].map(i => fillTemplate(T.parts, (cp.vals && cp.vals[i]) || T.defaults[i]));
  }
  function registerCustom(cp) {
    const T = templates().get(cp.tkey); if (!T) return null;
    const texts = customTexts(cp);
    const r = COMPILED.compileCustom({ src: T.src, texts, trigger: cp.trigger, limit: cp.lim });
    D.pets[cp.id] = { n: cp.name || 'Custom Pet', t: cp.tier || 1, a: cp.atk || 1, h: cp.hp || 1, r: 0, tr: cp.trigger, tl: '', ab: texts, custom: true, sprite: cp.sprite || 'Ant' };
    AB[cp.id] = r.ability; STATUS[cp.id] = r.status;
    return r;
  }
  function unregisterCustom(id) { delete D.pets[id]; delete AB[id]; delete STATUS[id]; }
  function usedCustom() { const used = new Set(S.teams.flat().filter(Boolean).map(p => p.id)); return S.custom.filter(c => used.has(c.id)); }

  function openCustomBuilder(id, ret = {}) {
    const existing = id ? S.custom.find(c => c.id === id) : null;
    const T0 = templates();
    const cp = existing ? JSON.parse(JSON.stringify(existing)) : (() => {
      const t = T0.get(parseTemplate(D.pets.Mosquito.ab[0]).key) || T0.values().next().value;
      return { id: 'Custom_' + Date.now().toString(36), name: 'Custom Pet', sprite: t.src, autoSprite: true, tier: 1, atk: 2, hp: 2, trigger: 'BeforeAttack', tkey: t.key, vals: t.defaults.map(v => v.slice()), lim: [0, 0, 0] };
    })();
    let abilityQ = '', spriteQ = '', showSprites = false, showAbilities = !existing;
    const back = () => {
      if (ret.back === 'editor' && ret.side != null) openEditor(ret.side, ret.i);
      else if (ret.side != null) openPicker(ret.side, ret.i, ret.replace); else closeModal();
    };
    openModal('editor custom-builder', panel => {
      let drawing = false;
      const draw = () => { if (drawing) return; drawing = true; try { drawInner(); } finally { drawing = false; } };
      const drawInner = () => {
        const prev = panel.querySelector('.cb-body'); const keepScroll = prev ? prev.scrollTop : 0;
        const alist = panel.querySelector('.cb-alist'); const keepList = alist ? alist.scrollTop : 0;
        panel.querySelectorAll('.cb-body, .ed-actions, .head').forEach(n => n.remove());
        requestAnimationFrame(() => { const b = panel.querySelector('.cb-body'); if (b) b.scrollTop = keepScroll; const l = panel.querySelector('.cb-alist'); if (l) l.scrollTop = keepList; });
        const T = templates().get(cp.tkey);
        const head = el('div', { class: 'head' }, el('h2', {}, existing ? 'Edit custom pet' : 'New custom pet'));
        const body = el('div', { class: 'body cb-body' });

        // --- identity: sprite, name, tier, stats
        const top = el('div', { class: 'cb-top' });
        const spr = el('button', { class: 'cb-sprite', title: 'Choose art' }, el('img', { src: petImg(cp.sprite), alt: '' }), el('span', {}, 'Change art'));
        spr.addEventListener('click', () => { showSprites = !showSprites; draw(); });
        const fields = el('div', { class: 'cb-fields' });
        const name = el('input', { class: 'search', value: cp.name, maxlength: 24, placeholder: 'Name' });
        name.addEventListener('input', () => { cp.name = name.value.slice(0, 24); });
        const num = (key, min, max) => { const i = el('input', { type: 'number', class: 'cb-num', min, max, value: cp[key] }); i.addEventListener('change', () => { cp[key] = Math.max(min, Math.min(max, i.value | 0)); i.value = cp[key]; }); return i; };
        const tierSel = el('select', { class: 'cb-select' }); for (let t = 1; t <= 6; t++) tierSel.append(el('option', { value: t }, 'Tier ' + t)); tierSel.value = cp.tier;
        tierSel.addEventListener('change', () => { cp.tier = +tierSel.value; });
        fields.append(
          el('label', { class: 'cb-lbl' }, 'Name'), name,
          el('div', { class: 'cb-row' },
            el('label', { class: 'cb-lbl' }, 'Tier'), tierSel,
            el('label', { class: 'cb-lbl' }, el('img', { class: 'ico', src: UI('Fist'), alt: '' }), ' Attack'), num('atk', 0, 50),
            el('label', { class: 'cb-lbl' }, el('img', { class: 'ico', src: UI('Heart_1'), alt: '' }), ' Health'), num('hp', 1, 50)));
        top.append(spr, fields);
        body.append(top);
        if (showSprites) {
          const box = el('div', { class: 'cb-box' });
          const sq = el('input', { class: 'search', placeholder: 'Search art by pet name…', value: spriteQ });
          const g = el('div', { class: 'cb-sprites' });
          const fill = () => {
            g.innerHTML = ''; const q = spriteQ.trim().toLowerCase();
            for (const k of Object.keys(D.pets).filter(k => !D.pets[k].custom && (!q || D.pets[k].n.toLowerCase().includes(q))).sort((a, b) => D.pets[a].n.localeCompare(D.pets[b].n)).slice(0, 240)) {
              const c = el('div', { class: 'cb-spr' + (k === cp.sprite ? ' on' : ''), title: D.pets[k].n }, el('img', { src: petImg(k), alt: '', loading: 'lazy' }));
              c.addEventListener('click', () => { cp.sprite = k; cp.autoSprite = false; showSprites = false; draw(); });
              g.append(c);
            }
          };
          sq.addEventListener('input', () => { spriteQ = sq.value; fill(); });
          fill(); box.append(sq, g); body.append(box);
          setTimeout(() => sq.focus(), 30);
        }

        // --- trigger
        const trow = el('div', { class: 'cb-box' }, el('div', { class: 'cb-h' }, 'Trigger'));
        const isCount = cp.trigger.startsWith('Count:');
        const base = isCount ? 'Count:' + cp.trigger.split(':')[1] : cp.trigger;
        const tsel = el('select', { class: 'cb-select wide' });
        for (const o of triggerOptions()) tsel.append(el('option', { value: o.code }, o.label));
        tsel.value = base;
        tsel.addEventListener('change', () => { const v = tsel.value; cp.trigger = v.startsWith('Count:') ? v + ':' + (isCount ? cp.trigger.split(':')[2] : 3) : v; draw(); });
        const tr = el('div', { class: 'cb-row' }, tsel);
        if (isCount) {
          const n = el('input', { type: 'number', class: 'cb-num', min: 1, max: 20, value: cp.trigger.split(':')[2] });
          n.addEventListener('change', () => { const v = Math.max(1, Math.min(20, n.value | 0)); cp.trigger = base + ':' + v; draw(); });
          tr.append(el('label', { class: 'cb-lbl' }, 'N ='), n);
        }
        trow.append(tr);
        if (T && T.srcTrig && T.srcTrig.split(':').slice(0, 2).join(':') !== base.split(':').slice(0, 2).join(':'))
          trow.append(el('div', { class: 'cb-note' }, `This ability originally uses "${trigLabelOf(T.srcTrig)}". Abilities that refer to "it" or "the target" need a trigger that has one (e.g. friend faints → "it" is that friend).`));
        body.append(trow);

        // --- ability with editable values for each level
        const abox = el('div', { class: 'cb-box' }, el('div', { class: 'cb-h' }, 'Ability ', el('span', { class: 'cb-src' }, T ? `from ${D.pets[T.src].n}` : '')));
        if (T) {
          const texts = customTexts(cp);
          const test = COMPILED.compileCustom({ src: T.src, texts, trigger: cp.trigger, limit: cp.lim });
          for (let L = 0; L < 3; L++) {
            const row = el('div', { class: 'cb-level' + (test.errors.includes(L + 1) ? ' bad' : '') }, el('span', { class: 'cb-lv' }, 'Lvl ' + (L + 1)));
            let k = 0, cnt = null;
            for (const part of T.parts) {
              if (!part.slot) { row.append(el('span', { html: fmtAbility(cnt != null ? agree(part.t, cnt) : part.t) })); cnt = null; continue; }
              const idx = k++;
              cnt = part.slot === 'w' ? cp.vals[L][idx] : null;
              const inp = el('input', { type: 'number', class: 'cb-val' + (part.slot === 'w' ? ' count' : ''), min: part.slot === 'w' ? 1 : 0, max: part.slot === 'w' ? 5 : 999, value: cp.vals[L][idx], title: part.slot === 'w' ? 'How many (1-5)' : '' });
              inp.addEventListener('change', () => { const v = Math.max(+inp.min, Math.min(+inp.max, inp.value | 0)); if (v === cp.vals[L][idx] && String(v) === inp.value) return; cp.vals[L][idx] = v; draw(); });
              row.append(inp);
            }
            if (test.errors.includes(L + 1)) row.append(el('span', { class: 'cb-err' }, 'not supported with these values'));
            abox.append(row);
          }
        }
        const chg = el('button', { class: 'obtn ghost cb-change' }, el('span', {}, showAbilities ? 'Hide ability list' : 'Choose a different ability'));
        chg.addEventListener('click', () => { showAbilities = !showAbilities; draw(); });
        abox.append(chg);
        if (showAbilities) {
          const aq = el('input', { class: 'search', placeholder: 'Search abilities (e.g. "damage", "summon", "random enemy")…', value: abilityQ });
          const list = el('div', { class: 'cb-alist' });
          const fill = () => {
            list.innerHTML = ''; const words = abilityQ.trim().toLowerCase().split(/\s+/).filter(Boolean);
            let n = 0;
            for (const t of templates().values()) {
              if (words.length && !words.every(w => t.q.includes(w))) continue;
              if (++n > 150) break;
              let k = 0;
              const html = t.parts.map(p => (p.slot ? `<b class="x">${'XYZWVU'[k++] || 'N'}</b>` : fmtAbility(p.t))).join('');
              const it = el('div', { class: 'cb-aitem' + (t.key === cp.tkey ? ' on' : '') }, el('span', { html }), el('span', { class: 'cb-src' }, D.pets[t.src].n + ' · ' + trigLabelOf(t.srcTrig)));
              it.addEventListener('click', () => { cp.tkey = t.key; cp.vals = t.defaults.map(v => v.slice()); if (cp.autoSprite) cp.sprite = t.src; showAbilities = false; draw(); });
              list.append(it);
            }
            if (!n) list.append(el('div', { class: 'cb-note' }, 'No abilities match.'));
            if (n > 150) list.append(el('div', { class: 'cb-note' }, 'Showing the first 150 — type to narrow it down.'));
          };
          aq.addEventListener('input', () => { abilityQ = aq.value; fill(); });
          fill(); abox.append(aq, list);
          if (!existing || abilityQ) setTimeout(() => aq.focus(), 30);
        }
        body.append(abox);

        // --- activations per battle
        const lbox = el('div', { class: 'cb-box' }, el('div', { class: 'cb-h' }, 'Activations per battle ', el('span', { class: 'cb-src' }, '0 = no limit')));
        const lr = el('div', { class: 'cb-row' });
        for (let L = 0; L < 3; L++) {
          const i = el('input', { type: 'number', class: 'cb-num', min: 0, max: 99, value: cp.lim[L] || 0 });
          i.addEventListener('change', () => { cp.lim[L] = Math.max(0, Math.min(99, i.value | 0)); i.value = cp.lim[L]; });
          lr.append(el('label', { class: 'cb-lbl' }, 'Lvl ' + (L + 1)), i);
        }
        lbox.append(lr); body.append(lbox);

        // --- actions
        const acts = el('div', { class: 'ed-actions' });
        const btn = (txt, icon, fn, cls = '') => { const b = el('button', { class: 'obtn ' + cls }, el('img', { src: UI(icon), alt: '' }), el('span', {}, txt)); b.addEventListener('click', fn); return b; };
        acts.append(
          btn('Cancel', 'ArrowLeft', back, 'ghost'),
          ...(existing ? [btn('Delete', 'Cross', () => {
            S.custom = S.custom.filter(c => c.id !== cp.id); unregisterCustom(cp.id);
            S.teams = S.teams.map(t => t.map(p => (p && p.id === cp.id ? null : p)));
            save(); toast('Custom pet deleted');
            if (ret.side != null && ret.back !== 'editor') openPicker(ret.side, ret.i, ret.replace); else closeModal();
          }, 'ghost')] : []),
          btn('Save', 'Checkmark', () => {
            cp.name = (cp.name || '').trim() || 'Custom Pet';
            const r = registerCustom(cp);
            if (!r || r.status.status !== 'ok') {
              if (existing) registerCustom(existing); else unregisterCustom(cp.id);
              toast('That ability doesn\'t work with these values'); return;
            }
            const at = S.custom.findIndex(c => c.id === cp.id);
            if (at >= 0) S.custom[at] = cp; else S.custom.push(cp);
            if (!existing && ret.side != null) {
              const old = S.teams[ret.side][ret.i];
              S.teams[ret.side][ret.i] = ret.replace && old ? Object.assign(newPet(cp.id), { xp: old.xp, perk: old.perk }) : newPet(cp.id);
            }
            save(); toast(existing ? 'Custom pet updated' : 'Custom pet added');
            if (ret.back === 'editor' && ret.side != null) openEditor(ret.side, ret.i); else closeModal();
          }));
        panel.insertBefore(head, panel.firstChild);
        panel.insertBefore(body, panel.querySelector('.close'));
        panel.insertBefore(acts, panel.querySelector('.close'));
      };
      draw();
    });
  }
  function trigLabelOf(t) {
    if (!t) return '';
    if (t.startsWith('Count:')) { const [, w, k] = t.split(':'); return `Every ${k} ${COUNT_LABEL[w] || w}`; }
    return TRIG_PICK_LABEL[t] || TRIG_LABEL[t] || t;
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
        else if (st.status === 'shop') info.append(el('div', { class: 'support-note shop' }, SHOP_TRIGGERS.has(st.trigger) ? 'This ability only works in the shop, so it has no effect in battle (same as the game).' : 'This ability triggers in battle, but it only affects gold or the shop, so it changes nothing in the fight.'));
        else if (st.status === 'passive') info.append(el('div', { class: 'support-note good' }, 'Passive ability: always active in battle.'));
        if (SETTINGS_DEP[p.id]) info.append(el('div', { class: 'support-note shop' }, `Uses the "${SETTING_NAMES[SETTINGS_DEP[p.id]]}" value from Settings.`));
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
          ...(d.custom ? [btn('Edit custom', 'Paw', () => openCustomBuilder(p.id, { side, i, replace: true, back: 'editor' }), 'ghost')] : []),
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
  function randomTeam(side) {
    const o = S.rnd;
    let pool = ROLLABLE.filter(k => D.pets[k].t <= o.maxTier && (o.pack === 'All' || (D.pets[k].p || []).includes(o.pack)));
    if (!pool.length) pool = ROLLABLE;
    const t = Array(5).fill(null);
    for (let i = 0; i < o.size; i++) {
      const k = pool[Math.floor(Math.random() * pool.length)];
      const p = newPet(k);
      if (o.levels) p.xp = [0, 0, 0, 1, 2, 2, 3, 5][Math.floor(Math.random() * 8)];
      const lv = lvlOf(p.xp);
      p.atk = Math.min(Engine.capOf(k, 'atk'), p.atk + (lv - 1) + Math.floor(Math.random() * (o.bonus + 1)));
      p.hp = Math.min(Engine.capOf(k, 'hp'), p.hp + (lv - 1) + Math.floor(Math.random() * (o.bonus + 1)));
      if (o.perks && Math.random() < 0.45) p.perk = BATTLE_PERKS[Math.floor(Math.random() * BATTLE_PERKS.length)];
      t[i] = p;
    }
    S.teams[side] = t;
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
        row('Pack', 'Pets are drawn from this pack', sel(['All'].concat(PACKS.filter(x => x !== 'Puppy')), 'pack')),
        row('Highest tier', 'Pets up to this shop tier', sel([1, 2, 3, 4, 5, 6], 'maxTier', Number)),
        row('Team size', null, sel([1, 2, 3, 4, 5], 'size', Number)),
        row('Bonus stats', 'Random extra attack/health per pet, up to', sel([0, 2, 4, 8, 12, 20, 30], 'bonus', Number)),
        row('Random levels', null, tog('levels')),
        row('Random perks', null, tog('perks')));
      p.append(body);
      const go = el('button', { class: 'obtn' }, el('img', { src: UI('Dice'), alt: '' }), el('span', {}, 'Roll!'));
      go.addEventListener('click', () => { randomTeam(side); renderEdit(); });
      const both = el('button', { class: 'obtn ghost' }, el('span', {}, 'Roll both teams'));
      both.addEventListener('click', () => { randomTeam(0); randomTeam(1); renderEdit(); });
      p.append(el('div', { style: 'display:flex;gap:12px;justify-content:center' }, both, go));
    });
  }

  // ------------------------------------------------------------------ settings / bg / share
  function openSettings() {
    openModal('form', p => {
      p.append(el('div', { class: 'head' }, el('h2', {}, 'Battle settings')));
      const body = el('div', { class: 'body' });
      const o = S.settings;
      const num = (key, min, max) => { const i = el('input', { type: 'number', min, max, value: o[key], style: 'width:90px' }); i.addEventListener('change', () => { o[key] = Math.max(min, Math.min(max, +i.value | 0)); i.value = o[key]; save(); }); return i; };
      const tog = key => { const t = el('button', { class: 'toggle' + (o[key] ? ' on' : '') }); t.addEventListener('click', () => { o[key] = !o[key]; t.classList.toggle('on', o[key]); save(); }); return t; };
      const row = (label, sub, ctl) => el('div', { class: 'frow' }, el('div', {}, label, sub ? el('small', {}, sub) : null), ctl);
      body.append(
        row('Turn number', 'For turn-based abilities (e.g. Werewolf)', num('turn', 1, 40)),
        row('Rolls this turn', 'For roll-based abilities (Fossa, Bunyip, Mana Hound…)', num('rolls', 0, 20)),
        row('Battles fought', 'For Slime, Eagle Owl', num('battles', 0, 40)),
        row('Food eaten this turn', 'Per pet: Dung Beetle, Blue Jay, Black Bear', num('foodEaten', 0, 10)),
        row('Transformations this turn', 'For Giant Pangasius', num('transforms', 0, 10)),
        row('Gold spent this turn', 'For Meerkat', num('goldSpent', 0, 40)),
        row('Level 3 pets sold', 'For Jersey Devil', num('lvl3Sold', 0, 10)),
        row('Fixed random seed', 'Same random targets every fight', tog('fixedSeed')),
        row('Seed', null, num('seed', 0, 999999)));
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
  function openBg() {
    openModal('form bgsize', p => {
      p.append(el('div', { class: 'head' }, el('h2', {}, 'Scene')));
      const body = el('div', { class: 'body' }); const g = el('div', { class: 'bggrid' });
      for (const b of D.bgs) {
        const c = el('div', { class: 'bgcell' + (b === S.bg ? ' on' : ''), style: `background-image:url('img/bg/${b}.webp')` }, el('span', {}, b.replace(/Battle$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')));
        c.addEventListener('click', () => { S.bg = b; setBg(); save(); $$('.bgcell', g).forEach(x => x.classList.toggle('on', x === c)); });
        g.append(c);
      }
      body.append(g); p.append(body);
    });
  }
  function share() {
    const st = { teams: S.teams, names: S.names, bg: S.bg, meta: S.meta, custom: usedCustom() };
    const h = '#t=' + btoa(unescape(encodeURIComponent(JSON.stringify(st))));
    history.replaceState(null, '', h);
    const url = location.href;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('Link copied!'), () => toast('Link is in the address bar'));
  }

  // ------------------------------------------------------------------ battle
  function battleTeams() { return S.teams.map(t => t.filter(Boolean).map(p => ({ id: p.id, atk: p.atk, hp: p.hp, xp: p.xp, perk: p.perk, mana: p.mana || 0 }))); }
  function simulate(seed) {
    const b = new Engine.Battle(D, AB, battleTeams(), Object.assign({}, S.settings, { seed }));
    return b.run();
  }
  const scene = window.SAPBattle.create({
    stage, D, petImg, foodImg, perkName, esc,
    trigLabel: t => TRIG_LABEL[t] || (t && t.startsWith('Count:') ? 'Counter' : t),
    onBack: () => backToEdit(),
    onAgain: () => startBattle(),
    onSpeed: v => { S.settings.speed = v; save(); },
    replayLink: () => replayLink(),
  });
  let lastLog = null, lastSeed = 0;
  // Replay link: both teams, looks, battle settings and the seed. The engine is deterministic, so opening it
  // replays this exact fight.
  const BATTLE_SETTINGS = ['turn', 'rolls', 'battles', 'foodEaten', 'transforms', 'goldSpent', 'lvl3Sold'];
  function replayLink() {
    const settings = {}; for (const k of BATTLE_SETTINGS) settings[k] = S.settings[k];
    const st = { teams: S.teams, names: S.names, bg: S.bg, meta: S.meta, custom: usedCustom(), replay: { seed: lastSeed, settings } };
    return location.href.split('#')[0] + '#r=' + btoa(unescape(encodeURIComponent(JSON.stringify(st))));
  }
  function battleMeta() {
    return {
      turn: S.settings.turn, speed: S.settings.speed || 1,
      teams: [0, 1].map(s => Object.assign({ name: S.names[s] }, S.meta[s])),
    };
  }
  function startBattle(sameLog, forceSeed) {
    if (!S.teams[0].some(Boolean) || !S.teams[1].some(Boolean)) { toast('Both teams need at least one pet'); return; }
    const seed = forceSeed != null ? forceSeed : S.settings.fixedSeed ? S.settings.seed : (Math.random() * 1e9) | 0;
    const res = sameLog || simulate(seed);
    if (!sameLog) lastSeed = seed;
    lastLog = res.log;
    document.body.classList.remove('edit'); document.body.classList.add('battle');
    $('#odds').hidden = true;
    hideTip();
    scene.play(res.log, battleMeta());
  }
  function backToEdit() {
    scene.stop();
    document.body.classList.remove('battle'); document.body.classList.add('edit');
    renderEdit();
  }
  document.addEventListener('keydown', e => {
    if (!document.body.classList.contains('battle') || e.target.isContentEditable) return;
    if (e.key === 'Escape') backToEdit();
  });

  // ------------------------------------------------------------------ team settings (player, mascot, background, trophies, lives)
  const MASCOTS = ['Tyrannosaurus', 'Bee', 'BlueBird', 'BlueWhale', 'Bulldog', 'Capybara', 'Cat', 'Chameleon', 'Chicken', 'Crane', 'Crow', 'Dolphin', 'Donkey', 'Dove', 'Frog',
    'Jellyfish', 'Lion', 'Lobster', 'Ox', 'Panda', 'Parrot', 'Penguin', 'Racoon', 'RedPanda', 'Shark', 'Sheep', 'Snail', 'Starfish', 'Swordfish', 'Turtle', 'None'];
  function openTeamSettings(side) {
    const m = S.meta[side];
    openModal('form bgsize', p => {
      p.append(el('div', { class: 'head' }, el('h2', {}, `${S.names[side]} — battle look`)));
      const body = el('div', { class: 'body' });
      const row = (label, sub, ctl) => el('div', { class: 'frow' }, el('div', {}, label, sub ? el('small', {}, sub) : null), ctl);
      const txt = (key, max) => { const i = el('input', { type: 'text', value: m[key], maxlength: max, class: 'search', style: 'flex:0 0 260px' }); i.addEventListener('input', () => { m[key] = i.value.slice(0, max); save(); }); return i; };
      const num = (key, min, max) => { const i = el('input', { type: 'number', min, max, value: m[key], style: 'width:90px' }); i.addEventListener('change', () => { m[key] = Math.max(min, Math.min(max, +i.value | 0)); i.value = m[key]; save(); }); return i; };
      body.append(row('Player name', 'Shown on the name plate', txt('player', 18)),
        row('Trophies', 'Shown on the name plate and result screen', num('trophies', 0, 9)),
        row('Lives', null, num('lives', 1, 10)));
      body.append(el('div', { class: 'section-title', style: 'margin-top:10px' }, 'Mascot'));
      const mg = el('div', { class: 'mascotgrid' });
      for (const k of MASCOTS) {
        const c = el('div', { class: 'mascotcell' + (m.mascot === k ? ' on' : ''), title: k }, el('img', { src: `img/mascot/${k}_Battle.webp`, alt: k, loading: 'lazy' }));
        c.addEventListener('click', () => { m.mascot = k; save(); $$('.mascotcell', mg).forEach(x => x.classList.toggle('on', x === c)); });
        mg.append(c);
      }
      body.append(mg);
      body.append(el('div', { class: 'section-title', style: 'margin-top:10px' }, 'Battle background'));
      const g = el('div', { class: 'bggrid' });
      for (const b of D.bgs) {
        const c = el('div', { class: 'bgcell' + (b === m.bg ? ' on' : ''), style: `background-image:url('img/bg/${b}.webp')` }, el('span', {}, b.replace(/Battle$/, '').replace(/([a-z])([A-Z])/g, '$1 $2')));
        c.addEventListener('click', () => { m.bg = b; if (side === 0) { S.bg = b; setBg(); } save(); $$('.bgcell', g).forEach(x => x.classList.toggle('on', x === c)); });
        g.append(c);
      }
      body.append(g); p.append(body);
    });
  }

  // ------------------------------------------------------------------ odds
  async function runOdds() {
    if (!S.teams[0].some(Boolean) || !S.teams[1].some(Boolean)) { toast('Both teams need at least one pet'); return; }
    const box = $('#odds'); box.hidden = false; box.innerHTML = '<span class="ol">Simulating…</span>';
    const N = 500; const c = { win: 0, lose: 0, draw: 0 };
    for (let i = 0; i < N; i++) {
      try { c[simulate(i * 7919 + 13).result]++; } catch (e) { c.draw++; }
      if (i % 50 === 49) await wait(0);
    }
    const pct = k => Math.round(c[k] / N * 1000) / 10;
    box.innerHTML = `<span class="ol" style="color:#9fd6ff">${esc(S.names[0])} ${pct('win')}%</span>
      <div class="bar"><i style="width:${pct('win')}%;background:#3fa8ff"></i><i style="width:${pct('draw')}%;background:#c9c0b0"></i><i style="width:${pct('lose')}%;background:#ff6a4a"></i></div>
      <span class="ol" style="color:#ffb39f">${pct('lose')}% ${esc(S.names[1])}</span><span class="ol" style="font-size:16px">Draw ${pct('draw')}% · ${N} battles</span>`;
  }

  // ------------------------------------------------------------------ wiring
  $('#btn-fight').addEventListener('click', () => startBattle());
  $('#btn-odds').addEventListener('click', runOdds);
  $('#btn-swap').addEventListener('click', () => { S.teams.reverse(); S.names.reverse(); S.meta.reverse(); S.bg = S.meta[0].bg; setBg(); $('#odds').hidden = true; renderEdit(); });
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-bg').addEventListener('click', () => openTeamSettings(0));
  $('#btn-share').addEventListener('click', share);
  $$('.team-tools .sbtn').forEach(b => b.addEventListener('click', () => {
    const s = +b.dataset.side;
    if (b.dataset.act === 'random') openRandomizer(s);
    else if (b.dataset.act === 'look') openTeamSettings(s);
    else { S.teams[s] = Array(5).fill(null); $('#odds').hidden = true; renderEdit(); }
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
  if (S.meta[0].bg !== S.bg && D.bgs.includes(S.bg)) S.meta[0].bg = S.bg;
  if (pendingReplay) {
    history.replaceState(null, '', location.href.split('#')[0]);
    save(); startBattle(null, pendingReplay.seed | 0);
  }
  window.SAP_SANDBOX = { S, simulate, STATUS, AB, startBattle, replayLink, get lastLog() { return lastLog; } };
})();
