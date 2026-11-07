# Perk and ailment abilities (AbilityConstants.CreatePerks)

Perks and ailments that *do something on a trigger* are ordinary abilities, looked up through `PerkConstants.GetPerk(perk).Abilities`
and run by `BoardExtensions.TryTriggerMinion` right after the holder's own abilities. Passive damage perks (armour, attack bonuses,
Coconut, Peanut, ...) are not abilities — they live in the damage pipeline (see BATTLE-LOOP.md §7).

| Ability | Builder | Trigger | Text (level 1) | Mechanics |
|---|---|---|---|---|
| AcidAbility | Perks |  | Take double damage, twice. |  |
| AmbrosiaAbility | Perks |  | Block ailment or 8 {} damage, once. |  |
| BaguetteAbility | Perks | BeforeAttack | Remove the front-most enemy perk, once. | SetPerk(64); trigger:BeforeAttack(); SetAlwaysActivateAllPairs(1); target:Self(); effect:LosePerk(0); EffectLosePerk__SetRenderLost(0); target:EnemyFirst(); EffectRememberMinion__RememberPower(1); effect:LosePerk(0) |
| BananaAbility | Perks | Faint | Summon one 4/4 Monkey. | SetPerk(25); trigger:Faint(); target:Self(); effect:Summon(46) |
| BirthdayCakeAbility | Perks | EndTurn | Increase sell value by 1. | SetPerk(44); trigger:EndTurn(); target:Self(); effect:GainSellValue(1) |
| BlackberryAbility | Perks | GainPerk | Gain +1/+2. | SetPerk(89); trigger:GainPerk(); target:Self(); effect:GiveBuff(1, 2) |
| BloatedAbility | Perks |  | Can't gain perk, once. | SetPerk(120) |
| BlueBerriesAbility | Perks |  | Prioritize this for enemy random abilities. |  |
| BokChoyAbility | Perks | Faint | Gain +3 when this would faint, once. | SetPerk(111); trigger:Faint() |
| BreadAbility | Perks | EndTurn | Gain +7/+1. | SetPerk(41); trigger:EndTurn(); target:Self(); effect:GiveBuff(0, 7, 1) |
| BrusselSproutAbility | Perks |  | Block being pushed or 5 {} damage, once. |  |
| BurnAbility | Perks | AnyoneAttacks | Take 6 damage, once. | SetPerk(57); trigger:AnyoneAttacks(0); SetAlwaysActivateAllPairs(1); target:Self(); effect:LosePerk(0); target:Self(); effect:Damage(6) |
| CaramelAbility | Perks | BeforeAttack | Combine friendly Caramels to deal 3 damage each to the most healthy enemy, once. | SetPerk(67); trigger:BeforeAttack(); CreateCondition__HasLivingOrDeadMininon(); SetAlwaysActivateAllPairs(1); target:Self(); EffectDamage__SetIgnorePerks(); target:Scan(0, 5); effect:LosePerk(0); EffectLosePerk__SetInclu |
| CarrotAbility | Perks | EndTurn | Gain +1/+1. | SetPerk(15); trigger:EndTurn(); target:Self(); effect:GiveBuff(1, 1, 0) |
| CashewNutAbility | Perks | BeforeAttack | Deal 2 damage to the second enemy, once. | SetPerk(115); trigger:BeforeAttack(); SetAlwaysActivateAllPairs(1); target:Self(); effect:LosePerk(0); EffectLosePerk__SetRenderLost(0); target:EnemySecond(); effect:Damage(2) |
| CauliflowerAbility | Perks | Knockout | If still standing, gain permanent +1/+1, once. | SetPerk(71); trigger:Knockout(); SetAlwaysActivateAllPairs(1); target:Self(); effect:LosePerk(0); EffectLosePerk__SetRenderLost(0); target:Self(); effect:GiveBuff(1, 1, 0); EffectGiveBuff__SetFuture(1) |
| CheeseAbility | Perks |  | Attack with at least 15 attack, once. |  |
| CherriesAbility | Perks | BeforeStartBattle | Gain 2 trumpets and remove perk. | SetPerk(7); trigger:BeforeStartBattle(); target:Self(); effect:LosePerk(0); effect:GainTrumpets(2) |
| ChiliAbility | Perks |  | Attack second enemy for 5 {} damage. |  |
| ChocolateCakeAbility | Perks | BeforeAttack | Gain +3 experience and faint. | SetPerk(30); trigger:BeforeAttack(); CreateCondition__IsAlive(); target:Self(); effect:GiveExp(3); effect:Destroy(); EffectDestroyMinion__RemoveProjectile(); effect:Composite(… |
| ChurrosAbility | Perks |  | Activate ability before other pets with the same trigger. |  |
| CocoaBeanAbility | Perks | BeforeAttack | Transform into a random summon pet. | SetPerk(94); trigger:BeforeAttack(); target:Self(); effect:Transform(…); AddRelatedMinions(…,0xb)) |
| CoconutAbility | Perks |  | Block damage, once. |  |
| CodRoeAbility | Perks | Faint | Summon one 2/undefined Fish. | SetPerk(104); trigger:Faint(); target:Self(); effect:Summon(32) |
| ConfusedAbility | Perks | BeforeAttack | Transform into a pet from one tier below, once. | SetPerk(118); trigger:BeforeAttack(); SetInteruptor(2); target:Self(); CreateCondition__IsReversed(); effect:Transform(…); EffectTransform__SetRemovePerkIf(118); target:Self(); CreateCondition__IsReversed(); effect:Trans |
| CowardlyAbility | Perks | BeforeAttack | Move to the back, once. | SetPerk(124); SetAlwaysActivateAllPairs(1); trigger:BeforeAttack(); target:Self(); effect:LosePerk(0); target:TriggerTarget(); CreateCondition__IsReversed(); effect:Push(0, 5); target:Self(); CreateCondition__IsReversed( |
| CroissantAbility | Perks | EndTurn | Gain +1. | SetPerk(20); trigger:EndTurn(); target:Self(); effect:GiveBuff(1, 0, 0) |
| CucumberAbility | Perks | EndTurn | Gain +1. | SetPerk(19); trigger:EndTurn(); target:Self(); effect:GiveBuff(0, 1) |
| CurseAbility | Perks | BeforeFaint | Make one random friend Curse. | SetPerk(119); trigger:BeforeFaint(); SetInteruptor(2); target:Enemies(…; target:OtherFriendly(0); target:Reversed(…, …; effect:GivePerk(119, 0) |
| DeadBreadAbility | Perks | Faint | Summon ANY one tier 1 <b>Faint</b> pet. | SetPerk(86); trigger:Faint(); target:Self(); effect:Summon(…) |
| DeafAbility | Perks |  | Prevent ability from activating. |  |
| DoughnutAbility | Perks |  | Prioritize this for friendly random abilities. |  |
| DrowsyAbility | Perks |  | Attack with half damage, once. |  |
| DurianAbility | Perks | BeforeAttack | Reduce the most healthy enemy by 33% health, once. | SetPerk(45); trigger:BeforeAttack(); SetAlwaysActivateAllPairs(1); target:Self(); effect:LosePerk(0); EffectLosePerk__SetRenderLost(0); target:HighestHealthEnemy(); effect:SetStats(0, …; EffectSetStats__SetSourcePerk(45) |
| EasterEggAbility | Perks | Faint | Summon one 3/3 Bunny that attacks for double damage. | SetPerk(51); trigger:Faint(); target:Self(); effect:Summon(384); EffectSummon__SetAttack(3); EffectSummon__SetHealth(3) |
| EggAbility | Perks | BeforeAttack | Deal 2 damage to target, once. | SetPerk(24); trigger:BeforeAttack(); CreateCondition__IsTargetAlive(); SetAlwaysActivateAllPairs(1); target:Self(); effect:LosePerk(0); EffectLosePerk__SetRenderLost(0); target:TriggerTarget(); effect:Damage(2) |
| EggPlantAbility | Perks | BeforeStartBattle | Push opposite enemy 1 space forward. | SetPerk(38); trigger:BeforeStartBattle(); SetAlwaysActivateAllPairs(1); target:Mirror(); effect:Push(1, 1, 0) |
| EucalyptusAbility | Perks |  | Block 4 enemy {} damage, once. |  |
| FairyDustAbility | Perks | EmptyFrontSpace | Jump to the front and gain +2 mana, once. | SetPerk(49); trigger:EmptyFrontSpace(); CreateCondition__IsAlive(); target:Self(); effect:LosePerk(0); target:Self(); effect:Push(0, 5, 1); target:Self(); effect:GiveMana(2) |
| FigAbility | Perks | BeforeAttack | Deal 4 damage to the lowest health enemy, once. | SetPerk(46); trigger:BeforeAttack(); target:Self(); effect:LosePerk(0); EffectLosePerk__SetRenderLost(0); target:LowestHealthEnemy(1); effect:Damage(4) |
| FortuneCookieAbility | Perks |  | Attack has 4602678819172647000% chance to deal double damage. |  |
| FrozenAbility | Perks |  | Take +5 {} damage, once. |  |
| GarlicAbility | Perks |  | Takes 2 less {} damage. |  |
| GeecheeRedPeaAbility | Perks | BeforeAttack | Remove 5 attack from target, once. | SetPerk(125); trigger:BeforeAttack(); target:Self(); effect:LosePerk(0); EffectLosePerk__SetRenderLost(0); target:TriggerTarget(); effect:RemoveAttack(5) |
| GingerbreadManAbility | Perks | BeforeStartBattle | Gain +1 experience. | SetPerk(52); trigger:BeforeStartBattle(); target:Self(); effect:GiveExp(1) |
| GoldenEggAbility | Perks | BeforeAttack | Deal 6 damage to target, once. | SetPerk(47); trigger:BeforeAttack(); CreateCondition__IsTargetAlive(); SetAlwaysActivateAllPairs(1); target:Self(); effect:LosePerk(0); EffectLosePerk__SetRenderLost(0); target:TriggerTarget(); effect:Damage(6) |
| GrapesAbility | Perks | StartTurn | Gain +1 gold. | SetPerk(16); trigger:StartTurn(); effect:GainGold(1) |
| GrosMichelBananaAbility | Perks | BeforeAttack | Transform into an Ant. | SetPerk(103); trigger:BeforeAttack(); target:Self(); effect:Transform(0); effect:LosePerk(0); effect:Composite(…; AddRelatedMinions(…) |
| GuavaAbility | Perks |  | Block 3 {} damage, and attack for +3 {} damage, once. |  |
| HealthPotionAbility | Perks | BeforeStartBattle | Give the front-most friendly pet +2. | SetPerk(58); trigger:BeforeStartBattle(); target:FriendlyFront(); effect:GiveBuff(…, …, 0) |
| HoneyAbility | Perks | Faint | Summon one 1/1 Bee. | SetPerk(8); trigger:Faint(); target:Self(); effect:Summon(4) |
| HoneydewMelonAbility | Perks |  | Block 10 {} damage, and attack for +5 {} damage, once. |  |
| IceCreamAbility | PerksDraft | BeforeStartBattle | Transform into ANY pet from the same tier. | trigger:BeforeStartBattle(); target:Self(); effect:Transform(…) |
| InkAbility | Perks |  | Attack and ability deal 3 less {} damage. |  |
| KiwanoAbility | Perks |  | Ability deals +8 {} damage, once. |  |
| KiwiFruitAbility | Perks | BeforeStartBattle | Gain +3. | SetPerk(107); trigger:BeforeStartBattle(); target:Self(); effect:GiveBuff(0, 3) |
| LemonAbility | Perks |  | Block 7 {} damage, twice. |  |
| LimeAbility | Perks |  | Takes 1 less {} damage. |  |
| LovePotionAbility | Perks | BeforeStartBattle | Summon one 5/5 pet like this. | SetPerk(59); trigger:BeforeStartBattle(); target:Self(); effect:Summon(…; EffectSummon__SetSummonDirection(0) |
| LycheeAbility | Perks | BeforeStartBattle | Copy ability to the nearest friend ahead. | SetPerk(76); trigger:BeforeStartBattle(); target:InFront(1); effect:CopyAbility(0, 0, 0); EffectChooseSpell__SetRenderDisabled() |
| MacaronAbility | Perks |  | Activate ability after other pets with the same trigger. |  |
| MagicBeansAbility | Perks | StartTurn | Gain the Golden Egg perk and increase sell value by 4. | SetPerk(48); trigger:StartTurn(); target:Self(); effect:GainSellValue(4); target:Self(); effect:GivePerk(47, 0) |
| ManaPotion2Ability | Perks | BeforeStartBattle | Gain +7 mana. | SetPerk(87); trigger:BeforeStartBattle(); target:Self(); effect:GiveMana(7) |
| ManaPotionAbility | Perks | BeforeStartBattle | Gain +6 mana. | SetPerk(61); trigger:BeforeStartBattle(); target:Self(); effect:GiveMana(6) |
| MapleSyrupAbility | Perks |  | Attack for 50% damage and block 50% damage, thrice. |  |
| MeatBoneAbility | Perks |  | Attack with +3 {} damage. |  |
| MelonAbility | Perks |  | Block 20 {} damage, once. |  |
| MildChiliAbility | Perks |  | Attack second enemy for 4 {} damage. |  |
| MushroomAbility | Perks | Faint | Come back as a 1/1. | SetPerk(1); trigger:Faint(); target:Self(); effect:Summon(… |
| NachosAbility | Perks | BeforeAttack | Convert up to 3 health into attack. | SetPerk(116); trigger:BeforeAttack(); target:Self(); effect:GiveBuff(…, …, 0) |
| OblonotAbility | Perks | Hurt | Gain 50% health. Once. | SetPerk(96); trigger:Hurt(); target:Self(); effect:GiveBuff(0, …, 0); effect:LosePerk(0); effect:Composite(… |
| OliveAbility | Perks |  | Ignore perks that reduce damage. |  |
| OnionAbility | Perks | BeforeAttack | Move to the back, once. | SetPerk(31); trigger:BeforeAttack(); target:Self(); effect:LosePerk(0); target:Self(); effect:Push(1, 5, 2) |
| OysterMushroomAbility | Perks | BeforeAttack | Set {Attack()} and {Health()} to at least 9, once. | SetPerk(77); trigger:BeforeAttack(); SetAlwaysActivateAllPairs(1); target:Self(); effect:LosePerk(0); EffectLosePerk__SetRenderLost(0); target:Self(); effect:SetStats(…,local_res, … |
| PancakesAbility | Perks | BeforeStartBattle | Give friends +2/+2. | SetPerk(35); trigger:BeforeStartBattle(); target:OtherFriendly(0); effect:GiveBuff(2, 2, 0) |
| PapayaAbility | Perks | GainPerk | Gain +3/+3. | SetPerk(106); trigger:GainPerk(); target:Self(); effect:GiveBuff(3, 3, 0) |
| PeanutAbility | Perks |  | Knock out any pet attacked and hurt by this. |  |
| PeanutButterAbility | Perks |  | Knock out any pet attacked and hurt by this, once. |  |
| PepperAbility | Perks |  | Health does not go under 1. Removed after taking damage. |  |
| PieAbility | Perks | BeforeStartBattle | Gain +4/+3. | SetPerk(39); trigger:BeforeStartBattle(); target:Self(); effect:GiveBuff(4, 3) |
| PineappleAbility | Perks |  | Ability deals +2 {} damage, thrice. |  |
| PitaBreadAbility | Perks | HurtEarly | Gain +15, once. | SetPerk(33); trigger:HurtEarly(); SetAlwaysActivateAllPairs(1); target:Self(); effect:LosePerk(0); target:Self(); effect:GiveBuff(0, 15, 0) |
| PopcornAbility | Perks | Faint | Summon one random pet from the same tier. | SetPerk(17); trigger:Faint(); target:Self(); effect:Summon(…) |
| PotatoAbility | Perks |  | Block 10 {} damage from abilities and perks, twice. |  |
| RadishAbility | Perks | BeforeStartBattle | Gain ANY useful perk from the pet's tier. | SetPerk(65); trigger:BeforeStartBattle(); target:Self(); effect:GivePerk(…) |
| RambutanAbility | Perks | BeforeAttack | Gain +3 mana. | SetPerk(62); trigger:BeforeAttack(); target:Self(); effect:GiveMana(3) |
| RiceBallAbility | Perks |  | Sell for +2 gold. |  |
| SadAbility | Perks |  | Can't gain attack or health. | SetPerk(121) |
| SaltAbility | Perks |  | Attack for double damage, once. |  |
| SardinianCurrantAbility | Perks | StartTurn | Gain +2 gold. | SetPerk(100); trigger:StartTurn(); effect:GainGold(2) |
| SausageAbility | Perks | StartTurn | Gain one free roll. | SetPerk(69); trigger:StartTurn(); effect:GainRolls(1) |
| ScaredAbility | Perks |  | Take +1 {} damage. |  |
| SeaweedAbility | Perks | BeforeAttack | Transform into a Baby Urchin. | SetPerk(72); trigger:BeforeAttack(); target:Self(); effect:Transform(…); EffectTransform__SetRemovePerkIf(72); AddRelatedMinions(…,1)) |
| SillyAbility | Perks |  | Ability has random targets in battle. | SetPerk(75); SetAura(14, 0, …, 0) |
| SkewerAbility | Perks |  | Attack second and third enemy for 3 {} damage. |  |
| SquashAbility | Perks | BeforeAttack | Remove 6 health from target, once. | SetPerk(109); trigger:BeforeAttack(); target:Self(); effect:LosePerk(0); EffectLosePerk__SetRenderLost(0); target:TriggerTarget(); effect:RemoveHealth(6) |
| SteakAbility | Perks |  | Attack with +20 {} damage, once. |  |
| StrawberryAbility | Perks | Faint | Give the back-most friend +1/+1. | SetPerk(14); trigger:Faint(); target:FriendlyBack(); effect:GiveBuff(1, 1, 0) |
| SudduthTomatoAbility | Perks | Hurt | If still standing, gain permanent +1, once. | SetPerk(95); trigger:Hurt(); target:Self(); effect:GiveBuff(0, 1, 0); EffectGiveBuff__SetFuture(1); effect:LosePerk(0); effect:Composite(… |
| SweetLiquoriceAbility | Perks | GainPerk | Immediately activate ability at level 1. | SetPerk(122); trigger:GainPerk(); target:Self(); effect:ForceActivateAbility(0) |
| TastyAbility | Perks | BeforeFaint | Give one random enemy permanent +2/+2. | SetPerk(85); trigger:BeforeFaint(); target:Enemies(0); effect:GiveBuff(2, 2, 0); EffectGiveBuff__SetFuture(1) |
| ToastyAbility | Perks | AnyoneAttacks | Take 1 damage, once. | SetPerk(73); trigger:AnyoneAttacks(0); SetAlwaysActivateAllPairs(1); target:Self(); effect:Damage(1) |
| TomatoAbility | Perks | BeforeAttack | Deal 10 damage to the last enemy, once. | SetPerk(34); trigger:BeforeAttack(); SetAlwaysActivateAllPairs(1); target:Self(); effect:LosePerk(0); EffectLosePerk__SetRenderLost(0); target:EnemyLast(1); effect:Damage(10) |
| UnagiAbility | Perks | StartBattle | Deal 2 damage to a random enemy. | SetPerk(97); trigger:StartBattle(); target:RandomEnemy(1); effect:Damage(2) |
| VanillaBeanAbility | Perks | Faint | Summon a 3/3 Ant | SetPerk(92); trigger:Faint(); target:Self(); effect:Summon(0); EffectSummon__SetAttack(3); EffectSummon__SetHealth(3); AddRelatedMinions(…) |
| WalnutAbility | Perks |  | Block 2 {} damage, once. |  |
| WaterMelonAbility | Perks |  | Block 10 {} damage, once. |  |
| WeakAbility | Perks |  | Take +3 {} damage. |  |
| WebAbility | Perks | Faint | Summon 1 2/2 Spider up front for the opponent. | SetPerk(27); trigger:Faint(); effect:SummonEnemy(74); EffectSummonGlobal__SetAmount(L); EffectSummonGlobal__SetProjectile() |
| WhiteOkraAbility | Perks |  | Block 10 damage twice or ailment once. | SetPerk(101) |
| WhiteTruffleAbility | Perks | FriendFaints | Gain +4 and jump-attack the highest attack enemy, once. | SetPerk(91); trigger:FriendFaints(); SetInteruptor(2); target:Self(); effect:GiveBuff(4, 0, 0); target:HighestAttackEnemy(); effect:JumpAttack(0, 0, 0); target:Self(); effect:LosePerk(0) |
| YggdrasilFruitAbility | Perks | Faint | Summon two 5/5 Nordic Goats. | SetPerk(50); trigger:Faint(); target:Self(); effect:Summon(…); EffectSummon__SetSinglePass(1); EffectSummon__SetAttack(5); EffectSummon__SetHealth(5) |
