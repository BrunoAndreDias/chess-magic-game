# Battle turns

The turn order was fixed in the picks: each round runs the same queue, the starter's heroes opening and closing it. On a Human turn the player may move once (blue tiles; hovering one draws the path) and use one action (keys `1`–`6`: basic, innate, the 2 picks, the ultimate, Help Up), then end the turn; hovering an aimed target previews the result. Free skills (innates, Switch) don't use the action. A unit with nothing left to do ends its turn by itself. AI turns play themselves while the HUD says who is acting. `⟲ Party` abandons the battle for the picks.

## Sub-features

- `turn-move` moves the acting unit by clicking a reachable tile.
- `turn-cast` aims a skill (button or hotkey; the same key again cancels, or casts a self-target skill) and clicks a highlighted tile.
- `turn-preview` while hovering an aimed tile, `#tooltip` opens on `.tt` `<icon> <Skill>` with who it hits and how.
- `turn-cancel` `Escape`, or a right-click over a tile, steps back out of aiming.
- `turn-end` `#endturn` or `Space` ends the turn.
- `turn-hud` `#initbar` (`.ichip.now` acting, `.done`, `.close` for the closer), `#roster0`/`#roster1` (HP, statuses `.sti`, 👻 Souls, 🪆 Doll), `#selinfo`, `#log` (`<Name> uses <Skill>.` or `… on <Target>.`), `#hintbar` (`<Name>, your turn: blue tiles = move, 1–6 = skills, Space = end turn.`), `#combo`, and why a button is disabled in its `.st` text (`Action used`, `Ready in N turns`, `Needs a Soul`, `Doll broken`, …).
- `turn-camera` `c` / `#btn-cam` toggles follow (`🎥 Follow: on|off`); right-drag orbits.
- `turn-ai` on an AI turn `#endturn` is disabled and `#actions .wait` reads `<Team> party (AI) is acting…`.
- `turn-setup` `⟲ Party` (`#btn-setup`) goes to picks with the same map, starter and builds and every lock cleared; the battle is dropped with no result.

## How to get to it (user POV)

- Ready on scout with at least one Human party, then wait out the intro.

## Driving it with drive.cjs

Preconditions:

- Query `"?quick&map=span&seed=7"`, click `#sc-ready`, `untilPhase('battle')`.

- **A Blue turn.** `until` `#endturn` is enabled (up to 3 min), wait ~800 ms. If `engine` finds no aimed skill for `L.current(s)` (below), press `Space` and wait for the next Blue turn.
- **Move.** A tile from `engine((L, s) => [...L.reachable(s, L.current(s)).keys()])` (index = `z * 12 + x`) off the unit's own column; `clickTile` it. `state()` has the unit there with `moved: true`.
- **Aim.** In `L.actionsOf(u)`, skip `helpup`, self-target and `free` skills; keep one where `L.canUse` holds and `L.castTargets` has a tile with `L.terrAt(s, x, z) !== 'o'`. Press its index + 1: `#actions .spbtn.on[data-skill="<id>"]` exists.
- **Preview.** `hoverTile(target)`: `#tooltip` is shown and `.tt` names the skill. Shot.
- **Cancel.** `Escape`: no `.spbtn.on`.
- **Cast.** Hotkey again, `clickTile(target)`: `acted: true`, and `#log` gains a line starting `<Name> uses <Skill>`.
- **End.** If `L.current(s)` is still the unit, `Space`; then it is another unit.
- **Camera.** `c`: `#btn-cam` reads `🎥 Follow: off`; `c` again, `on`.
- **Party.** On a Blue turn click `#btn-setup`, `untilPhase('picks')`: `#su-mapinfo` names the map, `dump()` shows `on clock: step 0, team 0`, no `.pk-seat.locked`.
- Done: `examples/battle-turn.cjs` passes (move, cast, preview, cancel, end); `examples/ultimate.cjs` passes (camera, `⟲ Party`).

## Gotchas

- Round 1 can have nothing to aim: the default Gravecaller's Siphon and Soul Bolt and some basics are out of reach.
- A unit or wall nearer the camera can cover a tile's centre and swallow the click; assert the state change and pick another tile.
- Chasm tiles (`o`) take the pointer (tooltip `Chasm · Impassable…`), but their sunken centre often lies behind a neighbour's face, so the hover lands on that neighbour. Prefer solid targets.
- A unit with nothing left to do ends its turn by itself ~450 ms later, so a late `Space` ends the next unit's turn. Check who is acting first.
- `#endturn` is disabled during AI turns and while events animate; hotkeys are ignored while focus is in an input or select.
- `#tooltip` keeps its last contents when hidden; check it is shown before reading `.tt`.
- The Marionettist's Strings and the Mirrormime's Invisible Wall aim at tiles: `L.castTargets` lists where the Doll can walk or the glass can stand. Strings, Switch, Razor Wire and Stand-In need the Doll standing (`Doll broken`, `Doll too far`).
- The AI won't shoot through enemy glass or hit a Mirrored unit unless it pays; to see a bounce or a turned-back hit, make Red Human too (`.pk-ctrl[data-team="1"]`) and play both sides.
- With follow on, the camera can leave a target tile under a panel; `clickTile` then throws. Pick another target or `Escape`.
