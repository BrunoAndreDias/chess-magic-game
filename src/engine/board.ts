import { CLASSES, DEPLOY_ROWS, DIR4, DIR8, N, SKILLS, STATUS, TERRAIN } from './tables';
import type { BasicSkillId, BattleState, Phase, Pos, SkillId, StatusKey, Statuses, Team, TerrainChar, Unit, UnitId } from './types';

export interface Target extends Pos { id?: UnitId }

export function idx(x: number, z: number): number { return z * N + x; }
export function inb(x: number, z: number): boolean { return x >= 0 && z >= 0 && x < N && z < N; }
export function cheb(ax: number, az: number, bx: number, bz: number): number { return Math.max(Math.abs(ax - bx), Math.abs(az - bz)); }
export function sign(v: number): number { return v > 0 ? 1 : v < 0 ? -1 : 0; }
export function inDeploy(team: Team, x: number, z: number): boolean { return team === 0 ? z < DEPLOY_ROWS : z >= N - DEPLOY_ROWS; }

export function standing(u: Unit): boolean { return u.life.kind === 'up'; }
export function isDowned(u: Unit): boolean { return u.life.kind === 'downed'; }
export function isAlive(u: Unit): boolean { return u.life.kind !== 'dead'; }

export function getUnit(s: BattleState, id: UnitId | null | undefined): Unit | null {
  for (const u of s.units) if (u.id === id) return u;
  return null;
}
export function unitAt(s: BattleState, x: number, z: number): Unit | null {
  for (const u of s.units) if (u.life.kind !== 'dead' && u.x === x && u.z === z) return u;
  return null;
}
export function current(s: BattleState): Unit | null {
  return s.phase.kind === 'act' ? getUnit(s, s.phase.queue[s.phase.qi]) : null;
}

/** Effective terrain: overlays first (barricade, ice, flood), then the base tile. Off the board reads as wall. */
export function terrAt(s: BattleState, x: number, z: number): TerrainChar {
  if (!inb(x, z)) return '#';
  const f = s.fx[idx(x, z)];
  if (f) { if (f.wall) return '#'; if (f.ice) return 'I'; if (f.flood) return '~'; }
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

/** In tall grass and not seen up close (or found by a marking Predator or by an enemy of `o` standing next to it). */
export function concealed(s: BattleState, src: Unit, o: Unit, px: number, pz: number): boolean {
  if (terrAt(s, o.x, o.z) !== 'G' || isDowned(o)) return false;
  const r = o.mods.grasswalk ? 1 : 2;
  if (cheb(px, pz, o.x, o.z) <= r) return false;
  if (o.st.mark?.pred) return false;
  for (const a of s.units) if (a.team === src.team && standing(a) && a !== src && cheb(a.x, a.z, o.x, o.z) <= 1) return false;
  return true;
}

export function isDebuffed(u: Unit): boolean {
  for (const k of BAD_KEYS) if (u.st[k]) return true;
  return false;
}
function isStatusKey(k: string): k is StatusKey { return k in STATUS; }
export const BAD_KEYS: readonly StatusKey[] = Object.keys(STATUS).filter(isStatusKey).filter(k => STATUS[k].bad);

// ---------- movement ----------
export function moveOf(u: Unit): number {
  if (u.moveCap) return u.moveCap;
  return CLASSES[u.cls].move + (u.mods.move || 0) + (u.st.haste ? 2 : 0);
}

/** Tile index → path (start first) for every tile the unit can end its move on. Insertion order breaks AI ties. */
export function reachable(s: BattleState, u: Unit | null): Map<number, Pos[]> {
  const res = new Map<number, Pos[]>();
  if (!u || !standing(u) || u.moved) return res;
  const range = moveOf(u), start = idx(u.x, u.z);
  const dist = new Map<number, number>([[start, 0]]), prev = new Map<number, number>([[start, -1]]);
  const key = (p: readonly [number, number]) => dist.get(idx(p[0], p[1])) ?? 0;
  const open: [number, number][] = [[u.x, u.z]];
  while (open.length) {
    open.sort((a, b) => key(a) - key(b));
    const c = open.shift();
    if (!c) break;
    const d = key(c);
    for (const [ddx, ddz] of DIR4) {
      const nx = c[0] + ddx, nz = c[1] + ddz;
      if (!inb(nx, nz) || isSolid(s, nx, nz)) continue;
      const o = unitAt(s, nx, nz);
      if (o && o.team !== u.team) continue;
      const nd = d + (TERRAIN[terrAt(s, nx, nz)].cost || 1);
      if (nd > range) continue;
      const k = idx(nx, nz), old = dist.get(k);
      if (old !== undefined && old <= nd) continue;
      dist.set(k, nd); prev.set(k, idx(c[0], c[1])); open.push([nx, nz]);
    }
  }
  dist.forEach((_d, k) => {
    if (k === start) return;
    if (unitAt(s, k % N, (k / N) | 0)) return;
    const path: Pos[] = [];
    for (let cur = k; cur !== -1; cur = prev.get(cur) ?? -1) path.push({ x: cur % N, z: (cur / N) | 0 });
    res.set(k, path.reverse());
  });
  return res;
}

// ---------- targeting ----------
export function actionsOf(u: Unit): SkillId[] {
  const basic: BasicSkillId = `basic_${u.cls}`;
  return [basic, ...u.skills, 'helpup'];
}
export function cdOf(u: Unit, id: SkillId): number {
  let c = SKILLS[id].cd;
  if (id === 'judgment') c -= u.mods.judgCd || 0;
  return c;
}
function skillRange(s: BattleState, u: Unit, id: SkillId, px: number, pz: number): number {
  let r = SKILLS[id].range || 0;
  if (r <= 1) return r;
  r += u.mods.range || 0;
  if (terrAt(s, px, pz) === '^') r += 1;
  return r;
}
export function canUse(u: Unit, id: SkillId): boolean {
  if (!actionsOf(u).includes(id)) return false;
  if ((u.cd[id] || 0) > 0) return false;
  if (u.acted && !SKILLS[id].free) return false;
  return true;
}

/** Legal targets for `id` if `u` stood at (px, pz). */
export function castTargets(s: BattleState, u: Unit, id: SkillId, px = u.x, pz = u.z): Target[] {
  const sk = SKILLS[id];
  let out: Target[] = [];
  if (sk.target === 'self') return [{ x: px, z: pz }];
  const r = skillRange(s, u, id, px, pz);
  if (sk.target === 'enemy' || sk.target === 'ally' || sk.target === 'downed') {
    for (const o of s.units) {
      if (!isAlive(o)) continue;
      const ox = o === u ? px : o.x, oz = o === u ? pz : o.z;
      if (cheb(px, pz, ox, oz) > r) continue;
      if (sk.target === 'enemy') {
        if (o.team === u.team) continue;
        if (concealed(s, u, o, px, pz)) continue;
        if (id === 'shadowstep' && (isDowned(o) || !landingNear(s, u, o, px, pz))) continue;
      } else if (sk.target === 'ally') {
        if (o.team !== u.team || isDowned(o) || (sk.noSelf && o === u)) continue;
      } else if (o.team !== u.team || !isDowned(o)) continue;
      if (sk.los && !los(s, px, pz, ox, oz)) continue;
      out.push({ x: ox, z: oz, id: o.id });
    }
    if (sk.target === 'enemy' && u.st.taunt) {
      const by = getUnit(s, u.st.taunt.by);
      if (by && standing(by)) {
        const f = out.filter(t => t.id === by.id);
        if (f.length || id !== 'shadowstep') out = f;
      }
    }
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

export function barricadeTiles(s: BattleState, u: Unit, tx: number, tz: number): Pos[] {
  const alongZ = Math.abs(tx - u.x) >= Math.abs(tz - u.z);
  const tiles = alongZ ? [{ x: tx, z: tz - 1 }, { x: tx, z: tz }, { x: tx, z: tz + 1 }] : [{ x: tx - 1, z: tz }, { x: tx, z: tz }, { x: tx + 1, z: tz }];
  return tiles.filter(t => inb(t.x, t.z) && !isSolid(s, t.x, t.z) && !unitAt(s, t.x, t.z) && terrAt(s, t.x, t.z) !== '~');
}
export function square(x: number, z: number, r: number): Pos[] {
  const out: Pos[] = [];
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (inb(x + dx, z + dz)) out.push({ x: x + dx, z: z + dz });
  return out;
}
export function enemiesIn(s: BattleState, u: Unit, tiles: readonly Pos[]): Unit[] {
  const out: Unit[] = [];
  for (const t of tiles) { const o = unitAt(s, t.x, t.z); if (o && o.team !== u.team) out.push(o); }
  return out;
}

/** The tiles a cast at (tx, tz) affects, for highlighting. */
export function aoeTiles(s: BattleState, u: Unit, id: SkillId, tx: number, tz: number): Pos[] {
  const sk = SKILLS[id];
  if (id === 'barricade') return barricadeTiles(s, u, tx, tz);
  if (id === 'taunt' || id === 'sanctuary') return square(u.x, u.z, 2);
  if (id === 'smokebomb') return square(u.x, u.z, 1);
  if (sk.aoe && sk.target === 'tile') return square(tx, tz, sk.aoe);
  if (id === 'lightning') {
    const t = unitAt(s, tx, tz);
    if (t) return [{ x: tx, z: tz }, ...chainTargets(s, u, t).map(o => ({ x: o.x, z: o.z }))];
  }
  return [{ x: tx, z: tz }];
}

export function isWet(s: BattleState, o: Unit, src: Unit | null): boolean {
  return !!(o.st.wet || (o.st.mark && src && s.party[src.team].has('crossfire')));
}
export function chainTargets(s: BattleState, u: Unit, t: Unit): Unit[] {
  if (isWet(s, t, u)) return s.units.filter(o => o !== t && standing(o) && o.team !== u.team && isWet(s, o, u) && cheb(o.x, o.z, t.x, t.z) <= 3);
  const n = 1 + (u.mods.chain || 0);
  const cand = s.units.filter(o => o !== t && standing(o) && o.team !== u.team && cheb(o.x, o.z, t.x, t.z) <= 2);
  cand.sort((a, b) => cheb(a.x, a.z, t.x, t.z) - cheb(b.x, b.z, t.x, t.z));
  return cand.slice(0, n);
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
  if (st.haste) o.haste = { ...st.haste };
  if (st.burn) o.burn = { ...st.burn };
  if (st.poison) o.poison = { ...st.poison };
  if (st.mark) o.mark = { ...st.mark };
  if (st.empower) o.empower = { ...st.empower };
  if (st.taunt) o.taunt = { ...st.taunt };
  if (st.guard) o.guard = { ...st.guard };
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
  };
}
