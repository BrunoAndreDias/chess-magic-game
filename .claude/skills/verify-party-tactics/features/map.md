# Map reveal

Without `quick`, the game opens on the drawn battlefield. The side panel names the map, gives its tagline and rule, lists when and where the rule fires, says which play it favors and keys the terrains present; the board highlights the rule's tiles (Storm Court: the first strike line; Shattered Span: every tile that will fall, brighter the sooner; Sun Altar: the altar in gold). Hovering a tile reads its terrain and hazard. Clicking tiles does nothing and there are no hotkeys. `Form your parties →` opens the picks.

## Sub-features

- `map-show` `#mapview` with `#mp-name`, the tagline, the rule, `#mp-timeline li` steps, `.mapdesc` (`Plays well for: …`) and the legend; `#hintbar` explains the highlight.
- `map-hover` terrain and hazard text in `#tooltip` while hovering a tile.
- `map-go` `#mp-go` opens picks, whose `#su-mapinfo` names the same map and the rule's first sentence.

## How to get to it (user POV)

- Open the game with no `quick`.
- Press New battlefield (`#res-map`) on the result screen: a different map than the one just played.

## Driving it with drive.cjs

Preconditions:

- Query `"?map=storm&seed=7"`; `untilPhase('map')`, wait ~1200 ms.

- **Read.** `#mp-name` is `Storm Court`; `#mp-timeline li` counts 4, the first `Rounds 1, 5, 9…The edges: columns 1, 2, 11, 12`; `#hintbar` is `Violet stripes: the first lightning strike, at the end of round 1. Hover a tile to read it.`
- **Hover.** `hoverTile({x:5,z:5})`; `#tooltip` reads `Water · Costs 2 move. …` and `⚡ Struck at the end of round 2: 24, 36 if Wet.` Shot.
- **Go.** Click `#mp-go`, `untilPhase('picks')`; `#su-mapinfo` contains `Storm Court`.
- Done when the hover shot exists and both names are logged. `examples/picks-to-scout.cjs` covers `map-go`.

## Gotchas

- UI names differ from ids: `span` Shattered Span, `storm` Storm Court, `altar` Sun Altar.
- Timeline lengths: Storm Court 4, Shattered Span 4 (ends of rounds 3, 5, 7, 9), Sun Altar 2.
- `state()` is null here; pick tiles by known coordinates and assert on the DOM.
