// The site adapter against the recorded game battles: site-format teams built from the recording specs must give the
// game's outcome. Relics are skipped (the site has none). Usage: node tests/adapter-oracle.mjs [frida dir]
import fs from "node:fs"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
global.window = {}; require("../data/data.js"); const SD = window.SAP_DATA;
const A = require("../js/game/adapter.js"), D = require("../js/game/data.js");
const F = process.argv[2] || process.env.USERPROFILE + "/rea-work/sap/frida/";
let ok = 0, n = 0; const bad = [];
for (const [set, outName] of [["corpus1", "corpus1c-out"], ["corpus2", "corpus2-out"]]) {
  if (!fs.existsSync(F + set + ".json")) continue;
  const specs = JSON.parse(fs.readFileSync(F + set + ".json", "utf8")), outs = JSON.parse(fs.readFileSync(F + outName + ".json", "utf8"));
  for (let i = 0; i < specs.length; i++) {
    const sp = specs[i], o = outs[i];
    if (sp.player.concat(sp.opponent).some((p) => D.minions[p.enum].type === 1 || !SD.pets[A.MINION_NAME[p.enum]])) continue;
    n++;
    const toSite = (t) => t.map((p, slot) => ({ id: A.MINION_NAME[p.enum], atk: p.attack, hp: p.health, xp: [0, 2, 5][p.level - 1], perk: p.perk != null ? A.PERK_NAME[p.perk] : null, slot }));
    try {
      // the harness lists the opponent back-to-front and packs the player at the back
      const r = A.run([toSite(sp.player), toSite(sp.opponent.slice().reverse())], { turn: sp.turn }, 0,
        { seeds: { seed: sp.seed, playerSeed: sp.playerSeed, opponentSeed: sp.opponentSeed }, fields: o.infoBefore.Fields, packBack: true });
      if (r.outcome === o.outcome) ok++; else bad.push(`${set}#${i}`);
    } catch (e) { bad.push(`${set}#${i} ${e.message}`); }
  }
}
console.log(`adapter: ${ok}/${n} recorded site-format battles give the game's outcome`);
if (bad.length) { console.log(bad.slice(0, 20).join("\n")); process.exit(1); }
