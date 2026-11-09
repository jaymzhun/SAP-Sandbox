// Site-pool specs (as make-site-specs.mjs) kept only when the site's game-exact engine stops on an unported piece,
// at most <cap> per piece, so the game can record exactly the battles that use what is not ported yet.
// Usage: node make-tail-specs.mjs <tries> <seed> <cap> <out.json>
import fs from "node:fs"; import { createRequire } from "node:module";
const require = createRequire("C:/Users/Hunter/Desktop/SAP-Sandbox/x.js");
global.window = {}; require("./data/data.js"); const SD = window.SAP_DATA;
const A = require("./js/game/adapter.js"); const E = require("./js/engine.js");
const [triesArg, seedArg, capArg, outPath] = process.argv.slice(2);
let s = Number(seedArg) >>> 0;
const rnd = (n) => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0; s = (s ^ (s >>> 13)) >>> 0; return s % n; };
const pets = Object.keys(SD.pets).filter((k) => SD.pets[k].r && A.MINION[k] != null);
const perks = [...E.PERK_SUPPORTED].filter((p) => A.PERK[p] != null);
const team = () => Array.from({ length: 1 + rnd(5) }, () => {
  const id = pets[rnd(pets.length)], d = SD.pets[id];
  const t = { enum: A.MINION[id], name: id, level: 1 + rnd(3), attack: Math.max(1, d.a + rnd(8)), health: Math.max(1, d.h + rnd(8)) };
  if (!rnd(3)) t.perk = A.PERK[perks[rnd(perks.length)]];
  if (!rnd(4)) t.mana = rnd(10);
  return t;
});
const toSite = (t) => t.map((p, slot) => ({ id: A.MINION_NAME[p.enum], atk: p.attack, hp: p.health, xp: [0, 2, 5][p.level - 1], perk: p.perk != null ? A.PERK_NAME[p.perk] : null, mana: p.mana || 0, slot }));
const cap = +capArg; const per = new Map(); const specs = [];
for (let i = 0; i < +triesArg; i++) {
  const sp = { id: specs.length, seed: 1 + rnd(2 ** 30), playerSeed: 1 + rnd(2 ** 30), opponentSeed: 1 + rnd(2 ** 30), turn: 1 + rnd(12), depth: 2, player: team(), opponent: team() };
  try { A.run([toSite(sp.player), toSite(sp.opponent.slice().reverse())], { turn: sp.turn }, 0, { seeds: { seed: sp.seed, playerSeed: sp.playerSeed, opponentSeed: sp.opponentSeed }, packBack: true }); }
  catch (e) { const m = /^Unported: (.*)/.exec(e.message); if (!m) continue; const k = m[1].replace(/ \d+.*$/, ''); const n = per.get(k) || 0; if (n >= cap) continue; per.set(k, n + 1); sp.id = specs.length; sp.why = m[1]; specs.push(sp); }
}
fs.writeFileSync(outPath, JSON.stringify(specs, null, 1));
console.log(`specs ${specs.length}:`, [...per].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(", "));
