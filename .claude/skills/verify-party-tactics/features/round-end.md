# Round end and map rules

The map's rule plays out at the end of rounds, and the battle says so ahead of time. Each round opens on a `Round N` banner naming who opens and closes it, with a line for what this round's end will do. Violet stripes mark the tiles this round's end hits, and the initiative bar ends on a chip naming it. From round 8 the torches gutter: a banner announces that everyone loses HP at the start of their turn and healing is halved, and a 🕯 chip stays in the bar. On the Sun Altar, favor is counted at each round end and 5 wins.

## Sub-features

- `round-banner` `#banner` `Round N` / `<Team> party opens and closes the round`, plus the hazard line on rounds whose end does something (Shattered Span: `⬇ The side bridges crumble: 12 tiles fall at round end` on round 3, the back rows on 5 and 7, `The plateaus crumble: 24 tiles` on 9).
- `round-hazard-chip` `#ib-hazard` (`.rd.hz`) at the end of `#initbar` on each round whose end does something (Shattered Span round 3: `⬇ 12 tiles fall`); hovering it reads `At the end of this round` and the rule. The bar's first `.rd` reads `Round N <Team> party starts`.
- `round-stripes` violet stripes on the tiles the round end hits (the map's and any Undermined ones).
- `round-dark` from round 8 (`DARK_ROUND`) a `The torches gutter` banner (`From now on everyone loses HP at the start of their turn, and healing is halved.`) before `Round 8`, and `.rd.dark` `🕯 dark` in the bar.
- `round-storm` on Storm Court every round's end strikes a line: the banner adds `⚡ Lightning at round end: the edges` (round 1) and `#ib-hazard` reads `⚡ The edges`.
- `round-altar` on the Sun Altar the banner adds `☀ Favor 0–0, first to 5 wins` and `#ib-hazard` reads `☀ Blue 0 · Red 0 of 5` every round; the result screen adds an `Altar favor` row.

## How to get to it (user POV)

- Play rounds of a battle; Shattered Span shows its first round-end hazard in round 3, every map reaches the dark rounds at 8.

## Driving it with drive.cjs

Preconditions:

- Query `"?ai&quick&map=span&seed=7"` in the background (the AI reaches round 9 in 5 to 10 minutes), or `"?quick&map=span&seed=7"` passing Blue turns with `Space` for rounds 1 to 4.

- **Sample.** Every 250 ms while `phase()` is `battle`, collect `#banner.show` text, `#ib-hazard` text and the `#initbar .rd` chips.
- **Assert.** Banners include `Round 3 Blue party opens and closes the round ⬇ The side bridges crumble: 12 tiles fall at round end` and `The torches gutter …`; `#ib-hazard` takes `⬇ 12 tiles fall`, `⬇ 20 tiles fall`, `⬇ 24 tiles fall` and is absent on rounds 1, 2, 4, 6, 8; `🕯 dark` appears from round 8. Shot the dark banner.
- **Stripes and other maps.** Query `"?quick&map=storm&seed=7"`, Ready, on the first Blue turn: `#ib-hazard` is `⚡ The edges` and the shot shows violet stripes on the four edge columns. On `map=altar` the chip reads `☀ Blue 0 · Red 0 of 5`.
- Done when the banners and chips above are logged; `examples/ultimate.cjs` passes through the round-3 chip on the way.

## Gotchas

- A banner shows for about a second; sample often, or you miss one.
- `#ib-hazard` is on every round on Storm Court and the Sun Altar, only on 3, 5, 7 and 9 on Shattered Span.
