import { MAPS, createBattle, mulberry32 } from '../../engine/index';
import type { MapRule } from '../../engine/index';
import type { Ctx, Mounted } from '../app';
import type { TileInput } from '../board';
import { h } from '../dom';
import type { Draft } from '../draft';
import { legend, revealLayers, timeline } from '../rules';
import { terrainTip } from '../tips';
import { hideTip, showTip } from '../tooltip';

const HINT: Readonly<Record<MapRule['kind'], string>> = {
  storm: 'Violet stripes: the first lightning strike, at the end of round 1.',
  crumble: 'Violet stripes: tiles that will fall. The brighter, the sooner.',
  altar: 'Gold: the Sun Altar.',
};

/** The drawn battlefield, before anyone forms a party: what the map does, when and where, over the live board. */
export function mountMap(ctx: Ctx, draft: Draft): Mounted {
  const M = MAPS[draft.map], s = createBattle({ map: draft.map, starter: 0, teams: [[], []] }, mulberry32(ctx.seed));
  ctx.board.load(s);
  ctx.board.focus(null, 0);
  ctx.board.highlight(revealLayers(s));

  const panel = h('div', { id: 'mapview', class: 'side' },
    h('div', null, h('div', { class: 'tag' }, 'Battlefield drawn'), h('h2', { id: 'mp-name' }, M.name), h('div', { class: 'm' }, M.tagline)),
    h('p', { class: 'rule' }, M.ruleText),
    h('ol', { class: 'tl', id: 'mp-timeline' }, timeline(s).map(step => h('li', null, h('b', null, step.when), h('span', null, step.what)))),
    h('div', { class: 'mapdesc' }, h('b', null, 'Plays well for: '), M.favors),
    legend(s),
    h('div', { class: 'scout-ready' }, h('button', { class: 'btn primary', id: 'mp-go', onclick: () => ctx.go({ kind: 'setup', draft }) }, 'Form your parties →')));
  const hint = h('div', { id: 'hintbar' }, HINT[M.rule.kind], ' Hover a tile to read it.');
  ctx.ui.append(panel, hint);

  function tile(input: TileInput): void {
    if (input.kind !== 'hover') return;
    if (input.tile) showTip(terrainTip(s, input.tile.x, input.tile.z)); else hideTip();
  }

  return { phase: () => 'map', state: () => null, tile, dispose: () => { hideTip(); panel.remove(); hint.remove(); } };
}
