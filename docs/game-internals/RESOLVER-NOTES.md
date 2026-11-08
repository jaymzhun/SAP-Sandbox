# Resolver and ability pipeline: decoded rules (Phase 2 working notes)

Every rule here was read from the decompiled game code (build 26131463) or measured on the running game.
The battle core (phases, move, trade, damage, death) is implemented in `js/game/sim.js`. It matches the game's own
EventLog line by line, including depths, on 140 recorded battles: 60 with no abilities, 80 with damage perks.

## Event bookkeeping (SystemManager.Add / Loop)
- **Number** is assigned only when it is 0: `Number = counter`. Re-added events keep their number. `PhaseManagerSystem`
  resets the next phase's Number to 0, so phases are renumbered every turn, but the first phase of a group is not.
- **Depth**, when 0, is the first executing event's Depth + 1 (0 outside the loop). Some systems set it explicitly:
  - Death = 1;
  - TriggerMinions = trigger + 1;
  - DestroyMinion = mark + 1;
  - EmptyFront/AllFaint = max(batch) + 1;
  - AbilityTriggered = trigger + 1.
- Events with Depth >= 201 are **silently dropped**.
- **EventLog**: after each coordinator execution, every consumed event whose Number has not been seen yet is appended.
  The EventCollecter systems' `Execute` is an empty function: they only make sure every event is executed once.
- Coordinator queues are FIFO. Exceptions:
  - greedy take-all: CheckAura #20, RollShopDo #49, TriggerMinions.All #143, Destroy #146, EmptyFront.OnDestroy/OnRemove, TriggerAllFaint #163;
  - TriggerAbilitySystem.All #144 uses a TypeSortedList, which takes every queued TriggerMinions of the earliest type in ExecutionOrder.

## RNG streams (BoardResolver.ProcessBattle)
- Starting player: `CoreRandom(playerSeed)` and `CoreRandom(opponentSeed)` each draw `Next(int.MaxValue)`. The higher draw wins; ties redraw (101 tries). `CurrentPriority` = starting player.
- `ReverseMinionAccess` = (starting player is the opponent).
- Shared streams handed to every system:
  - Player = `Random(playerSeed - seed)`;
  - Opponent = `Random(opponentSeed - seed)`;
  - World = `Random(seed)`.
- Draws:
  - every damage event draws `Next(0, Range+1)` from its owner's stream, even when Range is 0;
  - trade ties draw `PositiveInteger` from player, then opponent;
  - `RollPriority` (end of each turn) draws from the starting player's stream first;
  - every not-yet-triggered `(pet, trigger)` entry draws `NextUlong` (8 bytes) from that pet's owner's stream, on every `TriggerAbilitySystem` pass.

## Trigger resolution (TriggerAbilitySystem)
- Merge the batch, sort the entries, then try them in order.
- The first pet that produces events stops the pass. Its events and the merged TriggerMinions are re-queued, so the next pet waits until that ability has fully resolved, and the remaining pets are re-sorted with fresh tie-breaks.
- Sort order:
  1. ITriggerSource events where the pet is the source go first;
  2. Priority = Attack.Total, +1000 for Churros (70), −1000 for Macaron (117), higher first;
  3. RandomTieBreak ascending;
  4. Sequence.
- Source/target per event: the first id field is the source (SourceId, AttackerId or PetActivatedId). TargetId or DefenderId is the target.

## TryTriggerMinion → AbilityTriggered → AbilityActivate
- Per own ability:
  - `PowerTriggered` → AddMinionPower;
  - Deaf (55) skips the pet's abilities, except enums 686 and 806;
  - `ChargeTriggered` → AddMinionCharge;
  - `Triggered` returns 0 (Do), 2 (Fail, condition), 1 or 3 (nothing).
- Then the perk's abilities at level 1 (`PerkSource` = the perk).
- `Ability.Triggered` returns NotTriggered when:
  - the ability model is disabled;
  - the owner's Location is 6;
  - the pet no longer has this ability.

  It returns 3 when the trigger limit is reached (`TriggerCount >= TriggerLimit`, with the window: All, Battle only or Build only).
- `HandleAbilityTriggered`: re-checks `Triggered`, then builds the repeat activations:
  - `Repeat` (or RepeatParameter);
  - perk ×(PerkMultiplier−1);
  - ailment ×(NegativePerkMultiplier−1);
  - aura repeats.

  Each one increments `AbilityActivations`. It then adds Try<AbilityActivate>×n and Done<AbilityTriggered>.
- `ProcessAbilityActivateTry`: re-checks the limit, runs `Ability.Activate`, adds the result and Done<AbilityActivate>, then `TriggerCount++`. **The limit counts activations.**
- `Ability.Activate`:
  - check the trigger and its conditions again;
  - `ActivatedCount++`;
  - per pair: targets = `Targets.GetTargets`, then the effect's global events (CastEffect), then each target's events (grouped into one CastEffectsParallel);
  - a non-global pair with no targets stops the ability unless `Interuptor` ≠ 0; `Interuptor` = 1 stops after the first pair;
  - everything is wrapped in one CastEffectsSequentially (Parallel when ForceParallelEffectsRenderings).

## Triggers (TriggerBase.IsTriggered)
- `IsTriggeredRaw` (skipped when forced), then conditions.
- A failed condition, i.e. `Check == Invert`, gives status 2 (Fail, Loud = the condition's Fumble).
- `TriggerBaseMinion<T>`:
  - the event must be T;
  - the class's `IsTriggeredByEvent` must pass;
  - pet = GetMinionId (the event's first id field; ExpGained uses TargetId);
  - `MinionFinder.Predicate(board, pet, owner)`.
- Per-class checks:
  - Hurt: Amount ≠ 0 unless IncludeZero; with CanRestore, Amount − Restored > 0;
  - Kill: SourceId ≠ TargetId;
  - Charged/PetActivated: the ability matches;
  - BeforeAttack: FirstAttack == IsFirstAttack;
  - AllFriendsFaint/AllEnemiesFaint/EmptyFriendlyFront: compare AllFaint/EmptyFront.Owner with the owner's side;
  - Composite: any sub-trigger.

## Conditions
- `ConditionBase.Check` = (TrueWhenSilly && owner holds Silly) || CheckBase, then Invert.
- ConditionMinion: every target passes the finder.
- HasMinion: FindMinions count ≥ MustHave.
- CountMinions: Min ≤ count ≤ Max.
- Int: Min ≤ value ≤ Max.
- IsPositive: value > 0 (≥ 0 with IncludeZero).
- Battle: IsBattle.
- HasRelic: a friendly relic passes the finder.

## Parameters (ParameterInt.GetValue)
1. base value;
2. Calculator;
3. Invert;
4. +Op2;
5. ×Op3, as a decimal, floored (ceiling with RoundUp);
6. ÷Op4, integer division;
7. +Op5;
8. +Op6 parameter;
9. Op7 = minimum, Op8 = maximum;
10. Tracker cap: `TrackerLimit − source power`.

Minion parameters read from Origin: 0 Source, 1 Target, 2 TriggerSource, 3 TriggerTarget, 4 Aim.
A forced trigger with no pet gives 1.

## MinionFinder
- **Candidates**:
  - pets when Types is empty or contains 0 (live pets, or every non-destroyed pet with IncludeDead);
  - relics when Types contains 1.
- Filter by `Predicate`, then:
  - FastShuffle when Randomize or Limit: Fisher–Yates from the end, `k = rand.Next(0, n)`, swap k with n−1;
  - unless ForceUnordered: a stable OrderBy(true), then each Order as ThenBy/ThenByDescending;
  - with Limit and an owner: ThenByDescending(enemy BlueBerries / friendly Doughnut holders);
  - Unique filters, Take(Limit), Reverse.
- Order keys:

  | Order | Key |
  |---|---|
  | 0 / 1 | Health desc / asc |
  | 2 / 3 | Distance to owner desc / asc |
  | 4 / 5 | Tier desc / asc |
  | 6 / 7 | Attack desc / asc |
  | 8 / 9 | Attack+Health desc / asc |
  | 10 / 11 | Front first |
  | 12 | Attack not maxed first |
  | 13 | Health not maxed first |
  | 14 | Neither stat maxed first |
  | 15 | Level < 3 first |
  | 16 / 17 | Perk's spell tier |
  | 18 | Death effect first |
  | 19 / 20 | Level desc / asc |
  | 21 | Negative perk first |
  | 22 / 23 | Exp desc / asc |
  | 24 | Positive perk first |
  | 25 | Positive perk last |

- Predicate fields in use: Other, Team (0 friend, 1 enemy), Alive, IncludeDead, Perk, WithoutPerk, Health/Attack (with
  Operator 0 `==`, 1 `<`, 2 `<=`, 3 `>`, 4 `>=`), Level, Tier, Types, Direction, Distance, FrontDistance, the Has*Perk
  family, IsEnemyCheck (owner must be 2), Exclude/IncludeTypes, and others listed in `MinionFinder.Predicate`.

## Pre-activation passes (ActivateAbilityTrySystem.HandleAbilityTriggered)
Measured with a Frida trace of every `BoardRandom` draw: a transform ability rolls its catalogue twice.
- After `BuildRepeatActivations`, abilities 941/931 or any ability with `HasEffect<EffectTransform>` run `Ability.Activate` once
  ahead for each activation. That pass consumes RNG, unique ids and `ActivatedCount`, and its events are thrown away.
  - Each `Try<TransformMinion>` in the result fires `BeforeTransform(target)` through `TryActivate`: every pet (FindMinions order)
    runs TryTriggerMinion, and only `Do<AbilityTriggered>` results are kept, as `Try<AbilityActivate>`s. There are no tie-break draws.
  - An empty result stops HandleAbilityTriggered (no activations, no Done).
  - The handled activation is added and removed from the list while the index still advances, so only every other activation gets
    this pass. The rest are added afterwards as usual.
  - Perk-sourced effects only, when none of the pet's own abilities transforms and it holds perk 94 or 103.
- Ability 928 or `HasEffect<EffectJumpAttack>` has a similar pass that also fires BeforeAttack and stores the precomputed events on
  the activation (not ported yet).
- `ReleaseManaSystem`: a fainting pet with mana runs `Do<AbilityTriggered>(686, level 1, Force)`.
- Mana is capped at 50. Experience thresholds come from `BoardConstants` (level n starts at `[0, 2, 5][n-1]`).
