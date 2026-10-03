# Party Tactics

A turn-based 3v3 party tactics game. Each character is one player's build: a class, 3 of its 5 skills and a passive tree.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173  (?map=span|storm|altar, ?seed=7, ?ai makes all six slots AI, ?quick skips to scouting)
```

A game goes map → setup → scout → battle → result. The battlefield is drawn first, at random from the seed unless `?map=` names one, and the map screen shows what its rule does, when and where. Then both parties are formed for it. The result screen offers Rematch (same map and parties), Change parties (same map) and New battlefield (a different map at random).

Each map has one rule, fully known in advance. Shattered Span crumbles its edges at the end of set rounds, Storm Court strikes a fixed cycle of lines at the end of every round, and the Sun Altar gives favor to whoever holds it. In battle, violet stripes mark the tiles this round's end will hit, and the initiative bar's last chip names what comes.

## Check it

```sh
npm test                 # rules, Match and log-text tests
npx tsc --noEmit
npm run sim -- 200       # 200 AI battles: wins, average rounds, combos, class win share
npm run sim -- 300 --blind  # one side ignores the map rule: the aware side's win rate per map
MAP=storm node scripts/playtest.cjs  # plays a full battle through the real UI in headless Chromium (ALL_AI=1 spectates)
```

## Layout

- `src/engine` holds the rules. They are pure and deterministic: every random choice takes a seeded `Rng`, and every change goes through `apply(state, command)`.
- `src/host/match.ts` is the authority that holds the real game state. It decides which player may send each command and plays the AI seats. It has no DOM, so it can move to a server unchanged.
- `src/client` is the browser game. `board/` draws the 3D scene from states and events, and `screens/` holds the menus and HUD. The client only sends commands to the Match.
- `prototypes-party/` is the throwaway single-file prototype the game was ported from, kept as reference. It predates the current maps.
