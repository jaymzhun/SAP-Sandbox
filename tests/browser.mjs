// End-to-end checks of the site in a real browser (headless Microsoft Edge or Chrome, driven over the DevTools protocol;
// no npm packages needed). It serves the repo itself, runs the scenarios below, saves screenshots to tests/out/ and fails
// on any failed check, page error, console error or failed request.
// Usage: node tests/browser.mjs [--only name,name] [--browser path-to-msedge-or-chrome]
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createReadStream, statSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const OUT = join(ROOT, 'tests', 'out');
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const BROWSERS = [args.includes('--browser') && args[args.indexOf('--browser') + 1], process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ------------------------------------------------------------ static server for the repo
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.json': 'application/json', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = normalize(join(ROOT, p));
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try { const st = statSync(f); res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' }); createReadStream(f).pipe(res); }
  catch (e) { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/index.html`;

// ------------------------------------------------------------ browser over CDP
const exe = BROWSERS.find(p => existsSync(p));
if (!exe) { console.error('No Edge / Chrome found; pass --browser <path>'); process.exit(2); }
const prof = join(os.tmpdir(), 'sap-browser-test-' + process.pid);
const dport = 9400 + (process.pid % 500);
const browser = spawn(exe, ['--headless=new', `--remote-debugging-port=${dport}`, `--user-data-dir=${prof}`, '--window-size=1280,720',
  '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
let ws, msgId = 0; const pend = new Map(); const problems = [];
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++msgId; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text).slice(0, 300));
  return r.result.value;
};
async function until(expr, ms = 10000, step = 50) { const t = Date.now(); while (Date.now() - t < ms) { if (await js(expr).catch(() => false)) return true; await sleep(step); } return false; }
async function shot(name) { const s = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, name + '.png'), Buffer.from(s.data, 'base64')); }
async function viewport(w, h) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }); }
async function open(url = BASE, fresh = true) {
  if (fresh) { await send('Page.navigate', { url: BASE }); await until('document.readyState === "complete"'); await js('localStorage.clear()'); }
  await send('Page.navigate', { url });
  if (!await until('!!window.SAP_SANDBOX && document.readyState === "complete"', 30000)) throw new Error('the page did not start');
  await js(`window.__errs = []; addEventListener('error', e => __errs.push(String(e.message))); addEventListener('unhandledrejection', e => __errs.push('rejection: ' + (e.reason && e.reason.stack || e.reason)));`);
}
// real mouse input at an element's centre (or a point)
async function centre(sel) { return js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`); }
async function mouse(x, y, click) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  if (click) { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }); }
}
async function click(sel) { const c = await centre(sel); if (!c) throw new Error('nothing to click: ' + sel); await mouse(c[0], c[1], true); }
async function key(k) { const code = { Escape: 27, Enter: 13 }[k]; await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: k, windowsVirtualKeyCode: code }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: k, windowsVirtualKeyCode: code }); }
const logLen = () => js(`document.querySelectorAll('.b-log li').length`);
async function startBattle(speed = 1) { await js(`(() => { const X = SAP_SANDBOX; X.S.settings.speed = ${speed}; X.S.settings.fixedSeed = false; X.startBattle(); })()`); }
async function rollTeams() {
  await js(`(() => { const rb = [...document.querySelectorAll('button')].find(b => /random/i.test(b.title || '')); rb && rb.click(); })()`);
  await until(`[...document.querySelectorAll('button')].some(b => /roll both/i.test(b.textContent))`, 3000);
  await js(`[...document.querySelectorAll('button')].find(b => /roll both/i.test(b.textContent)).click()`);
  await sleep(100); await key('Escape'); await sleep(100);
}

// ------------------------------------------------------------ checks
const results = [];
function check(ok, what) { if (!ok) throw new Error(what); }
const T = {};

T.load = async () => {
  await open();
  check(await until(`document.fonts.check('20px Lapsus') && [...document.fonts].some(f => f.family === 'Lapsus' && f.status === 'loaded')`, 8000), 'the Lapsus font did not load');
  const font = await js(`performance.getEntriesByType('resource').map(r => r.name).filter(n => /\\.ttf$/.test(n))`);
  check(font.some(n => n.endsWith('/fonts/LapsusPro-Bold.ttf')), 'the game font file was not requested: ' + font.join(', '));
  check(await until(`[...document.images].filter(i => i.loading !== 'lazy').every(i => i.complete)`, 10000), 'images still loading');
  const broken = await js(`[...document.images].filter(i => i.complete && i.loading !== 'lazy' && i.getAttribute('src') && !i.naturalWidth).map(i => i.getAttribute('src'))`);
  check(!broken.length, 'broken images: ' + broken.join(', '));
  check(await js(`document.querySelectorAll('#arena .slot').length`) === 10, 'expected 10 team slots');
  await shot('editor');
};

T.picker = async () => {
  await open();
  await js(`SAP_SANDBOX.S.teams[0][4] = null; document.querySelector('#btn-swap').click(); document.querySelector('#btn-swap').click();`);
  const before = await js(`SAP_SANDBOX.S.teams[0].filter(Boolean).length`);
  await click(`#arena .slot[data-side="0"][data-i="4"]`);
  check(await until(`!document.querySelector('#modal').hidden && document.querySelectorAll('.pcard').length > 10`, 3000), 'the pet picker did not open');
  await js(`(() => { const s = document.querySelector('#modal .search'); s.value = 'ant'; s.dispatchEvent(new Event('input')); })()`);
  check(await until(`[...document.querySelectorAll('.pcard .pname')].some(n => n.textContent === 'Ant')`, 2000), 'search did not find Ant');
  await shot('picker');
  await js(`[...document.querySelectorAll('.pcard')].find(c => c.querySelector('.pname').textContent === 'Ant').click()`);
  await sleep(200); if (!(await js(`document.querySelector('#modal').hidden`))) await key('Escape');
  check(await until(`document.querySelector('#modal').hidden`, 2000), 'Esc did not close the dialog');
  const after = await js(`SAP_SANDBOX.S.teams[0].filter(Boolean).length`);
  check(after === before + 1, `picking a pet should add it (had ${before}, now ${after})`);
};

T.battles = async () => {
  await open();
  const runs = [];
  let unported = 0;
  for (let r = 0; r < 12; r++) {
    await rollTeams(); await startBattle(4);
    // a few random teams use a part of the game the engine hasn't ported; the site says so in a toast: roll again
    if (await js(`!document.body.classList.contains('battle') && /Unported/.test(document.querySelector('#toast').textContent)`)) {
      if (++unported > 10) throw new Error('too many unported rolls'); r--; continue;
    }
    check(await until(`!!document.querySelector('.bscene.done') && !document.querySelector('.b-result').hidden`, 90000, 100), `battle ${r + 1} did not reach the result screen`);
    const v = await js(`({ steps: SAP_SANDBOX.lastLog.length, lines: document.querySelectorAll('.b-log li').length, last: (document.querySelector('.b-log li:last-child') || {}).textContent || '', res: document.querySelector('.b-res-text').textContent })`);
    check(/wins|Draw/.test(v.last), `battle ${r + 1}: the log does not end with the result (${v.last})`);
    check(['Victory', 'Defeat', 'Draw'].includes(v.res), `battle ${r + 1}: result screen says ${v.res}`);
    runs.push(v.steps);
    if (r === 0) await shot('result');
    await click('.b-res-btns [data-r="back"]'); check(await until(`document.body.classList.contains('edit') && !document.querySelector('.bscene')`, 3000), 'Back did not return to the editor');
  }
  return `${runs.length} battles, ${Math.min(...runs)}–${Math.max(...runs)} steps` + (unported ? `; ${unported} unported roll(s) skipped` : '');
};

T.controls = async () => {
  await open(); await rollTeams(); await startBattle(1);
  check(await until(`!!document.querySelector('.bscene.intro')`, 3000), 'no intro');
  await sleep(800); await shot('intro');
  check(await until(`!!document.querySelector('.bscene.live')`, 15000), 'the battle did not go live after the intro');
  await until(`document.querySelectorAll('.b-log li').length >= 3`, 15000);
  await shot('battle');
  // pause holds the log; play resumes it
  await click('.b-btn[data-b="pause"]');
  check(await js(`document.querySelector('.b-btn[data-b="pause"] span').textContent`) === 'Play', 'Pause button did not switch to Play');
  await sleep(400); const n0 = await logLen(); await sleep(1500);
  check(await logLen() === n0, 'the battle kept going while paused');
  await click('.b-btn[data-b="pause"]');
  check(await until(`document.querySelectorAll('.b-log li').length > ${n0} || !!document.querySelector('.bscene.done')`, 5000), 'the battle did not resume');
  // fast cycles ×2 → ×4 → off
  const fast = [];
  for (let i = 0; i < 3; i++) { await click('.b-btn[data-b="fast"]'); fast.push(await js(`document.querySelector('.b-btn[data-b="fast"] span').textContent`)); }
  check(fast.join('|') === 'Fast ×2|Fast ×4|Fast', 'Fast button cycle: ' + fast.join(' → '));
  // log panel
  await click('.b-logbtn'); check(await js(`!document.querySelector('.b-log').hidden`), 'log did not open'); await click('.b-logbtn');
  // skip → result; replay → plays again; Esc → editor
  await click('.b-btn[data-b="skip"]');
  check(await until(`!!document.querySelector('.bscene.done') && !document.querySelector('.b-result').hidden`, 3000), 'Skip did not show the result');
  await click('.b-res-btns [data-r="replay"]');
  check(await until(`!!document.querySelector('.bscene') && !document.querySelector('.bscene.done')`, 3000), 'Replay did not restart');
  await sleep(500); await key('Escape');
  check(await until(`document.body.classList.contains('edit') && !document.querySelector('.bscene')`, 3000), 'Esc did not leave the battle');
};

T.hover = async () => {
  await open(); await rollTeams(); await startBattle(1);
  check(await until(`!!document.querySelector('.bscene.live') && document.querySelectorAll('.b-log li').length >= 2`, 20000), 'battle not live');
  // hover the back pet of the left team (least likely to faint at once)
  const sel = `.bscene .bpet.side-0:not(.gone)`;
  const pts = await js(`[...document.querySelectorAll(${JSON.stringify(sel)})].map(e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.left]; }).sort((a, b) => a[2] - b[2])`);
  check(pts.length, 'no pet to hover');
  await mouse(pts[0][0], pts[0][1]);
  check(await until(`!!document.querySelector('.bscene.held') && !document.querySelector('#tooltip').hidden`, 2000), 'hovering a pet did not hold the fight / show its card');
  await sleep(400); const n0 = await logLen(); await sleep(1500);
  const held = await js(`!!document.querySelector('.bscene.held')`);
  check(!held || await logLen() === n0, 'the battle kept going while a pet was hovered');
  await shot('hover');
  await mouse(5, 5);
  check(await until(`!document.querySelector('.bscene.held')`, 2000), 'moving away did not release the hold');
  check(await until(`document.querySelectorAll('.b-log li').length > ${n0} || !!document.querySelector('.bscene.done')`, 5000), 'the battle did not continue after the hover');
};

T.replayLink = async () => {
  await open(); await rollTeams(); await startBattle(4);
  check(await until(`!!document.querySelector('.bscene.done')`, 90000, 100), 'battle did not finish');
  const link = await js(`SAP_SANDBOX.replayLink()`), log = await js(`JSON.stringify(SAP_SANDBOX.lastLog)`);
  check(/#r=/.test(link), 'no replay link');
  check(await js(`document.querySelector('.b-res-link input').value`) === link, 'the result screen shows a different link');
  // a query string makes it a real page load (a hash-only change would not re-run the page)
  await open(link.replace(/^.*\/index\.html/, BASE + '?replay'), true);
  check(await until(`document.body.classList.contains('battle') && !!SAP_SANDBOX.lastLog`, 10000), 'the replay link did not start the battle');
  check(await js(`JSON.stringify(SAP_SANDBOX.lastLog)`) === log, 'the replay link gave a different battle');
  check(!(await js(`location.hash`)), 'the hash was not cleared after loading the replay');
};

T.particles = async () => {
  await open(); await rollTeams(); await startBattle(1);
  check(await until(`!!document.querySelector('.bscene .b-pfx')`, 5000), 'no particle canvas');
  // the rocket trail during the intro, then hit sticker pieces after the first attack
  const painted = `(() => { const c = document.querySelector('.bscene .b-pfx'); if (!c) return 0; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 64) if (d[i] > 20) n++; return n; })()`;
  check(await until(`${painted} > 50`, 8000, 40), 'no particles drawn during the intro');
  check(await until(`[...document.querySelectorAll('.b-log li')].some(l => / attack$/.test(l.textContent))`, 30000), 'no attack');
  check(await until(`${painted} > 20`, 2000, 30), 'no particles drawn on the first hit');
  await shot('hit');
  const tex = await js(`(async () => { const names = new Set(['StickerFist.webp', 'StickerHeart.webp', 'MouthOpen.webp']); for (const e of Object.values(SAP_FX_DATA)) for (const s of e.systems) { if (s.tex) names.add(s.tex); for (const sp of (s.uv && s.uv.sprites) || []) names.add(sp.img); }
    const bad = []; for (const n of names) { const r = await fetch('img/fx/game/' + n); if (!r.ok) bad.push(n); } return { n: names.size, bad }; })()`);
  check(!tex.bad.length, 'missing FX textures: ' + tex.bad.join(', '));
  return `${tex.n} FX textures present`;
};

T.smallScreen = async () => {
  await viewport(960, 540);
  try {
    await open(); await rollTeams(); await shot('small-editor');
    await startBattle(2);
    check(await until(`!!document.querySelector('.bscene.live')`, 15000), 'battle not live on a small screen');
    const k = await js(`document.getElementById('stage').getBoundingClientRect().width`);
    check(Math.abs(k - 960) < 2, `stage should scale to 960 px wide, is ${k}`);
    await sleep(1500); await shot('small-battle');
    check(await until(`!!document.querySelector('.bscene.done')`, 90000, 100), 'battle did not finish on a small screen');
  } finally { await viewport(1280, 720); }
};

// ------------------------------------------------------------ run
mkdirSync(OUT, { recursive: true });
let failed = 0;
try {
  let wsUrl = null;
  for (let i = 0; i < 75 && !wsUrl; i++) { try { const l = await (await fetch(`http://127.0.0.1:${dport}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) wsUrl = p.webSocketDebuggerUrl; } catch (e) { } if (!wsUrl) await sleep(200); }
  if (!wsUrl) throw new Error('could not connect to the browser');
  ws = new WebSocket(wsUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let current = '';
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { const p = pend.get(d.id); pend.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); return; }
    if (d.method === 'Runtime.exceptionThrown') problems.push(`[${current}] page error: ${(d.params.exceptionDetails.exception || {}).description || d.params.exceptionDetails.text}`);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error' && !/Unported:/.test(d.params.args.map(a => a.value ?? a.description).join(' '))) problems.push(`[${current}] console error: ${d.params.args.map(a => a.value ?? a.description).join(' ')}`);
    if (d.method === 'Network.responseReceived' && d.params.response.status >= 400) problems.push(`[${current}] HTTP ${d.params.response.status} ${d.params.response.url}`);
    if (d.method === 'Network.loadingFailed' && !d.params.canceled && d.params.errorText !== 'net::ERR_ABORTED') problems.push(`[${current}] request failed: ${d.params.errorText}`);
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await viewport(1280, 720);
  for (const [name, fn] of Object.entries(T)) {
    if (only && !only.includes(name)) continue;
    current = name; const t0 = Date.now(); const before = problems.length;
    try {
      const note = await fn();
      const errs = await js('window.__errs || []').catch(() => []);
      for (const e of errs) problems.push(`[${name}] ${e}`);
      if (problems.length > before) throw new Error(problems.slice(before).join('\n    '));
      results.push(`ok    ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)${note ? ' — ' + note : ''}`);
    } catch (e) {
      failed++; results.push(`FAIL  ${name}: ${e.message}`);
      await shot('FAIL-' + name).catch(() => { });
    }
    console.log(results[results.length - 1]);
  }
} catch (e) { failed++; console.log('FAIL  ' + e.message); }
finally { try { ws && ws.close(); } catch (e) { } browser.kill(); server.close(); await sleep(400); try { rmSync(prof, { recursive: true, force: true }); } catch (e) { } }
console.log(`browser: ${results.filter(r => r.startsWith('ok')).length}/${results.length} scenarios passed; screenshots in tests/out/`);
process.exit(failed ? 1 : 0);
