# Dev pages

Three surfaces sit beside the game for its developers. `?perf` adds a readout bottom left with frame rate, frame work, janks, draw calls, triangles and shaders. `gallery.html` shows every class figure on both teams, close up and at battle distance, on a chosen biome's light, optionally replaying one animation clip. And anything that throws lands in the red error overlay at the top of the page instead of failing silently.

## Sub-features

- `perf-hud` with `?perf`, `#perfhud` (outside `#ui`, ignores the pointer) fills after a second and refreshes every second: `<fps> fps  work <p50>/<p95> ms  <n> janks` / `<calls> calls  <N>k tris  <programs> shaders`.
- `gallery` `gallery.html?biome=span|storm|altar` (unknown or missing → storm) shows 5 classes × 2 teams on `canvas#c`, labelled in `#names` (`Astromancer`, `Gravecaller`, `Bellringer`, `Marionettist`, `Mirrormime`); `&act=<clip>` replays that clip on every figure that has it, `&at=<sec>` holds the pose.
- `errbox` an uncaught error or rejection shows `#errbox` (it loses `.hidden`) with the message; `?map=nope` throws `Unknown ?map=nope: use one of span, storm, altar` before the game mounts.

## How to get to it (user POV)

- Add `perf` to the game's query; open `/gallery.html`; anything that throws.

## Driving it with drive.cjs

Preconditions:

- `?perf`: query `"?perf&quick&map=span&seed=7"`. Gallery: query `"gallery.html?biome=altar&act=cast&at=0.4"`. Error: query `"?map=nope&seed=7"`.

- **Perf.** `untilPhase('scout')`, `until` `#perfhud` has text (5 s): it matches `/^\d+ fps  work [\d.]+\/[\d.]+ ms  \d+ janks\n\d+ calls  \d+k tris  \d+ shaders$/`; `dump()` prints it as `perf:`. Assert the shape: swiftshader runs at 3 or 4 fps.
- **Gallery.** `until` `#names div` counts 5 (30 s), log their texts, wait 1500 ms, shot. `phase()` and `state()` are null there.
- **Error.** `expectError(/Unknown \?map=nope/)` first, then `until` `#errbox` loses `.hidden`: `dump()` shows `phase: (no __party)` and the `errbox:` line. Without `expectError` the same run FAILs on that error, which is the control.
- Done when each page's line is logged and the gallery shot exists.

## Gotchas

- With `?perf` the readout resets the frame meter every second, so `window.__party.board.perf()` covers at most the last second.
- Off the game page only `page`, `until`, `wait`, `shot`, `dump`, `games` and `log` work; `engine` and the tile helpers need `window.__party`.
- `npm run perf` (a production build, real GPU) is the perf gate, not this readout; see `CLAUDE.md`.
