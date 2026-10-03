// Plays one battle through the real UI in headless Chromium: map reveal → setup → scout → order → every Blue turn by clicks and hotkeys → result → Rematch.
// Blue's moves are chosen by the engine AI (aiTurn) and performed through the HUD. Exits non-zero on any page error or if no result is reached.
// ALL_AI=1 instead spectates an all-AI battle (?ai&quick) to the result screen, then draws a New battlefield.
// Env: PLAYWRIGHT_CORE (module path), CHROME (browser binary), SHOTS (screenshot dir), MAP, SEED, PORT.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
const CHROME = process.env.CHROME || '/Users/brunodias/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const SHOTS = process.env.SHOTS || path.join(os.tmpdir(), 'party-playtest');
const MAP = process.env.MAP || 'span';
const SEED = process.env.SEED || '7';
const PORT = process.env.PORT || '5199';
const ROOT = path.join(__dirname, '..');

const wait = ms => new Promise(r => setTimeout(r, ms));

// HMR is off so edits elsewhere in the repo during a run don't reload the page mid-battle.
async function serve() {
  const { createServer } = await import('vite');
  const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: Number(PORT), strictPort: true, hmr: false, watch: null } });
  await server.listen();
  return server;
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const vite = await serve();
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  p.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

  const missed = [];
  const stats = { orbits: 0, moves: 0, casts: 0, misses: 0, previews: 0 };
  const shot = name => p.screenshot({ path: path.join(SHOTS, `hud-${name}.png`) });
  const phase = () => p.evaluate(() => window.__party.phase());
  const until = async (fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(100); } return false; };

  // The camera eases toward whoever acts, so a tile's screen position is only usable once it stops moving.
  const tileXY = async t => {
    let a = await p.evaluate(q => window.__party.tileXY(q.x, q.z), t);
    for (let i = 0; i < 40; i++) {
      await wait(100);
      const b = await p.evaluate(q => window.__party.tileXY(q.x, q.z), t);
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 1) return b;
      a = b;
    }
    return a;
  };
  const snapshot = () => p.evaluate(() => {
    const s = window.__party.state(), ph = s.phase, id = ph.kind === 'act' ? ph.queue[ph.qi] : null, u = s.units.find(o => o.id === id);
    return JSON.stringify([s.round, ph.kind, id, u && [u.x, u.z, u.moved, u.acted], document.querySelector('#endturn').disabled]);
  });
  const under = async t => { const xy = await tileXY(t); return p.evaluate(q => { const e = document.elementFromPoint(q.x, q.y); return e ? e.id || e.className || e.tagName : null; }, xy); };

  // A unit or a wall nearer the camera can cover a tile's centre, so try a few points inside the tile, as a player would.
  const OFFSETS = [[0, 0], [0, -12], [0, -24], [0, -36], [-10, -6], [10, -6], [0, 9]];
  const clickFromHere = async (t, preview, before) => {
    const xy = await tileXY(t);
    for (const [dx, dy] of OFFSETS) {
      await p.mouse.move(xy.x + dx - 2, xy.y + dy - 2);
      await p.mouse.move(xy.x + dx, xy.y + dy);
      await wait(150);
      if (preview && stats.previews < 2 && (await p.$eval('#tooltip', el => el.style.display === 'block' && !!el.querySelector('.tt')))) {
        await shot(`06-target-preview-${stats.previews}`);
        stats.previews++;
      }
      await p.mouse.click(xy.x + dx, xy.y + dy);
      await wait(250);
      if ((await snapshot()) !== before) return true;
    }
    return false;
  };
  // Right-drag orbits the camera, the way a player looks around a wall.
  const orbit = async () => {
    await p.mouse.move(720, 300);
    await p.mouse.down({ button: 'right' });
    for (let i = 1; i <= 10; i++) await p.mouse.move(720 + i * 24, 300);
    await p.mouse.up({ button: 'right' });
  };
  const clickTile = async (t, preview) => {
    const before = await snapshot();
    for (let view = 0; view < 3; view++) {
      if (view) { stats.orbits++; await orbit(); }
      if (await clickFromHere(t, preview, before)) return true;
    }
    return false;
  };

  // The board flashes each round-end rule event for well under a second, so a watcher shoots the moment its log line appears.
  const RULE_LINE = /Lightning strikes|The ground gives way|holds the altar/;
  let watching = true;
  const ruleShots = [];
  const watchRuleEvents = async () => {
    while (watching && ruleShots.length < 2) {
      const n = await p.evaluate(re => [...document.querySelectorAll('#log div')].filter(d => new RegExp(re).test(d.textContent)).length, RULE_LINE.source).catch(() => 0);
      if (n > ruleShots.length) {
        await wait(120);
        ruleShots.push(await shot(`09-round-end-${ruleShots.length}`));
      }
      await wait(60);
    }
  };

  async function spectate() {
    await p.goto(`http://localhost:${PORT}/?ai&quick&map=${MAP}&seed=${SEED}`);
    const watcher = watchRuleEvents();
    if (!(await until(async () => (await phase()) === 'result', 15 * 60000))) throw new Error(`no result screen (phase ${await phase()})`);
    watching = false;
    await watcher;
    await wait(500);
    await shot('ai-result');
    const fin = await p.evaluate(() => ({ round: window.__party.state().round, title: document.querySelector('#res-title')?.textContent, why: document.querySelector('#res-why')?.textContent, map: window.__party.state().map }));
    await p.click('#res-map');
    if (!(await until(async () => (await phase()) === 'map'))) throw new Error('New battlefield did not open the map screen');
    await wait(800);
    await shot('ai-new-map');
    const next = await p.textContent('#mp-name');
    return `all-AI battle on ${fin.map} "${fin.title}" after round ${fin.round} (${fin.why}); rule shots ${ruleShots.length}; New battlefield drew ${next}`;
  }

  async function setupAndScout() {
    await p.goto(`http://localhost:${PORT}/?map=${MAP}&seed=${SEED}`);
    if (!(await until(async () => (await phase()) === 'map'))) throw new Error('no map screen');
    await wait(1200);
    await shot('00-map');
    mapName = await p.textContent('#mp-name');
    await p.click('#mp-go');
    if (!(await until(async () => (await phase()) === 'setup'))) throw new Error('Form your parties did not open setup');
    await wait(800);
    await shot('01-setup');
    const strip = await p.textContent('#su-mapinfo');
    if (!strip.includes(mapName)) throw new Error(`setup strip does not name ${mapName}: ${strip}`);
    await p.click('.ccard[data-cls="rogue"]');
    await p.click('.ccard[data-cls="warden"]');
    await p.click('#su-teams .pslot[data-team="0"][data-slot="1"]');
    await wait(600);
    const figure = await p.$eval('#su-teams .pslot[data-slot="0"]', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y - 50 }; });
    await p.mouse.click(figure.x, figure.y);
    await wait(600);
    const picked = await p.$eval('#su-teams .pslot.on', e => e.dataset.slot);
    if (picked !== '0') throw new Error(`clicking a character in the lineup selected slot ${picked}, not 0`);
    await p.evaluate(() => document.querySelector('.treewrap').scrollIntoView());
    await wait(200);
    await shot('02-setup-tree');
    await p.click('#su-start');

    if (!(await until(async () => (await phase()) === 'scout'))) throw new Error('no scout screen');
    await wait(1200);
    const free = await p.evaluate(async () => {
      const L = await import('/src/engine/index.ts');
      const s = window.__party.state();
      for (let z = 0; z < 12; z++) for (let x = 0; x < 12; x++) if (L.canDeploy(s, 0, x, z) && !L.unitAt(s, x, z)) return { x, z };
      return null;
    });
    if (free) {
      await p.click('#sc-units .du[data-slot="0"]');
      const xy = await tileXY(free);
      await p.mouse.move(xy.x, xy.y);
      await wait(300);
      await shot('03-scout');
      await p.mouse.click(xy.x, xy.y);
      await wait(300);
    }
    await p.click('#sc-ready');
  }

  let mapName = '';
  async function playBlue() {
    await setupAndScout();
    const watcher = watchRuleEvents();
    let orderShot = false, battleShot = false, midShot = false, hazardShot = false, k = 0;
    const turns = new Set();
    for (let iter = 0; iter < 4000; iter++) {
      const ph = await phase();
      if (ph === 'result') break;
      if (ph === 'order') {
        if (!(await p.$('#orderpanel:not(.hidden) #op-ai'))) { await wait(100); continue; }
        if (!orderShot) { await wait(400); await shot('04-order'); orderShot = true; }
        await p.click('#op-ai');
        await until(async () => (await phase()) !== 'order', 3000);
        continue;
      }
      if (!(await p.evaluate(() => !document.querySelector('#endturn')?.disabled))) { await wait(150); continue; }
      const plan = await p.evaluate(async seed => {
        const L = await import('/src/engine/index.ts');
        const s = window.__party.state(), u = L.current(s);
        const [cmd] = L.aiTurn(s, L.mulberry32(seed));
        if (!u || !cmd) return null;
        return { cmd, unit: u.id, round: s.round, slot: cmd.kind === 'cast' ? L.actionsOf(u).indexOf(cmd.skill) + 1 : 0 };
      }, ++k);
      if (!plan) { await wait(150); continue; }
      if (!battleShot) { await shot('05-battle'); battleShot = true; }
      if (!hazardShot && (await p.$('#ib-hazard'))) { await shot('05-hazard'); hazardShot = true; }
      if (!midShot && plan.round >= 4) { await shot('07-battle-mid'); midShot = true; }
      turns.add(`${plan.round}:${plan.unit}`);
      const { cmd } = plan;
      if (cmd.kind === 'move' || cmd.kind === 'cast') {
        if (cmd.kind === 'cast') { await p.keyboard.press(String(plan.slot)); await wait(120); }
        const at = cmd.kind === 'move' ? cmd.to : cmd.at;
        if (await clickTile(at, cmd.kind === 'cast')) stats[cmd.kind === 'move' ? 'moves' : 'casts']++;
        else { stats.misses++; missed.push({ cmd, under: await under(at) }); await p.keyboard.press('Escape'); await p.keyboard.press(' '); }
      } else if (cmd.kind === 'endTurn') {
        // A unit with nothing left ends its turn by itself; only press Space if it is still waiting.
        await wait(700);
        const still = await p.evaluate(id => {
          const s = window.__party.state();
          return s.phase.kind === 'act' && s.phase.queue[s.phase.qi] === id && !document.querySelector('#endturn').disabled;
        }, plan.unit);
        if (still) await p.keyboard.press(' ');
      }
      await wait(250);
    }
    if (!(await until(async () => (await phase()) === 'result', 30000))) throw new Error(`no result screen (phase ${await phase()})`);
    watching = false;
    await watcher;
    await wait(500);
    await shot('08-result');
    const fin = await p.evaluate(() => { const s = window.__party.state(); return { phase: s.phase, round: s.round, combos: s.combos, title: document.querySelector('#res-title')?.textContent }; });
    await p.click('#res-again');
    if (!(await until(async () => (await phase()) === 'scout'))) errors.push('Rematch did not reopen scouting');
    return `${mapName}: "${fin.title}" after round ${fin.round}, winner ${fin.phase.winner} (${fin.phase.reason}), combos ${fin.combos.join('/')}; `
      + `blue turns ${turns.size}, moves ${stats.moves}, casts ${stats.casts}, camera orbits ${stats.orbits}, misses ${stats.misses}; hazard chip ${hazardShot ? 'seen' : 'never'}, rule shots ${ruleShots.length}`;
  }

  let summary, failed = false;
  try {
    summary = await (process.env.ALL_AI ? spectate() : playBlue());
  } catch (err) {
    failed = true;
    summary = err.message;
    await shot('99-failure').catch(() => {});
  }
  const overlay = await p.evaluate(() => { const b = document.querySelector('#errbox'); return b && !b.classList.contains('hidden') ? b.textContent : ''; }).catch(() => '');
  if (overlay) errors.push(`overlay: ${overlay}`);
  const pass = !failed && errors.length === 0;
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${summary}; errors ${errors.length}`);
  if (missed.length) console.log(`  missed: ${JSON.stringify(missed.slice(0, 8))}`);
  for (const e of errors.slice(0, 20)) console.log(`  ${e}`);
  await browser.close();
  await vite.close();
  process.exit(pass ? 0 : 1);
})();
