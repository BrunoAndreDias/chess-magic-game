# Prototypes — throwaway, for finding the game's direction

Three playable prototypes of very different ideas about what "magic" means in a
chess-like game. They are throwaway code: each one exists to answer a single
question, and nothing here is meant to be kept as-is.

Open `index.html` (or any of the files directly) in a browser. Nothing to install.

## What all three share

- **Turn-based, perfect information, no cards, no luck.** Both players have exactly
  the same tools, like in chess. Nothing is drawn or shuffled.
- **Chess clock (Fischer).** Each player has a time bank, e.g. 10 min, plus a
  small bonus after every turn (+5s). You can burn 2 minutes on one critical turn
  as long as you keep enough in the bank to finish the game. Hitting 0 loses.
- **A leader to protect** (Monarch / King / Oracle). Lose it and you lose.
- **Optional bot** for Shadow, so you can play solo. It's deliberately weak
  (it only looks one move ahead). Its job is to let you feel the rules, not to
  be a challenge.

## The three directions

| | A — Elemental Chess | B — Chronomancer | C — Sigils |
|---|---|---|---|
| **Where the magic lives** | In the **pieces**: each has a type and one ability | In the **clock**: spells cost your own thinking time | In the **board geometry**: shapes you form cast spells |
| **Question it tests** | Do type match-ups + one-shot abilities create interesting decisions? | Is it fun when time is both your thinking budget and your mana? | Is it fun when spells emerge from formations instead of being chosen? |
| **Closest feeling** | Chess + Pokémon-style types | Chess with time-bending powers | Chess × Go × "connect three" |
| **Board** | 7×7, 7 pieces each | 6×6 mini-chess | 7×7, 6 Adepts + Oracle |
| **Unique hook** | Type cycle: Water > Fire > Earth > Water; a piece can't capture its counter | Rewind the opponent's last turn, Haste for double moves, Siphon doubles their clock speed | Lines of 3 fire beams, 2×2 squares summon new pieces |

## Playtest questions (jot answers after a few games of each)

1. Did you spend real **thinking time** on turns, and did the clock create
   tension, or was it just background noise?
2. Did the magic create **decisions** ("should I use it now or save it?") or just
   **reactions** ("oh, that happened")?
3. Could you **read the board**: see threats coming before they hit you?
4. What felt **unique**, something that couldn't exist in chess or in a card game?
5. What was **confusing** or felt unfair?
6. If you had to keep one idea from each prototype, which would it be?

The likely end result is a mix, e.g. B's clock-as-mana with C's geometry, or A's types
feeding C's sigils. The prototypes are there to find out which pieces are worth
combining.
