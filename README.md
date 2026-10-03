# Party Tactics

A turn-based 3v3 party tactics game. Each character is one player's build: a class, 3 of its 5 skills and a passive tree.

## Run it

```sh
npm install
npm run dev      # http://localhost:5173  (?quick skips setup, ?ai makes all six slots AI, ?map=chasm, ?seed=7)
```

## Check it

```sh
npm test                 # rules, Match and log-text tests
npx tsc --noEmit
npm run sim -- 200       # 200 AI battles: wins, average rounds, combos, class win share
node scripts/playtest.cjs  # plays a full battle through the real UI in headless Chromium
```

## Layout

- `src/engine` holds the rules. They are pure and deterministic: every random choice takes a seeded `Rng`, and every change goes through `apply(state, command)`.
- `src/host/match.ts` is the authority that holds the real game state. It decides which player may send each command and plays the AI seats. It has no DOM, so it can move to a server unchanged.
- `src/client` is the browser game. `board/` draws the 3D scene from states and events, and `screens/` holds the menus and HUD. The client only sends commands to the Match.
- `prototypes*/` are the earlier throwaway prototypes, kept as reference.
