// Random site teams through the game-exact engine (js/game/adapter.js):
//  - determinism: the same teams, settings and seed give the same log (twice, step by step);
//  - every step has a snapshot battle.js can draw, and the battle ends with a result;
//  - a battle may only fail with "Unported: <piece>" (a part of the game not ported yet), never another error.
// Usage: node tests/fuzz.mjs [battles=400] [seed=1]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
global.window = {}; require("../data/data.js"); const SD = window.SAP_DATA;
const A = require("../js/game/adapter.js");
const E = require("../js/engine.js");

const N = +(process.argv[2] || 400); let s = +(process.argv[3] || 1) >>> 0;
const rnd = (n) => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0; s = (s ^ (s >>> 13)) >>> 0; return s % n; };
const pets = Object.keys(SD.pets).filter((k) => SD.pets[k].r); // the pets the site's picker offers by default
const perks = [...E.PERK_SUPPORTED];
const team = () => Array.from({ length: 1 + rnd(5) }, (_, slot) => {
  const id = pets[rnd(pets.length)], d = SD.pets[id];
  return { id, atk: Math.max(1, d.a + rnd(8)), hp: Math.max(1, d.h + rnd(8)), xp: [0, 2, 5][rnd(3)], perk: rnd(3) ? null : perks[rnd(perks.length)], mana: rnd(4) ? 0 : rnd(10), slot };
});
const KINDS = new Set(["start", "ability", "attack", "jump", "damage", "remove", "move", "block", "buff", "perk", "perkfx", "faint", "summon", "summonfail", "swallow", "transform", "xp", "mana", "trumpet", "note", "end"]);

let ok = 0; const unported = new Map(); const errors = [];
for (let i = 0; i < N; i++) {
  const teams = [team(), team()]; const settings = { turn: 1 + rnd(12), rolls: rnd(4), goldSpent: rnd(12), battles: rnd(8) }; const seed = 1 + rnd(1e9);
  try {
    const a = A.run(teams, settings, seed), b = A.run(teams, settings, seed);
    if (JSON.stringify(a.log) !== JSON.stringify(b.log)) throw new Error("not deterministic");
    if (a.log[a.log.length - 1].kind !== "end" || !["win", "lose", "draw"].includes(a.result)) throw new Error("no end step");
    for (const st of a.log) {
      if (!KINDS.has(st.kind)) throw new Error("unknown step kind " + st.kind);
      if (!st.snap || st.snap.t.length !== 2 || st.snap.t.some((t) => t.length > 5 || t.some((p) => !SD.pets[p.id]))) throw new Error("bad snapshot at " + st.kind);
    }
    ok++;
  } catch (e) {
    const m = /^Unported: (.*)/.exec(e.message);
    if (m) unported.set(m[1], (unported.get(m[1]) || 0) + 1); else errors.push(`#${i} ${process.env.STACK ? e.stack : e.message}`);
  }
}
console.log(`fuzz: ${ok}/${N} battles ran, deterministic, with drawable snapshots`);
if (unported.size) console.log("stopped on unported pieces:", [...unported].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(", "));
if (errors.length) { console.log("ERRORS:\n" + errors.slice(0, 20).join("\n")); process.exit(1); }
