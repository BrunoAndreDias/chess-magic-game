# Map reveal

Without `quick`, the game opens on the drawn battlefield. The side panel names the map, states its rule, lists when and where it fires, and says which play it favors; the board highlights the rule's tiles. Hovering a tile reads its terrain and hazard. `Form your parties →` opens the picks.

## Sub-features

- `map-show` `#mapview` with `#mp-name`, the rule, `#mp-timeline li` steps, `Plays well for:` and the legend.
- `map-hover` terrain and hazard text in `#tooltip` while hovering a tile.
- `map-go` `#mp-go` opens picks, whose `#su-mapinfo` names the same map.

## How to get to it (user POV)

- Open the game with no `quick`.
- Press New battlefield (`#res-map`) on the result screen: a different map than the one just played.

## Driving it with drive.cjs

Preconditions:

- Query `"?map=storm&seed=7"`; `untilPhase('map')`, wait ~1200 ms.

- **Read.** `#mp-name` is `Storm Court`; `#mp-timeline li` counts 4.
- **Hover.** `hoverTile({x:5,z:5})`; `#tooltip` text names the terrain (`Water` on Storm Court) and the strike round. Shot.
- **Go.** Click `#mp-go`, `untilPhase('picks')`; `#su-mapinfo` contains the map name.
- Done when the hover shot exists and both names are logged.

## Gotchas

- UI names differ from ids: `span` Shattered Span, `storm` Storm Court, `altar` Sun Altar.
- `state()` is null here; pick tiles by known coordinates and assert on the DOM.
