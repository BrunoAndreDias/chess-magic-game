// Proof for features/battle-intro.md and features/ultimates.md: watch the intro, follow Blue's ultimate countdowns by passing turns, aim and cast Seren's Falling Star, then ⟲ Party back to picks.
// Run: PORT=5294 .claude/skills/verify-party-tactics/scripts/drive.cjs .claude/skills/verify-party-tactics/examples/ultimate.cjs "?quick&map=span&seed=7"   (about 5 minutes)
module.exports = async ({ page, log, shot, dump, untilPhase, until, engine, state, hoverTile, clickTile, wait }) => {
  await untilPhase('scout'); await wait(1200);
  await page.click('#sc-ready');
  await untilPhase('battle');
  const intro = { kind: (await state()).phase.kind, hidden: await page.evaluate(() => window.__party.board.units().filter(u => !u.visible).length), banner: await page.$eval('#banner', e => e.textContent) };
  log(`intro: ${JSON.stringify(intro)}`);
  if (intro.kind !== 'ready' || !intro.banner.startsWith('To battle!') || intro.hidden === 0) throw new Error('the battle should open on To battle! with the figures still to arrive');
  await shot('intro');
  if (!(await until(async () => (await state()).phase.kind !== 'ready', 30000))) throw new Error('the intro never ended');
  if (!(await page.evaluate(() => window.__party.board.units().every(u => u.visible)))) throw new Error('a figure never arrived');

  const myTurn = () => page.$eval('#endturn', b => !b.disabled);
  let cur;
  for (let n = 0; ; n++) {
    if (n === 15) throw new Error('Seren never had her ultimate');
    if (!(await until(myTurn, 240000))) throw new Error('no Blue turn within 4 minutes');
    await wait(800);
    cur = await engine((L, s) => { const u = L.current(s); return { id: u.id, name: u.name, ult: L.ultIn(u), round: s.round, key: String(L.actionsOf(u).indexOf(L.CLASSES[u.cls].ult) + 1) }; });
    const badges = await page.$$eval('#roster0 .rcard .ub', l => l.map(e => (e.classList.contains('ready') ? 'ready' : e.dataset.ult)));
    log(`round ${cur.round}, ${cur.name} acting with ultIn ${cur.ult}; Blue badges ${badges.join(' ')}`);
    if (n === 0) {
      if (badges.join(' ') !== '3 4 4') throw new Error('the opener\'s badge should tick to 3 as it acts, the others read 4');
      await page.keyboard.press('c');
      const cam = await page.textContent('#btn-cam');
      await page.keyboard.press('c');
      if (cam !== '🎥 Follow: off' || (await page.textContent('#btn-cam')) !== '🎥 Follow: on') throw new Error(`c should toggle follow: ${cam}`);
    }
    if (cur.name === 'Seren' && cur.ult === 0) break;
    await page.keyboard.press('Space');
    await until(async () => (await engine((L, s) => L.current(s)?.id)) !== cur.id, 10000);
  }

  if (!(await page.$('#actions .spbtn.ultimate.ready[data-skill="fallingstar"]:not(:disabled)'))) throw new Error('Falling Star should be ready and enabled');
  await page.keyboard.press(cur.key);
  const targets = await engine((L, s) => { const u = L.current(s); return L.castTargets(s, u, 'fallingstar').filter(p => L.terrAt(s, p.x, p.z) !== 'o').map(p => ({ x: p.x, z: p.z, pulled: L.starPulled(s, u, p.x, p.z).length })).sort((a, b) => b.pulled - a.pulled); });
  let target = null, tip = '';
  for (const t of targets.slice(0, 8)) {
    try { await hoverTile(t); } catch { continue; }
    tip = await page.textContent('#tooltip');
    if (tip.includes('Falling Star')) { target = t; break; }
  }
  if (!target) throw new Error('no Falling Star target took the hover');
  log(`aimed at ${target.x},${target.z} pulling ${target.pulled}: ${tip.replace(/\s+/g, ' ')}`);
  await shot('falling-star-aim');
  const lines = await page.$$eval('#log div', l => l.length);
  await clickTile(target);
  if (!(await until(() => engine((L, s, id) => s.units.find(u => u.id === id).acted, cur.id), 10000))) throw new Error('Falling Star did not land');
  const said = await page.$$eval('#log div', (l, n) => l.slice(n).map(e => e.textContent), lines);
  const ultIn = await engine((L, s, id) => L.ultIn(s.units.find(u => u.id === id)), cur.id);
  log(`log: ${said.join(' / ')}; ultIn now ${ultIn}`);
  if (said[0] !== 'Seren uses Falling Star.' || ultIn !== 5) throw new Error('the cast should log and reset the countdown to 5');
  await shot('falling-star-cast');

  await page.click('#btn-setup');
  await untilPhase('picks'); await wait(800);
  log(await dump());
  const locked = await page.$$eval('#pk-track .pk-seat.locked', l => l.length);
  if (locked !== 0 || !(await page.textContent('#su-mapinfo')).includes('Shattered Span')) throw new Error(`⟲ Party should reopen a fresh draft on the same map (${locked} locked)`);
  return `Falling Star cast in round ${cur.round} at ${target.x},${target.z}; ⟲ Party reopened the draft`;
};
