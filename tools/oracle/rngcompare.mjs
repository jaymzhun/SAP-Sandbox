// Compares every random draw of js/game/sim.js with the game's own draws (Frida `rngtrace`: BoardRandom calls in order, per stream).
// The EventLog alone cannot show a missing or extra draw while every later roll has range 0; this check can.
// Usage: node tools/oracle/rngcompare.mjs <specs.json> <rng-trace.json> <offset> [index|all] [--show N]
import fs from "node:fs";
import { createRequire } from "node:module";
import { makeIdMapper } from "./normalize.mjs";

const require = createRequire(import.meta.url);
const R = require("../../js/game/rng.js");
const sim = require("../../js/game/sim.js");
const model = require("../../js/game/model.js");
const data = require("../../js/game/data.js");
const abilities = require("../../js/game/abilities.js");

const args = process.argv.slice(2);
const pos = args.filter((a, j) => !a.startsWith("--") && args[j - 1] !== "--show");
const [specPath, tracePath, offsetArg, which = "all", outPath] = pos;
const showIdx = args.indexOf("--show"); const show = showIdx >= 0 ? +args[showIdx + 1] : 3;
const specs = JSON.parse(fs.readFileSync(specPath, "utf8"));
const traces = JSON.parse(fs.readFileSync(tracePath, "utf8"));
const offset = +offsetArg;
const outs = outPath ? JSON.parse(fs.readFileSync(outPath, "utf8")) : null;

// JS draws, recorded in the game's vocabulary: [method, owner, a, b, result]
const P = R.DotNetRandom.prototype;
let log = null, depth = 0, curBattle = null;
const wrap = (name, f, fmt) => function (...a) { if (!log || depth || this.__owner === undefined) return f.apply(this, a); depth++; try { const v = f.apply(this, a); const r = fmt(this.__owner, a, v); r.at = curBattle ? curBattle.state.EventLog.length : null; log.push(r); return v; } finally { depth--; } };
P.next = wrap("next", P.next, (o, a, v) => [a[0] === undefined ? "Next0" : a[1] === undefined ? "Next1" : "Next2", o, a[0] ?? null, a[1] ?? null, v]);
P.nextUlong = wrap("nextUlong", P.nextUlong, (o, a, v) => ["NextUlong0", o, null, null, null]);
P.nextDouble = wrap("nextDouble", P.nextDouble, (o, a, v) => ["NextDouble0", o, null, null, null]);

function petsFromBoard(boardBefore, idOf) {
  return boardBefore.map((p) => {
    const t = data.minions[p.Enum];
    const id = idOf(p.Id); const b = id[0], u = +id.slice(1);
    return { Id: model.itemId(b, u), Owner: p.Owner, Enum: p.Enum, x: p.Point.x, Level: p.Level, Exp: p.Exp ?? 0, Mana: p.Mana ?? 0, Relic: !!p.Relic,
      Attack: p.Attack - (p.AttackTemp || 0), AttackTemp: p.AttackTemp || 0, Health: p.Health - (p.HealthTemp || 0), HealthTemp: p.HealthTemp || 0, Perk: p.Perk,
      PerkDurability: p.PerkDurability ?? null, PerkMultiplier: p.PerkMultiplier ?? null,
      Tribe: t ? t.tribe : null,
      // the pet's actual abilities when recorded (shop-gained ones included), else its template's
      Abilities: p.Abilities ? p.Abilities.map((a) => Object.assign(new model.MinionAbilityModel(a.Enum, a.Level, a.Native), { Duration: a.Duration, TriggerCount: a.TriggerCount, ActivatedCount: a.ActivatedCount, Charges: a.Charges, Disabled: a.Disabled, DisabledTemp: a.DisabledTemp, AlwaysIgnoreMinionLevel: a.AlwaysIgnoreMinionLevel, IgnoreRepeats: a.IgnoreRepeats, Group: a.Group }))
        : t ? t.abilities.map((a) => Object.assign(new model.MinionAbilityModel(a.e, p.Level, a.native), { Group: a.group })) : [] };
  });
}

const HASH_RVA = 0x24dd0b0; // Spacewood.Core.Actions.Battle.BoardResolver$$CalculateBattleSystemsHash (build 26131463)
const fmt = (d) => d ? `${d[0]} o${d[1]}${d[2] !== null ? ` (${d[2]}${d[3] !== null ? "," + d[3] : ""})` : ""}${d[4] !== null && d[4] !== undefined ? " = " + d[4] : ""}` : "(end)";
const idxs = which === "all" ? traces.map((_, i) => i + offset) : [+which];
let ok = 0; const fails = [];
for (const i of idxs) {
  const tr = traces[i - offset], spec = specs[i], out = outs ? outs[i] : null;
  if (!tr || !out || !out.boardBefore) continue;
  const idOf = makeIdMapper(out.boardBefore);
  log = [];
  let err = null;
  try {
    const b = new sim.Battle({ pets: petsFromBoard(out.boardBefore, idOf), trumpets: out.infoBefore, seed: spec.seed, playerSeed: spec.playerSeed, opponentSeed: spec.opponentSeed,
      unique: out.infoBefore.UniqueNumberCounter, hooks: abilities.hooks, boardFields: out.infoBefore.Fields });
    for (const k of [0, 1, 2]) b.rand[k].__owner = k; curBattle = b;
    b.run();
  } catch (e) { err = e; }
  const got = log; log = null;
  // the game's ulong/double results are not comparable (reported as truncated ints); compare method, owner, args and int results
  // BoardResolver.Finalise -> CalculateBattleSystemsHash draws after the battle; stop there
  const inHash = (c) => (c[5] || []).some((a) => { const v = parseInt(a, 16); return v >= HASH_RVA && v < HASH_RVA + 0x800; });
  const cut = tr.rng.findIndex(inHash);
  const want = (cut >= 0 ? tr.rng.slice(0, cut) : tr.rng).map((c) => [c[0] === "NextBytes1" ? "NextBytes1" : c[0], c[1], c[2], c[3], c[0].startsWith("Next") && !/Ulong|Double|Bytes/.test(c[0]) ? c[4] : null, c[5]]);
  let k = 0; while (k < want.length && k < got.length && want[k].slice(0, 5).join("|") === got[k].slice(0, 5).join("|")) k++;
  const same = k === want.length && k === got.length;
  if (same) ok++; else fails.push({ i, k, want, got, err });
}
console.log(`${ok}/${idxs.length} battles draw the same random numbers`);
for (const f of fails.slice(0, show)) {
  console.log(`\n#${f.i} first difference at draw ${f.k} of ${f.want.length} (js ${f.got.length})${f.err ? " [js error: " + (f.err.unported ? "Unported " + f.err.unported : f.err.message) + "]" : ""}`);
  for (let j = Math.max(0, f.k - 2); j < f.k + 3; j++) {
    if (!f.want[j] && !f.got[j]) break;
    console.log(`${j === f.k ? ">>" : "  "} ${String(j).padStart(4)} game: ${fmt(f.want[j])}${f.want[j] && f.want[j][5] ? "  @" + f.want[j][5].join(",") : ""}`);
    console.log(`        js:   ${fmt(f.got[j])}${f.got[j] && f.got[j].at != null ? "  [js log line " + f.got[j].at + "]" : ""}`);
  }
}
if (args.includes("--list")) console.log("\nfailing:", fails.map((f) => "#" + f.i + (f.err ? "*" : "")).join(" "));
