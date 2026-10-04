import { MAPS, MAX_ROUNDS } from '../../engine/index';
import type { BattleState } from '../../engine/index';
import type { Ctx, Mounted } from '../app';
import { h } from '../dom';
import { drawMap, drawStarter } from '../draft';
import type { Draft } from '../draft';
import { REASON, winnerTitle } from '../format';
import { TEAM_COLOR, TEAM_NAME } from '../theme';

export function mountResult(ctx: Ctx, draft: Draft, final: BattleState): Mounted {
  if (final.phase.kind !== 'over') throw new Error('result screen needs a finished battle');
  const { winner, reason } = final.phase, st = final.stats;

  const row = (label: string, v: readonly [number, number]) => h('tr', null, h('th', null, label),
    v.map((n, t) => h('td', { class: n > (v[1 - t] ?? 0) ? 'win' : '' }, n)));

  const root = h('div', { id: 'result', class: 'screen' }, h('div', { class: 'rbox' },
    h('div', { class: 'tag', id: 'res-tag' }, `${MAPS[final.map].name} · battle over`),
    h('h1', { id: 'res-title', style: { color: winner === 'draw' ? '#ece2cf' : TEAM_COLOR[winner] } }, winnerTitle(winner)),
    h('p', { id: 'res-why' }, `${REASON[reason]} After ${Math.min(final.round, MAX_ROUNDS)} round${final.round === 1 ? '' : 's'}.`),
    h('table', { class: 'stats' },
      h('tr', null, h('th'), h('th', { style: { color: TEAM_COLOR[0] } }, TEAM_NAME[0]), h('th', { style: { color: TEAM_COLOR[1] } }, TEAM_NAME[1])),
      row('Damage dealt', st.dmg), row('Healing', st.heal), row('Enemies downed', st.downs), row('Revives', st.revives), row('Combos', final.combos)),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', id: 'res-again', onclick: () => ctx.go({ kind: 'scout', draft }) }, 'Rematch'),
      h('button', { class: 'btn', id: 'res-party', onclick: () => ctx.go({ kind: 'picks', draft: { ...draft, starter: drawStarter(Math.random) } }) }, 'Change parties'),
      h('button', { class: 'btn', id: 'res-map', onclick: () => ctx.go({ kind: 'map', draft: { ...draft, map: drawMap(Math.random, draft.map), starter: drawStarter(Math.random) } }) }, 'New battlefield'))));

  ctx.ui.append(root);

  return { phase: () => 'result', state: () => final, dispose: () => root.remove() };
}
