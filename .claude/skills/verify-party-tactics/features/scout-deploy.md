# Scout and deploy

Each party with a Human in it places its three characters on its gold deploy rows and presses Ready, against a countdown. The characters start on the AI's suggested tiles, so a player only moves them. Blue deploys first, seeing only its own party; Red second, seeing Blue. AI parties deploy themselves on tiles fixed when scout opens (from the seed), never reacting to Blue; with no Human party the screen passes straight to battle. There are no hotkeys on scout.

## Sub-features

- `scout-select` selects one of your characters in `#sc-units` (`.on`), or by clicking the tile it stands on.
- `scout-place` places it on a clicked deployable tile; selection advances to the next, wrapping after the third. Other tiles and right-clicks do nothing.
- `scout-auto` `#sc-auto` redeploys the whole party (keeping the selection).
- `scout-hover` terrain or unit text in `#tooltip`, plus `Deploy zone.` on your rows.
- `scout-rule` `#scout .tag` (`<Map> · scout & deploy`) names the map, `#sc-rule` states its rule, its tiles highlighted.
- `scout-timer` `#sc-timer` counts `m:ss` (`.low` under 8 s) and readies at 0, or shows `∞` with no timer; each Human party gets a fresh countdown.
- `scout-ready` `#sc-ready` passes to the next Human party, then to battle (see [battle-intro.md](./battle-intro.md)).

## How to get to it (user POV)

- `#pk-go` on picks, or the final clock running out.
- `?quick`, skipping map and picks.
- Rematch (`#res-again`) on the result screen: the same parties, back on the suggested tiles.

## Driving it with drive.cjs

Preconditions:

- Query `"?quick&map=span&seed=7"`; `untilPhase('scout')`, wait ~1200 ms. `#scout h2` is `Blue party: read the map, place your party`; `#sc-units .du b` reads `Aldric, Seren, Kip`, slot 0 `.on`; `state().units` holds Blue's three on `z < 3`.

- **Pick a tile.** `engine` lists tiles where `L.canDeploy(s, 0, x, z) && !L.unitAt(s, x, z)`; take one near x = 5.
- **Hover.** `hoverTile(tile)`; `#tooltip` contains `Deploy zone`.
- **Place.** Click `#sc-units .du[data-slot="0"]`, `clickTile(tile)`: slot 0 loses `.on`, slot 1 gains it, `state()` has Blue slot 0 on the tile.
- **Auto.** Click `#sc-auto`: Blue's three units stand on distinct tiles.
- **Ready.** Place slot 0 on a free tile again, click `#sc-ready`, `untilPhase('battle')`: Blue slot 0 is on that tile and Red's units on rows `z >= 9`.
- Done: `examples/scout-deploy.cjs` passes and covers hover, select, place, auto and ready.

## Gotchas

- The 30 s default timer readies at 0. For a slow proof go through picks and set `#su-timer` to `0`; `?quick` keeps 30 s.
- Clicking your own placed unit selects it instead of placing. Auto-deploy may take the tile you picked, so pick a free tile after it.
- `state()` during Blue's deploy holds only Blue's units; during Red's, both. Dolls never show on scout.
- `Deploy zone.` shows on every tile of your rows, walls included; only `canDeploy` tiles take a unit.
- Auto-deploy seeds from the clock: its tiles differ between runs.
- Right after Ready the battle is still in its intro: `state().phase.kind` is `ready` for 2 to 8 s.
