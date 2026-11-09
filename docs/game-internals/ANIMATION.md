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

## Per-effect tweens (Phase 3, read from the decompiles)

Field offsets of `RenderingTimings` follow the table above from +0x18 (ShowAbilityCards) on. Checks: +0x40 = MinionAttackWindupDuration in `TradeAnimation`, and +0x9c = DestroyMinionPuffDelay in `DestroyMinionRenderer`.

The `Vector3` statics are zero +0x00, one +0x0c, left +0x30 and right +0x3c. DOTween `Ease`: 1 Linear, 5 InQuad, 6 OutQuad, 7 InOutQuad, 14 InQuint, 27 OutBack.

| Effect | Code | Tweens |
|---|---|---|
| Geometry | level3 scene, `BoardView.GetWorldPosition` | camera ortho 3 at (4.5, 0.28); BattleBoardView world (0, −0.351); slot = location x (1 unit), ±0.2 for x < 5 / ≥ 5 |
| Punch | `MinionView.DOPunchScale(s)` | DOPunchScale(one·0.2s, 0.5s, vibrato 10, elasticity 1) |
| Hit shake | `MinionView.DODamage` | DOShakePosition(0.5, one·0.2, 100, 90, fadeOut) |
| Land | `MinionView.DOLand` | DOScale((1.2, 0.8, 1), 0.1) OutQuad and DOLocalMoveY(−0.05, 0.1), each yoyo ×2 |
| Stat text | `DOBuffAttack/Health`, `DOMana`, `DOLoseAttack/Health` | pet punch 1 (loss 0.7); TMP text DOPunchScale(one·2 or one·0.7, 0.3, 3, 1) |
| Fumble | `MinionView.DOFumble` | colour red → white 0.5 s; DOPunchPosition(right·0.2, 0.5, 20, 1) |
| Attack | `TradeAggregator.<TradeAnimation>` | wind-up DOLocalMoveX(−0.15·gap) and DOLocalRotate(±15°), both 200 ms InQuint, relative; release DOLocalMoveX(+0.5·gap, or 0.75) and rotate to 0, 100 ms InQuint; await the hits; back DOLocalMoveX 70 ms Linear |
| Damage number | `BoardView.DamageMinion` | FxText amount += damage; DOJump(rel (0, 0.5), power 0.2, 1 jump, 0.5 s); lifetime 1 s; hit particles; sounds |
| Projectile | `BoardView.<PlayProjectileAsync>d__29`, `FxBase.Jump` | source DOPunchScale 1; sprite scale 0 → 0.75 in 0.1 s; DOJump(target, 1.5 ± 0.1, 1, ProjectileDuration) Linear; optional DORotate 360·duration (LocalAxisAdd) |
| Stat gain | `BoardView.GainStat` | FxGain amount += n (scale 0.6); Sequence: DOMove rel (∓0.25, +1) 0.25 s OutBack, interval 0.5 s, DOScale 0 in 0.2 s InQuad |
| Buff | `GiveMinionBuffRenderer` | projectile, then `BuffAfterFX` (splash, set stat, GainStat, DOBuffAttack / Health), then GiveMinionBuffDelay |
| Perk | `GiveMinionPerkRenderer`, `BoardView.GiveMinionPerk` | projectile, splash, SetPerk, DOLaunchProjectile (= punch 1), GiveMinionBuffDelay |
| Faint | `DestroyMinionRenderer`, `BoardView.DestroyPunch` | kind 0: DOJump to the camera viewport edge ±1 unit, power DestroyPunchJumpPower, duration \|dx\|·0.025 / DestroyPunchSpeedFactor (default ease), trail particles on the same jump, camera Shake 0.5, mascot pose 3; other kinds: `TryDestroyPuff` (puff particles, hide); then DestroyMinionPuffDelay |
| Faint group | `DestroyAggregator.Run` | each destroy delayed Random.Range(50, 200) ms (0 for kind 0), all awaited together |
| Summon | `SummonMinionRenderer`, `SummonMinionAsync` | normal: place + DOLaunchProjectile + sound; kind 0: start outside the camera, DOMoveX 0.7 s Linear, DOMoveY +2 in 0.35 s OutQuad then back in 0.35 s InQuad, DOLand; then SummonMinionDelay |
| Move | `BoardView.<MoveMinion>d__42` | DOMove(slot, duration) InOutQuad; sprite DORotate(dx·8°, 0.7·duration) InOutQuad relative, then (−angle, 0.3·duration) OutBack overshoot \|angle/5\| |
| Exp | `BoardView.GiveMinionExp` | particles (exp, or level-up), DOExp (punch 1), sound; GiveMinionExpDelay |
| Mana | `BoardView.GiveMinionMana` | particles, SetMana, DOMana, sound |
| Ability | `AbilityAggregator.Minion.Run` | MinionView.Highlight (AllOneShader.DOHighlight 0.02 / 0.035), CardController.BounceAbilityCard / BouncePerkCard, events, HideCard; AbilityHighlightDelay between |
| Jump attack | `BoardView.<ThrowMinion>d__74` | DOLocalJump(dest + DestinationOffset, JumpHeight, 1, InitialThrowDuration) with RotationEase; DOLocalRotate(RotationAmount, LocalAxisAdd) |
| Swallow | `BoardView.Swallow`, `GetSwallowDuration` | FireMouth / CloseMouth; duration 0.3 + \|dx\|·0.2 / 5 |
| Intro rocket | `UIBattleIntro.<MinionEnterRocketLanding>d__5` | rocket sprite + particles (scale 2); DOMove 0.75 s OutQuad; rocket DOScale 0.25 s then DOJump(power 1.5, 0.5 s, Linear); shake position (1 s, 0.1, 10, 90) and rotation (1 s, 15, 2, 90); DOLand; sounds |

## Still open
The tweens are in the table above, and js/battle.js uses them. Everything that still differs from the game, including the
reference footage comparison and the choice among the 9 intro styles (the site uses RocketLanding), is listed in ANIMATION-DIFFS.md.
