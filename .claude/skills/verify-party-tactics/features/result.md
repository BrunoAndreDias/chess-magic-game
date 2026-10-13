# Result and rematch

When a battle ends (a party wiped, both fell, round 20 passed, or the Sun Altar's favor reached), the result screen names the map, the winner (in the team's colour) or a draw, the reason and the round, with a per-party stats table. It offers a Rematch, a return to the picks, or a new battlefield.

## Sub-features

- `result-show` `#res-tag` (`<Map name> · battle over`), `#res-title` (`Blue party wins`, `Red party wins` or `Draw`), `#res-why` (the reason, then `After N rounds.`, N capped at 20).
- `result-stats` `table.stats`: a header row, `Altar favor` on the Sun Altar only, then Damage dealt, Healing, Enemies downed, Revives, Combos; `td.win` on the strictly larger value of a row, none on a tie.
- `result-rematch` `#res-again`: same map, parties, turn order and starter, back to scout on the suggested tiles (straight to battle with no Human party). With the same seed and no Human, the same battle again.
- `result-party` `#res-party`: picks with the same heroes, a newly drawn starter and a fresh draft.
- `result-map` `#res-map`: the map screen on a different map, same heroes, a new starter.

## How to get to it (user POV)

- Play a battle to the end.

## Driving it with drive.cjs

Preconditions:

- Query `"?ai&quick&map=altar&seed=7"`, `untilPhase('result', 15 * 60000)` in a background Bash call. For a Human-played end, `node scripts/playtest.cjs`.

- **Read.** Wait ~300 ms, `dump()`, shot. `state().phase` is `{kind: 'over', winner, reason}`; `#res-title` and `#res-why` match it, with N = `min(state().round, 20)`. On the Sun Altar `table.stats tr` counts 7 and the `Altar favor` cells equal `state().favor`. Seed 7 on 642dd5c: `Blue party wins`, `The other party has nobody left standing. After 9 rounds.`
- **Rematch.** Click `#res-again`: `phase()` is `battle`, `state().map` unchanged; the next result repeats `#res-title` and `#res-why`.
- **Change parties.** From a fresh result, click `#res-party`, `untilPhase('picks')`; with `?ai` the AI locks all six and `#pk-go` enables after about 17 s (six lock-ins).
- **New battlefield.** From a fresh result, click `#res-map`, `untilPhase('map')`: `#mp-name` differs from the map just played.
- Done when each button you claim has a logged screen after it; `examples/spectate.cjs` passes for `result-show` and `result-stats`.

## Gotchas

- Each button leaves the screen, so three buttons need three results; with `?ai`, chain them (Rematch → result → Change parties → `#pk-go` → result → New battlefield). That is three battles: 20 to 30 minutes under swiftshader.
- The seed's outcome moves whenever kits or the AI change; pin it to the screen agreeing with `state()` and `games()`, not to a remembered winner.
- `#res-why` caps the round count at 20 when `state().round` is 21.
- The result mounts ~1200 ms after the final event; wait on `untilPhase('result')`.
