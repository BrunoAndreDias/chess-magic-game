# Classes: Astromancer, Weaver, Gravecaller, Bellringer

These four replace the Warden, Wizard, Ranger, Cleric and Rogue, and the Gravecaller and Bellringer replace the Delver. This file is the design and the rules spec the engine is checked against. Runes are designed here but come in a second pass, after the classes and paths play well.

## The idea

Today a class is a role. The Warden tanks, the Cleric heals, and a party without both is simply worse. These classes flip that, the way Diablo 2 and Path of Exile do it.

- **A class owns one part of the game.** Nobody else touches it. The Astromancer owns the elements, the Weaver owns movement, the Gravecaller owns life and death, the Bellringer owns the turn order. That rule is always on, through an innate skill every build has.
- **A path is a role.** Each class's passive tree has three paths, one leaning tank, one damage, one support or control. The keystone at the end of a path rewrites how the class mechanic works.
- **A build is choices that combine.** Pick 3 of 7 skills and spend 6 points in a tree of 3 paths × 4 nodes. A node needs the one before it, so 6 points buys one keystone and a dip into a second path, never two keystones. Runes (second pass) add one of 2 modifiers to each chosen skill.

Any class can fill the hole in a party. A party of three damage keystones can still be built, and it should lose to a party that covers tank, damage and support.

Other classes may still cause a status that belongs to another's domain, but only as a side effect of their own. Frostbolt Roots because frost does. Nobody but the Bellringer moves a turn in the queue, nobody but the Gravecaller makes or spends Souls.

## At a glance

| | Astromancer | Weaver | Gravecaller | Bellringer |
|---|---|---|---|---|
| Owns | The elements | Movement | Life and death | The turn order |
| Fantasy | The classic battle mage, whose big spells fall from the sky | Spider-kin who ties the battlefield together with silk | A bone priest who ferries souls | A monk with a great bronze bell on its back |
| Mechanic | **Calls**: the big spells land at the start of your *next* turn | **Threads**: tie up to 3 units, then pull, leash or share damage along them | **Souls**: hard hits and Downs drop Souls on the ground, which you gather and spend | **Toll**: move a unit's turn in this round's queue |
| Innate | Snap | Tether | Harvest | Toll |
| HP / move | 140 / 3 | 170 / 3 (webs cost no move) | 160 / 3 | 175 / 3 |
| Basic | Starbolt, range 4, 10 | Fang, melee, 14 | Bone Lash, range 2, 12 | Clapper, melee, 15 |
| Tank path | Rime (control) | Matriarch | Lich | Carillon (control) |
| Damage path | Pyre | Widow | Reaper | Herald |
| Support path | Orrery | Spinner | Psychopomp | Conductor |

No class counters another outright, but each has a lever on another. The Bellringer Tolls an enemy Astromancer to the end of the round, so its Call lands later and the party gets more warning. Fire burns the Weaver's webs and Threads. Hush stops a Gravecaller's Rites for a turn, and Wither stops the healing that keeps a Weaver's held allies alive. Each class has a path that patches its own weakness, so no lever decides a game alone.

---

## Gravecaller

*"Everyone pays the ferry. I only choose when."*

### Souls

- A **Soul** drops on a unit's tile when that unit is **Downed**, or takes **20 or more** damage from one hit (after shields). Any unit, either team. One Soul per tile; a second one on the same tile is lost.
- Souls last **3 rounds** on the ground. Both parties see them.
- **Harvest** (innate, free, cooldown 2). Gather every Soul within 3. A Gravecaller also gathers a Soul by ending a move on its tile.
- You hold up to **3** Souls. Souls past the cap stay on the ground.
- **Rites** cost 1 held Soul to cast, and can't be cast without one. Other skills are free. **Soul Burst** spends a Soul on the ground, not a held one.
- If the Gravecaller is Downed, its held Souls drop on its tile.

### Skills (pick 3 of 7)

| Skill | Kind | Cooldown | What it does | Rune A (later) | Rune B (later) |
|---|---|---|---|---|---|
| **Last Rites** | Rite | 3 | A Downed ally within 3 stands up at 40% HP. | *Second Wind*: also a 20 shield | *Long Reach*: range 5 |
| **Bone Wall** | Rite | 2 | A wall of 3 tiles across your line to an empty tile within 3, for 2 rounds. It blocks moves and sight, and breaks Threads like a wall. Tiles with units are skipped. | *Ossuary*: 4 tiles | *Spiked*: 8 to enemies who start a turn next to it |
| **Wither** | Rite | 3 | An enemy within 3 is **Withered** for 2 turns: it can't be healed or shielded, and a hit that leaves it at 20% HP or less Downs it (**REAP**). | *Rot*: also Poisoned | *Mark*: its Down drops 2 Souls |
| **Soul Bolt** | Instant | 2 | Range 4, line of sight: 14, plus 6 for each Soul you hold. Spends none. | *Piercing*: hits the unit behind too | *Hungry*: on a Down, gather its Soul |
| **Soul Burst** | Instant | 2 | A Soul on the ground within 4 bursts: 18 to every enemy within 1 of it. | *Chain*: bursts Souls next to it too | *Bind*: Roots instead of the last 6 |
| **Siphon** | Instant | 2 | An enemy within 3 takes 12, and the most wounded ally within 3 of you (yourself included) heals as much. | *Deep Draw*: 16 | *Shared*: splits over all allies within 3 |
| **Equalize** | Instant | 3 | A unit within 3. Your HP % and its HP % even out, moving at most 30 HP. On an enemy healthier than you, you take its HP. On an ally hurt worse than you, you give it yours. | *Toll*: up to 45 | *Fair Share*: also swaps statuses |

### Paths

| Path | Role | Nodes 1 to 3 | Keystone |
|---|---|---|---|
| **Lich** | Tank | +25 HP. Hold +1 Soul. Start your turn with a 6 shield per Soul you hold. | **Undying**: while Downed you still take turns (move 1, then one skill but not your basic). Each Downed turn spends a held Soul instead of bleeding; with none, you bleed as normal. |
| **Reaper** | Damage | Soul Bolt +4. Harvest range +2. Soul Burst +8. | **Reap**: enemies at 20% HP or less that you hit are Downed at once (REAP), and every Down you cause hands you a Soul directly. |
| **Psychopomp** | Support | Last Rites range +2. +20 HP. Allies you stand up get a 20 shield. | **Ferryman**: Downed allies within 2 of you don't bleed, and anyone in your party who stands an ally up (Help Up or Last Rites) brings it back at 60% HP. |

### On each map

- **Shattered Span**: a crumble drops everyone on the bridge at once, which is a Soul feast on the far edge.
- **Storm Court**: storm strikes deal 24 or 36, so every strike drops a Soul for you to gather after.
- **Sun Altar**: a Bone Wall across the altar steps holds it for 2 rounds.

---

## Bellringer

*"The hour is mine to call."*

### Toll

- Each round runs from a **queue** both parties can see. The starter opens and closes, the rest alternate.
- **Toll** (innate, free, cooldown 2). Range 4, any other unit that **hasn't acted** this round.
  - An **enemy** moves to the **end of the round**. It acts after everyone, the closer included.
  - An **ally** moves to **right after you**.
- A unit can be Tolled **once per round**. A second Toll on it is refused.
- Pushing an enemy to the end isn't free. If its party starts the next round, it acts last now and first next, two turns in a row. That's the price of Toll.
- **Late** means the target already acted this round. **Early** means it hasn't.

### Skills (pick 3 of 7)

| Skill | Cooldown | What it does | Rune A (later) | Rune B (later) |
|---|---|---|---|---|
| **Knell** | 2 | Range 4, line of sight: 12. **Late**: ×1.5 and Rooted. | *Dirge*: Late also Exposed | *Long Toll*: range 6 |
| **Hush** | 3 | An enemy within 3 is **Hushed** for its next turn: it can move and use its basic attack, nothing else. Free innates included. | *Silence*: 2 turns | *Echoing*: also the enemy nearest it |
| **Peal** | 2 | Every enemy within 2 takes 10, plus 3 for each unit that already acted this round. | *Resound*: radius 3 | *Shatter Glass*: Wet enemies are Stunned |
| **Encore** | 4 | An ally within 3 that **already acted** this round takes an extra turn at the end of the round. Cooldowns don't tick on that turn. | *Bow*: the ally gets a 15 shield | *Reprise*: works on yourself |
| **Overture** | 4 | Free. Every ally that hasn't acted this round moves to right after you, in its current order. Doesn't count as a Toll. | *Fanfare*: they get +1 move | *Prelude*: also clears their Root |
| **Hourglass** | 3 | A unit within 3. Its timed statuses run out now. On an enemy, its remaining Burn and Poison hit at once and its shield is gone. On an ally, only its debuffs go. | *Sand Trap*: then Rooted (enemy) | *Borrowed Time*: then a 20 shield (ally) |
| **Bell Guard** | 3 | A 25 shield until your next turn. Enemies that hit you while it holds are Hushed. | *Bronze*: 40 | *Ward*: an ally within 1 instead |

### Paths

| Path | Role | Nodes 1 to 3 | Keystone |
|---|---|---|---|
| **Carillon** | Control | +30 HP. Clapper +6. Bell Guard +15 shield. | **Toll for Thee**: enemies you Toll are Hushed on their moved turn, and Toll's cooldown −1. |
| **Herald** | Damage | Knell +6. +20% damage when you're the last of your party to act this round. Peal +3. | **Final Hour**: Toll can target you. Your turn moves to the end of the round, and your last-in-round turn deals +50% damage. |
| **Conductor** | Support | Toll range +2. Encore cooldown −1. +20 HP. | **Accelerando**: allies you Toll get +2 move and a 15 shield on that turn, and Toll's cooldown −1. |

### On each map

- **Sun Altar**: favor counts at round end, so the last turns decide it. Final Hour puts the Bellringer last, onto the altar with nobody left to push it off.
- **Storm Court**: storms strike at round end. Encore gives an ally one last step out of the line.
- **Shattered Span**: Overture sends the whole party across a bridge in one burst, before the enemy can answer.

---

## Astromancer

*"I don't aim where you are. I aim where you'll be."*

### Calls

- A **Called** skill marks its area now and **lands at the start of your next turn**, before you move, even if you're Stunned. Both parties see the area and the counter.
- The party orders its turns every round, and the starter alternates. Act last this round and first next round, and the Call lands after one or two enemy turns. Act first and last, and it lands after five.
- A Call hits **every unit** in its area, allies included, unless the Orrery keystone says otherwise.
- You hold **one** Call at a time. If you're Downed before it lands, it fizzles.
- **Snap** (innate, free, cooldown 3) makes your oldest pending Call land right now at half power. A half-power Gravity Well pulls 1 tile.
- Roots, Stuns, Threads and a Bellringer's Toll make a Call hard to escape. That's how the other classes feed the Astromancer.

### Skills (pick 3 of 7)

| Skill | Kind | Cooldown | What it does | Rune A (later) | Rune B (later) |
|---|---|---|---|---|---|
| **Meteor** | Call | 3 | A 3×3 area within 6: 30 at the center, 15 around, and Burning. Ignites grass and bursts braziers. | *Crater*: a pit at the center for 2 rounds | *Shower*: three 1-tile stars of 18 |
| **Thunderhead** | Call | 2 | A 3×3 area within 5: 20 shock. CONDUCT on Wet: ×1.5. | *Static*: no free skills next turn | *Long Storm*: lands again at half |
| **Gravity Well** | Call | 3 | Within 5. Every unit within 2 of the center is pulled 2 toward it, nearest first. Into a wall or unit: SLAM. Into a chasm: ABYSS. | *Collapse*: 12 to everyone pulled | *Repulse*: pushes out instead |
| **Frostbolt** | Instant | 2 | Range 4: 12 and Rooted. FREEZE on Wet: stunned instead. Freezes water within 1. | *Shatterpoint*: +50% on Rooted | *Ice Path*: ice under the target |
| **Firebolt** | Instant | 2 | Range 4: 14 and Burning. COMBUST on a Burning target: 12 plus triple its remaining burn, at once. | *Kindle*: ignites the tile | *Flare*: reveals in grass |
| **Glacial Prison** | Instant | 3 | Any other unit within 3 is **Encased** for 1 turn: it skips its turn and can't be damaged or moved. Then it's Wet. | *Cold Sleep*: an ally heals 20 | *Brittle*: +25% taken after |
| **Recall** | Call | 3 | An ally within 4 (or yourself). When the Call lands, it snaps back to the tile it stood on when you cast, if that's free, and gets back the HP it lost since. | *Echo*: cleanse on return | *Anchor*: works on the Downed |

### Paths

| Path | Role | Nodes 1 to 3 | Keystone |
|---|---|---|---|
| **Pyre** | Damage | Fire +20%. Call range +1. Burning +3 a turn. | **Twin Stars**: you can hold two Calls at once. |
| **Rime** | Control | Frost +20%. Glacial Prison cooldown −1. Your Calls make everyone they hit Wet. | **Absolute Zero**: units Rooted or Encased when your Call lands are Stunned by it, and Glacial Prison holds an enemy 2 turns. |
| **Orrery** | Support | Recall range +2. +25 HP. Recall also cleanses debuffs. | **Benevolent Heavens**: your Calls heal allies in their area for a quarter of what they'd deal, instead of hurting them. |

### On each map

- **Storm Court**: Thunderhead on a Wet target doubles up with the storm. A Gravity Well timed against the cycle drags enemies into the line about to strike.
- **Shattered Span**: Gravity Well near the edge is a pull into the abyss.
- **Sun Altar**: a Meteor called on the altar makes the holders leave or eat it.

---

## Weaver

*"Everyone on this field is already caught. Some of them just haven't noticed."*

### Threads

- **Tether** (innate, free, cooldown 2). Range 4, line of sight, any other unit. Tie a Thread from you to it. You hold up to 3. A 4th replaces your oldest.
- A Thread **leashes** an enemy. It can't end a move farther from you than it was when tied (at least 1).
- A Thread to an **ally** lets Cocoon reach it at any range.
- A Thread **breaks** as soon as a wall or smoke stands between its ends, or either end is Downed or Burning.
- **Webs** are tile effects that last 3 rounds. A unit that steps onto a web stops there and is Rooted. Fire burns a web away and sets everyone in it Burning. Weavers walk webs freely, at no move cost, and aren't Rooted by them.

### Skills (pick 3 of 7)

| Skill | Cooldown | What it does | Rune A (later) | Rune B (later) |
|---|---|---|---|---|
| **Reel** | 2 | Pull every unit you hold 2 tiles toward you. An enemy pulled into a wall or unit: SLAM. Into a chasm: ABYSS. Allies stop short of chasms and don't slam. | *Snap Back*: allies only, 4 tiles | *Hook*: enemies only, Exposed |
| **Web** | 3 | Webs on a 3×3 area within 4. | *Tripwire*: a 5-tile line | *Sticky Silk*: Roots those inside |
| **Cocoon** | 3 | Range 1, or any unit you hold. An ally gets a 40 shield. A Downed ally is Encased: it doesn't bleed and can't be finished for 1 turn. An enemy is Encased for 1 turn. | *Silk Armor*: 60, 2 turns | *Feeding Cocoon*: drains 8 a turn |
| **Venom Bite** | 2 | Melee: 12 and Poisoned (6 a turn for 3 turns). On a Rooted or Stunned target: SHATTER, ×2. | *Paralytic*: Roots on the last tick | *Necrotic*: no healing while poisoned |
| **Puppet Strings** | 3 | Pick an empty tile within 2 walking steps of an enemy you hold. It walks there. Into the storm line, off the altar, onto a web. | *Marionette*: it attacks a unit you pick | *Dance*: 3 tiles |
| **Shared Pain** | 3 | Until your next turn, half the damage allies you hold would take hits you instead. | *Silk Ward*: you take 20% less of it | *Retaliate*: Threads the attacker |
| **Skitter** | 3 | Free. Leap to a free tile next to a unit you hold, up to 5 away. | *Lunge*: then Fang for free | *Escape*: to a web instead |

### Paths

| Path | Role | Nodes 1 to 3 | Keystone |
|---|---|---|---|
| **Matriarch** | Tank | +30 HP. Enemies you hold deal 20% less damage to everyone but you. +1 Thread. | **Web of Fate**: you start each turn with a 10 shield per Thread you hold. An enemy you hold that ends its turn more than 2 from you is pulled back to 2 and takes 12. |
| **Widow** | Damage | Poison +3 a turn. Fang +10. Venom Bite heals you 8. | **Feast**: Reel pulls enemies all the way to you, and you bite each one that arrives next to you for 12 and Poison. |
| **Spinner** | Support | Cocoon cooldown −1. Tether range +2 and +20 HP. Webs last 2 rounds longer. | **Fate Weaver**: the first time you or an ally you hold would be Downed, it is Encased at 1 HP instead. |

### On each map

- **Sun Altar**: Puppet Strings walks an enemy off the altar right before the round ends.
- **Storm Court**: Puppet Strings into the next strike.
- **Shattered Span**: Reel across a crumbling bridge drops enemies into the abyss.

---

## Falling

A standing unit that falls into a chasm or pit (ABYSS, a pit opening under it, a crumbling tile) clings to the edge. It is Downed on the nearest free tile of solid ground, never in the hole and never on another unit. A unit already Downed on a tile that falls is lost.

## Party resonances

Every pair of classes in a party, and every class taken twice, gives a bonus.

| Pair | Name | Effect |
|---|---|---|
| Astromancer + Weaver | **Star-Tether** | An enemy held by your Weaver when your Call hits it is Exposed for 2 turns (+25% damage taken). |
| Astromancer + Gravecaller | **Second Dawn** | Recall works on a Downed ally: it stands back up at the HP it had when you cast. |
| Astromancer + Bellringer | **Appointed Hour** | An enemy Tolled while standing in one of your pending Calls' areas is Rooted. |
| Weaver + Gravecaller | **Soul Silk** | Last Rites and Siphon reach any ally your Weaver holds, at any range. |
| Weaver + Bellringer | **Clockwork Silk** | Toll reaches any unit your Weaver holds, at any range. |
| Gravecaller + Bellringer | **Death Knell** | Downed enemies lose 2 bleed a turn instead of 1. |
| Astromancer × 2 | **Conjunction** | A Call that lands in a round where another of your Calls already landed deals +25%. |
| Weaver × 2 | **Great Web** | +1 Thread each, and your webs last 1 round longer. |
| Gravecaller × 2 | **Charnel House** | Souls last 2 rounds longer, and each Gravecaller holds +1. |
| Bellringer × 2 | **Peal of Bells** | Toll range +1 and cooldown −1 for each Bellringer. A unit still can't be Tolled twice in a round. |

**Role coverage** replaces the old Holy Trinity, and it reads paths, not classes. A character's role is the role of the path holding its keystone, or, without a keystone, its path with the most points (the first path on a tie, and damage with no points). A party covering tank, damage and support gets +40 max HP each. Three damage builds get nothing. Rime and Carillon count as tank.

## Verification

1. Class win share within 45% to 55% over 7200 AI battles across all three maps.
2. Every keystone path within 45% to 55% over 7200 held-out battles.
3. Three damage keystones against a role-covering party wins under 35%.
4. The AI Calls, Threads, Harvests and Tolls in at least 80% of battles where it has them, and Gravecallers cast a Rite in at least 60%. If the AI can't use a mechanic, the balance numbers mean nothing.
5. A full battle through the real UI: a Call's landing area, a Thread leash, a web, a Soul on the ground and a Toll reordering the queue each render and read correctly.

## Bench: concepts not picked

- **Delver.** Mole-kin who fights from underground and leaves tunnels the party can walk. Built and balanced on `classes-v2`, cut because going underground is an escape (the Weaver's domain) and pits are terrain (the Astromancer's).
- **Artificer.** Owns objects on the board: turrets, pylons and charges that act at the end of its turn, placeable during deploy. Cut because it brings back field-building.
- **Mimic.** Copies the last skill used on it.
