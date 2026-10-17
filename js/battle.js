/* Super Auto Pets sandbox — battle scene.
 * Replays an engine log the way the game presents a battle:
 * fade from black → split backgrounds + mascots → teams rocket in with name labels and "VS"
 * → HUD (Pause / Fast / Skip, name plates) → attacks, snipes, faints → darkened result screen.
 */
(function () {
  'use strict';
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const STALE = { stale: true };
  const FX = n => `img/fx/${n}.webp`;
  const MASCOT = (m, pose) => `img/mascot/${m}_${pose}.webp`;

  // geometry measured from the real battle screen (1280 × 720 stage)
  const SLOT = 120, FRONT_L = 552, FRONT_R = 728, PET_W = 120;
  const TOP = 318;                         // top of a pet element (level label)
  const SPRITE_CY = 436;                   // sprite centre line
  const cx = (side, i) => (side === 0 ? FRONT_L - i * SLOT : FRONT_R + i * SLOT);

  function create(ctx) {
    const { stage, D, petImg, foodImg, perkName, esc, trigLabel } = ctx;
    const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

    let root = null, gen = 0;
    const state = { speed: 1, playing: true, log: null, meta: null, i: 0, els: new Map(), names: new Map(), lastSnap: null };

    // ------------------------------------------------------------ DOM
    function build(meta) {
      if (root) root.remove();
      root = el('div', 'bscene');
      root.innerHTML = `
        <div class="b-half left"><div class="b-bg"></div></div>
        <div class="b-half right"><div class="b-bg"></div></div>
        <div class="b-divider"></div>
        <img class="b-mascot left" alt=""><img class="b-mascot right" alt="">
        <div class="b-trumpet left"><img src="img/ui/Trumpet.webp" alt=""><span></span></div><div class="b-trumpet right"><img src="img/ui/Trumpet.webp" alt=""><span></span></div>
        <div class="b-arena"></div>
        <div class="b-fx"></div>
        <div class="b-intro">
          <div class="b-label left"><span></span></div>
          <div class="b-vs"><span>VS</span></div>
          <div class="b-label right"><span></span></div>
        </div>
        <div class="b-hud">
          <button class="b-back" title="Back to teams"><img src="${FX('Back')}" alt=""></button>
          <div class="b-ctrls">
            <button class="b-btn" data-b="rewind"><span>Rewind</span><img src="${FX('Rewind')}" alt=""></button>
            <button class="b-btn" data-b="pause"><span>Pause</span><img src="${FX('Pause')}" alt=""></button>
            <button class="b-btn" data-b="fast"><span>Fast</span><img src="${FX('Fast')}" alt=""><i class="b-dot"></i></button>
            <button class="b-btn" data-b="skip"><span>Skip</span><img src="${FX('Skip')}" alt=""></button>
          </div>
          <button class="b-logbtn" title="Battle log"><img src="${FX('Log')}" alt=""><span>Log</span></button>
        </div>
        <div class="b-plate left"></div><div class="b-plate right"></div>
        <div class="b-log" hidden><div class="b-log-head">Battle log</div><ol></ol></div>
        <div class="b-result" hidden>
          <div class="b-trophies"></div>
          <img class="b-res-mascot" alt="">
          <div class="b-res-text"></div>
          <div class="b-res-sub"></div>
          <div class="b-hearts"></div>
          <div class="b-res-btns">
            <button class="obtn ghost" data-r="back"><span>Back</span></button>
            <button class="obtn ghost" data-r="replay"><span>Replay</span></button>
            <button class="obtn" data-r="again"><span>Fight again</span></button>
          </div>
          <div class="b-res-link">
            <div class="b-res-link-lbl">Replay link</div>
            <div class="b-res-link-row"><input readonly spellcheck="false" aria-label="Replay link"><button class="obtn ghost b-copy"><span>Copy</span></button></div>
          </div>
        </div>
        <div class="b-fade"></div>`;
      stage.append(root);
      const q = s => root.querySelector(s);
      q('.b-half.left .b-bg').style.backgroundImage = `url('img/bg/${meta.teams[0].bg}.webp')`;
      q('.b-half.right .b-bg').style.backgroundImage = `url('img/bg/${meta.teams[1].bg}.webp')`;
      q('.b-mascot.left').src = MASCOT(meta.teams[0].mascot, 'Battle');
      q('.b-mascot.right').src = MASCOT(meta.teams[1].mascot, 'Battle');
      q('.b-label.left span').textContent = meta.teams[0].name;
      q('.b-label.right span').textContent = meta.teams[1].name;
      for (let s = 0; s < 2; s++) {
        const t = meta.teams[s];
        q(`.b-plate.${s ? 'right' : 'left'}`).innerHTML = `
          <div class="b-pstats"><span class="b-ps"><img src="${FX('Hourglass')}" alt=""><b>${meta.turn}</b></span><span class="b-ps"><img src="${FX('Trophy')}" alt=""><b>${t.trophies}</b></span><span class="b-ps"><img src="${FX('Heart')}" alt=""><b>${t.lives}</b></span></div>
          <div class="b-pname"><div class="b-user">${esc(t.player)}</div><div class="b-team">${esc(t.name)}</div></div>`;
      }
      q('.b-back').onclick = () => ctx.onBack();
      q('.b-logbtn').onclick = () => { const L = q('.b-log'); L.hidden = !L.hidden; };
      root.querySelectorAll('.b-btn').forEach(b => b.onclick = () => control(b.dataset.b));
      { const inp = root.querySelector('.b-res-link input'), cb = root.querySelector('.b-copy');
        inp.onfocus = () => inp.select();
        cb.onclick = () => {
          const done = ok => { cb.firstChild.textContent = ok ? 'Copied!' : 'Press Ctrl+C'; clearTimeout(cb.t); cb.t = setTimeout(() => cb.firstChild.textContent = 'Copy', 1600); };
          const legacy = () => { inp.focus(); inp.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) { } done(ok); };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(inp.value).then(() => done(true), legacy); else legacy();
        }; }
      root.querySelectorAll('.b-res-btns button').forEach(b => b.onclick = () => ({ back: ctx.onBack, replay: () => play(state.log, state.meta), again: ctx.onAgain })[b.dataset.r]());
      updateButtons();
      return root;
    }
    const $r = s => root.querySelector(s);

    function control(b) {
      if (b === 'pause') { state.playing = !state.playing; updateButtons(); }
      else if (b === 'fast') { state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 4 : 1; ctx.onSpeed && ctx.onSpeed(state.speed); updateButtons(); }
      else if (b === 'skip') skip();
      else if (b === 'rewind') play(state.log, state.meta);
    }
    function updateButtons() {
      if (!root) return;
      const p = $r('.b-btn[data-b="pause"]');
      p.querySelector('span').textContent = state.playing ? 'Pause' : 'Play';
      p.querySelector('img').src = FX(state.playing ? 'Pause' : 'Play');
      const f = $r('.b-btn[data-b="fast"]');
      f.classList.toggle('on', state.speed > 1);
      f.querySelector('span').textContent = state.speed > 1 ? `Fast ×${state.speed}` : 'Fast';
    }

    // ------------------------------------------------------------ pets
    function petEl(side, d) {
      const e = el('div', `bpet side-${side}`);
      e.innerHTML = `
        <div class="bp-lvl"><span class="bp-lv-t">Lvl</span><span class="bp-lv-n"></span><div class="bp-xp"></div></div>
        <div class="bp-body">
          <img class="bp-sprite" alt="">
          <img class="bp-perk" alt="">
          <img class="bp-band" src="${FX('Bandage')}" alt="">
          <div class="bp-mana"><span></span></div>
        </div>
        <div class="bp-stats"><div class="bp-stat atk"><span></span></div><div class="bp-stat hp"><span></span></div></div>
        <div class="trig"><img src="img/ui/Lightning.webp" alt=""><span></span></div>`;
      update(e, d, true);
      return e;
    }
    function flash(n) { n.classList.remove('flash'); void n.offsetWidth; n.classList.add('flash'); }
    function update(e, d, first) {
      if (e.dataset.id !== d.id) { e.dataset.id = d.id; e.querySelector('.bp-sprite').src = petImg(d.id); }
      const a = e.querySelector('.atk span'), h = e.querySelector('.hp span');
      if (a.textContent !== String(d.a)) { a.textContent = d.a; if (!first) flash(a.parentNode); }
      if (h.textContent !== String(d.h)) { h.textContent = d.h; if (!first) flash(h.parentNode); }
      a.classList.toggle('w3', String(d.a).length > 2); h.classList.toggle('w3', String(d.h).length > 2);
      const lv = d.l || 1;
      e.querySelector('.bp-lv-n').textContent = lv;
      const pips = lv === 1 ? 2 : lv === 2 ? 3 : 0, filled = lv === 1 ? d.x : lv === 2 ? d.x - 2 : 0;
      e.querySelector('.bp-xp').innerHTML = Array.from({ length: pips }, (_, i) => `<i class="${i < filled ? 'on' : ''}"></i>`).join('');
      const pk = e.querySelector('.bp-perk');
      if ((pk.dataset.p || '') !== (d.p || '')) { pk.dataset.p = d.p || ''; pk.classList.toggle('on', !!d.p); if (d.p) { pk.src = foodImg(d.p); flash(pk); } }
      const mn = e.querySelector('.bp-mana'); mn.classList.toggle('on', d.m > 0); mn.querySelector('span').textContent = d.m > 0 ? d.m : '';
      e.classList.toggle('dying', d.h <= 0);
      const tg = e.querySelector('.trig'), tr = d.tr;
      if (!tr) tg.className = 'trig';
      else {
        const txt = tr.need ? `${tr.cnt}/${tr.need}` : String(tr.left), sp = tg.querySelector('span');
        const ch = sp.textContent !== txt && sp.textContent && !first; sp.textContent = txt;
        tg.className = 'trig on' + (tr.need ? ' count' : '') + (tr.left === 0 ? ' spent' : '');
        tg.title = tr.need ? `Counter: ${tr.cnt} of ${tr.need}` : `${tr.left} of ${tr.max} activations left`;
        if (ch) flash(tg);
      }
    }
    function place(e, side, i) { e.style.left = (cx(side, i) - PET_W / 2) + 'px'; e.style.top = TOP + 'px'; }
    function render(snap, opts = {}) {
      if (!root) return;
      const seen = new Set();
      snap.t.forEach((team, side) => team.forEach((d, i) => {
        seen.add(d.u); state.names.set(d.u, { id: d.id, side });
        let e = state.els.get(d.u);
        if (!e) {
          e = petEl(side, d); place(e, side, d.s != null ? d.s : i);
          $r('.b-arena').append(e); state.els.set(d.u, e);
          if (opts.pop !== false) { puff(cx(side, i), SPRITE_CY, 3); e.classList.add('pop'); setTimeout(() => e.classList.remove('pop'), 420); }
        } else {
          if (e.dataset.id !== d.id) { puff(cx(side, i), SPRITE_CY, 3); e.classList.add('pop'); setTimeout(() => e.classList.remove('pop'), 420); }
          update(e, d); place(e, side, d.s != null ? d.s : i);
        }
      }));
      for (const [u, e] of state.els) if (!seen.has(u) && !e.classList.contains('gone')) { e.remove(); state.els.delete(u); }
      for (let side = 0; side < 2; side++) {
        const b = root.querySelector(`.b-trumpet.${side ? 'right' : 'left'}`), n = snap.tr ? snap.tr[side] : 0;
        if (b.querySelector('span').textContent !== String(n) && n > 0) flash(b);
        b.classList.toggle('on', n > 0); b.querySelector('span').textContent = n;
      }
      state.lastSnap = snap;
    }
    const posOf = u => { const e = state.els.get(u); return e ? [parseFloat(e.style.left) + PET_W / 2, SPRITE_CY] : null; };
    const sideOf = u => (state.names.get(u) || {}).side;

    // ------------------------------------------------------------ effects
    function fxEl(cls, x, y, html) { const f = el('div', cls, html); f.style.left = x + 'px'; f.style.top = y + 'px'; $r('.b-fx').append(f); return f; }
    function puff(x, y, n = 4, spread = 40) {
      for (let k = 0; k < n; k++) {
        const p = fxEl('b-puff', x + (Math.random() - .5) * spread, y + (Math.random() - .5) * spread * .6);
        p.style.backgroundImage = `url('${FX('hard' + (k % 4))}')`;
        const s = .5 + Math.random() * .5;
        p.animate([{ transform: `translate(-50%,-50%) scale(${s * .4})`, opacity: 1 }, { transform: `translate(-50%,-50%) translate(${(Math.random() - .5) * 50}px,${-20 - Math.random() * 30}px) scale(${s})`, opacity: 0 }],
          { duration: 650 / Math.sqrt(state.speed), easing: 'ease-out' }).finished.then(() => p.remove(), () => p.remove());
      }
    }
    function bigNumber(u, n, color = 'red') {
      const q = posOf(u); if (!q) return;
      const f = fxEl('b-num ' + color, q[0], TOP + 6, String(n));
      f.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0 }, { transform: 'translate(-50%,-50%) scale(1.25)', opacity: 1, offset: .2 },
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: .7 }, { transform: 'translate(-50%,-80%) scale(1)', opacity: 0 }],
        { duration: 1000 / Math.sqrt(state.speed) }).finished.then(() => f.remove(), () => f.remove());
    }
    function floatText(u, text, cls) {
      const q = posOf(u); if (!q) return;
      const f = fxEl('b-float ' + cls, q[0], q[1] - 40, text);
      f.animate([{ transform: 'translate(-50%,-40%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-90%) scale(1.1)', opacity: 1, offset: .2 }, { transform: 'translate(-50%,-200%) scale(1)', opacity: 0 }],
        { duration: 950 / Math.sqrt(state.speed), easing: 'ease-out' }).finished.then(() => f.remove(), () => f.remove());
    }
    function hop(u, h = 26) {
      const e = state.els.get(u); if (!e) return Promise.resolve();
      return e.querySelector('.bp-body').animate([{ transform: 'translateY(0)' }, { transform: `translateY(-${h}px) scale(1.06)` }, { transform: 'translateY(0)' }],
        { duration: 200 / state.speed, easing: 'ease-out' }).finished.catch(() => { });
    }
    function shake(u) {
      const e = state.els.get(u); if (!e) return;
      e.querySelector('.bp-body').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px) rotate(-6deg)' }, { transform: 'translateX(7px) rotate(5deg)' }, { transform: 'translateX(0)' }],
        { duration: 280 / state.speed });
    }
    async function projectile(fromU, toU, kind, img) {
      const a = posOf(fromU), b = posOf(toU);
      if (!a || !b || fromU === toU) return;
      const p = fxEl('b-proj ' + (img ? 'img ' : '') + (kind || ''), a[0], a[1] - 30, img ? `<img src="${img}" alt="">` : '');
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const arc = Math.min(130, 50 + Math.abs(dx) * .2);
      await p.animate([{ transform: 'translate(-50%,-50%) scale(.6) rotate(0deg)' },
        { transform: `translate(-50%,-50%) translate(${dx / 2}px,${dy / 2 - arc}px) scale(1.1) rotate(180deg)`, offset: .5 },
        { transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(.9) rotate(360deg)` }],
        { duration: 250 / state.speed, easing: 'ease-in-out' }).finished.catch(() => { });
      p.remove();
      if (kind === 'rock' && root) puff(b[0], b[1] - 20, 2, 18);
    }
    async function rocketIn(e, side, delay) {
      const body = e;
      const dx = side === 0 ? -380 : 380, dy = -420;
      e.style.opacity = '0';
      await wait(delay / state.speed);
      if (!e.isConnected) return;
      e.style.opacity = '1';
      const rocket = el('img', 'bp-rocket'); rocket.src = FX('Rocket'); if (side === 1) rocket.classList.add('flip');
      e.querySelector('.bp-body').append(rocket);
      const dur = 650 / state.speed;
      const anim = body.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'translate(0,0)' }], { duration: dur, easing: 'cubic-bezier(.2,.7,.35,1)' });
      const x0 = parseFloat(e.style.left) + PET_W / 2;
      const t0 = performance.now();
      const trail = setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / dur), ease = 1 - Math.pow(1 - k, 2.4);
        if (root) puff(x0 + dx * (1 - ease), SPRITE_CY + 30 + dy * (1 - ease), 1, 16);
      }, 45);
      await anim.finished.catch(() => { });
      clearInterval(trail);
      rocket.remove();
      puff(x0, SPRITE_CY + 40, 3, 50);
    }
    async function faintOut(u) {
      const e = state.els.get(u); if (!e) return;
      state.els.delete(u); e.classList.add('gone');
      const side = sideOf(u), dir = side === 0 ? -1 : 1;
      const x0 = parseFloat(e.style.left) + PET_W / 2;
      const dur = 700 / state.speed, t0 = performance.now();
      const trail = setInterval(() => { const k = (performance.now() - t0) / dur; if (k < 1 && root) puff(x0 + dir * 760 * k * k, SPRITE_CY - 300 * k + 10, 1, 12); }, 40);
      await e.animate([{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${dir * 760}px,-300px) rotate(${dir * 540}deg)`, opacity: .9 }],
        { duration: dur, easing: 'cubic-bezier(.5,0,.9,.6)' }).finished.catch(() => { });
      clearInterval(trail); e.remove();
    }

    // ------------------------------------------------------------ log text
    const N = u => { const v = state.names.get(u); return v ? `<span class="${v.side ? 'r' : 'l'}">${esc(D.pets[v.id] ? D.pets[v.id].n : v.id)}</span>` : 'Someone'; };
    function describe(st) {
      switch (st.kind) {
        case 'start': return '<b>Battle start</b>';
        case 'ability': return `${N(st.src)} activates <i>${esc(st.trig === 'Activated' ? 'its ability' : trigLabel(st.trig) || st.trig)}</i>`;
        case 'attack': return `${N(st.a)} and ${N(st.b)} attack`;
        case 'jump': return `${N(st.src)} jump-attacks ${N(st.tgt)}`;
        case 'damage': return `${N(st.tgt)} takes ${st.n} damage` + (st.src && st.src !== st.tgt ? ` from ${N(st.src)}` : '');
        case 'remove': return `${N(st.tgt)} loses ${-st.dh} health`;
        case 'move': return st.closeGaps ? 'Pets move up into the empty spaces' : `${N(st.tgt)} moves`;
        case 'block': return `${N(st.tgt)} blocks the damage`;
        case 'buff': { const a = st.da || st.ra, h = st.dh || st.rh; const t = (a ? `${st.da < 0 ? '' : '+'}${st.da || 0} attack` : '') + (a && h ? ', ' : '') + (h ? `${st.dh < 0 ? '' : '+'}${st.dh || 0} health` : ''); return t ? `${N(st.tgt)} ${t}${(st.ra && !st.da) || (st.rh && !st.dh) ? ' (at max)' : ''}` : null; }
        case 'perk': return st.perk ? `${N(st.tgt)} gains <b>${esc(perkName(st.perk))}</b>` : `${N(st.tgt)} loses <b>${esc(perkName(st.lost))}</b>`;
        case 'perkfx': return `${N(st.src)}'s <b>${esc(perkName(st.perk))}</b> activates`;
        case 'faint': return `${N(st.tgt)} faints`;
        case 'summon': return `${N(st.tgt)} is summoned`;
        case 'summonfail': return 'Summon failed: the team is full';
        case 'swallow': return `${N(st.src)} swallows ${N(st.tgt)}`;
        case 'transform': return `${N(st.tgt)} transforms`;
        case 'xp': return `${N(st.tgt)} gains ${st.n} experience${st.lvlup ? ' and levels up' : ''}`;
        case 'mana': return `${N(st.tgt)} gains ${st.n} mana`;
        case 'trumpet': return `${esc(state.meta.teams[st.side].name)} ${st.n > 0 ? 'gains' : 'spends'} ${Math.abs(st.n)} trumpet${Math.abs(st.n) === 1 ? '' : 's'}`;
        case 'note': return st.tgt && sideOf(st.tgt) != null ? `${N(st.tgt)}: ${esc(st.text)}` : esc(st.text);
        case 'end': return `<b>${st.result === 'draw' ? 'Draw' : esc(state.meta.teams[st.result === 'win' ? 0 : 1].name) + ' wins'}</b>`;
      }
      return null;
    }
    function logLine(html) {
      if (!html) return;
      const L = $r('.b-log ol'); L.querySelectorAll('li.cur').forEach(x => x.classList.remove('cur'));
      const li = el('li', 'cur', html); L.append(li);
      if (!$r('.b-log').hidden) li.scrollIntoView({ block: 'nearest' });
    }

    // ------------------------------------------------------------ playback
    async function intro(snap, my) {
      const W = ms => wait(ms / state.speed);
      const fade = $r('.b-fade');
      root.classList.add('intro');
      await wait(60);
      fade.classList.add('out');
      await W(350);
      for (const side of [0, 1]) {
        $r(`.b-mascot.${side ? 'right' : 'left'}`).classList.add('in');
        $r(`.b-label.${side ? 'right' : 'left'}`).classList.add('in');
        if (side === 1) $r('.b-vs').classList.add('in');
        const team = snap.t[side];
        const jobs = team.map((d, i) => {
          state.names.set(d.u, { id: d.id, side });
          const e = petEl(side, d); place(e, side, d.s != null ? d.s : i); $r('.b-arena').append(e); state.els.set(d.u, e);
          return rocketIn(e, side, (team.length - 1 - (d.s != null ? d.s : i)) * 90);
        });
        await Promise.all(jobs);
        if (my !== gen) return;
        await W(250);
      }
      await W(650);
      $r('.b-intro').classList.add('out');
      root.classList.remove('intro');
      root.classList.add('live');
      await W(300);
    }

    // "+2/+2", "+3", "+0/+0" (capped pets still show what they were given)
    const sgn = n => (n < 0 ? '' : '+') + n;
    function statText(da, dh, ra, rh) {
      const a = da || ra, h = dh || rh;
      return a && h ? `${sgn(da || 0)}/${sgn(dh || 0)}` : a ? sgn(da || 0) : h ? sgn(dh || 0) : '';
    }
    const statKind = (da, dh, ra, rh) => { const a = da || ra, h = dh || rh; return a && !h ? 'atk' : h && !a ? 'hp' : 'both'; };
    // hits and stat gains that one pet hands out at once play together (Hedgehog, Flamingo, Ant...)
    const groupKey = st => !st.src ? '' : st.kind === 'damage' && st.dk !== 'attack' ? 'hit' : st.kind === 'remove' ? 'hit' : st.kind === 'buff' ? 'buff' : st.kind === 'perk' ? 'perk' : '';
    async function multiStep(grp, my) {
      const sp = state.speed, W = ms => wait(ms / sp).then(() => { if (my !== gen || !root) throw STALE; });
      for (const st of grp) logLine(describe(st));
      const kind = groupKey(grp[0]);
      const tgts = [...new Set(grp.map(st => st.tgt))];
      await Promise.all(tgts.filter(t => t !== grp[0].src).map(t => {
        const pk = kind === 'perk' ? grp.find(st => st.tgt === t).perk : null;
        if (kind === 'hit') return projectile(grp[0].src, t, 'rock', FX(grp.find(st => st.tgt === t).mana ? 'ManaRock' : 'Rock'));
        return projectile(grp[0].src, t, kind === 'buff' ? 'heal' : '', pk ? foodImg(pk) : undefined);
      }));
      if (my !== gen || !root) throw STALE;
      for (const t of tgts) {
        const mine = grp.filter(st => st.tgt === t);
        if (kind === 'hit') { shake(t); const n = mine.reduce((a, st) => a + (st.kind === 'damage' ? st.n : -(st.dh || 0)), 0); if (n) bigNumber(t, n); }
        else if (kind === 'buff') {
          const da = mine.reduce((a, st) => a + (st.da || 0), 0), dh = mine.reduce((a, st) => a + (st.dh || 0), 0);
          const ra = mine.some(st => st.ra), rh = mine.some(st => st.rh);
          const txt = statText(da, dh, ra, rh);
          if (txt) floatText(t, txt, da < 0 || dh < 0 ? 'neg' : statKind(da, dh, ra, rh));
        }
      }
      render(grp[grp.length - 1].snap);
      await W(kind === 'buff' ? 110 : 140);
    }
    async function step(st, my) {
      const sp = state.speed, W = ms => wait(ms / sp).then(() => { if (my !== gen || !root) throw STALE; });
      if (st.kind === 'summon' || st.kind === 'transform') st.snap.t.forEach((t, s) => t.forEach(d => state.names.set(d.u, { id: d.id, side: s })));
      logLine(describe(st));
      switch (st.kind) {
        case 'start': break;
        case 'ability': hop(st.src); await W(110); render(st.snap); break;
        case 'attack': {
          const a = state.els.get(st.a), b = state.els.get(st.b);
          if (a && b) {
            const d = (cx(1, 0) - cx(0, 0)) / 2 - 22;
            const o = { duration: 420 / sp, easing: 'cubic-bezier(.5,0,.5,1)' };
            const an = a.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${d}px)`, offset: .45 }, { transform: `translateX(${d - 6}px)`, offset: .55 }, { transform: 'translateX(0)' }], o);
            b.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-d}px)`, offset: .45 }, { transform: `translateX(${-d + 6}px)`, offset: .55 }, { transform: 'translateX(0)' }], o);
            await W(190);
            puff((cx(0, 0) + cx(1, 0)) / 2, SPRITE_CY, 5, 30);
            state.pendingAttack = true;
            await an.finished.catch(() => { });
          }
          render(st.snap); break;
        }
        case 'jump': {
          const a = state.els.get(st.src), q = posOf(st.tgt), p0 = posOf(st.src);
          if (a && q && p0) await a.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${(q[0] - p0[0]) * .85}px,-70px)` }, { transform: 'translate(0,0)' }], { duration: 460 / sp, easing: 'ease-in-out' }).finished.catch(() => { });
          break;
        }
        case 'damage': {
          if (st.dk !== 'attack' && st.src && st.src !== st.tgt) await projectile(st.src, st.tgt, 'rock', FX(st.mana ? 'ManaRock' : 'Rock'));
          shake(st.tgt); bigNumber(st.tgt, st.n);
          render(st.snap); await W(st.dk === 'attack' ? 120 : 130); break;
        }
        case 'remove': {
          if (st.src && st.src !== st.tgt) await projectile(st.src, st.tgt, 'rock', FX('Rock'));
          shake(st.tgt); if (st.dh) bigNumber(st.tgt, -st.dh);
          render(st.snap); await W(130); break;
        }
        case 'block': floatText(st.tgt, 'Blocked!', 'block'); render(st.snap); await W(220); break;
        case 'buff': {
          if (st.src && st.src !== st.tgt) await projectile(st.src, st.tgt, 'heal');
          const neg = st.da < 0 || st.dh < 0;
          const t = statText(st.da, st.dh, st.ra, st.rh);
          if (t) floatText(st.tgt, t, neg ? 'neg' : statKind(st.da, st.dh, st.ra, st.rh));
          render(st.snap); await W(110); break;
        }
        case 'perk':
          if (st.perk && st.src && st.src !== st.tgt) await projectile(st.src, st.tgt, '', foodImg(st.perk));
          render(st.snap); await W(140); break;
        case 'perkfx': { const e = state.els.get(st.src); if (e) flash(e.querySelector('.bp-perk')); await hop(st.src, 14); render(st.snap); break; }
        case 'faint': await W(160); faintOut(st.tgt); await W(260); render(st.snap); break;
        case 'summon': render(st.snap); await W(320); break;
        case 'summonfail': break;
        case 'move': render(st.snap); await W(320); break;
        case 'swallow': {
          const e = state.els.get(st.tgt), q = posOf(st.src);
          if (e && q) { e.classList.add('gone'); state.els.delete(st.tgt); await e.animate([{ transform: 'scale(1)' }, { transform: `translate(${q[0] - parseFloat(e.style.left) - PET_W / 2}px,0) scale(.1)`, opacity: 0 }], { duration: 380 / sp }).finished.catch(() => { }); e.remove(); }
          render(st.snap); break;
        }
        case 'transform': render(st.snap); await W(340); break;
        case 'xp': floatText(st.tgt, st.lvlup ? 'Level up!' : `+${st.n} xp`, 'xp'); render(st.snap); await W(280); break;
        case 'mana': floatText(st.tgt, `+${st.n}`, 'mana'); render(st.snap); await W(110); break;
        case 'trumpet': render(st.snap); await W(150); break;
        case 'note': if (st.tgt) floatText(st.tgt, st.text, 'note'); await W(200); break;
        case 'end': render(st.snap); await W(700); if (my === gen) await result(st.result); break;
        default: render(st.snap);
      }
    }

    async function result(r) {
      if (!root) return;
      { const link = ctx.replayLink ? ctx.replayLink() : '', L = $r('.b-res-link'); L.hidden = !link; L.querySelector('input').value = link; }
      const R = $r('.b-result'), meta = state.meta, me = meta.teams[0];
      const pose = r === 'win' ? 'Victory' : r === 'lose' ? 'Defeat' : 'Draw';
      R.querySelector('.b-res-mascot').src = MASCOT(me.mascot, pose);
      R.querySelector('.b-res-text').textContent = pose;
      R.querySelector('.b-res-sub').textContent = r === 'draw' ? `${meta.teams[0].name} and ${meta.teams[1].name} tie` : `${meta.teams[r === 'win' ? 0 : 1].name} wins`;
      const troph = me.trophies + (r === 'win' ? 1 : 0);
      R.querySelector('.b-trophies').innerHTML = Array.from({ length: 10 }, (_, i) =>
        `<img class="${i < troph ? 'won' : ''}${r === 'win' && i === troph - 1 ? ' new' : ''}" src="${FX(i < troph ? 'Trophy' : 'TrophyMissing')}" alt="">`).join('');
      const lives = Math.max(0, me.lives);
      R.querySelector('.b-hearts').innerHTML = Array.from({ length: lives }, (_, i) =>
        `<img class="${r === 'lose' && i === lives - 1 ? 'broken' : ''}" src="${FX(r === 'lose' && i === lives - 1 ? 'HeartBroken' : 'Heart')}" alt="">`).join('');
      root.classList.add('done');
      R.hidden = false;
      void R.offsetWidth; R.classList.add('in');
    }

    async function play(log, meta) {
      const my = ++gen;
      state.log = log; state.meta = meta; state.i = 0; state.els = new Map(); state.names = new Map(); state.playing = true;
      if (meta.speed) state.speed = meta.speed;
      build(meta);
      try {
        await intro(log[0].snap, my);
        if (my !== gen) return;
        for (state.i = 1; state.i < log.length; state.i++) {
          while (!state.playing && my === gen) await wait(80);
          if (my !== gen) return;
          const st = log[state.i];
          const grp = [st];
          if (groupKey(st)) while (state.i + 1 < log.length && groupKey(log[state.i + 1]) === groupKey(st) && log[state.i + 1].src === st.src) grp.push(log[++state.i]);
          if (grp.length > 1) await multiStep(grp, my); else await step(st, my);
          if (my !== gen) return;
        }
      } catch (e) { if (e !== STALE && my === gen) throw e; }
    }

    function skip() {
      if (!state.log) return;
      const my = ++gen;
      const last = state.log[state.log.length - 1];
      if (!root) build(state.meta);
      root.classList.remove('intro'); root.classList.add('live');
      $r('.b-fade').classList.add('out'); $r('.b-intro').classList.add('out');
      root.querySelectorAll('.b-mascot').forEach(m => m.classList.add('in'));
      $r('.b-arena').innerHTML = ''; $r('.b-fx').innerHTML = '';
      state.els = new Map(); state.names = new Map();
      const L = $r('.b-log ol'); L.innerHTML = '';
      for (const st of state.log) { if (st.snap) st.snap.t.forEach((t, s) => t.forEach(d => state.names.set(d.u, { id: d.id, side: s }))); const h = describe(st); if (h) L.append(el('li', '', h)); }
      if (L.lastElementChild) L.lastElementChild.classList.add('cur');
      render(last.snap, { pop: false });
      state.playing = true; updateButtons();
      if (my === gen) result(last.result);
    }

    function stop() { gen++; if (root) { root.remove(); root = null; } }
    return { play, stop, skip, get speed() { return state.speed; } };
  }

  window.SAPBattle = { create };
})();
