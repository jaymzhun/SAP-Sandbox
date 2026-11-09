# Phase 1 summary: ground truth from the game files

Game build analysed (installed via Steam, unchanged since 2026-10-13):

| File | Identity |
|---|---|
| `GameAssembly.dll` | sha256 `eb9180005e26f7c6b92f5b9360531959149b77f84d2bca1a7f7eb6652ca043e3` |
| `global-metadata.dat` | v39, sha256 `8fe892d51d9d4d97d3e1b5905c8f1c9bd3c265b47ea6fac36692e3c20c89a034` |
| Unity | 6000.3.11f1, build-guid `b3350677e3ab4e73a9052e66c665f3f1` |

No wikis, datamines or community dumps were used.

> **Game update, 2026-11-07 (Steam build 26131463).** The game updated after Phase 1 (`GameAssembly.dll` sha256 `4f270446…`,
> metadata `bf6e27ad…`). I re-ran the whole extraction on it:
> - Every enum, pet, stat, tier, pack, ability, ability text and trigger limit is **identical**.
> - All 5,158 re-decompiled battle and ability functions are identical, apart from compiler-generated labels and identical-code-folding names.
> - So these documents still apply. Addresses quoted in them are from the October build; the new build shifts them.

## How it was extracted
- **Code.** REA 6.8.0 with Ghidra 12.1.4, used instead of Cpp2IL/Il2CppDumper.
  - REA's built-in IL2CPP metadata reader decoded 20,796 types and 138,796 methods, and linked 125,196 method bodies to addresses.
  - Ghidra decompiled about 5,500 functions: battle systems, mutators, ability/trigger/effect classes, pet and ability builders, perk and food constants, render code.
- **Enum values** were decoded from the metadata's `fieldDefaultValues` table. They are explicit, not declaration order, for `MinionEnum` and `AbilityEnum`.
- **String literals and type references** used by the code were decoded from IL2CPP metadata-usage slots (29,774 strings).
- **Assets.** UnityPy 1.25.4 (installed in a private venv).
  - Metadata v39 is too new for UnityPy's type-tree generator, so serialized settings were decoded with a custom reader built from the metadata field order. It's byte-exact on the settings objects.
- All extraction scripts and raw evidence are in `%USERPROFILE%\rea-work\sap\` (outside the repo).

## Documents
| File | Contents |
|---|---|
| PETS.md | All 357 main-pack pets plus tokens: real ID, tier, stats, ability, trigger, **trigger limit**, game text at L1–L3 |
| TRIGGERS.md | All 139 trigger factories: trigger class, TriggerEnum, MinionFinder filter, how many abilities use it |
| BATTLE-LOOP.md | Setup, seeds, RNG, phases, end conditions, move/trade, damage pipeline, ability ordering, limits, summons, stat caps |
| PERKS.md | Every battle perk/ailment number and the operation it applies |
| PERK-ABILITIES.md | 112 trigger-based perk/ailment abilities |
| ANIMATION.md | Where motion comes from, the real timing table, tween settings, extracted assets |
| ENUMS.md | Real values of the battle-relevant enums |

## Where the game code disagrees with the current engine
I haven't changed anything. Each row needs your decision for Phase 2.

| # | Topic | Game code | Current engine |
|---|---|---|---|
| 1 | Turn cap | Draw when both sides are alive at **turn 70** | Stops after 200 rounds |
| 2 | RNG | .NET subtractive `System.Random` per side (Player/Opponent/World). Each pick draws from both team streams. Seeds are `Guid` low 4 bytes | mulberry32, one stream |
| 3 | Damage multipliers | **Additive**: Salt + tribe advantage = ×3 | Multiplicative (Salt: `dmg *= 1+m`) |
| 4 | Tribe advantage | Fire > Grass > Thunder > Water > Fire, +1 multiplier | Not implemented |
| 5 | MapleSyrup / Halfer | Halve n times, then a single ceil (n=2 → ÷4) | `ceil(dmg/(1+m))` (n=2 → ÷3) |
| 6 | Garlic | Reduce by 2n, never below **2** (a 3-damage hit becomes 2) | Never below 1 |
| 7 | Damage order | Fixed order: base×mult → Min → Max → Fixed → halving → ceiling armour → flat armour → kill/protect | Inline per perk |
| 8 | Cuckoo Baby | Stats capped at 1/1 (`SetMaxStats`) | Not capped |
| 9 | Start priority | Higher `Next(int.MaxValue)` draw between the two seeds; affects who moves first | (check during Phase 2) |
| 10 | Ability order | Own-event first → Attack (±1000 Churros/Macaron) → random tie-break → insertion order | Same keys, plus "perk before own ability" |
| 11 | Perk vs own ability on one pet | Code runs the pet's own abilities first, then its perk's abilities. **Not yet confirmed** whether the random tie-break is per pet (which would keep that order) or per ability | Perk first (your confirmed rule) |

Your other confirmed rules don't conflict with anything read so far:
- one sequence per trigger moment, with knocked-out pets still activating;
- jump attacks as full fights;
- faint summons on both sides before a winner;
- empty front slot → EmptyFront phase, then Move;
- per-trigger "already triggered" dedupe.

## What could not be recovered (or not yet)
- **Not read yet (all decompiled, needs line-by-line reading in Phase 2):**
  - when limit windows reset, and whether a failed summon uses a trigger;
  - when dead pets leave the board;
  - summon push direction;
  - jump attack, swallow, mana, trumpets;
  - where `RandomTieBreak` is drawn.
- **51 of 357 pet descriptions** keep a placeholder where the value comes from a per-level lookup table (e.g. Crab, Badger, Dodo, Skunk percentages). The mechanics calls are captured; the table contents still need reading.
- **28 pets have no ability code in this build** (mostly relics and beta pets): their builders compile to an empty stub.
- **English text.** `localization-string-tables-english` (99 KB) is present. Its `StringTable` layout is stripped like the settings were, so decoding it is a Phase 2 task. Game code text (the About strings) is already decoded.
- **Animation.** Settings and timings are recovered. The per-renderer tween choreography (summon, faint, numbers, swallow, level-up) is decompiled but not yet tabulated. Matching it needs **reference footage from your game**, which only you can record.
- **Real battle test set.** Needs battles recorded from your game (teams + outcome + event order). Nothing in the files records past battles.
- **Fast mode.** The settings have a `FastTimings` slot, but only `DefaultTimings` ships. How fast mode scales timing is still to be read.

## Questions for you
1. **Decisions** on rows 1–11 above, especially 11: should the code win over your earlier confirmed "perk before own ability" rule, once I've confirmed the tie-break?
2. **Publishing.** Is it OK to commit these docs to the public repo? They contain numbers, names and short decompiled-structure notes, no raw decompiled code.
3. **Publishing assets.** Answered: the font, FX sprites and particles are approved and now on the site (`fonts/LapsusPro-Bold.ttf`, `img/fx/game/`, `js/fx-data.js`). Sounds and other extracted files are not approved and stay local.
4. **Git push.** HTTPS to GitHub fails on this machine because AVG's HTTPS scanning re-signs certificates. For pushing I'd set this repo only to use the Windows certificate store (`git config http.sslBackend schannel`). OK?
