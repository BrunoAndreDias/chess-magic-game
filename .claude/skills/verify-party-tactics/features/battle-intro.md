# Battle intro

A battle opens on the `To battle!` banner with the map's name while the characters arrive one by one in the first round's turn order, 0.35 s apart, each with its class's entrance: the Astromancer falls as a star, the Gravecaller rises, the Bellringer lands on three tolls (with the bell sound), the Marionettist is lowered on strings with its Doll after it, the Mirrormime steps out of a shattering pane. Overhead labels appear once each lands. Only when the banner and every entrance are done does round 1 start, on a `Round 1` banner naming who opens and closes the round. Reduced motion skips the entrances: everyone is standing at once.

## Sub-features

- `intro-banner` `#banner.show` reads `To battle!` and the map name; `#actions .wait` reads `To battle…`; `state().phase.kind` is `ready`.
- `intro-entrances` every figure starts hidden (`window.__party.board.units()[i].visible` false) and appears in `L.roundQueue` order; `board.busy()` is true meanwhile.
- `intro-sound` each Bellringer's entrance plays its bell (6 oscillator notes), once the page has had a click.
- `intro-round` round 1 starts: `#banner` reads `Round 1` / `Blue party opens and closes the round` (seed 7), and the first unit acts.
- `intro-reduced` with `prefers-reduced-motion`, no figure is ever hidden and the intro lasts only the banner.

## How to get to it (user POV)

- Ready on scout, or a scout with no Human party (Rematch, `?ai`).

## Driving it with drive.cjs

Preconditions:

- Query `"?quick&map=span&seed=7"`; `untilPhase('scout')`, wait ~1200 ms, click `#sc-ready`, `untilPhase('battle')`.

- **Banner.** At once: `state().phase.kind` is `ready`, 6 units, all `visible: false`, `#banner` `.show` with `To battle!Shattered Span`, `#actions .wait` `To battle…`. Shot.
- **Arrivals.** `until` `state().phase.kind !== 'ready'` (give it 30 s): every `board.units()` is visible and `#banner` reads `Round 1…`.
- **Sound.** In `.before`, `page.addInitScript` wrapping `AudioContext.prototype.createOscillator` with a counter: after the intro it counts 12 (Kip and Morvath, 6 notes each).
- **Reduced.** In `.before`, `page.emulateMedia({ reducedMotion: 'reduce' })`: sampling `units().every(u => u.visible)` through the intro only ever gives true.
- Done: `examples/ultimate.cjs` passes; it asserts the banner, hidden figures and the end of the intro.

## Gotchas

- Under swiftshader the intro takes 2 to 8 s; wait on `phase.kind`, not a fixed time.
- `phase()` is already `battle` during the intro; `#endturn` is disabled and nothing acts until it ends.
- A failed entrance reports `board.enter failed: …` to `#errbox` (a FAIL) and the battle carries on.
