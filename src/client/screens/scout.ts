import { CLASSES, MAPS, N, TERRAIN, aiDeploy, canDeploy, createBattle, inDeploy, mulberry32, terrAt } from '../../engine/index';
import type { BattleState, Pos, Team } from '../../engine/index';
import { Match } from '../../host/match';
import type { Ctx, Mounted } from '../app';
import type { TileInput } from '../board';
import { h } from '../dom';
import { battleSetup, clock, humanTeams, seats } from '../draft';
import type { Draft } from '../draft';
import { legend, revealLayers } from '../rules';
import { TEAM_COLOR, TEAM_NAME, other } from '../theme';
import { terrainTip, unitTip } from '../tips';
import { hideTip, showTip } from '../tooltip';

function same(a: Pos, b: Pos): boolean { return a.x === b.x && a.z === b.z; }

/**
 * Timed scouting, one human team at a time (Blue first). `base` is a throwaway battle used only to show terrain
 * and the AI's suggested tiles; the real battle starts from the picks once every human team is Ready.
 */
export function mountScout(ctx: Ctx, draft: Draft): Mounted {
  const base = createBattle(battleSetup(draft, null), mulberry32(ctx.seed ^ 0xdeb10));
  const posOf = (t: Team): Pos[] => base.units.flatMap(u => (u.team === t && u.owner === undefined ? [{ x: u.x, z: u.z }] : []));
  const picks: [Pos[], Pos[]] = [posOf(0), posOf(1)];
  const queue = humanTeams(draft);
  let team: Team = 0, sel = 0, deadline: number | null = null, hover: Pos | null = null;

  const panel = h('div', { id: 'scout' }), hint = h('div', { id: 'hintbar' });
  ctx.ui.append(panel, hint);
  const tick = setInterval(renderTimer, 200);

  function preview(): BattleState {
    // Dolls stand next to their Marionettists once the battle begins; scouting places characters only.
    const units = base.units.filter(u => u.owner === undefined && (u.team === team || team === 1)).map(u => {
      const p = picks[u.team][u.slot] ?? u;

      return { ...u, x: p.x, z: p.z };
    });

    return { ...base, units };
  }

  function slotAt(t: Team, p: Pos): number { return picks[t].findIndex(q => same(q, p)); }

  function next(): void {
    const t = queue.shift();

    if (t === undefined) { begin(); return; }

    team = t; sel = 0;
    deadline = draft.timer ? performance.now() + draft.timer * 1000 : null;
    ctx.board.load(preview());
    ctx.board.focus(null, team);
    render();
  }

  function begin(): void {
    clearInterval(tick);
    const match = new Match(battleSetup(draft, [picks[0], picks[1]]), seats(draft), ctx.seed);
    ctx.go({ kind: 'battle', draft, match });
  }

  function highlight(): void {
    const zone: Pos[] = [];

    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) if (canDeploy(base, team, x, z)) zone.push({ x, z });
    const p = picks[team][sel];
    ctx.board.highlight([
      ...revealLayers(base),
      { tiles: zone, tone: 'deploy' },
      ...(hover && canDeploy(base, team, hover.x, hover.z) ? [{ tiles: [hover], tone: 'path' as const }] : []),
      ...(p ? [{ tiles: [p], tone: 'selected' as const }] : []),
    ]);
  }

  function renderTimer(): void {
    const el = panel.querySelector('.timer');

    if (!el) return;

    if (deadline === null) { el.textContent = '∞'; return; }

    const left = Math.max(0, (deadline - performance.now()) / 1000);
    el.textContent = clock(left);
    el.classList.toggle('low', left < 8);

    if (left <= 0) { deadline = null; next(); }
  }

  function render(): void {
    const M = MAPS[draft.map];
    const mine = base.units.filter(u => u.team === team && u.owner === undefined);
    panel.replaceChildren(
      h('div', null, h('div', { class: 'tag', style: { color: TEAM_COLOR[team] } }, `${M.name} · scout & deploy`), h('h2', null, `${TEAM_NAME[team]}: read the map, place your party`)),
      h('div', { class: 'timer', id: 'sc-timer' }),
      h('div', { class: 'm', style: { 'font-size': '12.5px' } }, 'Click one of your characters, then a gold tile. ',
        team === 0 ? 'The Red party deploys after you. ' : 'You deploy seeing the Blue party. ',
        team === draft.starter ? 'You open and close every round.' : `The ${TEAM_NAME[other(team)]} opens and closes every round.`),
      h('div', { id: 'sc-units' }, mine.map(u => {
        const p = picks[team][u.slot] ?? u, C = CLASSES[u.cls];

        return h('button', { class: `du${u.slot === sel ? ' on' : ''}`, style: { '--tc': TEAM_COLOR[team] }, data: { slot: String(u.slot) }, onclick: () => { sel = u.slot; render(); } },
          h('b', null, u.name), ' ', h('span', null, `${C.icon} ${C.name} · on ${TERRAIN[terrAt(base, p.x, p.z)].name.toLowerCase()}`));
      })),
      h('div', null, h('button', { class: 'btn', id: 'sc-auto', onclick: auto }, '✨ Auto-deploy')),
      h('div', { class: 'mapdesc', id: 'sc-rule' }, h('b', null, `${M.name}.`), ` ${M.ruleText}`),
      legend(base),
      h('div', { class: 'scout-ready' }, h('button', { class: 'btn primary', id: 'sc-ready', onclick: next }, 'Ready')));
    hint.replaceChildren(h('b', null, TEAM_NAME[team]), ': click a character, then a ', h('b', null, 'gold tile'), '. Hover tiles to read the terrain.');
    renderTimer();
    highlight();
  }

  function auto(): void {
    const members = draft.teams[team];
    picks[team] = aiDeploy(base, team, members, mulberry32((ctx.seed + performance.now()) | 0));
    ctx.board.load(preview());
    render();
  }

  function place(t: Pos): void {
    const own = slotAt(team, t);

    if (own >= 0) { sel = own; render(); return; }

    if (!canDeploy(base, team, t.x, t.z)) return;
    picks[team][sel] = { x: t.x, z: t.z };
    sel = (sel + 1) % picks[team].length;
    ctx.board.load(preview());
    render();
  }

  function tile(input: TileInput): void {
    if (input.kind === 'click') { if (input.button === 'left') place(input.tile); return; }

    hover = input.tile;
    highlight();

    if (!hover) { hideTip(); return; }

    const s = preview(), u = s.units.find(o => same(o, hover ?? o));
    const zone = inDeploy(team, hover.x, hover.z) ? h('div', { class: 'm' }, 'Deploy zone.') : null;

    if (u) showTip(unitTip(s, u, draft.teams[u.team][u.slot]?.human ?? false), h('div', { style: { 'margin-top': '4px' } }, terrainTip(s, hover.x, hover.z)), zone);
    else showTip(terrainTip(s, hover.x, hover.z), zone);
  }

  if (!queue.length) {
    queueMicrotask(begin);
  } else next();

  return {
    phase: () => 'scout',
    state: () => preview(),
    tile,
    dispose: () => { clearInterval(tick); hideTip(); panel.remove(); hint.remove(); },
  };
}
