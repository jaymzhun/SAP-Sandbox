# Event scheduler (verified against the running game)

Source: decompiled `SystemManager` / `BoardSystemCoordinator`, plus Frida traces of the game's own resolver. Every
`BoardSystemCoordinator.TryExecute` (execution start/end, with the coordinator's pending count) and `TryAdd` (enqueue) was
recorded during 6 battles. Game build 26131463.

## Model
1. **Subscriptions.** `BoardResolver.get_AllSystems` creates 170 systems in a fixed order (table below). Each gets a
   `BoardSystemCoordinator` with its own pending queue and a `SubscribedTo` predicate (the event type in its `BoardSystem<T>` /
   `BoardMutator<T>` / `GreedyBoardSystem<T>` base). A new event is offered to every coordinator, and each one whose
   predicate matches enqueues it. One event can wait in several queues: `PhaseStartBattle` goes to #9, #109, #124, #150,
   #156, #167 and #169.
2. **Scheduling.** Each step runs the **lowest-numbered coordinator that has pending events**, then rescans from the top.
   - Executions never nest.
   - Everything an execution creates is only enqueued, never run immediately.
3. **Consumption.**
   - Most systems take one event per execution.
   - Greedy systems take their whole batch: `CheckAuraSystem`, `DestroySystem`, `TriggerAllFaintSystem`, `TriggerEmptyFrontSystem.OnDestroy/OnRemove`, `RollShopDoSystem`.
   - The `*.All` systems (`TriggerMinionsSystem.All`, `TriggerAbilitySystem.All`, `ActivateAbilityTrySystem.All`) take a group per execution. This is why abilities triggered by the same moment resolve as one sequence.
   - The exact grouping key (`PeekNext`) is still to be read.
4. **Phases.** Phase events (`PhaseTrade`, `PhaseMove`, …) are created by `PhaseManagerSystem` (#169, the very last system).
   So a phase only advances once every other queue is empty.

## Verification
| Battle | Executions | Lowest-index violations | Nested executions | Pending-count mismatches |
|---|---|---|---|---|
| Ant+Cricket vs Fish+Elephant | 696 | 0 | 0 | 0 |
| corpus #2 (5v5) | 1298 | 0 | 0 | 0 |
| corpus #10 (5v3) | 445 | 0 | 0 | 0 |
| corpus #19 (4v4) | 428 | 0 | 0 | 0 |
| corpus #20 (5v3) | 1073 | 0 | 0 | 0 |
| corpus #30 (4v4) | 974 | 0 | 0 | 0 |

How the counts were checked: each coordinator's own `Count` at entry was compared with a replay of all enqueues and consumptions.

## Event wrappers
Mutating actions are wrapped as `Try<E>` → `Do<E>` → `Done<E>` (or `IFail<E>`). Each stage is a separate event handled by a different system:
- `Try<DamageMinion>` → `DamageAttemptMutator` #16 (the damage pipeline);
- `Done<DamageMinion>` → `MarkDeadSystem.Damage` #14, `TriggerHurtSystem` #106 and `MarkDamageTakenMutator` #147.

So "who reacts first" falls out of the table order.

## The 170 systems, in scheduling order
| # | System | Handles |
|---|---|---|
| 0 | Systems.PhaseInitiateGroupSystem | BoardSystem&lt;InitiatePhaseGroupEvent&gt; |
| 1 | Systems.EventCollecterSystem<BoardEvents.MinionJumpAttackStart> | BoardSystem&lt;MinionJumpAttackStart&gt; |
| 2 | Systems.EventCollecterSystem<BoardEvents.PlayMinionResult> | BoardSystem&lt;PlayMinionResult&gt; |
| 3 | Systems.EventCollecterSystem<BoardEvents.ChargedMinionPartially> | BoardSystem&lt;ChargedMinionPartially&gt; |
| 4 | Systems.EventCollecterSystem<BoardEvents.RollShopResult> | BoardSystem&lt;RollShopResult&gt; |
| 5 | Systems.EventCollecterSystem<BoardEvents.ChangeFreeRolls> | BoardSystem&lt;ChangeFreeRolls&gt; |
| 6 | Systems.EventCollecterSystem<BoardEvents.Interfaces.IDone> | BoardSystem&lt;IDone&gt; |
| 7 | Systems.EventCollecterSystem<BoardEvents.Interfaces.IFail> | BoardSystem&lt;IFail&gt; |
| 8 | Mutators.SetBattleStateMutator.Cleanup | BoardMutator&lt;PhaseHasCompletedCleanup&gt; |
| 9 | Mutators.SetBattleStateMutator.StartBattle | BoardMutator&lt;PhaseStartBattle&gt; |
| 10 | Mutators.SetBattleStateMutator.Move | BoardMutator&lt;PhaseMove&gt; |
| 11 | Mutators.SetBattleStateMutator.Trade | BoardMutator&lt;PhaseTrade&gt; |
| 12 | Mutators.EndTurnEarlyMutator | BoardMutator&lt;Try&lt;EndTurn&gt;&gt; |
| 13 | Systems.TradeSystem | BoardSystem&lt;Do&lt;MinionTrade&gt;&gt; |
| 14 | Systems.MarkDeadSystem.Damage | BoardSystem&lt;Done&lt;DamageMinion&gt;&gt; |
| 15 | Systems.MarkDeadSystem.Spend | BoardSystem&lt;IDone&lt;SpendHealth&gt;&gt; |
| 16 | Mutators.DamageAttemptMutator | BoardMutator&lt;Try&lt;DamageMinion&gt;&gt; |
| 17 | Systems.ClearSpaceSystem | BoardSystem&lt;Try&lt;ClearSpace&gt;&gt; |
| 18 | Mutators.MoveMutator | BoardMutator&lt;Do&lt;MoveMinion&gt;&gt; |
| 19 | Systems.MoveAttemptSystem | BoardSystem&lt;Try&lt;MoveMinion&gt;&gt; |
| 20 | Systems.CheckAuraSystem | GreedyBoardSystem&lt;Done&lt;MoveMinion&gt;&gt; |
| 21 | Mutators.EscapeMutator | BoardMutator&lt;Try&lt;Escape&gt;&gt; |
| 22 | Mutators.EscapeSpellMutator | BoardMutator&lt;Try&lt;EscapeSpell&gt;&gt; |
| 23 | Mutators.RemoveMinionMutator | BoardMutator&lt;Try&lt;RemoveMinion&gt;&gt; |
| 24 | Mutators.SummonMinionMutator | BoardMutator&lt;Do&lt;SummonMinion&gt;&gt; |
| 25 | Systems.SummonMinionAttemptSystem | BoardSystem&lt;Try&lt;SummonMinion&gt;&gt; |
| 26 | Mutators.SummonRelicMutator | BoardMutator&lt;Try&lt;SummonRelic&gt;&gt; |
| 27 | Mutators.DestroyMinionMutator | BoardMutator&lt;Try&lt;DestroyMinion&gt;&gt; |
| 28 | Mutators.MarkMinionDeadSystem | BoardSystem&lt;Try&lt;MarkMinionDead&gt;&gt; |
| 29 | Mutators.MarkMinionDeadMutator | BoardMutator&lt;Do&lt;MarkMinionDead&gt;&gt; |
| 30 | Systems.MinionAbilityDestroySystem | BoardSystem&lt;Try&lt;MinionAbilityDestroy&gt;&gt; |
| 31 | Systems.TriggerBeforeRollSystem | BoardSystem&lt;Try&lt;RollShop&gt;&gt; |
| 32 | Mutators.PlayedSpellOnMutator | BoardMutator&lt;Done&lt;PlayedSpellOn&gt;&gt; |
| 33 | Mutators.ForceActivateAbilitySystem | BoardSystem&lt;ForceActivateAbility&gt; |
| 34 | Mutators.ForceActivatePerkSystem | BoardSystem&lt;ForceActivatePerk&gt; |
| 35 | Mutators.RememberMinionMutator | BoardMutator&lt;Try&lt;RememberMinion&gt;&gt; |
| 36 | Mutators.RememberPerkMutator | BoardMutator&lt;Try&lt;RememberPerk&gt;&gt; |
| 37 | Mutators.UpgradeTierMutator | BoardMutator&lt;Try&lt;UpgradeTier&gt;&gt; |
| 38 | Mutators.AddMinionPowerMutator | BoardMutator&lt;Try&lt;AddMinionPower&gt;&gt; |
| 39 | Mutators.AddMinionChargeMutator | BoardMutator&lt;Try&lt;AddMinionCharge&gt;&gt; |
| 40 | Mutators.StartTurnMutator | BoardMutator&lt;Try&lt;StartTurn&gt;&gt; |
| 41 | Mutators.GainLivesMutator | BoardMutator&lt;Try&lt;GainLives&gt;&gt; |
| 42 | Mutators.RollShopMutator | BoardMutator&lt;Do&lt;RollShop&gt;&gt; |
| 43 | Mutators.GainTrumpetsMutator | BoardMutator&lt;Try&lt;GainTrumpets&gt;&gt; |
| 44 | Mutators.ChangeTrumpetsMutator | BoardMutator&lt;Do&lt;ChangeTrumpets&gt;&gt; |
| 45 | Mutators.GainRollsMutator | BoardMutator&lt;Try&lt;GainRolls&gt;&gt; |
| 46 | Mutators.PlaySpellMutator | BoardMutator&lt;Try&lt;PlaySpell&gt;&gt; |
| 47 | Mutators.ReorderMutator | BoardMutator&lt;Try&lt;ReorderMinion&gt;&gt; |
| 48 | Mutators.PushMutator | BoardMutator&lt;Try&lt;PushMinion&gt;&gt; |
| 49 | Systems.RollShopDoSystem | GreedyBoardSystem&lt;Try&lt;RollShop&gt;&gt; |
| 50 | Mutators.PermarizeMinionMutator | BoardMutator&lt;Try&lt;PermanizeMinion&gt;&gt; |
| 51 | Mutators.ShuffleMinionsMutator | BoardMutator&lt;Try&lt;ShuffleMinions&gt;&gt; |
| 52 | Mutators.SortMinionsMutator | BoardMutator&lt;Try&lt;SortMinions&gt;&gt; |
| 53 | Mutators.StealMinionPerkMutator | BoardMutator&lt;Try&lt;StealMinionPerk&gt;&gt; |
| 54 | Mutators.StealSpellMutator | BoardMutator&lt;Try&lt;StealSpell&gt;&gt; |
| 55 | Mutators.StealMinionMutator | BoardMutator&lt;Try&lt;StealMinion&gt;&gt; |
| 56 | Mutators.GainGoldMutator | BoardMutator&lt;Try&lt;GainGold&gt;&gt; |
| 57 | Mutators.SpendGoldMutator | BoardMutator&lt;Try&lt;SpendGold&gt;&gt; |
| 58 | Mutators.SpendAttackMutator | BoardMutator&lt;Try&lt;SpendAttack&gt;&gt; |
| 59 | Mutators.SpendHealthMutator | BoardMutator&lt;Try&lt;SpendHealth&gt;&gt; |
| 60 | Mutators.TransformMinionMutator | BoardMutator&lt;Try&lt;TransformMinion&gt;&gt; |
| 61 | Mutators.SetMinionStatsMutator | BoardMutator&lt;Try&lt;SetMinionStats&gt;&gt; |
| 62 | Mutators.ShuffleStatsMutator | BoardMutator&lt;Try&lt;ShuffleStats&gt;&gt; |
| 63 | Mutators.SetMinionPriceMutator | BoardMutator&lt;Try&lt;SetMinionPrice&gt;&gt; |
| 64 | Mutators.SetSpellPriceMutator | BoardMutator&lt;Try&lt;SetSpellPrice&gt;&gt; |
| 65 | Mutators.GiveMinionSellValueMutator | BoardMutator&lt;Try&lt;AddSellValue&gt;&gt; |
| 66 | Mutators.RefreshLimitMutator | BoardMutator&lt;Try&lt;RefreshLimit&gt;&gt; |
| 67 | Mutators.GiveMinionBuffMutator | BoardMutator&lt;Try&lt;BuffMinion&gt;&gt; |
| 68 | Mutators.GiveMinionPowerMutator | BoardMutator&lt;Try&lt;GiveMinionPower&gt;&gt; |
| 69 | Mutators.GiveMinionDebuffMutator | BoardMutator&lt;Try&lt;DebuffMinion&gt;&gt; |
| 70 | Mutators.ChangeMinionManaMutator | BoardMutator&lt;Try&lt;ChangeMinionMana&gt;&gt; |
| 71 | Mutators.GiveShopMinionBuffMutator | BoardMutator&lt;Try&lt;BuffShopMinion&gt;&gt; |
| 72 | Mutators.GiveShopMinionPermanentBuffMutator | BoardMutator&lt;Try&lt;BuffShopMinionPermanent&gt;&gt; |
| 73 | Mutators.GiveMinionAbilityMutator | BoardMutator&lt;Try&lt;GiveMinionAbility&gt;&gt; |
| 74 | Mutators.PerkMutator | BoardMutator&lt;Try&lt;GiveMinionPerk&gt;&gt; |
| 75 | Mutators.ChangeVictoryMutator | BoardMutator&lt;Try&lt;ChangeVictoryMax&gt;&gt; |
| 76 | Mutators.LoseMinionPerkMutator | BoardMutator&lt;Try&lt;LoseMinionPerk&gt;&gt; |
| 77 | Mutators.GiveMinionExpMutator | BoardMutator&lt;Try&lt;GiveMinionExp&gt;&gt; |
| 78 | Mutators.CopyMinionStatsMutator | BoardMutator&lt;Try&lt;CopyMinionStats&gt;&gt; |
| 79 | Mutators.CopyMinionAbilityMutator | BoardMutator&lt;Try&lt;CopyMinionAbility&gt;&gt; |
| 80 | Mutators.PlayMinionMutator | BoardMutator&lt;PlayMinion&gt; |
| 81 | Mutators.StackMinionMutator | BoardMutator&lt;Try&lt;StackMinion&gt;&gt; |
| 82 | Systems.AbilityDamageSystem | BoardSystem&lt;Try&lt;MinionAbilityDamage&gt;&gt; |
| 83 | Mutators.ReplaceMinionShopMutator | BoardMutator&lt;Try&lt;ReplaceMinionShop&gt;&gt; |
| 84 | Mutators.ReplaceSpellShopMutator | BoardMutator&lt;Try&lt;ReplaceSpellShop&gt;&gt; |
| 85 | Mutators.DiscountMutator | BoardMutator&lt;Try&lt;DiscountItems&gt;&gt; |
| 86 | Mutators.OrderMinionMutator | BoardMutator&lt;Try&lt;OrderMinion&gt;&gt; |
| 87 | Mutators.AddSpellToShopMutator | BoardMutator&lt;Try&lt;AddShopSpells&gt;&gt; |
| 88 | Mutators.AddMinionToShopMutator | BoardMutator&lt;Try&lt;AddShopMinions&gt;&gt; |
| 89 | Mutators.ForgetMutator | BoardMutator&lt;Try&lt;Forget&gt;&gt; |
| 90 | Mutators.SwapStatsMutator | BoardMutator&lt;Try&lt;SwapStats&gt;&gt; |
| 91 | Mutators.BalanceStatsMutator | BoardMutator&lt;Try&lt;BalanceStats&gt;&gt; |
| 92 | Mutators.ExchangeStatsMutator | BoardMutator&lt;Try&lt;ExchangeStats&gt;&gt; |
| 93 | Mutators.SwallowShopMutator | BoardMutator&lt;Try&lt;SwallowShop&gt;&gt; |
| 94 | Mutators.FreezeShopMutator | BoardMutator&lt;Try&lt;FreezeItem&gt;&gt; |
| 95 | Mutators.ThrowMinionMutator | BoardMutator&lt;Try&lt;MinionJumpAttack&gt;&gt; |
| 96 | Mutators.TrumpetsMutator.Force | BoardMutator&lt;Try&lt;ForceTrumpets&gt;&gt; |
| 97 | Mutators.RemoveRelicMutator | BoardMutator&lt;Try&lt;RemoveRelic&gt;&gt; |
| 98 | Mutators.OfferHardRelicsMutator | BoardMutator&lt;Try&lt;OfferHardRelics&gt;&gt; |
| 99 | Mutators.OfferChoicesMutator | BoardMutator&lt;Try&lt;OfferChoice&gt;&gt; |
| 100 | Mutators.ChooseMutator | BoardMutator&lt;Try&lt;Choose&gt;&gt; |
| 101 | Systems.AbilityEffectResultSystem | BoardSystem&lt;CastEffect&gt; |
| 102 | Systems.AbilityEffectWrapperSystem | BoardSystem&lt;IBoardEvent&gt; |
| 103 | Mutators.SpendMinionManaMutator | BoardMutator&lt;Try&lt;SpendMinionMana&gt;&gt; |
| 104 | Systems.ActivateAbilityDoSystem | BoardSystem&lt;Try&lt;AbilityActivate&gt;&gt; |
| 105 | Systems.ActivateAbilityTrySystem.All | ActivateAbilityTrySystem |
| 106 | Systems.TriggerHurtSystem | BoardSystem&lt;Done&lt;DamageMinion&gt;&gt; |
| 107 | Systems.TriggerUpgradeTierSystem | BoardSystem&lt;Done&lt;UpgradeTier&gt;&gt; |
| 108 | Systems.TriggerBeforeStartBattleSystem | BoardSystem&lt;PhaseBeforeStartBattle&gt; |
| 109 | Systems.TriggerStartBattleSystem | BoardSystem&lt;PhaseStartBattle&gt; |
| 110 | Systems.TriggerEndTurnSystem | BoardSystem&lt;Try&lt;EndTurn&gt;&gt; |
| 111 | Systems.TriggerRollSystem | BoardSystem&lt;RollShopResult&gt; |
| 112 | Systems.TriggerGainedManaSystem | BoardSystem&lt;Done&lt;ChangeMinionMana&gt;&gt; |
| 113 | Systems.TriggerGainedHealthSystem | BoardSystem&lt;Done&lt;BuffMinion&gt;&gt; |
| 114 | Systems.TriggerPetActivatedSystem | BoardSystem&lt;Done&lt;AbilityActivate&gt;&gt; |
| 115 | Systems.TriggerStockMinionSystem | BoardSystem&lt;Done&lt;AddShopMinions&gt;&gt; |
| 116 | Systems.TriggerSpendGoldSystem | BoardSystem&lt;Done&lt;SpendGold&gt;&gt; |
| 117 | Systems.TriggerGiveExpSystem | BoardSystem&lt;Done&lt;GiveMinionExp&gt;&gt; |
| 118 | Systems.TriggerLevelUp | BoardSystem&lt;Done&lt;GiveMinionExp&gt;&gt; |
| 119 | Systems.TriggerPlaySpellOnSystem | BoardSystem&lt;Done&lt;PlayedSpellOn&gt;&gt; |
| 120 | Systems.TriggerPlaySpellSystem | BoardSystem&lt;Done&lt;PlaySpell&gt;&gt; |
| 121 | Systems.TriggerPerkGainedSystem | BoardSystem&lt;Done&lt;GiveMinionPerk&gt;&gt; |
| 122 | Systems.TriggerStealPerkSystem | BoardSystem&lt;Done&lt;StealMinionPerk&gt;&gt; |
| 123 | Systems.TriggerPerkLostSystem | BoardSystem&lt;Done&lt;PerkLost&gt;&gt; |
| 124 | Systems.TriggerInfrontSystem | BoardSystem&lt;IBoardEvent&gt; |
| 125 | Systems.TriggerBeforeAttackSystem | BoardSystem&lt;Try&lt;MinionTrade&gt;&gt; |
| 126 | Systems.TriggerAttackSystem.Trade | BoardSystem&lt;Done&lt;MinionTrade&gt;&gt; |
| 127 | Systems.TriggerAttackSystem.JumpAttack | BoardSystem&lt;Done&lt;MinionJumpAttack&gt;&gt; |
| 128 | Systems.TriggerKillSystem | BoardSystem&lt;Done&lt;MarkMinionDead&gt;&gt; |
| 129 | Systems.TriggerTransformSystem | BoardSystem&lt;Done&lt;TransformMinion&gt;&gt; |
| 130 | Systems.TriggerSummonSystem | BoardSystem&lt;Done&lt;SummonMinion&gt;&gt; |
| 131 | Systems.TriggerSummonFailSystem | BoardSystem&lt;IFail&lt;SummonMinion&gt;&gt; |
| 132 | Systems.TriggerSummonRelicSystem | BoardSystem&lt;Done&lt;SummonRelic&gt;&gt; |
| 133 | Systems.TriggerPushMinionSystem | BoardSystem&lt;Done&lt;PushMinion&gt;&gt; |
| 134 | Systems.TriggerPushMinionFailSystem | BoardSystem&lt;IFail&lt;PushMinion&gt;&gt; |
| 135 | Systems.TriggerJumpAttackSystem | BoardSystem&lt;Done&lt;MinionJumpAttack&gt;&gt; |
| 136 | Systems.TriggerBeforeSellSystem | BoardSystem&lt;Try&lt;SellMinion&gt;&gt; |
| 137 | Systems.TriggerSellSystem | BoardSystem&lt;Done&lt;SellMinion&gt;&gt; |
| 138 | Systems.TriggerChargedMinionSystem | BoardSystem&lt;Done&lt;ChargedMinion&gt;&gt; |
| 139 | Systems.TriggerDestroyEarlySystem | BoardSystem&lt;Done&lt;DestroyMinion&gt;&gt; |
| 140 | Systems.TriggerDestroySystem | BoardSystem&lt;Done&lt;DestroyMinion&gt;&gt; |
| 141 | Mutators.AbilityCleanupMutator | BoardMutator&lt;Done&lt;AbilityActivate&gt;&gt; |
| 142 | Systems.TriggerBeforeDeathSystem | BoardSystem&lt;Done&lt;MarkMinionDead&gt;&gt; |
| 143 | Systems.TriggerMinionsSystem.All | TriggerMinionsSystem |
| 144 | Systems.TriggerAbilitySystem.All | TriggerAbilitySystem |
| 145 | Mutators.ReleaseManaSystem | BoardMutator&lt;Try&lt;ReleaseMana&gt;&gt; |
| 146 | Systems.DestroySystem | GreedyBoardSystem&lt;Done&lt;MarkMinionDead&gt;&gt; |
| 147 | Mutators.MarkDamageTakenMutator | BoardMutator&lt;Done&lt;DamageMinion&gt;&gt; |
| 148 | Systems.TriggerEmptyFrontSystem.OnDestroy | GreedyBoardSystem&lt;IDone&lt;DestroyMinion&gt;&gt; |
| 149 | Systems.TriggerEmptyFrontSystem.OnRemove | GreedyBoardSystem&lt;IDone&lt;RemoveMinion&gt;&gt; |
| 150 | Systems.TriggerEmptyFrontSystem.OnStartBattle | BoardSystem&lt;PhaseStartBattle&gt; |
| 151 | Mutators.CountdownMinionMutator | BoardMutator&lt;Try&lt;CountdownMinion&gt;&gt; |
| 152 | Mutators.GainRewardMutator | BoardMutator&lt;Try&lt;GainReward&gt;&gt; |
| 153 | Mutators.SellMinionMutator | BoardMutator&lt;Try&lt;SellMinion&gt;&gt; |
| 154 | Mutators.EndTurnMutator | BoardMutator&lt;Try&lt;EndTurn&gt;&gt; |
| 155 | Systems.TriggerStartTurnSystem | BoardSystem&lt;Done&lt;StartTurn&gt;&gt; |
| 156 | Systems.TriggerStartOfBattleEnded | BoardSystem&lt;PhaseStartBattle&gt; |
| 157 | Systems.TriggerPlaySystem | BoardSystem&lt;PlayMinionResult&gt; |
| 158 | Mutators.TrumpetsMutator.Destroy | BoardMutator&lt;Done&lt;DestroyMinion&gt;&gt; |
| 159 | Mutators.TrumpetsMutator.Remove | BoardMutator&lt;Done&lt;RemoveMinion&gt;&gt; |
| 160 | Mutators.TrumpetsMutator.Trade | BoardMutator&lt;PhaseTrade&gt; |
| 161 | Systems.TradePrepareSystem | BoardSystem&lt;Try&lt;MinionTrade&gt;&gt; |
| 162 | Systems.TradePhaseSystem | BoardSystem&lt;PhaseTrade&gt; |
| 163 | Systems.TriggerAllFaintSystem | GreedyBoardSystem&lt;Done&lt;DestroyMinion&gt;&gt; |
| 164 | Systems.MovePhaseSystem | BoardSystem&lt;PhaseMove&gt; |
| 165 | Systems.RollPriorityMutator | BoardSystem&lt;PhaseHasCompletedCleanup&gt; |
| 166 | Systems.CleanupBoardModelSystem | BoardMutator&lt;PhaseHasCompletedCleanup&gt; |
| 167 | Systems.EventCollecterSystem | BoardSystem&lt;IBoardEvent&gt; |
| 168 | Mutators.FinalCleanupMutator | BoardMutator&lt;PhaseFinalCleanup&gt; |
| 169 | Systems.PhaseManagerSystem | BoardSystem&lt;PhaseEvent&gt; |
