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

## Verification oracles (tools/oracle)
- `compare.mjs`: compares the EventLog line by line with battles recorded from the game. The recordings now include each pet's
  real ability list and every scalar BoardModel field (rolls, gold spent, transformations, ...). `--js a:b` prints JS log lines.
- `rngcompare.mjs`: compares every random draw (method, stream, arguments, result) with a Frida trace of the game's `BoardRandom`
  calls, cut where `BoardResolver.Finalise` starts hashing. It catches missing or extra draws that the EventLog cannot show while
  later rolls have range 0.
- Ids: each board GUID keeps its own letter (player P, battle board M, anything else Q, R, ...). An opponent relic has its own
  GUID, so it must not share an id with a summon.

## Randomness details
- `Randomizer.PositiveInteger` is `Next(1, int.MaxValue)` (trade ties in `HasPriority`); `RollPriorityMutator` uses `Next(int.MaxValue)`.
- `BoardExtensions.GetPerkMultiplier(m)`: PerkMultiplier (default 1), times the level of an own ability whose `PerkMultiplier`
  names this perk, otherwise (in battle) times the aura-2 value. Perk repeats use it.
- `GetNegativePerkMultiplier(m)`: 1 (pet 748: its level), plus the MagicVariable of ability 388 on non-deaf enemies, times
  PerkMultiplier. Ailment repeats use it, with Reversed = the pet has ability 839.
- Condition, repeat and finder parameters use the owner as both source and target.

## Open questions
- The harness board reports `BoardCapacity` 198, so recorded battles never hit the summon capacity check (JS assumes 10).

## Findings from the long-tail port (build 26131463)

- **BattlePhase** (BoardModel +0x25c): StartBattle 0, Trade 1, Move 2, Cleanup 3. `ConditionIsStartOfBattle` tests it for 0.
- **Template fields**: MinionTemplate +0xfc is `Type` (1 = relic), +0x100 is `RelicType`. `DestroyMinion`/`RemoveMinion` use Type to pick the relic grid; `ConditionHasRelic` and the aura lookups skip RelicType 1.
- **Game-ordered lists** drive random picks: `SpellConstants.GetReleasedSpells`, `PerkConstants.GetReleasedPerks`, `MinionConstants.GetActiveMinions` (dumped with agent.js `constantLists`, carried in data.js `lists`).
- **ListExtensions random helpers**: pick one = `list[Next(0, count)]`; take with replacement = that, Amount times; take unique = partial Fisher-Yates from the front with `Next(i, count)`; shuffle = Fisher-Yates from the end with `Next(0, n)`.
- **PerkCatalogueRandom**: NegativeRisk ≥ 1 skips the roll and picks a negative perk; otherwise `NextDouble() < NegativeRisk` decides. Positive perks come one per released spell (so duplicates weight the pick).
- **MinionCatalogueTriggerTarget** reads `CopyAttack` twice and never `CopyHealth`, so CopyAttack copies both stats.
- **Removable buffs** (GiveMinionBuff Duration 2): per-source records in MinionModel.RemoveableBuffs; damage (`MinionExtensions.Damage`) and SetMinionStats use them up via `DamageRemovableBuffs`, so a later removal takes back only what is left.
- **EffectBalance** works in float32 and rounds with `Math.Round` (half to even, the native helper at 0x1800036a0).
- **Aura repeats**: `BuildRepeatActivations` adds activations for aura 5 (and 13 / 0 / 4 in cases not yet ported) at the aura holder's level.
- **Empty systems**: `CheckAuraSystem.Execute` and `FinalCleanupMutator.Execute` are `RET` in this build.
- **Ability 839** reverses ailments (TryDamage, Activate) and exempts a pet from perk 121's buff cancel.
- **TriggerEvent.Force.New(source)** returns the subclass `Force+WithSource` when a source is given.
- **Open**: the board's Pack / OpponentPack are not in the recordings (enums); the harness leaves them at 0 (Turtle). Matching Find battles agree.
- **Memories**: `RememberMinionMutator` writes a MinionMemory (enum/attack/health/mana/perk/level/exp/power as the Keep* flags say) into the source's MinionBrain list for the ability; UniqueEnum skips a type already there, and without KeepMany the list is cleared first. `MinionCatalogueMemory` makes one pet per memory. Specs carry no memories, so brains start empty.
- **StealMinionPerk**: the thief takes the victim's perk; `TriggerStealPerkSystem` then fires PerkLost (unless TargetPerkStays), PerkGained, and PlayedSpellOn for the perk's spell (thief as target, victim as source).
- **Lambdas not in the data** (resolved live with agent.js `delegateAt` / `methodref` / `classAt`): ability 439's ParameterTriggerValue reads TriggerEvent+Hurt.Amount; PerkCatalogueEvent reads PerkLost.Perk (else perk 8); OrderMinions 18 is OrderByDescending(HasDeathEffect) (FUN_180f855f0 is the descending sort, not Where).
- **Shop history not in the recordings**: BoardModel PreviousSurvivors (+0xf8) and WackyMinionParameter (+0x1a0) are read as given (empty on the harness boards).
- **TriggerPlayedSpellOn** is about the event's TargetId (its SourceId is nullable, so not a trigger source; corpus2 #93 confirms). SpellFilter matches battle PlayedSpellOn spells as conjured, not stolen, not buffed (the recorded SpellModel).
- **Collectors**: `Collector<ChangeFreeRolls>`, `<PlayMinionResult>`, `<RollShopResult>` take their events (they are queued and logged, nothing else).
- **Verification**: corpus1 (300, used for porting) 300/300; corpus2 (300 fresh battles, seed 20261108) 300/300; every battle draw-identical.
- **Silly** (`MinionExtensions.IsSilly`: in battle, perk 75, unless ability 839 at level 1 or 3): `TargetsBase.GetTargets` re-picks targets — count from ITargetAmount (TargetsFind.Limit, TargetsRelative/TargetsScan.Amount) or TargetsRelative's Position/Distance, else the raw count; every pet is shuffled (from the end), that many taken, and IMinionFiltering's finder Perk kept. TargetsFind and TargetsTriggerTarget also re-pick inside GetTargetsRaw (so a Silly TargetsFind draws twice). `EffectBase.ActivateGlobal` flips the effect's owner on `Next(2) != 1`.
- **TargetsTriggerSource on a forced activation** (Force and Force+WithSource) targets one random live pet.
- **FindAura** (singular): first aura ability model — relics none; a dead pet (not perk 55) checks its own first; then the grid forwards for the player, backwards for the opponent. Aura 0 (battle, the pet's first non-RepeatFromAuraDisabled ability) and aura 4 (death abilities; one extra activation when the aura model has AlwaysIgnoreMinionLevel) add repeats at the aura's level.
- **Charges**: `GetCharge` reads the ability's Charges only once the pet has a power dictionary (created by the first AddPower).
- **Spells in battle** (data.js `spells`, from SpellConstants.GetSpell): `EffectPlaySpell.OnSingle` takes the catalogue's spells (SpellCatalogueList: Spells within TierMin/TierMax/TierUnlocked, `list[Next(0, count)]` Amount times, AllowDuplicates or not; each a new SpellModel whose ItemId takes the board's next UniqueNumberCounter), marks each Conjured, sets Power from SpellPower, and emits `Try<PlaySpell>`(Owner, Author 1, Source = source, Target = target).
- **PlaySpellMutator**: BoardExtensions.PlaySpell (CanPlaySpell: a spell with an Aim needs a live pet it can aim at; the target must pass CanAimSpellAt, which runs the Aim with no owner pet, Owner 1 and no random; a conjured spell skips the shop, the spell history and the gold), Power = Power + event Power, `Spell.Activate` once, EscapeSpell per link, Done.
- **Spell.Activate**: per pair, targets from TargetsArgs (no trigger, no owner pet, the spell, the aim); the effect args are **Level 1 and Owner 1 even for the opponent's spells** (recorded: BuffMinion Owner 1 on corpus3 #101), with the PlaySpell's Source and Target as aim. The global result is a CastEffect, the per-target results one CastEffectsParallel (added even when empty), then (first pair only) Done<PlayedSpellOn> per target. A pair without targets ends it unless AlwaysActivateAllPairs (+0x112). A target whose template has a RememberSpells ability remembers the spell (SpellMemory); none does in this build.
- **Spell multiplier**: EffectGiveBuff with `sa.Spell` marks the spell Buffed and multiplies attack, health and their ranges by GetSpellMultiplier (1; with no source, plus the level of every ability 89 that can trigger) plus the spell's Power. EffectBase.ActivateSingle/ActivateGlobal then sets SourceSpell = the effect's SpellSource on every ISourceSpell event (BuffMinion, ChangeMinionMana, ExchangeStats, ForceActivateAbility, GiveMinionPerk, SetMinionStats, StealMinionPerk, SwapStats).
- **PlayedSpellOnMutator** adds 1 to the target's SpellCountsThisTurn (+0x110). TriggerPlaySpellOnSystem / TriggerPlaySpellSystem fire PlayedSpellOn (Shop) and PlaySpell unless the spell is NonFood (+0x121).
- **Ghidra drops register arguments**: `FindAuras(board, minion)` in ProcessAttacker is really `FindAuras(board, minion, 9)` (R8D, read from the assembly); aura 9 is Monty's crit (AuraDistance 0, so its own attacks). The other aura numbers were checked the same way: attacker 3 and 0x10, defender 0xb, 6, 10; repeats 0, 4, 5, 13; transform 12. corpus3 #299 (a Monty crit) needed this.
- **corpus3** (300 fresh battles): 259/300 identical; the other 41 stop on an unported piece. With the rng3 traces, every fully ported battle draws the same random numbers, and the 41 draw mismatches are exactly the unported battles.
- **Target copies and removal**: `MinionCatalogueTargetCopy` makes one pet per target of its Target (from the source pet), Exact copying the target (MinionModel.CopyFrom: everything but Owner, Location, Point and Mana) and CopyPerk its perk. `EffectRemoveMinion` emits Try<RemoveMinion> (RemoveType 0): the pet is Destroyed, its cell cleared, and it goes to the graveyard (RemoveType 1: Location 6 instead); relics leave the relic list.
- **Stat shuffles**: `ShuffleStatsMutator` needs a live pet with health and at least 3 permanent stats; n = sum - 2, r = Next(0, n), attack r + 1, health n - r + 1, overflow past a max moves to the other stat. `SwapStatsMutator` swaps the permanent and temporary parts separately. `ShuffleMinionsMutator` groups the live targets by side (own / other, id order) and gives each pet a random remaining point of its group (Next(0, count), then removed).
- **ParameterEmptySpaces**: empty cells on the side the Owner flag picks (own side or the other one), counted from the pet's view.
- **MinionFinder**: ActiveAbility (+0x6a) = has an ability not DisabledTemp; SameAbility (+0x199, needs an owner) = shares an ability enum with the owner; SellValue (+0x248/+0x250) checks GetGoldValue (1, 2 at level 2, 3 at level 3; + twice the perk multiplier for perk 43; + SellValue; at most 300); WithoutPerkPara (+0x138) is a ParameterMinionPerk (target = candidate, source = owner) with WithoutPerk's rule. OrderMinions 16/17 (<>c.b__133_13/_14) sort by the tier of the food behind the pet's perk (-1 without one), 16 descending, 17 ascending. The lambda behind each order was found from the delegate's MethodDef index (usage-slots.json): b__133_N is MethodDef 51822 + N.
- **HealthRestore** (`GiveMinionBuffMutator.Restore`): with a live source and a Hurt/HurtEarly trigger, the buff gets up to the damage not yet restored (Amount - Restored), at most HealthRestore minus the source's power for HealthRestoreAbility; the amount is added to the trigger's Restored and to that power.
- **Summon processors SetAttack / SetHealth**: the value is read with ParameterArgs(EffectSummonProcessorArgs): target and trigger target = the new pet, source and trigger source = the parent.
- **EffectSpendMana**: Try<SpendMinionMana> on the target with Spend = Value. **EffectGainTrumpets** has only OnGlobal (per target nothing). **TriggerTransform** IgnoreBack / IgnoreStacking skip a transform back / a stacking one. **TargetsBase.GetTargets** drops targets already in the owner's persisted targets this turn (MinionModel +0x140).
- **corpus3 now 300/300** identical and draw-identical (rng3). Random site teams (tests/fuzz.mjs, 20000 battles) still reach rare pieces no recorded battle uses (about 0.5% of battles).
