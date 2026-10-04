# AI spectate

With `?ai` all six characters are AI: the draft locks itself, deployment is automatic, and the player watches both parties fight with the HUD and log running, through to the result.

## Sub-features

- `spectate-run` an all-AI battle reaches the result screen with no errors.
- `spectate-hud` `#actions .wait` reads `Blue party (AI) is acting…` / `Red party (AI) is acting…` (`To battle…` between turns) and `#endturn` stays disabled throughout.
- `spectate-picks` without `quick`, the picks lock all six by themselves and `#pk-go` enables.

## How to get to it (user POV)

- Open `/?ai&quick`.
- Open `/?ai`, press `#mp-go`, wait for the draft, press `#pk-go`.
- Set both teams to AI on picks (`.pk-ctrl[data-team]`) before either locks.

## Driving it with drive.cjs

Preconditions:

- Query `"?ai&quick&map=altar&seed=7"`, or `ALL_AI=1 MAP=altar SEED=7 node scripts/playtest.cjs`.

- **Start.** `untilPhase('battle')`; scout passes by itself.
- **Watch.** Every ~500 ms until `phase()` is `result`: `#endturn` is disabled; collect `#actions .wait` texts. Shot the first sample matching `/\(AI\) is acting/`.
- **Finish.** Shot the result, log `#res-title` and `state().round`.
- Done when PASS with `errors 0`, both `(AI) is acting` texts were seen, and the winner is logged.

## Gotchas

- The best smoke test for event playback and animation errors: the AI uses most skills, and any page error fails the run.
- About 2 minutes per battle (altar, seed 7, 8 rounds). Run the Bash call in the background and give `untilPhase('result')` 15 minutes.
