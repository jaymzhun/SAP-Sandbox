# Phase 4: verification

Run on 2026-11-09 against build 26131463, branch `game-ground-truth`.

## Results

| Check | Command | Result |
|---|---|---|
| Recorded game battles, step by step | `node tools/oracle/compare.mjs <set>.json <set>-out.json all` | vanilla 60/60, perk1 80/80, corpus1 300/300, corpus2 300/300, corpus3 300/300 identical |
| Shop-heavy recorded battles | same, corpus4 | 115/235 identical; every other one stops on a named unported piece (below) |
| Random numbers drawn | `node tools/oracle/rngcompare.mjs` (corpus2, 12 chunks) | 300/300 battles draw the same random numbers as the game |
| Site teams → game outcome | `node tests/adapter-oracle.mjs` | 351/351 |
| Random teams (determinism, drawable steps) | `node tests/fuzz.mjs 500 1`, `node tests/fuzz.mjs 2000 7` | 498/500 and 1998/2000; the rest stop on unported pieces, with no other errors |
| Browser, end to end | `node tests/browser.mjs` | 8/8 scenarios, passed on two runs in a row |

The recorded sets and random-number traces were captured from the game with Frida. They are in `%USERPROFILE%\rea-work\sap\frida\` and stay local; only the comparison tools are in the repo.

## Browser scenarios (`tests/browser.mjs`)

The script needs no npm packages. It serves the repo itself and drives headless Edge or Chrome over the DevTools protocol, using real mouse and keyboard input. A scenario fails on any failed check, page error, console error or failed request. Screenshots go to `tests/out/`, which git ignores.

| Scenario | Checks |
|---|---|
| load | The game font `LapsusPro-Bold.ttf` loads. No broken images. All 10 team slots are drawn. |
| picker | Clicking an empty slot opens the pet picker, search finds Ant, picking it adds it to the team, and Esc closes the dialog. |
| battles | 12 random battles at ×4 all reach the result screen. The log ends with the winner, and Back returns to the editor. |
| controls | Intro, then live. Pause holds the log and Play resumes it. Fast cycles ×2 → ×4 → off. The log panel opens. Skip goes to the result, Replay restarts, and Esc leaves the battle. |
| hover | Hovering a pet shows its card and holds the fight. Moving away resumes it. |
| replayLink | The result screen's link reloads to exactly the same battle log, and the hash is cleared. |
| particles | The particle canvas draws during the intro (rocket trails) and on the first hit. All 20 FX textures are served. |
| smallScreen | At 960×540 the stage scales to fit, and a battle runs to the end. |

## Known gaps

These are known limits, not test failures.

- **Unported game pieces.** The engine stops with `Unported: <piece>` instead of guessing, and the site shows "Can't simulate this battle" in a toast. In corpus4 most of these are shop effects, which can't happen in a sandbox battle. A few are battle effects:
  - `EffectDamage reversed`: 9 battles
  - `EffectForceActivatePerk`: 8
  - `PlaySpell GameCounter`: 6
  - `EffectGiveBuff reversed`: 1
  - `ParameterTriggerValue on WithSource`: 1

  Random site teams hit unported pieces in about 1 battle in 250 to 1000 (fuzz above). The browser test re-rolls those.
- **Animation.** Everything that still differs from the game, or is unconfirmed without reference footage, is listed in ANIMATION-DIFFS.md.
- **No reference footage.** The battle screen is checked against the game's code and data only, not against video.
