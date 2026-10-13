# Picks: the draft

One screen drafts the turn order. The starter, drawn before it (`#pk-coin`), opens and closes every round of the battle. Six seats follow the round's turn order (`#pk-track`: Opener, Turn 2 to 5, Closer); the team on the clock locks one hero into that turn in its current class. AI teams lock by themselves 500 ms after their seat comes up. Every lock flips its seat in with the class splash and plays the class's lock sound; a lock by the team you are viewing also plays that class's lock-in scene on the lineup. Once all six are locked, a 45 s final clock runs for last build edits, then scout opens with each party in lock order; `Scout the battlefield →` goes early. The loadout editing on the same screen is in [loadout.md](./loadout.md).

## Sub-features

- `picks-clock` `#pk-track .pk-seat`: `.locked` seats name hero (`.nm`) and class (`.cl`), the `.now` seat reads `Your pick` or `Picking…`, the rest are `.wait`. `#pk-cta` is `.mine` (your pick, holding `#pk-lock` "Lock in <name> · <Class>") or `.wait` (`Red party (AI) is picking…`).
- `picks-lock` `#pk-lock`, or `Enter` with no button focused, locks the selected open hero; its plate gains `.locked`. The seat lands `.locked.fresh` with its `.art` splash (`/splash/<class>.webp`).
- `picks-lockin` after your own lock, `#pk-cta.sealed` reads `Locked in · <seat>` (`.ey`), `<name>, the <Class>` (`h2`) and the class quote (`.sub`); the lineup plays the class's scene (Astromancer falling star, Gravecaller down and rise, Bellringer three tolls, Marionettist hauled on strings, Mirrormime shattering glass, `LOCK_IN` in `src/client/screens/lockin.ts`) while `.su-plates` fades to `0.1`. After the scene's `sec` (2 to 2.2 s) the selection moves to the next open hero and AI teams resume; selecting another hero ends it at once. The sixth lock skips `.sealed` and goes straight to the final clock while its scene plays.
- `picks-select` selects a hero by plate, by clicking its figure on the lineup, `ArrowLeft`/`ArrowRight` (wrapping) or `1`–`3`.
- `picks-hero` `#pk-hero` on the lineup presents the selected hero's class: order and land, name, line, and role, range, HP and domain chips.
- `picks-sound` `#pk-sound` (or `M`) mutes the lock sounds; `aria-pressed` is `true` while sound is on, and the choice survives a reload in `localStorage['party-tactics.muted']`. Sounds stay silent until the page's first click or key.
- `picks-final` the sixth lock turns `#pk-cta` into `.final` (`Final builds` / `Lock your skills and passives`), with `#pk-final` counting down from `0:45` and a draining bar; `.urgent` from `0:10`. At `0:00` the screen goes to scout with the current builds (an open modal goes with it).
- `picks-control` `#ed-ctrl` sets one hero Human/AI; `.pk-ctrl[data-team]` sets a whole team, disabled after that team's first lock. A team with no Human left locks by itself.
- `picks-tabs` once the draft is complete, `.su-tab[data-team]` switches the shown team; during the draft the view stays on a Human team.
- `picks-go` `#su-timer` picks the scout timer (20 s, 30 s, 45 s, No timer; default 30 s); `#pk-go`, enabled only when all six are locked, opens scout before the final clock ends.

## How to get to it (user POV)

- `#mp-go` on the map screen.
- `⟲ Party` (`#btn-setup`) in battle: same starter and map, every lock cleared, builds kept.
- Change parties (`#res-party`) on the result screen; it draws a new starter.

## Driving it with drive.cjs

Preconditions:

- Query `"?map=storm&seed=7"`; `untilPhase('map')`, click `#mp-go`, `untilPhase('picks')`, wait ~800 ms. `dump()` shows `on clock: step 0, team 0`; `#pk-coin h2` is `Blue party opens and closes every round`.

- **Lock.** Three times: `until` `#pk-lock` is enabled, click it. Red's locks land in between.
- **Complete.** `until` `#pk-go` is enabled; every seat is `.locked`, names in the order Blue, Red, Blue, Red, Red, Blue. With seed 7 and Blue's first hero made `Vex` the Bellringer (as in the examples) they read `Vex/Bellringer, Morvath/Marionettist, Seren/Astromancer, Ysolde/Astromancer, Grix/Gravecaller, Kip/Bellringer`.
- **Lock-in.** `page.clock.install()` in `.before`; before a lock `page.clock.pauseAt(await page.evaluate(() => Date.now() + 100))`, click `#pk-lock`, `page.clock.runFor(1200)`: `#pk-cta.sealed`, `.ey` `Locked in · Opener`, `h2` `<name>, the <Class>`, `.su-plates` opacity `0.1`. Shot. `runFor(1000)` more: the CTA is `.wait` and seat 1 picking or locked.
- **Final.** After the sixth lock `#pk-final` reads `0:45` under a paused clock (`0:44` running). `page.clock.fastForward(35000)`: `0:10` and `.urgent`. `fastForward(11000)`, `page.clock.resume()`, `untilPhase('scout')`.
- **Go.** `page.selectOption('#su-timer', '0')`, click `#pk-go`, `untilPhase('scout')`: `#sc-timer` reads `∞` and `#sc-units .du` lists Blue in lock order.
- Done: `examples/picks-to-scout.cjs` passes (clock, lock, control by name, go) and `examples/lock-in.cjs` passes (lock-in, sixth lock, final clock).

## Gotchas

- A screenshot takes seconds under swiftshader, longer than a whole lock-in. Film it under a paused page clock, stepping with `runFor`, and `resume()` after. Jump the final clock with `fastForward`, not `runFor`: `runFor` renders every frame it skips.
- `.fresh` stays on every landed seat; don't wait for it to clear.
- `#pk-lock` is absent while another team is on the clock and disabled when the selected hero is already locked; wait on it rather than clicking blind.
- `Enter` right after closing the build modal re-opens it: closing focuses `#ed-open`. Click a non-button (`#picks h1`) first, or use `#pk-lock`.
- Making a Red hero Human makes Red a Human team: it then locks by hand and deploys on scout too.
- `state()` is null on picks; read the DOM.
- `page.emulateMedia({ reducedMotion: 'reduce' })` (in `.before`) gives the reduced-motion lock-in: no camera move, body motion, clip, shake or effects, and the plates don't fade. `page.setViewportSize` checks the narrow layout.
- Known product bug (2026-10-13): an AI lock doesn't update that hero's class on the sheet. After the draft, Red's tab plates read the default classes (`🔔 Bellringer` for Morvath, who locked Marionettist); scout and battle use the locked class. Don't take Red's plates as the truth.
