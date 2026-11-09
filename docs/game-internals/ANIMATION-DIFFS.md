# Battle screen vs the game: remaining differences

Phase 3 rebuilt `js/battle.js` from the game's render code: `RenderSystems.*`, `RenderAggregators.*`, `BoardView`, `MinionView`, `FxBase` and `UIBattleIntro`, all in build 26131463. The numbers come from the decompiles and from `RenderingTimings "DefaultTimings"`. ANIMATION.md has the per-effect table and where each number comes from.

This file lists every place where the site still differs from the game, and why.

**Reference footage has not been compared yet.** That needs recordings of real battles from your game (see the last section). Until then, the items below are only checked against the game code, not against video.

## Matches the game code

| Effect | What the site now does (game source) |
|---|---|
| Board layout | 120 px per unit (orthographic camera size 3). Slots are 1 unit apart and shifted 0.2 away from the middle, so the front pets sit at 556 / 724 px, centre line y 436 (level3 scene, `BoardView.GetWorldPosition`). The old site had 552 / 728. |
| Attack | Wind-up 15% of the gap back with a 15° lean (200 ms, InQuint). Lunge 50% of the gap forward while straightening (100 ms, InQuint). The hits play, then a linear 70 ms return (`TradeAggregator.TradeAnimation`). |
| Hit shake | `DOShakePosition`: 0.5 s, strength 0.2 units, vibrato 100, randomness 90, fading out (`MinionView.DODamage`). |
| Damage number | One number per pet that adds up repeated hits. It jumps 0.5 units up with a 0.2-unit hop over 0.5 s (OutQuad) and despawns after 1 s (`BoardView.DamageMinion`). |
| Projectiles (snipes, buffs, perks) | The source punches. The sprite grows 0 → 0.75 in 0.1 s while jumping to the target: arc 1.5 ± 0.1 units, 400 ms (ProjectileDuration), linear, turning 144° (`PlayProjectileAsync` → `FxBase.Jump`). |
| Stat gain | An attack or health icon showing "+N", added up per pet. It moves (∓0.25, +1) units over 0.25 s (OutBack), holds 0.5 s, then shrinks to 0 over 0.2 s (InQuad). The pet punches (scale 1) and the stat text punches ×2 over 0.3 s (vibrato 3); for losses these are 0.7 (`BuffAfterFX`, `GainStat`, `DOBuffAttack` / `DOLoseAttack`). It is followed by GiveMinionBuffDelay 100 ms. |
| Punch | `DOPunchScale`: Vector3.one·0.2s over 0.5s seconds, vibrato 10, elasticity 1. It uses DOTween's segment maths (decaying alternating segments, each OutQuad). |
| Perk gain | Perk sprite projectile, then the pet punches (1), then 100 ms (`GiveMinionPerkRenderer`). |
| Faint | The pet is punched off the board in an almost flat jump (power 0.05 units) to 1 unit past the screen edge. It takes \|dx\|·0.025 / 0.4 s, about 0.35 s from the front, then DestroyMinionPuffDelay 300 ms (`DestroyPunch`). Faints that happen together play at once (`DestroyAggregator`, WhenAll). The old site used a 700 ms high arc with a 540° spin. |
| Summon | The pet appears in its slot and punches (scale 1), then SummonMinionDelay 500 ms (`SummonMinionAsync`). The old site added a puff and a pop. |
| Move | 400 ms (MinionMoveDuration), InOutQuad. The sprite turns dx·8° over the first 70% and springs back with OutBack (overshoot \|angle/5\|) over the last 30% (`MoveMinion`). |
| Experience | The pet punches (1), then GiveMinionExpDelay 200 ms (`GiveMinionExp`). |
| Mana | The pet punches (1) and the mana text punches ×2 (`GiveMinionMana` / `DOMana`). |
| Jump attack | The pet jumps to the target plus ThrowMinion.DestinationOffset (0.35, −0.8): height 1.5, 420 ms, turning −510°, linear (`ThrowMinion`). |
| Swallow | Lasts 0.3 + \|dx\|·0.04 s (`GetSwallowDuration`). |
| Ability | The pet's outline is highlighted, then AbilityHighlightDelay 100 ms (`AbilityAggregator`, `MinionView.Highlight`). |
| Intro (RocketLanding) | Each pet rides its rocket to the slot (0.75 s, OutQuad). The rocket shrinks and jumps away (0.25 s + 0.5 s, jump power 1.5). The pet lands with `DOLand`: scale (1.2, 0.8) and dip 0.05 units over 0.1 s OutQuad, then back. |
| Landing squash | `DOLand` as above. |

## Still different (needs your decision or more data)

1. **Fonts, sprites and particles.** The site still uses its own `fonts/lapsus.ttf`, which is not the game's LapsusPro-Bold (sha256 differs). It also uses its own FX images: rock, puff, rocket and the stat icons, which reuse the editor's Fist / Heart. The game draws hits, splashes, puffs, level-ups and exp with its own particle systems (301 extracted) and FX sprites. Matching these means publishing newly extracted game files on the public site, so I haven't added them. **Needs your OK.**
2. **Ability card bounce.** When an ability fires, the game also pops the pet's ability card (or perk card) beside it (`CardController.BounceAbilityCard` / `BouncePerkCard`; TweenSettings.Cards: scale 0.9 → 1 over 0.4 s OutBack, bounce 0.1 / 0.2 s). The site only highlights the pet. Doing this would reuse the hover card, which also pauses the fight on hover. **Needs your call** on whether the card should pop during play.
3. **Screen shake on a punched faint.** `BoardView.Shake(camera, 0.5)` calls `BestCamera.ShakeStart` with a preset that isn't in the decompiles; the Ghidra daemon is down, so I can't decompile more. The site doesn't shake.
4. **Mascot reaction.** On a faint the game sets the owner's mascot pose 3 (`MascotView.AddPose`). The site's mascots don't react during the fight yet: the pose name for 3 isn't mapped, and the art is the mascot set the site already has.
5. **Faint vertical offset.** DestroyPunch adds `Random.Range(?)` to the end height. The range arguments were lost in the decompile, so the site uses 0.
6. **Puff vs punch.** The game punches a pet off when the destroy kind is 0 and puffs it otherwise (`TryDestroyPuff`). The engine log doesn't carry the kind, so every faint is a punch.
7. **Trumpet summons.** Summons of kind 0 (the trumpet / "outside" summon) drop in from off-screen: 0.7 s in x, a 2-unit hop up 0.35 s OutQuad and down 0.35 s InQuad, then DOLand. The log doesn't say which summon kind it is, so all summons use the in-slot punch.
8. **Jump-attack return.** After the throw the game teleports the pet (ThrowMinion.AfterTeleportDelay 0). Where it teleports to isn't in the decompiled part; the site snaps it back to its slot. The sign of DestinationOffset.x per side is also inferred, and the target is reached 0.35 short.
9. **Swallow mouth.** The game fires a mouth sprite at the target and closes it (`FireMouth` / `CloseMouth`). The site moves and shrinks the swallowed pet into the swallower over the game's duration, without a mouth sprite.
10. **Rocket exit.** The DOScale target of the rocket before it flies off was lost in the decompile; the site uses 0.5.
11. **Intro choreography.** The order and pauses between team entries, labels and "VS" (`UIBattleIntro.Play` / `TeamEnter`) are not read yet, so the site keeps its own 250 / 650 / 300 ms waits and the 90 ms stagger. The game also has 9 other entrance styles, chosen by cosmetic; the site always uses RocketLanding.
12. **Pauses not tied to a game timing.** These still use the old site values:
    - after an attack hit: 120 ms (the game's DamageDelay 700 ms is used somewhere I haven't traced);
    - ability damage: 130 ms;
    - block: 220 ms;
    - mana: 110 ms;
    - transform: 340 ms;
    - trumpets: 150 ms;
    - end: 700 ms.
13. **Transform, trumpets, summon fail, perk activation.** `TransformMinionRenderer`, `PlayerBoardView.AddTrumpets`, `SummonMinionFailAsync` (1000 ms, jump power 1) and `ForceActivatePerkRenderer` are not read in detail. The site keeps a puff plus a punch for transform, a flash for trumpets, nothing for a failed summon, and a perk flash plus punch for a perk activating.
14. **Text pop-ups.** "Blocked!", "+N xp" / "Level up!" and notes are site text. In the game these show as particle effects (see 1).
15. **Result screen.** Not rebuilt: the game's end-of-battle UI is a separate canvas prefab that hasn't been decoded.
16. **Fast mode.** The game has DefaultTimings and FastTimings slots but ships only one asset, and how its fast mode scales time is unread. The site divides every duration by its speed setting (×2 / ×4).

## Reference footage (Phase 3 step 2)

To compare side by side I need recordings of specific battles from your game, with known teams. If you record a few (teams I give you, played in the game), I'll set up the same teams on the site and compare them frame by frame. I can't record the game myself without playing online.
