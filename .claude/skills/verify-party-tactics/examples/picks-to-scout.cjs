// Proof for features/picks.md: pass the map, edit Blue's first hero, lock Blue's turns while Red's AI locks between, and see the result on scout.
// Run: PORT=5294 .claude/skills/verify-party-tactics/scripts/drive.cjs .claude/skills/verify-party-tactics/examples/picks-to-scout.cjs "?map=storm&seed=7"
module.exports = async ({ page, log, shot, dump, untilPhase, until, wait }) => {
  await untilPhase('map');
  const mapName = (await page.textContent('#mp-name')).trim();
  await page.click('#mp-go');
  await untilPhase('picks');
  await wait(800);
  log(await dump());
  if (!(await page.textContent('#su-mapinfo')).includes(mapName)) throw new Error(`picks does not show ${mapName}`);

  const blue0 = '#su-teams .pslot[data-team="0"][data-slot="0"]';
  await page.click(blue0);
  await page.click('#picks .ccard[data-cls="weaver"]');
  const cls = await page.textContent(`${blue0} .c`);
  const picks = () => page.$$eval('#ed-skills .skc.on:not(.innate)', els => els.map(e => e.dataset.skill));
  if (!cls.includes('Weaver') || (await picks()).length !== 3) throw new Error(`class change: plate "${cls}", picks ${await picks()}`);

  const added = await page.$eval('#ed-skills .skc:not(.on)', e => e.dataset.skill);
  await page.click(`#ed-skills .skc[data-skill="${added}"]`);
  const after = await picks();
  if (after.length !== 3 || !after.includes(added)) throw new Error(`a fourth pick should replace the oldest: ${after}`);

  const pts = () => page.textContent('.tree .pts b');
  const full = await pts();
  await page.click('.treewrap .node.on.live');
  const refunded = await pts();
  await page.click('.treewrap .node.live:not(.on)');
  if (Number(refunded) !== Number(full) + 1 || (await pts()) !== full) throw new Error(`tree points ${full} -> ${refunded} -> ${await pts()}`);
  await page.fill('#ed-name', 'Vex');
  log(`hero 1: ${cls.trim()}, skills ${after.join(', ')}, tree ${full} -> ${refunded} -> ${full}`);
  await shot('edited');

  // Blue locks whenever #pk-lock is enabled; the selection moves to its next open hero after each lock.
  for (let k = 0; k < 3; k++) {
    if (!(await until(() => page.$eval('#pk-lock', b => !b.disabled).catch(() => false), 10000))) throw new Error(`Blue lock ${k + 1} never enabled`);
    await page.click('#pk-lock');
  }
  if (!(await until(() => page.$eval('#pk-go', b => !b.disabled), 10000))) throw new Error('the draft never completed');
  const seats = await page.$$eval('#pk-track .pk-seat', els => els.map(e => `${e.dataset.team}:${e.classList.contains('locked') ? e.querySelector('.nm').textContent : '-'}`));
  log(`turn order: ${seats.join(' ')}`);
  if (seats.some(s => s.endsWith('-')) || !seats.includes('0:Vex')) throw new Error(`draft incomplete or Vex missing: ${seats}`);
  await shot('locked');

  await page.selectOption('#su-timer', '0');
  await page.click('#pk-go');
  await untilPhase('scout');
  await wait(1200);
  const units = await page.$$eval('#sc-units .du', els => els.map(e => e.textContent.trim()));
  const timer = (await page.textContent('#sc-timer')).trim();
  log(await dump());
  await shot('scout');
  if (!(await page.textContent('#scout .tag')).includes(mapName)) throw new Error(`scout is not on ${mapName}`);
  if (!units[0].startsWith('Vex') || !units[0].includes('Weaver')) throw new Error(`Vex, locked first, should lead the scout roster: ${units}`);
  if (timer !== '∞') throw new Error(`timer should be off: ${timer}`);
  return `draft locked ${seats.join(' ')}; scout on ${mapName} lists ${units.join(' | ')}`;
};
