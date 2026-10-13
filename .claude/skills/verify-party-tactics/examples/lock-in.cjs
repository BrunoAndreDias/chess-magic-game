// Proof for features/picks.md: under a paused page clock, lock Blue's opener and film its lock-in, lock the rest, see the sixth lock open the final clock, and run it out to scout.
// Run: PORT=5294 .claude/skills/verify-party-tactics/scripts/drive.cjs .claude/skills/verify-party-tactics/examples/lock-in.cjs "?map=storm&seed=7"
const run = async ({ page, log, shot, untilPhase, wait }) => {
  await untilPhase('map');
  await page.click('#mp-go');
  await untilPhase('picks');
  await page.clock.runFor(800);
  const text = s => page.textContent(s).then(t => t.replace(/\s+/g, ' ').trim());
  const cta = async () => ({ cls: await page.$eval('#pk-cta', e => e.className), ey: await text('#pk-cta .ey') });

  await page.click('.ccards .ccard[data-cls="bellringer"]');
  await page.fill('#ed-name', 'Vex');
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.click('#pk-lock');
  await page.clock.runFor(1200);
  const sealed = { ...(await cta()), h2: await text('#pk-cta h2'), plates: await page.$eval('.su-plates', e => e.style.opacity) };
  const seat0 = await page.$eval('#pk-track .pk-seat[data-step="0"]', e => ({ cls: e.className, nm: e.querySelector('.nm').textContent, art: e.querySelector('.art')?.getAttribute('src') }));
  log(`1.2 s into the lock-in: ${JSON.stringify(sealed)}; seat 0 ${JSON.stringify(seat0)}`);
  if (!sealed.cls.includes('sealed') || sealed.ey !== 'Locked in · Opener' || sealed.h2 !== 'Vex, the Bellringer') throw new Error('the opener lock is not sealed');
  if (sealed.plates !== '0.1') throw new Error(`plates should fade to 0.1 under the lock-in: ${sealed.plates}`);
  if (!seat0.cls.includes('locked') || seat0.nm !== 'Vex' || !seat0.art?.endsWith('/splash/bellringer.webp')) throw new Error('seat 0 did not land Vex');
  await shot('lockin-bellringer');
  await page.clock.runFor(1000);
  const after = await cta();
  log(`2.2 s: ${JSON.stringify(after)}`);
  if (after.cls.includes('sealed')) throw new Error('the lock-in did not end after its 2 s');

  // Blue's turns 3 and 6; Red's AI locks between them as the clock runs.
  for (let k = 2; k <= 3; k++) {
    for (let i = 0; i < 80 && !(await page.$eval('#pk-lock', b => !b.disabled).catch(() => false)); i++) await page.clock.runFor(250);
    await page.click('#pk-lock');
    await page.clock.runFor(1000);
    log(`lock ${k}: ${JSON.stringify(await cta())}`);
  }
  const fin = { ...(await cta()), clock: await text('#pk-final') };
  if (!fin.cls.includes('final') || fin.ey !== 'Final builds') throw new Error(`the sixth lock should open the final clock, not ${JSON.stringify(fin)}`);
  if (!/^0:4[45]$/.test(fin.clock)) throw new Error(`final clock ${fin.clock}`);
  const seats = await page.$$eval('#pk-track .pk-seat', l => l.map(e => `${e.querySelector('.nm').textContent}/${e.querySelector('.cl').textContent}`));
  log(`final clock ${fin.clock}; seats ${seats.join(' ')}`);
  if (seats.length !== 6 || seats.some(s => s.includes('Picking') || s.includes('Your pick'))) throw new Error('draft incomplete');

  await page.clock.fastForward(34000);
  const urgent = { clock: await text('#pk-final'), cls: await page.$eval('#pk-cta', e => e.className) };
  log(`after 34 s more: ${JSON.stringify(urgent)}`);
  if (!/^0:(09|10)$/.test(urgent.clock) || !urgent.cls.includes('urgent')) throw new Error('the last 10 s should be urgent');
  await shot('final-urgent');
  await page.clock.fastForward(11000);
  await page.clock.resume();
  await untilPhase('scout');
  await wait(1200);
  const units = await page.$$eval('#sc-units .du', l => l.map(e => e.textContent.trim()));
  log(`scout lists ${units.join(' | ')}`);
  if (!units[0].startsWith('Vex') || !units[0].includes('Bellringer')) throw new Error('Vex, locked first, should lead the scout roster');
  return `sealed ${sealed.ey}, final clock ${fin.clock} ran out to scout`;
};
run.before = ({ page }) => page.clock.install();
module.exports = run;
