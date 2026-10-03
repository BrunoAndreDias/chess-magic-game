import { MAPS, MAX_ROUNDS, N, TERRAIN, doomed, threat, threatened, threatName } from '../engine/index';
import type { BattleState, MapId, Pos, TerrainChar, Unit } from '../engine/index';
import type { Highlight } from './board';
import { BIOMES, css } from './biome';
import { h } from './dom';

/** How each map rule reads in the client: what it does, when, and where. Everything comes from `MAPS[id].rule` and the engine's `threat`. */

const pos = (k: number): Pos => ({ x: k % N, z: (k / N) | 0 });
const ruleOf = (s: BattleState) => MAPS[s.map].rule;

/** The first sentence of the rule text, for the compact strip on the setup screen. */
export function ruleLine(id: MapId): string {
  const t = MAPS[id].ruleText, end = t.indexOf('. ');
  return end < 0 ? t : t.slice(0, end + 1);
}

/** Rounds whose end does something to tiles, with the tiles it hits. Crumble only: storm hits every round. */
function crumbleSteps(s: BattleState): { round: number; tiles: Pos[] }[] {
  const out: { round: number; tiles: Pos[] }[] = [];
  for (let r = s.round; r <= MAX_ROUNDS; r++) {
    const tiles = threat(s, r).map(pos);
    if (tiles.length) out.push({ round: r, tiles });
  }
  return out;
}

const list = (ns: readonly number[]) => ns.map(n => n + 1).join(', ');

export interface Step { when: string; what: string }
export function timeline(s: BattleState): Step[] {
  const r = ruleOf(s);
  switch (r.kind) {
    case 'storm': return r.cycle.map((l, i) => ({
      when: `Rounds ${[0, 1, 2].map(k => i + 1 + k * r.cycle.length).join(', ')}…`,
      what: `${l.name}: ${[l.cols ? `columns ${list(l.cols)}` : '', l.rows ? `rows ${list(l.rows)}` : ''].filter(Boolean).join(', ')}`,
    }));
    case 'crumble': return crumbleSteps(s).map(c => ({ when: `End of round ${c.round}`, what: `${r.names[c.round] ?? 'Tiles crumble'}: ${c.tiles.length} tiles` }));
    case 'altar': return [
      { when: 'Every round end', what: 'More characters standing on the altar: +1 favor. A tie scores nothing.' },
      { when: `${r.goal} favor`, what: 'Wins the battle at once.' },
    ];
  }
}

/** What the reveal and scouting show: the first strike line, every tile that will crumble (sooner = stronger), or the altar. */
export function revealLayers(s: BattleState): Highlight[] {
  const r = ruleOf(s);
  switch (r.kind) {
    case 'storm': return [{ tiles: threat(s, 1).map(pos), tone: 'hazard' }];
    case 'crumble': return crumbleSteps(s).map((c, i, all) => ({ tiles: c.tiles, tone: 'hazard', opacity: 1 - (0.6 * i) / Math.max(1, all.length - 1) }));
    case 'altar': return [{ tiles: altarTiles(s), tone: 'altar' }];
  }
}

/** The tiles the map hurts at the end of the shown round; the battle draws it under every other layer. */
export function hazardLayer(s: BattleState): Highlight {
  return { tiles: threat(s).map(pos), tone: 'hazard' };
}

export function altarTiles(s: BattleState): Pos[] {
  return s.terr.flatMap((c, k) => (c === 'A' ? [pos(k)] : []));
}

/** The initiative bar's end-of-round chip, or null when this round's end does nothing. */
export function endChip(s: BattleState): { icon: string; text: string } | null {
  const r = ruleOf(s);
  switch (r.kind) {
    case 'storm': { const name = threatName(s); return name ? { icon: '⚡', text: name } : null; }
    case 'crumble': { const n = threat(s).length; return n ? { icon: '⬇', text: `${n} tiles fall` } : null; }
    case 'altar': return { icon: '☀', text: `Blue ${s.favor[0]} · Red ${s.favor[1]} of ${r.goal}` };
  }
}

/** One line for the round banner: what this round's end will do. */
export function roundHazard(s: BattleState, round: number): string | null {
  const r = ruleOf(s);
  switch (r.kind) {
    case 'storm': { const name = threatName(s, round); return name ? `⚡ Lightning at round end: ${name.toLowerCase()}` : null; }
    case 'crumble': {
      const n = threat(s, round).length;
      return n ? `⬇ ${threatName(s, round) ?? 'The ground crumbles'}: ${n} tiles fall at round end` : null;
    }
    case 'altar': return `☀ Favor ${s.favor[0]}–${s.favor[1]}, first to ${r.goal} wins`;
  }
}

function nextHit(s: BattleState, x: number, z: number): number | null {
  for (let r = s.round; r <= MAX_ROUNDS; r++) if (threatened(s, x, z, r)) return r;
  return null;
}

export function hazardTip(s: BattleState, x: number, z: number): HTMLElement | null {
  const r = ruleOf(s), at = nextHit(s, x, z);
  if (at === null) return null;
  const when = at === s.round ? 'this round' : `round ${at}`;
  switch (r.kind) {
    case 'storm': return h('div', null, h('b', { style: { color: '#e2b8ff' } }, '⚡ Struck'), ` at the end of ${when}: ${r.dmg}, ${Math.round(r.dmg * 1.5)} if Wet.`);
    case 'crumble': return h('div', null, h('b', { style: { color: '#e2b8ff' } }, '⬇ Falls'), ` into the abyss at the end of ${when}.`);
    case 'altar': return null;
  }
}

export function doomTip(s: BattleState, u: Unit): HTMLElement | null {
  if (!doomed(s, u)) return null;
  return h('div', { style: { color: '#e2b8ff' } }, ruleOf(s).kind === 'crumble' ? "⬇ Can't escape: this tile falls this round." : "⚡ Can't escape the strike this round.");
}

const LEGEND: Partial<Record<TerrainChar, (s: BattleState) => string>> = {
  '#': s => css(BIOMES[s.map].wall), o: () => '#05030a', '~': s => css(BIOMES[s.map].water), G: s => css(BIOMES[s.map].grass),
  '^': s => css(BIOMES[s.map].high[0]), B: () => '#ff7a2a', '+': () => '#7ee081', A: () => '#ffd36b', I: () => '#cff4ff',
};

/** A swatch per terrain present on the map, with its rule text. */
export function legend(s: BattleState): HTMLElement {
  const used = new Set(s.terr);
  return h('div', { class: 'legend' }, (Object.keys(LEGEND) as TerrainChar[]).filter(c => used.has(c)).map(c =>
    h('div', null, h('i', { style: { background: LEGEND[c]?.(s) ?? '#000' } }), h('span', null, h('b', null, TERRAIN[c].name), `: ${TERRAIN[c].text ?? ''}`))));
}
