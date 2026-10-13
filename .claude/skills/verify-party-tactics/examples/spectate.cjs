// Proof for features/ai-spectate.md, features/game-records.md and features/result.md: an all-AI battle saves its record while round 1 plays, the HUD only ever shows the AI acting, and the result screen matches the record.
// Run in the background: PORT=5294 .claude/skills/verify-party-tactics/scripts/drive.cjs .claude/skills/verify-party-tactics/examples/spectate.cjs "?ai&quick&map=span&seed=7"   (5 to 10 minutes)
const REASON = { wipe: 'The other party has nobody left standing.', mutual: 'Both parties fell.', rounds: 'Round limit: the healthier party wins.', altar: 'The Sun Altar grants them victory.' };
const TITLE = ['Blue party wins', 'Red party wins'];

module.exports = async ({ page, log, shot, dump, untilPhase, until, wait, phase, state, games }) => {
  await untilPhase('battle', 60000);
  if (!(await until(() => games().length === 1, 60000))) throw new Error('no record within a minute of the battle starting');
  const rec = games()[0], savedIn = (await state()).round;
  log(`record saved during round ${savedIn}: ${JSON.stringify(rec.result)} after ${rec.commands.length} commands, commit ${rec.commit}`);
  if (rec.v !== 1 || rec.seed !== 7 || rec.setup.map !== 'span' || rec.seats.flat().some(s => s.kind !== 'ai')) throw new Error('the record does not describe this battle');

  const waits = new Set();
  let shotAi = false;
  while ((await phase()) === 'battle') {
    const t = await page.$eval('#actions .wait', e => e.textContent).catch(() => null);
    if (t) waits.add(t);
    if (await page.$eval('#endturn', b => !b.disabled).catch(() => false)) throw new Error('#endturn enabled with no Human seat');
    if (!shotAi && t && t.includes('(AI) is acting')) { shotAi = true; log(await dump()); await shot('ai-acting'); }
    await wait(500);
  }
  log(`#actions .wait showed: ${[...waits].join(' | ')}`);
  for (const w of ['Blue party (AI) is acting…', 'Red party (AI) is acting…']) if (!waits.has(w)) throw new Error(`never saw "${w}"`);
  const odd = [...waits].filter(w => !['To battle…', 'Blue party (AI) is acting…', 'Red party (AI) is acting…', 'The battle is over.'].includes(w));
  if (odd.length) throw new Error(`unexpected HUD text: ${odd}`);

  await untilPhase('result'); await wait(300);
  const s = await state();
  const shown = { tag: await page.textContent('#res-tag'), title: await page.textContent('#res-title'), why: await page.textContent('#res-why'), rows: await page.$$eval('table.stats tr', l => l.map(r => r.cells[0].textContent)) };
  log(`result: ${JSON.stringify(shown)}; state ${JSON.stringify(s.phase)} round ${s.round}`);
  await shot('result');
  const n = rec.result.rounds;
  if (shown.tag !== 'Shattered Span · battle over') throw new Error('wrong map tag');
  if (s.phase.winner !== rec.result.winner || s.phase.reason !== rec.result.reason) throw new Error('the screen and the record disagree');
  if (shown.title !== (TITLE[s.phase.winner] ?? 'Draw')) throw new Error(`title ${shown.title} for winner ${s.phase.winner}`);
  if (shown.why !== `${REASON[s.phase.reason]} After ${n} round${n === 1 ? '' : 's'}.`) throw new Error(`reason line ${shown.why}`);
  if (shown.rows.join('|') !== '|Damage dealt|Healing|Enemies downed|Revives|Combos') throw new Error(`stats rows ${shown.rows}`);
  return `${shown.title}: ${shown.why} Recorded while round ${savedIn} played.`;
};
