// Replays battles recorded from the game (Frida oracle: spec + runBattle output with boardBefore) through js/game/sim.js and
// reports the first point where the two EventLogs differ.
// Usage: node tools/oracle/compare.mjs <specs.json> <oracle-out.json> [index|all] [--depth] [--show N]
import fs from "node:fs";
import { createRequire } from "node:module";
import { makeIdMapper, lines } from "./normalize.mjs";

const require = createRequire(import.meta.url);
const sim = require("../../js/game/sim.js");
const model = require("../../js/game/model.js");
const data = require("../../js/game/data.js");
let abilities = null;
try { abilities = require("../../js/game/abilities.js"); } catch (e) { if (!/Cannot find module/.test(e.message)) throw e; }

const args = process.argv.slice(2);
const pos = args.filter((a, j) => !a.startsWith("--") && args[j - 1] !== "--show");
const [specPath, outPath, which = "all"] = pos;
const depth = args.includes("--depth");
const showIdx = args.indexOf("--show"); const show = showIdx >= 0 ? +args[showIdx + 1] : 6;
const specs = JSON.parse(fs.readFileSync(specPath, "utf8"));
const outs = JSON.parse(fs.readFileSync(outPath, "utf8"));

export function petsFromBoard(boardBefore, idOf) {
  return boardBefore.map((p) => {
    const t = data.minions[p.Enum];
    const id = idOf(p.Id); const b = id[0], u = +id.slice(1);
    return { Id: model.itemId(b, u), Owner: p.Owner, Enum: p.Enum, x: p.Point.x, Level: p.Level, Attack: p.Attack, Health: p.Health, Perk: p.Perk,
      Tribe: t ? t.tribe : null, Abilities: t ? t.abilities.map((a) => Object.assign(new model.MinionAbilityModel(a.e, p.Level, a.native), { Group: a.group })) : [] };
  });
}

function runOne(i) {
  const spec = specs[i], out = outs[i];
  if (!out || !out.boardBefore) return { i, status: "no-board" };
  const idOf = makeIdMapper(out.boardBefore);
  const pets = petsFromBoard(out.boardBefore, idOf);
  const unique = Math.max(0, ...pets.filter((p) => p.Id.BoardId === "M").map((p) => p.Id.Unique));
  let res, err = null;
  try {
    const b = new sim.Battle({ pets, seed: spec.seed, playerSeed: spec.playerSeed, opponentSeed: spec.opponentSeed, unique, hooks: abilities ? abilities.hooks : {} });
    res = b.run();
  } catch (e) { err = e; }
  const want = lines(out.events, idOf, { depth });
  const got = res ? lines(res.log, idOf, { depth }) : [];
  let k = 0; while (k < want.length && k < got.length && want[k] === got[k]) k++;
  const same = !err && k === want.length && k === got.length && res.outcome === out.outcome;
  return { i, same, k, want, got, err, outcome: res && res.outcome, wantOutcome: out.outcome, spec };
}

const idxs = which === "all" ? specs.map((_, i) => i) : [+which];
let ok = 0; const fails = [];
for (const i of idxs) { const r = runOne(i); if (r.same) ok++; else fails.push(r); }
console.log(`${ok}/${idxs.length} battles identical`);
for (const r of fails.slice(0, show)) {
  const names = (side) => (r.spec[side] || []).map((p) => p.name || p.enum).join(",");
  console.log(`\n#${r.i} [${names("player")} vs ${names("opponent")}] outcome game=${r.wantOutcome} js=${r.outcome} first diff at line ${r.k}${r.err ? " ERROR " + r.err.stack.split("\n").slice(0, 3).join(" | ") : ""}`);
  for (let j = Math.max(0, r.k - 3); j < r.k + 4; j++) {
    const a = r.want[j], b = r.got[j];
    if (a === undefined && b === undefined) break;
    console.log(`${j === r.k ? ">>" : "  "} ${String(j).padStart(4)} game: ${a ?? "(end)"}`);
    if (a !== b) console.log(`        js:   ${b ?? "(end)"}`);
  }
}
