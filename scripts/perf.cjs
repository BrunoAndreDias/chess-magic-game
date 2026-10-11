#!/usr/bin/env node
// Frame cost of an all-AI battle per map: a production build in Chromium on this machine's GPU at a Retina pixel ratio, compared with perf/baseline.json.
// Usage: npm run perf [-- --save] [-- --runs N --secs S]   env PORT (default 5299), MAPS (default span,storm,altar), SEED (default 7)
// --save writes the medians over the runs to perf/baseline.json, so `git log -p perf/baseline.json` is the history.
// Exits 1 when a scene count (draw calls, triangles, shader programs) grew past the baseline; times swing with machine load and only print.
const fs = require('node:fs');

const os = require('node:os');

const path = require('node:path');

const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

const { chromium } = require(require.resolve('playwright-core', { paths: [ROOT] }));

const CHROME = process.env.CHROME || path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');

const PORT = Number(process.env.PORT || 5299);

const MAPS = (process.env.MAPS || 'span,storm,altar').split(',');

const SEED = Number(process.env.SEED || 7);

const BASELINE = path.join(ROOT, 'perf/baseline.json');

const arg = (name, def) => { const i = process.argv.indexOf(name); return i < 0 ? def : Number(process.argv[i + 1]); };

const RUNS = arg('--runs', 3), SECS = arg('--secs', 20), SAVE = process.argv.includes('--save');

const GATED = ['calls', 'tris', 'programs'];

const SLACK = 1.05;

const wait = ms => new Promise(r => setTimeout(r, ms));

const median = xs => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function measure(browser, url, map) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${url}/?ai&quick&map=${map}&seed=${SEED}`);
  await page.waitForFunction(() => window.__party?.phase() === 'battle', null, { timeout: 30000 });
  await wait(1500);
  const logLines = () => page.evaluate(() => document.querySelectorAll('#log div').length);
  const before = await logLines();
  await page.evaluate(() => window.__party.board.perfReset(true));
  await wait(SECS * 1000);
  const r = await page.evaluate(() => window.__party.board.perf()), played = (await logLines()) - before;
  await page.close();

  if (errors.length) throw new Error(`${map}: page errors: ${errors.slice(0, 3).join(' | ')}`);

  if (r.frames < SECS * 30) throw new Error(`${map}: ${r.frames} frames in ${SECS}s; the page was not animating`);

  if (played < 5) throw new Error(`${map}: ${played} log lines in ${SECS}s; the battle was not playing`);

  return r;
}

function summarize(runs) {
  const at = f => median(runs.map(f));

  return {
    fps: at(r => r.fps), workP50: at(r => r.work.p50), workP95: at(r => r.work.p95), gapP95: at(r => r.gap.p95), janks: at(r => r.janks),
    calls: at(r => r.calls), tris: at(r => r.tris), programs: at(r => r.programs), textures: at(r => r.textures), geometries: at(r => r.geometries),
  };
}

async function gpuName(browser) {
  const p = await browser.newPage();

  const name = await p.evaluate(() => {
    const g = document.createElement('canvas').getContext('webgl2'), e = g.getExtension('WEBGL_debug_renderer_info');

    return g.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : g.RENDERER);
  });

  await p.close();

  return name;
}

(async () => {
  execFileSync('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: ROOT, stdio: 'inherit' });
  const { preview } = await import(require.resolve('vite', { paths: [ROOT] }));
  const server = await preview({ root: ROOT, logLevel: 'error', preview: { port: PORT, strictPort: true } });
  const browser = await chromium.launch({ executablePath: CHROME, headless: !process.env.HEADED });
  const gpu = await gpuName(browser);
  console.log(`perf: ${RUNS} run(s) x ${SECS}s per map, seed ${SEED}, ${gpu}, load ${os.loadavg().map(x => x.toFixed(1)).join(' ')} on ${os.cpus().length} cores`);

  const raw = Object.fromEntries(MAPS.map(m => [m, []]));

  // Maps interleave so machine drift lands on all of them alike.
  for (let i = 0; i < RUNS; i++) for (const m of MAPS) {
    const r = await measure(browser, `http://localhost:${PORT}`, m);
    raw[m].push(r);
    console.log(`  ${m} ${i + 1}: ${r.fps} fps, work p50 ${r.work.p50} p95 ${r.work.p95} ms, ${r.janks} janks in ${r.frames} frames, ${r.calls} calls, ${r.tris} tris`);
  }

  await browser.close();
  await new Promise(r => server.httpServer.close(r));

  const now = Object.fromEntries(MAPS.map(m => [m, summarize(raw[m])]));
  const saved = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
  const rows = [], worse = [];

  for (const m of MAPS) for (const [k, v] of Object.entries(now[m])) {
    const b = saved?.maps[m]?.[k];
    rows.push({ map: m, metric: k, now: v, baseline: b ?? '-', change: b ? `${v >= b ? '+' : ''}${(100 * (v - b) / b).toFixed(1)}%` : '-' });

    if (GATED.includes(k) && b !== undefined && v > b * SLACK) worse.push(`${m} ${k} ${b} -> ${v}`);
  }

  console.table(rows);

  if (saved && saved.gpu !== gpu) console.log(`baseline times came from ${saved.gpu}; compare counts only`);

  if (SAVE) {
    fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
    fs.writeFileSync(BASELINE, `${JSON.stringify({ gpu, seed: SEED, secs: SECS, runs: RUNS, maps: now }, null, 2)}\n`);
    console.log(`saved ${path.relative(ROOT, BASELINE)}`);
  } else if (worse.length) {
    console.log(`WORSE than baseline: ${worse.join(', ')}`);
    process.exit(1);
  }
})().catch(e => { console.error(e); process.exit(1); });
