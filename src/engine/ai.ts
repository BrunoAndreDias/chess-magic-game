import {
  actionsOf, canDeploy, canUse, castTargets, cheb, cloneState, current, getUnit, idx, inb, isAlive, isDowned, los, reachable, standing, terrAt,
} from './board';
import type { Target } from './board';
import { landCall, performCast, performMove } from './combat';
import { doomed, threatened, toll } from './hazards';
import { orderable, endActivation } from './turns';
import { CLASSES, DIR8, MAPS, N, SKILLS } from './tables';
import type { Rng } from './rng';
import type { BattleState, Call, CallSkill, ClassId, Command, MemberBuild, Pos, SkillId, StatusKey, Team, Unit, UnitId } from './types';

function depthOf(team: Team, z: number): number { return team === 0 ? z : N - 1 - z; }

/** `ignoreMap` plays as if the map had no rule, so the sim can measure what playing around it is worth. */
export interface AiOpts { ignoreMap?: boolean }

const DEPLOY_FIRST: Record<ClassId, number> = { delver: 0, weaver: 1, astromancer: 2 };

export function aiDeploy(s: BattleState, team: Team, members: readonly MemberBuild[], rng: Rng, opts: AiOpts = {}): Pos[] {
  const pos: (Pos | null)[] = members.map(() => null), mid = (N - 1) / 2;
  const order = members.map((_m, i) => i).sort((a, b) => DEPLOY_FIRST[members[a]?.cls ?? 'delver'] - DEPLOY_FIRST[members[b]?.cls ?? 'delver']);
  for (const i of order) {
    const cls = members[i]?.cls;
    let best: Pos | null = null, bs = -1e9;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      if (!canDeploy(s, team, x, z) || pos.some(p => p && p.x === x && p.z === z)) continue;
      const d = depthOf(team, z), t = s.terr[idx(x, z)];
      let sc = rng() * 1.2 - Math.abs(x - mid) * 0.15;
      if (cls === 'delver') sc += d * 1.2;
      else if (cls === 'weaver') sc += d * 0.8;
      else sc += (t === '^' ? 4 : 0) + (d === 1 ? 1 : 0);
      if (t === '~') sc -= 3;
      if (!opts.ignoreMap && threatened(s, x, z, 1)) sc -= 6;
      for (const p of pos) {
        if (!p) continue;
        const dd = cheb(p.x, p.z, x, z);
        if (dd === 1) sc += 0.5;
        else if (dd > 3) sc -= 1;
      }
      if (sc > bs) { bs = sc; best = { x, z }; }
    }
    pos[i] = best;
  }
  return pos.map(p => { if (!p) throw new Error(`team ${team}: no deploy tile left`); return p; });
}

const ROLE_BAND: Record<ClassId, readonly [number, number]> = { delver: [1, 1], weaver: [1, 2], astromancer: [3, 5] };
/** What standing in a pending Call's area is likely to cost, in evalDelta's HP-like units. */
const CALL_DANGER: Record<CallSkill, number> = { meteor: 22, thunderhead: 16, gravitywell: 6, recall: 0 };

/** Favor urgency on the Sun Altar: 0 at the start, rising as either party nears the goal. */
function altarUrgency(s: BattleState): number {
  const r = MAPS[s.map].rule;
  return r.kind === 'altar' ? Math.max(s.favor[0], s.favor[1]) / r.goal : 0;
}

function onAltar(s: BattleState, u: Unit): boolean { return standing(u) && !u.under && s.terr[idx(u.x, u.z)] === 'A'; }

/** What the map rule will cost `u` at the end of this round, in evalDelta's HP-like units. */
function hazardCost(s: BattleState, u: Unit): number {
  if (!doomed(s, u)) return 0;
  if (!standing(u)) return 55;
  const t = toll(s, u);
  return t >= u.hp + u.shield ? 80 + u.hp * 0.5 : t;
}

function mapTileScore(s: BattleState, u: Unit, x: number, z: number): number {
  let sc = 0;
  // priced like evalDelta prices losing HP or going down, since aiPlan adds the two
  const t = toll(s, u), cost = t >= u.hp + u.shield ? 90 : t * 1.1;
  if (threatened(s, x, z)) sc -= cost;
  // next round's strike can still be dodged, but a Root or Stun before then would leave the unit in it
  else if (threatened(s, x, z, s.round + 1)) sc -= cost * 0.2;
  if (s.terr[idx(x, z)] === 'A') {
    const foe = u.team === 0 ? 1 : 0;
    sc += 5 + 8 * altarUrgency(s) + (s.favor[foe] >= s.favor[u.team] ? 3 : 0);
  }
  return sc;
}

function inCall(c: Call, x: number, z: number): boolean {
  const r = SKILLS[c.skill].aoe || 0;
  return cheb(c.x, c.z, x, z) <= r;
}

/** `hidden`: score it as if `u` had just burrowed there. */
export function tileScore(s: BattleState, u: Unit, x: number, z: number, opts: AiOpts = {}, hidden = u.under >= 2): number {
  const en = s.units.filter(o => o.team !== u.team && standing(o));
  if (!en.length) return 0;
  let sc = 0, dmin = 99;
  const band = ROLE_BAND[u.cls], hpR = u.hp / u.maxHp, t = terrAt(s, x, z), f = s.fx[idx(x, z)];
  for (const e of en) dmin = Math.min(dmin, cheb(x, z, e.x, e.z));
  if (hpR < 0.3 && u.cls !== 'delver') sc += Math.min(dmin, 7) * 1.2;
  else { if (dmin > band[1]) sc -= (dmin - band[1]) * 3; if (dmin < band[0]) sc -= (band[0] - dmin) * 2.5; }
  if (!hidden) {
    let threats = 0;
    for (const e of en) if (!e.under && cheb(x, z, e.x, e.z) <= 5 && los(s, e.x, e.z, x, z)) threats++;
    sc -= threats * (u.cls === 'delver' ? 0.4 : 0.9) * (hpR < 0.5 ? 1.6 : 1);
  }
  for (const c of s.calls) {
    const caster = getUnit(s, c.by);
    if (!caster || (caster.team === u.team && caster.mods.benevolent)) continue;
    if (hidden && c.skill !== 'meteor') continue;
    if (inCall(c, x, z)) sc -= CALL_DANGER[c.skill] * (caster.team === u.team ? 0.8 : 1);
  }
  if (f?.fire) sc -= 14;
  if (f?.web && u.cls !== 'weaver') sc -= 3;
  if (t === '~' && s.units.some(e => e.team !== u.team && standing(e) && e.cls === 'astromancer')) sc -= 3;
  if (t === '^' && u.cls === 'astromancer') sc += 3;
  if (t === '+' && hpR < 0.8) sc += 3;
  if (!opts.ignoreMap) sc += mapTileScore(s, u, x, z);
  for (const [dx, dz] of DIR8) {
    const nx = x + dx, nz = z + dz;
    if (inb(nx, nz) && terrAt(s, nx, nz) === 'o' && en.some(e => e.cls !== 'astromancer' && cheb(e.x, e.z, x, z) <= 4)) { sc -= 2.5; break; }
  }
  for (const a of s.units) {
    if (a.team !== u.team || !isAlive(a) || a.id === u.id) continue;
    const d = cheb(a.x, a.z, x, z);
    if (isDowned(a)) sc += d <= 1 ? 6 : -d * 0.8;
    else if (u.cls === 'weaver') sc += d <= 2 ? 1 : -(d - 2) * 0.4;
    else if (d > 5) sc -= 0.4;
  }
  return sc;
}

const ENEMY_GAIN: readonly [StatusKey, number][] = [['stun', 16], ['encased', 16], ['root', 7], ['expose', 6], ['wet', 3], ['burn', 6], ['poison', 8]];
const ALLY_CURED: readonly StatusKey[] = ['stun', 'root', 'burn', 'poison', 'expose'];
const ALLY_HURT: readonly [StatusKey, number][] = [['stun', 13], ['root', 5], ['expose', 5], ['burn', 5], ['poison', 6]];
const CALL_DISCOUNT = 0.6;

function sameCall(a: Call, b: Call): boolean { return a.by === b.by && a.skill === b.skill && a.x === b.x && a.z === b.z; }

/** What a Call would do if it landed on `s` right now, at full power. */
function callValue(s: BattleState, call: Call, team: Team, opts: AiOpts): number {
  const c = cloneState(s), caster = getUnit(c, call.by);
  if (!caster || !standing(caster)) return 0;
  c.calls = c.calls.filter(k => !sameCall(k, call));
  landCall(c, caster, call, 1, []);
  return evalDelta(s, c, team, opts, false);
}

/** How much better s1 is than s0 for `team`. `foresee` also values the Calls cast or given up between them. */
function evalDelta(s0: BattleState, s1: BattleState, team: Team, opts: AiOpts, foresee = true): number {
  let v = opts.ignoreMap ? 0 : mapDelta(s0, s1, team);
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
      if (a.st.encased && !b.st.encased) v += isDowned(a) ? 30 : a.hp / a.maxHp < 0.35 ? 12 : -8;
      if (!standing(a)) continue;
      const d = b.hp - a.hp;
      v += d > 0 ? -d * 1.1 : -d * (b.hp / b.maxHp < 0.5 ? 1.3 : 0.9);
      const sg = a.shield - b.shield;
      if (sg > 0) v += sg * 0.45;
      if (a.st.share && !b.st.share) v += 4 * s1.threads.filter(t => t.by === a.id && getUnit(s1, t.to)?.team === team).length - 2;
      for (const k of ALLY_CURED) if (b.st[k] && !a.st[k]) v += 6;
      for (const [k, w] of ALLY_HURT) if (a.st[k] && !b.st[k]) v -= w;
    }
  }
  v += threadDelta(s0, s1, team);
  const en = s1.units.filter(o => o.team !== team && standing(o) && !o.under);
  const near = (x: number, z: number, r: number) => en.some(e => cheb(e.x, e.z, x, z) <= r);
  let webs = 0;
  s1.fx.forEach((f, k) => {
    if (!f) return;
    const f0 = s0.fx[k], x = k % N, z = (k / N) | 0;
    if (f.web && !f0?.web && webs < 6 && near(x, z, 1)) { v += 1; webs++; }
    if ((f.sink && !f0?.sink) || (f.pit && !f0?.pit)) v += near(x, z, 1) ? 2 : -0.5;
    if (f.charge !== undefined && f0?.charge === undefined) v += near(x, z, 2) ? 4 : -0.5;
  });
  if (s1.mouths.length > s0.mouths.length) v += 0.5;
  if (!foresee) return v;
  for (const call of s1.calls) {
    if (s0.calls.some(k => sameCall(k, call))) continue;
    v += CALL_DISCOUNT * callValue(s1, call, team, opts);
  }
  for (const call of s0.calls) {
    if (call.team !== team || s1.calls.some(k => sameCall(k, call))) continue;
    const by = getUnit(s1, call.by);
    if (by && standing(by)) v -= CALL_DISCOUNT * callValue(s0, call, team, opts);
  }
  return v;
}

/** Threads tied by `team`'s Weavers: a new one on an enemy +6, on an ally +2; losing one −4. */
function threadDelta(s0: BattleState, s1: BattleState, team: Team): number {
  let v = 0;
  const ours = (s: BattleState, by: UnitId) => getUnit(s, by)?.team === team;
  for (const t of s1.threads) {
    if (!ours(s1, t.by) || s0.threads.some(o => o.by === t.by && o.to === t.to)) continue;
    v += getUnit(s1, t.to)?.team === team ? 2 : 6;
  }
  for (const t of s0.threads) if (ours(s0, t.by) && !s1.threads.some(o => o.by === t.by && o.to === t.to)) v -= 4;
  return v;
}

/** Enemies left doomed or knocked off the altar; the acting unit's own tile is tileScore's job. */
function mapDelta(s0: BattleState, s1: BattleState, team: Team): number {
  let v = 0;
  const cur = current(s1)?.id, altar = 6 + 10 * altarUrgency(s1);
  for (const a of s1.units) {
    const b = getUnit(s0, a.id);
    if (!b || a.id === cur) continue;
    const sign = a.team === team ? -1 : 1;
    v += sign * (hazardCost(s1, a) - hazardCost(s0, b));
    if (onAltar(s0, b) && !onAltar(s1, a)) v += sign * altar;
  }
  return v;
}

/** Prune ground-targeted skills to tiles that can matter. */
function aiTileWorth(s: BattleState, u: Unit, id: SkillId, t: Pos): boolean {
  const near = (team: Team, r: number) => s.units.some(o => standing(o) && !o.under && o.team === team && cheb(o.x, o.z, t.x, t.z) <= r);
  const foe: Team = u.team === 0 ? 1 : 0;
  switch (id) {
    case 'puppet': return true;
    case 'meteor': return near(foe, 1) || terrAt(s, t.x, t.z) === 'B';
    case 'gravitywell': case 'web': case 'satchel': return near(foe, 2);
    case 'warren': return near(u.team, 2) && near(foe, 5);
    default: return near(foe, 1);
  }
}

interface Plan { move: Pos | null; cast: { skill: SkillId; x: number; z: number } | null; score: number }

function aiPlan(s: BattleState, rng: Rng, opts: AiOpts): Plan | null {
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
    let base = tileScore(sm, cu, p.x, p.z, opts) + (p.moved ? evalDelta(s, sm, u.team, opts) : 0) + rng() * 0.3;
    // staying put keeps Burrow open for after the cast
    if (!p.moved && canUse(sm, cu, 'burrow') && exposed(sm, cu)) base += Math.max(0, tileScore(sm, cu, p.x, p.z, opts, true) - tileScore(sm, cu, p.x, p.z, opts));
    let bc: Plan['cast'] = null, bcs = 0;
    for (const id of actionsOf(cu)) {
      if (id === 'burrow' || !canUse(sm, cu, id)) continue;
      const sk = SKILLS[id];
      castTargets(sm, cu, id).forEach((t: Target) => {
        if (sk.target === 'tile' && !aiTileWorth(sm, cu, id, t)) return;
        const c = cloneState(sm);
        if (!performCast(c, id, t.x, t.z)) return;
        const cc = getUnit(c, cu.id);
        let v = evalDelta(sm, c, u.team, opts);
        if (cc && standing(cc) && (cc.x !== cu.x || cc.z !== cu.z || cc.under !== cu.under)) v += tileScore(c, cc, cc.x, cc.z, opts) - tileScore(sm, cu, cu.x, cu.z, opts);
        if (sk.free) v -= 3;
        if (v > bcs) { bcs = v; bc = { skill: id, x: t.x, z: t.z }; }
      });
    }
    const total = base + bcs;
    if (!best || total > best.score) best = { move: p.moved ? { x: p.x, z: p.z } : null, cast: bc, score: total };
  }
  return best;
}

/** With the move still unused: the best tile to stand on. */
function aiRetreat(s: BattleState, opts: AiOpts): Pos | null {
  const u = current(s);
  if (!u || u.moved) return null;
  let best: Pos | null = null, bs = tileScore(s, u, u.x, u.z, opts) + 0.5;
  reachable(s, u).forEach(p => {
    const e = p[p.length - 1];
    if (!e) return;
    const v = tileScore(s, u, e.x, e.z, opts);
    if (v > bs) { bs = v; best = e; }
  });
  return best;
}

/** Worth hiding: an enemy within 5 can see it, or it is below 60% HP. */
function exposed(s: BattleState, u: Unit): boolean {
  if (u.hp < u.maxHp * 0.6) return true;
  return s.units.some(e => e.team !== u.team && standing(e) && !e.under && cheb(e.x, e.z, u.x, u.z) <= 5 && los(s, e.x, e.z, u.x, u.z));
}

/** The commands for the current unit's whole activation, found by playing it out on a copy. */
export function aiTurn(state: BattleState, rng: Rng, opts: AiOpts = {}): Command[] {
  const s = cloneState(state), cmds: Command[] = [], u = current(s);
  if (!u) return cmds;
  const over = () => s.phase.kind === 'over';
  for (let step = 0; step < 4 && current(s) === u && !over() && standing(u); step++) {
    const plan = aiPlan(s, rng, opts);
    // once it has acted, only a free skill is worth another plan; positioning is left to Burrow or the retreat
    if (!plan || (u.acted && !plan.cast)) break;
    if (plan.move && performMove(s, plan.move.x, plan.move.z)) cmds.push({ kind: 'move', unit: u.id, to: plan.move });
    if (!plan.cast || over() || !standing(u)) break;
    const { skill, x, z } = plan.cast;
    if (!performCast(s, skill, x, z)) break;
    cmds.push({ kind: 'cast', unit: u.id, skill, at: { x, z } });
  }
  if (current(s) === u && !over() && standing(u) && !u.moved) {
    if (canUse(s, u, 'burrow') && exposed(s, u)) {
      if (performCast(s, 'burrow', u.x, u.z)) cmds.push({ kind: 'cast', unit: u.id, skill: 'burrow', at: { x: u.x, z: u.z } });
    } else {
      const r = aiRetreat(s, opts);
      if (r && performMove(s, r.x, r.z)) cmds.push({ kind: 'move', unit: u.id, to: r });
    }
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
    const reach = C.move + (C.basic.range > 1 ? C.basic.range + 1 : 1);
    let v = (dmin <= reach ? 6 : 0) - dmin * 0.3 + (u.cls === 'delver' ? 2 : 0) + rng() * 0.5;
    if (s.calls.some(c => c.by === u.id)) v += 8;
    if (u.st.stun || u.st.encased) v -= 50;
    return { id: u.id, v };
  }).sort((a, b) => b.v - a.v).map(o => o.id);
  if (s.starter === team && sc.length >= 3) { const [second] = sc.splice(1, 1); if (second !== undefined) sc.push(second); }
  return sc;
}
