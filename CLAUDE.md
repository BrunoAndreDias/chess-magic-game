# Party Tactics

`README.md` maps the code (engine, Match authority, client, art pipeline) and lists the commands. Read it before exploring.

- `npm run check` (oxlint, tsc, vitest) gates every commit through `.githooks/pre-commit`. Run it unpiped; a `| grep` hides a red exit.
- Prove a client, HUD or rules change through the real UI with the `verify-party-tactics` skill.
- Several sessions often share this checkout. Stage files by path, never `git add -A` or `commit -a`, and give a long parallel job its own worktree.
- macOS zsh: quote globs (`'*.ts'`); `timeout`, ImageMagick (`magick`) and Python's PIL are installed.

## Tests

A test earns its place only if it can fail for a defect. Before keeping an assertion, ask whether it would still pass if the code under test returned `undefined`, or if someone edited copy or a table row and broke nothing. If yes, it is tautological: rewrite it or delete it.

- Call the subject with a concrete input and compare its output, events or resulting state to a literal: `expect(line({ type: 'damage', id: id(1), amount: 12, absorbed: 0, kind: 'phys' })).toEqual({ tone: 't0', text: 'Aldric takes 12 damage.' })`.
- Don't pin copy or table values the code only passes through. `case 'charge': return { tone: 'sys', text: 'A Satchel Charge is planted.' }` has no logic to test, so it gets no test. Test the mechanism that reads a table (interpolation, plurals, round math, which row a round picks) with one input.
- Don't take the expected value from the code under test. No `expect(f(x)).toEqual(f(x))`, no snapshots. Two exceptions, each next to a literal pin in the same test: same seed twice gives equal results (determinism), and an input left equal to its `structuredClone` (purity).
- An absence (`toBe(null)`, `.size).toBe(0)`, `ok: false`) sits next to the presence on the neighbouring input, so a stub that always returns nothing fails.
- Don't assert what the test itself staged. `stage()` and `s.mouths = [...]` set the scene; assert what `run`/`apply` did to it.

`src/assertions.test.ts` rejects the weak matchers (`toBeDefined`, `toBeTruthy`, `not.toThrow`, snapshots and the like), and `vitest.config.ts` fails any test with no assertion. The rest is judgment, so reviewers check new tests against this list.
