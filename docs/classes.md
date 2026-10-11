# Classes: Astromancer, Gravecaller, Bellringer, Marionettist, Mirrormime

These five replace the Warden, Wizard, Ranger, Cleric and Rogue, and the Gravecaller and Bellringer replace the Delver. The Weaver was cut, and the Marionettist and Mirrormime came after it. Every party is some mix of the five. This file is the design and the rules spec the engine is checked against. Runes are designed here but come in a second pass, after the classes and paths play well.

## The idea

Today a class is a role. The Warden tanks, the Cleric heals, and a party without both is simply worse. These classes flip that, the way Diablo 2 and Path of Exile do it.

- **A class owns one part of the game.** Nobody else touches it. The Astromancer owns the elements, the Gravecaller owns life and death, the Bellringer owns the turn order, the Marionettist owns bodies and the Mirrormime owns reflection. That rule is always on, through an innate skill every build has.
- **A path is a role.** Each class's passive tree has three paths, one leaning tank, one damage, one support or control. The keystone at the end of a path rewrites how the class mechanic works.
- **A build is choices that combine.** Pick 3 of 7 skills and spend 6 points in a tree of 3 paths × 4 nodes. A node needs the one before it, so 6 points buys one keystone and a dip into a second path, never two keystones. Runes (second pass) add one of 2 modifiers to each chosen skill.

Any class can fill the hole in a party. A party of three damage keystones can still be built, and it should lose to a party that covers tank, damage and support.

Other classes may still cause a status that belongs to another's domain, but only as a side effect of their own. Frostbolt Roots because frost does. Nobody but the Bellringer moves a turn in the queue, nobody but the Gravecaller makes or spends Souls, nobody but the Marionettist puts a second body on the board or walks another unit, and nobody but the Mirrormime turns a hit back on whoever threw it.

## At a glance

| | Astromancer | Gravecaller | Bellringer | Marionettist | Mirrormime |
|---|---|---|---|---|---|
| Owns | The elements | Life and death | The turn order | Bodies | Reflection |
| Fantasy | The classic battle mage, whose big spells fall from the sky | A bone priest who ferries souls | A monk with a great bronze bell on its back | A tall masked puppeteer with a wooden doll | A harlequin mime with a mirrorball |
| Mechanic | **Calls**: the big spells land at the start of your *next* turn | **Souls**: hard hits and Downs drop Souls on the ground, which you gather and spend | **Toll**: move a unit's turn in this round's queue | **The Doll**: a second body on the board that you walk, swap with and fight through | **Mirrors**: hits on a Mirrored unit go back to the attacker, and shots through your glass hit the shooter |
| Innate | Snap | Harvest | Toll | Strings | Reflect |
| HP / move | 155 / 3 | 160 / 3 | 155 / 3 | 165 / 3 | 135 / 3 |
| Basic | Starbolt, range 4, 12 | Bone Lash, range 2, 12 | Clapper, melee, 15 | Wire Lash, range 2, 14 | Glint, range 3, 10 |
| Tank path | Rime (control) | Lich | Carillon (control) | Heartwood (control) | Quicksilver |
| Damage path | Pyre | Reaper | Herald | Ventriloquy | Hall of Mirrors |
| Support path | Orrery | Psychopomp | Conductor | Stagecraft | Smoke and Mirrors |

No class counters another outright, but each has a lever on another. The Bellringer Tolls an enemy Astromancer to the end of the round, so its Call lands later and the party gets more warning. Hush stops a Gravecaller's Rites for a turn, and Wither stops the healing that keeps a wounded party on its feet. A Marionettist Dances a Bellringer away from the ally it guards, and its Doll soaks the hits a Mirror would turn back. A Mirror makes the Astromancer's single bolts expensive but does nothing to a Call that lands on empty ground. Each class has a path that patches its own weakness, so no lever decides a game alone.

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
| **Last Rites** | Rite | 3 | A Downed ally within 3 stands up at 40% HP, paid from your own HP (never your last). | *Second Wind*: also a 20 shield | *Long Reach*: range 5 |
| **Bone Wall** | Rite | 2 | A wall of 3 tiles across your line to an empty tile within 3, for 2 rounds. It blocks moves and sight. Tiles with units are skipped. | *Ossuary*: 4 tiles | *Spiked*: 8 to enemies who start a turn next to it |
| **Wither** | Rite | 3 | An enemy within 3 is **Withered** for 2 turns: it can't be healed or shielded, and a hit that leaves it at 20% HP or less Downs it (**REAP**). | *Rot*: also Exposed | *Mark*: its Down drops 2 Souls |
| **Soul Bolt** | Instant | 2 | Range 4, line of sight: 14, plus 6 for each Soul you hold. Spends none. | *Piercing*: hits the unit behind too | *Hungry*: on a Down, gather its Soul |
| **Soul Burst** | Instant | 2 | A Soul on the ground within 4 bursts: 18 to every enemy within 1 of it. | *Chain*: bursts Souls next to it too | *Bind*: Roots instead of the last 6 |
| **Siphon** | Instant | 2 | An enemy within 3 takes 12, and the most wounded ally within 3 of you (yourself included) heals as much. | *Deep Draw*: 16 | *Shared*: splits over all allies within 3 |
| **Equalize** | Instant | 3 | A unit within 3. Your HP % and its HP % even out, moving at most 30 HP. On an enemy healthier than you, you take its HP. On an ally hurt worse than you, you give it yours. | *Toll*: up to 45 | *Fair Share*: also swaps statuses |

### Paths

| Path | Role | Nodes 1 to 3 | Keystone |
|---|---|---|---|
| **Lich** | Tank | +15 HP. Hold +1 Soul. Start your turn with a 3 shield per Soul you hold. | **Undying**: while Downed you still take turns (move 1, then one skill but not your basic). Each Downed turn spends a held Soul instead of bleeding; with none, you bleed as normal. |
| **Reaper** | Damage | Soul Bolt +4. Harvest range +2. Soul Burst +8. | **Reap**: enemies at 20% HP or less that you hit are Downed at once (REAP), and every Down you cause hands you a Soul directly. |
| **Psychopomp** | Support | Last Rites range +3. +40 HP. Allies you stand up get a 30 shield. | **Ferryman**: Downed allies within 3 of you don't bleed, and anyone in your party who stands an ally up (Help Up or Last Rites) brings it back at 60% HP, still paid from their own HP. |

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
| **Hourglass** | 3 | A unit within 3. Its timed statuses run out now. On an enemy, its remaining Burn hits at once and its shield is gone. On an ally, only its debuffs go. | *Sand Trap*: then Rooted (enemy) | *Borrowed Time*: then a 20 shield (ally) |
| **Bell Guard** | 3 | A 20 shield until your next turn. Enemies that hit you while it holds are Hushed. | *Bronze*: 40 | *Ward*: an ally within 1 instead |

### Paths

| Path | Role | Nodes 1 to 3 | Keystone |
|---|---|---|---|
| **Carillon** | Control | +10 HP. Clapper +4. Bell Guard +10 shield. | **Toll for Thee**: enemies you Toll are Hushed on their moved turn. |
| **Herald** | Damage | Knell +6. +20% damage when you're the last of your party to act this round. Peal +3. | **Final Hour**: Toll can target you. Your turn moves to the end of the round, and your last-in-round turn deals +50% damage. |
| **Conductor** | Support | Toll range +2. Encore cooldown −1. +10 HP. | **Accelerando**: allies you Toll get +2 move and a 10 shield on that turn. |

### On each map

- **Sun Altar**: favor counts at round end, so the last turns decide it. Final Hour puts the Bellringer last, onto the altar with nobody left to push it off.
- **Storm Court**: storms strike at round end. Encore gives an ally one last step out of the line.
- **Shattered Span**: Overture sends the whole party across a bridge in one burst, before the enemy can answer.

---

## Astromancer

*"I don't aim where you are. I aim where you'll be."*

### Calls

- A **Called** skill marks its area now and **lands at the start of your next turn**, before you move, even if you're Stunned. Both parties see the area and the counter.
- Turn order is drafted before the battle and holds for all of it, so a Call lands after the five other turns between yours, unless a Toll, Overture or Encore moves someone.
- A Call hits **every unit** in its area, allies included, unless the Orrery keystone says otherwise.
- You hold **one** Call at a time. If you're Downed before it lands, it fizzles.
- **Snap** (innate, free, cooldown 3) makes your oldest pending Call land right now at half power. A half-power Gravity Well pulls 1 tile.
- Roots, Stuns and a Bellringer's Toll make a Call hard to escape. That's how the other classes feed the Astromancer.

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
| **Pyre** | Damage | Fire +30%. Call range +1. Burning +4 a turn. | **Twin Stars**: you can hold two Calls at once. |
| **Rime** | Control | Frost +30%. Glacial Prison cooldown −1. Your Calls make everyone they hit Wet. | **Absolute Zero**: units Rooted or Encased when your Call lands are Stunned by it, and Glacial Prison holds an enemy 2 turns. |
| **Orrery** | Support | Recall range +2. +25 HP. Recall also cleanses debuffs. | **Benevolent Heavens**: your Calls heal allies in their area for a quarter of what they'd deal, instead of hurting them. |

### On each map

- **Storm Court**: Thunderhead on a Wet target doubles up with the storm. A Gravity Well timed against the cycle drags enemies into the line about to strike.
- **Shattered Span**: Gravity Well near the edge is a pull into the abyss.
- **Sun Altar**: a Meteor called on the altar makes the holders leave or eat it.

---

## Marionettist

*"Every body here has strings. Mine just show."*

### The Doll

- The Marionettist starts the battle with its **Doll** on the free tile next to it. The Doll is a second body: it has its own tile and **50 HP**, it blocks moves like any unit, and any enemy can target it and hit it. Areas catch it too.
- The Doll is not a character. It never takes a turn, takes no statuses, can't be healed by others, helped up or moved by others' skills, and it doesn't count for a wipe, the Sun Altar or the round limit. Pulls (Gravity Well) still move it, and a chasm still breaks it.
- At 0 HP the Doll **breaks**. It reforms at full HP on the free tile nearest the Marionettist at the start of the Marionettist's turn **2 rounds** later. It only reforms while the Marionettist stands.
- **Strings** (innate, free, cooldown 1, so once a turn). The Doll walks up to **3** tiles, the way a unit walks, and must end within **4** of you.
- The hits the Doll takes are hits your party didn't. Breaking it is worth a turn to the enemy only when it stands where it matters, so the Doll plays as a wall you can move, a bait, and the far end of your strings.

### Skills (pick 3 of 7)

| Skill | Cooldown | What it does | Rune A (later) | Rune B (later) |
|---|---|---|---|---|
| **Switch** | 3 | Free. You, or an ally within 3, trade places with your Doll. | *Curtain*: the ally gets a 15 shield | *Long Strings*: range 5 |
| **Dance** | 3 | Another unit within 4 takes up to 2 steps toward your Doll, stopping at anything in the way or next to the Doll. | *Waltz*: 3 steps | *Bow*: an enemy ends Exposed |
| **Tangle** | 3 | Every enemy next to your Doll takes 10 and is Rooted. | *Knot*: radius 2 | *Snare*: Stunned instead, on a Rooted enemy |
| **Razor Wire** | 2 | Every enemy on the line between you and your Doll (up to 6 apart) takes 24. | *Garrote*: Rooted too | *Taut*: +6 if the Doll is 4 or more away |
| **Splinter** | 3 | Your Doll bursts: 26 to every enemy next to it. The Doll breaks. | *Shrapnel*: radius 2 | *Kindling*: the burst sets Burning |
| **Stand-In** | 3 | Until your next turn, hits on allies next to your Doll go to the Doll instead. | *Bulwark*: the Doll gets a 20 shield | *Wide Arms*: within 2 |
| **Rebuild** | 4 | A broken Doll reforms next to you now. A standing one mends to full and gets a 15 shield. | *Oak*: +20 Doll HP until it breaks | *Quick Glue*: cooldown 3 |

### Paths

| Path | Role | Nodes 1 to 3 | Keystone |
|---|---|---|---|
| **Heartwood** | Tank (control) | Doll +40 HP. +35 HP. The Doll reforms a round sooner and gets +10 HP. | **Tangled Strings**: enemies that hit your Doll are Rooted, and it takes half damage. |
| **Ventriloquy** | Damage | Wire Lash +6. Razor Wire +8. Splinter +6. | **Ventriloquist**: you can cast your basic and your skills from your Doll's tile, as if you stood there, and Wire Lash gets +1 range. |
| **Stagecraft** | Support | Switch range +2. +20 HP. Stand-In cooldown −1. | **Understudy**: a quarter of every enemy hit on an ally next to your Doll goes to the Doll instead, and allies you Switch get a 15 shield. |

### On each map

- **Shattered Span**: the Doll on a bridge holds it shut, and Dance walks an enemy onto a tile about to crumble.
- **Storm Court**: Switch takes an ally out of the line about to strike, leaving the Doll to eat it. Dance walks an enemy in.
- **Sun Altar**: the Doll doesn't count for favor, but it blocks the steps, and Stand-In keeps the holders standing.

---

## Mirrormime

*"Go on. Hit me. See who it hurts."*

### Mirrors

- **Reflect** (innate, free, cooldown 3). You or an ally within 3 is **Mirrored** until its next turn. **Half** of the next enemy hit on it goes back to the attacker instead: the Mirrored unit takes the other half, the attacker takes this half as reflected damage.
- A Mirror turns back hits from units: an attack, a skill, a landing Call. Burns, storms, falls and the dark pass through it. A turned-back hit can't be turned back again.
- **Glass.** The Mirrormime's Invisible Wall raises glass. Glass blocks moves like a wall but **not sight**. An enemy skill that needs line of sight, aimed at a unit through your glass, bounces off it and hits its own caster instead. Your party's shots pass through.
- The enemy can always see a Mirror and the glass, and the target preview says what a hit would turn back. Reflection doesn't stop a hit; it makes the enemy pay for it, or pick another target.

### Skills (pick 3 of 7)

| Skill | Cooldown | What it does | Rune A (later) | Rune B (later) |
|---|---|---|---|---|
| **Invisible Wall** | 3 | Glass: a wall of 3 tiles across your line to an empty tile within 3, for 2 rounds. Tiles with units are skipped. | *Hall*: 5 tiles | *Lasting*: 3 rounds |
| **Ricochet** | 2 | Range 4, line of sight: 12, then it bounces to the nearest other enemy within 2 for 8. | *Bank*: bounces twice | *Off the Glass*: +6 if it passes your glass |
| **Retort** | 2 | Range 3, line of sight: 10, plus half the HP you lost since your last turn. | *Last Word*: all of it | *Heckle*: also Mocked |
| **Mock** | 3 | An enemy within 3 is **Mocked** for its next turn: of your party, its skills can target only you. | *Jeer*: also the enemy nearest it | *Pratfall*: Exposed too |
| **Mirrorball** | 4 | Every ally within 2 (you too) is Mirrored, and every enemy within 2 takes 8. | *Disco*: radius 3 | *Glitter*: enemies Exposed |
| **Shatter** | 2 | All your glass shatters: 16 to every enemy next to it, once each. | *Shards*: Burning glass | *Keep One*: one tile stays |
| **Reversal** | 3 | An ally within 3 loses its debuffs, and the nearest enemy within 3 of it gets them, with the turns they had left. | *Turnabout*: also its shield | *Long Arm*: within 5 |

### Paths

| Path | Role | Nodes 1 to 3 | Keystone |
|---|---|---|---|
| **Quicksilver** | Tank | +25 HP. Reflect range +2. Whoever you Mirror also gets a 10 shield. | **Quicksilver**: units you Mirror turn back half of every enemy hit until their next turn, not just the first. |
| **Hall of Mirrors** | Damage | Ricochet +4. Retort +4. Shatter +6. | **Hall of Mirrors**: a hit your Mirror turns back comes back whole (the Mirrored unit still takes only half), and Reflect flashes: 8 to every enemy within 2 of whoever you Mirror. |
| **Smoke and Mirrors** | Support | Reversal range +2. +20 HP. Mirrorball cooldown −1. | **Smoke and Mirrors**: units you Mirror also turn back every debuff an enemy puts on them until their next turn, and Reflect's cooldown −1. |

### On each map

- **Storm Court**: glass across a strike line keeps the enemy in it. Mock pulls fire onto a Mirrored Mirrormime standing safe.
- **Shattered Span**: glass closes a bridge without blocking your own shots across it.
- **Sun Altar**: Mirrorball on the altar makes every holder costly to hit, and Mock turns the enemy away from the ally standing on it.

---

## Falling

A standing unit that falls into a chasm or pit (ABYSS, a pit opening under it, a crumbling tile) clings to the edge. It is Downed on the nearest free tile of solid ground, never in the hole and never on another unit. A unit already Downed on a tile that falls is lost.

## Party resonances

Every pair of classes in a party, and every class taken twice, gives a bonus.

| Pair | Name | Effect |
|---|---|---|
| Astromancer + Gravecaller | **Second Dawn** | Recall works on a Downed ally: it stands back up at the HP it had when you cast. |
| Astromancer + Bellringer | **Appointed Hour** | An enemy Tolled while standing in one of your pending Calls' areas is Rooted. |
| Gravecaller + Bellringer | **Death Knell** | Downed enemies lose 2 bleed a turn instead of 1. |
| Astromancer + Marionettist | **Fated Strings** | An enemy your Dance leaves standing in one of your pending Calls' areas is Rooted. |
| Gravecaller + Marionettist | **Bone Puppet** | Your Doll drops a Soul when it breaks, and reforms a round sooner. |
| Bellringer + Marionettist | **Clockwork Doll** | Your Doll gets +20 max HP, and Strings walks it 1 tile farther. |
| Marionettist + Mirrormime | **Commedia** | A hit on your Doll turns half of it back on the attacker. |
| Astromancer + Mirrormime | **Prism** | Your Calls pass through Mirrored allies without hurting them. |
| Gravecaller + Mirrormime | **Black Mirror** | A hit a Mirror turns back drops a Soul on the attacker's tile. |
| Bellringer + Mirrormime | **Echo Chamber** | An enemy whose hit a Mirror turns back is Hushed. |
| Astromancer × 2 | **Conjunction** | A Call that lands in a round where another of your Calls already landed deals +25%. |
| Gravecaller × 2 | **Charnel House** | Souls last 2 rounds longer, and each Gravecaller holds +1. |
| Bellringer × 2 | **Peal of Bells** | Toll range +1 and cooldown −1 for each Bellringer. A unit still can't be Tolled twice in a round. |
| Marionettist × 2 | **Troupe** | Each Doll gets +15 max HP and reforms a round sooner. |
| Mirrormime × 2 | **Infinity Mirror** | Each Mirrormime's Reflect gets +1 range and −1 cooldown. |

**Role coverage** replaces the old Holy Trinity, and it reads paths, not classes. A character's role is the role of the path holding its keystone, or, without a keystone, its path with the most points (the first path on a tie, and damage with no points). A party covering tank, damage and support gets +40 max HP each. Three damage builds get nothing. Rime, Carillon and Heartwood count as tank.

## Verification

1. Class win share within 45% to 55% over 7200 AI battles across all three maps.
2. Every keystone path within 45% to 55% over 7200 held-out battles.
3. Three damage keystones against a role-covering party wins under 35%.
4. The AI Calls, Harvests, Tolls and works Strings in at least 80% of battles where it has them, Gravecallers cast a Rite in at least 60%, and a Mirror turns a hit back in at least 50%. If the AI can't use a mechanic, the balance numbers mean nothing.
5. A full battle through the real UI: a Call's landing area, a Soul on the ground, a Toll reordering the queue, the Doll walking, swapping and breaking, a Mirror turning a hit back and a shot bouncing off glass each render and read correctly.

## Balance notes

The Marionettist and Mirrormime came in with a 7200-battle sim of all five classes (`npm run sim -- 900 --from=K`, eight shards). The first pass put the Bellringer at 60% (Carillon 66%, Conductor 62%), the Mirrormime at 59%, the Astromancer at 44% and the Marionettist at 39%. These changes brought every class and every keystone path into 47–53% over 14400 battles (seeds 0 to 14399, so the second half is held out from the first tuning runs):

- **Bellringer**: HP 175 → 155. Toll for Thee and Accelerando no longer cut Toll's cooldown: a Toll every turn was the whole of both keystones' strength. Bronze Frame +30 → +10 HP, Heavy Clapper +6 → +4, Thick Bell +15 → +10, Bell Guard 25 → 20, Accelerando's shield 15 → 10, Steady Hands +20 → +10 HP.
- **Mirrormime**: HP 150 → 135, Glint 12 → 10, Reflect cooldown 2 → 3 (Smoke and Mirrors brings it back to 2), Hall of Mirrors' flash 10 → 8. A free Mirror every other turn made every enemy hit a bad trade.
- **Marionettist**: HP 150 → 165, Wire Lash 12 → 14, Doll 40 → 50 HP, Tangle 6 → 10, Razor Wire 16 → 24, Splinter 22 → 26; Oak Limbs +25 → +40 Doll HP, Stagehand +25 → +35 HP, Spare Parts also gives the Doll +10 HP, Barbed Wire +4 → +6, Piano Wire +6 → +8, and Ventriloquist adds +1 Wire Lash range. The AI no longer charges Strings the price it puts on other free skills, so it walks the Doll every turn (Strings use 71% → 99%), which was worth about 5 points on its own.
- **Astromancer**: HP 140 → 155, Starbolt 10 → 12, Kindling and Hoarfrost +20% → +30%, Searing +3 → +4.
- **Gravecaller**: Lich's Grave Flesh +25 → +15 HP and Soul Ward 6 → 3 per Soul; Psychopomp's Far Call +2 → +3 range, Pale Robes +20 → +40 HP, Safe Passage 20 → 30, and Ferryman reaches 3 and stands allies up at 70%.

Three damage keystones against a role-covering party win 30% (`--dumb`, 1200 battles).

## Bench: concepts not picked

- **Delver.** Mole-kin who fights from underground and leaves tunnels the party can walk. Built and balanced on `classes-v2`, cut because going underground is an escape (movement is the one part of the game no class owns now, and the next class may) and pits are terrain (the Astromancer's).
- **Artificer.** Owns objects on the board: turrets, pylons and charges that act at the end of its turn, placeable during deploy. Cut because it brings back field-building.
- **Mimic.** Copies the last skill used on it. The Mirrormime took the reflection half of the idea and left copying out: a copied kit is a second kit to read.
- **Mirror Image** for the Mirrormime: a decoy body. Cut because a second body is the Marionettist's.
