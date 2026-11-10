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

  // Geometry from the game's battle scene (level3): orthographic camera size 3 at (4.5, 0.28) → 720 px = 6 units, 120 px per unit.
  // BattleBoardView sits at world (0, -0.351); slot x is 1 unit apart, shifted 0.2 away from the middle (BoardView.GetWorldPosition),
  // so the two front pets are at x 3.8 and 5.2 → 556 px and 724 px; the pet centre line is y 0 → 436 px.
  const U = 120;                           // pixels per Unity unit
  const SLOT = U, FRONT_L = 556, FRONT_R = 724, PET_W = 120;
  const TOP = 318;                         // top of a pet element (level label)
  const SPRITE_CY = 436;                   // sprite centre line
  const cx = (side, i) => (side === 0 ? FRONT_L - i * SLOT : FRONT_R + i * SLOT);

  // RenderingTimings "DefaultTimings" (sharedassets1) in ms, and the tween numbers read from the render code
  // (docs/game-internals/ANIMATION.md has where each one comes from).
  const T = {
    abilityHighlight: 100, damageDelay: 700, punchSpeed: 0.4, punchJump: 0.05,
    windup: 200, release: 100, back: 70, attackRot: 15,
    expDelay: 200, projectile: 400, buffDelay: 100, summonDelay: 500, puffDelay: 300,
    move: 400, throwDur: 420, throwHeight: 1.5, throwRot: -510,
  };

  // ------------------------------------------------------------ DOTween maths (ease curves, punch, shake, jump)
  const EASE = {
    linear: t => t, inQuad: t => t * t, outQuad: t => t * (2 - t), inOutQuad: t => (t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
    inQuint: t => t ** 5, outQuint: t => 1 - (1 - t) ** 5,
    outBack: (t, s = 1.70158) => { t -= 1; return t * t * ((s + 1) * t + s) + 1; },
  };
  // DOTween.Punch: (int)(vibrato·duration) segments (at least 2), each lasting in proportion to its index, alternating ±strength that
  // decays linearly to 0; every segment eases OutQuad. Returns offset(t) in units of the punch vector, t in 0..1.
  function punchCurve(duration, vibrato = 10, elasticity = 1) {
    const n = Math.max(2, Math.floor(vibrato * duration));
    const durs = [], vals = [];
    let sum = 0; for (let i = 0; i < n; i++) { const d = (i + 1) / n; durs.push(d); sum += d; }
    let str = 1; const dec = 1 / n;
    for (let i = 0; i < n; i++) {
      vals.push(i === n - 1 ? 0 : i === 0 ? 1 : i % 2 ? -Math.min(1, str * elasticity) : Math.min(1, str));
      if (i < n - 1) str -= dec;
    }
    const ends = []; let acc = 0; for (const d of durs) { acc += d / sum; ends.push(acc); }
    return t => {
      let i = 0; while (i < n - 1 && t > ends[i]) i++;
      const t0 = i ? ends[i - 1] : 0, k = Math.min(1, Math.max(0, (t - t0) / (ends[i] - t0)));
      const from = i ? vals[i - 1] : 0;
      return from + (vals[i] - from) * EASE.outQuad(k);
    };
  }
  // DOTween.Shake (fadeOut): (int)(vibrato·duration) random steps of decaying strength, each a new direction within ±randomness°.
  function shakeCurve(duration, vibrato, randomness) {
    const n = Math.max(2, Math.floor(vibrato * duration));
    const pts = [[0, 0]]; let ang = Math.random() * 360;
    for (let i = 0; i < n; i++) {
      if (i === n - 1) { pts.push([0, 0]); break; }
      const s = 1 - i / n; ang = ang - 180 + (Math.random() * 2 - 1) * randomness;
      const r = ang * Math.PI / 180; pts.push([Math.cos(r) * s, Math.sin(r) * s]);
    }
    return t => {
      const f = t * n, i = Math.min(n - 1, Math.floor(f)), k = EASE.outQuad(f - i);
      const a = pts[i], b = pts[i + 1];
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    };
  }
  // DOJump: x moves linearly, y gets jumpPower·OutQuad up and back (yoyo), the whole thing eased by the tween's ease.
  const jumpY = (s, power) => power * EASE.outQuad(s < .5 ? 2 * s : 2 - 2 * s);
  // Play a tween on an element by sampling frame(t) (t eased 0..1) into Web Animations keyframes.
  function tween(e, ms, frame, ease = EASE.linear) {
    const n = Math.max(2, Math.min(60, Math.ceil(ms / 16)));
    const kf = []; for (let i = 0; i <= n; i++) { const t = i / n; kf.push(Object.assign({ offset: t }, frame(ease(t), t))); }
    return e.animate(kf, { duration: Math.max(1, ms) }).finished.catch(() => { });
  }

  function create(ctx) {
    const { stage, D, petImg, foodImg, perkName, esc, trigLabel } = ctx;
    const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

    let root = null, gen = 0;
    const state = { speed: 1, playing: true, log: null, meta: null, i: 0, els: new Map(), names: new Map(), nums: new Map(), gains: new Map(), lastSnap: null };
    // the game's particle effects (js/fx.js), on a canvas between the pets and the numbers
    const PFX = window.SAPFx ? window.SAPFx.create(() => state.speed) : null;

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
      if (PFX) { PFX.attach(root, root.querySelector('.b-fx')); PFX.preload(); }
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
      e._d = d;
      // hover: show the pet's card and hold the fight until the pointer leaves
      e.addEventListener('pointerenter', ev => {
        if (ev.pointerType === 'touch' || !ctx.petTip) return;
        state.hold = e; e.classList.add('hovered'); root && root.classList.add('held');
        ctx.showTip(e, ctx.petTip(e._d));
      });
      e.addEventListener('pointerleave', () => {
        if (state.hold === e) state.hold = null; e.classList.remove('hovered'); root && root.classList.remove('held');
        ctx.hideTip && ctx.hideTip();
      });
      e.innerHTML = `
        <div class="bp-lvl"><span class="bp-lv-t">Lvl</span><span class="bp-lv-n"></span><div class="bp-xp"></div></div>
        <div class="bp-move"><div class="bp-body">
          <img class="bp-sprite" alt="">
          <img class="bp-perk" alt="">
          <img class="bp-band" src="${FX('Bandage')}" alt="">
          <div class="bp-mana"><span></span></div>
        </div></div>
        <div class="bp-stats"><div class="bp-stat atk"><span></span></div><div class="bp-stat hp"><span></span></div></div>
        <div class="trig"><img src="img/ui/Lightning.webp" alt=""><span></span></div>`;
      update(e, d, true);
      return e;
    }
    function flash(n) { n.classList.remove('flash'); void n.offsetWidth; n.classList.add('flash'); }
    function update(e, d, first) {
      if (e.dataset.id !== d.id) { e.dataset.id = d.id; e.querySelector('.bp-sprite').src = petImg(d.id); }
      const a = e.querySelector('.atk span'), h = e.querySelector('.hp span');
      if (a.textContent !== String(d.a)) a.textContent = d.a;   // the change itself is shown by statPunch (DOBuffAttack / DOLoseAttack)
      if (h.textContent !== String(d.h)) h.textContent = d.h;
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
          // BoardView.SummonMinionAsync: the new pet is placed in its slot and punched (DOLaunchProjectile = DOPunchScale 1)
          e = petEl(side, d); place(e, side, d.s != null ? d.s : i);
          $r('.b-arena').append(e); state.els.set(d.u, e);
          if (opts.pop !== false) punch(d.u, 1);
        } else {
          if (e.dataset.id !== d.id) { fx('Smoke', d.u); punch(d.u, 1); }   // BoardView.TransformMinion: SmokeFX
          const x0 = parseFloat(e.style.left);
          update(e, d); e._d = d; place(e, side, d.s != null ? d.s : i);
          const dxu = (parseFloat(e.style.left) - x0) / U;
          if (dxu && opts.pop !== false) tilt(e, dxu);
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
    // BoardView.MoveMinion: DOMove over MinionMoveDuration (400 ms, InOutQuad; the CSS transition on .bpet) while the sprite turns
    // by dx·8° (InOutQuad, 70% of the time) and springs back (OutBack, overshoot |angle/5|, the last 30%)
    function tilt(e, dxu) {
      const b = e.querySelector('.bp-body'), ang = -dxu * 8, d = ms(T.move);
      e.style.transitionDuration = d + 'ms';
      tween(b, d, (k, t) => ({ transform: `rotate(${t < .7 ? ang * EASE.inOutQuad(t / .7) : ang * (1 - EASE.outBack((t - .7) / .3, Math.abs(ang / 5)))}deg)` }));
    }
    const posOf = u => { const e = state.els.get(u); return e ? [parseFloat(e.style.left) + PET_W / 2, SPRITE_CY] : null; };
    const sideOf = u => (state.names.get(u) || {}).side;
    // live centre of an element in stage pixels (includes running tweens)
    function centreOf(n) {
      if (!n || !n.isConnected || !root) return null;
      const r = n.getBoundingClientRect(), R = root.getBoundingClientRect(), k = R.width / 1280 || 1;
      return [(r.left + r.width / 2 - R.left) / k, (r.top + r.height / 2 - R.top) / k];
    }
    // BoardView.SpawnParticles: the effect plays at the pet's position
    function fx(name, u, opts) { const q = posOf(u); return PFX && q ? PFX.spawn(name, q[0], q[1], opts) : null; }
    // BoardView.DamageMinion: StickerBlastFX at the pet, turned 180° about y when the pet is the player's
    const hitFx = u => fx('StickerBlast', u, { flip: sideOf(u) === 0 });
    // BoardView.PlaySplash: Buff for stat buffs (BuffAfterFX) and positive perks, Debuff for ailments (GiveMinionPerk, PerkTemplate.Positive)
    const splash = (u, type) => fx(type, u);

    // ------------------------------------------------------------ effects
    function fxEl(cls, x, y, html) { const f = el('div', cls, html); f.style.left = x + 'px'; f.style.top = y + 'px'; $r('.b-fx').append(f); return f; }
    const ms = n => n / state.speed;
    const bodyOf = u => { const e = state.els.get(u); return e ? e.querySelector('.bp-body') : null; };
    // MinionView.DOPunchScale(s): punch Vector3.one·0.2s over 0.5s seconds, vibrato 10, elasticity 1
    function punch(u, s = 1) {
      const b = bodyOf(u); if (!b) return;
      const c = punchCurve(s * 0.5, 10, 1), p = 0.2 * s;
      tween(b, ms(s * 500), (k, t) => ({ transform: `scale(${1 + p * c(t)})` }));
    }
    // TMP stat text punch (DOBuffAttack/Health/Mana: Vector3.one·2, 0.3 s, vibrato 3; DOLose*: ·0.7)
    function statPunch(u, which, amount) {
      const e = state.els.get(u); if (!e) return;
      const sp = e.querySelector(which === 'atk' ? '.atk span' : which === 'hp' ? '.hp span' : '.bp-mana span'); if (!sp) return;
      const c = punchCurve(0.3, 3, 1);
      tween(sp, ms(300), (k, t) => ({ transform: `scale(${1 + amount * c(t)})` }));
    }
    // MinionView.DODamage: DOShakePosition(0.5 s, Vector3.one·0.2, vibrato 100, randomness 90, fadeOut)
    function shake(u) {
      const b = bodyOf(u); if (!b) return;
      const c = shakeCurve(0.5, 100, 90), s = 0.2 * U;
      tween(b, ms(500), (k, t) => { const [x, y] = c(t); return { transform: `translate(${x * s}px,${-y * s}px)` }; });
    }
    // MinionView.DOLand: scale to (1.2, 0.8) and local y −0.05 over 0.1 s OutQuad, yoyo once
    function land(u) {
      const b = bodyOf(u); if (!b) return Promise.resolve();
      return tween(b, ms(200), (k, t) => { const q = EASE.outQuad(t < .5 ? 2 * t : 2 - 2 * t);
        return { transform: `translateY(${0.05 * U * q}px) scale(${1 + .2 * q},${1 - .2 * q})` }; });
    }
    // ability activation: the sprite's outline highlight (AllOneShader.DOHighlight) while its effects play
    function highlight(u) {
      const e = state.els.get(u); if (!e) return;
      e.classList.remove('active'); void e.offsetWidth; e.classList.add('active');
      clearTimeout(e._hl); e._hl = setTimeout(() => e.classList.remove('active'), ms(500));
    }
    // BoardView.DamageMinion: one FxText per pet that adds up repeated damage; it jumps (0, +0.5) with power 0.2 over 0.5 s
    // (default ease OutQuad) and despawns after 1 s. FxText.SetPunch turns on the text's punch component, whose settings are
    // not in the decompiled code: the reference video shows the number starting at about 2.2× and settling to 1× over
    // about 0.22 s (ease-in). Colour (FxText.SetColor): red (1, 0, 0) for damage, orange (1, 0.56, 0.37) for a stat set.
    const NUM_PUNCH = { from: 2.2, ms: 220 };
    function bigNumber(u, n, color = 'red') {
      const q = posOf(u); if (!q) return;
      let f = state.nums.get(u);
      if (f && f.isConnected && f._c === color) { f._n += n; f.textContent = String(f._n); }
      else { f = fxEl('b-num ' + color, q[0], q[1], String(n)); f._n = n; f._c = color; state.nums.set(u, f); }
      clearTimeout(f._t); f._t = setTimeout(() => { f.remove(); if (state.nums.get(u) === f) state.nums.delete(u); }, ms(1000));
      const pk = NUM_PUNCH.ms / 500;
      tween(f, ms(500), (k, t) => {
        const s = t < pk ? NUM_PUNCH.from - (NUM_PUNCH.from - 1) * EASE.inQuad(t / pk) : 1;
        const kk = EASE.outQuad(t);
        return { transform: `translate(-50%,-50%) translateY(${-(0.5 * U * kk + jumpY(kk, 0.2 * U))}px) scale(${s})` };
      });
    }
    // BoardView.GainStat: an FxGain icon per stat that adds up; moves (∓0.25, +1) over 0.25 s OutBack, waits 0.5 s, shrinks to 0 in 0.2 s InQuad
    function gainIcon(u, which, n) {
      const q = posOf(u); if (!q || !n) return;
      const key = u + ':' + which; let f = state.gains.get(key);
      // the sign sits outside the icon, the number inside it (reference video)
      const txt = v => `<b>${v < 0 ? '−' : '+'}</b><span>${Math.abs(v)}</span>`;
      if (f && f.isConnected) { f._n += n; f.innerHTML = txt(f._n); return; }
      f = fxEl('b-gain ' + which + (n < 0 ? ' neg' : ''), q[0], q[1], txt(n)); f._n = n; state.gains.set(key, f);
      const dx = (which === 'hp' ? 0.25 : -0.25) * U, dy = -U;
      const base = 'translate(-50%,-50%) scale(.6)';
      (async () => {
        await tween(f, ms(250), k => ({ transform: `${base} translate(${dx * k / .6}px,${dy * k / .6}px)` }), EASE.outBack);
        await wait(ms(500));
        await tween(f, ms(200), k => ({ transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(${.6 * (1 - k)})` }), EASE.inQuad);
        f.remove(); if (state.gains.get(key) === f) state.gains.delete(key);
      })();
    }
    function floatText(u, text, cls) {
      const q = posOf(u); if (!q) return;
      const f = fxEl('b-float ' + cls, q[0], q[1] - 40, text);
      f.animate([{ transform: 'translate(-50%,-40%) scale(.6)', opacity: 0 }, { transform: 'translate(-50%,-90%) scale(1.1)', opacity: 1, offset: .2 }, { transform: 'translate(-50%,-200%) scale(1)', opacity: 0 }],
        { duration: 950 / Math.sqrt(state.speed), easing: 'ease-out' }).finished.then(() => f.remove(), () => f.remove());
    }
    // BoardView.PlayProjectileAsync → FxBase.Jump: the source punches (1), the sprite grows 0 → 0.75 in 0.1 s while it jumps to the
    // target (jump power 1.5 ± 0.1, ProjectileDuration 400 ms, Ease.Linear), spinning 360°·duration
    // The sprite comes from SpriteLibrary by the Projectile value (<PlayProjectileAsync>d__23): Damage → Rock, Health → Heart,
    // Attack → Fist, HealthAndAttack → HeartFist, GasYellow → Gas2g, ManaBurst → ManaRock; stat sprites don't spin. A perk's
    // ability throws the perk's own sprite (d__24, PerkAsset.GetSprite).
    const PROJ = { 0: ['Rock', true], 2: ['game/Heart', false], 3: ['game/Fist', false], 4: ['game/HeartFist', false], 9: ['game/Gas2g', true], 15: ['ManaRock', true] };
    const projImg = p => PROJ[p] ? FX(PROJ[p][0]) : null;
    // ProjectileUtility.GetBuff(attack > 0, health > 0), else HealthAndAttack
    const buffProj = (da, dh) => da > 0 && dh > 0 ? 4 : da > 0 ? 3 : dh > 0 ? 2 : 4;
    // the projectile a step throws: the ability's own ProjectileModel wins, then the perk's sprite, then the default for the kind
    function stepProj(st, kind, mine) {
      if (st.proj === 14) return null;                                   // Projectile.None
      if (st.proj != null && PROJ[st.proj]) return { img: projImg(st.proj), spin: PROJ[st.proj][1] };
      if (kind === 'hit') return st.perkSrc ? { img: foodImg(st.perkSrc), perk: true, spin: true } : { img: FX(st.mana ? 'ManaRock' : 'Rock'), spin: true };
      if (kind === 'buff') {
        const da = mine.reduce((a, s) => a + (s.da || 0), 0), dh = mine.reduce((a, s) => a + (s.dh || 0), 0);
        // a stat set that isn't Positive (Skunk) throws the gas cloud in the reference video
        if (st.set && !st.pos && (da < 0 || dh < 0)) return { img: projImg(9), spin: true };
        return { img: projImg(buffProj(da, dh)), spin: false };
      }
      return null;
    }
    async function projectile(fromU, toU, kind, img, opts = {}) {
      const a = posOf(fromU), b = posOf(toU);
      if (!a || !b || fromU === toU) return;
      punch(fromU, 1);
      const p = fxEl('b-proj ' + (img ? 'img ' : '') + (opts.perk ? 'perk ' : '') + (kind || ''), a[0], a[1], img ? `<img src="${img}" alt="">` : '');
      const dx = b[0] - a[0], dy = b[1] - a[1], power = (1.5 + (Math.random() * .2 - .1)) * U, dur = T.projectile;
      const spin = opts.spin === false ? 0 : 360 * dur / 1000, grow = 100 / dur;
      await tween(p, ms(dur), k => ({ transform: `translate(-50%,-50%) translate(${dx * k}px,${dy * k - jumpY(k, power)}px) rotate(${-spin * k}deg) scale(${.75 * Math.min(1, k / grow)})` }));
      p.remove();
    }
    // UIBattleIntro.MinionEnterRocketLanding: the pet rides a rocket (scale 2) to its slot in 0.75 s OutQuad, the rocket shrinks
    // for 0.25 s and jumps away (power 1.5, 0.5 s), and the pet lands (DOLand)
    async function rocketIn(e, side, delay) {
      const dx = side === 0 ? -380 : 380, dy = -420;
      e.style.opacity = '0';
      await wait(delay / state.speed);
      if (!e.isConnected) return;
      e.style.opacity = '1';
      const rocket = el('img', 'bp-rocket'); rocket.src = FX('Rocket'); if (side === 1) rocket.classList.add('flip');
      e.querySelector('.bp-body').append(rocket);
      const dur = ms(750);
      const x0 = parseFloat(e.style.left) + PET_W / 2;
      // UIBattleIntro: SmokeTrailFX follows the rocket (Follow offset y −0.5) and is destroyed after 2 s (AutoDestroy)
      const rocketAt = () => { const c = centreOf(rocket); return c && [c[0], c[1] + 0.5 * U]; };
      if (PFX) PFX.spawn('SmokeTrail', x0 + dx, SPRITE_CY + 13 + dy + 0.5 * U, { follow: rocketAt, life: 2 });
      await tween(e, dur, k => ({ transform: `translate(${dx * (1 - k)}px,${dy * (1 - k)}px)` }), EASE.outQuad);
      const rx = (side === 0 ? -1 : 1) * 2 * U;
      const rb = side ? 'rotate(-135deg) scaleX(-1)' : 'rotate(135deg)';
      tween(rocket, ms(750), (k, t) => t < 1 / 3 ? { transform: `${rb} scale(${1 - .5 * EASE.outQuad(t * 3)})` }
        : { transform: `translate(${rx * (t - 1 / 3) * 1.5}px,${-jumpY((t - 1 / 3) * 1.5, 1.5 * U)}px) ${rb} scale(.5)`, opacity: 1 - (t - 1 / 3) * 1.5 })
        .then(() => rocket.remove());
      await land(e._d && e._d.u);
    }
    // BoardView.DestroyPunch: the pet is punched off the board: DOJump to just past the camera edge (viewport x 0 or 1, then 1 unit
    // further) with jump power DestroyPunchJumpPower 0.05, taking |dx|·0.025 / DestroyPunchSpeedFactor 0.4 seconds (default OutQuad)
    // BoardView.TryDestroyPuff: the SmokeFX particles at the pet, and the pet is hidden
    async function puffOut(u) {
      const e = state.els.get(u); if (!e) return;
      fx('Smoke', u);
      state.els.delete(u); e.classList.add('gone'); e.remove();
    }
    // Which faint the game plays. DestroyMinionRenderer: kill type 0 (attack damage) → DestroyPunch, anything else → puff.
    // Inside a trade the TradeAggregator decides, and that branch is only partly readable; the reference video shows both
    // front pets puffing when they knock each other out and the lone loser being punched off when only one dies.
    function faintKind(st, grp) {
      if (st.dt) return 'puff';
      const tr = state.trade;
      if (tr && tr.includes(st.tgt) && tr.every(u => grp.some(x => x.tgt === u && !x.dt))) return 'puff';
      return 'punch';
    }
    const destroyOut = (st, grp) => faintKind(st, grp) === 'puff' ? puffOut(st.tgt) : faintOut(st.tgt);
    async function faintOut(u) {
      const e = state.els.get(u); if (!e) return;
      state.els.delete(u); e.classList.add('gone');
      const side = sideOf(u), x0 = parseFloat(e.style.left) + PET_W / 2;
      const stageW = stage.clientWidth || 1280, stageX = (1280 - stageW) / 2;
      const xEnd = side === 0 ? stageX - U : stageX + stageW + U, dx = xEnd - x0;
      const dur = ms(Math.abs(dx / U) * 0.025 / T.punchSpeed * 1000);
      // DestroyPunch: SmokeTrailFX rides along with the jump; SmashFX at the end point
      const body = e.querySelector('.bp-body');
      const trail = PFX && PFX.spawn('SmokeTrail', x0, SPRITE_CY, { follow: () => centreOf(body) });
      await tween(e, dur, k => ({ transform: `translate(${dx * k}px,${-jumpY(k, T.punchJump * U)}px)` }), EASE.outQuad);
      if (trail) trail.stop();
      if (PFX) PFX.spawn('Smash', xEnd, SPRITE_CY);
      e.remove();
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

    // hits and stat gains that one pet hands out at once play together (Hedgehog, Flamingo, Ant...)
    const groupKey = st => !st.src ? '' : st.kind === 'damage' && st.dk !== 'attack' ? 'hit' : st.kind === 'remove' ? 'hit' : st.kind === 'buff' ? 'buff' : st.kind === 'perk' ? 'perk' : '';
    async function multiStep(grp, my) {
      const sp = state.speed, W = ms => wait(ms / sp).then(() => { if (my !== gen || !root) throw STALE; });
      for (const st of grp) logLine(describe(st));
      const kind = groupKey(grp[0]);
      const tgts = [...new Set(grp.map(st => st.tgt))];
      await Promise.all(tgts.filter(t => t !== grp[0].src).map(t => {
        const pk = kind === 'perk' ? grp.find(st => st.tgt === t).perk : null;
        const mine = grp.filter(st => st.tgt === t);
        if (kind === 'hit' || kind === 'buff') { const pj = stepProj(mine[0], kind, mine); return pj ? projectile(grp[0].src, t, kind === 'hit' ? 'rock' : 'heal', pj.img, pj) : null; }
        return projectile(grp[0].src, t, '', pk ? foodImg(pk) : undefined, { perk: true });
      }));
      if (my !== gen || !root) throw STALE;
      render(grp[grp.length - 1].snap);
      for (const t of tgts) {
        const mine = grp.filter(st => st.tgt === t);
        if (kind === 'hit') { hitFx(t); shake(t); const n = mine.reduce((a, st) => a + (st.kind === 'damage' ? st.n : -(st.dh || 0)), 0); if (n) { bigNumber(t, n); statPunch(t, 'hp', 0.7); } }
        else if (kind === 'buff') statFx(t, mine);
        else if (kind === 'perk') { const pk = (mine.find(st => st.perk) || {}).perk; if (pk) splash(t, perkSplash(pk)); punch(t, 1); }
      }
      await W(kind === 'hit' ? 130 : T.buffDelay);
    }
    // BoardView.GiveMinionPerk with its last argument set (GiveMinionPerkRenderer always passes it): a perk plays the Eats
    // splash (the sticker pieces), an ailment Debuff
    const perkSplash = pk => (ctx.perkPositive ? ctx.perkPositive(pk) : true) ? 'Eats' : 'Debuff';
    // BoardView.SetMinionStats: a health loss shakes the pet and shows an orange FxText with the Gas splash; any other
    // non-Positive change shakes it with the Gas splash; a Positive one plays Buff. The stat icons rise as in BuffAfterFX.
    function statFx(u, mine) {
      const da = mine.reduce((a, st) => a + (st.da || 0), 0), dh = mine.reduce((a, st) => a + (st.dh || 0), 0);
      const loss = mine.some(st => st.set && !st.pos);
      if (!loss) { splash(u, 'Buff'); buffFx(u, da, dh); return; }
      splash(u, 'Gas'); shake(u);
      if (dh < 0) { bigNumber(u, -dh, 'orange'); statPunch(u, 'hp', 0.7); }
      if (da) { gainIcon(u, 'atk', da); statPunch(u, 'atk', da > 0 ? 2 : 0.7); }
      if (dh > 0) { gainIcon(u, 'hp', dh); statPunch(u, 'hp', 2); }
    }
    // BoardView.BuffAfterFX: the stat changes, its FxGain icon rises, the pet punches (1, or 0.7 for a loss) and so does the stat text
    function buffFx(u, da, dh) {
      if (da) { gainIcon(u, 'atk', da); statPunch(u, 'atk', da > 0 ? 2 : 0.7); }
      if (dh) { gainIcon(u, 'hp', dh); statPunch(u, 'hp', dh > 0 ? 2 : 0.7); }
      if (da || dh) punch(u, (da < 0 || dh < 0) && !(da > 0 || dh > 0) ? 0.7 : 1);
    }
    async function faintAll(grp, my) {
      await attackBack();
      for (const st of grp) logLine(describe(st));
      await Promise.all(grp.map(st => destroyOut(st, grp)));
      if (my !== gen || !root) throw STALE;
      render(grp[grp.length - 1].snap);
      await wait(ms(T.puffDelay));
      if (my !== gen || !root) throw STALE;
    }
    // TradeAggregator.TradeAnimation, after the hits: both pets go back to their slots (MinionAttackBackToStartDuration 70 ms, Linear)
    async function attackBack() {
      const pb = state.pendingBack; if (!pb) return; state.pendingBack = null;
      await Promise.all(pb.map(([e, x]) => e.isConnected ? tween(e, ms(T.back), k => ({ transform: `translateX(${x * (1 - k)}px)` })).then(() => { e.style.transform = ''; }) : null));
      for (const [e] of pb) { const p = e.closest('.bpet'); if (p) p.classList.remove('attacking'); }
    }
    async function step(st, my) {
      const sp = state.speed, W = ms => wait(ms / sp).then(() => { if (my !== gen || !root) throw STALE; });
      if (st.kind === 'summon' || st.kind === 'transform') st.snap.t.forEach((t, s) => t.forEach(d => state.names.set(d.u, { id: d.id, side: s })));
      logLine(describe(st));
      if (state.pendingBack && !((st.kind === 'damage' && st.dk === 'attack') || st.kind === 'block')) await attackBack();
      switch (st.kind) {
        case 'start': break;
        // AbilityAggregator: the pet is highlighted (and its ability card bounces), then AbilityHighlightDelay 100 ms
        case 'ability': highlight(st.src); render(st.snap); await W(T.abilityHighlight); break;
        case 'attack': {
          // TradeAggregator.TradeAnimation: wind-up back 15% of the gap with a 15° lean (200 ms InQuint), then forward 50% of the
          // gap while straightening (100 ms InQuint); the hits play, then attackBack() returns them
          // TradeAggregator.Run highlights both pets red; TradeAnimation tweens a child of the MinionView (+0x50), so only the
          // sprite moves and the level badge and stats stay in the slot
          const a0 = state.els.get(st.a), b0 = state.els.get(st.b);
          state.trade = [st.a, st.b];
          const a = a0 && a0.querySelector('.bp-move'), b = b0 && b0.querySelector('.bp-move');
          if (a && b) {
            a0.classList.add('attacking'); b0.classList.add('attacking');
            const dist = Math.abs(parseFloat(b0.style.left) - parseFloat(a0.style.left));
            const lunge = async (e, dir) => {
              await tween(e, ms(T.windup), k => ({ transform: `translateX(${-dir * .15 * dist * k}px) rotate(${-dir * T.attackRot * k}deg)` }), EASE.inQuint);
              await tween(e, ms(T.release), k => ({ transform: `translateX(${dir * dist * (-.15 + .5 * k)}px) rotate(${-dir * T.attackRot * (1 - k)}deg)` }), EASE.inQuint);
              e.style.transform = `translateX(${dir * dist * .35}px)`;
              return [e, dir * dist * .35];
            };
            state.pendingBack = await Promise.all([lunge(a, 1), lunge(b, -1)]);
            if (my !== gen || !root) throw STALE;
          }
          render(st.snap); break;
        }
        case 'jump': {
          // BoardView.ThrowMinion: DOLocalJump to the target plus ThrowMinion.DestinationOffset (0.35, −0.8), height 1.5,
          // 420 ms, turning −510° (Ease.Linear); the pet is then teleported back (AfterTeleportDelay 0)
          state.trade = null;
          const a = state.els.get(st.src), q = posOf(st.tgt), p0 = posOf(st.src);
          if (a && q && p0) {
            const dir = sideOf(st.src) === 0 ? 1 : -1;
            const dx = q[0] - p0[0] - dir * .35 * U, dy = .8 * U;
            await tween(a, ms(T.throwDur), k => ({ transform: `translate(${dx * k}px,${dy * k - jumpY(k, T.throwHeight * U)}px) rotate(${dir * -T.throwRot * k}deg)` }));
            a.style.transform = '';
          }
          break;
        }
        case 'damage': {
          if (st.dk !== 'attack' && st.src && st.src !== st.tgt) { const pj = stepProj(st, 'hit', [st]); if (pj) await projectile(st.src, st.tgt, 'rock', pj.img, pj); }
          hitFx(st.tgt); shake(st.tgt); bigNumber(st.tgt, st.n); statPunch(st.tgt, 'hp', 0.7);
          render(st.snap); await W(st.dk === 'attack' ? 120 : 130); break;
        }
        case 'remove': {
          if (st.src && st.src !== st.tgt) { const pj = stepProj(st, 'hit', [st]); if (pj) await projectile(st.src, st.tgt, 'rock', pj.img, pj); }
          hitFx(st.tgt); shake(st.tgt); if (st.dh) { bigNumber(st.tgt, -st.dh); statPunch(st.tgt, 'hp', 0.7); }
          render(st.snap); await W(130); break;
        }
        case 'block': floatText(st.tgt, 'Blocked!', 'block'); render(st.snap); await W(220); break;
        case 'buff': {
          if (st.src && st.src !== st.tgt) { const pj = stepProj(st, 'buff', [st]); if (pj) await projectile(st.src, st.tgt, 'heal', pj.img, pj); }
          render(st.snap); statFx(st.tgt, [st]);
          await W(T.buffDelay); break;
        }
        case 'perk':
          // GiveMinionPerkRenderer: the perk flies over as a projectile, the pet gets it and punches (1), then 100 ms
          if (st.perk && st.src && st.src !== st.tgt) await projectile(st.src, st.tgt, '', foodImg(st.perk));
          render(st.snap); if (st.perk) { splash(st.tgt, perkSplash(st.perk)); punch(st.tgt, 1); } await W(T.buffDelay); break;
        case 'perkfx': { const e = state.els.get(st.src); if (e) flash(e.querySelector('.bp-perk')); punch(st.src, 1); render(st.snap); await W(T.abilityHighlight); break; }
        // DestroyMinionRenderer: DestroyPunch, then DestroyMinionPuffDelay 300 ms
        case 'faint': await destroyOut(st, [st]); render(st.snap); await W(T.puffDelay); break;
        // SummonMinionRenderer: placed and punched (in render), then SummonMinionDelay 500 ms
        case 'summon': render(st.snap); await W(T.summonDelay); break;
        case 'summonfail': break;
        case 'move': render(st.snap); await W(T.move); break;
        case 'swallow': {
          // BoardView.Swallow (FireMouth / CloseMouth) lasts GetSwallowDuration = 0.3 + |dx|·0.2/5 s
          const e = state.els.get(st.tgt), q = posOf(st.src);
          if (e && q) {
            e.classList.add('gone'); state.els.delete(st.tgt);
            const dx = q[0] - parseFloat(e.style.left) - PET_W / 2;
            await tween(e, ms((0.3 + Math.abs(dx / U) * 0.04) * 1000), k => ({ transform: `translateX(${dx * k}px) scale(${1 - .9 * k})`, opacity: 1 - k }), EASE.inQuad);
            e.remove(); punch(st.src, 1); fx('Swallow', st.src);   // CloseMouth: SwallowFX
          }
          render(st.snap); break;
        }
        case 'transform': render(st.snap); await W(340); break;
        // BoardView.GiveMinionExp: DOExp (punch 1) and the exp / level-up particles, then GiveMinionExpDelay 200 ms
        case 'xp': fx('Exp', st.tgt); fx(st.lvlup ? 'Level' : 'Exp', st.tgt); punch(st.tgt, 1); render(st.snap); await W(T.expDelay); break;
        // BoardView.GiveMinionMana: DOMana (punch 1 and the mana text punch 2)
        case 'mana': fx('Mana', st.tgt); render(st.snap); punch(st.tgt, 1); statPunch(st.tgt, 'mana', 2); await W(110); break;
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
      state.log = log; state.meta = meta; state.i = 0; state.els = new Map(); state.names = new Map(); state.nums = new Map(); state.gains = new Map(); state.pendingBack = null; state.trade = null; state.playing = true;
      if (meta.speed) state.speed = meta.speed;
      build(meta);
      try {
        await intro(log[0].snap, my);
        if (my !== gen) return;
        for (state.i = 1; state.i < log.length; state.i++) {
          while ((!state.playing || holding()) && my === gen) await wait(80);
          if (my !== gen) return;
          const st = log[state.i];
          const grp = [st];
          if (groupKey(st)) while (state.i + 1 < log.length && groupKey(log[state.i + 1]) === groupKey(st) && log[state.i + 1].src === st.src) grp.push(log[++state.i]);
          // DestroyAggregator: faints that happen together are rendered at once (WhenAll)
          if (st.kind === 'faint') while (state.i + 1 < log.length && log[state.i + 1].kind === 'faint') grp.push(log[++state.i]);
          if (grp.length > 1 && st.kind === 'faint') await faintAll(grp, my);
          else if (grp.length > 1) await multiStep(grp, my); else await step(st, my);
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
      $r('.b-arena').innerHTML = ''; $r('.b-fx').innerHTML = ''; if (PFX) PFX.clear();
      state.els = new Map(); state.names = new Map(); state.nums = new Map(); state.gains = new Map(); state.pendingBack = null; state.trade = null;
      const L = $r('.b-log ol'); L.innerHTML = '';
      for (const st of state.log) { if (st.snap) st.snap.t.forEach((t, s) => t.forEach(d => state.names.set(d.u, { id: d.id, side: s }))); const h = describe(st); if (h) L.append(el('li', '', h)); }
      if (L.lastElementChild) L.lastElementChild.classList.add('cur');
      render(last.snap, { pop: false });
      state.playing = true; updateButtons();
      if (my === gen) result(last.result);
    }

    // the hovered pet can faint / be swallowed under the pointer (no pointerleave): stop holding then
    function holding() {
      const e = state.hold; if (!e) return false;
      if (!e.isConnected || e.classList.contains('gone')) { state.hold = null; if (root) root.classList.remove('held'); ctx.hideTip && ctx.hideTip(); return false; }
      return true;
    }
    function stop() { gen++; state.hold = null; ctx.hideTip && ctx.hideTip(); if (PFX) PFX.clear(); if (root) { root.remove(); root = null; } }
    return { play, stop, skip, get speed() { return state.speed; } };
  }

  window.SAPBattle = { create };
})();
