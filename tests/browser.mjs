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

// Test Battle sends both teams to the game bridge. fetch is stubbed: one run checks the request, one the help dialog
// shown when the bridge isn't running.
T.testBattle = async () => {
  await open(); await rollTeams();
  // leave team 1's front slot and team 2's second slot empty: the gaps must reach the game
  await js(`(() => { const S = SAP_SANDBOX.S; S.teams[0][0] = null; S.teams[1][1] = null; })()`);
  await js(`(() => { window.__sent = null; window.fetch = async (url, o) => { window.__sent = { url, body: JSON.parse(o.body) }; return new Response('{"ok":true}', { status: 200 }); }; })()`);
  await click('#btn-test');
  check(await until(`!!window.__sent`, 3000), 'Test Battle did not call the bridge');
  const v = await js(`({ sent: window.__sent, teams: SAP_SANDBOX.S.teams.map(t => t.filter(Boolean).length),
    seconds: SAP_SANDBOX.S.teams.map(t => SAP_SANDBOX.bridgeTeam(t)[1] && SAP_SANDBOX.bridgeTeam(t)[1].enum) })`);
  const pl = v.sent.body.player, op = v.sent.body.opponent;
  check(pl.length === 5 && op.length === 5, 'each team should be sent as 5 slots');
  // the game wants team 1 back to front (front slot last) and team 2 front first; empty slots stay in place as null
  check(pl[4] === null && op[1] === null, 'empty slots should be sent in place: ' + JSON.stringify([pl.map(Boolean), op.map(Boolean)]));
  check(pl[3].enum === v.seconds[0], 'team order sent to the game is wrong');
  check(v.sent.url === 'http://127.0.0.1:47823/battle', 'wrong bridge URL: ' + v.sent.url);
  check(pl.filter(Boolean).length === v.teams[0] && op.filter(Boolean).length === v.teams[1], 'the request does not carry both teams');
  const bd = v.sent.body.boards;
  check(bd && ['player', 'opponent'].every(s => Number.isInteger(bd[s].RollsThisTurn) && Number.isInteger(bd[s].GoldSpent)), 'each team needs its own counters: ' + JSON.stringify(bd));
  check(Number.isInteger(v.sent.body.turn), 'no turn number sent');
  const p = pl.find(Boolean);
  check(Number.isInteger(p.spells), 'pets need their foods eaten this turn: ' + JSON.stringify(p));
  check(Number.isInteger(p.enum) && p.level >= 1 && p.attack >= 1 && p.health >= 1, 'bad pet in the request: ' + JSON.stringify(p));
  check(await until(`/Playing in Super Auto Pets/.test(document.querySelector('#toast').textContent)`, 3000), 'no confirmation after sending');
  await js(`window.fetch = async () => { throw new TypeError('Failed to fetch'); }`);
  await sleep(300); await click('#btn-test');
  check(await until(`!document.querySelector('#modal').hidden && /game bridge/.test(document.querySelector('#modal').textContent)`, 3000), 'no help when the bridge is not running');
  await shot('bridge-help');
  await key('Escape');
  return `${v.teams[0]} vs ${v.teams[1]} pets sent`;
};

// Gold spent, rolls, turn... are one value for the whole battle: an old per-pet value moves into Settings, and the pet editor edits Settings
T.sharedGold = async () => {
  await open();
  await js(`localStorage.setItem('sap-sandbox', JSON.stringify({ teams: [[{ id: 'Meerkat', atk: 1, hp: 1, xp: 0, perk: null, ctx: { goldSpent: 3, rolls: 4, turn: 7, summoned: 2 } }, null, null, null, null],
    [{ id: 'Meerkat', atk: 1, hp: 1, xp: 0, perk: null }, null, null, null, null]], settings: { goldSpent: 0 } }))`);
  await open(BASE, false);
  const m = await js(`({ g: SAP_SANDBOX.S.settings.goldSpent, r: SAP_SANDBOX.S.settings.rolls, t: SAP_SANDBOX.S.settings.turn, s: SAP_SANDBOX.S.settings.summoned,
    left: SAP_SANDBOX.S.teams.flat().some(p => p && p.ctx && ['goldSpent', 'rolls', 'turn', 'summoned'].some(k => k in p.ctx)) })`);
  check(m.g === 3 && m.r === 4 && m.t === 7 && m.s === 2 && !m.left, 'an old per-pet gold spent should move into Settings: ' + JSON.stringify(m));
  await click('.pet[data-side="1"][data-i="0"]');
  check(await until(`!!document.querySelector('#modal:not([hidden]) .ctx-row input')`, 3000), 'no gold spent field in the pet editor');
  check(await js(`document.querySelector('.ctx-row input').value`) === '3', 'the pet editor should show the Settings value');
  await js(`(() => { const i = document.querySelector('.ctx-row input'); i.value = 12; i.dispatchEvent(new Event('change')); })()`);
  const v = await js(`({ g: SAP_SANDBOX.S.settings.goldSpent, b: SAP_SANDBOX.S.teams.map(t => SAP_SANDBOX.bridgeBoard(t).GoldSpent) })`);
  check(v.g === 12 && v.b[0] === 12 && v.b[1] === 12, 'changing gold spent on a pet should change it everywhere: ' + JSON.stringify(v));
  await shot('gold-shared'); await key('Escape');
  await click('#btn-help');
  check(await until(`!document.querySelector('#modal').hidden && /How to use/.test(document.querySelector('#panel h2').textContent) && /start-bridge\\.bat/.test(document.querySelector('#panel').textContent)`, 3000), 'How to use did not open the guide');
  await sleep(600); await shot('how-to-use'); await key('Escape');
  return 'gold spent shared; guide opens';
};

// the background is picked in Settings; the per-team look (mascot, names, trophies, lives) is gone
T.settingsBackground = async () => {
  await open();
  check(!(await js(`!!document.querySelector('#btn-bg, .sbtn[data-act="look"]')`)), 'the team look buttons should be gone');
  await click('#btn-settings');
  check(await until(`!document.querySelector('#modal').hidden && document.querySelectorAll('#panel .bgcell').length > 3`, 3000), 'Settings has no background picker');
  const pick = await js(`(() => { const c = [...document.querySelectorAll('#panel .bgcell')].find(x => !x.classList.contains('on')); c.click(); return c.textContent; })()`);
  const v = await js(`({ bg: SAP_SANDBOX.S.bg, css: document.querySelector('#bg').style.backgroundImage, saved: JSON.parse(localStorage.getItem('sap-sandbox')).bg })`);
  check(v.css.includes(v.bg) && v.saved === v.bg, 'picking a background should apply and save it: ' + JSON.stringify(v));
  await sleep(500); await shot('settings'); await key('Escape');
  return `picked ${pick}`;
};

T.smallScreen = async () => {
  await viewport(960, 540);
  try {
    await open(); await rollTeams(); await shot('small-editor');
    const k = await js(`document.getElementById('stage').getBoundingClientRect().width`);
    check(Math.abs(k - 960) < 2, `stage should scale to 960 px wide, is ${k}`);
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
