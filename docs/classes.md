# Classes: Delver, Astromancer, Weaver

These three replace the Warden, Wizard, Ranger, Cleric and Rogue. This file is the design and the rules spec the engine is checked against. Runes are designed here but come in a second pass, after the classes and paths play well.

## The idea

Today a class is a role. The Warden tanks, the Cleric heals, and a party without both is simply worse. These classes flip that, the way Diablo 2 and Path of Exile do it.

- **A class is a mechanic.** Each class owns one rule nobody else has: going underground, casting into the future, or threading other units. That rule is always on, through an innate skill every build has.
- **A path is a role.** Each class's passive tree has three paths, one leaning tank, one damage, one support or control. The keystone at the end of a path rewrites how the class mechanic works.
- **A build is choices that combine.** Pick 3 of 7 skills and spend 6 points in a tree of 3 paths × 4 nodes. A node needs the one before it, so 6 points buys one keystone and a dip into a second path, never two keystones. Runes (second pass) add one of 2 modifiers to each chosen skill.

Any class can fill the hole in a party. A party of three damage keystones can still be built, and it should lose to a party that covers tank, damage and support.

## At a glance

| | Delver | Astromancer | Weaver |
|---|---|---|---|
| Fantasy | Mole-kin sapper who fights from below | The classic battle mage, whose big spells fall from the sky | Spider-kin who ties the battlefield together with silk |
| Mechanic | **Underground**: sink after acting, move under walls and units, come up somewhere else, leave tunnels the party can walk | **Calls**: the big spells land at the start of your *next* turn, so your turn order decides how much warning the enemy gets | **Threads**: tie up to 3 units, ally or enemy, then pull, leash or share damage along them |
| Innate | Burrow | Snap | Tether |
| HP / move | 190 / 3 | 140 / 3 | 170 / 3 (webs cost no move) |
| Basic | Pick, melee, 16 | Starbolt, range 4, 10 | Fang, melee, 14 |
| Tank path | Sapper | Rime (control) | Matriarch |
| Damage path | Ambusher | Pyre | Widow |
| Support path | Tunnelwright | Orrery | Spinner |

The counters form a loose triangle. The Delver dodges Calls underground and dives the backline. The Astromancer's fire burns webs and Threads. The Weaver's web on a tunnel exit Roots the Delver as it surfaces, and a leash keeps it close. Each class has a path that patches its own weakness, so the triangle never decides a game alone.

---

## Delver

*"Walls are a suggestion. The ground is a road."*

### Underground

- **Burrow** (innate, free, cooldown 2). Usable only if you haven't moved this turn, and it uses up your move. You can attack first and then sink. You go **Underground** and leave a **Tunnel Mouth** on your tile.
- **Underground** lasts until the end of your next turn. You can't be targeted, damaged, moved or given statuses, except by an enemy's **Quake** effects (Meteor, Tremor). Storm strikes, fire, crumbling tiles and the altar count all ignore you. Other units walk over your tile.
- On your next turn your move is an **underground move**. Up to 4 tiles in any of 4 directions, through walls, water and units, but never through a chasm or pit or off the board, and never ending on another unit.
- You **Surface** when you cast any skill, or at the end of that turn. You come up on your tile, or the nearest free tile if someone is standing on it. Surfacing leaves another Tunnel Mouth. Upheaval is the one skill that needs you to be underground.
- **Tunnel Mouths** last 3 rounds. All of one Delver's mouths are joined. For that Delver's party, walking from one joined mouth to another costs 1 move, like an adjacent tile. An enemy who ends its turn on a mouth caves it in.
- An enemy's Quake that hits you underground forces you up and Stuns you. Your party's Meteor passes over you.

The enemy can see your underground tile as a mound of dirt. Hiding it needs per-player state redaction in the Match first.

### Skills (pick 3 of 7)

| Skill | Cooldown | What it does | Rune A (later) | Rune B (later) |
|---|---|---|---|---|
| **Upheaval** | 2 | Only from underground. Burst up next to an enemy: 18 damage, and push it 1 tile away from you. Into a wall, unit or the edge: SLAM (6 and stunned). Into a chasm: ABYSS. | *Geyser*: push 2 | *Rubble*: smoke on your tile for 2 rounds |
| **Undermine** | 3 | An empty tile within 2. At the end of the round it collapses into a pit for 3 rounds. Anyone standing there falls and is Downed at its edge, and the Downed are lost. | *Sinkhole*: 3 tiles in a line | *Breach*: target a wall and turn it to floor |
| **Satchel Charge** | 3 | Plant a charge on an empty tile within 1. One at a time. It blows when an enemy ends a move next to it, or when you Surface: 20 to every unit within 1, pushed 1 outward. | *Shaped*: 30 to one tile, no push | *Sticky*: Roots instead of pushing |
| **Drag Under** | 3 | An ally or Downed ally within 1 is pulled down your tunnel and comes out next to your newest Tunnel Mouth. A Downed ally skips its next bleed. | *Deep Pocket*: a 20 shield | *Long Haul*: any of your mouths |
| **Tremor** | 3 | Enemies within 2 are Rooted. Quake: an enemy Delver underground in range is forced up and Stunned. | *Aftershock*: repeats at round end | *Fault Line*: a 5-tile line |
| **Stoneskin** | 3 | A 30 shield. If you stand on a Tunnel Mouth, each ally within 1 also gets 15. | *Bedrock*: can't be pushed while shielded | *Shared Stone*: 25 to one ally within 3 |
| **Warren** | 2 | Open a Tunnel Mouth on an empty tile you can see within 4. | *Hidden Mouth*: can't be caved in | *Wide Mouth*: also Hastes the next ally through |

### Paths

| Path | Role | Nodes 1 to 3 | Keystone |
|---|---|---|---|
| **Ambusher** | Damage | +15% damage on a turn you surface. Upheaval +6. Underground move +1. | **Undertow**: Upheaval cooldown −1, and it doesn't surface you. Strike from below and stay under until the end of your next turn. |
| **Sapper** | Tank | +20 HP. Undermine collapses at once. Satchel +8. | **Earthbreaker**: enemies who start their turn next to you are Rooted. |
| **Tunnelwright** | Support | Tunnel Mouths last 2 rounds longer. +20 HP. Allies who come out of a tunnel get a 15 shield. | **Undercity**: allies who end their turn on your mouths heal 10, Downed allies there don't bleed, and enemies can't cave your mouths in. |

### On each map

- **Shattered Span**: Undermine adds chasm where there was floor. Upheaval from below pushes enemies off the edge. A crumbling tile doesn't take you while you're under.
- **Storm Court**: sit under the next storm line and come up after it strikes.
- **Sun Altar**: a mouth next to the altar lets allies walk onto it from across the map. Underground, you don't count as holding it.

---

## Astromancer

*"I don't aim where you are. I aim where you'll be."*

### Calls

- A **Called** skill marks its area now and **lands at the start of your next turn**, before you move, even if you're Stunned. Both parties see the area and the counter.
- The party orders its turns every round, and the starter alternates. Act last this round and first next round, and the Call lands after one or two enemy turns. Act first and last, and it lands after five.
- A Call hits **every unit** in its area, allies included, unless the Orrery keystone says otherwise. Underground units are spared unless the Call is a Quake.
- You hold **one** Call at a time. If you're Downed before it lands, it fizzles.
- **Snap** (innate, free, cooldown 3) makes your oldest pending Call land right now at half power. A half-power Gravity Well pulls 1 tile.
- Roots, Stuns, Threads and pits make a Call hard to escape. That's how the other classes feed the Astromancer.

### Skills (pick 3 of 7)

| Skill | Kind | Cooldown | What it does | Rune A (later) | Rune B (later) |
|---|---|---|---|---|---|
| **Meteor** | Call | 3 | A 3×3 area within 6: 30 at the center, 15 around, and Burning. Ignites grass and bursts braziers. Quake. | *Crater*: a pit at the center for 2 rounds | *Shower*: three 1-tile stars of 18 |
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
- A Thread **breaks** as soon as a wall or smoke stands between its ends, or either end goes underground, is Downed, or is Burning.
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
| Delver + Astromancer | **Deep Impact** | A Call whose area holds one of your Tunnel Mouths also lands on every other mouth of that tunnel, at half power. Recall doesn't echo. |
| Delver + Weaver | **Silk Tunnels** | Allies a Weaver holds walk between joined Tunnel Mouths for free. |
| Astromancer + Weaver | **Star-Tether** | An enemy held by your Weaver when your Call hits it is Exposed for 2 turns (+25% damage taken). |
| Delver × 2 | **Shared Warren** | Every Tunnel Mouth of your party is joined into one network. |
| Astromancer × 2 | **Conjunction** | A Call that lands in a round where another of your Calls already landed deals +25%. |
| Weaver × 2 | **Great Web** | +1 Thread each, and your webs last 1 round longer. |

**Role coverage** replaces the old Holy Trinity, and it reads paths, not classes. A character's role is the role of the path holding its keystone, or, without a keystone, its path with the most points (the first path on a tie, and damage with no points). A party covering tank, damage and support gets +40 max HP each. Three damage builds get nothing.

## Verification

1. Class win share within 45% to 55% over 600 AI battles across all three maps.
2. Every path appears in a party that wins at least 45% against random parties.
3. Three damage keystones against a role-covering party wins under 35%.
4. The AI burrows, Calls and Threads in at least 80% of battles where it has them. If the AI can't use a mechanic, the balance numbers mean nothing.
5. A full battle through the real UI: a Call's landing area, a tunnel trip, a Thread leash and a web each render and read correctly.

## Bench: concepts not picked

- **Bellringer.** Rings bells that rewrite the round's queue: delay an enemy's turn, pull an ally's forward.
- **Revenant.** Fights while Downed. Its bleed turns are a ghost form that still acts.
- **Mimic.** Copies the last skill used on it.
