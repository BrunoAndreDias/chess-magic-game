import {
  CLASSES, DEPLOY_ROWS, DIR4, GRASS_SIGHT, HARVEST_RANGE, HASTE_MOVE, HIGH_GROUND, N, PAIR_N, SKILLS, SOULS, STATUS, TERRAIN, UNDYING_MOVE, isCall,
} from './tables';
import type { BasicSkillId, BattleState, Phase, Pos, SkillId, Soul, StatusKey, Statuses, Team, TerrainChar, Unit, UnitId } from './types';

export interface Target extends Pos { id?: UnitId }

export function idx(x: number, z: number): number { return z * N + x; }

export function inb(x: number, z: number): boolean { return x >= 0 && z >= 0 && x < N && z < N; }

export function cheb(ax: number, az: number, bx: number, bz: number): number { return Math.max(Math.abs(ax - bx), Math.abs(az - bz)); }

export function sign(v: number): number { return v > 0 ? 1 : v < 0 ? -1 : 0; }

export function inDeploy(team: Team, x: number, z: number): boolean { return team === 0 ? z < DEPLOY_ROWS : z >= N - DEPLOY_ROWS; }

export function standing(u: Unit): boolean { return u.life.kind === 'up'; }

export function isDowned(u: Unit): boolean { return u.life.kind === 'downed'; }

export function isAlive(u: Unit): boolean { return u.life.kind !== 'dead'; }

/** A unit's statuses, in the order they were applied. */
export function statusKeys(st: Statuses): StatusKey[] {
  return Object.keys(st).filter(isStatusKey).filter(k => st[k]);
}

export function getUnit(s: BattleState, id: UnitId | null | undefined): Unit | null {
  for (const u of s.units) if (u.id === id) return u;

  return null;
}

export function unitAt(s: BattleState, x: number, z: number): Unit | null {
  for (const u of s.units) if (isAlive(u) && u.x === x && u.z === z) return u;

  return null;
}

export function current(s: BattleState): Unit | null {
  return s.phase.kind === 'act' ? getUnit(s, s.phase.queue[s.phase.qi]?.id) : null;
}

// ---------- the round's queue ----------
/** `id` already took a turn this round: Late. */
export function actedThisRound(s: BattleState, id: UnitId): boolean {
  const ph = s.phase;

  return ph.kind === 'act' && ph.queue.slice(0, ph.qi).some(t => t.id === id);
}

/** Where `id`'s next turn after the current one sits in the queue, or -1. */
export function nextTurn(s: BattleState, id: UnitId): number {
  const ph = s.phase;

  return ph.kind === 'act' ? ph.queue.findIndex((t, k) => k > ph.qi && t.id === id) : -1;
}

/** How many units already took a turn this round. */
export function actedCount(s: BattleState): number {
  const ph = s.phase;

  return ph.kind === 'act' ? new Set(ph.queue.slice(0, ph.qi).map(t => t.id)).size : 0;
}

/** No turn of `u`'s party (or, with `anyone`, of anybody) comes after the current one this round. */
export function lastToAct(s: BattleState, u: Unit, anyone: boolean): boolean {
  const ph = s.phase;

  if (ph.kind !== 'act' || current(s) !== u) return false;

  return !ph.queue.slice(ph.qi + 1).some(t => anyone || getUnit(s, t.id)?.team === u.team);
}

function tolledThisRound(s: BattleState, id: UnitId): boolean { return s.phase.kind === 'act' && s.phase.tolled.includes(id); }

/** Effective terrain: ice over water, then the base tile. Off the board reads as wall. */
export function terrAt(s: BattleState, x: number, z: number): TerrainChar {
  if (!inb(x, z)) return '#';

  if (s.fx[idx(x, z)]?.ice) return 'I';

  return s.terr[idx(x, z)] ?? '#';
}

/** Solid terrain, or a Bone Wall standing on the tile. */
export function isSolid(s: BattleState, x: number, z: number): boolean { return !!(TERRAIN[terrAt(s, x, z)].solid || s.fx[idx(x, z)]?.bone); }

function blocksSight(s: BattleState, x: number, z: number): boolean {
  if (!inb(x, z)) return true;
  const f = s.fx[idx(x, z)];

  return !!(TERRAIN[terrAt(s, x, z)].sight || f?.smoke || f?.bone);
}

export function los(s: BattleState, ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax, dz = bz - az, steps = Math.max(Math.abs(dx), Math.abs(dz)) * 4;

  for (let i = 1; i < steps; i++) {
    const t = i / steps, x = Math.round(ax + dx * t), z = Math.round(az + dz * t);

    if ((x === ax && z === az) || (x === bx && z === bz)) continue;

    if (blocksSight(s, x, z)) return false;
  }

  if (s.fx[idx(bx, bz)]?.smoke && cheb(ax, az, bx, bz) > 1) return false;

  return true;
}

export function onHigh(s: BattleState, u: Unit): boolean { return terrAt(s, u.x, u.z) === '^'; }

/** In tall grass and not seen up close (GRASS_SIGHT tiles), nor next to one of the viewer's allies. */
export function concealed(s: BattleState, src: Unit, o: Unit, px: number, pz: number): boolean {
  if (terrAt(s, o.x, o.z) !== 'G' || isDowned(o)) return false;

  if (cheb(px, pz, o.x, o.z) <= GRASS_SIGHT) return false;

  for (const a of s.units) if (a.team === src.team && standing(a) && a !== src && cheb(a.x, a.z, o.x, o.z) <= 1) return false;

  return true;
}

function isStatusKey(k: string): k is StatusKey { return k in STATUS; }

export const BAD_KEYS: readonly StatusKey[] = Object.keys(STATUS).filter(isStatusKey).filter(k => STATUS[k].bad);

// ---------- souls ----------
/** How many Souls `u` can hold: 0 unless its class gathers them. */
export function soulCap(s: BattleState, u: Unit): number {
  return CLASSES[u.cls].innate === 'harvest' ? SOULS + (u.mods.soulCap || 0) + (s.party[u.team].has('charnel') ? PAIR_N.charnel.souls : 0) : 0;
}

export function harvestRange(u: Unit): number { return HARVEST_RANGE + (u.mods.harvestRange || 0); }

/** The ground Souls Harvest would gather if `u` stood at (px, pz), nearest first. */
export function soulsInReach(s: BattleState, u: Unit, px = u.x, pz = u.z): Soul[] {
  const r = harvestRange(u);

  return s.souls.filter(o => cheb(o.x, o.z, px, pz) <= r).sort((a, b) => cheb(a.x, a.z, px, pz) - cheb(b.x, b.z, px, pz));
}

export function soulAt(s: BattleState, x: number, z: number): Soul | null {
  for (const o of s.souls) if (o.x === x && o.z === z) return o;

  return null;
}

/** Undying: a Downed unit that still takes its turns. */
export function undying(u: Unit): boolean { return u.life.kind === 'downed' && !!u.mods.undying; }

// ---------- movement ----------
export function moveOf(u: Unit): number {
  return undying(u) ? UNDYING_MOVE : CLASSES[u.cls].move + (u.st.haste ? HASTE_MOVE : 0);
}

function pathTo(prev: Map<number, number>, k: number): Pos[] {
  const path: Pos[] = [];

  for (let cur = k; cur !== -1; cur = prev.get(cur) ?? -1) path.push({ x: cur % N, z: (cur / N) | 0 });

  return path.reverse();
}

/** Dijkstra: terrain costs, enemies block. Tile index → previous tile on the cheapest path. */
function walkPaths(s: BattleState, u: Unit, range: number): Map<number, number> {
  const start = idx(u.x, u.z);
  const dist = new Map<number, number>([[start, 0]]), prev = new Map<number, number>([[start, -1]]);
  const open: number[] = [start];

  const relax = (from: number, nk: number, nd: number) => {
    if (nd > range) return;
    const old = dist.get(nk);

    if (old !== undefined && old <= nd) return;
    dist.set(nk, nd); prev.set(nk, from);
    open.push(nk);
  };

  while (open.length) {
    open.sort((a, b) => (dist.get(a) ?? 0) - (dist.get(b) ?? 0));
    const c = open.shift();

    if (c === undefined) break;
    const cx = c % N, cz = (c / N) | 0, d = dist.get(c) ?? 0;

    for (const [ddx, ddz] of DIR4) {
      const nx = cx + ddx, nz = cz + ddz;

      if (!inb(nx, nz) || isSolid(s, nx, nz)) continue;
      const o = unitAt(s, nx, nz);

      if (o && o.team !== u.team) continue;
      relax(c, idx(nx, nz), d + (TERRAIN[terrAt(s, nx, nz)].cost || 1));
    }
  }

  return prev;
}

/** Tile index → path (start first) for every tile the unit can end its move on. Insertion order breaks AI ties. */
export function reachable(s: BattleState, u: Unit | null): Map<number, Pos[]> {
  const res = new Map<number, Pos[]>();

  if (!u || !(standing(u) || undying(u)) || u.moved || u.st.encased) return res;
  const start = idx(u.x, u.z), prev = walkPaths(s, u, moveOf(u));

  prev.forEach((_p, k) => {
    if (k === start) return;
    const x = k % N, z = (k / N) | 0;

    if (unitAt(s, x, z) || isSolid(s, x, z)) return;
    res.set(k, pathTo(prev, k));
  });

  return res;
}

// ---------- targeting ----------
export function actionsOf(u: Unit): SkillId[] {
  const basic: BasicSkillId = `basic_${u.cls}`;

  return [basic, CLASSES[u.cls].innate, ...u.skills, 'helpup'];
}

export function cdOf(s: BattleState, u: Unit, id: SkillId): number {
  let c = SKILLS[id].cd;

  if (id === 'toll' && s.party[u.team].has('pealofbells')) c -= PAIR_N.pealofbells.cd;

  if (id === 'prison') c -= u.mods.prisonCd || 0;

  if (id === 'toll') c -= u.mods.tollCd || 0;

  if (id === 'encore') c -= u.mods.encoreCd || 0;

  return c;
}

function skillRange(s: BattleState, u: Unit, id: SkillId, px: number, pz: number): number {
  let r = SKILLS[id].range || 0;

  if (isCall(id)) r += u.mods.callRange || 0;

  if (id === 'recall') r += u.mods.recallRange || 0;

  if (id === 'lastrites') r += u.mods.riteRange || 0;

  if (id === 'toll') r += (u.mods.tollRange || 0) + (s.party[u.team].has('pealofbells') ? PAIR_N.pealofbells.range : 0);

  if (r > 1 && terrAt(s, px, pz) === '^') r += HIGH_GROUND.range;

  return r;
}

export function callsOf(s: BattleState, u: Unit): number {
  let n = 0;

  for (const c of s.calls) if (c.by === u.id) n++;

  return n;
}

export function canUse(s: BattleState, u: Unit, id: SkillId): boolean {
  if (!actionsOf(u).includes(id) || u.st.encased) return false;

  if ((u.cd[id] || 0) > 0) return false;
  const sk = SKILLS[id];

  if (u.acted && !sk.free) return false;

  if (undying(u) && (sk.basic || id === 'helpup')) return false;

  if (u.st.hush && !sk.basic) return false;

  if (sk.target === 'downed' && u.hp < 2) return false;

  if (id === 'overture') return s.units.some(a => a.team === u.team && nextTurn(s, a.id) >= 0);

  if (sk.rite && u.souls < 1) return false;

  if (id === 'harvest') return u.souls < soulCap(s, u) && soulsInReach(s, u).length > 0;

  if (id === 'snap') return callsOf(s, u) > 0;

  if (isCall(id)) return callsOf(s, u) < 1 + (u.mods.twinStars || 0);

  return true;
}

/** The free tile nearest (x, z), (x, z) itself first; `except` may stand there. */
export function nearestFree(s: BattleState, x: number, z: number, except: Unit | null = null): Pos | null {
  for (let r = 0; r < N; r++) {
    let best: Pos | null = null, bd = 1e9;

    for (let tz = z - r; tz <= z + r; tz++) for (let tx = x - r; tx <= x + r; tx++) {
      if (cheb(tx, tz, x, z) !== r || !inb(tx, tz) || isSolid(s, tx, tz)) continue;
      const o = unitAt(s, tx, tz);

      if (o && o !== except) continue;
      const d = Math.abs(tx - x) + Math.abs(tz - z);

      if (d < bd) { bd = d; best = { x: tx, z: tz }; }
    }

    if (best) return best;
  }

  return null;
}

function unitOk(s: BattleState, u: Unit, id: SkillId, o: Unit, px: number, pz: number, r: number): boolean {
  const sk = SKILLS[id], ox = o === u ? px : o.x, oz = o === u ? pz : o.z, d = cheb(px, pz, ox, oz);

  if (id === 'toll' && o === u) return !!u.mods.finalHour && !u.moved && !u.acted && !tolledThisRound(s, u.id) && !lastToAct(s, u, true);

  switch (sk.target) {
    case 'enemy':
      if (o.team === u.team || concealed(s, u, o, px, pz)) return false;
      break;
    case 'ally': if (o.team !== u.team || !standing(o) || (sk.noSelf && o === u)) return false; break;
    case 'downed': if (o.team !== u.team || !isDowned(o)) return false; break;
    case 'friend': if (o.team !== u.team || o === u) return false; break;
    case 'any':
      if (o === u) return false;

      if (o.team !== u.team && concealed(s, u, o, px, pz)) return false;

      if (!standing(o)) return false;
      break;
    default: return false;
  }

  if (id === 'equalize' && !evens(u, o)) return false;

  if (id === 'toll' && (actedThisRound(s, o.id) || nextTurn(s, o.id) < 0 || tolledThisRound(s, o.id))) return false;

  if (id === 'encore' && (!actedThisRound(s, o.id) || nextTurn(s, o.id) >= 0)) return false;

  if (d > r) return false;

  if (sk.los && !los(s, px, pz, ox, oz)) return false;

  return true;
}

/** Legal targets for `id` if `u` stood at (px, pz). */
export function castTargets(s: BattleState, u: Unit, id: SkillId, px = u.x, pz = u.z): Target[] {
  const sk = SKILLS[id], out: Target[] = [];

  if (sk.target === 'self') return [{ x: px, z: pz }];

  const r = skillRange(s, u, id, px, pz);

  if (id === 'soulburst') return s.souls.filter(o => cheb(o.x, o.z, px, pz) <= r).map(o => ({ x: o.x, z: o.z }));

  if (sk.target !== 'tile') {
    for (const o of s.units) if (isAlive(o) && unitOk(s, u, id, o, px, pz, r)) out.push({ x: o === u ? px : o.x, z: o === u ? pz : o.z, id: o.id });

    return out;
  }

  for (let z = pz - r; z <= pz + r; z++) for (let x = px - r; x <= px + r; x++) {
    if (!inb(x, z)) continue;

    if (sk.empty && (isSolid(s, x, z) || unitAt(s, x, z) || (x === px && z === pz))) continue;

    if (sk.los && !los(s, px, pz, x, z)) continue;
    out.push({ x, z });
  }

  return out;
}

export function square(x: number, z: number, r: number): Pos[] {
  const out: Pos[] = [];

  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (inb(x + dx, z + dz)) out.push({ x: x + dx, z: z + dz });

  return out;
}

/** Surface units on the tiles, in tile order. */
export function unitsIn(s: BattleState, tiles: readonly Pos[]): Unit[] {
  const out: Unit[] = [];

  for (const t of tiles) { const o = unitAt(s, t.x, t.z); if (o) out.push(o); }

  return out;
}

/** Equalize does something: an enemy healthier than `u`, or an ally hurt worse. */
export function evens(u: Unit, o: Unit): boolean {
  const mine = u.hp / u.maxHp, theirs = o.hp / o.maxHp;

  return o.team === u.team ? theirs < mine : theirs > mine;
}

/** A Bone Wall's tiles: three across the line from `u` to (tx, tz), centred there, skipping solid tiles and units. */
export function boneTiles(s: BattleState, u: Unit, tx: number, tz: number): Pos[] {
  const dx = sign(tx - u.x), dz = sign(tz - u.z);

  return [-1, 0, 1].flatMap(k => {
    const x = tx - dz * k, z = tz + dx * k;

    return inb(x, z) && !isSolid(s, x, z) && !unitAt(s, x, z) ? [{ x, z }] : [];
  });
}

/** The tiles a cast at (tx, tz) affects, for highlighting (and a Call's area). */
export function aoeTiles(s: BattleState, u: Unit, id: SkillId, tx: number, tz: number): Pos[] {
  const sk = SKILLS[id];

  if (id === 'bonewall') return boneTiles(s, u, tx, tz);

  if (sk.aoe && sk.target === 'self') return square(u.x, u.z, sk.aoe);

  if (sk.aoe && sk.target === 'tile') return square(tx, tz, sk.aoe);

  return [{ x: tx, z: tz }];
}

// ---------- deployment ----------
export function canDeploy(s: BattleState, team: Team, x: number, z: number): boolean {
  return inb(x, z) && inDeploy(team, x, z) && !isSolid(s, x, z);
}

export function validDeploy(s: BattleState, team: Team, pos: readonly (Pos | null | undefined)[] | null | undefined, n: number): pos is readonly Pos[] {
  if (!pos || pos.length < n) return false;

  for (let i = 0; i < n; i++) {
    const p = pos[i];

    if (!p || !canDeploy(s, team, p.x, p.z)) return false;

    for (let j = 0; j < i; j++) { const q = pos[j]; if (q && q.x === p.x && q.z === p.z) return false; }
  }

  return true;
}

// ---------- copying: the AI clones ~1000x a turn ----------
function cloneStatuses(st: Statuses): Statuses {
  const o: Statuses = {};

  if (st.stun) o.stun = { ...st.stun };

  if (st.root) o.root = { ...st.root };

  if (st.wet) o.wet = { ...st.wet };

  if (st.expose) o.expose = { ...st.expose };

  if (st.burn) o.burn = { ...st.burn };

  if (st.encased) o.encased = { ...st.encased };

  if (st.wither) o.wither = { ...st.wither };

  if (st.hush) o.hush = { ...st.hush };

  if (st.guard) o.guard = { ...st.guard };

  if (st.haste) o.haste = { ...st.haste };

  return o;
}

function clonePhase(p: Phase): Phase {
  if (p.kind === 'act') return { kind: 'act', queue: p.queue.map(t => ({ ...t })), qi: p.qi, tolled: p.tolled.slice() };

  return p;
}

export function cloneState(s: BattleState): BattleState {
  return {
    map: s.map,
    terr: s.terr.slice(),
    fx: s.fx.map(f => (f ? { ...f } : undefined)),
    units: s.units.map(u => ({ ...u, cd: { ...u.cd }, st: cloneStatuses(u.st) })),
    round: s.round,
    starter: s.starter,
    phase: clonePhase(s.phase),
    party: s.party,
    combos: [s.combos[0], s.combos[1]],
    favor: [s.favor[0], s.favor[1]],
    stats: {
      dmg: [s.stats.dmg[0], s.stats.dmg[1]], heal: [s.stats.heal[0], s.stats.heal[1]],
      downs: [s.stats.downs[0], s.stats.downs[1]], revives: [s.stats.revives[0], s.stats.revives[1]],
    },
    souls: s.souls.map(o => ({ ...o })),
    calls: s.calls.map(c => ({ ...c, recall: c.recall ? { ...c.recall } : null })),
    callRound: [s.callRound[0], s.callRound[1]],
  };
}
