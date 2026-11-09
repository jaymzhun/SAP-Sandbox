# Battle loop (decompiled from GameAssembly.dll)

Build: GameAssembly.dll sha256 `eb9180005e26…a043e3`, global-metadata.dat v39 `8fe892d51d9d…a89a034`, Unity 6000.3.11f1.
Addresses are image addresses (base `0x180000000`). "✔" = read in pseudocode; "◐" = structure read, details still to be read in
Phase 2 before implementing; nothing here is taken from wikis.

## 1. Architecture ✔
`Spacewood.Core.Actions.Battle.BoardResolver` runs a deterministic ECS:

- **Events** (`BoardEvents.*`) are queued with `BoardSystem.Add` (0x18249d000).
- **Systems** (`Resolver.Systems.*`) react to events and queue more.
- **Mutators** (`Resolver.Mutators.*`) change the board.

The Unity side (`BattleController`, `*Renderer`, `*Aggregator`) only replays the event log, so it never changes the outcome.

## 2. Setup — `BoardResolver.Run` / `<ProcessBattle>d__14.MoveNext` (0x1824d4920 / 0x1824e1990) ✔
1. **One merged board.** The opponent board is passed through `MirrorHorizontally`, then `Merge`d with yours into one `Grid<MinionModel>`.
   - Your pets sit at x = 0–4, with the front at **x = 4**. Enemies sit at x = 5–9, with the front at **x = 5**.
   - `TradePrepareSystem.IsTradePosition(x)` is `x == 4 || x == 5`.
2. **Seeds.** Each side's seed is `GuidExtensions.ToLossyInt(guid)` = the first 4 bytes of `Guid.ToByteArray()`, little-endian.
3. **Starting priority.** Two `CoreRandom`s (player seed, opponent seed) each draw `Next(int.MaxValue)`.
   - The higher draw becomes `StartingPlayer` / `CurrentPriority` (`Owner`: 1 = Player, 2 = Opponent).
   - Ties re-draw, up to 100 times.
4. **Randomizers.** `BoardSystem.GetRandomizer(owner)` has three streams: Player (+0x30), Opponent (+0x38) and World (+0x40).

## 3. RNG ✔ (reproducible bit-for-bit)
- `CoreRandom : System.Random`. This build's `System.Random` is the classic .NET/Mono **subtractive generator**:
  - `MSEED = 161803398` (`0x9a4ec86`), a 56-entry table, `inextp = 21`;
  - `Sample() = InternalSample() * (1/int.MaxValue)`;
  - `Next(n) = (int)(Sample()*n)`;
  - `Next(a,b)` uses `GetSampleForLargeRange` when `b-a > int.MaxValue`;
  - `NextBytes` fills from `InternalSample()`.
- `Randomizer.FiftyFifty(r) = r.Next(2) == 1`. `Randomizer.PositiveInteger(r) = r.Next(int.MaxValue)`.
- **Every random choice consumes both team streams.** `BoardSystem.RandomInt(owner, n)` and `RandomFiftyFifty(owner)` first draw from the *other* side's randomizer, then from the owner's, and use the owner's result. This keeps the two streams in lockstep.
- `BoardSystem.RandomPriority()` draws from both team randomizers (up to 1,000 tries) until they differ. The higher draw wins.
- Damage spread uses the attacker owner's randomizer: `BaseAmount = base + Next(0, spread+1)`.

## 4. Turn structure — `PhaseGroupManager..ctor` (0x1824f1f00) ✔
The phase classes were identified exactly by decoding their IL2CPP TypeInfo usage slots.

| PhaseGroup | Ordered phases |
|---|---|
| PreBattle (once) | BeforeStartBattle → StartBattle → EmptyFront → Move → HasCompletedCleanup |
| BattleTurn (repeated) | **Trade** → EmptyFront → Move → HasCompletedCleanup |
| PostBattle (once) | FinalCleanup |

- `PhaseManagerSystem` queues the next phase of the current group after each phase's event chain is exhausted.
- It stops early when `IsBattleResolved` is true.
- The outer loop counts BattleTurn iterations and throws `EndlessLoopException` past 9,999.
- **Start-of-battle abilities fire exactly once**, in PreBattle, before the first Trade. `EmptyFront` and `Move` also run in PreBattle.

## 5. End of battle — `BoardExtensions.IsBattleResolved` (0x1824a1650) ✔
Evaluated after every phase:

| Board state | Result |
|---|---|
| Both sides have no live pets, and no side has unused trumpets (`Trumpets > 0 && !TrumpetsDone`) | **Draw** |
| One side empty, with no trumpets | Other side wins (`PlayerWon` / `EnemyWon`) |
| **Both sides alive at turn ≥ 70** (`Turn < 0x46` continues) | **Draw**: outcome 3 = `Draw`; the separate `TimeoutDraw` enum value is not used here |
| An empty side with unused trumpets | Not resolved yet: its trumpet summon can still save it |

**Faint summons for both teams resolve before a winner is decided**, because the check runs only after the whole phase's event chain.

## 6. Movement and attacking ✔
- **Move** (`MovePhaseSystem`): the side with `CurrentPriority` moves first. Each side scans from its front backwards and issues `MoveMinion.Try` per live pet.
- **Trade** (`TradePhaseSystem.TryInitiateAttack`): a live player pet attacks the live pet of the other owner one cell ahead. `MinionExtensions.HasPriority` decides only which pet is *listed first*:
  - higher `Attack.Total` first;
  - on a tie, each side draws `PositiveInteger` from its own randomizer.
- **Both pets hit each other.** `TradeSystem` queues `DoTradeDamage` in both directions before either resolves.
- **Before-attack / attack triggers:** `TriggerBeforeAttackSystem`, `TriggerAttackSystem.Trade`.
- **Jump attacks** have their own systems: `TriggerJumpAttackSystem`, `TriggerAttackSystem.JumpAttack`, `EffectJumpAttack` ◐.

## 7. Damage — `DamageAttemptMutator.TryDamage` → `DamageCalculation.Calculate` (0x1824eaf40 / 0x1824a90f0) ✔
1. **Build the calculation.**
   - Constructor defaults: `BaseMultiplier=1, Multiplier=1, CeilReductionLimit=1`.
   - Flags: `IsAbility` (damage type ≠ Attack), `IsSplash`, `IgnorePerks`.
   - Per pet: `PerkMultiplier` and `AilmentMultiplier` (sign flipped when `AilmentReversed`).
2. `ProcessAttacker`: tribe advantage, then attacker perks, then auras.
3. `ProcessDefender`: defender perks, then defender ailments, then auras.
4. `Calculate()`, in this exact order:
   ```
   Nullify→0 ; Bottomfy→1 ; d=(Base*BaseMultiplier+FlatBonus)*Multiplier ; Min ; Max ; Fixed (overrides both) ;
   halve Halfer times, single ceil ; if d>CeilLimit: d=max(CeilLimit, d-CeilReduction) ; if d>0: d=max(0,d-FlatReduction) ;
   Killify (d>=1 → lethal, may consume attacker perk) else Protectify (d>=HP → HP-1) ; max(0,d)
   ```
   - **`AddMultiplier` is additive.** Two "double damage" sources give ×3, not ×4.
   - **Tribe advantage** adds +1 Multiplier: Fire > Grass > Thunder > Water > Fire (Grey is neutral).
5. Apply with `MinionExtensions.Damage`.
   - If the defender drops to ≤ 0 HP while holding **BokChoy**, and the hit was not killify, it regains +3 HP and loses the perk.
6. **Splash.** An attack without the no-splash flag calls `TryAttackAdjacent`. MildChili and Skewer route damage to adjacent pets.

The perk-by-perk numbers are in PERKS.md.

## 8. Ability resolution ✔/◐
- **Collection.** `TriggerAbilitySystem.Execute` merges one trigger event's `TriggerMinions`, then `ProcessTriggerMinions`:
  - `GetSortedTriggerMinions` sorts them;
  - for each, `BoardExtensions.TryTriggerMinion(board, minion, event, ownerRandomizer)`;
  - `WasAlreadyTriggered` skips an (ItemId, ability) pair that already reacted to this event.
- **`TryTriggerMinion`** (0x182526…) ✔:
  1. Returns nothing if the pet has no abilities.
  2. A pet holding **perk 55 = Deaf** skips its *own* abilities.
  3. Runs each own ability (`Ability.PowerTriggered`; power/charge bookkeeping emits `AddMinionPower`).
  4. **Then** runs the abilities of its perk: `PerkConstants.GetPerk(perk).Abilities` → `AbilityConstants.GetAbility(e, 1)`.

  **Perks and ailments with triggers are ordinary abilities** (PERK-ABILITIES.md).
- **Ordering** — `MinionTriggeringAbilityComparer` / `MinionTriggeringAbility.CompareTo` (0x1824f0f70) ✔:
  1. A pet reacting to an event it caused itself (source ItemId == its ItemId) goes first.
  2. Higher `MinionModel.Priority` = `Attack.Total` (+1000 if holding **Churros**, −1000 if holding **Macaron**).
  3. `RandomTieBreak` (a `ulong` from `CoreRandom.NextUlong`), ascending.
  4. `Sequence` (insertion order).
- **Limits** — `Ability.SetTriggerLimit(int? value, TriggerLimitType, TriggerLimitFormat)`:
  - `TriggerLimitType`: `All`=0, `Battle`=1, `Build`=2.
  - The count lives on `MinionAbilityModel` (+0x20) and is incremented by `TryIncreaseAbilityTriggerCount` after `CanAbilityCountLimit`.
  - Limit values for every ability are in PETS.md.
  - ◐ Still to read: *when* each window resets, and whether a failed effect (e.g. a full team for a summon) consumes a use.
- **Repeat / charges.** `SetRepeat(n)` re-runs the effects n times (Dolphin: 4 damage × L). `SetCharges` / `SetTriggerCharged` gate abilities on a charge counter.

## 9. Summons, stats, mana, trumpets
- **Summon** (`SummonMinionAttemptSystem.Execute`) ✔:
  - The per-side lane is 5 wide (`uVar6 == 5`).
  - `CanSummonMinion` fails → a summon-fail event (that is what the `SummonFail` trigger hears).
  - Otherwise `TryClearSpace` pushes pets (`CanPushMinion`) in the reverse direction to open the slot.
  - Exact push direction and "up front" rules ◐.
- **Stat caps** (`IntegerStat.Add/Set`) ✔:
  - `max = MaxOverride ?? 50`. Permanent and Temporary are each clamped to `max`; if Permanent+Temporary > max, Temporary is reduced.
  - Overrides come from abilities (`Ability.SetMaxStats`): **Behemoth 100/100, Giant Tortoise 50/100, Cuckoo Baby 1/1**.
- **Death**:
  - `MarkDeadSystem.Damage` marks pets at ≤ 0 HP.
  - `IsAlive = !Dead && !Destroyed` (MinionModel +0xb0/+0xb1).
  - Faint-family triggers: `TriggerBeforeDeathSystem` (BeforeFaint), `TriggerAllFaintSystem`, `TriggerKillSystem` (knockout).
  - When dead pets actually leave the board: `CleanupBoardModelSystem` / `DestroySystem` ◐.
- **Mana** (`ReleaseManaSystem`, `ChangeMinionManaMutator`, `SpendMinionManaMutator`) ◐.
- **Trumpets** (`TrumpetsMutator.SummonTrumpetMinion`, `.Force`, `.Trade`) ◐.
- **Swallow / throw** (`ThrowMinionMutator`, `EffectSwallow*`) ◐.

## 10. What still needs reading before Phase 2 implements it
Marked ◐ above. All these functions are already decompiled and in the local evidence; they need line-by-line reading, not new
extraction:
- limit-window reset;
- whether a failed effect consumes a use;
- dead-pet removal timing;
- summon push rules;
- jump attack;
- swallow;
- mana;
- trumpets;
- `GetSortedTriggerMinions` (where `RandomTieBreak` is drawn: per pet or per ability).
