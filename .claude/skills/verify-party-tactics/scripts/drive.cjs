#!/usr/bin/env node
// One verification run: start our own Vite server, open headless Chromium on it, run a steps file, save evidence, tear both down.
// Usage: drive.cjs <steps.cjs> [query]     e.g. drive.cjs examples/picks-to-scout.cjs "?map=storm&seed=7"
// Env: PORT (default 5288), EVIDENCE (default $TMPDIR/verify-party-tactics/<stamp>-<steps name>), CHROME, HEADED=1.
// The steps file exports `async (ctx) => summaryString`, optionally with a `.before(ctx)` run ahead of the first load; ctx is documented in SKILL.md under "Drive".
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../../../..');
const { chromium } = require(require.resolve('playwright-core', { paths: [ROOT] }));
const CHROME = process.env.CHROME || path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
const PORT = Number(process.env.PORT || 5288);

const [stepsArg, query = ''] = process.argv.slice(2);
if (!stepsArg) { console.error('usage: drive.cjs <steps.cjs> [?query]'); process.exit(2); }
const stepsPath = path.resolve(stepsArg);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const EVIDENCE = path.resolve(process.env.EVIDENCE || path.join(os.tmpdir(), 'verify-party-tactics', `${stamp}-${path.basename(stepsPath, '.cjs')}`));
const wait = ms => new Promise(r => setTimeout(r, ms));
// __party.phase() says 'map' before any screen mounts, so a phase counts only once its screen's root is in the DOM.
const ROOT_OF = { map: '#mapview', picks: '#picks', scout: '#scout', battle: '#initbar', result: '#res-title' };

// Runs in the page: what a player could read and press right now, as a few lines of text. `*` = .on.
function dumpScreen() {
  const seen = e => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const text = e => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim();
  const cut = (t, n = 40) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
  const lines = [`phase: ${window.__party ? window.__party.phase() : '(no __party)'}`];
  const err = document.querySelector('#errbox');
  if (err && !err.classList.contains('hidden')) lines.push(`errbox: ${cut(text(err), 200)}`);
  const heads = [...document.querySelectorAll('#ui h1, #ui h2')].filter(seen).map(e => cut(text(e), 60));
  if (heads.length) lines.push(`headings: ${heads.join(' | ')}`);
  const groups = new Map();
  // Buttons group under their nearest ancestor id; a button with data-* attributes is named by them (its handle), else by its text.
  for (const b of document.querySelectorAll('#ui button')) {
    if (!seen(b)) continue;
    const up = b.parentElement, scope = up.dataset.team !== undefined && !up.id ? ` [data-team="${up.dataset.team}"]` : '';
    const box = b.id ? '' : `#${(up.closest('[id]') || {}).id || '?'}${scope}`;
    const data = Object.entries(b.dataset).map(([k, v]) => `${k}=${v}`).join(' ');
    const label = (b.id ? `#${b.id} "${cut(text(b))}"` : data || `"${cut(text(b), 24)}"`) + (b.classList.contains('on') ? '*' : '') + (b.disabled ? ' (disabled)' : '');
    groups.set(box, [...(groups.get(box) || []), label]);
  }
  for (const [box, labels] of groups) lines.push(`${box || 'buttons'}: ${labels.join(', ')}`);
  const seat = document.querySelector('#pk-track .pk-seat.now');
  if (seat) lines.push(`on clock: step ${seat.dataset.step}, team ${seat.dataset.team}: ${text(seat)}`);
  const chips = [...document.querySelectorAll('#initbar .ichip')];
  if (chips.length) lines.push(`queue: ${chips.map(c => (c.classList.contains('now') ? '>' : '') + text(c)).join(' · ')}`);
  const wait = document.querySelector('#actions .wait');
  if (seen(wait)) lines.push(`actions: ${text(wait)}`);
  const banner = document.querySelector('#banner.show');
  if (banner) lines.push(`banner: ${cut(text(banner), 120)}`);
  const perf = document.querySelector('#perfhud');
  if (perf && text(perf)) lines.push(`perf: ${text(perf)}`);
  return lines.join('\n');
}

(async () => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const { createServer } = await import(require.resolve('vite', { paths: [ROOT] }));
  // The dev server records finished battles; keep a test run's games out of the player's games/games.jsonl.
  process.env.GAMES_FILE = path.join(EVIDENCE, 'games.jsonl');
  // HMR off so edits elsewhere in the repo don't reload the page mid-run.
  const vite = await createServer({ root: ROOT, logLevel: 'error', server: { port: PORT, strictPort: true, hmr: false, watch: null } });
  await vite.listen();
  const url = `http://localhost:${PORT}/${query}`;
  console.log(`drive: pid ${process.pid}, serving ${ROOT} on :${PORT}, evidence ${EVIDENCE}`);

  const browser = await chromium.launch({ executablePath: CHROME, headless: !process.env.HEADED, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], consoleLines = [], steps = [], expected = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { consoleLines.push(`[${m.type()}] ${m.text()}`); if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  let shotN = 0;
  const ctx = {
    page, url, port: PORT, evidence: EVIDENCE, wait,
    log: msg => { steps.push(msg); console.log(`  · ${msg}`); },
    // Full PNG for the record; the returned 960px JPEG is the one to Read (a fraction of the tokens).
    shot: async name => {
      const png = path.join(EVIDENCE, `${String(++shotN).padStart(2, '0')}-${name}.png`), jpg = png.replace(/\.png$/, '.jpg');
      await page.screenshot({ path: png });
      execFileSync('sips', ['-Z', '960', '-s', 'format', 'jpeg', png, '--out', jpg], { stdio: 'ignore' });
      return jpg;
    },
    dump: () => page.evaluate(dumpScreen),
    // null off the game page (gallery.html, or a throw in main.ts before __party is set).
    phase: () => page.evaluate(() => (window.__party ? window.__party.phase() : null)),
    state: () => page.evaluate(() => (window.__party ? window.__party.state() : null)),
    engine: (fn, arg) => page.evaluate(async ([src, a]) => { const L = await import('/src/engine/index.ts'); return new Function('L', 's', 'a', `return (${src})(L, s, a)`)(L, window.__party.state(), a); }, [fn.toString(), arg]),
    until: async (pred, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await pred()) return true; await wait(100); } return false; },
    untilPhase: async (want, ms = 20000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) { if ((await ctx.phase()) === want && (await page.$(ROOT_OF[want]))) return; await wait(100); }
      throw new Error(`phase never became ${want} (is ${await ctx.phase()})`);
    },
    // The camera eases toward whoever acts, so read a tile's screen point only once it stops moving.
    tileXY: async t => {
      let a = await page.evaluate(q => window.__party.tileXY(q.x, q.z), t);
      for (let i = 0; i < 40; i++) {
        await wait(100);
        const b = await page.evaluate(q => window.__party.tileXY(q.x, q.z), t);
        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 1) return b;
        a = b;
      }
      return a;
    },
    // Throws when the tile is off screen or a panel covers it; a unit or wall in front can still swallow the input, so assert the state change.
    hoverTile: async t => {
      const xy = await ctx.tileXY(t);
      const under = await page.evaluate(q => { const e = document.elementFromPoint(q.x, q.y); return e ? e.id || e.className || e.tagName : null; }, xy);
      if (under !== 'board') throw new Error(`tile ${t.x},${t.z} at screen ${xy.x},${xy.y} is under ${under}, not the board canvas`);
      await page.mouse.move(xy.x - 2, xy.y - 2); await page.mouse.move(xy.x, xy.y); await wait(250);
      return xy;
    },
    clickTile: async t => { const xy = await ctx.hoverTile(t); await page.mouse.click(xy.x, xy.y); await wait(250); },
    // Errors matching re don't fail the run; the run fails if none ever comes. For proving an error path.
    expectError: re => { expected.push({ re, seen: 0 }); },
    // The battles the dev server recorded during this run, parsed from <evidence>/games.jsonl.
    games: () => { try { return fs.readFileSync(process.env.GAMES_FILE, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } },
  };

  let summary, failed = false;
  try {
    const run = require(stepsPath);
    // `run.before(ctx)` runs ahead of the first load: page.addInitScript, page.emulateMedia, page.clock.install.
    if (run.before) await run.before(ctx);
    await page.goto(url);
    summary = await run(ctx);
  } catch (err) {
    failed = true;
    summary = err.stack || String(err);
    await ctx.shot('failure').catch(() => {});
  }
  const overlay = await page.evaluate(() => { const b = document.querySelector('#errbox'); return b && !b.classList.contains('hidden') ? b.textContent : ''; }).catch(() => '');
  if (overlay) errors.push(`overlay: ${overlay}`);
  for (const x of expected) {
    for (let i = errors.length - 1; i >= 0; i--) if (x.re.test(errors[i])) { errors.splice(i, 1); x.seen++; }
    if (!x.seen) errors.push(`expected error ${x.re} never came`);
  }
  const pass = !failed && errors.length === 0;
  fs.writeFileSync(path.join(EVIDENCE, 'console.log'), consoleLines.join('\n'));
  fs.writeFileSync(path.join(EVIDENCE, 'result.json'), JSON.stringify({ pass, steps: path.relative(ROOT, stepsPath), url, summary, log: steps, errors, expected: expected.map(x => ({ re: String(x.re), seen: x.seen })) }, null, 2));
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${summary}; errors ${errors.length}`);
  for (const e of errors.slice(0, 20)) console.log(`  ${e}`);
  console.log(`evidence: ${EVIDENCE}`);
  await browser.close();
  await vite.close();
  process.exit(pass ? 0 : 1);
})();
