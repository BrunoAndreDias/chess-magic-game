# Classes: Astromancer, Gravecaller, Bellringer, Marionettist, Mirrormime

These five replace the Warden, Wizard, Ranger, Cleric and Rogue, and the Gravecaller and Bellringer replace the Delver. The Weaver was cut, and the Marionettist and Mirrormime came after it. Every party is some mix of the five. Each class now has a pool of 4 skills and one ultimate, cut down from 7 skills so the kits and the tree can be tuned together before the pools grow again. This file is the design and the rules spec the engine is checked against. Runes are designed here but come in a second pass, after the classes and paths play well.

## The idea

Today a class is a role. The Warden tanks, the Cleric heals, and a party without both is simply worse. These classes flip that, the way Diablo 2 and Path of Exile do it.

- **A class owns one part of the game.** Nobody else touches it. The Astromancer owns the elements, the Gravecaller owns life and death, the Bellringer owns the turn order, the Marionettist owns bodies and the Mirrormime owns reflection. That rule is always on, through an innate skill every build has.
- **A path is a role.** Each class's passive tree has three paths, one leaning tank, one damage, one support or control. The keystone at the end of a path rewrites how the class mechanic works.
- **A build is choices that combine.** Pick 2 of the class's 4 skills and spend 6 points in a tree of 3 paths × 4 nodes. A node needs the one before it, so 6 points buys one keystone and a dip into a second path, never two keystones. Runes (second pass) add one of 2 modifiers to each chosen skill.

## The kit

Every character carries the same five things.

| Slot | What it is | Cooldown |
|---|---|---|
| Basic | The class's plain attack. | none |
| Innate | The class mechanic. Free: it doesn't use your action. | its own |
| Skill × 2 | Picked from the class's pool of 4. | 2 each |
| Ultimate | The class's signature, the same for every build. It uses your action. | ready on your 4th turn, then 5 |

- **A skill is almost always ready.** With both skills on cooldown 2, a character that alternates them has one ready every turn, and choosing which one to fire is still a decision.
- **The ultimate comes from time to time.** Battles run about 11 rounds (8.8 on the Sun Altar, 12.9 on the Storm Court, 200 AI battles), so a character fires it about twice a battle. Its countdown is public: both parties see every ultimate's turns left, so a coming ultimate is something to plan around, like a threat in chess.
- **A cooldown ticks at the start of each of the unit's own turns**, and not on an extra turn (Encore), as before.
- **Start small, then grow.** The pools are 4 skills on purpose. New skills join a pool one at a time once the tree and the four play well. `docs/skill-backlog.md` holds the skills that left the pools and the ideas for the next ones.

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
- **Rites** cost held Souls to cast, and can't be cast without one. Wither costs 1 and The Crossing spends all you hold. Other skills are free.
- If the Gravecaller is Downed, its held Souls drop on its tile.

### Skills (pick 2 of 4)

| Skill | Kind | Cooldown | What it does | Rune A (later) | Rune B (later) |
|---|---|---|---|---|---|
| **Siphon** | Instant | 2 | An enemy within 3 takes 12, and the most wounded ally within 3 of you (yourself included) heals as much. | *Deep Draw*: 16 | *Shared*: splits over all allies within 3 |
| **Wither** | Rite | 2 | An enemy within 3 is **Withered** for 2 turns: it can't be healed or shielded, and a hit that leaves it at 20% HP or less Downs it (**REAP**). | *Rot*: also Exposed | *Mark*: its Down drops 2 Souls |
| **Soul Bolt** | Instant | 2 | Range 4, line of sight: 14, plus 6 for each Soul you hold. Spends none. | *Piercing*: hits the unit behind too | *Hungry*: on a Down, gather its Soul |
| **Bone Wall** | Instant | 2 | A wall of 3 tiles across your line to an empty tile within 3, for 2 rounds. It blocks moves and sight. Tiles with units are skipped. | *Ossuary*: 4 tiles | *Spiked*: 8 to enemies who start a turn next to it |

Bone Wall is no longer a Rite. With only Wither and The Crossing left as Rites, a Soul-free wall gives the tank build a pick that doesn't compete with the ultimate for Souls.

### Ultimate: The Crossing

*Rite. Needs at least 1 held Soul and spends all you hold.* The ferry rows a straight line of 5 tiles out from you, in one of the four directions. Every enemy on the line takes **12 per Soul spent**. Every Downed ally on the line stands up at **40% HP**.

The Gravecaller's loop in one skill: hard hits and Downs drop Souls, Harvest gathers them, and The Crossing cashes them all in, as damage, as revives, or both. Its gate is the timer and the Souls together. Last Rites' revive lives here now, so every party still has Help Up and one Gravecaller has The Crossing.

### Paths

| Path | Role | Nodes 1 to 3 | Keystone |
|---|---|---|---|
| **Lich** | Tank | +15 HP. Hold +1 Soul. Start your turn with a 3 shield per Soul you hold. | **Undying**: while Downed you still take turns (move 1, then one skill but not your basic). Each Downed turn spends a held Soul instead of bleeding; with none, you bleed as normal. |
| **Reaper** | Damage | Soul Bolt +4. Harvest range +2. Siphon +6. | **Reap**: enemies at 20% HP or less that you hit are Downed at once (REAP), and every Down you cause hands you a Soul directly. |
| **Psychopomp** | Support | The Crossing's line +2 tiles. +50 HP. Allies you stand up get a 40 shield. | **Ferryman**: Downed allies within 3 of you don't bleed, and anyone in your party who stands an ally up (Help Up or The Crossing) brings it back at 70% HP. Help Up is still paid from the helper's own HP. |

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

### Skills (pick 2 of 4)

| Skill | Cooldown | What it does | Rune A (later) | Rune B (later) |
|---|---|---|---|---|
| **Knell** | 2 | Range 4, line of sight: 12. **Late**: ×1.5 and Rooted. | *Dirge*: Late also Exposed | *Long Toll*: range 6 |
| **Bell Guard** | 2 | A 20 shield on you or an ally within 1, until your next turn. Enemies that hit the shielded unit while it holds are Hushed. | *Bronze*: 40 | *Ward*: range 3 |
| **Hush** | 2 | An enemy within 3 is **Hushed** for its next turn: it can move and use its basic attack, nothing else. Free innates included. | *Silence*: 2 turns | *Echoing*: also the enemy nearest it |
| **Peal** | 2 | Every enemy within 2 takes 10, plus 3 for each unit that already acted this round. | *Resound*: radius 3 | *Shatter Glass*: Wet enemies are Stunned |

### Ultimate: Encore

An ally within 3 takes an extra turn at the end of the round, on top of its own turn this round. Cooldowns don't tick on that turn.

As a skill, Encore needed an ally that **already acted** this round. As the ultimate it doesn't: a Bellringer that acts first in its party had no ally that already acted, so it could never fire it (36% use in the sim against 89% for the other slots).

In a turn-based game an extra turn is the purest turn-order ultimate, and it's the Bellringer's clearest team play: an Encore on the Astromancer lands its Call early and lets it cast another. It moved up from a cooldown-4 skill, so it no longer competes with the two picks.

### Paths

| Path | Role | Nodes 1 to 3 | Keystone |
|---|---|---|---|
| **Carillon** | Control | +5 HP. Clapper +4. Bell Guard +10 shield. | **Toll for Thee**: enemies you Toll are Hushed on their moved turn. |
| **Herald** | Damage | Knell +6. +20% damage when you're the last of your party to act this round. Peal +3. | **Final Hour**: Toll can target you. Your turn moves to the end of the round, and your last-in-round turn deals +50% damage. |
| **Conductor** | Support | Toll range +2. Encore cooldown −1. +10 HP. | **Accelerando**: allies you Toll get +2 move and a 10 shield on that turn. |

### On each map

- **Sun Altar**: favor counts at round end, so the last turns decide it. Final Hour puts the Bellringer last, onto the altar with nobody left to push it off.
- **Storm Court**: storms strike at round end. Encore gives an ally one last step out of the line.
- **Shattered Span**: Toll an ally right after you and walk across a bridge together, before the enemy can answer.

---

## Astromancer

*"I don't aim where you are. I aim where you'll be."*

### Calls

- A **Called** skill marks its area now and **lands at the start of your next turn**, before you move, even if you're Stunned. Both parties see the area and the counter.
- Turn order is drafted before the battle and holds for all of it, so a Call lands after the five other turns between yours, unless a Toll or an Encore moves someone.
- A Call hits **every unit** in its area, allies included, unless the Orrery keystone says otherwise.
- You hold **one** Call at a time. If you're Downed before it lands, it fizzles.
- **Snap** (innate, free, cooldown 3) makes your oldest pending Call land right now at half power.
- Roots, Stuns and a Bellringer's Toll make a Call hard to escape. That's how the other classes feed the Astromancer.

### Skills (pick 2 of 4)

| Skill | Kind | Cooldown | What it does | Rune A (later) | Rune B (later) |
|---|---|---|---|---|---|
| **Thunderhead** | Call | 2 | A 3×3 area within 5: 20 shock. CONDUCT on Wet: ×1.5. | *Static*: no free skills next turn | *Long Storm*: lands again at half |
| **Frostbolt** | Instant | 2 | Range 4: 12 and Rooted. FREEZE on Wet: stunned instead. Freezes water within 1. | *Shatterpoint*: +50% on Rooted | *Ice Path*: ice under the target |
| **Firebolt** | Instant | 2 | Range 4: 14 and Burning. COMBUST on a Burning target: 12 plus triple its remaining burn, at once. | *Kindle*: ignites the tile | *Flare*: reveals in grass |
| **Recall** | Call | 2 | An ally within 4 (or yourself). When the Call lands, it snaps back to the tile it stood on when you cast, if that's free, and gets back the HP it lost since. | *Echo*: cleanse on return | *Anchor*: works on the Downed |

### Ultimate: Falling Star

*Call.* A 3×3 area within 6. When you cast it, every enemy within 1 of the area, outside it, is pulled 1 tile toward its center, the way Gravity Well pulled (into a wall or unit: SLAM, into a chasm: ABYSS). At the start of your next turn it lands: **40** at the center, **20** around, and Burning. It ignites grass and bursts braziers. It counts as fire.

It follows every Call rule: you hold one Call at a time, it hits allies too, and Snap lands it now at half power. Snap is free, so a pending Thunderhead can be Snapped and Falling Star cast on the same turn. "I aim where you'll be" at its biggest: everyone sees it coming, so the enemy has to scatter, and a Toll, a Root or a Dance from an ally makes it hard to leave. Meteor's damage and Gravity Well's pull both live here now.

### Paths

| Path | Role | Nodes 1 to 3 | Keystone |
|---|---|---|---|
| **Pyre** | Damage | Fire +30%. Call range +1. Burning +4 a turn. | **Twin Stars**: you can hold two Calls at once. |
| **Rime** | Control | Frost +30%. Frostbolt range +2. Your Calls make everyone they hit Wet. | **Absolute Zero**: units Rooted when your Call lands are Stunned by it. |
| **Orrery** | Support | Recall range +2. +15 HP. Recall also cleanses debuffs. | **Benevolent Heavens**: your Calls heal allies in their area for a quarter of what they'd deal, instead of hurting them. |

### On each map

- **Storm Court**: Thunderhead on a Wet target doubles up with the storm, and Frostbolt Roots an enemy in a line about to strike.
- **Shattered Span**: a Falling Star cast with a chasm between its area and an enemy pulls that enemy into the abyss.
- **Sun Altar**: a Falling Star called on the altar makes the holders leave or eat it.

---

## Marionettist

*"Every body here has strings. Mine just show."*

### The Doll

- The Marionettist starts the battle with its **Doll** on the free tile next to it. The Doll is a second body: it has its own tile and **50 HP**, it blocks moves like any unit, and any enemy can target it and hit it. Areas catch it too.
- The Doll is not a character. It never takes a turn, takes no statuses, can't be healed by others, helped up or moved by others' skills, and it doesn't count for a wipe, the Sun Altar or the round limit. Pulls (Falling Star) still move it, and a chasm still breaks it.
- At 0 HP the Doll **breaks**. It reforms at full HP on the free tile nearest the Marionettist at the start of the Marionettist's turn **2 rounds** later. It only reforms while the Marionettist stands.
- **Strings** (innate, free, cooldown 1, so once a turn). The Doll walks up to **3** tiles, the way a unit walks, and must end within **4** of you.
- The hits the Doll takes are hits your party didn't. Breaking it is worth a turn to the enemy only when it stands where it matters, so the Doll plays as a wall you can move, a bait, and the far end of your strings.

### Skills (pick 2 of 4)

| Skill | Cooldown | What it does | Rune A (later) | Rune B (later) |
|---|---|---|---|---|
| **Razor Wire** | 2 | Every enemy on the line between you and your Doll (up to 6 apart) takes 24. | *Garrote*: Rooted too | *Taut*: +6 if the Doll is 4 or more away |
| **Dance** | 2 | Another unit within 4 takes up to 2 steps toward your Doll, stopping at anything in the way or next to the Doll. | *Waltz*: 3 steps | *Bow*: an enemy ends Exposed |
| **Switch** | 2 | Free. You, or an ally within 3, trade places with your Doll. | *Curtain*: the ally gets a 15 shield | *Long Strings*: range 5 |
| **Stand-In** | 2 | Until your next turn, hits on allies next to your Doll go to the Doll instead. | *Bulwark*: the Doll gets a 20 shield | *Patched*: the Doll heals 5 for each hit it takes this way |

Dance and Razor Wire are a combo inside the kit: Dance walks an enemy onto the wire's line, then the wire cuts it.

### Ultimate: Command Performance

An enemy character within 3 (not a Doll) is yours for a moment. You walk it up to **3** tiles, the way a unit walks (a Root doesn't hold it), then it uses its **basic attack** on any unit in that attack's range that you choose, its own allies included. It doesn't use or lose its own turn, and it can't be made to use a skill.

The puppeteer fantasy at full size. Nobody but the Marionettist walks another unit, and this is the one time it walks a whole enemy, not just a step toward the Doll. Walk an enemy into a storm line, off the altar, next to your Doll for Razor Wire, or make it hit its own healer.

### Paths

| Path | Role | Nodes 1 to 3 | Keystone |
|---|---|---|---|
| **Heartwood** | Tank (control) | Doll +40 HP. +35 HP. The Doll reforms a round sooner and gets +10 HP. | **Tangled Strings**: enemies that hit your Doll are Rooted, and it takes half damage. |
| **Ventriloquy** | Damage | Wire Lash +6. Razor Wire +8. Dance takes 1 more step. | **Ventriloquist**: you can cast your basic and your skills from your Doll's tile, as if you stood there, and Wire Lash gets +1 range. |
| **Stagecraft** | Support | Switch range +2. +10 HP. Stand-In covers allies within 2 of your Doll. | **Understudy**: a quarter of every enemy hit on an ally next to your Doll goes to the Doll instead, and allies you Switch get a 10 shield. |

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

### Skills (pick 2 of 4)

| Skill | Cooldown | What it does | Rune A (later) | Rune B (later) |
|---|---|---|---|---|
| **Ricochet** | 2 | Range 4, line of sight: 12, then it bounces to the nearest other enemy within 2 for 8. | *Bank*: bounces twice | *Off the Glass*: +6 if it passes your glass |
| **Invisible Wall** | 2 | Glass: a wall of 3 tiles across your line to an empty tile within 3, for 2 rounds. Tiles with units are skipped. | *Hall*: 5 tiles | *Lasting*: 3 rounds |
| **Retort** | 2 | Range 3, line of sight: 10, plus half the HP you lost since your last turn. | *Last Word*: all of it | *Heckle*: also Mocked |
| **Reversal** | 2 | An ally within 3 loses its debuffs, and the nearest enemy within 3 of it gets them, with the turns they had left. | *Turnabout*: also its shield | *Long Arm*: within 5 |

Glass lasts 2 rounds and Invisible Wall comes back every other turn, so a Mirrormime that picks it keeps about one wall up all battle: the mime is never without its glass.

### Ultimate: Showstopper

Until your next turn, you are Mirrored against **every** enemy hit, not just the first: each one turns half back on its attacker. Every enemy within 3 is **Mocked** for its next turn: of your party, its skills can target only you.

"Go on. Hit me. See who it hurts." The enemies near you choose between a turn without skills and paying for every one they throw. Mock and Mirrorball live here now. With the Hall of Mirrors keystone every hit comes back whole, so the Mocked enemies that still cast hurt themselves more than you.

### Paths

| Path | Role | Nodes 1 to 3 | Keystone |
|---|---|---|---|
| **Quicksilver** | Tank | +25 HP. Reflect range +2. Whoever you Mirror also gets a 10 shield. | **Quicksilver**: units you Mirror turn back half of every enemy hit until their next turn, not just the first. |
| **Hall of Mirrors** | Damage | Ricochet +4. Retort +4. Enemies next to your glass when it rises take 8. | **Hall of Mirrors**: a hit your Mirror turns back comes back whole (the Mirrored unit still takes only half), and Reflect flashes: 8 to every enemy within 2 of whoever you Mirror. |
| **Smoke and Mirrors** | Support | Reversal range +2. +35 HP. Showstopper cooldown −1. | **Smoke and Mirrors**: units you Mirror also turn back every debuff an enemy puts on them until their next turn, and Reflect's cooldown −1. |

### On each map

- **Storm Court**: glass across a strike line keeps the enemy in it. Showstopper next to a strike line makes the enemies in it choose between a wasted turn and paying for every skill.
- **Shattered Span**: glass closes a bridge without blocking your own shots across it.
- **Sun Altar**: Showstopper on the altar turns every enemy skill onto the one unit that sends half of it back.

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
4. The AI Calls, Harvests, Tolls and works Strings in at least 80% of battles where it has them, Gravecallers cast a Rite in at least 60%, and a Mirror turns a hit back in at least 50%. Every class fires its ultimate in at least 80% of battles where it stands on its 4th turn, and every pool skill is picked by some AI build. If the AI can't use a mechanic, the balance numbers mean nothing.
5. A full battle through the real UI: a Call's landing area, a Soul on the ground, a Toll reordering the queue, the Doll walking, swapping and breaking, a Mirror turning a hit back, a shot bouncing off glass, each ultimate's countdown for both parties, and each ultimate firing each render and read correctly.

## Balance notes

### The 4-skill pools and the ultimates

The first sim of the new kits (7200 battles, seeds 0 to 7199, `npm run sim -- 900 --from=K`, eight shards) put every class within 47–52% but two keystone paths out: Psychopomp at 44% and Stagecraft at 58%. The ultimates fired in 99% of the battles where their character stood with them ready, except The Crossing (87%, it needs a held Soul) and Encore (69%): a Bellringer acting first in its party never had an ally that already acted, so Encore now takes any ally within 3 (the Encore section above). These changes, tuned on seeds 0 to 7199, hold every class within 49–51% and every keystone path within 45.5–54.2% on 7200 held-out battles (seeds 7200 to 14399):

- **Gravecaller**: The Crossing 10 → 12 per Soul; Psychopomp's Pale Robes +40 → +50 HP and Safe Passage 30 → 40.
- **Marionettist**: Stagecraft's Velvet Coat +20 → +10 HP and Understudy's Switch shield 15 → 10.
- **Mirrormime**: Smoke and Mirrors' Greasepaint +20 → +35 HP.
- **Astromancer**: Orrery's Starward +25 → +15 HP.
- **Bellringer**: Carillon's Bronze Frame +10 → +5 HP.

On the held-out battles the ultimates fire in 89% (The Crossing) to 99% of the battles where they're ready (Encore 93%), the class mechanics hold their gates (Calls 98%, Harvest 98%, Rites 94%, Toll 82%, Strings 100%, a Mirror turning a hit back 74%), and a battle runs 11.0 rounds. Three damage keystones against a role-covering party win 30% (`--dumb`, 2400 battles).

### The 7-skill kits

The Marionettist and Mirrormime came in with a 7200-battle sim of all five classes (`npm run sim -- 900 --from=K`, eight shards). The first pass put the Bellringer at 60% (Carillon 66%, Conductor 62%), the Mirrormime at 59%, the Astromancer at 44% and the Marionettist at 39%. These changes brought every class and every keystone path into 47–53% over 14400 battles (seeds 0 to 14399, so the second half is held out from the first tuning runs):

- **Bellringer**: HP 175 → 155. Toll for Thee and Accelerando no longer cut Toll's cooldown: a Toll every turn was the whole of both keystones' strength. Bronze Frame +30 → +10 HP, Heavy Clapper +6 → +4, Thick Bell +15 → +10, Bell Guard 25 → 20, Accelerando's shield 15 → 10, Steady Hands +20 → +10 HP.
- **Mirrormime**: HP 150 → 135, Glint 12 → 10, Reflect cooldown 2 → 3 (Smoke and Mirrors brings it back to 2), Hall of Mirrors' flash 10 → 8. A free Mirror every other turn made every enemy hit a bad trade.
- **Marionettist**: HP 150 → 165, Wire Lash 12 → 14, Doll 40 → 50 HP, Tangle 6 → 10, Razor Wire 16 → 24, Splinter 22 → 26; Oak Limbs +25 → +40 Doll HP, Stagehand +25 → +35 HP, Spare Parts also gives the Doll +10 HP, Barbed Wire +4 → +6, Piano Wire +6 → +8, and Ventriloquist adds +1 Wire Lash range. The AI no longer charges Strings the price it puts on other free skills, so it walks the Doll every turn (Strings use 71% → 99%), which was worth about 5 points on its own.
- **Astromancer**: HP 140 → 155, Starbolt 10 → 12, Kindling and Hoarfrost +20% → +30%, Searing +3 → +4.
- **Gravecaller**: Lich's Grave Flesh +25 → +15 HP and Soul Ward 6 → 3 per Soul; Psychopomp's Far Call +2 → +3 range, Pale Robes +20 → +40 HP, Safe Passage 20 → 30, and Ferryman reaches 3 and stands allies up at 70%.

Three damage keystones against a role-covering party win 30% (`--dumb`, 1200 battles).

## Bench: concepts not picked

Skills that left the pools, and ideas for the next ones, are in `docs/skill-backlog.md`.

- **Delver.** Mole-kin who fights from underground and leaves tunnels the party can walk. Built and balanced on `classes-v2`, cut because going underground is an escape (movement is the one part of the game no class owns now, and the next class may) and pits are terrain (the Astromancer's).
- **Artificer.** Owns objects on the board: turrets, pylons and charges that act at the end of its turn, placeable during deploy. Cut because it brings back field-building.
- **Mimic.** Copies the last skill used on it. The Mirrormime took the reflection half of the idea and left copying out: a copied kit is a second kit to read.
- **Mirror Image** for the Mirrormime: a decoy body. Cut because a second body is the Marionettist's.
