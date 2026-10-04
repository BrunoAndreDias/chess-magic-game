// Proof for features/scout-deploy.md: hover and place Blue hero 1 on a gold tile, auto-deploy, re-place, press Ready, confirm the battle starts with it there.
// Run: PORT=5294 .claude/skills/verify-party-tactics/scripts/drive.cjs .claude/skills/verify-party-tactics/examples/scout-deploy.cjs "?quick&map=span&seed=7"
module.exports = async ({ page, log, shot, untilPhase, engine, clickTile, hoverTile, state, wait }) => {
  await untilPhase('scout'); await wait(1200);
  const freeTile = () => engine((L, s) => { const c = []; for (let z = 0; z < 12; z++) for (let x = 0; x < 12; x++) if (L.canDeploy(s, 0, x, z) && !L.unitAt(s, x, z)) c.push({ x, z }); return c.sort((a, b) => Math.abs(a.x - 5.5) - Math.abs(b.x - 5.5))[0]; });
  let free = await freeTile();
  log(`free deploy tile ${JSON.stringify(free)}`);

  await hoverTile(free);
  const tip = await page.textContent('#tooltip');
  if (!tip.includes('Deploy zone')) throw new Error(`hover tooltip lacks Deploy zone: ${tip}`);
  await shot('hover');

  const du = n => `#sc-units .du[data-slot="${n}"]`;
  const place = async () => { await page.click(du(0)); await clickTile(free); };
  await place();
  const on = await page.$$eval('#sc-units .du', els => els.map(e => e.classList.contains('on')));
  const placed = (await state()).units.find(u => u.team === 0 && u.slot === 0);
  log(`after click: selection ${JSON.stringify(on)}, slot 0 at ${placed.x},${placed.z}`);
  if (on[0] || !on[1]) throw new Error('selection did not advance to slot 1');
  if (placed.x !== free.x || placed.z !== free.z) throw new Error('slot 0 not on clicked tile');
  await shot('placed');

  await page.click('#sc-auto');
  const auto = (await state()).units.filter(u => u.team === 0).map(u => `${u.x},${u.z}`);
  log(`auto-deploy: ${auto.join(' ')}`);
  if (new Set(auto).size !== 3) throw new Error('auto-deploy stacked units');

  free = await freeTile();
  await place();
  await page.click('#sc-ready');
  await untilPhase('battle');
  const s = await state();
  const u = s.units.find(o => o.team === 0 && o.slot === 0);
  const red = s.units.filter(o => o.team === 1).map(o => o.z);
  log(`after ready: phase ${s.phase.kind}, blue slot0 at ${u.x},${u.z}, red rows ${red.join(',')}`);
  if (u.x !== free.x || u.z !== free.z) throw new Error('unit not at clicked tile');
  if (red.length !== 3 || red.some(z => z < 9)) throw new Error('red did not deploy on its rows');
  await shot('battle');
  return `deployed by click at ${free.x},${free.z}`;
};
