# Scout and deploy

Each party with a Human in it places its three characters on its gold deploy tiles and presses Ready, against a countdown. Blue deploys first; Red second, seeing Blue. AI parties deploy themselves; with no Human party the screen passes straight to battle.

## Sub-features

- `scout-select` selects one of your characters in `#sc-units`.
- `scout-place` places it on a clicked gold tile; selection advances to the next, wrapping after the third.
- `scout-auto` `#sc-auto` deploys the whole party.
- `scout-hover` terrain or unit text in `#tooltip`, plus `Deploy zone.` on your gold rows.
- `scout-rule` `#scout .tag` names the map, `#sc-rule` states its rule, its tiles highlighted.
- `scout-timer` `#sc-timer` counts `m:ss` and readies at 0, or shows `∞` with no timer.
- `scout-ready` `#sc-ready` passes to the next Human party, then to battle.

## How to get to it (user POV)

- `#pk-go` on picks.
- `?quick`, skipping map and picks.
- Rematch (`#res-again`) on the result screen.

## Driving it with drive.cjs

Preconditions:

- Query `"?quick&map=span&seed=7"`; `untilPhase('scout')`, wait ~1200 ms.

- **Pick a tile.** `engine` lists tiles where `L.canDeploy(s, 0, x, z) && !L.unitAt(s, x, z)`; take one near x = 5.
- **Hover.** `hoverTile(tile)`; `#tooltip` contains `Deploy zone`.
- **Place.** Click `#sc-units .du[data-slot="0"]`, `clickTile(tile)`: slot 0 loses `.on`, slot 1 gains it, `state()` has Blue slot 0 on the tile.
- **Auto.** Click `#sc-auto`: Blue's three units stand on distinct tiles.
- **Ready.** Place slot 0 on a free tile again, click `#sc-ready`, `untilPhase('battle')`: Blue slot 0 is on that tile and Red's units on rows `z >= 9`.
- Done: `examples/scout-deploy.cjs` passes and covers hover, select, place, auto and ready.

## Gotchas

- The 30 s default timer readies at 0. For a slow proof go through picks and set `#su-timer` to `0`; `?quick` keeps 30 s.
- Clicking your own placed unit selects it instead of placing. Auto-deploy may take the tile you picked, so pick a free tile after it.
- `state()` during Blue's deploy holds only Blue's units.
- Auto-deploy seeds from the clock: its tiles differ between runs.
