# Game records

In `npm run dev`, every battle that ends is saved as one JSON line in `games/games.jsonl`: the setup (map, starter, both parties' builds), the seed, who sat in each seat, every committed command and the result, stamped with an id, the time and the commit. The client posts it to the dev server's `/api/games` when the Match reaches its end, which for an AI turn comes before the screen has played it back; a failed save only warns in the console. `npm run games` reports win rates, end reasons, class win share and the player's record over the file.

## Sub-features

- `records-save` a finished battle appends one line: `v: 1`, `seed`, `setup.map`, `seats` (`{kind: 'ai'}` or Human per seat), `commands`, `result` (`winner`, `reason`, `rounds`, `favor`, `combos`, `stats`), `id`, `at`, `commit` (`+dirty` with uncommitted changes).
- `records-early` an all-AI Match finishes within seconds of round 1 starting, so its line exists while the battle is still on screen; leaving with `⟲ Party` after that keeps it. A Human seat stops the Match on its turn, so an abandoned Human battle saves nothing.
- `records-report` `npm run games -- <file>` prints `N game(s)`, a line per map (`<Map>: N game, Blue x / Red y / draw z, <reason> n, avg R rounds`), `Player vs AI games:`, the class table and `Games per commit:`.

## How to get to it (user POV)

- Finish a battle in `npm run dev`, then `npm run games`.

## Driving it with drive.cjs

Preconditions:

- drive.cjs points the dev server at `<evidence>/games.jsonl` (never the player's file); read it with `games()`. Query `"?ai&quick&map=span&seed=7"`.

- **Save.** `untilPhase('battle', 60000)`, `until(() => games().length === 1, 60000)`: the line arrives while `phase()` is `battle` and `state().round` is 1. Assert `v`, `seed` 7, `setup.map` `span`, six AI seats, `commands.length > 0`.
- **Agree.** At the result screen, `state().phase.winner` / `reason` equal the record's `result`, and `#res-why` says `After <result.rounds> rounds.`
- **Report.** After the drive, `npm run games -- <evidence>/games.jsonl`: `1 game`, `Shattered Span: 1 game, Blue 1 / Red 0 / draw 0, wipe 1, avg 9.0 rounds` (seed 7 on 642dd5c).
- Done: `examples/spectate.cjs` passes; it covers save and agree.

## Gotchas

- A failed POST is only a `console.warn`, which doesn't fail a drive: the file is the proof.
- `npm run games` on a missing file prints `no records at <file>; finish a battle in \`npm run dev\` first` and exits 1.
- `vite build` and `vite preview` don't save records (the plugin is serve-only, and the client posts only in dev).
