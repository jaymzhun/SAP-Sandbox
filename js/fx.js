/* Super Auto Pets sandbox — the game's battle particle effects.
 * Plays the particle prefabs in js/fx-data.js (converted from the game's BoardView / ParticlesLibrary prefabs) on a canvas
 * over the battle stage. It is a small re-implementation of Unity's Shuriken particle system covering the modules those
 * prefabs use: main module, emission (bursts, rate over time and distance), shapes (sphere, hemisphere, circle, cone,
 * cone volume, box), size / rotation / colour / velocity over lifetime, limit velocity, force, inherit velocity, rotation
 * by speed, texture-sheet and sprite animation, billboard / stretched / mesh-quad rendering with alpha or additive blending.
 * Coordinates: Unity units, y up; the stage is 120 px per unit (orthographic camera size 3 on a 720 px stage).
 */
(function () {
  'use strict';
  const U = 120, VIEW_H = 720, G = 9.81;
  const TEX = n => `img/fx/game/${n}`;
  const rnd = Math.random;
  const lerp = (a, b, t) => a + (b - a) * t;

  // ------------------------------------------------------------ curves and gradients (Unity semantics)
  // AnimationCurve: cubic Hermite between keys [time, value, inSlope, outSlope], clamped outside the keys
  function curve(c, t) {
    const n = c.length; if (!n) return 0;
    if (t <= c[0][0]) return c[0][1];
    if (t >= c[n - 1][0]) return c[n - 1][1];
    let i = 0; while (i < n - 2 && t > c[i + 1][0]) i++;
    const k0 = c[i], k1 = c[i + 1], dt = k1[0] - k0[0];
    if (dt <= 0) return k1[1];
    const s = (t - k0[0]) / dt, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * k0[1] + (s3 - 2 * s2 + s) * dt * k0[3] + (-2 * s3 + 3 * s2) * k1[1] + (s3 - s2) * dt * k1[2];
  }
  // MinMaxCurve: constant | {min,max} two constants | {k,c} curve | {k,c,c2} two curves; r is the particle's random 0..1
  function mm(m, t, r) {
    if (m == null) return 0;
    if (typeof m === 'number') return m;
    if ('min' in m) return lerp(m.min, m.max, r);
    if (m.c2) return m.k * lerp(curve(m.c2, t), curve(m.c, t), r);
    return m.k * curve(m.c, t);
  }
  // Gradient {c: [[t,r,g,b]], a: [[t,a]], mode} (mode 1 = fixed)
  function keys(ks, t, n, fixed) {
    if (ks.length === 1 || t <= ks[0][0]) return ks[0].slice(1, 1 + n);
    for (let i = 0; i < ks.length - 1; i++) {
      const a = ks[i], b = ks[i + 1];
      if (t <= b[0]) {
        if (fixed) return b.slice(1, 1 + n);
        const k = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 1, o = [];
        for (let j = 1; j <= n; j++) o.push(lerp(a[j], b[j], k));
        return o;
      }
    }
    return ks[ks.length - 1].slice(1, 1 + n);
  }
  const grad = (g, t) => keys(g.c, t, 3, g.mode === 1).concat(keys(g.a, t, 1, g.mode === 1));
  // MinMaxGradient: colour | {min,max} two colours | {g} gradient | {g,g2} two gradients | {rg} random colour from a gradient
  function mmg(m, t, r) {
    if (m == null) return [1, 1, 1, 1];
    if (Array.isArray(m)) return m;
    if (m.min) return m.min.map((v, i) => lerp(v, m.max[i], r));
    if (m.rg) return grad(m.rg, r);
    if (m.g2) { const a = grad(m.g2, t), b = grad(m.g, t); return a.map((v, i) => lerp(v, b[i], r)); }
    return grad(m.g, t);
  }

  // ------------------------------------------------------------ 3D affine maths (row-major 3×3 plus translation)
  const ident = () => ({ m: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] });
  function mul(A, B) {
    const a = A.m, b = B.m, m = new Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) m[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    return { m, t: add3(lin(A, B.t), A.t) };
  }
  const lin = (A, v) => [A.m[0] * v[0] + A.m[1] * v[1] + A.m[2] * v[2], A.m[3] * v[0] + A.m[4] * v[1] + A.m[5] * v[2], A.m[6] * v[0] + A.m[7] * v[1] + A.m[8] * v[2]];
  const app = (A, p) => add3(lin(A, p), A.t);
  const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const len3 = v => Math.hypot(v[0], v[1], v[2]);
  const norm3 = v => { const l = len3(v); return l > 1e-9 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 1]; };
  function inv3(m) {
    const [a, b, c, d, e, f, g, h, i] = m, A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C || 1e-9;
    return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  }
  function quatM(q) {
    const [x, y, z, w] = q;
    return [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)];
  }
  // Unity Quaternion.Euler (degrees): z, then x, then y
  function eulerQ(e) {
    const r = Math.PI / 360, [cx, sx, cy, sy, cz, sz] = [Math.cos(e[0] * r), Math.sin(e[0] * r), Math.cos(e[1] * r), Math.sin(e[1] * r), Math.cos(e[2] * r), Math.sin(e[2] * r)];
    const qx = [sx, 0, 0, cx], qy = [0, sy, 0, cy], qz = [0, 0, sz, cz];
    const qm = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
    return qm(qm(qy, qx), qz);
  }
  function trs(pos, q, s) {
    const R = quatM(q);
    return { m: [R[0] * s[0], R[1] * s[1], R[2] * s[2], R[3] * s[0], R[4] * s[1], R[5] * s[2], R[6] * s[0], R[7] * s[1], R[8] * s[2]], t: [pos[0], pos[1], pos[2] || 0] };
  }
  function unit3() { const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - z * z); return [r * Math.cos(a), r * Math.sin(a), z]; }

  // ------------------------------------------------------------ textures
  const images = new Map();
  function img(name) {
    let im = images.get(name);
    if (!im) { im = new Image(); im.src = TEX(name); images.set(name, im); }
    return im;
  }
  // tinted copies (multiply rgb, keep the texture's alpha), cached by colour quantised to 1/32
  const tinted = new Map();
  function tint(im, sx, sy, sw, sh, r, g, b) {
    const q = v => Math.max(0, Math.min(32, Math.round(v * 32)));
    if (q(r) === 32 && q(g) === 32 && q(b) === 32) return null;
    const key = `${im.src}|${sx},${sy},${sw},${sh}|${q(r)},${q(g)},${q(b)}`;
    let c = tinted.get(key);
    if (!c) {
      c = document.createElement('canvas'); c.width = sw; c.height = sh;
      const x = c.getContext('2d');
      x.drawImage(im, sx, sy, sw, sh, 0, 0, sw, sh);
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = `rgb(${q(r) * 8},${q(g) * 8},${q(b) * 8})`; x.fillRect(0, 0, sw, sh);
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(im, sx, sy, sw, sh, 0, 0, sw, sh);
      if (tinted.size > 400) tinted.clear();
      tinted.set(key, c);
    }
    return c;
  }

  // ------------------------------------------------------------ one particle system of a playing effect
  class System {
    constructor(d, local, inst, index) {
      this.d = d; this.local = local; this.inst = inst; this.index = index;
      this.t = 0; this.delay = mm(d.delay, 0, rnd()); this.acc = 0; this.dacc = 0; this.fired = new Set(); this.ps = [];
      for (const s of [d.tex].concat(((d.uv || {}).sprites || []).map(s => s.img))) if (s) img(s);
    }
    get W() { return mul(this.inst.root, this.local); }
    get alive() { return !this.done || this.ps.length > 0; }
    get done() { const d = this.d; return this.inst.stopped || (!d.looping && this.t - this.delay > d.duration); }
    emit(n, W, tau, spread) {
      const d = this.d, sh = d.shape;
      const scale = (len3([W.m[0], W.m[3], W.m[6]]) + len3([W.m[1], W.m[4], W.m[7]])) / 2;
      for (let i = 0; i < n && this.ps.length < d.max; i++) {
        let p = [0, 0, 0], dir = [0, 0, 1];
        if (sh) {
          const arcAng = () => (sh.arcMode === 3 && spread ? i / n : rnd()) * sh.arc * Math.PI / 180;
          switch (sh.type) {
            case 10: { // circle (XY plane, radial)
              const a = arcAng(); dir = [Math.cos(a), Math.sin(a), 0];
              const r = sh.radius * (1 - sh.thick * (1 - Math.sqrt(rnd()))); p = [dir[0] * r, dir[1] * r, 0]; break;
            }
            case 4: case 7: case 8: case 9: { // cone / cone volume (along +Z)
              const a = arcAng(), rho = 1 - sh.thick * (1 - Math.sqrt(rnd())), tilt = rho * sh.angle * Math.PI / 180;
              p = [Math.cos(a) * rho * sh.radius, Math.sin(a) * rho * sh.radius, 0];
              dir = [Math.cos(a) * Math.sin(tilt), Math.sin(a) * Math.sin(tilt), Math.cos(tilt)];
              if (sh.type >= 8) { const l = sh.length * rnd(); p = [p[0] + dir[0] * l, p[1] + dir[1] * l, p[2] + dir[2] * l]; }
              break;
            }
            case 5: p = [rnd() - .5, rnd() - .5, rnd() - .5]; break; // box (size from the shape scale)
            default: { // sphere / hemisphere
              dir = unit3(); if (sh.type === 2 || sh.type === 3) dir[2] = Math.abs(dir[2]);
              const r = sh.radius * (1 - sh.thick * (1 - Math.cbrt(rnd()))); p = [dir[0] * r, dir[1] * r, dir[2] * r];
            }
          }
          if (sh.randDir) dir = norm3(dir.map((v, k) => lerp(v, unit3()[k], sh.randDir)));
          if (sh.sphDir) { const o = norm3(p); dir = norm3(dir.map((v, k) => lerp(v, o[k], sh.sphDir))); }
          const S = trs([sh.pos[0], sh.pos[1], 0], eulerQ(sh.rot), sh.scale);
          p = app(S, p); dir = norm3(lin(S, dir));
        }
        let v = dir.map(x => x * mm(d.startSpeed, tau, rnd()));
        if (d.space === 1) { p = app(W, p); v = lin(W, v); }
        if (d.inherit && this.inst.vel) {
          const k = mm(d.inherit.k, tau, rnd()), ev = d.space === 1 ? this.inst.vel : lin({ m: inv3(W.m) }, this.inst.vel);
          v = add3(v, ev.map(x => x * k));
        }
        let rot = mm(d.startRot, tau, rnd()), flip = 1;
        if (d.flipRot && rnd() < d.flipRot) { rot = -rot; flip = -1; }
        this.ps.push({
          p, v, age: 0, life: Math.max(1e-3, mm(d.life, tau, rnd())), size: mm(d.size, tau, rnd()) * (d.scaling === 0 && d.space === 1 ? scale : 1),
          rot, flip, col: mmg(d.color, tau, rnd()), r: [rnd(), rnd(), rnd(), rnd(), rnd(), rnd(), rnd()],
        });
      }
    }
    step(dt) {
      const d = this.d, W = this.W;
      this.t += dt;
      const te = this.t - this.delay;
      if (te >= 0 && !this.done) {
        const loop = Math.floor(te / d.duration), tl = te - loop * d.duration, tau = tl / d.duration;
        if (d.rate) { this.acc += mm(d.rate, tau, rnd()) * dt; const n = Math.floor(this.acc); if (n > 0) { this.acc -= n; this.emit(n, W, tau); } }
        if (d.rateDist && this.inst.moved) { this.dacc += this.inst.moved * mm(d.rateDist, tau, rnd()); const n = Math.floor(this.dacc); if (n > 0) { this.dacc -= n; this.emit(n, W, tau); } }
        d.bursts.forEach((b, bi) => {
          const cycles = b.cycles || 1e9;
          for (let c = 0; c < cycles; c++) {
            const bt = b.t + c * b.interval; if (bt > tl || bt >= d.duration) break;
            const key = loop + ':' + bi + ':' + c; if (this.fired.has(key)) continue;
            this.fired.add(key);
            if (rnd() <= b.p) this.emit(Math.round(mm(b.n, tau, rnd())), W, tau, true);
          }
        });
      }
      // particles live in system space (local simulation) or world space
      const Winv = d.space === 1 ? null : inv3(W.m);
      const g = [0, -G * mm(d.gravity, Math.max(0, te) / d.duration, 0), 0], gl = Winv ? lin({ m: Winv }, g) : g;
      const damp = d.limit ? 1 - Math.pow(1 - d.limit.dampen, dt * 30) : 0;
      for (const q of this.ps) {
        q.age += dt; const a = q.age / q.life;
        q.v = add3(q.v, gl.map(x => x * dt));
        if (d.force) q.v = add3(q.v, [mm(d.force.x, a, q.r[0]) * dt, mm(d.force.y, a, q.r[0]) * dt, 0]);
        if (d.limit) {
          const L = mm(d.limit.mag, a, q.r[1]), s = len3(q.v);
          if (s > L && s > 0) { const ns = s - (s - L) * damp; q.v = q.v.map(x => x * ns / s); }
          const drag = mm(d.limit.drag, a, q.r[1]); if (drag) q.v = q.v.map(x => x * Math.max(0, 1 - drag * dt));
        }
        let ex = [0, 0, 0], mod = 1;
        if (d.velOL) {
          ex = [mm(d.velOL.x, a, q.r[2]), mm(d.velOL.y, a, q.r[2]), 0];
          const rad = mm(d.velOL.radial, a, q.r[2]); if (rad) { const o = norm3(q.p); ex = add3(ex, o.map(x => x * rad)); }
          const orb = mm(d.velOL.orbZ, a, q.r[2]); if (orb) { const c = Math.cos(orb * dt), s = Math.sin(orb * dt); q.p = [q.p[0] * c - q.p[1] * s, q.p[0] * s + q.p[1] * c, q.p[2]]; }
          mod = mm(d.velOL.mod, a, q.r[2]) || 1;
        }
        q.vt = add3(q.v, ex).map(x => x * mod);
        q.p = add3(q.p, q.vt.map(x => x * dt));
        let w = d.rotOL ? mm(d.rotOL, a, q.r[3]) : 0;
        if (d.rotBySpeed) { const sp = len3(q.vt), [r0, r1] = d.rotBySpeed.range; w += mm(d.rotBySpeed.k, Math.max(0, Math.min(1, (sp - r0) / ((r1 - r0) || 1))), q.r[4]); }
        q.rot += w * q.flip * dt;
      }
      this.ps = this.ps.filter(q => q.age < q.life);
    }
    draw(cx, W) {
      const d = this.d, R = d.render || { mode: 0, maxSize: .5, lengthScale: 2, velScale: 0 };
      const sysScale = d.scaling === 0 && d.space !== 1 ? (len3([W.m[0], W.m[3], W.m[6]]) + len3([W.m[1], W.m[4], W.m[7]])) / 2 : 1;
      cx.globalCompositeOperation = d.blend === 'add' ? 'lighter' : 'source-over';
      const maxPx = (R.maxSize || .5) * VIEW_H;
      for (const q of this.ps) {
        const a = q.age / q.life;
        const wp = d.space === 1 ? q.p : app(W, q.p);
        const x = wp[0] * U, y = -wp[1] * U;
        let size = q.size * sysScale * (d.sizeOL ? mm(d.sizeOL, a, q.r[5]) : 1) * U;
        if (R.mode !== 4) size = Math.min(size, maxPx);
        if (size <= .2) continue;
        const col = q.col.slice(); if (d.colorOL) { const c = mmg(d.colorOL, a, q.r[6]); for (let k = 0; k < 4; k++) col[k] *= c[k]; }
        for (let k = 0; k < 4; k++) col[k] *= d.tint[k];
        if (col[3] <= .003) continue;
        // texture or sprite frame
        let im, sx = 0, sy = 0, sw, sh, aspect = 1;
        const uv = d.uv;
        if (uv && uv.mode === 1 && uv.sprites) {
          const N = uv.sprites.length, f = frameIndex(uv, a, q, N), s = uv.sprites[f];
          im = img(s.img); if (!im.complete || !im.naturalWidth) continue;
          sw = im.naturalWidth; sh = im.naturalHeight; aspect = sw / sh;
        } else {
          if (!d.tex) continue;
          im = img(d.tex); if (!im.complete || !im.naturalWidth) continue;
          sw = im.naturalWidth; sh = im.naturalHeight;
          if (uv && uv.mode === 0) {
            const [tx, ty] = uv.tiles, N = uv.anim === 1 ? tx : tx * ty, f = frameIndex(uv, a, q, N);
            const col_ = f % tx, row = uv.anim === 1 ? uv.row : Math.floor(f / tx);
            sw = sw / tx; sh = sh / ty; sx = col_ * sw; sy = row * sh;
          }
          aspect = sw / sh;
        }
        const src = tint(im, sx, sy, sw, sh, col[0], col[1], col[2]);
        cx.globalAlpha = Math.min(1, col[3]);
        cx.save(); cx.translate(x, y);
        let w = size, h = size;
        if (R.mode === 1) { // stretched billboard: the texture's left edge leads along the velocity
          const vw = d.space === 1 ? q.vt : lin(W, q.vt), speed = len3(vw);
          w = size * R.lengthScale + speed * R.velScale * U; h = size;
          cx.rotate(Math.atan2(-vw[1], vw[0]) + Math.PI);
        } else {
          if (aspect > 1) h = size / aspect; else w = size * aspect;
          cx.rotate(q.rot);
        }
        if (src) cx.drawImage(src, -w / 2, -h / 2, w, h); else cx.drawImage(im, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
        cx.restore();
      }
    }
  }
  // texture-sheet frame: (start frame + frame over time · cycles) of N frames; values are stored normalised 0..1
  function frameIndex(uv, a, q, N) {
    const sf = mm(uv.start, a, q.r[0]), fo = mm(uv.frame, a, q.r[1]) * (uv.cycles || 1);
    const v = (sf + fo) % 1;
    return Math.max(0, Math.min(N - 1, Math.floor(v * N)));
  }

  // ------------------------------------------------------------ a playing effect (one prefab instance)
  class Instance {
    constructor(name, x, y, opts) {
      const e = SAP_FX_DATA[name];
      this.name = name; this.stopped = false; this.moved = 0; this.vel = null;
      this.flip = !!opts.flip;
      this.setPos(x, y);
      // build each system's transform relative to the prefab root from the depth-first order
      const stack = [];
      this.systems = e.systems.map((s, i) => {
        const L = trs(s.pos, s.rot, s.scale);
        stack.length = s.depth; const parent = stack[s.depth - 1];
        const M = parent ? mul(parent, L) : L; stack[s.depth] = M;
        return new System(s, M, this, i);
      });
    }
    setPos(x, y) {
      const p = [x / U, -y / U, 0];
      if (this.root) { const o = this.root.t, dx = p[0] - o[0], dy = p[1] - o[1]; this.moved += Math.hypot(dx, dy); this._dp = [dx, dy]; }
      // the hit effect is turned 180° about y for a player-side target (BoardView.DamageMinion)
      this.root = { m: this.flip ? [-1, 0, 0, 0, 1, 0, 0, 0, -1] : [1, 0, 0, 0, 1, 0, 0, 0, 1], t: p };
    }
    moveTo(x, y) { this.setPos(x, y); }
    stop() { this.stopped = true; }
    step(dt) {
      this.vel = this._dp && dt > 0 ? [this._dp[0] / dt, this._dp[1] / dt, 0] : null;
      for (const s of this.systems) s.step(dt);
      this.moved = 0; this._dp = null;
      if (this.follow) { const q = this.follow(); if (q) this.setPos(q[0], q[1]); else this.stop(); }
      if (this.life != null && (this.age = (this.age || 0) + dt) >= this.life) this.stopped = true;
    }
    get alive() { return this.systems.some(s => s.alive); }
  }

  // ------------------------------------------------------------ the layer
  function create(getSpeed) {
    let canvas = null, ctx = null, insts = [], raf = 0, last = 0;
    function attach(parent, before) {
      canvas = document.createElement('canvas'); canvas.className = 'b-pfx';
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = 1280 * dpr; canvas.height = VIEW_H * dpr;
      ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      parent.insertBefore(canvas, before || null);
      insts = [];
    }
    function frame(now) {
      raf = 0;
      if (!canvas || !canvas.isConnected) { insts = []; return; }
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)) * (getSpeed ? getSpeed() : 1); last = now;
      for (const i of insts) i.step(dt);
      insts = insts.filter(i => i.alive);
      ctx.clearRect(0, 0, 1280, VIEW_H);
      // draw order: sorting order, then sorting fudge (lower is nearer), then depth (z nearer the camera last), then hierarchy
      const all = [];
      insts.forEach((inst, ii) => inst.systems.forEach(s => { const W = s.W; all.push([s, W, ii]); }));
      all.sort((A, B) => {
        const a = A[0].d.render || {}, b = B[0].d.render || {};
        return (a.sort || 0) - (b.sort || 0) || (b.order || 0) - (a.order || 0) || B[1].t[2] - A[1].t[2] || A[2] - B[2] || A[0].index - B[0].index;
      });
      for (const [s, W] of all) s.draw(ctx, W);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      if (insts.length) raf = requestAnimationFrame(frame);
    }
    function spawn(name, x, y, opts = {}) {
      if (!canvas || !window.SAP_FX_DATA || !SAP_FX_DATA[name]) return null;
      const inst = new Instance(name, x, y, opts);
      if (opts.follow) inst.follow = opts.follow;
      if (opts.life != null) inst.life = opts.life;
      insts.push(inst);
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
      return inst;
    }
    function clear() { insts = []; if (ctx) ctx.clearRect(0, 0, 1280, VIEW_H); }
    // preload every texture so the first effect of a battle doesn't pop in late
    function preload() { for (const e of Object.values(window.SAP_FX_DATA || {})) for (const s of e.systems) { if (s.tex) img(s.tex); for (const sp of ((s.uv || {}).sprites || [])) img(sp.img); } }
    return { attach, spawn, clear, preload, get count() { return insts.length; } };
  }

  window.SAPFx = { create };
})();
