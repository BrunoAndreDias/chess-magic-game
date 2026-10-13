# Ultimates

Every class has one ultimate, fixed in its kit and on key `5`. Its countdown is public: each chip in `#initbar` and each roster card shows the ultimate's icon over its owner's turns left, counting down at the start of each of the owner's turns, so the ultimate is ready on the owner's 4th turn and goes back to 5 once cast. Each ultimate aims its own way and previews what it will do.

## Sub-features

- `ult-countdown` `#initbar .ichip .ub[data-ult]` and `.rcard .ub` read 4 before a unit's first turn and tick down per own turn; `.ub.ready` (text `ready`) at 0. Hovering one names the ultimate and when it is ready.
- `ult-button` `#actions .spbtn.ultimate[data-skill]` gains `.ready` at 0 and glows only while enabled (The Crossing stays disabled with `Needs a Soul`).
- `ult-falling-star` (Astromancer) aims like a Call: hovering a target also paints the enemies it pulls and where they land (pink) and lists them (`<Name>: pulled into the area`) plus friendly fire (`⚠ <Ally>: ally in the area, friendly fire`). Casting logs `<Name> uses Falling Star.`, `Falling Star is called: it lands at the start of <Name>'s next turn.` and each slide; the caster's chip gains `☄`.
- `ult-crossing` (Gravecaller) targets the 4 tiles next to the caster; hovering one paints the line and previews each enemy's damage and who stands up. Needs a Soul.
- `ult-encore` (Bellringer) gives an ally within 3 an extra turn: its chip shows `.extra` / `+1`, and cooldowns don't tick on it.
- `ult-command` (Marionettist) Command Performance takes three clicks, each named in `#hintbar`: the enemy, the tile it walks to (`walks:`), then whom it hits or its new tile for nobody (`to attack nobody`); `Escape` or right-click goes back one step. Logs `<X> takes <Y> by the strings: Command Performance!`.
- `ult-showstopper` (Mirrormime) is self-cast: its hotkey twice.

## How to get to it (user POV)

- Reach the owner's 4th turn in a battle. For a Marionettist or Mirrormime on Blue, change classes on the picks screen first (no `quick`).

## Driving it with drive.cjs

Preconditions:

- Query `"?quick&map=span&seed=7"`, click `#sc-ready`, `untilPhase('battle')`, wait out the intro.

- **Countdown.** On each Blue turn (`#endturn` enabled, ~800 ms), log `#roster0 .rcard .ub` `data-ult` and `L.ultIn(L.current(s))`; press `Space` unless the acting unit is Seren with `ultIn` 0. Seed 7 reads `3 4 4 → 3 3 4 → 3 3 3` in round 1 and Seren is ready in round 4.
- **Aim.** `#actions .spbtn.ultimate.ready[data-skill="fallingstar"]` is enabled. Press `String(L.actionsOf(u).indexOf(L.CLASSES[u.cls].ult) + 1)` (`5`). Take targets from `L.castTargets(s, u, 'fallingstar')`, most `L.starPulled(s, u, x, z).length` first; hover until `#tooltip` names `Falling Star`. Shot.
- **Cast.** `clickTile` it: Seren `acted`, `#log` gains `Seren uses Falling Star.`, `L.ultIn` is 5, her chip reads `☄`.
- Other ultimates: change Blue's classes on picks first, then the same loop; for Command Performance pick the plan with `L.puppetWalks` / `L.puppetHits` and assert `#hintbar` between clicks.
- Done: `examples/ultimate.cjs` passes; it covers countdown, button and Falling Star.

## Gotchas

- Passing turns with `Space` leaves Blue exposed; seed 7 on span keeps Seren standing through round 4, other seeds may not.
- The Gravecaller's The Crossing shows `.ready` yet stays disabled until the Gravecaller holds a Soul.
- A Call's area can hold allies; the preview warns, the cast still lands.
