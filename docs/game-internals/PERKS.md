# Perks, foods and ailments in battle

Source: `DamageAttemptMutator.ProcessAttacker / ProcessDefenderPerks / ProcessDefenderAilments / TryDamage`, `DamageCalculation`,
`AbilityConstants` constants, and the real `Perk` enum values decoded from the metadata. They match declaration order, e.g. Weak=10,
Churros=70, Macaron=117. `×n` = the holder's perk (or ailment) multiplier.

## Attacker perks (modify outgoing damage)
| Perk | Effect | Operation |
|---|---|---|
| MeatBone | +3×n | FlatBonus |
| Guava | +3×n | FlatBonus |
| HoneydewMelon | +5×n | FlatBonus |
| Pineapple | +2×n (ability damage) | FlatBonus |
| Kiwano | +8×n | FlatBonus |
| Date | +10×n | FlatBonus |
| Steak | +20×n | FlatBonus |
| Cheese | at least 15×n | Min |
| Sticky | at most 5 | Max |
| Salt, FortuneCookie (+chance), Drowsy (sign-dependent) | +Multiplier | additive multiplier |
| MapleSyrup, Drowsy | halving | Halfer |
| Peanut, PeanutButter | lethal | Killify (PeanutButter keeps a Peanut-like consume rule) |
| Ink | ceiling reduction 3×n | CeilReduction |
| Tribe advantage | +1 Multiplier | Fire > Grass > Thunder > Water > Fire |

## Defender perks (reduce incoming damage)
| Perk | Effect | Operation |
|---|---|---|
| Coconut | 0 damage | Nullify |
| Melon | −20×n | FlatReduction |
| Potato, WaterMelon, HoneydewMelon (defence) | −10×n | FlatReduction |
| Ambrosia | −8×n | FlatReduction |
| Lemon | −7×n | FlatReduction |
| BrusselsSprout | −5×n | FlatReduction |
| Eucalyptus | −4×n (conditional) | FlatReduction |
| Guava (defence) | −3×n | FlatReduction |
| Garlic | −2×n, never below 2 | CeilReduction, limit 2 |
| Lime | ceiling reduction | CeilReduction |
| BokChoy | survive a lethal non-killify hit: +3 HP, perk lost | after damage |

## Defender ailments
| Ailment | Effect |
|---|---|
| Weak | +3×n (reversed: −3×n) |
| Frozen | +5×n |
| Acid | +Multiplier n (reversed: Halfer) |
| Scared | stack handling |
| Deaf | holder's own abilities don't trigger (TryTriggerMinion gate) |

## Perks and ailments that act on triggers
Bloated, Curse, Web, Croissant, IceCream, Confused, Cod Roe and others: 112 definitions in PERK-ABILITIES.md. These run
through the same trigger path as pet abilities, after the holder's own abilities.

## Order of operations
See BATTLE-LOOP.md §7. The essential points:
- every `Add*` is additive;
- Fixed overrides Min and Max;
- halving is followed by a single ceil;
- flat armour applies last, after all multipliers.

## Not yet extracted
- Shop-side food effects (stats, XP, gold from `SpellConstants`). These were decompiled (`SpellConstants.*`) but not yet
  tabulated, because they don't affect battles.
- The full PerkTemplate list (durability, duration, perk tiers) from `PerkConstants.CreatePerks`. It's decompiled and will be tabulated in Phase 2.
