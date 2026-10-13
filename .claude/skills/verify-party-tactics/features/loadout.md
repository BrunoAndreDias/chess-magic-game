# Picks: loadout

Next to the draft, the sheet edits the selected hero. Until it is locked, a hero's class is chosen from splash cards, and a class change resets its build to the recommended one. Skills, passives, name and Human/AI stay editable for every hero until scout. The sheet shows the build as a strip (basic, innate, 2 picked skills, ultimate, each with its battle key) and an emblem for the keystone path; the full editor opens in a modal.

## Sub-features

- `loadout-class` an open hero's `.ccards .ccard[data-cls]` (`.on` and `aria-pressed` for the current class; `ArrowUp`/`ArrowDown` cycle it) changes its class and resets its build; the plate's `.c` reads `<icon> <Class> · <role>`. A locked hero shows `#ed-cls` instead.
- `loadout-name` `#ed-name` renames (14 characters at most); the plate, seat and scout roster follow.
- `loadout-strip` `#ed-build`: `.slot.basic` (`basic_<cls>`), `.slot.innate`, the picked skills in pick order, `.slot.ult`, keys `1` to `5`; then `#ed-emblem` (keystone name, else the path with most points; role; 6 pips, the spent ones lit). A slot, the emblem or `#ed-open` opens `#pk-build` (role `dialog`, `#pk-build-t` "<name> · <Class>"); `#pk-build-done`, `Escape` or a backdrop click closes it. While open, picks hotkeys other than `Escape` do nothing.
- `loadout-skills` (in the modal) toggles `#ed-skills .skc` among the class's 4; a third pick drops the oldest, and an on skill can be turned off down to 1. The innate (`.skc.innate`) and ultimate (`.skc.ult`, `ULTIMATE` badge) are always on.
- `loadout-tree` (in the modal) takes and refunds `.treewrap .node`; `.tree .pts b` shows points left (`0` on the recommended build). `#ed-rec` (Reset build) restores the recommended build.
- `loadout-bonus` `.su-bonus .bchip` lists every pair resonance and Role Coverage, unearned ones `.off`.
- `loadout-random` `#su-random` rerolls the skills and passives of the shown team (not classes).

## How to get to it (user POV)

- The picks screen (see [picks.md](./picks.md)), any time before scout.

## Driving it with drive.cjs

Preconditions:

- Query `"?map=storm&seed=7"`; `untilPhase('map')`, click `#mp-go`, `untilPhase('picks')`, wait ~800 ms.

- **Class.** Click `#su-teams .pslot[data-team="0"][data-slot="0"]`, then `.ccards .ccard[data-cls="bellringer"]`: the plate's `.c` starts `🔔 Bellringer · `; the strip's `data-skill`/`kbd` read `basic_bellringer 1, toll 2, knell 3, hush 4, encore 5`.
- **Modal.** Click `#ed-open`: `#pk-build-t` is `Aldric · Bellringer`, 2 `.skc.on:not(.innate):not(.ult)`. Click an `.skc` without `.on`: still 2, the new one among them. Click `.treewrap .node.on.live` then `.node.live:not(.on)`: `.pts b` goes `0 → 1 → 0`. Click `#pk-build-done`: the strip's picked slots (`.slot:not(.basic):not(.innate):not(.ult)`) list the new picks, the new one last.
- **Name.** `page.fill('#ed-name', 'Vex')`; lock and go to scout: `#sc-units .du` starts with `Vex 🔔 Bellringer`.
- Done: `examples/picks-to-scout.cjs` passes; it covers class, modal, skills, tree, strip and name.

## Gotchas

- Set class first: a class change resets that hero's skills and tree.
- `#ed-skills .skc`, `.treewrap .node`, `.tree .pts b` and `#ed-rec` exist only while the modal is open. The class cards sit behind the backdrop then, so close it before changing class.
- `#ed-cls` is a `.ccard` too; select class cards with `.ccards .ccard`, not `#picks .ccard`.
- Every strip slot carries `data-skill`, the basic as `basic_<cls>`; filter the picked ones by class.
- With one skill picked the strip has 4 slots and the ultimate sits on key `4`.
- `#su-random` uses `Math.random`: assert shape (2 picks, `.pts b` is `0`), not values.
