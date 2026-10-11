# Party Tactics

A turn-based 3v3 party tactics game. Each character is one player's build: a class, 3 of its 7 skills and a passive tree.

There are five classes, and each owns one mechanic through an innate skill every build has: the Astromancer casts Calls that land at the start of its next turn (Snap), the Gravecaller gathers the Souls that hard hits and Downs drop and spends them on Rites (Harvest), the Bellringer moves turns in the round's queue (Toll), the Marionettist works a Doll, a second body on the board it walks, swaps with and fights through (Strings), and the Mirrormime turns hits back on whoever threw them (Reflect) and raises glass that bounces enemy shots. The passive tree has 3 paths of 4 nodes, one each for tank, damage and support, and 6 points: enough for one keystone and a dip into a second path. A character's role is its keystone path's, and a party covering all three roles gets Role Coverage. `docs/classes.md` is the full rules spec.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173  (?map=span|storm|altar, ?seed=7, ?ai makes all six slots AI, ?quick skips to scouting, ?perf shows frame rate, frame work and draw calls)
```

A game goes map → picks → scout → battle → result. The battlefield is drawn first, at random from the seed unless `?map=` names one, and the map screen shows what its rule does, when and where. On the picks screen a coin draws the starter, who opens and closes every round for the whole battle. The parties then draft the turn order in the order they will act, and each lock commits a character to a turn and a class. Skills and passives stay editable until scouting. The result screen offers Rematch (same map and parties), Change parties (same map) and New battlefield (a different map at random).

Each map has one rule, fully known in advance. Shattered Span crumbles its edges at the end of set rounds, Storm Court strikes a fixed cycle of lines at the end of every round, and the Sun Altar gives favor to whoever holds it. In battle, violet stripes mark the tiles this round's end will hit (the map's and any Undermined ones), and the initiative bar's last chip names what comes.

## Check it

```sh
npm run check           # oxlint, tsc and vitest; the pre-commit hook runs this
npm run build
npm run sim -- 200       # 200 AI battles with random builds: wins, rounds, combos, class and path win share, mechanic use
npm run sim -- 300 --blind  # one side ignores the map rule: the aware side's win rate per map
npm run sim -- 300 --dumb   # three damage keystones against a party covering tank, damage and support
MAP=storm node scripts/playtest.cjs  # plays a full battle through the real UI in headless Chromium and counts Calls, Encases, Strings, Dolls, Mirrors and glass (ALL_AI=1 spectates)
npm run perf             # frame cost of an AI battle per map and the hitches from map to battle, from a production build on this machine's GPU; fails when draw calls, triangles or shaders grow past perf/baseline.json
npm run perf -- --save   # make this run the baseline; git log -p perf/baseline.json is the history
```

## Layout

- `src/engine` holds the rules. They are pure and deterministic: every random choice takes a seeded `Rng`, and every change goes through `apply(state, command)`.
- `src/host/match.ts` is the authority that holds the real game state. It decides which player may send each command and plays the AI seats. It has no DOM, so it can move to a server unchanged.
- `src/client` is the browser game. `board/` draws the 3D scene from states and events, and `screens/` holds the menus and HUD. The client only sends commands to the Match.
- `art/` builds the class figures in Blender: `art/figures/<class>.py` per class, `art/build.sh` writes `public/models/<class>.glb`, and `art/figures/common.py` documents the glb contract the client loads. `art/splash.sh` renders each built figure into `public/splash/<class>.webp`, the art the picks screen shows for a class. `art/grips.py` measures, over every frame of every clip in a built glb, how far each hand slips off what it holds and how low each held prop reaches, and fails a hand that slips or a prop that sinks into the floor. `art/orbits.py` fails a figure whose arms pass through what orbits it (an empty it marks `clear`, like the Astromancer's flock of shards).
- `docs/classes.md` is the rules spec and `docs/world.md` the lore (lands and orders).
