# Triggers (CreateTrigger / CreateTriggers factories)

Each factory returns a `Triggers.Trigger*` object carrying a `TriggerEnum` value and a `MinionFinder` filter that decides
whose events match (`Other=false` = the ability's own pet; `Other=true` = another pet; `Team`, `Direction`, `Distance` narrow it).
`Uses` = how many ability definitions call that factory. `(folded ctor)` = the trigger class constructor is shared by identical-code folding,
so the class name is not shown; the TriggerEnum value is still exact.

| Factory | Trigger class | TriggerEnum | Finder filter | Uses |
|---|---|---|---|---|
| StartBattle | (folded ctor) | StartBattle (4) | — | 155 |
| BeforeFaint | TriggerBeforeDeath | ThisDied (18) | Other=false | 87 |
| EndTurn | (folded ctor) | EndTurn (3) | — | 69 |
| Faint | TriggerDeath | ThisDied (18) | Other=false | 59 |
| StartTurn | (folded ctor) | StartTurn (2) | — | 52 |
| BeforeAttack | TriggerBeforeAttack | BeforeThisAttacks (16) | Other=false | 34 |
| ThisSold | TriggerSell | ThisSold (7) | Other=false | 26 |
| BeforeStartBattle | (folded ctor) | BeforeStartBattle (98) | — | 19 |
| FriendSummoned | TriggerSummon | FriendSummoned (13) | Other=true, Team=Friendly | 18 |
| Hurt | TriggerHurt | ThisHurt (23) | Other=false | 18 |
| FriendFaints | TriggerDeath | FriendDied (21) | Other=true, Team=Friendly | 15 |
| ThisBought | TriggerPlayMinion | ThisBought (6) | Other=false | 15 |
| Composite | TriggerComposite | Composite (1) | — | 11 |
| Composite | TriggerComposite | — (param_1) | — | 11 |
| EmptyFrontSpace | TargetsAbsolute | StartTurn (2) | FrontDistance=0 | 11 |
| FriendTransformed | TriggerTransform | FriendTransformed (136) | Other=true, Team=Friendly | 9 |
| ShopRolled | (folded ctor) | ShopRolled (28) | — | 9 |
| BeforeBreak | TriggerBeforeDeath | ThisBroke (84) | Other=false | 8 |
| FoodEatenByThis | TriggerPlayedSpellOn | FoodEatenByThis (31) | Other=false | 8 |
| ThisCharged | TriggerCharged | — (param_1) | Other=false | 8 |
| AdjacentFriendAttacked | TriggerAttack | AdjacentFriendAttacked (201) | — | 7 |
| EnemyAttacked | TriggerAttack | FriendAttacked (53) | Other=true, Team=Enemy | 7 |
| Knockout | TriggerKill | ThisKilled (22) | Other=false | 7 |
| BeforeFirstAttack | TriggerBeforeAttack | BeforeFirstAttack (218) | Other=false | 6 |
| BeforeFriendAttacks | TriggerBeforeAttack | BeforeFriendAttacks (17) | Other=true, Team=Friendly | 6 |
| FriendBought | TriggerPlayMinion | FriendBought (34) | Other=true, Team=Friendly | 6 |
| ThisSummoned | TriggerSummon | ThisSummoned (10) | Other=false | 6 |
| BeforeSell | TriggerBeforeSell | ThisSold (7) | Other=false | 5 |
| FriendAheadDied | TriggerBeforeDeath | FriendAheadDied (29) | Other=true, Team=Friendly, Distance=1, DistanceOperator=Equal, Direction=Ahead | 5 |
| FriendSold | TriggerSell | FriendSold (32) | Other=true, Team=Friendly | 5 |
| ThisTransformed | TriggerTransform | ThisTransformed (14) | Other=false | 5 |
| AfterAttack | TriggerAttack | ThisAttacked (50) | Other=false | 4 |
| AnyoneAttacks | TriggerAttack | AnyoneAttack (126) | Team=Friendly | 4 |
| EnemyHurt | TriggerHurt | EnemyHurt (24) | Other=true, Team=Enemy | 4 |
| FoodBought | (folded ctor) | FoodBought (8) | — | 4 |
| FriendAheadAttacks | TriggerAttack | FriendAheadAttacked (33) | Other=true, Team=Friendly, Distance=1, DistanceOperator=Equal, Direction=Ahead | 4 |
| FriendlyGainsPerk | TriggerPerkGained | FriendlyGainsPerk (105) | Team=Friendly | 4 |
| FriendlyLeveledUp | TriggerLevelup | FriendlyLeveledUp (36) | Team=Friendly | 4 |
| GainPerk | TriggerPerkGained | ThisGainedPerk (48) | Other=false | 4 |
| AfterFirstAttack | TriggerAttack | ThisFirstAttack (214) | Other=false, AttackCountThisTurn=1, AttackCountThisTurnOperator=Equal | 3 |
| EnemySummoned | TriggerSummon | EnemySummoned (12) | Other=true, Team=Enemy | 3 |
| FriendAheadHurt | TriggerHurt | FriendAheadHurt (41) | Other=true, Team=Friendly, Distance=1, DistanceOperator=Equal, Direction=Ahead | 3 |
| FriendGainedAilment | TriggerPerkGained | FriendGainsAilment (81) | Other=true, Team=Friendly | 3 |
| FriendHurt | TriggerHurt | FriendHurt (35) | Other=true, Team=Friendly | 3 |
| FriendJumped | TriggerPushed | FriendJumped (110) | Other=true, Team=Friendly | 3 |
| FriendLeveledUp | TriggerLevelup | FriendLeveledUp (26) | Other=true, Team=Friendly | 3 |
| FriendLostPerk | TriggerPerkLost | FriendLostPerk (161) | Other=true, Team=Friendly | 3 |
| ThisChargedByEat | (folded ctor) | — | — | 3 |
| BeeSummoned | TriggerSummon | BeeSummoned (168) | Other=true, Team=Friendly, IncludeTypes=arg | 2 |
| BeforeTransform | TriggerBeforeTransform | None (0) | Other=false | 2 |
| Break | TriggerDeath | ThisBroke (84) | Other=false | 2 |
| EnemyDied | TriggerDeath | EnemyDied (40) | Other=true, Team=Enemy | 2 |
| EnemyFaint | TriggerDeath | EnemyFaint (220) | Other=true, Team=Enemy | 2 |
| EnemyPushed | TriggerPushed | EnemyPushed (15) | Other=true, Team=Enemy | 2 |
| FriendAttacked | TriggerAttack | FriendAttacked (53) | Other=true, Team=Friendly | 2 |
| FriendlyAttacked | TriggerAttack | FriendlyAttacked (191) | Team=Friendly | 2 |
| FriendlyToyBroke | TriggerDeath | FriendlyToyBroke (99) | Other=true, Health=arg, Types=arg, Team=Friendly | 2 |
| GainMana | TriggerManaGained | ThisGainedMana (120) | Other=false | 2 |
| GoldSpent | (folded ctor) | — | — | 2 |
| LeveledUpThis | TriggerLevelup | ThisLeveledUp (25) | Other=false | 2 |
| ShopFoodEatenByFriendly | TriggerPlayedSpellOn | FoodEatenByFriendly (189) | Team=Friendly | 2 |
| ShopUpgrade | (folded ctor) | ShopUpgrade (5) | — | 2 |
| ThisChargedByRoll | (folded ctor) | — | — | 2 |
| AllEnemiesFainted | (folded ctor) | AllEnemiesDied (52) | — | 1 |
| AllFriendsFainted | (folded ctor) | AllFriendsFainted (97) | — | 1 |
| AnyoneBehindHurt | TriggerHurt | AnyoneBehindHurt (207) | Other=true, Team=Friendly, Direction=Behind | 1 |
| AnyoneFlung | TriggerFlung | AnyoneFlung (179) | Other=true | 1 |
| AnyoneGainedAilment | TriggerPerkGained | AnyoneGainedAilment (172) | — | 1 |
| AnyoneHurt | TriggerHurt | AnyoneHurt (190) | — | 1 |
| AnyoneJumped | TriggerPushed | AnyoneJumped (208) | — | 1 |
| AppleEatenByThis | TriggerPlayedSpellOn | AppleEatenByThis (38) | Other=false | 1 |
| BeforeAnyAttack | TriggerBeforeAttack | BeforeAnyAttack (226) | Team=Friendly | 1 |
| BeforeFriendFaints | TriggerBeforeDeath | FriendDied (21) | Other=true, Team=Friendly | 1 |
| BeforeFriendSold | TriggerBeforeSell | SellFriend (129) | Other=true, Team=Friendly | 1 |
| CornEatenByFriend | TriggerPlayedSpellOn | CornEatenByFriend (178) | Other=true, Team=Friendly, HealthEven=28 | 1 |
| EnemyDiedEarly | TriggerDeathEarly | EnemyDied (40) | Other=true, Team=Enemy | 1 |
| EnemyGainedAilment | TriggerPerkGained | EnemyGainedAilment (121) | Other=true, Team=Enemy | 1 |
| FriendBoughtWithTier1 | TriggerPlayMinion | Tier1FriendBought (30) | Other=true, Team=Friendly, Tier=arg, TierOperator=Equal | 1 |
| FriendGainedExperience | TriggerExpGained | FriendGainedExp (181) | Other=true, Team=Friendly | 1 |
| FriendlyGainedStrawberry | TriggerPerkGained | FriendlyGainedStrawberry (187) | Team=Friendly | 1 |
| FriendSoldWithLevelMax | TriggerSell | Level3FriendSold (135) | Other=true, Team=Friendly, Level=3, LevelOperator=Equal | 1 |
| GainAilment | TriggerPerkGained | ThisGainedAilment (123) | Other=false | 1 |
| GainPerkOrAilment | TriggerPerkGained | ThisGainedPerkOrAilment (88) | Other=false | 1 |
| HurtEarly | TriggerHurtEarly | ThisHurt (23) | Other=false | 1 |
| OtherAbilityActivated | TriggerPetActivated | FriendlyAbilityActivated (195) | — | 1 |
| PetLostPerk | TriggerPerkLost | PetLostPerk (217) | — | 1 |
| PetSold | TriggerSell | PetSold (215) | Other=true, Team=Friendly | 1 |
| AdjacentFriendHurt | TriggerHurt | AdjacentFriendsHurt (205) | — | 0 |
| AnyLeveledUp | TriggerLevelup | AnyLeveledUp (27) | — | 0 |
| BeforeAdjacentFriendAttacked | TriggerBeforeAttack | BeforeAdjacentFriendAttacked (202) | — | 0 |
| BeforeAdjacentFriendDies | TriggerBeforeDeath | AdjacentFriendsDie (39) | Other=true, Team=Friendly, Distance=1, DistanceOperator=Equal, Direction=Both | 0 |
| BeforeAttackEarly | TriggerBeforeAttackEarly | BeforeThisAttacks (16) | Other=false | 0 |
| BeforeFriendlyAttack | TriggerBeforeAttack | BeforeFriendlyAttack (219) | Other=true, Team=Friendly | 0 |
| BeforeNormalAttack | TriggerBeforeAttack | BeforeThisAttacksNormally (233) | Other=false | 0 |
| BeforePetFaints | TriggerBeforeDeath | PetDied (194) | Other=true | 0 |
| BeforeRoll | (folded ctor) | — | — | 0 |
| EnemyAbilityActivated | TriggerPetActivated | EnemyAbilityActivated (198) | — | 0 |
| FriendAheadGainedHealth | TriggerHealthGained | FriendAheadGainedHealth (200) | Other=true, Team=Friendly, Distance=1, DistanceOperator=Equal, Direction=Ahead | 0 |
| FriendFlung | TriggerFlung | FriendFlung (169) | Other=true, Team=Friendly | 0 |
| FriendGainedAttack | TriggerBuffGained | FriendGainedHealth (114) | Team=Friendly, Other=true | 0 |
| FriendGainedHealth | TriggerBuffGained | FriendGainedHealth (114) | Team=Friendly, Other=true | 0 |
| FriendGainedPerk | TriggerPerkGained | FriendGainsPerk (89) | Other=true, Team=Friendly | 0 |
| FriendGainedStrawberry | TriggerPerkGained | FriendGainedStrawberry (164) | Other=true, Team=Friendly | 0 |
| FriendHurtOrFaint | TriggerHurt | Composite (1) | Other=true, Team=Friendly | 0 |
| FriendLostStrawberry | TriggerPerkLost | FriendLostStrawberry (163) | Other=true, Team=Friendly | 0 |
| FriendlyAbilityActivated | TriggerPetActivated | FriendlyAbilityActivated (195) | — | 0 |
| FriendlyGainedExperience | TriggerExpGained | FriendlyGainedExp (193) | Team=Friendly | 0 |
| FriendlyToySummoned | TriggerSummon | FriendlyToySummoned (100) | Other=true, Health=arg, Types=arg, Team=Friendly | 0 |
| FriendSpendsAttack | (folded ctor) | — | — | 0 |
| FriendSpendsAttackOrHealth | TriggerComposite | Composite (1) | — | 0 |
| FriendSpendsHealth | (folded ctor) | — | — | 0 |
| FriendSummonedInBattle | TriggerSummon | FriendSummoned (13) | Other=true, Team=Friendly | 0 |
| FriendTransformedInBattle | TriggerTransform | FriendTransformed (136) | Other=true, Team=Friendly | 0 |
| FriendWithSiblingSold | TriggerSell | FriendSold (32) | Other=true, Team=Friendly | 0 |
| GainAttack | TriggerBuffGained | ThisGainedAttack (115) | Other=false | 0 |
| GainExperience | TriggerExpGained | GainExp (180) | Other=false, Team=Friendly | 0 |
| GainHealth | TriggerBuffGained | ThisGainedHealth (116) | Other=false | 0 |
| HurtOrBeforeFaint | TriggerHurt | ThisHurt (23) | Other=false | 0 |
| HurtOrFaint | TriggerHurt | ThisHurt (23) | Other=false | 0 |
| KnockoutEnemy | TriggerKill | ThisKilledEnemy (127) | Other=false, Team=Enemy | 0 |
| LostAttack | TriggerLostAttack | LostAttack (203) | — | 0 |
| OtherSummoned | TriggerSummon | OtherSummoned (11) | Other=true | 0 |
| PerkLost | TriggerPerkLost | ThisLostPerk (49) | Other=false | 0 |
| PetGainedAilment | TriggerPerkGained | PetGainedAilment (216) | — | 0 |
| ShopFoodEatenByFriend | TriggerPlayedSpellOn | FoodEatenByFriend (188) | Other=true, Team=Friendly | 0 |
| ShopFoodEatenByThis | TriggerPlayedSpellOn | ShopFoodEatenByThis (192) | Other=false | 0 |
| ShopRewardStocked | (folded ctor) | ShopRewardStocked (119) | — | 0 |
| SpendAttackBase | TriggerSpendAttack | — (param_1) | — | 0 |
| SpendHealthBase | TriggerSpendHealth | — (param_1) | — | 0 |
| StartBattleEnded | (folded ctor) | — | — | 0 |
| StartOfBattleOrTransformed | TriggerTransform | ThisTransformed (14) | Other=false | 0 |
| StartTurnOrBattle | TriggerComposite | StartBattleOrTurn (96) | — | 0 |
| ThisBoughtOrToyBroke | TriggerPlayMinion | ThisBought (6) | Other=true, Health=arg, Types=arg | 0 |
| ThisInfront | TriggerInfront | None (0) | Other=false | 0 |
| ThisNotInfront | TriggerInfront | None (0) | Other=false | 0 |
| ThisSpendsAttack | (folded ctor) | — | — | 0 |
| ThisSpendsHealth | (folded ctor) | — | — | 0 |
| ToyBroke | TriggerDeath | ToyBroke (82) | Other=true, Health=arg, Types=arg | 0 |
| ToySummoned | TriggerSummon | ToySummoned (83) | Other=true, Health=arg, Types=arg | 0 |
