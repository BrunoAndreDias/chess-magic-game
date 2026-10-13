# Party Tactics verification map

Each feature file is the recipe for proving one part of the game. The harness and the handle list are in `../SKILL.md`.

## Baseline

- `../scripts/doctor.sh <port>` exits 0 on the port you will drive.
- The query carries `seed` and a valid `map`. Without `quick` the game opens on the map screen.
- The default draft: Blue is Human (Aldric Gravecaller, Seren Astromancer, Kip Bellringer), Red is AI (Morvath Bellringer, Ysolde Astromancer, Grix Gravecaller). Only Blue needs driving. `seed=7` makes Blue the starter, so the turn order is Blue, Red, Blue, Red, Red, Blue. The class cards also offer the Marionettist and Mirrormime; a Marionettist's Doll is a unit in `state().units` with `owner` set, numbered after the six characters, never in the queue.
- Wait on `untilPhase` / `until`; a fixed `wait` only for the 800 to 1200 ms camera settle after a screen mounts.
- `Math.random` drives auto-deploy, `#su-random`, and the starter and map that Change parties and New battlefield draw: assert shape there, not values.

## Reporting

Name the feature file and the sub-feature IDs you proved, with the evidence directory. A sub-feature whose entry point you could not reach is reported as unproven, with the steps file, the failing step and its `failure` shot.

## Feature file contract

H1 title, one paragraph of player-visible behavior, then `Sub-features`, `How to get to it (user POV)`, `Driving it with drive.cjs` (opening with `Preconditions:`), `Gotchas`.

## Features

- [Map reveal](./map.md): the drawn battlefield and its rule, before the draft.
- [Picks: the draft](./picks.md): the coin, the six locks in turn order, each class's lock-in scene, the final clock, then scout.
- [Picks: loadout](./loadout.md): class cards, the build strip, the build modal (skills, passive tree), bonuses, randomize.
- [Scout and deploy](./scout-deploy.md): place each Human party on its gold tiles, auto-deploy, timer, Ready.
- [Battle intro](./battle-intro.md): `To battle!`, each class's entrance onto the board, the first round banner.
- [Battle turns](./battle-turns.md): move, cast with target preview, cancel, end turn, HUD, camera, `⟲ Party`.
- [Ultimates](./ultimates.md): the public countdowns and aiming each class's ultimate.
- [Round end and map rules](./round-end.md): violet stripes, the hazard chip, round banners, the dark rounds.
- [Result and rematch](./result.md): the end screen, Rematch, Change parties, New battlefield.
- [AI spectate](./ai-spectate.md): six AI characters draft and play a whole battle.
- [Game records](./game-records.md): every finished battle saved to `games.jsonl`, and `npm run games`.
- [Dev pages](./dev-pages.md): the `?perf` readout, the model gallery, the error overlay.
