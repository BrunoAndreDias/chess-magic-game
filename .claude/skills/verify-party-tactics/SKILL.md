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
- The drive prints `drive: pid <pid>, …` first and ends on `PASS: <summary>; errors 0` (exit 0) or `FAIL: …` (exit 1). Any page error, console error or text in `#errbox` turns it into FAIL, unless the steps file expected it (`expectError`).
- Query (`src/client/main.ts`): `seed=<int>` fixes the map draw, the starter, the scout deploy and the AI; `map=span|storm|altar` (an unknown id throws into `#errbox`); `quick` opens on scout with the default draft, skipping map and picks; `ai` makes all six characters AI; `perf` adds the frame readout `#perfhud`. Always pass `seed` and `map`.
- The query is appended to `http://localhost:<port>/`, so `"gallery.html?biome=storm"` opens the model gallery instead of the game.
- Env: `EVIDENCE=<dir>`, `HEADED=1`, `CHROME=<binary>`.
- Under swiftshader a drive is slow: the battle intro takes 2 to 8 s, an all-AI battle 5 to 10 minutes. Run anything that plays a battle to its end as a background Bash call.

## Drive

A steps file is CommonJS exporting `async (ctx) => summaryString`; throw to fail. Give the function a `.before = async (ctx) => …` to act before the first page load (`page.addInitScript`, `page.emulateMedia`, `page.clock.install`); a `page.reload()` in the body aborts a load in progress and logs texture errors. Start from the closest `examples/` file; put one-off steps files in your scratchpad.

| `ctx` member | does |
|---|---|
| `page` | the Playwright page: `click`, `keyboard.press`, `textContent`, `$$eval`, `clock` |
| `phase()` | `'map' \| 'picks' \| 'scout' \| 'battle' \| 'result'`; null off the game page (gallery, or a throw before the game mounted) |
| `untilPhase(p, ms=20000)` / `until(pred, ms)` | wait for a phase *and* its screen's root element (throws) / poll a predicate (returns a boolean) |
| `dump()` | the screen as text: phase, `#errbox`, headings, every visible button grouped by its nearest id (named by its `data-*` handle, `*` = `.on`, `(disabled)`), the on-clock seat on picks, the queue in battle (`>` = acting), `#actions .wait`, a shown `#banner`, the `#perfhud` readout |
| `shot(name)` | saves `NN-name.png` plus a 960px `NN-name.jpg`, returns the JPEG path |
| `state()` | the `BattleState` on screen: scout's deploy preview, the battle, the final state on result; null on map and picks |
| `engine((L, s, arg) => …, arg)` | runs in the page with the engine module `L` and `state()`; for reading only (`L.current`, `L.reachable`, `L.castTargets`, `L.ultIn`, `L.roundQueue`, `L.aiTurn`) |
| `tileXY({x,z})` / `hoverTile` / `clickTile` | a board tile's screen point once the camera settles; hover/click it like a player (throws if off screen or under a panel) |
| `games()` | the battles the dev server recorded during this run, parsed from `<evidence>/games.jsonl` |
| `expectError(re)` | errors matching `re` don't fail the run; the run fails if none comes. For proving an error path |
| `log(msg)` / `wait(ms)` | step line into the output and `result.json` / sleep |

Reading the screen: `dump()` first, always; it answers what is shown and what is pressable. Read a JPEG only to judge how something looks, and read each image once.

Act through the page (clicks, hotkeys, tiles). `window.__party` and `engine()` read; they never make something happen. `window.__party.board` reads the scene back: `units()` (`{id, x, z, visible, down, hp, shield}` per figure), `busy()` (animating), `tiles()`, `perf()`.

## Handles

From `src/client/screens/*.ts`; the feature files say what each does.

- **Map:** `#mapview` (`.mapdesc`, `.legend`), `#mp-name`, `#mp-timeline li`, `#hintbar`, `#tooltip`, `#mp-go`.
- **Picks, draft:** `#picks`, `#su-mapinfo`, `#pk-coin h2`, `#pk-track .pk-seat[data-step][data-team]` (`.wait` / `.now` / `.locked`, `.fresh` once landed; `.k` label, `.nm` name, `.cl` class, `.art` splash), `#pk-cta` (`.mine` / `.wait` / `.sealed` / `.final` + `.urgent`; `.ey`, `h2`, `.sub`), `#pk-lock`, `#pk-final`, `#pk-hero`, `#pk-sound`, `#pk-go`, `#su-timer`, team control `.pk-ctrl[data-team] button`, plates `#su-teams .pslot[data-team][data-slot]` (`.on`, `.locked`; `.c` class line), `.su-plates`, `.su-tab[data-team]` (after the draft).
- **Picks, loadout:** `#ed-name`, `#ed-ctrl button`, class cards `.ccards .ccard[data-cls]` (open hero; `.on`, `aria-pressed`) or `#ed-cls` (locked; also a `.ccard`), build strip `#ed-build .slot[data-skill]` (`.basic`, `.innate`, `.ult`, the picked ones carry none of these; `kbd` key), `#ed-emblem`, `#ed-open`; modal `#pk-build` (`.hidden` when closed), `#pk-build-t`, `#pk-build-done`, and inside it `#ed-skills .skc[data-skill]` (`.on`, `.innate`, `.ult`), `#ed-rec`, `.treewrap .node[data-node]` (`.on`, `.live`, `.locked`), `.tree .pts b`; `.su-bonus .bchip` (`.off`), `#su-random`.
- **Scout:** `#scout h2`, `#scout .tag`, `#sc-units .du[data-slot]` (`.on`), `#sc-timer` (`.low`), `#sc-auto`, `#sc-rule`, `#sc-ready`.
- **Battle:** `#banner` (`.show`), `#initbar .ichip` (`.now`, `.done`, `.extra`, `.close`; `.ub[data-ult]` / `.ub.ready`, `.cstar`), `#ib-hazard`, `#btn-cam`, `#btn-setup`, `#roster0`/`#roster1 .rcard[data-unit]` (`.ub`, `.sti`, `.souls`, `.doll`), `#selinfo`, `#actions .spbtn[data-skill]` (`.on` = aiming, `.ultimate`, `.ready`), `#actions .wait`, `#endturn`, `#log div`, `#hintbar`, `#tooltip` (`.tt` heading), `#combo`, overhead labels `#labels .bd-unit`.
- **Result:** `#res-tag`, `#res-title`, `#res-why`, `table.stats` (`td.win`), `#res-again`, `#res-party`, `#res-map`.
- **Off the flow:** `#errbox` (`.hidden` unless something threw), `#perfhud` (with `?perf`), gallery `canvas#c`, `#names div`.

## Evidence

The run's directory (printed as `evidence:`, default `$TMPDIR/verify-party-tactics/<stamp>-<steps>/`) holds the shots, `console.log` and `result.json` (pass, url, summary, step log, errors, expected errors). Every battle that ends during the run is appended to `games.jsonl` there (never to the player's `games/games.jsonl`); read it with `games()`.

A proof is done when all hold:

- `PASS … errors 0`.
- It went through the player's path, and asserts the consequence on the next screen or in `state()` (a renamed hero on the scout roster, a moved unit's `x,z`, a new `#log` line), not just the click.
- A `log` line records what the DOM or state showed after the action; a shot exists for each claim about looks.

## Cleanup

drive.cjs tears itself down. If one was interrupted, kill only the pid from its `drive:` line, or the holder `doctor.sh` names on your port once its command is `drive.cjs`. Delete your scratch steps files; leave the evidence.

## Examples

Each passes as written with the query in its header.

- `examples/picks-to-scout.cjs` (`"?map=storm&seed=7"`): edit a hero in the build modal, lock Blue's turns between Red's AI locks, see the order and edits on scout.
- `examples/lock-in.cjs` (`"?map=storm&seed=7"`): under a paused page clock, film a lock-in, see the sixth lock open the final clock, run it out to scout.
- `examples/scout-deploy.cjs` (`"?quick&map=span&seed=7"`): hover, place, auto-deploy, Ready, the unit stands there in battle.
- `examples/battle-turn.cjs` (`"?quick&map=span&seed=7"`): move, aim, preview, cancel, cast, end a Blue turn.
- `examples/ultimate.cjs` (`"?quick&map=span&seed=7"`): the battle intro, Blue's ultimate countdowns, Seren's Falling Star on round 4, then `⟲ Party` back to picks. About 5 minutes.
- `examples/spectate.cjs` (`"?ai&quick&map=span&seed=7"`): the record saved while round 1 plays, the AI's HUD texts, the result screen matching the record. 5 to 10 minutes; run it in the background.

For a whole Human-played battle, `node scripts/playtest.cjs` (env `MAP`, `SEED`, `PORT`, `SHOTS`) goes map → picks → scout → result → Rematch; with `ALL_AI=1` it opens `?ai&quick` and ends on New battlefield.
