---
name: verify-party-tactics
description: Drive the Party Tactics browser game (Vite + three.js, 3v3 tactics) in headless Chromium through its real UI and capture screenshot/state evidence. Use to prove a client, HUD, menu or rules change works for a player, to reproduce a UI bug, or before claiming a gameplay change is done. Not for pure engine logic, which `npm test` and `npm run sim` cover.
---

# Verify Party Tactics

A player goes **map → picks → scout → battle → result** on one page. `scripts/drive.cjs` owns a Vite server and a Chromium for one run of a *steps file* you write, saves evidence, and tears both down. Paths are relative to the repo root.

Read [`features/README.md`](features/README.md), then the feature file for what you are proving, before driving.

## Launch

```sh
.claude/skills/verify-party-tactics/scripts/doctor.sh [port]          # read-only readiness check; exit 1 = fix first
PORT=<port> .claude/skills/verify-party-tactics/scripts/drive.cjs <steps.cjs> "<query>"
```

- Pick a free port (default 5288; another session may hold it). Never stop a drive you did not start, and leave the user's `npm run dev` on :5173 alone.
- The drive prints `drive: pid <pid>, …` first and ends on `PASS: <summary>; errors 0` (exit 0) or `FAIL: …` (exit 1). Any page error, console error or text in `#errbox` turns it into FAIL.
- Query (`src/client/main.ts`): `seed=<int>` fixes the map draw, the starter and the AI; `map=span|storm|altar` (an unknown id throws into `#errbox`); `quick` opens on scout with the default draft, skipping map and picks; `ai` makes all six characters AI. Always pass `seed` and `map`.
- Env: `EVIDENCE=<dir>`, `HEADED=1`, `CHROME=<binary>`.

## Drive

A steps file is CommonJS exporting `async (ctx) => summaryString`; throw to fail. Start from the closest `examples/` file; put one-off steps files in your scratchpad.

| `ctx` member | does |
|---|---|
| `page` | the Playwright page: `click`, `keyboard.press`, `textContent`, `$$eval` |
| `phase()` | `'map' \| 'picks' \| 'scout' \| 'battle' \| 'result'` |
| `untilPhase(p, ms=20000)` / `until(pred, ms)` | wait for a phase (throws) / poll a predicate (returns a boolean) |
| `dump()` | the screen as text: phase, `#errbox`, headings, every visible button grouped by its nearest id (named by its `data-*` handle, `*` = `.on`, `(disabled)`), the on-clock seat on picks, the queue in battle (`>` = acting) |
| `shot(name)` | saves `NN-name.png` plus a 960px `NN-name.jpg`, returns the JPEG path |
| `state()` | the `BattleState` on screen: scout's deploy preview, the battle, the final state on result; null on map and picks |
| `engine((L, s, arg) => …, arg)` | runs in the page with the engine module `L` and `state()`; for reading only (legal tiles, `L.castTargets`, `L.aiTurn`) |
| `tileXY({x,z})` / `hoverTile` / `clickTile` | a board tile's screen point once the camera settles; hover/click it like a player (throws if off screen or under a panel) |
| `log(msg)` / `wait(ms)` | step line into the output and `result.json` / sleep |

Reading the screen: `dump()` first, always; it answers what is shown and what is pressable. Read a JPEG only to judge how something looks, and read each image once.

Act through the page (clicks, hotkeys, tiles). `window.__party` and `engine()` read; they never make something happen.

## Handles

From `src/client/screens/*.ts`; the feature files say what each does.

- **Map:** `#mapview`, `#mp-name`, `#mp-timeline li`, `#hintbar`, `#tooltip`, `#mp-go`.
- **Picks:** `#picks`, `#su-mapinfo`, `#pk-coin`, `#pk-cta` (`.sealed` during the lock-in beat), `#pk-lock`, `#pk-hero`, `#pk-sound`, `#pk-go`, `#pk-track .pk-seat[data-step][data-team]` (`.locked` / `.now` / `.fresh`, `.art` splash once locked), team control `.pk-ctrl[data-team] button`, plates `#su-teams .pslot[data-team][data-slot]` (`.on`, `.locked`), `.su-tab[data-team]` (after the draft), `#ed-name`, `#ed-ctrl button`, `.ccard[data-cls]` (open hero) or `#ed-cls` (locked), build strip `#ed-build .slot[data-skill]` (`.innate`), `#ed-emblem`, `#ed-open`; build modal `#pk-build` (`.hidden` when closed), `#pk-build-t`, `#pk-build-done`, and inside it `#ed-skills .skc[data-skill]` (`.innate`, `.on`), `#ed-rec`, `.treewrap .node[data-node]` (`.on`, `.live`, `.locked`), `.tree .pts b`; final clock `#pk-final` (`#pk-cta.final`, `.urgent` in the last 10 s), `.su-bonus .bchip` (`.off`), `#su-timer`, `#su-random`.
- **Scout:** `#scout h2`, `#scout .tag`, `#sc-units .du[data-slot]` (`.on`), `#sc-timer`, `#sc-auto`, `#sc-rule`, `#sc-ready`.
- **Battle:** `#actions .spbtn[data-skill]` (`.on` = aiming), `#actions .wait`, `#endturn`, `#btn-cam`, `#btn-setup`, `#initbar .ichip` (`.now`), `#ib-hazard`, `#roster0`/`#roster1 .rcard[data-unit]`, `#selinfo`, `#log div`, `#hintbar`, `#tooltip .tt`, `#banner`, `#combo`.
- **Result:** `#res-tag`, `#res-title`, `#res-why`, `table.stats`, `#res-again`, `#res-party`, `#res-map`.

## Evidence

The run's directory (printed as `evidence:`, default `$TMPDIR/verify-party-tactics/<stamp>-<steps>/`) holds the shots, `console.log` and `result.json` (pass, url, summary, step log, errors). A battle that reaches the result screen also leaves its replayable record as one line in `games.jsonl` there (never in the player's `games/games.jsonl`).

A proof is done when all hold:

- `PASS … errors 0`.
- It went through the player's path, and asserts the consequence on the next screen or in `state()` (a renamed hero on the scout roster, a moved unit's `x,z`, a new `#log` line), not just the click.
- A `log` line records what the DOM or state showed after the action; a shot exists for each claim about looks.

## Cleanup

drive.cjs tears itself down. If one was interrupted, kill only the pid from its `drive:` line, or the holder `doctor.sh` names on your port once its command is `drive.cjs`. Delete your scratch steps files; leave the evidence.

## Examples

Each passes as written with the query in its header.

- `examples/picks-to-scout.cjs` (`"?map=storm&seed=7"`): edit a hero in the build modal, lock Blue's turns between Red's AI locks, see the order and edits on scout.
- `examples/scout-deploy.cjs` (`"?quick&map=span&seed=7"`): hover, place, auto-deploy, Ready, the unit stands there in battle.
- `examples/battle-turn.cjs` (`"?quick&map=span&seed=7"`): move, aim, preview, cancel, cast, end a Blue turn.

For a whole Human-played battle, `node scripts/playtest.cjs` (env `MAP`, `SEED`, `PORT`, `SHOTS`, `ALL_AI=1`) goes map → picks → scout → result → Rematch.
