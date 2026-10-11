# Picks

One screen drafts the parties. The starter, drawn before it (`#pk-coin`), opens and closes every round of the battle. Six steps follow the round's turn order (`#pk-track`); the team on the clock locks one hero into that turn in its current class. AI teams lock by themselves ~500 ms after their step comes up. Skills, passives, name and Human/AI stay editable for every hero throughout; only the class is fixed by the lock. The sheet shows the build as a strip; the full editor opens in a modal. When all six are locked, a 45 s final clock (`FINAL_SEC`) runs for last build edits, then scout opens with each party in lock order; `Scout the battlefield →` goes early.

## Sub-features

- `picks-clock` `#pk-track .pk-seat`: `.locked` seats name hero and class, the `.now` seat says whose pick it is; `#pk-cta` asks the question and holds `#pk-lock` when it is your pick.
- `picks-lock` `#pk-lock` (or `Enter` with no button focused) locks the selected open hero; its plate shows `🔒 <seat>`. The lock-in beat follows: `#pk-cta.sealed` reads `Locked in · <seat>`, the lineup camera pushes in with a class-glow burst, the seat flips in (`.pk-seat.fresh`) with its splash (`.pk-seat .art`) and the class's lock sound plays. After 1.6 s (`BEAT_SEC`) the selection moves to the next open hero and AI teams resume.
- `picks-select` selects a hero by plate, by clicking its figure on the lineup canvas, `ArrowLeft`/`ArrowRight` or `1`–`3`.
- `picks-class` an open hero's `.ccard[data-cls]` (a splash card, `.on` and `aria-pressed` for the current class; `ArrowUp`/`ArrowDown` cycle it) changes its class and resets its build to the recommended one; a locked hero shows `#ed-cls` instead.
- `picks-hero` `#pk-hero` on the lineup presents the selected hero's class: order and land, name, line, and role, range, HP and domain chips.
- `picks-sound` `#pk-sound` (or `M`) mutes the lock sounds; `aria-pressed` is `true` while sound is on, and the choice survives a reload in `localStorage`.
- `picks-build` `#ed-build` on the sheet: the innate `.slot.innate` and the 3 picked skills `.slot[data-skill]` in pick order, each with its battle key (`kbd` 2 to 5), then `#ed-emblem`, the keystone path's emblem (keystone name, else the path with most points; role; one pip per point). A slot, the emblem or `#ed-open` opens `#pk-build` (role `dialog`, title `#pk-build-t` "<name> · <class>"); `#pk-build-done`, `Escape` or a backdrop click closes it. While it is open, picks hotkeys other than `Escape` do nothing (`Enter` does not lock), and edits re-render it in place.
- `picks-skills` (in the modal) toggles `#ed-skills .skc`; a fourth pick drops the oldest, the innate is always on.
- `picks-tree` (in the modal) takes and refunds `.treewrap .node`; `.tree .pts b` shows points left. `#ed-rec` (Reset build) restores the recommended build.
- `picks-final` the sixth lock turns `#pk-cta` into `.final` ("Final builds"), with `#pk-final` counting down from `0:45` and a draining bar; the last 10 s add `.urgent`. At `0:00` the screen goes to scout with the current builds (an open modal goes with it).
- `picks-control` `#ed-name` renames; `#ed-ctrl` sets one hero Human/AI; `.pk-ctrl[data-team]` sets a whole team, until that team's first lock.
- `picks-bonus` `.su-bonus .bchip` lists every pair resonance and Role Coverage, unearned ones `.off`.
- `picks-random` `#su-random` rerolls the skills and passives of the shown team (not classes).
- `picks-tabs` once the draft is complete, `.su-tab[data-team]` switches the shown team.
- `picks-go` `#su-timer` picks the scout timer; `#pk-go`, enabled only when all six are locked, opens scout before the final clock ends.

## How to get to it (user POV)

- `#mp-go` on the map screen.
- `⟲ Party` (`#btn-setup`) in battle.
- Change parties (`#res-party`) on the result screen; it draws a new starter.

## Driving it with drive.cjs

Preconditions:

- Query `"?map=storm&seed=7"`; `untilPhase('map')`, click `#mp-go`, `untilPhase('picks')`, wait ~800 ms. `dump()` shows `on clock: step 0, team 0`.

- **Edit.** Click `#su-teams .pslot[data-team="0"][data-slot="0"]`, then `#picks .ccard[data-cls="bellringer"]`: the plate's `.c` reads `🔔 Bellringer · …`. Click `#ed-open`: 3 non-innate `.skc.on`. Click an `.skc` without `.on`: still 3, the new one among them. Click `.treewrap .node.on.live` then `.node.live:not(.on)`: `.pts b` goes 0 → 1 → 0. Click `#pk-build-done`: `#ed-build .slot:not(.innate)` lists the new picks in order. `page.fill('#ed-name', 'Vex')`.
- **Lock.** Three times: `until` `#pk-lock` is enabled, click it. Red's locks land in between.
- **Complete.** `until` `#pk-go` is enabled; every `#pk-track .pk-seat` is `.locked` and the seats read Blue, Red, Blue, Red, Red, Blue with seed 7 (`Vex` first).
- **Final.** `#pk-final` reads `0:45` or `0:44`. To run it out, `page.clock.install()` before the map screen; once `#pk-go` is enabled, `page.clock.pauseAt(await page.evaluate(() => Date.now() + 100))`, then `page.clock.fastForward(46000)`, `untilPhase('scout')` and `page.clock.resume()`.
- **Go.** `page.selectOption('#su-timer', '0')`, click `#pk-go`, `untilPhase('scout')`: `#sc-timer` reads `∞` and `#sc-units .du` lists Blue in lock order, `Vex 🔔 Bellringer · on floor` first.
- Done: `examples/picks-to-scout.cjs` passes and covers clock, lock, select, class, build, skills, tree, control (name) and go.

## Gotchas

- Set class first: a class change resets that hero's skills and tree.
- `#ed-skills .skc`, `.treewrap .node`, `.tree .pts b` and `#ed-rec` exist only while the modal is open: click `#ed-open` first. The class cards sit behind the backdrop then, so close it before changing class.
- The final clock runs in real time during slow swiftshader shots, so pause the page clock before reading it. Jump with `fastForward`, not `runFor`: `runFor` renders every frame it skips, and a 36 s jump takes minutes while real time runs the clock out.
- `#pk-lock` is absent while another team is on the clock and disabled when the selected hero is already locked; wait on it rather than clicking blind.
- Making a Red hero Human makes Red a Human team: it then locks by hand and deploys on scout too.
- `#su-random`, the Change parties starter and New battlefield use `Math.random`; assert shape (3 picks, `.pts b` is `0`), not values.
- `state()` is null on picks; read the DOM.
- A screenshot takes seconds under swiftshader, longer than the whole 1.6 s lock-in beat. To film it, `page.clock.install()` before the map screen, `page.clock.pauseAt(...)` before the lock, then `page.clock.runFor(ms)` between shots, and `page.clock.resume()` after.
- `page.emulateMedia({ reducedMotion: 'reduce' })` gives the reduced-motion beat (no push, spin or flip; a dimmer flare). `page.setViewportSize` checks the narrow layout.
