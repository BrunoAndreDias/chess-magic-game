# Skill backlog

Each class now has a pool of 4 skills, picks 2, and carries one fixed ultimate (`docs/classes.md`, "The kit"). This file holds what left the pools when they shrank from 7, and the ideas for growing them again. Nothing here is in the game.

## Adding a skill

Pools grow one skill at a time, and only once the current pool and the tree play well.

1. **It must make a new choice.** A good fifth skill changes how the class plays when it's picked, the way Dance makes Razor Wire a combo. A bigger number on a job the pool already does (a second plain bolt) doesn't earn a slot.
2. **Check it against the tree.** Name the nodes and keystones that touch it, and the paths that would never pick it. A skill no path wants is dead weight.
3. **Check it against the ultimate.** A skill that does the ultimate's job on a short cooldown makes the ultimate pointless.
4. **Pass the gates.** The Verification section of `docs/classes.md`, rerun with the new pool. The AI has to use it before its win rate means anything.

## Astromancer

| Skill | Kind | Cooldown | What it did | Runes | Why it left | Coming back |
|---|---|---|---|---|---|---|
| **Gravity Well** | Call | 3 | Within 5. Every unit within 2 of the center is pulled 2 toward it, nearest first. Into a wall or unit: SLAM. Into a chasm: ABYSS. | *Collapse*: 12 to everyone pulled. *Repulse*: pushes out instead. | Falling Star carries a 1-tile pull. | **First candidate.** The class's best positional tool, and the big balance lever of the 7-skill kits (Benevolent Heavens made it pull allies to safety). |
| **Glacial Prison** | Instant | 3 | Any other unit within 3 is **Encased** for 1 turn: it skips its turn and can't be damaged or moved. Then it's Wet. | *Cold Sleep*: an ally heals 20. *Brittle*: +25% taken after. | It was the Rime path's identity, and Encased is one more status to read. | A Rime pick. If it returns, Rime's node 2 and Absolute Zero can go back to touching it (cooldown −1, Encased units Stunned, holds an enemy 2 turns). |
| **Meteor** | Call | 3 | A 3×3 area within 6: 30 at the center, 15 around, and Burning. Ignites grass and bursts braziers. | *Crater*: a pit at the center for 2 rounds. *Shower*: three 1-tile stars of 18. | Falling Star is Meteor made bigger. | Only if Falling Star changes. *Shower* is the most distinct part: three small stars as a skill of their own. |

## Gravecaller

| Skill | Kind | Cooldown | What it did | Runes | Why it left | Coming back |
|---|---|---|---|---|---|---|
| **Soul Burst** | Instant | 2 | A Soul on the ground within 4 bursts: 18 to every enemy within 1 of it. Spends a Soul on the ground, not a held one. | *Chain*: bursts Souls next to it too. *Bind*: Roots instead of the last 6. | Four slots, and Soul Bolt already covers damage. | **First candidate.** It makes a real choice against Harvest: burst a Soul where it lies, or gather it for The Crossing. |
| **Equalize** | Instant | 3 | A unit within 3. Your HP % and its HP % even out, moving at most 30 HP. On an enemy healthier than you, you take its HP. On an ally hurt worse than you, you give it yours. | *Toll*: up to 45. *Fair Share*: also swaps statuses. | Hard to read at a glance. | A Lich pick: trading HP is the Ferry's force. Needs a target preview that shows both sides' HP after. |
| **Last Rites** | Rite | 3 | A Downed ally within 3 stands up at 40% HP, paid from your own HP (never your last). | *Second Wind*: also a 20 shield. *Long Reach*: range 5. | The Crossing does its job. | Only if The Crossing loses its revive. A revive on a short cooldown makes the ultimate pointless. |

## Bellringer

| Skill | Cooldown | What it did | Runes | Why it left | Coming back |
|---|---|---|---|---|---|
| **Overture** | 4 | Free. Every ally that hasn't acted this round moves to right after you, in its current order. Doesn't count as a Toll. | *Fanfare*: they get +1 move. *Prelude*: also clears their Root. | Four slots. | **First candidate**, for the Conductor path: a party that moves as one block. |
| **Hourglass** | 3 | A unit within 3. Its timed statuses run out now. On an enemy, its remaining Burn hits at once and its shield is gone. On an ally, only its debuffs go. | *Sand Trap*: then Rooted (enemy). *Borrowed Time*: then a 20 shield (ally). | Its value depends on the statuses others put out, which makes it hard to tune alone. | After the pools carry more statuses. |
| **Encore** | 4 | An ally within 3 that already acted this round takes an extra turn at the end of the round. | *Bow*: the ally gets a 15 shield. *Reprise*: works on yourself. | Now the ultimate. | Its runes can become the ultimate's keystone rewrites. |

## Marionettist

| Skill | Cooldown | What it did | Runes | Why it left | Coming back |
|---|---|---|---|---|---|
| **Tangle** | 3 | Every enemy next to your Doll takes 10 and is Rooted. | *Knot*: radius 2. *Snare*: Stunned instead, on a Rooted enemy. | Four slots, and Dance covers control. | **First candidate**, for Heartwood: walk the Doll into a crowd, then hold them there. |
| **Splinter** | 3 | Your Doll bursts: 26 to every enemy next to it. The Doll breaks. | *Shrapnel*: radius 2. *Kindling*: the burst sets Burning. | A Doll that breaks itself costs 2 rounds of the class mechanic. | A Ventriloquy pick, once the Doll's reform time is tuned for the smaller pool. |
| **Rebuild** | 4 | A broken Doll reforms next to you now. A standing one mends to full and gets a 15 shield. | *Oak*: +20 Doll HP until it breaks. *Quick Glue*: cooldown 3. | It only fixes a problem, it doesn't create a play. | Pairs with Splinter: if Splinter returns, Rebuild might fold into it as a rune. |

## Mirrormime

| Skill | Cooldown | What it did | Runes | Why it left | Coming back |
|---|---|---|---|---|---|
| **Shatter** | 2 | All your glass shatters: 16 to every enemy next to it, once each. | *Shards*: Burning glass. *Keep One*: one tile stays. | It needs Invisible Wall picked too. | **First candidate.** A pair you pick together or not at all is a build-defining choice. Hall of Mirrors' node 3 (enemies next to rising glass take 8) can return to "Shatter +6". |
| **Mock** | 3 | An enemy within 3 is Mocked for its next turn: of your party, its skills can target only you. | *Jeer*: also the enemy nearest it. *Pratfall*: Exposed too. | Showstopper Mocks every enemy within 3. | Only as a much weaker single-target taunt, if a tank build needs one between ultimates. |
| **Mirrorball** | 4 | Every ally within 2 (you too) is Mirrored, and every enemy within 2 takes 8. | *Disco*: radius 3. *Glitter*: enemies Exposed. | Too close to Showstopper. | As a Smoke and Mirrors keystone rewrite of Showstopper: Mirror the allies around you instead of only yourself. |

## Tree nodes rewritten

When a node pointed at a skill that left, it was rewritten to point at the pool or the ultimate. If the skill returns, these are the old texts.

| Path | Node | Was | Now |
|---|---|---|---|
| Rime | 2 | Glacial Prison cooldown −1 | Frostbolt range +2 |
| Rime | Keystone | Absolute Zero: units Rooted or Encased when your Call lands are Stunned by it, and Glacial Prison holds an enemy 2 turns | Units Rooted when your Call lands are Stunned by it |
| Reaper | 3 | Soul Burst +8 | Siphon +6 |
| Psychopomp | 1 | Last Rites range +3 | The Crossing's line +2 tiles |
| Psychopomp | Keystone | Ferryman counts Help Up or Last Rites | Ferryman counts Help Up or The Crossing |
| Conductor | 2 | Encore cooldown −1 | Encore cooldown −1 (Encore is the ultimate now, so this is 5 → 4) |
| Ventriloquy | 3 | Splinter +6 | Dance takes 1 more step |
| Stagecraft | 3 | Stand-In cooldown −1 | Stand-In covers allies within 2 of your Doll |
| Hall of Mirrors | 3 | Shatter +6 | Enemies next to your glass when it rises take 8 |
| Smoke and Mirrors | 3 | Mirrorball cooldown −1 | Showstopper cooldown −1 |

## Ultimates considered and not picked

| Class | Idea | Why not (yet) |
|---|---|---|
| Bellringer | **Midnight**: every enemy within 3 that hasn't acted is Tolled to the end of the round, ignoring once per round. | Encore is clearer team play. A good keystone rewrite of Encore for Carillon. |
| Gravecaller | **Last Rites** as the ultimate, revive only. | Dead when nobody is Downed. The Crossing also hits. |
| Marionettist | **Curtain Call**: the Doll bursts for Splinter's damage and reforms next to you at once. | Cheaper to build, but it's a bigger number on the Doll, not the puppeteer fantasy. |
| Mirrormime | **Mirrorball** at full power: every ally within 2 Mirrored against every hit. | Spreads the identity thin. "Hit *me*" is the mime. |

## Ideas for later

- **Keystones rewrite the ultimate.** Each path's keystone gives the ultimate a role-flavoured version: Rime's Falling Star Stuns the Rooted, Orrery's heals allies in its area, Carillon's Encore becomes Midnight. Built once the 4-skill pools are balanced, so one change moves at a time.
- **A charge meter instead of the timer.** The ultimate fills when you play your mechanic (a Call lands on an enemy, a Soul is gathered, a Toll, a hit on the Doll, a hit turned back). It ties the ultimate to the class, but it snowballs and is harder to read than a public countdown. Worth trying if the timer makes the ultimates feel cut off from the class.
