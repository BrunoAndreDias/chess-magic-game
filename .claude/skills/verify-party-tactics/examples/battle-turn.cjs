// Proof for features/battle-turns.md: on the first Blue turn with an aimed skill to cast, move, aim a skill, preview it, cancel, cast, and end the turn.
// Run: PORT=5294 .claude/skills/verify-party-tactics/scripts/drive.cjs .claude/skills/verify-party-tactics/examples/battle-turn.cjs "?quick&map=span&seed=7"
module.exports = async ({ page, log, shot, dump, untilPhase, until, engine, state, clickTile, hoverTile, wait }) => {
  await untilPhase('scout'); await wait(1200);
  await page.click('#sc-ready');
  await untilPhase('battle');
  const myTurn = () => page.$eval('#endturn', b => !b.disabled);
  // A castable, aimed skill and a target on solid ground; its hotkey is its index in actionsOf + 1.
  const findAim = () => engine((L, s) => {
    const u = L.current(s), ids = L.actionsOf(u);
    for (const [i, id] of ids.entries()) {
      const sk = L.SKILLS[id];
      if (id === 'helpup' || sk.target === 'self' || sk.free || !L.canUse(s, u, id)) continue;
      const t = L.castTargets(s, u, id).filter(p => L.terrAt(s, p.x, p.z) !== 'o').sort((a, b) => b.z - a.z)[0];
      if (t) return { id, key: String(i + 1), t };
    }
    return null;
  });
  // Pass Blue turns that have nothing to aim (a round-1 Gravecaller) until one does.
  for (let n = 0; ; n++) {
    if (!(await until(myTurn, 120000))) throw new Error('no Blue turn within 2 minutes');
    await wait(800);
    if (await findAim()) break;
    if (n === 5) throw new Error('six Blue turns with nothing to aim');
    const who = await engine((L, s) => L.current(s).id);
    await page.keyboard.press('Space');
    await until(async () => (await engine((L, s) => L.current(s)?.id)) !== who, 10000);
  }
  log(await dump());
  const me = await engine((L, s) => L.current(s).id);
  const unit = async () => (await state()).units.find(u => u.id === me);

  // A reachable tile off the unit's own column, nearest the enemy.
  const from = await unit();
  const to = await engine((L, s) => { const u = L.current(s); return [...L.reachable(s, u).keys()].map(i => ({ x: i % 12, z: Math.floor(i / 12) })).filter(t => t.x !== u.x).sort((a, b) => b.z - a.z)[0]; });
  await clickTile(to);
  if (!(await until(async () => (await unit()).moved, 10000))) throw new Error(`move to ${to.x},${to.z} did not land`);
  await until(myTurn, 10000);
  const moved = await unit();
  log(`${moved.name} moved ${from.x},${from.z} -> ${moved.x},${moved.z}; selinfo "${(await page.textContent('#selinfo')).trim()}"`);
  await shot('moved');

  const aim = await findAim();
  if (!aim) throw new Error(`${moved.name} has no aimed skill to cast`);
  await page.keyboard.press(aim.key);
  if (!(await page.$(`#actions .spbtn.on[data-skill="${aim.id}"]`))) throw new Error(`hotkey ${aim.key} did not aim ${aim.id}`);
  await hoverTile(aim.t);
  const tip = await page.textContent('#tooltip .tt').catch(() => '');
  log(`aimed ${aim.id} at ${aim.t.x},${aim.t.z}; preview "${tip}"`);
  if (!tip) throw new Error('no target preview in #tooltip');
  await shot('preview');

  await page.keyboard.press('Escape');
  if (await page.$('#actions .spbtn.on')) throw new Error('Escape did not cancel aiming');

  const lines = await page.$$eval('#log div', els => els.length);
  await page.keyboard.press(aim.key);
  await clickTile(aim.t);
  if (!(await until(async () => (await unit()).acted, 10000))) throw new Error('cast did not land');
  const said = await page.$$eval('#log div', (els, n) => els.slice(n).map(e => e.textContent), lines);
  log(`log after cast: ${said.join(' / ')}`);
  if (!said.some(l => l.includes(moved.name))) throw new Error('the log does not report the cast');
  await shot('cast');

  // A unit with nothing left to do ends its turn by itself; press Space only while it still holds the turn.
  await until(async () => (await engine((L, s) => L.current(s)?.id)) !== me || (await myTurn()), 10000);
  if ((await engine((L, s) => L.current(s)?.id)) === me) await page.keyboard.press('Space');
  if (!(await until(async () => (await engine((L, s) => L.current(s)?.id)) !== me, 10000))) throw new Error('the turn did not end');
  log(await dump());
  return `${moved.name} moved to ${moved.x},${moved.z}, cast ${aim.id} at ${aim.t.x},${aim.t.z}, turn passed`;
};
