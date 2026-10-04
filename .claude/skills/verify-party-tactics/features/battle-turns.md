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

## How to get to it (user POV)

- Ready on scout with at least one Human party.

## Driving it with drive.cjs

Preconditions:

- Query `"?quick&map=span&seed=7"`, click `#sc-ready`, `untilPhase('battle')`.

- **A Blue turn.** `until` `#endturn` is enabled (up to 2 min), wait ~800 ms. If `engine` finds no aimed skill for `L.current(s)` (below), press `Space` and wait for the next Blue turn.
- **Move.** A tile from `engine((L, s) => [...L.reachable(s, L.current(s)).keys()])` (index = `z * 12 + x`) off the unit's own column; `clickTile` it. `state()` has the unit there with `moved: true`.
- **Aim.** In `L.actionsOf(u)`, skip `helpup`, self-target and `free` skills; keep one where `L.canUse` holds and `L.castTargets` has a tile with `L.terrAt(s, x, z) !== 'o'`. Press its index + 1: `#actions .spbtn.on[data-skill="<id>"]` exists.
- **Preview.** `hoverTile(target)`: `#tooltip .tt` reads the skill (`☄️ Meteor`). Shot.
- **Cancel.** `Escape`: no `.spbtn.on`.
- **Cast.** Hotkey again, `clickTile(target)`: `acted: true`, and `#log` gains `<Name> uses <Skill>.`
- **End.** If `L.current(s)` is still the unit, `Space`; then it is another unit.
- Done: `examples/battle-turn.cjs` passes (seed 7: Seren casts Meteor); it covers move, cast, preview, cancel and end.

## Gotchas

- The battle mounts on a `To battle!` banner; `state().phase.kind` is `ready` until it clears and round 1 starts.
- A Gravecaller has nothing to aim on round 1 (Rites need Souls, enemies out of reach).
- A unit or wall nearer the camera can cover a tile's centre and swallow the click; assert the state change and pick another tile.
- Chasm tiles (`o`) appear in tile-target lists, but the pointer falls through them: no preview, no cast.
- A unit with nothing left to do ends its turn by itself ~450 ms later, so a late `Space` ends the next unit's turn. Check who is acting first.
- `#endturn` is disabled during AI turns and while events animate; hotkeys are ignored while focus is in an input or select.
