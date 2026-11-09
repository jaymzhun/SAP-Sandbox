# Pets (from MinionConstants / AbilityConstants)

Generated from GameAssembly.dll. `ID` is the real `MinionEnum` value. Trigger = the ability's `CreateTrigger.*` factory.
Limit = `Ability.SetTriggerLimit(value, TriggerLimitType, format)`; `L` = pet level. Text is the game's own About string
evaluated per level. *When the `All` limit window resets is documented in BATTLE-LOOP.md.*

## Turtle (Pack1) — 60 pets

| ID | Tier | Pet | Atk/HP | Ability | Trigger | Limit | L1 / L2 / L3 |
|---|---|---|---|---|---|---|---|
| 0 | 1 | Ant | 2/2 | AntAbility | BeforeFaint |  | Give one random friend +1/+1.<br>Give one random friend +2/+2.<br>Give one random friend +3/+3. |
| 3 | 1 | Beaver | 3/2 | BeaverAbility | ThisSold |  | Give 2 random friends +1.<br>Give 2 random friends +2.<br>Give 2 random friends +3. |
| 17 | 1 | Cricket | 1/3 | CricketAbility | Faint |  | Summon one 1/1 Cricket.<br>Summon one 2/2 Cricket.<br>Summon one 3/3 Cricket. |
| 26 | 1 | Duck | 2/2 | DuckAbility | ThisSold |  | Give shop pets +1.<br>Give shop pets +2.<br>Give shop pets +3. |
| 32 | 1 | Fish | 2/3 | FishAbility | LeveledUpThis |  | Give 2 friends +1/+1.<br>Give 2 friends +2/+2.<br>No ability. |
| 39 | 1 | Horse | 2/1 | HorseAbility | FriendSummoned |  | Give it +1 until next turn.<br>Give it +2 until next turn.<br>Give it +3 until next turn. |
| 47 | 1 | Mosquito | 2/2 | MosquitoAbility | StartBattle |  | Deal 1 damage to 1 random enemy.<br>Deal 1 damage to 2 random enemies.<br>Deal 1 damage to 3 random enemies. |
| 51 | 1 | Otter | 1/4 | OtterAbility | ThisBought |  | Give 1 random friend +1.<br>Give 2 random friends +1.<br>Give 3 random friends +1. |
| 59 | 1 | Pig | 4/1 | PigAbility | BeforeSell |  | Gain +1 gold.<br>Gain +2 gold.<br>Gain +3 gold. |
| 559 | 1 | Pigeon | 3/2 | PigeonAbility | ThisSold |  | Stock 1 {Price()} Bread Crumbs.<br>Stock 2 {Price()} Bread Crumbs.<br>Stock 3 {Price()} Bread Crumbs. |
| 16 | 2 | Crab | 4/1 | CrabAbility | StartBattle |  | Gain health equal to [per-level %] of the most healthy friend. |
| 29 | 2 | Flamingo | 3/2 | FlamingoAbility | BeforeFaint |  | Give the 2 nearest friends behind +1/+1.<br>Give the 2 nearest friends behind +2/+2.<br>Give the 2 nearest friends behind +3/+3. |
| 37 | 2 | Hedgehog | 4/2 | HedgehogAbility | BeforeFaint |  | Deal 2 damage to ALL pets.<br>Deal 4 damage to ALL pets.<br>Deal 6 damage to ALL pets. |
| 40 | 2 | Kangaroo | 2/2 | KangarooAbility | FriendAheadAttacks |  | Gain +1/+1.<br>Gain +2/+2.<br>Gain +3/+3. |
| 54 | 2 | Peacock | 2/5 | PeacockAbility | Hurt |  | Gain +3.<br>Gain +6.<br>Gain +9. |
| 57 | 2 | Rat | 3/6 | RatAbility | Faint |  | Summon 1 1/1 Dirty Rat up front for the opponent.<br>Summon 2 1/1 Dirty Rats up front for the opponent.<br>Summon 3 1/1 Dirty Rats up front for the opponent. |
| 72 | 2 | Snail | 2/3 | SnailAbility | EndTurn |  | Give the 3 nearest friends ahead +1.<br>Give the 3 nearest friends ahead +2.<br>Give the 3 nearest friends ahead +3. |
| 74 | 2 | Spider | 2/2 | SpiderAbility | Faint |  | Summon one tier 3 pet as a 2/2 level 1.<br>Summon one tier 3 pet as a 4/4 level 2.<br>Summon one tier 3 pet as a 6/6 level 3. |
| 76 | 2 | Swan | 1/2 | SwanAbility | StartTurn |  | Gain +1 gold.<br>Gain +2 gold.<br>Gain +3 gold. |
| 82 | 2 | Worm | 1/4 | WormAbility | StartTurn |  | Stock one 2-gold Apple. |
| 2 | 3 | Badger | 6/3 | BadgerAbility | BeforeFaint |  | Deal [per-level %] attack damage to adjacent pets. |
| 10 | 3 | Camel | 3/3 | CamelAbility | Hurt |  | Give the nearest friend behind +1/+2.<br>Give the nearest friend behind +2/+4.<br>Give the nearest friend behind +3/+6. |
| 21 | 3 | Dodo | 4/2 | DodoAbility | StartBattle |  | Give [per-level table] of attack to the nearest friend ahead. |
| 22 | 3 | Dog | 3/2 | DogAbility | FriendSummoned |  | Gain +2/+1 until next turn.<br>Gain +4/+2 until next turn.<br>Gain +6/+3 until next turn. |
| 23 | 3 | Dolphin | 4/3 | DolphinAbility | StartBattle | repeat L | Deal 4 damage to the lowest health enemy. |
| 28 | 3 | Elephant | 3/7 | ElephantAbility | AfterAttack | repeat L | Deal 1 damage to the nearest friend behind. |
| 33 | 3 | Giraffe | 1/2 | GiraffeAbility | StartTurn |  | Give the nearest friend ahead +1/+1.<br>Give the nearest 2 friends ahead +1/+1.<br>Give the nearest 3 friends ahead +1/+1. |
| 52 | 3 | Ox | 1/3 | OxAbility | FriendAheadDied | L× per turn (all) | Gain Melon perk and +1. |
| 60 | 3 | Rabbit | 1/2 | RabbitAbility | ShopFoodEatenByFriendly | 3× per turn (all) | Give them +1.<br>Give them +2.<br>Give them +3. |
| 68 | 3 | Sheep | 2/2 | SheepAbility | Faint |  | Summon two 2/2 Rams.<br>Summon two 4/4 Rams.<br>Summon two 6/6 Rams. |
| 5 | 4 | Bison | 4/4 | BisonAbility | EndTurn |  | Gain +2/+2. Works for 1 Bison.<br>Gain +4/+4. Works for 1 Bison.<br>Gain +6/+6. Works for 1 Bison. |
| 7 | 4 | Blowfish | 3/6 | BlowfishAbility | Hurt |  | Deal 3 damage to one random enemy.<br>Deal 6 damage to one random enemy.<br>Deal 9 damage to one random enemy. |
| 20 | 4 | Deer | 2/2 | DeerAbility | Faint |  | Summon one 5/3 Bus with Chili.<br>Summon one 10/6 Bus with Chili.<br>Summon one 15/9 Bus with Chili. |
| 38 | 4 | Hippo | 4/6 | HippoAbility | Knockout | 3× per battle | Gain +3/+3.<br>Gain +6/+6.<br>Gain +9/+9. |
| 53 | 4 | Parrot | 4/2 | ParrotAbility | EndTurn |  | Copy ability from the nearest pet ahead as level 1 until next turn.<br>Copy ability from the nearest pet ahead as level 2 until next turn.<br>Copy ability from the nearest pet ahead as level 3 until next turn. |
| 56 | 4 | Penguin | 2/3 | PenguinAbility | StartTurn |  | Give 2 level 2 or higher friends +1/+1.<br>Give 2 level 2 or higher friends +2/+2.<br>Give 2 level 2 or higher friends +3/+3. |
| 70 | 4 | Skunk | 3/5 | SkunkAbility | StartBattle |  | Remove {Health(*(…(…,3) + 32 + …)} from the highest health enemy. |
| 75 | 4 | Squirrel | 3/5 | SquirrelAbility | StartTurn |  | Discount all shop food by 1.<br>Discount all shop food by 2.<br>Discount all shop food by 3. |
| 80 | 4 | Turtle | 2/5 | TurtleAbility | BeforeFaint |  | Give Melon perk to the nearest friend behind.<br>Give Melon perk to the 2 nearest friends behind.<br>Give Melon perk to the 3 nearest friends behind. |
| 81 | 4 | Whale | 3/7 | WhaleAbility | StartBattle |  | Swallow the nearest friend ahead and release it at level 1 on faint.<br>Swallow the nearest friend ahead and release it at level 2 on faint.<br>Swallow the nearest friend ahead and release it at level 3 on faint. |
|  |  |  |  | WhaleAbilityExtra | Faint |  | {**(…(DAT_18442dd10 + 184)} |
| 166 | 5 | Armadillo | 4/8 | ArmadilloAbility | StartBattle |  | Give ALL pets +8.<br>Give ALL pets +16.<br>Give ALL pets +24. |
| 15 | 5 | Cow | 4/6 | CowAbility | ThisBought |  | Replace shop food with two free Milk. |
|  |  |  |  | CowAbilityExtra | FoodEatenByThis |  |  |
| 19 | 5 | Crocodile | 8/4 | CrocodileAbility | StartBattle | repeat L | Deal 8 damage to the last enemy. |
| 46 | 5 | Monkey | 1/2 | MonkeyAbility | EndTurn |  | Give front-most friendly pet +2/+2.<br>Give front-most friendly pet +4/+4.<br>Give front-most friendly pet +6/+6. |
| 55 | 5 | Rhino | 6/7 | RhinoAbility | Knockout |  | Deal 4 damage to the first enemy. Double against tier 1 pets.<br>Deal 8 damage to the first enemy. Double against tier 1 pets.<br>Deal 12 damage to the first enemy. Double against tier 1 pets. |
| 63 | 5 | Rooster | 6/5 | RoosterAbility | Faint |  | Summon 1 Chick with 1 health and 50% attack of this.<br>Summon 2 Chicks with 1 health and 50% attack of this.<br>Summon 3 Chicks with 1 health and 50% attack of this. |
| 65 | 5 | Scorpion | 1/3 | ScorpionAbility | ThisSummoned |  | Gain Peanut perk. |
| 66 | 5 | Seal | 3/8 | SealAbility | FoodEatenByThis |  | Give 3 random friends +1.<br>Give 3 random friends +2.<br>Give 3 random friends +3. |
| 69 | 5 | Shark | 2/2 | SharkAbility | FriendFaints |  | Gain +2/+2.<br>Gain +4/+4.<br>Gain +6/+6. |
| 79 | 5 | Turkey | 3/4 | TurkeyAbility | FriendSummoned |  | Give it +3/+1.<br>Give it +6/+2.<br>Give it +9/+3. |
| 103 | 6 | Boar | 10/6 | BoarAbility | BeforeAttack |  | Gain +4/+2.<br>Gain +8/+4.<br>Gain +12/+6. |
| 11 | 6 | Cat | 4/5 | CatAbility | FoodBought | 2× per turn (all) | Shop food gives 2 times attack and health.<br>Shop food gives 3 times attack and health.<br>Shop food gives 4 times attack and health. |
| 25 | 6 | Dragon | 3/8 | DragonAbility | FriendBoughtWithTier1 | 4× per turn (all) | Give friends +1/+1.<br>Give friends +2/+2.<br>Give friends +3/+3. |
| 30 | 6 | Fly | 4/4 | FlyAbility | FriendFaints | 3× per turn (all) | Summon one 4/4 fly in its place.<br>Summon one 8/8 fly in its place.<br>Summon one 12/12 fly in its place. |
| 36 | 6 | Gorilla | 7/10 | GorillaAbility | Hurt | L× per turn (all) | Gain {Perk()} perk. |
| 41 | 6 | Leopard | 10/4 | LeopardAbility | StartBattle |  | Deal 50% attack damage to 1 random enemy.<br>Deal 50% attack damage to 2 random enemies.<br>Deal 50% attack damage to 3 random enemies. |
| 45 | 6 | Mammoth | 4/12 | MammothAbility | BeforeFaint |  | Give friends +2/+2.<br>Give friends +4/+4.<br>Give friends +6/+6. |
| 73 | 6 | Snake | 8/3 | SnakeAbility | FriendAheadAttacks | 5× per battle | Deal 5 damage to one random enemy.<br>Deal 10 damage to one random enemy.<br>Deal 15 damage to one random enemy. |
| 77 | 6 | Tiger | 6/4 | TigerAbility |  |  | The friend ahead repeats their ability in battle as if they were level 1.<br>The friend ahead repeats their ability in battle as if they were level 2.<br>The friend ahead repeats their ability in battle as if they were level 3. |
| 269 | 6 | Wolverine | 5/7 | WolverineAbility | FriendHurt |  | Remove 3 health from all enemies.<br>Remove 6 health from all enemies.<br>Remove 9 health from all enemies. |

## Puppy (Pack2) — 57 pets

| ID | Tier | Pet | Atk/HP | Ability | Trigger | Limit | L1 / L2 / L3 |
|---|---|---|---|---|---|---|---|
| 88 | 1 | Beetle | 2/2 | BeetleAbility | StartBattle |  | Gain the Walnut perk.<br>Gain the Walnut perk with {Double(L)} effect.<br>Gain the Walnut perk with {Double(L)} effect. |
| 89 | 1 | Bluebird | 2/1 | BluebirdAbility | EndTurn |  | Give one random friend +1.<br>Give one random friend +2.<br>Give one random friend +3. |
| 161 | 1 | Chinchilla | 2/3 | ChinchillaAbility | ThisSold |  | Summon one 2/2 level 1 Loyal Chinchilla.<br>Summon one 4/4 level 2 Loyal Chinchilla.<br>Summon one 6/6 level 3 Loyal Chinchilla. |
| 184 | 1 | Chipmunk | 3/2 | ChipmunkAbility | ThisSold |  | Stock 1 {Price()} copy of this pet's food perk.<br>Stock 2 {Price()} copies of this pet's food perk.<br>Stock 3 {Price()} copies of this pet's food perk. |
| 172 | 1 | Ferret | 1/3 | FerretAbility | StartTurn |  | Choose one level 1 Ferret toy.<br>Choose one level 2 Ferret toy.<br>Choose one level 3 Ferret toy. |
| 229 | 1 | Gecko | 3/1 | GeckoAbility | StartBattle |  | Gain +2.<br>Gain +4.<br>Gain +6. |
| 92 | 1 | Ladybug | 2/2 | LadybugAbility | FriendlyGainsPerk |  | Gain +2/+1.<br>Gain +4/+1.<br>Gain +6/+1. |
| 141 | 1 | Moth | 1/3 | MothAbility | StartBattle |  | Give front-most friendly pet +2.<br>Give front-most friendly pet +4.<br>Give front-most friendly pet +6. |
| 87 | 2 | Bat | 2/4 | BatAbility | BeforeAttack | L× per battle | Make one random enemy Weak. |
| 213 | 2 | BelugaSturgeon | 2/3 | BelugaSturgeonAbility | Faint |  | Summon 1 2/undefined Dolphin in the back and give it RiceBall.<br>Summon 2 2/undefined Dolphins in the back and give them RiceBall.<br>Summon 3 2/undefined Dolphins in the back and give them RiceBall. |
| 758 | 2 | Bilby | 2/4 | BilbyAbility | FriendLostPerk | L× per turn (all) | Give it Garlic. |
| 405 | 2 | Drill | 3/4 | DrillAbility | BeforeFaint |  | Break friendly tier 2 or lower toy.<br>Break friendly tier 4 or lower toy.<br>Break friendly tier 6 or lower toy. |
| 104 | 2 | Dromedary | 2/4 | DromedaryAbility | StartTurn |  | Give the 2 left-most shop pets +1/+1.<br>Give the 2 left-most shop pets +2/+2.<br>Give the 2 left-most shop pets +3/+3. |
| 121 | 2 | GoldFish | 1/1 | GoldFishAbility | StartTurn |  | Increase sell value by 1.<br>Increase sell value by 2.<br>Increase sell value by 3. |
| 236 | 2 | Lemur | 3/3 | LemurAbility | StartTurn |  | Choose one level 1 Lemur toy.<br>Choose one level 2 Lemur toy.<br>Choose one level 3 Lemur toy. |
| 255 | 2 | Robin | 2/3 | RobinAbility | StartBattle |  | Summon one 2/3 level 1 Nest and give it Egg perk.<br>Summon one 4/6 level 2 Nest and give it Egg perk.<br>Summon one 6/9 level 3 Nest and give it Egg perk. |
| 67 | 2 | Shrimp | 2/2 | ShrimpAbility | FriendSold | 3× per turn (all) | Give one random friend +1.<br>Give one random friend +2.<br>Give one random friend +3. |
| 99 | 2 | TabbyCat | 3/2 | TabbyCatAbility | FriendlyGainsPerk |  | Give 2 random friends +1/+1.<br>Give 2 random friends +2/+1.<br>Give 2 random friends +3/+1. |
| 231 | 3 | Gharial | 4/3 | GharialAbility | StartTurn |  | Choose one level 1 Gharial toy.<br>Choose one level 2 Gharial toy.<br>Choose one level 3 Gharial toy. |
| 551 | 3 | Hare | 4/4 | HareAbility | BeforeAttack | L× per battle | Copy a useful food perk from one random enemy. |
| 91 | 3 | HatchingChick | 2/2 | HatchingChickAbility | EndTurn |  | Will give permanent stats at level 2.<br>Will give experience at level 3.<br>Give the nearest friend ahead +1 experience. |
| 235 | 3 | HoopoeBird | 3/3 | HoopoeBirdAbility | BeforeFaint |  | Deal 2 damage to the first and last enemy.<br>Deal 4 damage to the first and last enemy.<br>Deal 6 damage to the first and last enemy. |
| 168 | 3 | Mole | 2/3 | MoleAbility | Faint |  | Remove the 2 nearest friendly perks to summon one 6/6 Mole.<br>Remove the 2 nearest friendly perks to summon one 12/12 Mole.<br>Remove the 2 nearest friendly perks to summon one 18/18 Mole. |
| 95 | 3 | Owl | 3/2 | OwnAbility | StartTurn |  | Summon one level 1 Mouse.<br>Summon one level 2 Mouse.<br>Summon one level 3 Mouse. |
| 249 | 3 | Pangolin | 2/5 | PangolinAbility | BeforeFaint |  | Give the nearest friend behind +4.<br>Give the nearest friend behind +8.<br>Give the nearest friend behind +12. |
| 744 | 3 | PurpleFrog | 4/2 | PurpleFrogAbility | FriendSummoned | L× per turn (all) | Activate and disable its <b>Start of turn</b> ability until next turn. |
| 151 | 3 | Toucan | 4/3 | ToucanAbility | BeforeFirstAttack |  | Copy tier 5 or lower perk (or Egg) to the nearest friend behind.<br>Copy tier 5 or lower perk (or Egg) to the 2 nearest friends behind.<br>Copy tier 5 or lower perk (or Egg) to the 3 nearest friends behind. |
| 100 | 3 | TropicalFish | 3/3 | TropicalFishAbility | StartTurn |  | Give adjacent friends +1.<br>Give adjacent friends +2.<br>Give adjacent friends +3. |
| 393 | 4 | ArabianTahr | 5/3 | ArabianTahrAbility | BeforeFaint |  | Give MildChili perk to the nearest friend behind.<br>Give MildChili perk to the 2 nearest friends behind.<br>Give MildChili perk to the 3 nearest friends behind. |
| 8 | 4 | Buffalo | 4/4 | BuffaloAbility | FriendSold |  | Gain +2/+2.<br>Gain +4/+4.<br>Gain +6/+6. |
| 12 | 4 | Caterpillar | 1/1 | CaterpillarAbility | StartTurn, StartBattle |  | Gain +1 experience.<br>Gain +1 experience.<br>Transform into a 1/1 Butterfly and copy stats of the strongest enemy. |
| 216 | 4 | Chameleon | 3/5 | ChameleonAbility | EndTurn |  | Copy friendly toy ability at up to level 1 until next turn.<br>Copy friendly toy ability at up to level 2 until next turn.<br>Copy friendly toy ability at up to level 3 until next turn. |
| 273 | 4 | Doberman | 1/4 | DobermanAbility | StartBattle |  | Gain +8. If all friends are higher tiers, also gain {Perk()} perk.<br>Gain +16. If all friends are higher tiers, also gain {Perk()} perk.<br>Gain +24. If all friends are higher tiers, also gain {Perk()} perk. |
| 44 | 4 | Llama | 3/5 | LlamaAbility | EndTurn |  | Gain +1/+2.<br>Gain +2/+4.<br>Gain +3/+6. |
| 93 | 4 | Lobster | 3/3 | LobsterAbility | FriendSummoned |  | Give it +1/+2.<br>Give it +2/+4.<br>Give it +3/+6. |
| 94 | 4 | Microbe | 4/1 | MicrobeAbility | BeforeFaint |  | Make ALL pets within 3 spaces Weak.<br>Make ALL pets within 6 spaces Weak.<br>Make ALL pets within 9 spaces Weak. |
| 97 | 4 | Puppy | 3/5 | PuppyAbility | StartTurn |  | Choose one level 1 Puppy toy.<br>Choose one level 2 Puppy toy.<br>Choose one level 3 Puppy toy. |
| 267 | 4 | WhaleShark | 2/6 | WhaleSharkAbility | GainPerkOrAilment |  | Remove it and gain +1/+1. Triple in battle.<br>Remove it and gain +2/+2. Triple in battle.<br>Remove it and gain +3/+3. Triple in battle. |
| 212 | 5 | Axolotl | 2/5 | AxolotlAbility | FriendlyGainsPerk | 3× per turn (all) | Give it permanent +1/+1.<br>Give it permanent +2/+2.<br>Give it permanent +3/+3. |
| 14 | 5 | Chicken | 3/4 | ChickenAbility | StartTurn |  | Give future shop pets +1/+1.<br>Give future shop pets +2/+2.<br>Give future shop pets +3/+3. |
| 27 | 5 | Eagle | 6/5 | EagleAbility | Faint |  | Summon one 5/5 level 1 pet from the next shop tier.<br>Summon one 10/10 level 2 pet from the next shop tier.<br>Summon one 15/15 level 3 pet from the next shop tier. |
| 34 | 5 | Goat | 4/6 | GoatAbility | FriendBought | 2× per turn (all) | Gain +1 gold.<br>Gain +2 gold.<br>Gain +3 gold. |
| 242 | 5 | Mosasaurus | 5/6 | MosasaurusAbility | FriendlyToyBroke |  | Give adjacent friends +2/+3.<br>Give adjacent friends +4/+6.<br>Give adjacent friends +6/+9. |
| 557 | 5 | OrchidMantis | 8/4 | OrchidMantisAbility | StartBattle |  | Summon one Mantis with [per-level table] attack and health of this. |
| 250 | 5 | Panther | 3/5 | PantherAbility |  |  | Perks are 2 times stronger on this in battle.<br>Perks are 3 times stronger on this in battle.<br>Perks are 4 times stronger on this in battle. |
| 277 | 5 | SnappingJawTurtle | 4/5 | SnappingJawTurtleAbility | BeforeFaint |  | Give Skewer perk to the nearest friend behind.<br>Give Skewer perk to the 2 nearest friends behind.<br>Give Skewer perk to the 3 nearest friends behind. |
| 178 | 5 | Stingray | 4/7 | StingrayAbility | StartTurn |  | Choose one level 1 Sting Ray toy.<br>Choose one level 2 Sting Ray toy.<br>Choose one level 3 Sting Ray toy. |
| 278 | 5 | Stonefish | 7/4 | StonefishAbility | BeforeFaint |  | Deal attack damage directly back to whoever knocked this out.<br>Deal {Double(L)} attack damage directly back to whoever knocked this out.<br>Deal {Double(L)} attack damage directly back to whoever knocked this out. |
| 180 | 6 | Anglerfish | 7/4 | AnglerfishAbility | ThisBought |  | Choose one free pet from your last opponent to stock.<br>Choose one free pet from your last opponent to stock 2.<br>Choose one free pet from your last opponent to stock 3. |
| 222 | 6 | ElephantSeal | 4/8 | ElephantSealAbility | GainPerk | 1× per turn (all) | Give 3 friends +4/+4.<br>Give 3 friends +8/+8.<br>Give 3 friends +12/+12. |
| 201 | 6 | Lionfish | 10/4 | LionfishAbility | BeforeFaint | repeat L | Deal 3 damage to one random enemy. Repeat for each 10 attack this has.<br>Deal 6 damage to one random enemy. Repeat for each 10 attack this has.<br>Deal 9 damage to one random enemy. Repeat for each 10 attack this has. |
| 241 | 6 | Mongoose | 7/6 | MongooseAbility | StartTurn |  | Choose one level 1 Mongoose toy.<br>Choose one level 2 Mongoose toy.<br>Choose one level 3 Mongoose toy. |
| 50 | 6 | Octopus | 8/8 | OctopusAbility | AfterAttack |  | Deal 6 damage to 1 random enemy.<br>Deal 6 damage to 2 random enemies.<br>Deal 6 damage to 3 random enemies. |
| 254 | 6 | Puma | 6/5 | PumaAbility |  |  | Friendly toy repeats its ability as level 1.<br>Friendly toy repeats its ability as level 2.<br>Friendly toy repeats its ability as level 3. |
| 98 | 6 | Sauropod | 4/12 | SauropodAbility | FriendlyGainsPerk | 3× per turn (all) | Gain +1 gold next turn.<br>Gain +2 gold next turn.<br>Gain +3 gold next turn. |
| 190 | 6 | ShrimpMantis | 9/3 | ShrimpMantisAbility | StartBattle | repeat L | Deal 10 damage to the first enemy. |
| 78 | 6 | Tyrannosaurus | 7/7 | TyrannosaurusAbility | StartTurn |  | Give 2 tier 5 friends or higher +2/+2.<br>Give 2 tier 5 friends or higher +4/+4.<br>Give 2 tier 5 friends or higher +6/+6. |

## Star (Pack3) — 60 pets

| ID | Tier | Pet | Atk/HP | Ability | Trigger | Limit | L1 / L2 / L3 |
|---|---|---|---|---|---|---|---|
| 541 | 1 | Chihuahua | 4/1 | ChihuahuaAbility | StartBattle |  | Push the most healthy enemy 1 space forward.<br>Push the most healthy enemy 2 spaces forward.<br>Push the most healthy enemy 3 spaces forward. |
| 18 | 1 | Cockroach | 1/1 | CockroachAbility | Faint |  | Summon one 1/1 Cockroach and give it +1 experience.<br>Summon one 1/1 Cockroach and give it +2 experience.<br>Summon one 1/1 Cockroach and give it +3 experience. |
| 548 | 1 | Firefly | 3/2 | FireflyAbility | BeforeFaint |  | Deal 1 damage to ALL pets within 1 space.<br>Deal 1 damage to ALL pets within 2 spaces.<br>Deal 1 damage to ALL pets within 3 spaces. |
| 139 | 1 | Frog | 3/2 | FrogAbility | ThisSold |  | If both adjacent friends are tier 2 or lower, swap their stats.<br>If both adjacent friends are tier 4 or lower, swap their stats.<br>If both adjacent friends are tier 6 or lower, swap their stats. |
| 138 | 1 | Hummingbird | 3/1 | HummingbirdAbility | BeforeFaint |  | Give Strawberry perk to the nearest friend behind.<br>Give Strawberry perk to the 2 nearest friends behind.<br>Give Strawberry perk to the 3 nearest friends behind. |
| 131 | 1 | Kiwi | 1/4 | KiwiAbility | Hurt, ThisSold, Composite |  | Give the back-most friendly Strawberry pet +1.<br>Give the back-most friendly Strawberry pet +2.<br>Give the back-most friendly Strawberry pet +3. |
| 204 | 1 | Marmoset | 2/3 | MarmosetAbility | ThisSold |  | Your next roll is free.<br>Your next 2 rolls are free.<br>Your next 3 rolls are free. |
| 48 | 1 | Mouse | 1/2 | MouseAbility | ThisSold |  | Replace shop food with 1 {Price()} Apple. |
| 558 | 1 | Pheasant | 2/1 | PheasantAbility | FriendSummoned | L× per turn (all) | Give it the Strawberry perk until next turn. |
| 149 | 1 | Pillbug | 2/3 | PillbugAbility | ThisSold |  | Stock 1 {Price()} Sleeping Pill.<br>Stock 2 {Price()} Sleeping Pills.<br>Stock 3 {Price()} Sleeping Pills. |
| 537 | 2 | Bass | 3/3 | BassAbility | BeforeFaint, ThisSold, Composite |  | Give 1 level 2 <b>Sell</b> friend +1 experience.<br>Give 1 level 2 <b>Sell</b> friend +2 experience.<br>Give 1 level 2 <b>Sell</b> friend +3 experience. |
| 24 | 2 | Dove | 3/1 | DoveAbility | BeforeFaint |  | Activate 3 friendly Strawberries.<br>Activate 3 friendly Strawberries with {Double(L)} effect.<br>Activate 3 friendly Strawberries with {Double(L)} effect. |
| 545 | 2 | DumboOctopus | 2/5 | DumboOctopusAbility | ShopRolled, ThisChargedByRoll | charges 3 | Stock ANY food from the 3 last unlocked tiers and discount it by 1.<br>Stock ANY food from the 3 last unlocked tiers and discount it by 2.<br>Stock ANY food from the 3 last unlocked tiers and discount it by 3. |
| 109 | 2 | GuineaPig | 2/3 | GuineaPigAbility | ThisBought |  | Summon one 1/1 Guinea Pig.<br>Summon one 2/2 Guinea Pig.<br>Summon one 3/3 Guinea Pig. |
| 147 | 2 | Iguana | 2/4 | IguanaAbility | EnemySummoned, EnemyPushed, Composite |  | Deal 2 damage to it.<br>Deal 4 damage to it.<br>Deal 6 damage to it. |
| 122 | 2 | Jellyfish | 3/3 | JellyfishAbility | FriendLeveledUp |  | Gain +1/+1.<br>Gain +2/+2.<br>Gain +3/+3. |
| 112 | 2 | Koala | 4/2 | KoalaAbility | FriendHurt | L× per turn (all) | Give it the Eucalyptus perk. |
| 164 | 2 | Salamander | 1/2 | SalamanderAbility | StartBattle |  | Gain +1/+1 for each level of each {0} friend.<br>Gain +2/+2 for each level of each {0} friend.<br>Gain +3/+3 for each level of each {0} friend. |
| 803 | 2 | ShimaEnaga | 2/3 | ShimaEnagaAbility | FriendFaints | 2× per turn (all) | If it had a Strawberry, summon one 2/2 friend in its place.<br>If it had a Strawberry, summon one 4/4 friend in its place.<br>If it had a Strawberry, summon one 6/6 friend in its place. |
| 136 | 2 | Stork | 3/1 | StorkAbility | Faint |  | Summon ANY one level 1 pet from the previous shop tier as a 2/2.<br>Summon ANY one level 2 pet from the previous shop tier as a 4/4.<br>Summon ANY one level 3 pet from the previous shop tier as a 6/6. |
| 105 | 3 | Anteater | 2/2 | AnteaterAbility | Faint |  | 1<br>2<br>3 |
| 154 | 3 | Capybara | 2/6 | CapybaraAbility | ShopRolled, ThisSold, Composite |  | Give newly rolled shop pets +1/+1.<br>Give newly rolled shop pets +2/+2.<br>Give newly rolled shop pets +3/+3. |
| 539 | 3 | Cardinal | 4/3 | CardinalAbility | EndTurn |  | Copy and stock the nearest perk ahead and discount it by 1.<br>Copy and stock the nearest perk ahead and discount it by 2.<br>Copy and stock the nearest perk ahead and discount it by 3. |
| 133 | 3 | Cassowary | 5/2 | CassowaryAbility | FriendlyGainedStrawberry |  | Gain +1. Also gain +1/+1.<br>Gain +2. Also gain +2/+1.<br>Gain +3. Also gain +3/+1. |
| 165 | 3 | Leech | 2/3 | LeechAbility | EndTurn |  | Deal 1 damage to the nearest friend ahead and gain damage as {Health()}.<br>Deal 2 damage to the nearest friend ahead and gain damage as {Health()}.<br>Deal 3 damage to the nearest friend ahead and gain damage as {Health()}. |
| 130 | 3 | Okapi | 2/3 | OkapiAbility | ShopRolled | 5× per turn (all) | Gain +1/+1 until next turn.<br>Gain +2/+2 until next turn.<br>Gain +3/+3 until next turn. |
| 157 | 3 | Orangutan | 1/4 | OrangutanAbility | EndTurn |  | Give the lowest health friendly pet +3.<br>Give the lowest health friendly pet +6.<br>Give the lowest health friendly pet +9. |
| 145 | 3 | Pug | 5/2 | PugAbility | StartBattle |  | Give the nearest friend ahead +1 experience.<br>Give the nearest friend ahead +2 experience.<br>Give the nearest friend ahead +3 experience. |
| 162 | 3 | Toad | 3/3 | ToadAbility | EnemyHurt | L * 2× per battle | Make it Weak. |
| 572 | 3 | Tuna | 3/5 | TunaAbility | Hurt, BeforeFaint | repeat L | Give one random friend +1/+1 for each time this was hurt.<br>Give one random friend +2/+2 for each time this was hurt.<br>Give one random friend +3/+3 for each time this was hurt. |
| 117 | 4 | ClownFish | 3/4 | ClownFishAbility | FriendlyLeveledUp |  | Give it +2/+2.<br>Give it +4/+4.<br>Give it +6/+6. |
| 111 | 4 | Donkey | 4/6 | DonkeyAbility | FriendFaints | L× per battle | Push the last enemy to the front and remove 3 attack. |
| 546 | 4 | Elk | 2/6 | ElkAbility | EndTurn |  | Increase sell value of one random <b>Sell</b> friend by 2.<br>Increase sell value of one random <b>Sell</b> friend by 4.<br>Increase sell value of one random <b>Sell</b> friend by 6. |
| 547 | 4 | FairyArmadillo | 2/6 | FairyArmadilloAbility | Hurt |  | If still standing, gain permanent +2 and transform into a protected ball.<br>If still standing, gain permanent +4 and transform into a protected ball.<br>If still standing, gain permanent +6 and transform into a protected ball. |
| 549 | 4 | Fossa | 6/5 | FossaAbility | StartBattle |  | Remove 1 health from the 2 first enemies for each roll this turn.<br>Remove 2 health from the 2 first enemies for each roll this turn.<br>Remove 3 health from the 2 first enemies for each roll this turn. |
| 127 | 4 | Hawk | 5/4 | HawkAbility | StartBattle |  | Deal 7 damage to the opposite enemy.<br>Deal 14 damage to the opposite enemy.<br>Deal 21 damage to the opposite enemy. |
| 159 | 4 | Platypus | 2/2 | PlatypusAbility | Faint, ThisSold, Composite |  | Summon one 3/2 level 1 Duck and Beaver.<br>Summon one 6/4 level 2 Duck and Beaver.<br>Summon one 9/6 level 3 Duck and Beaver. |
| 126 | 4 | PrayingMantis | 7/2 | PrayingMantisAbility | StartTurn |  | Deal 50 damage to adjacent friends and gain +2/+2.<br>Deal 50 damage to adjacent friends and gain +4/+4.<br>Deal 50 damage to adjacent friends and gain +6/+6. |
| 565 | 4 | Siamese | 2/5 | SiameseAbility | EndTurn |  | Give adjacent pets +1. Also +1 if the shop has discounted food.<br>Give adjacent pets +2. Also +2 if the shop has discounted food.<br>Give adjacent pets +3. Also +3 if the shop has discounted food. |
| 567 | 4 | Sparrow | 3/2 | SparrowAbility |  |  | Friendly Strawberries block 5 damage twice, or ailments once.<br>Friendly Strawberries block 10 damage twice, or ailments once.<br>Friendly Strawberries block 15 damage twice, or ailments once. |
| 150 | 5 | Blobfish | 2/10 | BlobfishAbility | BeforeFaint |  | Give the nearest friend behind +1 experience. Give to one more friend in battle.<br>Give the nearest friend behind +2 experience. Give to one more friend in battle.<br>Give the nearest friend behind +3 experience. Give to one more friend in battle. |
| 110 | 5 | Hamster | 4/4 | HamsterAbility | ShopRolled | L * 2× per turn (all) | Gain one free roll. |
| 553 | 5 | Ibex | 6/7 | IbexAbility | EnemyPushed, EnemyHurt, Composite | L× per battle | Remove 70% health from it. Works on 1 enemy per battle.<br>Remove 70% health from it. Works on 2 different enemies per battle.<br>Remove 70% health from it. Works on 3 different enemies per battle. |
| 129 | 5 | Pelican | 5/5 | PelicanAbility | StartBattle |  | Swallow 1 Strawberry friend ahead and turn it into a Salmon on faint.<br>Swallow 2 Strawberry friends ahead and turn them into Salmons on faint.<br>Swallow 3 Strawberry friends ahead and turn them into Salmons on faint. |
|  |  |  |  | PelicanAbilityExtra | Faint |  | {**(…(DAT_18442dd10 + 184)} |
| 134 | 5 | Shoebill | 3/6 | ShoebillAbility | StartTurn |  | Replace the nearest Strawberry ahead with +4/+4.<br>Replace the nearest Strawberry ahead with +8/+8.<br>Replace the nearest Strawberry ahead with +12/+12. |
| 153 | 5 | Starfish | 3/7 | StarfishAbility | FriendSoldWithLevelMax |  | Give friends +1/+1. Triple if sold pet had at least 10 attack.<br>Give friends +2/+2. Triple if sold pet had at least 10 attack.<br>Give friends +3/+3. Triple if sold pet had at least 10 attack. |
| 119 | 5 | SwordFish | 6/9 | SwordFishAbility | StartBattle |  | Deal [per-level %] attack damage to the most healthy enemy and itself. |
| 142 | 5 | Triceratops | 5/6 | TriceratopsAbility | Hurt |  | Give one random friend +3/+3.<br>Give one random friend +6/+6.<br>Give one random friend +9/+9. |
| 135 | 5 | Vulture | 4/5 | VultureAbility | FriendFaints |  | Deal 4 damage to one random enemy.<br>Deal 8 damage to one random enemy.<br>Deal 12 damage to one random enemy. |
| 156 | 5 | Woodpecker | 6/5 | WoodpeckerAbility | StartBattle | repeat L | Deal 1 damage to nearest two pets ahead 2 times. Double against enemies.<br>Deal 1 damage to nearest two pets ahead 4 times. Double against enemies.<br>Deal 1 damage to nearest two pets ahead 6 times. Double against enemies. |
| 194 | 6 | Alpaca | 3/7 | AlpacaAbility | FriendSummoned | L× per turn (all) | Give it +1 experience. Triple in battle. |
| 536 | 6 | Ammonite | 5/3 | AmmoniteAbility | BeforeFaint |  | Transform friend behind into a level 1 Mimic Octopus. Give it +1 experience in battle for every 2 roll.<br>Transform friend behind into a level 1 Mimic Octopus. Give it +2 experience in battle for every 2 roll.<br>Transform friend behind into a level 1 Mimic Octopus. Give it +3 experience in battle for every 2 roll. |
| 116 | 6 | Orca | 5/7 | OrcaAbility | Faint |  | Summon 1 random {0} pet from ANY pack as 6/6.<br>Summon 2 random {0} pets from ANY pack as 6/6.<br>Summon 3 random {0} pets from ANY pack as 6/6. |
| 125 | 6 | Ostrich | 6/7 | OstrichAbility | ShopRolled | 4× per turn (all) | If 4 shop pets are the same tier, re-roll and give friends +2.<br>If 4 shop pets are the same tier, re-roll and give friends +4.<br>If 4 shop pets are the same tier, re-roll and give friends +6. |
| 118 | 6 | Piranha | 10/4 | PiranhaAbility | Hurt |  | Give friends +3.<br>Give friends +6.<br>Give friends +9. |
| 561 | 6 | RealVelociraptor | 6/5 | RealVelociraptorAbility | FriendLostPerk | L× per turn (all) | Return its perk. Works on 1 friend per turn.<br>Return its perk. Works on 2 different friends per turn.<br>Return its perk. Works on 3 different friends per turn. |
| 205 | 6 | Reindeer | 9/6 | ReindeerAbility | BeforeAttack | L× per battle | Gain Melon perk. |
| 148 | 6 | SabertoothTiger | 4/5 | SabertoothTigerAbility | Hurt, Faint |  | Summon 1 Mammoth with +2/+3 for each time this was hurt.<br>Summon 2 Mammoths with +2/+3 for each time this was hurt.<br>Summon 3 Mammoths with +2/+3 for each time this was hurt. |
| 143 | 6 | Spinosaurus | 4/4 | SpinosaurusAbility | FriendFaints |  | Give one random friend +2/+3.<br>Give one random friend +4/+6.<br>Give one random friend +6/+9. |
| 115 | 6 | Velociraptor | 3/6 | VelociraptorAbility | FriendAttacked |  | Steal friendly Strawberry ahead to give friends +2/+3.<br>Steal friendly Strawberry ahead to give friends +4/+6.<br>Steal friendly Strawberry ahead to give friends +6/+9. |

## Golden (Pack4) — 59 pets

| ID | Tier | Pet | Atk/HP | Ability | Trigger | Limit | L1 / L2 / L3 |
|---|---|---|---|---|---|---|---|
| 189 | 1 | Bulldog | 1/4 | BulldogAbility | AfterFirstAttack |  | Gain +2.<br>Gain +4.<br>Gain +6. |
| 272 | 1 | ConeSnail | 1/2 | ConeSnailAbility | StartBattle |  | Give the nearest friend behind +2.<br>Give the nearest friend behind +4.<br>Give the nearest friend behind +6. |
| 232 | 1 | Goose | 2/2 | GooseAbility | StartBattle |  | Remove 1 attack from the first enemy.<br>Remove 2 attack from the first enemy.<br>Remove 3 attack from the first enemy. |
| 233 | 1 | Groundhog | 2/1 | GroundhogAbility | BeforeFaint |  | Gain +1 trumpets.<br>Gain +2 trumpets.<br>Gain +3 trumpets. |
| 555 | 1 | Lemming | 3/2 | LemmingAbility | BeforeSell |  | Gain +1 gold next turn.<br>Gain +2 gold next turn.<br>Gain +3 gold next turn. |
| 239 | 1 | Magpie | 1/4 | MagpieAbility | EndTurn |  | Spend up to -1 gold and gain it back next turn.<br>Spend up to -2 gold and gain it back next turn.<br>Spend up to -3 gold and gain it back next turn. |
| 187 | 1 | Opossum | 2/3 | OpossumAbility | ThisSold |  | Give one random {0} pet in the shop +1/+1.<br>Give one random {0} pet in the shop +2/+2.<br>Give one random {0} pet in the shop +3/+3. |
| 251 | 1 | PiedTamarin | 2/2 | PiedTamarinAbility | BeforeFaint |  | Spend 1 trumpets to deal 3 damage to 1 random enemy.<br>Spend 1 trumpets to deal 3 damage to 2 random enemies.<br>Spend 1 trumpets to deal 3 damage to 3 random enemies. |
| 260 | 1 | Silkmoth | 3/1 | SilkmothAbility | FriendAheadHurt | 2× per turn (all) | Give it +1.<br>Give it +2.<br>Give it +3. |
| 210 | 2 | AfricanPenguin | 1/3 | AfricanPenguinAbility | ThisBought |  | Give three random friends +1.<br>Give three random friends +2.<br>Give three random friends +3. |
| 215 | 2 | BlackNeckedStilt | 3/2 | BlackNeckedStiltAbility | BeforeFaint |  | Gain +2 trumpets.<br>Gain +4 trumpets.<br>Gain +6 trumpets. |
| 220 | 2 | DoorHeadAnt | 2/2 | DoorHeadAntAbility | EmptyFrontSpace |  | Jump to the front and gain +4 in battle.<br>Jump to the front and gain +8 in battle.<br>Jump to the front and gain +12 in battle. |
| 234 | 2 | HerculesBeetle | 3/4 | HerculesBeetleAbility | StartTurn, ThisSold |  | Give friends +1 for each battle this has fought evenly spread.<br>Give friends +2 for each battle this has fought evenly spread.<br>Give friends +3 for each battle this has fought evenly spread. |
| 237 | 2 | Lizard | 1/3 | LizardAbility | Hurt | 2× per turn (all) | Summon one 3/1 Lizard Tail.<br>Summon one 6/2 Lizard Tail.<br>Summon one 9/3 Lizard Tail. |
| 203 | 2 | Meerkat | 1/2 | MeerkatAbility | StartBattle |  | Give adjacent friends +1 for every 4 spent this turn.<br>Give adjacent friends +2 for every 4 spent this turn.<br>Give adjacent friends +3 for every 4 spent this turn. |
| 191 | 2 | SeaTurtle | 1/4 | SeaTurtleAbility | FriendSummoned |  | Give it +2/+1.<br>Give it +4/+1.<br>Give it +6/+1. |
| 258 | 2 | SeaUrchin | 3/2 | SeaUrchinAbility | BeforeFaint |  | Remove 5 health from the first enemy.<br>Remove 5 health from the first 2 enemies.<br>Remove 5 health from the first 3 enemies. |
| 177 | 2 | Squid | 5/2 | SquidAbility | BeforeFaint |  | Spend 1 trumpets to make the first enemy Ink.<br>Spend 1 trumpets to make the first enemy Ink with {Double(L)} effect.<br>Spend 1 trumpets to make the first enemy Ink with {Double(L)} effect. |
| 263 | 2 | Stoat | 3/3 | StoatAbility | ThisSold |  | Summon one level 1 pet from your current tier as a 1/1.<br>Summon one level 2 pet from your current tier as a 1/1.<br>Summon one level 3 pet from your current tier as a 1/1. |
| 171 | 3 | Baboon | 2/3 | BaboonAbility | EndTurn |  | Give 1 random friend from the current or higher shop tier +1/+1.<br>Give 1 random friend from the current or higher shop tier +2/+2.<br>Give 1 random friend from the current or higher shop tier +3/+3. |
| 214 | 3 | BettaFish | 2/3 | BettaFishAbility | FriendLostPerk | L× per turn (all) | Give it the Guava perk. Works on 1 friend per turn.<br>Give it the Guava perk. Works on 2 different friends per turn.<br>Give it the Guava perk. Works on 3 different friends per turn. |
| 225 | 3 | Flea | 4/3 | FleaAbility | BeforeFaint |  | Make the most healthy enemy Weak.<br>Make the most healthy enemy Weak with {Double(L)} effect.<br>Make the most healthy enemy Weak with {Double(L)} effect. |
| 226 | 3 | FlyingFish | 5/2 | FlyingFishAbility | FriendSummoned | 2× per turn (all) | Give it +2 experience.<br>Give it +4 experience.<br>Give it +6 experience. |
| 228 | 3 | FowlBird | 2/3 | FowlBirdAbility | Hurt |  | Gain +2 trumpets.<br>Gain +4 trumpets.<br>Gain +6 trumpets. |
| 245 | 3 | MuskOx | 2/4 | MuskOxAbility | FriendAheadDied |  | Gain +1/+2 until next turn.<br>Gain +2/+4 until next turn.<br>Gain +3/+6 until next turn. |
| 247 | 3 | Osprey | 3/3 | OspreyAbility | Faint |  | Summon 1 2/undefined Groundhog.<br>Summon 2 2/undefined Groundhogs.<br>Summon 3 2/undefined Groundhogs. |
| 256 | 3 | RoyalFlycatcher | 2/4 | RoyalFlycatcherAbility | EnemyFaint |  | Deal 4 damage to one random enemy.<br>Deal 8 damage to one random enemy.<br>Deal 12 damage to one random enemy. |
| 264 | 3 | SurgeonFish | 3/3 | SurgeonFishAbility | BeforeFaint |  | Spend 2 trumpets to give the 2 nearest friends behind +4.<br>Spend 2 trumpets to give the 2 nearest friends behind +8.<br>Spend 2 trumpets to give the 2 nearest friends behind +12. |
| 173 | 3 | Weasel | 3/4 | WeaselAbility | BeforeFaint |  | Gain +1 gold on next turn.<br>Gain +2 gold on next turn.<br>Gain +3 gold on next turn. |
| 218 | 4 | Cockatoo | 4/2 | CockatooAbility | ThisBought |  | Give the highest tier friend +2/+2.<br>Give the highest tier friend +4/+4.<br>Give the highest tier friend +6/+6. |
| 176 | 4 | Cuddlefish | 8/4 | CuddlefishAbility | BeforeFaint |  | Remove 3 health from the last enemy and make it Ink.<br>Remove 3 health from the last 2 enemies and make them Ink.<br>Remove 3 health from the last 3 enemies and make them Ink. |
| 224 | 4 | Falcon | 5/5 | FalconAbility | Knockout | 3× per battle | Summon one 3/3 level 1 copy of it.<br>Summon one 6/6 level 2 copy of it.<br>Summon one 9/9 level 3 copy of it. |
| 192 | 4 | Manatee | 2/11 | ManateeAbility | EndTurn |  | Take 5 damage and give the nearest friend ahead +2/+1.<br>Take 5 damage and give the nearest friend ahead +4/+2.<br>Take 5 damage and give the nearest friend ahead +6/+3. |
| 240 | 4 | MantaRay | 5/7 | MantaRayAbility | EndTurn |  | Gain +2 gold next turn.<br>Gain +4 gold next turn.<br>Gain +6 gold next turn. |
| 252 | 4 | PoisonDartFrog | 5/2 | PoisonDartFrogAbility | FriendAheadDied |  | Deal 4 damage to the highest health enemy.<br>Deal 8 damage to the highest health enemy.<br>Deal 12 damage to the highest health enemy. |
| 257 | 4 | SaigaAntelope | 3/3 | SaigaAntelopeAbility | FriendFaints |  | Gain +3 trumpets.<br>Gain +6 trumpets.<br>Gain +9 trumpets. |
| 175 | 4 | Sealion | 2/4 | SealionAbility | EndTurn |  | Give friends behind +1 and friends ahead +1.<br>Give friends behind +2 and friends ahead +2.<br>Give friends behind +3 and friends ahead +3. |
| 262 | 4 | Slug | 4/4 | SlugAbility | Faint |  | Summon one 2/2 Smaller Slug that summons one 1/1 Smallest Slug.<br>Summon one 4/4 Smaller Slug that summons one 2/2 Smallest Slug.<br>Summon one 6/6 Smaller Slug that summons one 3/3 Smallest Slug. |
| 265 | 4 | Vaquita | 3/4 | VaquitaAbility | BeforeFaint |  | Gain {GainTrumpetsPercent(…}, and minimum +4 trumpets.<br>Gain {GainTrumpetsPercent(…}, and minimum +8 trumpets.<br>Gain {GainTrumpetsPercent(…}, and minimum +12 trumpets. |
| 271 | 5 | BlueRingedOctopus | 2/4 | BlueRingedOctopusAbility | ThisBought |  | Give friends +1/+1.<br>Give friends +2/+2.<br>Give friends +3/+3. |
| 219 | 5 | Crane | 6/5 | CraneAbility | FriendAheadHurt | L× per turn (all) | Give it Melon perk and +5. |
| 223 | 5 | Emu | 3/4 | EmuAbility | EmptyFrontSpace |  | Give nearest friend ahead +4 and move it to the front in battle.<br>Give nearest friend ahead +8 and move it to the front in battle.<br>Give nearest friend ahead +12 and move it to the front in battle. |
| 274 | 5 | FireAnt | 8/3 | FireAntAbility | BeforeFaint |  | Give attack to the highest tier friend.<br>Give attack to the 2 highest tier friends.<br>Give attack to the 3 highest tier friends. |
| 238 | 5 | Macaque | 2/2 | MacaqueAbility | StartBattle |  | Summon one 12/12 Orangutan with the same food perk as this.<br>Summon one 24/24 Orangutan with the same food perk as this.<br>Summon one 36/36 Orangutan with the same food perk as this. |
| 276 | 5 | NurseShark | 5/7 | NurseSharkAbility | BeforeFaint |  | Spend up to 6 trumpets and deal triple as damage to 1 random enemy.<br>Spend up to 6 trumpets and deal triple as damage to 2 random enemies.<br>Spend up to 6 trumpets and deal triple as damage to 3 random enemies. |
| 246 | 5 | Nyala | 3/4 | NyalaAbility | BeforeFaint |  | Gain +8 trumpets.<br>Gain +16 trumpets.<br>Gain +24 trumpets. |
| 259 | 5 | SecretaryBird | 3/5 | SecretaryBirdAbility | FriendFaints |  | Give the nearest friend ahead +3/+4.<br>Give the nearest friend ahead +6/+8.<br>Give the nearest friend ahead +9/+12. |
| 182 | 5 | WhiteWhale | 2/5 | WhiteWhaleAbility | FoodEatenByThis |  | Swallow the left-most shop pet and summon it at level 1 with base stats on faint.<br>Swallow the left-most shop pet and summon it at level 2 with {Double(L)} stats on faint.<br>Swallow the left-most shop pet and summon it at level 3 with {Double(L)} stats on faint. |
|  |  |  |  | WhiteWhaleAbilityExtra | Faint |  |  |
| 170 | 5 | Wolf | 4/4 | WolfAbility | Faint |  | Summon 3 3/2 Pigs.<br>Summon 3 6/4 Pigs.<br>Summon 3 9/6 Pigs. |
| 174 | 6 | Catfish | 4/6 | CatfishAbility | StartTurn | repeat L | Activate {0} ability on the nearest friend ahead once, or give it +4.<br>Activate {0} ability on the nearest friend ahead twice, or give it +8.<br>Activate {0} ability on the nearest friend ahead thrice, or give it +12. |
| 217 | 6 | Cobra | 12/6 | CobraAbility | FriendAheadAttacks |  | Deal [per-level %] attack damage to one random enemy. |
| 230 | 6 | GermanShepard | 10/6 | GermanShepardAbility | FriendSummoned |  | Give [per-level %] of attack to it until next turn. |
| 275 | 6 | GrizzlyBear | 6/8 | GrizzlyBearAbility | FriendlyAttacked |  | Deal 6 damage to two random enemies.<br>Deal 12 damage to two random enemies.<br>Deal 18 damage to two random enemies. |
| 186 | 6 | HighlandCow | 4/6 | HighlandCowAbility | StartBattle |  | Gain +1 trumpets for each 3 health this has.<br>Gain +2 trumpets for each 3 health this has.<br>Gain +3 trumpets for each 3 health this has. |
| 248 | 6 | Oyster | 2/10 | OysterAbility | BeforeSell |  | Gain +3 gold.<br>Gain +6 gold.<br>Gain +9 gold. |
| 181 | 6 | ParadiseBird | 3/3 | ParadiseBirdAbility | GoldSpent | 3× per turn (all) | Give three random friends +1/+1.<br>Give three random friends +2/+2.<br>Give three random friends +3/+3. |
| 253 | 6 | Pteranodon | 3/5 | PteranodonAbility | FriendFaints | L× per battle | Re-summon it behind this as a 1/1. |
| 266 | 6 | Warthog | 9/6 | WarthogAbility | BeforeFaint | repeat L | Give random friends +1/+1 for every 3 attack this has.<br>Give random friends +2/+2 for every 3 attack this has.<br>Give random friends +3/+3 for every 3 attack this has. |
| 268 | 6 | Wildebeest | 8/6 | WildebeestAbility | BeforeAttack | L× per battle | Spend 2 trumpets to gain {Perk()} perk. |

## Unicorn (Pack5) — 60 pets

| ID | Tier | Pet | Atk/HP | Ability | Trigger | Limit | L1 / L2 / L3 |
|---|---|---|---|---|---|---|---|
| 626 | 1 | AlchemistBug | 3/2 | AlchemistBugAbility | StartBattle |  | Give the nearest friend ahead +1 mana.<br>Give the nearest friend ahead +2 mana.<br>Give the nearest friend ahead +3 mana. |
| 628 | 1 | Baku | 1/4 | BakuAbility | EndTurn |  | Replace random ailments with +1 on 2 friends.<br>Replace random ailments with +2 on 2 friends.<br>Replace random ailments with +3 on 2 friends. |
| 621 | 1 | Barghest | 2/3 | BarghestAbility | StartBattle |  | Make the last perk-less enemy Scared.<br>Make the 2 last perk-less enemies Scared.<br>Make the 3 last perk-less enemies Scared. |
| 601 | 1 | Bunyip | 3/1 | BunyipAbility | StartBattle |  | Gain +1 for each roll (max 2).<br>Gain +2 for each roll (max 2).<br>Gain +3 for each roll (max 2). |
| 611 | 1 | CuddleToad | 2/3 | CuddleToadAbility | ThisSold |  | Choose one witch toy that breaks after 2 turns.<br>Choose one witch toy that breaks after 4 turns.<br>Choose one witch toy that breaks after 6 turns. |
| 617 | 1 | EggLadCovered | 1/4 | EggLadCoveredAbility | StartBattle |  | Faint and summon one 4/2 Cracked Egg.<br>Faint and summon one 8/4 Cracked Egg.<br>Faint and summon one 12/6 Cracked Egg. |
|  |  |  |  | EggLadCoveredAbilityExtra | Faint |  |  |
| 624 | 1 | Leafling | 3/2 | LeaflingAbility | EndTurn |  | Give +1 and Scared until next turn to the nearest friend ahead.<br>Give +2 and Scared until next turn to the nearest friend ahead.<br>Give +3 and Scared until next turn to the nearest friend ahead. |
| 362 | 1 | Murloc | 1/4 | MurlocAbility | FriendGainedExperience |  | Gain +1/+1.<br>Gain +2/+1.<br>Gain +3/+1. |
| 627 | 1 | Pengobble | 1/4 | PengobbleAbility | GainMana | 2× per turn (all) | Gain 2 bonus {Mana()}.<br>Gain 4 bonus {Mana()}.<br>Gain 6 bonus {Mana()}. |
| 379 | 1 | Tsuchinoko | 2/1 | TsuchinokoAbility | StartBattle |  | Jump to the front space and gain +1 experience.<br>Jump to the front space and gain +2 experience.<br>Jump to the front space and gain +3 experience. |
| 334 | 2 | Bigfoot | 2/3 | BigfootAbility | BeforeFaint |  | Gain one free roll next turn.<br>Gain 2 free rolls next turn.<br>Gain 3 free rolls next turn. |
| 341 | 2 | DropBear | 2/2 | DropBearAbility | EmptyFrontSpace |  | Jump to the front and deal 3 damage to the last enemy in battle.<br>Jump to the front and deal 6 damage to the last enemy in battle.<br>Jump to the front and deal 9 damage to the last enemy in battle. |
| 344 | 2 | FrostWolf | 2/3 | FrostWolfAbility | BeforeFaint |  | Make the first enemy Frozen.<br>Make the first enemy Frozen twice for {Double(L)} effect.<br>Make the first enemy Frozen thrice for {Double(L)} effect. |
| 345 | 2 | Gargoyle | 3/3 | GargoyleAbility | BeforeFaint |  | Give the nearest friend behind +2. Spend {Mana()} to give 1 more per mana.<br>Give the nearest friend behind +4. Spend {Mana()} to give 2 more per mana.<br>Give the nearest friend behind +6. Spend {Mana()} to give 3 more per mana. |
| 346 | 2 | GhostKitten | 4/3 | GhostKittenAbility |  |  | Takes 3 less damage from abilities.<br>Takes 6 less damage from abilities.<br>Takes 9 less damage from abilities. |
| 353 | 2 | Jackalope | 1/4 | JackalopeAbility | BeforeFriendAttacks | 3× per battle | Give it +1. Double if it jumped.<br>Give it +2. Double if it jumped.<br>Give it +3. Double if it jumped. |
| 604 | 2 | Mothman | 3/3 | MothmanAbility | AnyoneGainedAilment | 5× per turn (all) | Gain +1/+1.<br>Gain +2/+2.<br>Gain +3/+3. |
| 639 | 2 | Ogopogo | 3/1 | OgopogoAbility | StartBattle |  | Give the front-most friend +1 experience.<br>Give the 2 front-most friends +1 experience.<br>Give the 3 front-most friends +1 experience. |
| 610 | 2 | Thunderbird | 2/3 | ThunderbirdAbility | StartBattle |  | Give the second nearest friend ahead +3 mana.<br>Give the second nearest friend ahead +6 mana.<br>Give the second nearest friend ahead +9 mana. |
| 385 | 2 | Wyvern | 3/4 | WyvernAbility | FriendlyLeveledUp |  | Gain 1 extra shop reward.<br>Gain 2 extra shop reward.<br>Gain 3 extra shop reward. |
| 336 | 3 | Calygreyhound | 4/4 | CalygreyhoundAbility | BeforeFaint |  | Spend {Mana()} to remove 1 health per mana from the 2 most healthy enemies.<br>Spend {Mana()} to remove 2 health per mana from the 2 most healthy enemies.<br>Spend {Mana()} to remove 3 health per mana from the 2 most healthy enemies. |
| 653 | 3 | FurBearingTrout | 3/5 | FurBearingTroutAbility | BeforeFaint |  | Give Rambutan perk to the nearest friend behind.<br>Give Rambutan perk to the 2 nearest friends behind.<br>Give Rambutan perk to the 3 nearest friends behind. |
| 348 | 3 | Griffin | 5/4 | GriffinAbility | ThisBought |  | Choose one level 1 toy from Griffin's collection.<br>Choose one level 2 toy from Griffin's collection.<br>Choose one level 3 toy from Griffin's collection. |
| 349 | 3 | Headcrab | 1/2 | HeadcrabAbility | EmptyFrontSpace |  | Jump to the front and gain +2 and Melon perk in battle.<br>Jump to the front and gain +4 and Melon perk in battle.<br>Jump to the front and gain +6 and Melon perk in battle. |
| 623 | 3 | LuckyCat | 1/2 | LuckyCatAbility | LeveledUpThis |  | Gain +2/+2 now and +2 gold next turn.<br>Gain +4/+4 now and +4 gold next turn.<br>No ability. |
| 635 | 3 | ManaHound | 4/3 | ManaHoundAbility | StartBattle |  | Give the nearest friend ahead +2 mana for each roll this turn, up to 3 rolls.<br>Give the nearest friend ahead +4 mana for each roll this turn, up to 3 rolls.<br>Give the nearest friend ahead +6 mana for each roll this turn, up to 3 rolls. |
| 357 | 3 | Mandrake | 4/3 | MandrakeAbility | StartBattle |  | Make one tier 2 or lower enemy Deaf and prioritize <b>Faint</b> pets.<br>Make one tier 4 or lower enemy Deaf and prioritize <b>Faint</b> pets.<br>Make one tier 6 or lower enemy Deaf and prioritize <b>Faint</b> pets. |
| 364 | 3 | Ouroboros | 2/4 | OuroborosAbility | ShopRolled |  | Give new shop pets +1/+1 for each roll, up to 5 rolls.<br>Give new shop pets +2/+2 for each roll, up to 5 rolls.<br>Give new shop pets +3/+3 for each roll, up to 5 rolls. |
| 374 | 3 | SkeletonDog | 3/3 | SkeletonDogAbility | BeforeFaint |  | Give 1 random friend permanent +1/+1.<br>Give 2 random friends permanent +1/+1.<br>Give 3 random friends permanent +1/+1. |
| 654 | 3 | Tatzelwurm | 1/3 | TatzelwurmAbility | FriendAheadDied |  | Deal 2 damage to the first enemy. Double if the friend was level 3.<br>Deal 4 damage to the first enemy. Double if the friend was level 3.<br>Deal 6 damage to the first enemy. Double if the friend was level 3. |
| 330 | 4 | AntLion | 4/4 | AntLionAbility | EmptyFrontSpace |  | Jump to the front and deal 3 damage to the 2 first enemies.<br>Jump to the front and deal 6 damage to the 2 first enemies.<br>Jump to the front and deal 9 damage to the 2 first enemies. |
| 338 | 4 | Chimera | 2/6 | ChimeraAbility | Faint |  | {…} |
| 630 | 4 | Cyclops | 2/5 | CyclopsAbility | FriendLeveledUp |  | Give it +2 mana. Also give +1 experience on the first trigger this turn.<br><br> |
| 355 | 4 | Kraken | 5/7 | KrakenAbility | StartBattle |  | Remove {Health(*(…(…,3) + 32 + …)} from ALL other pets. |
| 360 | 4 | Minotaur | 3/3 | MinotaurAbility | FriendAheadAttacks |  | Gain +1/+1 for each of the friend's level.<br>Gain +2/+2 for each of the friend's level.<br>Gain +3/+3 for each of the friend's level. |
| 369 | 4 | Roc | 4/4 | RocAbility | StartBattle |  | Give one friend ahead +2 mana. Repeat 3 times and spread evenly.<br>Give one friend ahead +2 mana. Repeat 6 times and spread evenly.<br>Give one friend ahead +2 mana. Repeat 9 times and spread evenly. |
| 371 | 4 | Sandworm | 4/1 | SandwormAbility | EndTurn |  | Give adjacent friends +1/+1 for every 4 roll, up to 8 rolls.<br>Give adjacent friends +2/+2 for every 4 roll, up to 8 rolls.<br>Give adjacent friends +3/+3 for every 4 roll, up to 8 rolls. |
| 373 | 4 | Shoggoth | 6/5 | ShoggothAbility | EndTurn |  | Swallow and copy the left-most unfrozen shop pet until next turn.<br>Swallow and copy the 2 left-most unfrozen and different shop pets until next turn.<br>Swallow and copy the 3 left-most unfrozen and different shop pets until next turn. |
| 380 | 4 | Unicorn | 2/4 | UnicornAbility | FriendGainedAilment | L× per turn (all) | Replace it with permanent +2/+2. |
| 386 | 4 | Xenomorph | 7/5 | XenomorphAbility | BeforeFaint |  | Make ALL pets within 1 space Acid.<br>Make ALL pets within 2 spaces Acid.<br>Make ALL pets within 3 spaces Acid. |
| 631 | 5 | Amalgam | 4/5 | AmalgamAbility | FriendSummoned | 2× per turn (all) | Give it +3 and +4 mana and Scared.<br>Give it +6 and +8 mana and Scared.<br>Give it +9 and +12 mana and Scared. |
| 613 | 5 | BadDog | 3/3 | BadDogAbility | ThisBought |  | Choose one level 1 toy that brings doom and chaos!<br>Choose one level 2 toy that brings doom and chaos!<br>Choose one level 3 toy that brings doom and chaos! |
| 354 | 5 | Kitsune | 2/7 | KitsuneAbility | BeforeFriendFaints |  | Transfer all friendly {Mana()} + 2 to nearest friend ahead.<br>Transfer all friendly {Mana()} + 4 to nearest friend ahead.<br>Transfer all friendly {Mana()} + 6 to nearest friend ahead. |
| 640 | 5 | LovelandFrogman | 1/5 | LovelandFrogmanAbility | BeforeFriendAttacks |  | Give it +1/+2 once. Permanent if it jumped.<br>Give it +2/+4 once. Permanent if it jumped.<br>Give it +3/+6 once. Permanent if it jumped. |
| 363 | 5 | Nessie | 3/5 | NessieAbility | Faint |  | Summon one 3/3 Boat. If it's your first Boat this battle, give it {GainBuffShort(L, L)} for each roll.<br>Summon one 6/6 Boat. If it's your first Boat this battle, give it {GainBuffShort(L, L)} for each roll.<br>Summon one 9/9 Boat. If it's your first Boat this battle, give it {GainBuffShort(L, L)} for each roll. |
| 619 | 5 | Pixiu | 5/6 | PixiuAbility | BeforeFaint |  | Spend 4 mana to gain +3 gold next turn.<br>Spend 4 mana to gain +6 gold next turn.<br>Spend 4 mana to gain +9 gold next turn. |
| 368 | 5 | RedDragon | 4/8 | RedDragonAbility | StartBattle |  | Make the last enemy Burn.<br>Make the 2 last enemies Burn.<br>Make the 3 last enemies Burn. |
| 370 | 5 | SalmonofWisdom | 5/5 | SalmonofWisdomAbility | StartBattle |  | Give the 2 front-most friends AND enemies +2 experience.<br>Give the 2 front-most friends AND enemies +4 experience.<br>Give the 2 front-most friends AND enemies +6 experience. |
| 381 | 5 | VampireBat | 2/5 | VampireBatAbility | EnemyGainedAilment | 2× per battle | Deal 4 damage to it and gain damage as {Health()}.<br>Deal 8 damage to it and gain damage as {Health()}.<br>Deal 12 damage to it and gain damage as {Health()}. |
| 383 | 5 | Werewolf | 7/7 | WerewolfAbility | StartBattle |  | If turn number is even, gain +[per-level %] attack and health. Otherwise gain 1 mana.<br>If turn number is even, gain +[per-level %] attack and health. Otherwise gain 2 mana.<br>If turn number is even, gain +[per-level %] attack and health. Otherwise gain 3 mana. |
| 333 | 6 | Behemoth | 12/12 | BehemothAbility | EndTurn |  | Gain +2/+2. Attack and health can go up to 100!<br>Gain +4/+4. Attack and health can go up to 100!<br>Gain +6/+6. Attack and health can go up to 100! |
| 337 | 6 | Cerberus | 9/9 | CerberusAbility | EmptyFrontSpace | L× per battle | Summon one 8/8 Fire Pup at level 3 up front. |
| 352 | 6 | Hydra | 10/6 | HydraAbility | Faint | repeat L | Summon one 5/5 Head for each 10 attack this has.<br>Summon one 10/10 Head for each 10 attack this has.<br>Summon one 15/15 Head for each 10 attack this has. |
| 358 | 6 | Manticore | 7/4 | ManticoreAbility |  |  | Enemy ailments are 2 times worse.<br>Enemy ailments are 3 times worse.<br>Enemy ailments are 4 times worse. |
| 366 | 6 | Phoenix | 8/8 | PhoenixAbility | BeforeFaint |  | Make ANY 3 random pets Burn, then summon one 4/4 Young Phoenix.<br>Make ANY 6 random pets Burn, then summon one 8/8 Young Phoenix.<br>Make ANY 9 random pets Burn, then summon one 12/12 Young Phoenix. |
|  |  |  |  | PhoenixAbilityExtra | Faint |  |  |
| 367 | 6 | Quetzalcoatl | 4/8 | QuetzalcoatlAbility | EndTurn | repeat L | Give 1 random tier 3 or lower friend +2 experience. |
| 372 | 6 | SeaSerpent | 6/6 | SeaserpentAbility | BeforeFaint |  | This pet's {Mana()} damage hits the most healthy enemy and 1 extra enemy.<br>This pet's {Mana()} damage hits the most healthy enemy and 2 extra enemies.<br>This pet's {Mana()} damage hits the most healthy enemy and 3 extra enemies. |
| 606 | 6 | Sleipnir | 8/5 | SleipnirAbility | StartBattle |  | Give the front-most friend +1 mana for each 2 attack this has.<br>Give the 2 front-most friends +1 mana for each 2 attack this has.<br>Give the 3 front-most friends +1 mana for each 2 attack this has. |
| 636 | 6 | TeamSpirit | 4/5 | TeamSpiritAbility | FriendLeveledUp |  | Give friends +1/+1.<br>Give friends +2/+2.<br>Give friends +3/+3. |
| 387 | 6 | Yeti | 5/9 | YetiAbility | StartTurn |  | Roll 4 times while freezing pet copies and tier 6 food.<br>Roll 8 times while freezing pet copies and tier 6 food.<br>Roll 12 times while freezing pet copies and tier 6 food. |

## Danger — 61 pets

| ID | Tier | Pet | Atk/HP | Ability | Trigger | Limit | L1 / L2 / L3 |
|---|---|---|---|---|---|---|---|
| 388 | 1 | AfricanWildDog | 3/2 | AfricanWildDogAbility | StartBattle |  | Jump attack the second enemy for 3 damage.<br>Jump attack the second enemy for 6 damage.<br>Jump attack the second enemy for 9 damage. |
| 401 | 1 | BombusDahlbomii | 1/2 | BombusDahlbomiiAbility | EnemyAttacked | 2× per battle | Deal 1 damage to the first enemy.<br>Deal 2 damage to the first enemy.<br>Deal 3 damage to the first enemy. |
| 406 | 1 | EthiopianWolf | 3/1 | EthiopianWolfAbility | BeforeFaint |  | Remove 1 attack from the first enemy.<br>Remove 1 attack from the first 2 enemies.<br>Remove 1 attack from the first 3 enemies. |
| 408 | 1 | FanMussel | 2/2 | FanMusselAbility |  | 2× per turn (all) | Takes 1 less damage.<br>Takes 2 less damage.<br>Takes 3 less damage. |
| 417 | 1 | IliPika | 2/3 | IliPikaAbility | FriendTransformed |  | Give it +1 to its highest stat until next turn.<br>Give it +2 to its highest stat until next turn.<br>Give it +3 to its highest stat until next turn. |
| 418 | 1 | IriomoteCat | 2/2 | IriomoteCatAbility | BeforeStartBattle |  | Transform into ANY useful level 1 pet from tier 1.<br>Transform into ANY useful level 1 pet from tier 2.<br>Transform into ANY useful level 1 pet from tier 3. |
| 421 | 1 | MalayTapir | 2/2 | MalayTapirAbility | AdjacentFriendAttacked | 3× per turn (all) | Gain +1.<br>Gain +2.<br>Gain +3. |
| 713 | 1 | TogianBabirusa | 3/3 | TogianBabirusaAbility | BeforeFaint |  | Give one random enemy +1. |
| 438 | 1 | ToothBilledPigeon | 3/1 | ToothBilledPigeonAbility | ThisSold |  | Stock 1 {Price()} 1.<br>Stock 2 {Price()} 2.<br>Stock 3 {Price()} 3. |
| 440 | 1 | VolcanoSnail | 1/4 | VolcanoSnailAbility | BeforeFaint |  | Make one random perk-less enemy Toasty.<br>Make 2 random perk-less enemies Toasty.<br>Make 3 random perk-less enemies Toasty. |
| 821 | 2 | AngryPygmyHog | 5/5 | AngryPygmyHogAbility |  |  | Really angry! |
| 394 | 2 | AraripeManakin | 3/3 | AraripeManakinAbility | FriendJumped, FriendTransformed, Composite | 2× per turn (all) | Gain +2 until next turn.<br>Gain +4 until next turn.<br>Gain +6 until next turn. |
| 404 | 2 | DarwinsFox | 3/4 | DarwinsFoxAbility | EnemyHurt | L× per battle | Jump-attack it, or the first enemy. |
| 407 | 2 | EuropeanMink | 4/3 | EuropeanMinkAbility | AdjacentFriendAttacked | 5× per turn (all) | Give adjacent friends +1.<br>Give adjacent friends +2.<br>Give adjacent friends +3. |
| 425 | 2 | ProboscisMonkey | 4/3 | ProboscisMonkeyAbility | StartTurn |  | Transform the nearest friend ahead into another pet from the same tier.<br>Transform the nearest 2 friends ahead into other pets from the same tier.<br>Transform the nearest 3 friends ahead into other pets from the same tier. |
| 427 | 2 | PygmyHog | 1/2 | PygmyHogAbility | EnemyAttacked |  | Transform into an Angry Hog with Garlic and at least 5 {Attack()} and {Health()}.<br>Transform into an Angry Hog with Garlic and at least 10 {Attack()} and {Health()}.<br>Transform into an Angry Hog with Garlic and at least 15 {Attack()} and {Health()}. |
| 430 | 2 | SakerFalcon | 2/3 | SakerFalconAbility | BeforeAttack | 3× per turn (all) | If outnumbered, gain +2/+2.<br>If outnumbered, gain +4/+4.<br>If outnumbered, gain +6/+6. |
| 431 | 2 | Saola | 2/2 | SaolaAbility | EndTurn |  | Give the highest attack friend +-1/+2.<br>Give the 2 highest attack friends +-1/+2.<br>Give the 3 highest attack friends +-1/+2. |
| 435 | 2 | TaitaShrew | 2/2 | TaitaShrewAbility | StartBattle |  | Transform into a level 1 Weasel.<br>Transform into a level 2 Weasel.<br>Transform into a level 3 Weasel. |
| 715 | 2 | Takhi | 2/2 | TakhiAbility | Faint |  | Summon one 3/2 African Wild Dog that jump-attacks the second enemy.<br>Summon one 6/4 African Wild Dog that jump-attacks the second enemy.<br>Summon one 9/6 African Wild Dog that jump-attacks the second enemy. |
| 441 | 2 | WhiteBelliedHeron | 4/2 | WhiteBelliedHeronAbility | StartBattle |  | Give to the friend ahead with {Double(…} effect. |
| 389 | 3 | AmamiRabbit | 1/4 | AmamiRabbitAbility | StartBattle |  | Gain +1 permanently and jump-attack the highest attack enemy.<br>Gain +2 permanently and jump-attack the highest attack enemy.<br>Gain +3 permanently and jump-attack the highest attack enemy. |
| 400 | 3 | BlueThroatedMacaw | 3/4 | BlueThroatedMacawAbility | FriendTransformed |  | If it is ahead, give it +3 until next turn. Otherwise give {Health()}.<br>If it is ahead, give it +6 until next turn. Otherwise give {Health()}.<br>If it is ahead, give it +9 until next turn. Otherwise give {Health()}. |
| 717 | 3 | Hirola | 2/2 | HirolaAbility | Faint |  | Summon 1 4/undefined Ethiopian Wolf.<br>Summon 2 4/undefined Ethiopian Wolves.<br>Summon 3 4/undefined Ethiopian Wolves. |
| 422 | 3 | MonkeyFacedBat | 3/4 | MonkeyFacedBatAbility | AnyoneBehindHurt | 3× per battle | Give two random friendly pets +1/+1.<br>Give two random friendly pets +2/+2.<br>Give two random friendly pets +3/+3. |
| 426 | 3 | PygmyHippo | 2/7 | PygmyHippoAbility | EnemyAttacked |  | Deal [per-level %] of {Health()} as {Damage()} to the least healthy enemy.<br>Deal [per-level %] of {Health()} as {Damage()} to the 2 least healthy enemies.<br>Deal [per-level %] of {Health()} as {Damage()} to the 3 least healthy enemies. |
| 429 | 3 | RolowayMonkey | 1/4 | RolowayMonkeyAbility | StartBattle |  | Transform the 2 friends ahead into level 1 <b>Faint</b> pets from tier 2 and 3.<br>Transform the 2 friends ahead into level 2 <b>Faint</b> pets from tier 2 and 3.<br>Transform the 2 friends ahead into level 3 <b>Faint</b> pets from tier 2 and 3. |
| 433 | 3 | SpoonBilledSandpiper | 2/2 | SpoonBilledSandpiperAbility | StartTurn |  | Give the nearest friend behind +2 to their lowest stat.<br>Give the nearest 2 friends behind +2 to their lowest stat.<br>Give the nearest 3 friends behind +2 to their lowest stat. |
| 719 | 3 | Takin | 2/3 | TakinAbility | AdjacentFriendAttacked |  | Gain +1/+1. Triple on every third trigger.<br>Gain +2/+2. Triple on every third trigger.<br>Gain +3/+3. Triple on every third trigger. |
| 534 | 3 | TreeKangaroo | 3/5 | TreeKangarooAbility | StartBattle |  | Make the last perk-less enemy Silly and activate it.<br>Make the last perk-less enemy Silly and activate it twice.<br>Make the last perk-less enemy Silly and activate it thrice. |
| 439 | 3 | Tucuxi | 2/3 | TucuxiAbility | BeforeFaint |  | Push the back-most friend to the front and give it +3/+3 in battle.<br>Push the back-most friend to the front and give it +6/+6 in battle.<br>Push the back-most friend to the front and give it +9/+9 in battle. |
| 390 | 4 | AmazonRiverDolphin | 4/5 | AmazonRiverDolphinAbility | AdjacentFriendAttacked |  | Deal 3 damage to its target, or gain +3.<br>Deal 6 damage to its target, or gain +6.<br>Deal 9 damage to its target, or gain +9. |
| 392 | 4 | Angelshark | 3/3 | AngelsharkAbility | EndTurn |  | Give friends +1 to their highest stat.<br>Give friends +2 to their highest stat.<br>Give friends +3 to their highest stat. |
| 402 | 4 | Bonobo | 3/3 | BonoboAbility | StartTurn |  | Transform into the front-most friend. |
| 410 | 4 | GiantOtter | 4/3 | GiantOtterAbility | BeforeStartBattle |  | Give friends +2/+5 until after the first non-jump attack.<br>Give friends +4/+10 until after the first non-jump attack.<br>Give friends +6/+15 until after the first non-jump attack. |
|  |  |  |  | GiantOtterAbility2 | AnyoneAttacks, BeforeFaint, BeforeTransform, Composite | 1× per turn (all) |  |
| 412 | 4 | GiantTortoise | 4/6 | GiantTortoiseAbility | EndTurn |  | Gain +2, and set {Attack()} to 4. Health can go to 100!<br>Gain +4, and set {Attack()} to 8. Health can go to 100!<br>Gain +6, and set {Attack()} to 12. Health can go to 100! |
| 720 | 4 | GoldenTamarin | 4/4 | GoldenTamarinAbility | BeforeStartBattle |  | Transform into a level 1 <b>Start of Battle</b> pet from tier 4 and 5.<br>Transform into a level 2 <b>Start of Battle</b> pet from tier 4 and 5.<br>Transform into a level 3 <b>Start of Battle</b> pet from tier 4 and 5. |
| 416 | 4 | HumpheadWrasse | 6/4 | HumpheadWrasseAbility | StartBattle |  | Remove {Attack(*(…(…,3) + 32 + …)} from the highest attack enemy. |
| 419 | 4 | Kakapo | 4/4 | KakapoAbility | AfterFirstAttack | repeat L | Make the highest attack enemy Cowardly. |
| 420 | 4 | LongcombSawfish | 3/3 | LongcombSawfishAbility | EnemyAttacked |  | Gain +4 and remove 4 health from all enemies.<br>Gain +8 and remove 8 health from all enemies.<br>Gain +12 and remove 12 health from all enemies. |
| 437 | 4 | TasmanianDevil | 2/6 | TasmanianDevilAbility | StartBattle |  | Make the lowest attack enemy 5x Scared and jump-attack it.<br>Make the lowest attack enemy 10x Scared and jump-attack it.<br>Make the lowest attack enemy 15x Scared and jump-attack it. |
| 395 | 5 | AyeAye | 3/5 | AyeAyeAbility | EnemyAttacked |  | Summon two Lemurs and give all friends +3/+3.<br>Summon two Lemurs and give all friends +6/+6.<br>Summon two Lemurs and give all friends +9/+9. |
|  |  |  |  | AyeAyeAbility2 | ThisCharged |  |  |
| 396 | 5 | BanggaiCardinalfish | 6/5 | BanggaiCardinalfishAbility | StartBattle |  | Remove 6 attack from ALL other pets to a minimum of 4 attack.<br>Remove 12 attack from ALL other pets to a minimum of 4 attack.<br>Remove 18 attack from ALL other pets to a minimum of 4 attack. |
| 409 | 5 | GeometricTortoise | 3/10 | GeometricTortoiseAbility | Hurt |  | Deal [per-level %] of damage taken as {Damage()} to one random enemy. |
| 411 | 5 | GiantPangasius | 7/5 | GiantPangasiusAbility | BeforeFaint | repeat L | Deal 4 damage to one random enemy for each friendly transformation this turn.<br>Deal 8 damage to one random enemy for each friendly transformation this turn.<br>Deal 12 damage to one random enemy for each friendly transformation this turn. |
| 414 | 5 | HawaiianMonkSeal | 3/4 | HawaiianMonkSealAbility | StartTurn |  | Give friends that fainted last battle +2.<br>Give friends that fainted last battle +4.<br>Give friends that fainted last battle +6. |
| 532 | 5 | MarineIguana | 4/5 | MarineIguanaAbility | BeforeFriendAttacks | L× per turn (all) | Give it Melon. Works on 1 friend per turn.<br>Give it Melon. Works on 2 different friends per turn.<br>Give it Melon. Works on 3 different friends per turn. |
| 423 | 5 | PaintedTerrapin | 4/6 | PaintedTerrapinAbility | BeforeFaint |  | Give WhiteOkra perk to the nearest friend behind.<br>Give WhiteOkra perk to the 2 nearest friends behind.<br>Give WhiteOkra perk to the 3 nearest friends behind. |
| 428 | 5 | RedPanda | 4/4 | RedPandaAbility | ThisBought |  | Choose and transform into a pet from the next shop tier from ANY pack. |
| 716 | 5 | SnowLeopard | 3/5 | SnowLeopardAbility | StartBattle |  | Gain +5/+5 and jump-attack one random enemy.<br>Gain +10/+10 and jump-attack one random enemy.<br>Gain +15/+15 and jump-attack one random enemy. |
| 436 | 5 | TaitaThrush | 3/4 | TaitaThrushAbility | AdjacentFriendAttacked | 3× per turn (all) | Give friendly pets +1/+1.<br>Give friendly pets +2/+2.<br>Give friendly pets +3/+3. |
| 391 | 6 | AmsterdamAlbatross | 3/6 | AmsterdamAlbatrossAbility | FriendTransformed | 2× per turn (all) | Give it permanent +2/+2.<br>Give it permanent +4/+4.<br>Give it permanent +6/+6. |
| 397 | 6 | BayCat | 7/5 | BayCatAbility | Faint |  | Summon 1 <b>Start of Battle</b> pet from tier 4 and activate its ability.<br>Summon 2 <b>Start of Battle</b> pets from tier 4 and activate their abilities.<br>Summon 3 <b>Start of Battle</b> pets from tier 4 and activate their abilities. |
| 398 | 6 | BlackRhino | 7/7 | BlackRhinoAbility | EnemyAttacked |  | Deal 30 damage to the most healthy enemy.<br>Deal 30 damage to the 2 most healthy enemies.<br>Deal 30 damage to the 3 most healthy enemies. |
| 399 | 6 | BlueWhale | 12/12 | BlueWhaleAbility | StartTurn |  | Sell friends for +2 extra {Gold()} each and give future shop pets +2/+2.<br>Sell friends for +2 extra {Gold()} each and give future shop pets +4/+4.<br>Sell friends for +2 extra {Gold()} each and give future shop pets +6/+6. |
| 403 | 6 | CaliforniaCondor | 10/6 | CaliforniaCondorAbility | FriendTransformed | 2× per battle | Gain its level 1 ability.<br>Gain its level 2 ability.<br>Gain its level 3 ability. |
| 413 | 6 | GreenSeaTurtle | 5/6 | GreenSeaTurtleAbility | EnemyAttacked | 1× per turn (all) | Give all friendly pets Melon that blocks 20 damage.<br>Give all friendly pets Melon that blocks 40 damage.<br>Give all friendly pets Melon that blocks 60 damage. |
| 415 | 6 | HelmetedHornbill | 5/4 | HelmetedHornBillAbility | EndTurn |  | Give three friends +2 to their lowest stat.<br>Give three friends +4 to their lowest stat.<br>Give three friends +6 to their lowest stat. |
| 424 | 6 | PhilippineEagle | 7/6 | PhilippineEagleAbility | AnyoneJumped |  | Give one random friendly pet +4/+4.<br>Give one random friendly pet +8/+8.<br>Give one random friendly pet +12/+12. |
| 432 | 6 | SilkySifaka | 4/6 | SilkySifakaAbility | StartBattle |  | Transform two friends behind into ANY useful level 1 <b>Faint</b> pets from tier 6.<br>Transform two friends behind into ANY useful level 2 <b>Faint</b> pets from tier 6.<br>Transform two friends behind into ANY useful level 3 <b>Faint</b> pets from tier 6. |
| 434 | 6 | SumatranTiger | 9/9 | SumatranTigerAbility | StartBattle |  | Jump-attack the opposite enemy.<br>Jump-attack the opposite enemy and deal 6 damage to adjacent enemies.<br>Jump-attack the opposite enemy and deal 12 damage to adjacent enemies. |

## Tokens (summon-only) — 42

| ID | Pet | Atk/HP (template) | Ability |
|---|---|---|---|
| 709 | BabyMammoth | 2/4 | BabyMammothAbility: Give friends +1/+1. |
| 788 | CuckooBaby | 1/1 | CuckooBabyAbility: Attack and health can't go over 1. |
| 702 | Quail | 2/2 | QuailAbility: Give front-most friend +2/+2. Double in battle. |
| 780 | GeladaSleeping | 3/7 | GeladaSleepingAbility: Feed 1 Pear to each friend. |
| 777 | FlounderAdult | 2/4 | FlounderAdultAbility: Give two back-most friends 1 experience. |
| 58 | RatToken | 1/1 | — |
| 4 | Bee | 1/1 | — |
| 86 | CricketToken | 1/1 | — |
| 31 | FlyToken | 4/4 | — |
| 85 | Bus | 5/3 | — |
| 13 | Chick | 1/1 | — |
| 62 | Ram | 2/2 | — |
| 183 | ChinchillaToken | 2/2 | — |
| 508 | Nest | 2/3 | NestAbility: Egg perk has regular effect. |
| 9 | Butterfly | 1/1 | ButterflyAbility: Copy [per-level table] attack and health from the strongest enemy. |
| 822 | BabySeaUrchin | 3/2 | BabySeaUrchinAbility: Remove 4 health from the first enemy. |
| 712 | MimicOctopus | 4/7 | MimicOctopusAbility: Deal 4 damage to the least healthy enemy. |
| 710 | CockroachToken | 1/1 | CockroachTokenAbility: Does not provide shop rewards on level-up. |
| 771 | FairyArmadilloBall | 2/6 | FairyArmadilloBallAbility: Takes 2 less damage. |
| 562 | Salmon | 5/5 | SalmonAbility: Deal 5 damage to 1 random enemy. Repeat for every 25 health this has. |
| 282 | LizardToken | 3/1 | — |
| 188 | GoldenRetriever | 1/1 | GoldenRetrieverAbility: Always there for his friends! |
| 270 | SlugToken | 2/2 | SlugTokenAbility: Summon one 1/1 Smallest Slug. |
| 477 | SlugToken2 | 1/1 | — |
| 641 | DayCrawler | 1/1 | — |
| 658 | GoodDog | 1/1 | GoodDogAbility: Give friends lots of useful perks! |
| 819 | ThorGoats | 1/1 | ThorGoatsAbility: Summon a level 1 Thunder Hammer. |
| 644 | GiantEyesDog | 1/1 | — |
| 643 | HydraHead | 5/5 | — |
| 642 | SmallerSlime | 2/2 | — |
| 638 | Rock | 1/1 | — |
| 343 | FirePup | 8/8 | FirePupAbility: — |
| 384 | WhiteKillerRabbit | 3/3 | WhiteKillerRabbitAbility: Attack for {Double(L + 1)} damage. |
| 614 | FakeNessie | 1/2 | FakeNessieAbility:  |
| 646 | BabyPhoenix | 6/6 | BabyPhoenixAbility: — |
| 361 | MochaDick | 8/8 | MochaDickAbility: Remove this.<br>MochaDickAbilityExtra: Remove this. |
| 351 | Hippogriff | 5/5 | EagleAbility: Summon one 5/5 level 1 pet from the next shop tier.<br>HorseAbility: Give it +1 until next turn.<br>HippogriffAbility: — |
| 647 | EggLadCracked | 4/2 | — |
| 648 | ChimeraGoat | 1/1 | — |
| 649 | ChimeraSnake | 1/1 | — |
| 650 | ChimeraLion | 1/1 | — |
| 335 | Cthulu | 7/13 | CthuluAbility: Deal 5 damage to ALL other pets. |

Other builders (custom/beta/relic/bully/test, 335 entries) are in the full data export.
