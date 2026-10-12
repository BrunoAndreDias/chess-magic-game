# Battle turns

The turn order was fixed in the picks: each round runs the same queue, the starter's heroes opening and closing it. A round opens on a `Round N` banner and goes straight to the first turn. On a Human turn the player may move once (blue tiles) and use one action (skills on keys 1–n), then end the turn; hovering an aimed target previews the result. AI turns play themselves.

## Sub-features

- `turn-move` moves the acting unit by clicking a reachable tile.
- `turn-cast` aims a skill (button or hotkey) and clicks a highlighted tile.
- `turn-preview` `#tooltip .tt` names the skill while hovering an aimed tile, with who it hits.
- `turn-cancel` `Escape` or right-click cancels aiming.
- `turn-end` `#endturn` or `Space` ends the turn.
- `turn-hud` `#initbar` (`.ichip.now` acting), `#roster0`/`#roster1`, `#selinfo`, `#log`, `#hintbar`, `#banner`, `#combo` follow the events.
- `turn-camera` `c` / `#btn-cam` toggles follow (`🎥 Follow: on|off`); right-drag orbits.
- `turn-ult` every character's ultimate countdown is public: `#initbar .ichip .ub` and `.rcard .ub` show the ultimate's icon over its own turns left (`data-ult`), `.ub.ready` lit at 0; hovering one names the ultimate and when it's ready. The action bar's ultimate is `.spbtn.ultimate` (`.ready` glows), on the key after the 2 picks.
- `turn-ult-aim` Falling Star aims like a Call; hovering a target also paints the enemies its cast pulls and where they land (pink) and lists them in the tooltip. The Crossing's targets are the 4 tiles next to the caster; hovering one paints the line and previews each enemy's damage and who stands up. Command Performance takes three clicks, each named in `#hintbar`: the enemy, the tile it walks to (`walks:`), then whom it hits or its new tile for nobody (`to attack nobody`); `Escape` or right-click goes back one step. Showstopper is self-cast: its hotkey twice.

## How to get to it (user POV)

- Ready on scout with at least one Human party.

## Driving it with drive.cjs

Preconditions:

- Query `"?quick&map=span&seed=7"`, click `#sc-ready`, `untilPhase('battle')`.

- **A Blue turn.** `until` `#endturn` is enabled (up to 2 min), wait ~800 ms. If `engine` finds no aimed skill for `L.current(s)` (below), press `Space` and wait for the next Blue turn.
- **Move.** A tile from `engine((L, s) => [...L.reachable(s, L.current(s)).keys()])` (index = `z * 12 + x`) off the unit's own column; `clickTile` it. `state()` has the unit there with `moved: true`.
- **Aim.** In `L.actionsOf(u)`, skip `helpup`, self-target and `free` skills; keep one where `L.canUse` holds and `L.castTargets` has a tile with `L.terrAt(s, x, z) !== 'o'`. Press its index + 1: `#actions .spbtn.on[data-skill="<id>"]` exists.
- **Preview.** `hoverTile(target)`: `#tooltip .tt` reads the skill (`⛈️ Thunderhead`). Shot.
- **Cancel.** `Escape`: no `.spbtn.on`.
- **Cast.** Hotkey again, `clickTile(target)`: `acted: true`, and `#log` gains `<Name> uses <Skill>.`
- **End.** If `L.current(s)` is still the unit, `Space`; then it is another unit.
- Done: `examples/battle-turn.cjs` passes; it covers move, cast, preview, cancel and end.
- **Ultimates.** An ultimate is ready on its owner's 4th turn (`L.ultIn(u) === 0`). Play Blue turns by `L.aiTurn` until then, press `L.actionsOf(u).indexOf(L.CLASSES[u.cls].ult) + 1`, hover until `#tooltip` names the ultimate, click. For Command Performance pick the plan with `L.puppetWalks` / `L.puppetHits` and assert `#hintbar` between clicks. For a Marionettist or Mirrormime on Blue, change classes on the picks screen first.

## Gotchas

- The battle mounts on a `To battle!` banner; `state().phase.kind` is `ready` until it clears and round 1 starts.
- A Gravecaller has nothing to aim on round 1 (Rites need Souls, enemies out of reach).
- A unit or wall nearer the camera can cover a tile's centre and swallow the click; assert the state change and pick another tile.
- Chasm tiles (`o`) appear in tile-target lists, but the pointer falls through them: no preview, no cast.
- A unit with nothing left to do ends its turn by itself ~450 ms later, so a late `Space` ends the next unit's turn. Check who is acting first.
- `#endturn` is disabled during AI turns and while events animate; hotkeys are ignored while focus is in an input or select.
- The Marionettist's Strings and the Mirrormime's Invisible Wall aim at tiles: `L.castTargets` lists where the Doll can walk or the glass can stand. Switch, Razor Wire and Stand-In need the Doll standing (`#actions` reads `Doll broken` otherwise).
- The AI won't shoot through enemy glass or hit a Mirrored unit unless it pays; to see a bounce or a turned-back hit, make Red Human too (`.pk-ctrl[data-team="1"]`) and play both sides.
- With follow on, the camera can leave a target tile under a panel; `clickTile` then throws. Pick another target or `Escape`.
