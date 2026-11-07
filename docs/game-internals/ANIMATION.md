# Battle presentation: assets, timings and tweens

## Where the motion comes from
- **AnimationClips (771) are pet sprite animations only**, one per pet (`Ant`, `Badger`, …). The rest are `GoldenRetriever_PoseFall`,
  `GoldenRetriever_PoseJump` and a placeholder. There is one animator, `SpriteAnimController` (PowerTools.SpriteAnim).
- **Battle motion is DOTween code.** It lives in `Spacewood.Scripts.MonoBehaviours.Board.RenderSystems.*` / `RenderAggregators.*`,
  `UIBattleIntro`, `MinionView` and `FxBase`. All of these are decompiled. DOTween calls seen: `DOScale` 21, `DOPunchScale` 18,
  `DOMove` 7, `DOLocalMove*` 9, `DOLocalRotate` 5, `DOShakePosition` 2, `DOColor/DOFade` 6, Sequence `Insert` 12 / `Append` 8.
- **Durations come from a settings asset**, not literals: `Spacewood.Unity.SettingsObjects.RenderingTimings` "DefaultTimings"
  (sharedassets1.assets). Code reads `ms / 1000.0`.

## RenderingTimings "DefaultTimings" (decoded exactly: 180/180 bytes)
| Field | Value | Field | Value |
|---|---|---|---|
| ShowAbilityCards | true | AbilityHighlightPreDelay | 0 ms |
| AbilityHighlightDelay | 100 ms | ShowCardFumbleDuration | 1000 ms |
| InitialShowCardDelay | 100 ms | TradeMinionPreDelay | 200 ms |
| TradePlayerTakeDamageDelay | 0 ms | DamageDelay | 700 ms |
| DestroyPunchSpeedFactor | 0.4 | DestroyPunchJumpPower | 0.05 |
| MinionAttackWindupDuration | 200 ms | MinionAttackReleaseDuration | 100 ms |
| MinionAttackBackToStartDuration | 70 ms | MinionAttackRotationDegree | 15° |
| SpeedUpConsecutiveTrades | false | SpeedUpConsecutiveTradesPayoffDelay | 700 ms |
| SpeedUpConsecutiveTradesMultiplier | 1.07 | GiveMinionExpDelay | 200 ms |
| PlayMinionDelay | 200 ms | BuffShopMinionDelay | 300 ms |
| SellMinionDelay | 200 ms | UpgradeTierDelay | 500 ms |
| ProjectileDuration | 400 ms | GiveMinionAbilityDelay | 500 ms |
| GiveMinionBuffDelay | 100 ms | SummonMinionDelay | 500 ms |
| SummonMinionFailDuration | 1000 ms | SummonMinionFailJumpPower | 1 |
| CopyMinionAbilityDelay | 600 ms | CopyMinionStatsDelay | 600 ms |
| SetMinionStatsDelay | 600 ms | ParallelAbilitiesDelay | 250 ms |
| ParallelEffectsDelay | 50 ms | DestroyMinionPuffDelay | 300 ms |
| MinionMoveDuration | 400 ms | MinionMoveDurationQuick | 50 ms |
| MinionPushDuration | 200 ms | GhostDelay | 0 ms |
| ThrowMinion.InitialThrowDuration | 420 ms | ThrowMinion.JumpHeight | 1.5 |
| ThrowMinion.RotationAmount | −510° | ThrowMinion.RotationEase | 1 (DOTween `Ease.Linear`) |
| ThrowMinion.DestinationOffset | (0.35, −0.8) | ThrowMinion.AfterTeleportDelay | 0 ms |

**Attack lunge** (`TradeAggregator.<TradeAnimation>`): `DOLocalMoveX` by 15% of the slot distance plus `DOLocalRotate`
using wind-up/release/back durations, with `DOShakePosition` on impact and 0.5 s / 0.75 s windows.

`ResolverSettings` has `DefaultTimings` and `FastTimings` slots, but only one `RenderingTimings` asset ships. How fast mode
scales timing is still to be read ◐.

Ease names come from `DG.Tweening.Ease`'s real values, decoded from the metadata: 1 = Linear, 27 = OutBack.

## TweenSettings.Cards (hover cards; decoded exactly 56/56 bytes)
MinionMargin 0.3, AbilityPerkStackPadding −0.1, PopupMoveEase 1, PopupScaleEase 27 (`Ease.OutBack`), PopupMoveDuration 0,
PopupScaleDuration 0.4, PopupScaleOvershoot 1, PopupStartScale 0.9, BounceStrength 0.1, BounceDuration 0.2, CardBaseScale 1,
bully multiplier 1.3, MinimumMouseMoveDistance 5.

## Extracted assets (local only, in `%USERPROFILE%\rea-work\sap\assets\export`, NOT in the repo)
| Kind | Count | Notes |
|---|---|---|
| Sprites (PNG) | 3,073 | pets (+ `_2x`), foods, backgrounds (`*Battle`, `*Build`, `*Night*`), mascots, FX: `ManaRock`, `Bandage`, hearts, arrows, `ExpBar`… |
| Fonts | 10 | **LapsusPro-Bold.ttf 45,532 B**, Pangolin-Regular, FranxurterTotally Bold/Medium, KOMTXT, PerfectDOSVGA437, Roboto, LiberationSans |
| AudioClips | 629 | music (`Battle`, `Menu`, `River`…), pet sounds, `TrumpetSpend`, … |
| AnimationClips (JSON) | 771 | pet sprite-frame curves |
| ParticleSystems (JSON) | 301 | full emitter/module parameters |

- The repo's `fonts/lapsus.ttf` (45,024 B, sha256 `d19c564a…`) is **not** the game's LapsusPro-Bold (sha256 `556084d3…`).
- Serialized MonoBehaviour fields were decoded with a custom reader from the metadata field order. The stock
  type-tree generator (LibCpp2IL) can't read metadata v39. That reader handles flat settings objects (verified to the byte). Complex prefabs
  (MinionView layouts, particle hosts) need more work.

## Not yet done (Phase 3 work)
- Pull every tween's parameters per renderer (summon, faint puff, damage numbers, perk pickup, level-up, swallow, jump) into a table.
- Intro: 9 entrance styles exist (`MinionEnterStandard`, `RocketLanding`, `BusDelivery`, `MeteorRain`, `Portal`, `Teleporter`,
  `RandomRoll`, `PixelPets`, `ShinyPets`, plus `SuperFast`). Which one the sandbox mimics is your call.
- Reference footage comparison (needs recordings from your game).
