# AI spectate

With `?ai` all six characters are AI: the draft locks itself, deployment is automatic, and the player watches both parties fight with the HUD and log running, through to the result. The Match plays the AI's turns ahead of the screen, which replays them one by one.

## Sub-features

- `spectate-run` an all-AI battle reaches the result screen with no errors.
- `spectate-hud` `#actions .wait` reads `To battle…` during the intro, then `Blue party (AI) is acting…` / `Red party (AI) is acting…`, and `The battle is over.` at the end; `#hintbar` reads `<Name> (<Team> party, AI) is acting…`; `#endturn` stays disabled throughout.
- `spectate-picks` without `quick`, the picks lock all six by themselves (each with its lock-in, about 17 s in all), `#pk-go` enables, and 45 s later the final clock moves on to scout and battle by itself.

## How to get to it (user POV)

- Open `/?ai&quick`.
- Open `/?ai`, press `#mp-go`, wait for the draft, press `#pk-go`.
- Set both teams to AI on picks (`.pk-ctrl[data-team]`) before either locks.

## Driving it with drive.cjs

Preconditions:

- Query `"?ai&quick&map=span&seed=7"` in a background Bash call, or `ALL_AI=1 MAP=span SEED=7 node scripts/playtest.cjs` for a run with no HUD checks.

- **Start.** `untilPhase('battle', 60000)`; scout passes by itself.
- **Watch.** Every ~500 ms until `phase()` is `result`: `#endturn` is disabled; collect `#actions .wait` texts. Shot the first sample matching `/\(AI\) is acting/`.
- **Finish.** Shot the result, log `#res-title` and `state().round`.
- Done: `examples/spectate.cjs` passes: both `(AI) is acting` texts were seen, nothing outside the four texts above, and the winner is logged.
- **Picks.** Query `"?ai&map=altar&seed=7"`, click `#mp-go`, `untilPhase('picks')`, `until` `#pk-go` is enabled (25 s): six `#pk-track .pk-seat.locked`, no click needed.

## Gotchas

- The best smoke test for event playback and animation errors: the AI uses most skills, and any page error fails the run.
- 5 to 10 minutes per battle under swiftshader (span and altar, seed 7, 9 rounds); give `untilPhase('result')` 15 minutes.
- The battle is decided seconds after round 1 starts (see [game-records.md](./game-records.md)); what you watch is playback.
