import { CLASSES, DEPLOY_ROWS, DIR4, DIR8, N, SKILLS, STATUS, TERRAIN, isCall } from './tables';
import type { BasicSkillId, BattleState, Mouth, Phase, Pos, SkillId, StatusKey, Statuses, Team, TerrainChar, Thread, Unit, UnitId } from './types';

export interface Target extends Pos { id?: UnitId }

export function idx(x: number, z: number): number { return z * N + x; }
export function inb(x: number, z: number): boolean { return x >= 0 && z >= 0 && x < N && z < N; }
export function cheb(ax: number, az: number, bx: number, bz: number): number { return Math.max(Math.abs(ax - bx), Math.abs(az - bz)); }
export function sign(v: number): number { return v > 0 ? 1 : v < 0 ? -1 : 0; }
export function inDeploy(team: Team, x: number, z: number): boolean { return team === 0 ? z < DEPLOY_ROWS : z >= N - DEPLOY_ROWS; }

export function standing(u: Unit): boolean { return u.life.kind === 'up'; }
export function isDowned(u: Unit): boolean { return u.life.kind === 'downed'; }
export function isAlive(u: Unit): boolean { return u.life.kind !== 'dead'; }
/** Alive and on the surface: the units the board can touch. */
export function present(u: Unit): boolean { return u.life.kind !== 'dead' && u.under === 0; }

export function getUnit(s: BattleState, id: UnitId | null | undefined): Unit | null {
  for (const u of s.units) if (u.id === id) return u;
  return null;
}
/** The surface unit on a tile. Underground units don't occupy it. */
export function unitAt(s: BattleState, x: number, z: number): Unit | null {
  for (const u of s.units) if (present(u) && u.x === x && u.z === z) return u;
  return null;
}
export function current(s: BattleState): Unit | null {
  return s.phase.kind === 'act' ? getUnit(s, s.phase.queue[s.phase.qi]) : null;
}

/** Effective terrain: overlays first (pit, ice), then the base tile. Off the board reads as wall. */
export function terrAt(s: BattleState, x: number, z: number): TerrainChar {
  if (!inb(x, z)) return '#';
  const f = s.fx[idx(x, z)];
  if (f) { if (f.pit) return 'o'; if (f.ice) return 'I'; }
  return s.terr[idx(x, z)] ?? '#';
}
export function isSolid(s: BattleState, x: number, z: number): boolean { return !!TERRAIN[terrAt(s, x, z)].solid; }
function blocksSight(s: BattleState, x: number, z: number): boolean {
  if (!inb(x, z)) return true;
  return !!(TERRAIN[terrAt(s, x, z)].sight || s.fx[idx(x, z)]?.smoke);
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

/** In tall grass and not seen up close (2 tiles), nor next to one of the viewer's allies. */
export function concealed(s: BattleState, src: Unit, o: Unit, px: number, pz: number): boolean {
  if (terrAt(s, o.x, o.z) !== 'G' || isDowned(o)) return false;
  if (cheb(px, pz, o.x, o.z) <= 2) return false;
  for (const a of s.units) if (a.team === src.team && standing(a) && a.under === 0 && a !== src && cheb(a.x, a.z, o.x, o.z) <= 1) return false;
  return true;
}

function isStatusKey(k: string): k is StatusKey { return k in STATUS; }
export const BAD_KEYS: readonly StatusKey[] = Object.keys(STATUS).filter(isStatusKey).filter(k => STATUS[k].bad);

// ---------- threads and tunnels ----------
/** The Threads holding `o`, by Weavers of `team` when given. */
export function holders(s: BattleState, o: Unit, team?: Team): Thread[] {
  return s.threads.filter(t => t.to === o.id && (team === undefined || getUnit(s, t.by)?.team === team));
}
export function threadCap(s: BattleState, w: Unit): number {
  return 3 + (w.mods.threads || 0) + (s.party[w.team].has('greatweb') ? 1 : 0);
}
function joined(s: BattleState, a: Mouth, b: Mouth): boolean {
  return a !== b && a.team === b.team && (a.net === b.net || s.party[a.team].has('warren'));
}

// ---------- movement ----------
const UNDER_MOVE = 4;
export function moveOf(u: Unit): number {
  return u.under ? UNDER_MOVE + (u.mods.underMove || 0) : CLASSES[u.cls].move;
}

function pathTo(prev: Map<number, number>, k: number): Pos[] {
  const path: Pos[] = [];
  for (let cur = k; cur !== -1; cur = prev.get(cur) ?? -1) path.push({ x: cur % N, z: (cur / N) | 0 });
  return path.reverse();
}

/** Underground: 4 directions through walls, water and units, never through a chasm or pit. */
function underPaths(s: BattleState, u: Unit, range: number): Map<number, number> {
  const start = idx(u.x, u.z), prev = new Map<number, number>([[start, -1]]);
  let frontier = [start];
  for (let d = 0; d < range && frontier.length; d++) {
    const next: number[] = [];
    for (const k of frontier) for (const [dx, dz] of DIR4) {
      const nx = (k % N) + dx, nz = ((k / N) | 0) + dz, nk = idx(nx, nz);
      if (!inb(nx, nz) || prev.has(nk) || terrAt(s, nx, nz) === 'o') continue;
      prev.set(nk, k); next.push(nk);
    }
    frontier = next;
  }
  return prev;
}

/** Surface Dijkstra: terrain costs, enemies block, webs stop non-Weavers, joined mouths connect. */
function surfacePaths(s: BattleState, u: Unit, range: number): Map<number, number> {
  const start = idx(u.x, u.z), weaver = u.cls === 'weaver';
  const dist = new Map<number, number>([[start, 0]]), prev = new Map<number, number>([[start, -1]]);
  const mouths = s.mouths.filter(m => m.team === u.team);
  const jump = s.party[u.team].has('silktunnels') && holders(s, u, u.team).length ? 0 : 1;
  const open: number[] = [start];
  const relax = (from: number, nk: number, nd: number, stop: boolean) => {
    if (nd > range) return;
    const old = dist.get(nk);
    if (old !== undefined && old <= nd) return;
    dist.set(nk, nd); prev.set(nk, from);
    if (!stop) open.push(nk);
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
      const web = !!s.fx[idx(nx, nz)]?.web;
      const cost = web && weaver ? 0 : TERRAIN[terrAt(s, nx, nz)].cost || 1;
      relax(c, idx(nx, nz), d + cost, web && !weaver);
    }
    if (!mouths.length) continue;
    const here = mouths.find(m => m.x === cx && m.z === cz);
    if (!here) continue;
    for (const m of mouths) {
      if (!joined(s, here, m) || isSolid(s, m.x, m.z) || unitAt(s, m.x, m.z)) continue;
      relax(c, idx(m.x, m.z), d + jump, false);
    }
  }
  return prev;
}

/** Tile index → path (start first) for every tile the unit can end its move on. Insertion order breaks AI ties. */
export function reachable(s: BattleState, u: Unit | null): Map<number, Pos[]> {
  const res = new Map<number, Pos[]>();
  if (!u || !standing(u) || u.moved) return res;
  return paths(s, u, moveOf(u), true);
}

/** Every tile `u` could walk to within `range`, ignoring Root; `leash` keeps it within its enemy Weavers' Threads. */
export function paths(s: BattleState, u: Unit, range: number, leash: boolean): Map<number, Pos[]> {
  const res = new Map<number, Pos[]>(), start = idx(u.x, u.z);
  const prev = u.under ? underPaths(s, u, range) : surfacePaths(s, u, range);
  const leashes: [Unit, number][] = [];
  if (leash) for (const t of s.threads) {
    if (t.to !== u.id) continue;
    const w = getUnit(s, t.by);
    if (w && w.team !== u.team && standing(w)) leashes.push([w, t.len]);
  }
  prev.forEach((_p, k) => {
    if (k === start) return;
    const x = k % N, z = (k / N) | 0;
    if (unitAt(s, x, z) || isSolid(s, x, z)) return;
    if (u.under && s.units.some(o => o !== u && isAlive(o) && o.x === x && o.z === z)) return;
    for (const [w, len] of leashes) if (cheb(x, z, w.x, w.z) > len) return;
    res.set(k, pathTo(prev, k));
  });
  return res;
}

// ---------- targeting ----------
export function actionsOf(u: Unit): SkillId[] {
  const basic: BasicSkillId = `basic_${u.cls}`;
  return [basic, CLASSES[u.cls].innate, ...u.skills, 'helpup'];
}
export function cdOf(u: Unit, id: SkillId): number {
  let c = SKILLS[id].cd;
  if (id === 'prison') c -= u.mods.prisonCd || 0;
  if (id === 'cocoon') c -= u.mods.cocoonCd || 0;
  return c;
}
function skillRange(s: BattleState, u: Unit, id: SkillId, px: number, pz: number): number {
  let r = SKILLS[id].range || 0;
  if (isCall(id)) r += u.mods.callRange || 0;
  if (id === 'recall') r += u.mods.recallRange || 0;
  if (id === 'tether') r += u.mods.threadRange || 0;
  if (r > 1 && terrAt(s, px, pz) === '^') r += 1;
  return r;
}
export function callsOf(s: BattleState, u: Unit): number {
  let n = 0;
  for (const c of s.calls) if (c.by === u.id) n++;
  return n;
}
export function canUse(s: BattleState, u: Unit, id: SkillId): boolean {
  if (!actionsOf(u).includes(id)) return false;
  if ((u.cd[id] || 0) > 0) return false;
  if (u.acted && !SKILLS[id].free) return false;
  if (id === 'burrow') return !u.moved && u.under === 0;
  if (id === 'upheaval') return u.under > 0;
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

/** Where Drag Under brings an ally: the free tile nearest the Delver's newest mouth. */
export function dragLanding(s: BattleState, u: Unit): Pos | null {
  let m: Mouth | null = null;
  for (const mo of s.mouths) if (mo.net === u.id) m = mo;
  return m ? nearestFree(s, m.x, m.z) : null;
}

/** Puppet Strings: tile index → the first held enemy (in Thread order) that can walk there in 2 steps, and its path. */
export function puppetMoves(s: BattleState, u: Unit): Map<number, { id: UnitId; path: Pos[] }> {
  const out = new Map<number, { id: UnitId; path: Pos[] }>();
  for (const t of s.threads) {
    if (t.by !== u.id) continue;
    const o = getUnit(s, t.to);
    if (!o || o.team === u.team || !standing(o) || o.under || o.st.encased) continue;
    paths(s, o, 2, false).forEach((path, k) => { if (!out.has(k)) out.set(k, { id: o.id, path }); });
  }
  return out;
}

function unitOk(s: BattleState, u: Unit, id: SkillId, o: Unit, px: number, pz: number, r: number): boolean {
  const sk = SKILLS[id], ox = o === u ? px : o.x, oz = o === u ? pz : o.z, d = cheb(px, pz, ox, oz);
  if (o !== u && o.under) return false;
  const held = () => s.threads.some(t => t.by === u.id && t.to === o.id);
  switch (sk.target) {
    case 'enemy':
      if (o.team === u.team || concealed(s, u, o, px, pz)) return false;
      if (id === 'upheaval' && !standing(o)) return false;
      break;
    case 'ally': if (o.team !== u.team || !standing(o) || (sk.noSelf && o === u)) return false; break;
    case 'downed': if (o.team !== u.team || !isDowned(o)) return false; break;
    case 'friend': if (o.team !== u.team || o === u) return false; break;
    case 'any':
      if (o === u) return false;
      if (o.team !== u.team && concealed(s, u, o, px, pz)) return false;
      if (!standing(o) && !(id === 'cocoon' && o.team === u.team)) return false;
      break;
    default: return false;
  }
  if (id === 'cocoon') return d <= r || held();
  if (d > r) return false;
  if (id === 'skitter') return held() && !!landingNear(s, u, o, px, pz);
  if (id === 'dragunder') return !!dragLanding(s, u);
  if (sk.los && !los(s, px, pz, ox, oz)) return false;
  return true;
}

/** Legal targets for `id` if `u` stood at (px, pz). */
export function castTargets(s: BattleState, u: Unit, id: SkillId, px = u.x, pz = u.z): Target[] {
  const sk = SKILLS[id], out: Target[] = [];
  if (sk.target === 'self') return [{ x: px, z: pz }];
  if (id === 'puppet') {
    puppetMoves(s, u).forEach((_m, k) => out.push({ x: k % N, z: (k / N) | 0 }));
    return out;
  }
  const r = skillRange(s, u, id, px, pz);
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

export function landingNear(s: BattleState, u: Unit, o: Unit, px: number, pz: number): Pos | null {
  let best: Pos | null = null, bs = 1e9;
  DIR8.forEach(([dx, dz], i) => {
    const x = o.x + dx, z = o.z + dz;
    if (!inb(x, z) || isSolid(s, x, z)) return;
    const w = unitAt(s, x, z);
    if (w && !(w === u && (u.x !== px || u.z !== pz))) return;
    const sc = i + (terrAt(s, x, z) === '~' ? 20 : 0) + (s.fx[idx(x, z)]?.fire ? 40 : 0);
    if (sc < bs) { bs = sc; best = { x, z }; }
  });
  return best;
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

/** The tiles a cast at (tx, tz) affects, for highlighting (and a Call's area). */
export function aoeTiles(_s: BattleState, u: Unit, id: SkillId, tx: number, tz: number): Pos[] {
  const sk = SKILLS[id];
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
  if (st.poison) o.poison = { ...st.poison };
  if (st.encased) o.encased = { ...st.encased };
  if (st.share) o.share = { ...st.share };
  return o;
}
function clonePhase(p: Phase): Phase {
  if (p.kind === 'order') return { kind: 'order', orders: [p.orders[0]?.slice() ?? null, p.orders[1]?.slice() ?? null] };
  if (p.kind === 'act') return { kind: 'act', queue: p.queue.slice(), qi: p.qi };
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
    mouths: s.mouths.map(m => ({ ...m })),
    calls: s.calls.map(c => ({ ...c, recall: c.recall ? { ...c.recall } : null })),
    threads: s.threads.map(t => ({ ...t })),
    callRound: [s.callRound[0], s.callRound[1]],
  };
}
