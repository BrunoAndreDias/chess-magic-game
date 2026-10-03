import { idx, isAlive, standing } from './board';
import { checkWinner, damage, down } from './combat';
import { MAPS, N, TERRAIN, mirrored } from './tables';
import type { MapRule } from './tables';
import type { BattleEvent, BattleState, MapId, Pos, Unit } from './types';

type RuleOf<K extends MapRule['kind']> = Extract<MapRule, { kind: K }>;
interface RuleImpl<R extends MapRule> {
  /** Tile `k` hurts at the end of `round`. */
  hits(s: BattleState, r: R, round: number, k: number): boolean;
  name(r: R, round: number): string | null;
  /** The HP a unit loses to it on a hit tile; Infinity when it falls. */
  toll(r: R, u: Unit): number;
  end(s: BattleState, r: R, ev: BattleEvent[]): void;
}

const pos = (k: number): Pos => ({ x: k % N, z: (k / N) | 0 });
const strikeOf = (r: RuleOf<'storm'>, round: number) => r.cycle[(round - 1) % r.cycle.length];

const crumbleCache = new Map<MapId, number[]>();
function crumbleRounds(map: MapId, r: RuleOf<'crumble'>): number[] {
  let out = crumbleCache.get(map);
  if (!out) { out = mirrored(r.rounds).map(c => (c === '.' ? 0 : Number(c))); crumbleCache.set(map, out); }
  return out;
}

/** A map event hits everyone at once: if it fells both parties' last characters, that is a draw, not a win for whoever it reached second. */
export function atOnce(s: BattleState, f: () => void): void {
  const before = s.phase;
  f();
  if (before.kind !== 'over' && s.phase.kind === 'over') { s.phase = before; checkWinner(s); }
}

const RULES: { [K in MapRule['kind']]: RuleImpl<RuleOf<K>> } = {
  crumble: {
    hits: (s, r, round, k) => crumbleRounds(s.map, r)[k] === round && !TERRAIN[s.terr[k] ?? '#'].solid,
    name: (r, round) => r.names[round] ?? null,
    toll: () => Infinity,
    end(s, r, ev) {
      const rounds = crumbleRounds(s.map, r), fell = new Set<number>();
      rounds.forEach((rd, k) => {
        if (rd !== s.round || s.terr[k] === 'o') return;
        s.terr[k] = 'o'; s.fx[k] = undefined; fell.add(k);
      });
      if (!fell.size) return;
      ev.push({ type: 'crumble', tiles: [...fell].map(pos) });
      atOnce(s, () => {
        for (const u of s.units) {
          if (!isAlive(u) || u.under || !fell.has(idx(u.x, u.z))) continue;
          if (standing(u)) { ev.push({ type: 'fall', id: u.id, x: u.x, z: u.z }); down(s, u, ev, null); continue; }
          u.life = { kind: 'dead' };
          ev.push({ type: 'death', id: u.id, team: u.team, cause: 'fell' });
          checkWinner(s);
        }
      });
    },
  },
  storm: {
    hits(_s, r, round, k) {
      const line = strikeOf(r, round), p = pos(k);
      return !!(line?.cols?.includes(p.x) || line?.rows?.includes(p.z));
    },
    name: (r, round) => strikeOf(r, round)?.name ?? null,
    toll: (r, u) => Math.round(r.dmg * (u.st.wet ? 1.5 : 1)),
    end(s, r, ev) {
      const line = strikeOf(r, s.round);
      if (!line) return;
      const tiles = threat(s);
      ev.push({ type: 'storm', line: line.name, tiles: tiles.map(pos) });
      const struck = new Set(tiles);
      atOnce(s, () => {
        for (const u of s.units) if (isAlive(u) && struck.has(idx(u.x, u.z))) damage(s, u, standing(u) ? RULES.storm.toll(r, u) : 1, ev, 'storm', null);
      });
    },
  },
  altar: {
    hits: () => false,
    name: () => null,
    toll: () => 0,
    end(s, r, ev) {
      const n = [0, 0];
      for (const u of s.units) if (standing(u) && !u.under && s.terr[idx(u.x, u.z)] === 'A') n[u.team] = (n[u.team] ?? 0) + 1;
      const [a = 0, b = 0] = n, team = a > b ? 0 : b > a ? 1 : null;
      if (team !== null) s.favor[team]++;
      ev.push({ type: 'favor', team, favor: [s.favor[0], s.favor[1]] });
      if (team !== null && s.favor[team] >= r.goal) s.phase = { kind: 'over', winner: team, reason: 'altar' };
    },
  },
};

function ruleOf(s: BattleState): [MapRule, RuleImpl<MapRule>] {
  const r = MAPS[s.map].rule;
  return [r, RULES[r.kind] as RuleImpl<MapRule>];
}

/** Tile indices the map hurts at the end of `round`, for the AI and for telegraphing. */
export function threat(s: BattleState, round = s.round): number[] {
  const [r, f] = ruleOf(s), out: number[] = [];
  for (let k = 0; k < N * N; k++) if (f.hits(s, r, round, k)) out.push(k);
  return out;
}
export function threatened(s: BattleState, x: number, z: number, round = s.round): boolean {
  const [r, f] = ruleOf(s);
  return f.hits(s, r, round, idx(x, z));
}
/** What the map does at the end of `round`, e.g. "The midline". Null when it does nothing to tiles. */
export function threatName(s: BattleState, round = s.round): string | null {
  const [r, f] = ruleOf(s);
  return threat(s, round).length ? f.name(r, round) : null;
}
/** The HP `u` would lose standing on a threatened tile; Infinity when it would fall. */
export function toll(s: BattleState, u: Unit): number {
  const [r, f] = ruleOf(s);
  return f.toll(r, u);
}

/** On a tile that hurts this round and unable to leave it before the round ends. */
export function doomed(s: BattleState, u: Unit): boolean {
  if (!isAlive(u) || u.under || !threatened(s, u.x, u.z)) return false;
  if (!standing(u) || u.st.root || u.st.stun) return true;
  const ph = s.phase;
  if (ph.kind !== 'act') return false;
  const i = ph.queue.indexOf(u.id);
  return (i >= 0 && i < ph.qi) || (i === ph.qi && u.moved);
}

/** Applies the map's rule; runs first at the end of every round. */
export function endOfRound(s: BattleState, ev: BattleEvent[]): void {
  const [r, f] = ruleOf(s);
  f.end(s, r, ev);
}
