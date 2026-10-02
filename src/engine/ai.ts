import {
  actionsOf, canDeploy, canUse, castTargets, cheb, cloneState, current, getUnit, idx, inb, isAlive, isDowned, los, reachable, standing, terrAt,
} from './board';
import type { Target } from './board';
import { performCast, performMove } from './combat';
import { orderable, endActivation } from './turns';
import { CLASSES, DIR8, N, SKILLS } from './tables';
import type { Rng } from './rng';
import type { BattleState, ClassId, Command, MemberBuild, Pos, SkillId, StatusKey, Team, Unit, UnitId } from './types';

function depthOf(team: Team, z: number): number { return team === 0 ? z : N - 1 - z; }

export function aiDeploy(s: BattleState, team: Team, members: readonly MemberBuild[], rng: Rng): Pos[] {
  const pos: (Pos | null)[] = members.map(() => null), mid = (N - 1) / 2;
  const tankFirst = (i: number) => (CLASSES[members[i]?.cls ?? 'warden'].role === 'tank' ? 0 : 1);
  const order = members.map((_m, i) => i).sort((a, b) => tankFirst(a) - tankFirst(b));
  for (const i of order) {
    const cls = members[i]?.cls;
    let best: Pos | null = null, bs = -1e9;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      if (!canDeploy(s, team, x, z) || pos.some(p => p && p.x === x && p.z === z)) continue;
      const d = depthOf(team, z), t = s.terr[idx(x, z)];
      let sc = rng() * 1.2 - Math.abs(x - mid) * 0.15;
      if (cls === 'warden') sc += d * 1.2;
      else if (cls === 'rogue') sc += d * 0.8 + (t === 'G' ? 3 : 0);
      else if (cls === 'cleric') sc += (d === 1 ? 1.5 : 0);
      else sc += (t === '^' ? 4 : 0) + (d === 1 ? 1 : 0);
      if (t === '~') sc -= 3;
      for (const p of pos) {
        if (!p) continue;
        const dd = cheb(p.x, p.z, x, z);
        if (dd === 1) sc += cls === 'cleric' ? 1.5 : 0.5;
        else if (dd > 3) sc -= 1;
      }
      if (sc > bs) { bs = sc; best = { x, z }; }
    }
    pos[i] = best;
  }
  return pos.map(p => { if (!p) throw new Error(`team ${team}: no deploy tile left`); return p; });
}

const ROLE_BAND: Record<ClassId, readonly [number, number]> = { warden: [1, 1], rogue: [1, 1], wizard: [3, 4], ranger: [3, 5], cleric: [2, 3] };

export function tileScore(s: BattleState, u: Unit, x: number, z: number): number {
  const en = s.units.filter(o => o.team !== u.team && standing(o));
  if (!en.length) return 0;
  let sc = 0, dmin = 99;
  const band = ROLE_BAND[u.cls], hpR = u.hp / u.maxHp, t = terrAt(s, x, z), f = s.fx[idx(x, z)];
  for (const e of en) dmin = Math.min(dmin, cheb(x, z, e.x, e.z));
  if (u.st.taunt) { const by = getUnit(s, u.st.taunt.by); if (by) sc -= cheb(x, z, by.x, by.z) * 1.5; }
  else if (hpR < 0.3 && u.cls !== 'warden') sc += Math.min(dmin, 7) * 1.2;
  else { if (dmin > band[1]) sc -= (dmin - band[1]) * 3; if (dmin < band[0]) sc -= (band[0] - dmin) * 2.5; }
  let threats = 0;
  for (const e of en) if (cheb(x, z, e.x, e.z) <= 5 && los(s, e.x, e.z, x, z)) threats++;
  sc -= threats * (u.cls === 'warden' ? 0.2 : 0.9) * (hpR < 0.5 ? 1.6 : 1);
  if (f?.fire) sc -= 14;
  if (t === '~' && s.units.some(e => e.team !== u.team && standing(e) && e.cls === 'wizard')) sc -= 3;
  if (t === '^' && (u.cls === 'ranger' || u.cls === 'wizard')) sc += 3;
  if (t === 'G' && (u.cls === 'rogue' || u.cls === 'ranger')) sc += 2;
  if (t === '+' && hpR < 0.8) sc += 3;
  for (const [dx, dz] of DIR8) {
    const nx = x + dx, nz = z + dz;
    if (inb(nx, nz) && terrAt(s, nx, nz) === 'o' && s.units.some(e => e.team !== u.team && standing(e) && e.cls === 'warden' && cheb(e.x, e.z, x, z) <= 4)) { sc -= 2.5; break; }
  }
  for (const a of s.units) {
    if (a.team !== u.team || !isAlive(a) || a.id === u.id) continue;
    const d = cheb(a.x, a.z, x, z);
    if (isDowned(a)) sc += d <= 1 ? 6 : -d * 0.8;
    else if (u.cls === 'cleric' || u.cls === 'warden') sc += d <= 2 ? 1 : -(d - 2) * 0.4;
    else if (d > 5) sc -= 0.4;
  }
  return sc;
}

const ENEMY_GAIN: readonly [StatusKey, number][] = [['stun', 16], ['root', 7], ['mark', 8], ['expose', 6], ['taunt', 6], ['wet', 3], ['burn', 6], ['poison', 8]];
const ALLY_CURED: readonly StatusKey[] = ['stun', 'root', 'burn', 'poison', 'mark', 'expose', 'taunt'];

/** How much better s1 is than s0 for `team`. */
function evalDelta(s0: BattleState, s1: BattleState, team: Team): number {
  let v = 0;
  for (const a of s1.units) {
    const b = getUnit(s0, a.id);
    if (!b) continue;
    if (a.team !== team) {
      if (isAlive(b) && !isAlive(a)) v += isDowned(b) ? 55 : 120;
      else if (standing(b) && isDowned(a)) v += 80;
      if (!standing(a)) continue;
      v += (b.hp - a.hp) + 0.7 * (b.shield - a.shield);
      for (const [k, w] of ENEMY_GAIN) if (a.st[k] && !b.st[k]) v += w;
      if (a.x !== b.x || a.z !== b.z) v += 2;
    } else {
      if (isAlive(b) && !isAlive(a)) v -= 120; else if (standing(b) && isDowned(a)) v -= 90; else if (isDowned(b) && standing(a)) v += 85;
      if (!standing(a)) continue;
      const d = b.hp - a.hp;
      v += d > 0 ? -d * 1.1 : -d * (b.hp / b.maxHp < 0.5 ? 1.3 : 0.9);
      const sg = a.shield - b.shield;
      if (sg > 0) v += sg * 0.45;
      if (a.st.empower && !b.st.empower) v += 9;
      if (a.st.haste && !b.st.haste) v += 3;
      if (a.st.guard && !b.st.guard) v += b.hp / b.maxHp < 0.6 ? 10 : 5;
      for (const k of ALLY_CURED) if (b.st[k] && !a.st[k]) v += 6;
    }
  }
  const en = s1.units.filter(o => o.team !== team && standing(o));
  s1.fx.forEach((f, k) => {
    if (!f) return;
    const f0 = s0.fx[k], x = k % N, z = (k / N) | 0;
    if (f.wall && !f0?.wall) v += en.some(e => cheb(e.x, e.z, x, z) <= 4) ? 2 : -1;
    if (f.smoke && !f0?.smoke) v += s1.units.some(a => a.team === team && standing(a) && a.hp < a.maxHp * 0.6 && cheb(a.x, a.z, x, z) <= 1) ? 1.2 : -0.4;
  });
  return v;
}

/** Prune ground-targeted skills to tiles that can matter. */
function aiTileWorth(s: BattleState, u: Unit, id: SkillId, t: Pos): boolean {
  const near = (team: Team, r: number) => s.units.some(o => standing(o) && o.team === team && cheb(o.x, o.z, t.x, t.z) <= r);
  const foe: Team = u.team === 0 ? 1 : 0;
  if (id === 'smokearrow') return near(u.team, 1) && near(foe, 5);
  if (id === 'barricade') return near(foe, 4);
  if (id === 'fireball') return near(foe, 1) || terrAt(s, t.x, t.z) === 'B';
  return near(foe, 1);
}

interface Plan { move: Pos | null; cast: { skill: SkillId; x: number; z: number } | null; score: number }

function aiPlan(s: BattleState, rng: Rng): Plan | null {
  const u = current(s);
  if (!u) return null;
  const positions: { x: number; z: number; moved: boolean }[] = [{ x: u.x, z: u.z, moved: false }];
  if (!u.moved) reachable(s, u).forEach(p => { const e = p[p.length - 1]; if (e) positions.push({ x: e.x, z: e.z, moved: true }); });
  let best: Plan | null = null;
  for (const p of positions) {
    let sm = s;
    if (p.moved) { sm = cloneState(s); if (!performMove(sm, p.x, p.z)) continue; }
    const cu = current(sm);
    if (!cu || !standing(cu)) continue;
    const base = tileScore(sm, cu, p.x, p.z) + (p.moved ? evalDelta(s, sm, u.team) : 0) + rng() * 0.3;
    let bc: Plan['cast'] = null, bcs = 0;
    for (const id of actionsOf(cu)) {
      if (!canUse(cu, id)) continue;
      const sk = SKILLS[id];
      castTargets(sm, cu, id).forEach((t: Target) => {
        if (sk.target === 'tile' && !aiTileWorth(sm, cu, id, t)) return;
        const c = cloneState(sm);
        if (!performCast(c, id, t.x, t.z)) return;
        const cc = getUnit(c, cu.id);
        let v = evalDelta(sm, c, u.team);
        if (cc && standing(cc) && (cc.x !== cu.x || cc.z !== cu.z)) v += tileScore(c, cc, cc.x, cc.z) - tileScore(sm, cu, cu.x, cu.z);
        if (sk.free) v -= 3;
        if (v > bcs) { bcs = v; bc = { skill: id, x: t.x, z: t.z }; }
      });
    }
    const total = base + bcs;
    if (!best || total > best.score) best = { move: p.moved ? { x: p.x, z: p.z } : null, cast: bc, score: total };
  }
  return best;
}

/** With a second move (Hit & Run) or a free action left: the best tile to stand on. */
function aiRetreat(s: BattleState): Pos | null {
  const u = current(s);
  if (!u || u.moved) return null;
  let best: Pos | null = null, bs = tileScore(s, u, u.x, u.z) + 0.5;
  reachable(s, u).forEach(p => {
    const e = p[p.length - 1];
    if (!e) return;
    const v = tileScore(s, u, e.x, e.z);
    if (v > bs) { bs = v; best = e; }
  });
  return best;
}

/** The commands for the current unit's whole activation, found by playing it out on a copy. */
export function aiTurn(state: BattleState, rng: Rng): Command[] {
  const s = cloneState(state), cmds: Command[] = [], u = current(s);
  if (!u) return cmds;
  const over = () => s.phase.kind === 'over';
  for (let step = 0; step < 3 && current(s) === u && !over(); step++) {
    const plan = aiPlan(s, rng);
    if (!plan) break;
    if (plan.move && performMove(s, plan.move.x, plan.move.z)) cmds.push({ kind: 'move', unit: u.id, to: plan.move });
    if (plan.cast && !over() && standing(u)) {
      const { skill, x, z } = plan.cast;
      const cast = performCast(s, skill, x, z);
      if (cast) cmds.push({ kind: 'cast', unit: u.id, skill, at: { x, z } });
      if (cast && SKILLS[skill].free && !u.acted) continue;
    }
    const r = aiRetreat(s);
    if (r && standing(u) && performMove(s, r.x, r.z)) cmds.push({ kind: 'move', unit: u.id, to: r });
    break;
  }
  if (current(s) === u && !over()) { endActivation(s); cmds.push({ kind: 'endTurn', unit: u.id }); }
  return cmds;
}

/** The unit with the best opening goes first; as starter, the next best closes the round. */
export function aiOrder(s: BattleState, team: Team, rng: Rng): UnitId[] {
  const sc = orderable(s, team).map(u => {
    if (isDowned(u)) return { id: u.id, v: -100 };
    const C = CLASSES[u.cls];
    let dmin = 99;
    for (const e of s.units) if (e.team !== team && standing(e)) dmin = Math.min(dmin, cheb(u.x, u.z, e.x, e.z));
    const reach = C.move + (u.mods.move || 0) + (C.basic.range > 1 ? C.basic.range + 1 : 1);
    let v = (dmin <= reach ? 6 : 0) - dmin * 0.3 + (u.cls === 'cleric' && s.units.some(a => a.team === team && isDowned(a)) ? 20 : 0) + (u.cls === 'warden' ? 2 : 0) + rng() * 0.5;
    if (u.st.stun) v -= 50;
    return { id: u.id, v };
  }).sort((a, b) => b.v - a.v).map(o => o.id);
  if (s.starter === team && sc.length >= 3) { const [second] = sc.splice(1, 1); if (second !== undefined) sc.push(second); }
  return sc;
}
