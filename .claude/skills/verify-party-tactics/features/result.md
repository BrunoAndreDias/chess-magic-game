# Result and rematch

When a battle ends (a party wiped, both fell, round 20 passed, or the Sun Altar's favor reached), the result screen names the map, the winner or a draw, the reason and the round, with a per-party stats table. It offers a Rematch, a return to the picks, or a new battlefield.

## Sub-features

- `result-show` `#res-tag` (`<Map name> · battle over`), `#res-title` (`Blue party wins`, `Red party wins` or `Draw`), `#res-why` (reason, then `After N rounds.`).
- `result-stats` `table.stats`: a header row plus Damage dealt, Healing, Enemies downed, Revives, Combos; `.win` on the leading cell.
- `result-rematch` `#res-again`: same map, parties, turn order and starter, back to scout (straight to battle with no Human party).
- `result-party` `#res-party`: picks with the same heroes, a newly drawn starter and a fresh draft.
- `result-map` `#res-map`: the map screen on a different map, same heroes.

## How to get to it (user POV)

- Play a battle to the end.

## Driving it with drive.cjs

Preconditions:

- Query `"?ai&quick&map=altar&seed=7"`, `untilPhase('result', 15 * 60000)` (about 2 minutes; run the Bash call in the background). For a Human-played end, `node scripts/playtest.cjs`.

- **Read.** Wait ~300 ms, `dump()`, shot. `state().phase` is `{kind: 'over', winner, reason}` and `#res-title` / `#res-why` match it (seed 7: `Blue party wins`, wipe, after 8 rounds). `table.stats tr` counts 6.
- **Rematch.** Click `#res-again`: with `?ai`, `phase()` is `battle` and `state().map` is unchanged.
- **Change parties.** From a fresh result, click `#res-party`, `untilPhase('picks')`; with `?ai` the AI locks all six and `#pk-go` enables within ~5 s.
- **New battlefield.** From a fresh result, click `#res-map`, `untilPhase('map')`: `#mp-name` differs from the map just played.
- Done when each button you claim has a logged screen after it.

## Gotchas

- Each button leaves the screen, so three buttons need three results; with `?ai`, chain them (Rematch → result → Change parties → `#pk-go` → result → New battlefield).
- With `?ai` and a fixed seed, Rematch replays the same battle; assert the screen changed, not the outcome.
- `#res-why` caps the round count at 20 when `state().round` is 21.
- The result mounts ~1200 ms after the final event; wait on `untilPhase('result')`.
