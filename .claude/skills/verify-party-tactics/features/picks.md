# Picks

One screen drafts the parties. The starter, drawn before it (`#pk-coin`), opens and closes every round of the battle. Six steps follow the round's turn order (`#pk-track`); the team on the clock locks one hero into that turn in its current class. AI teams lock by themselves ~500 ms after their step comes up. Skills, passives, name and Human/AI stay editable for every hero throughout; only the class is fixed by the lock. When all six are locked, `Scout the battlefield →` goes to scout with each party in lock order.

## Sub-features

- `picks-clock` `#pk-track .pk-seat`: `.locked` seats name hero and class, the `.now` seat says whose pick it is; `#pk-cta` asks the question and holds `#pk-lock` when it is your pick.
- `picks-lock` `#pk-lock` (or `Enter` with no button focused) locks the selected open hero; its plate shows `🔒 <seat>`. The lock-in beat follows: `#pk-cta.sealed` reads `Locked in · <seat>`, the lineup camera pushes in with a class-glow burst, the seat flips in (`.pk-seat.fresh`) with its splash (`.pk-seat .art`) and the class's lock sound plays. After 1.6 s (`BEAT_SEC`) the selection moves to the next open hero and AI teams resume.
- `picks-select` selects a hero by plate, by clicking its figure on the lineup canvas, `ArrowLeft`/`ArrowRight` or `1`–`3`.
- `picks-class` an open hero's `.ccard[data-cls]` (a splash card, `.on` and `aria-pressed` for the current class; `ArrowUp`/`ArrowDown` cycle it) changes its class and resets its build to the recommended one; a locked hero shows `#ed-cls` instead.
- `picks-hero` `#pk-hero` on the lineup presents the selected hero's class: order and land, name, line, and role, range, HP and domain chips.
- `picks-sound` `#pk-sound` (or `M`) mutes the lock sounds; `aria-pressed` is `true` while sound is on, and the choice survives a reload in `localStorage`.
- `picks-skills` toggles `#ed-skills .skc`; a fourth pick drops the oldest, the innate is always on.
- `picks-tree` takes and refunds `.treewrap .node`; `.tree .pts b` shows points left. `#ed-rec` (Reset build) restores the recommended build.
- `picks-control` `#ed-name` renames; `#ed-ctrl` sets one hero Human/AI; `.pk-ctrl[data-team]` sets a whole team, until that team's first lock.
- `picks-bonus` `.su-bonus .bchip` lists every pair resonance and Role Coverage, unearned ones `.off`.
- `picks-random` `#su-random` rerolls the skills and passives of the shown team (not classes).
- `picks-tabs` once the draft is complete, `.su-tab[data-team]` switches the shown team.
- `picks-go` `#su-timer` picks the scout timer; `#pk-go`, enabled only when all six are locked, opens scout.

## How to get to it (user POV)

- `#mp-go` on the map screen.
- `⟲ Party` (`#btn-setup`) in battle.
- Change parties (`#res-party`) on the result screen; it draws a new starter.

## Driving it with drive.cjs

Preconditions:

- Query `"?map=storm&seed=7"`; `untilPhase('map')`, click `#mp-go`, `untilPhase('picks')`, wait ~800 ms. `dump()` shows `on clock: step 0, team 0`.

- **Edit.** Click `#su-teams .pslot[data-team="0"][data-slot="0"]`, then `#picks .ccard[data-cls="weaver"]`: the plate's `.c` reads `🕸️ Weaver · …` and 3 non-innate `.skc.on` remain. Click an `.skc` without `.on`: still 3, the new one among them. Click `.treewrap .node.on.live` then `.node.live:not(.on)`: `.pts b` goes 0 → 1 → 0. `page.fill('#ed-name', 'Vex')`.
- **Lock.** Three times: `until` `#pk-lock` is enabled, click it. Red's locks land in between.
- **Complete.** `until` `#pk-go` is enabled; every `#pk-track .pk-seat` is `.locked` and the seats read Blue, Red, Blue, Red, Red, Blue with seed 7 (`Vex` first).
- **Go.** `page.selectOption('#su-timer', '0')`, click `#pk-go`, `untilPhase('scout')`: `#sc-timer` reads `∞` and `#sc-units .du` lists Blue in lock order, `Vex 🕸️ Weaver · on floor` first.
- Done: `examples/picks-to-scout.cjs` passes and covers clock, lock, select, class, skills, tree, control (name) and go.

## Gotchas

- Set class first: a class change resets that hero's skills and tree.
- `#pk-lock` is absent while another team is on the clock and disabled when the selected hero is already locked; wait on it rather than clicking blind.
- Making a Red hero Human makes Red a Human team: it then locks by hand and deploys on scout too.
- `#su-random`, the Change parties starter and New battlefield use `Math.random`; assert shape (3 picks, `.pts b` is `0`), not values.
- `state()` is null on picks; read the DOM.
- A screenshot takes seconds under swiftshader, longer than the whole 1.6 s lock-in beat. To film it, `page.clock.install()` before the map screen, `page.clock.pauseAt(...)` before the lock, then `page.clock.runFor(ms)` between shots, and `page.clock.resume()` after.
- `page.emulateMedia({ reducedMotion: 'reduce' })` gives the reduced-motion beat (no push, spin or flip; a dimmer flare). `page.setViewportSize` checks the narrow layout.
