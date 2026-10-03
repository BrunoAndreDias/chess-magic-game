# Party Tactics

A turn-based 3v3 party tactics game. Each character is one player's build: a class, 3 of its 7 skills and a passive tree.

There are four classes, and each owns one mechanic through an innate skill every build has: the Astromancer casts Calls that land at the start of its next turn (Snap), the Weaver ties Threads that leash, pull and share damage (Tether), the Gravecaller gathers the Souls that hard hits and Downs drop and spends them on Rites (Harvest), and the Bellringer moves turns in the round's queue (Toll). The passive tree has 3 paths of 4 nodes, one each for tank, damage and support, and 6 points: enough for one keystone and a dip into a second path. A character's role is its keystone path's, and a party covering all three roles gets Role Coverage. `docs/classes.md` is the full rules spec.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173  (?map=span|storm|altar, ?seed=7, ?ai makes all six slots AI, ?quick skips to scouting)
```

A game goes map → setup → scout → battle → result. The battlefield is drawn first, at random from the seed unless `?map=` names one, and the map screen shows what its rule does, when and where. Then both parties are formed for it. The result screen offers Rematch (same map and parties), Change parties (same map) and New battlefield (a different map at random).

Each map has one rule, fully known in advance. Shattered Span crumbles its edges at the end of set rounds, Storm Court strikes a fixed cycle of lines at the end of every round, and the Sun Altar gives favor to whoever holds it. In battle, violet stripes mark the tiles this round's end will hit (the map's and any Undermined ones), and the initiative bar's last chip names what comes.

## Check it

```sh
npm test                 # rules, Match and log-text tests
npx tsc --noEmit
npm run sim -- 200       # 200 AI battles with random builds: wins, rounds, combos, class and path win share, mechanic use
npm run sim -- 300 --blind  # one side ignores the map rule: the aware side's win rate per map
npm run sim -- 300 --dumb   # three damage keystones against a party covering tank, damage and support
MAP=storm node scripts/playtest.cjs  # plays a full battle through the real UI in headless Chromium and counts Calls, Threads and webs (ALL_AI=1 spectates)
```

## Layout

- `src/engine` holds the rules. They are pure and deterministic: every random choice takes a seeded `Rng`, and every change goes through `apply(state, command)`.
- `src/host/match.ts` is the authority that holds the real game state. It decides which player may send each command and plays the AI seats. It has no DOM, so it can move to a server unchanged.
- `src/client` is the browser game. `board/` draws the 3D scene from states and events, and `screens/` holds the menus and HUD. The client only sends commands to the Match.
- `prototypes-party/` is the throwaway single-file prototype the game was ported from, kept as reference. It predates the current maps.
