import {
  BAD_KEYS, canUse, castTargets, cdOf, cheb, current, dragLanding, getUnit, idx, inb, isAlive, isDowned, isSolid, landingNear, los,
  nearestFree, onHigh, puppetMoves, reachable, sign, square, standing, terrAt, threadCap, unitAt, unitsIn,
} from './board';
import { BLEED, CLASSES, DARK_ROUND, DIR8, N, SKILLS, isCall } from './tables';
import type { SkillDef } from './tables';
import type {
  BasicSkillId, BattleEvent, BattleState, Call, CallSkill, ClassSkillId, ComboName, DamageKind, InnateSkillId, Pos, SkillId, Statuses, StatusKey, Team,
  TileFx, Unit, UnitId,
} from './types';

type CastEvent = Extract<BattleEvent, { type: 'cast' }>;
type SkillKey = Exclude<ClassSkillId | InnateSkillId, CallSkill> | 'basic' | 'helpup';
type Fx = Exclude<keyof TileFx, 'spent' | 'charge'>;
/** `full`: SLAM into obstacles, ABYSS into chasms. `soft`: stop short. */
type Physics = 'full' | 'soft';

/** Whoever is acting: a caster, a Call landing (`power` 0.5 for Snap and Deep Impact echoes), a Satchel's owner. */
interface Ctx { s: BattleState; u: Unit; ev: BattleEvent[]; power: number }
interface CastCtx extends Ctx { skill: SkillDef; tx: number; tz: number; target: Unit | null; cast: CastEvent }
interface LandCtx extends Ctx { call: Call; x: number; z: number; tiles: Pos[]; victims: Unit[] }
interface Combo { name: ComboName; mult: number; setup: UnitId | null }

function setFx(s: BattleState, x: number, z: number, key: Fx, val: number): void {
  const k = idx(x, z);
  const f = s.fx[k] ?? (s.fx[k] = {});
  f[key] = val;
}
function clearFx(s: BattleState, x: number, z: number, key: Fx | 'charge'): void {
  const k = idx(x, z), f = s.fx[k];
  if (!f) return;
  delete f[key];
  if (fxEmpty(f)) s.fx[k] = undefined;
}
export function fxEmpty(f: TileFx): boolean {
  for (const _ in f) return false;
  return true;
}

export function checkWinner(s: BattleState): void {
  if (s.phase.kind === 'over') return;
  const a = s.units.some(u => u.team === 0 && standing(u)), b = s.units.some(u => u.team === 1 && standing(u));
  if (!a && !b) s.phase = { kind: 'over', winner: 'draw', reason: 'mutual' };
  else if (!a) s.phase = { kind: 'over', winner: 1, reason: 'wipe' };
  else if (!b) s.phase = { kind: 'over', winner: 0, reason: 'wipe' };
}

// ---------- damage ----------
function emitCombo(s: BattleState, ev: BattleEvent[], name: ComboName, src: Unit, id: UnitId | null, setup: UnitId | null): void {
  s.combos[src.team]++;
  ev.push({ type: 'combo', name, id, by: src.id, team: src.team, setup });
}
function srcMult(s: BattleState, u: Unit, tgt: Unit, kind: DamageKind): number {
  const m = u.mods;
  let v = 1;
  if (kind === 'fire') v *= 1 + (m.fireDmg || 0);
  if (kind === 'frost') v *= 1 + (m.frostDmg || 0);
  if (u.surfaced) v *= 1 + (m.surfaceDmg || 0);
  if (onHigh(s, u) && terrAt(s, tgt.x, tgt.z) !== '^' && cheb(u.x, u.z, tgt.x, tgt.z) > 1) v *= 1.15;
  for (const t of s.threads) {
    if (t.to !== u.id || t.by === tgt.id) continue;
    const w = getUnit(s, t.by);
    if (w && w.team !== u.team && standing(w) && w.mods.leashDmg) { v *= 1 - w.mods.leashDmg; break; }
  }
  return v;
}

/** The standing ally of `o` holding it under Shared Pain. */
function sharer(s: BattleState, o: Unit): Unit | null {
  for (const t of s.threads) {
    if (t.to !== o.id) continue;
    const w = getUnit(s, t.by);
    if (w && w !== o && w.team === o.team && standing(w) && w.st.share) return w;
  }
  return null;
}
/** The standing ally Weaver with Fate Weaver holding `o`, if `o` hasn't been spared yet. */
function fateWeaver(s: BattleState, o: Unit): Unit | null {
  if (o.spared) return null;
  for (const t of s.threads) {
    if (t.to !== o.id) continue;
    const w = getUnit(s, t.by);
    if (w && w !== o && w.team === o.team && standing(w) && w.mods.fateWeaver) return w;
  }
  return null;
}

/** Raw damage to one unit (no attacker scaling): underground and Encased immunity, Shared Pain, shields, Fate Weaver, downing, finishing. */
export function damage(s: BattleState, o: Unit, amt: number, ev: BattleEvent[], kind: DamageKind, src: Unit | null): number {
  if (!isAlive(o) || amt <= 0 || o.under || o.st.encased) return 0;
  if (isDowned(o)) {
    o.life = { kind: 'dead' };
    ev.push({ type: 'death', id: o.id, team: o.team, cause: 'finished' });
    if (src && isAlive(src)) emitCombo(s, ev, 'EXECUTE', src, o.id, null);
    checkWinner(s);
    return 0;
  }
  if (o.mods.earthbreaker) amt *= 0.85;
  amt = Math.round(amt);
  const w = kind === 'share' ? null : sharer(s, o);
  if (w) {
    const half = Math.round(amt / 2);
    amt -= half;
    ev.push({ type: 'shared', id: o.id, by: w.id });
    damage(s, w, half, ev, 'share', null);
  }
  const ab = Math.min(o.shield, amt);
  o.shield -= ab;
  let d = amt - ab;
  const fw = d >= o.hp ? fateWeaver(s, o) : null;
  if (fw) d = o.hp - 1;
  o.hp -= d;
  if (src) s.stats.dmg[src.team] += d + ab;
  ev.push({ type: 'damage', id: o.id, amount: d, absorbed: ab, kind });
  if (fw) { o.spared = true; encase(o, 1, fw.id, false, ev); }
  if (o.hp <= 0) down(s, o, ev, src);
  return d;
}
export function down(s: BattleState, o: Unit, ev: BattleEvent[], src: Unit | null): void {
  o.life = { kind: 'downed', bleed: BLEED };
  o.shield = 0; o.st = {}; o.hp = 0; o.under = 0;
  if (src) s.stats.downs[src.team]++;
  ev.push({ type: 'downed', id: o.id, team: o.team });
  if (s.calls.some(c => c.by === o.id)) {
    s.calls = s.calls.filter(c => c.by !== o.id);
    ev.push({ type: 'fizzle', id: o.id });
  }
  checkWinner(s);
}
/** An attack: attacker scaling × Exposed × combo × the context's power. Downed targets are finished. */
function hit(c: Ctx, o: Unit | null, base: number, kind: DamageKind, combo?: Combo | null): number {
  const s = c.s, u = c.u;
  if (!o || !isAlive(o) || o.under) return 0;
  if (isDowned(o)) { damage(s, o, 1, c.ev, kind, u); return 0; }
  let mult = srcMult(s, u, o, kind) * (o.st.expose ? 1.25 : 1) * c.power;
  if (combo) { mult *= combo.mult; emitCombo(s, c.ev, combo.name, u, o.id, combo.setup); }
  return damage(s, o, base * mult, c.ev, kind, u);
}
export function addStatus<K extends StatusKey>(o: Unit, key: K, val: NonNullable<Statuses[K]>, ev: BattleEvent[]): void {
  if (!standing(o) || o.under) return;
  if (key === 'burn' && o.st.wet) { ev.push({ type: 'steam', id: o.id }); return; }
  o.st[key] = val;
  if (key === 'wet' && o.st.burn) delete o.st.burn;
  ev.push({ type: 'status', id: o.id, key });
}
/** Encased: skips its turns, takes no damage, can't be moved. The only status a Downed unit can take (Cocoon, Fate Weaver). */
function encase(o: Unit, t: number, by: UnitId, ice: boolean, ev: BattleEvent[]): void {
  if (!isAlive(o) || o.under) return;
  o.st.encased = { t, by, ice };
  ev.push({ type: 'encased', id: o.id });
}
/** A Root that still holds on the unit's next turn, even when it lands during its own. */
function root(s: BattleState, o: Unit, by: UnitId | null, ev: BattleEvent[]): void {
  addStatus(o, 'root', { t: current(s) === o ? 2 : 1, by }, ev);
}
export function heal(s: BattleState, o: Unit, amt: number, ev: BattleEvent[], src: Unit | null): number {
  if (!standing(o)) return 0;
  if (s.round >= DARK_ROUND) amt /= 2;
  const h = Math.min(Math.round(amt), o.maxHp - o.hp);
  o.hp += h;
  if (src) s.stats.heal[src.team] += h;
  ev.push({ type: 'heal', id: o.id, amount: h });
  return h;
}
function shield(o: Unit, amt: number, ev: BattleEvent[]): void {
  o.shield = Math.max(o.shield, amt);
  ev.push({ type: 'shield', id: o.id, amount: amt });
}
function revive(s: BattleState, o: Unit, frac: number, ev: BattleEvent[], src: Unit): void {
  o.life = { kind: 'up' };
  delete o.st.encased;
  o.hp = Math.max(1, Math.round(o.maxHp * frac));
  s.stats.revives[o.team]++;
  ev.push({ type: 'revive', id: o.id, by: src.id });
}

// ---------- the map reacting ----------
function physicsOf(c: Ctx, o: Unit): Physics { return o.team === c.u.team ? 'soft' : 'full'; }

/**
 * Forced movement toward (px, pz) (`dir` 1) or away from it (`dir` -1), re-aimed every step.
 * `full` physics SLAMs into walls, units and the edge and drops into chasms (ABYSS); `soft` stops short.
 */
function pull(c: Ctx, o: Unit, px: number, pz: number, dist: number, kind: Physics, dir: 1 | -1): void {
  const s = c.s;
  if (!standing(o) || o.under || o.st.encased || dist <= 0) return;
  const path: Pos[] = [{ x: o.x, z: o.z }];
  const slide = () => { if (path.length > 1) c.ev.push({ type: 'move', id: o.id, path, slide: true }); };
  for (let k = 0; k < dist; k++) {
    const dx = sign(px - o.x) * dir, dz = sign(pz - o.z) * dir;
    if (!dx && !dz) break;
    const nx = o.x + dx, nz = o.z + dz, t = terrAt(s, nx, nz);
    if (inb(nx, nz) && t === 'o') {
      if (kind === 'soft') break;
      path.push({ x: nx, z: nz });
      c.ev.push({ type: 'move', id: o.id, path, slide: true });
      c.ev.push({ type: 'fall', id: o.id, x: nx, z: nz });
      emitCombo(s, c.ev, 'ABYSS', c.u, o.id, null);
      o.x = nx; o.z = nz;
      down(s, o, c.ev, c.u);
      return;
    }
    if (!inb(nx, nz) || isSolid(s, nx, nz) || unitAt(s, nx, nz)) {
      if (kind === 'soft') break;
      c.ev.push({ type: 'move', id: o.id, path, slide: true });
      if (t === 'B' && inb(nx, nz)) burstBrazier(c, nx, nz);
      emitCombo(s, c.ev, 'SLAM', c.u, o.id, null);
      damage(s, o, 6, c.ev, 'slam', c.u);
      addStatus(o, 'stun', { t: 1, by: c.u.id }, c.ev);
      if (path.length > 1) arrive(s, o, c.ev);
      return;
    }
    o.x = nx; o.z = nz;
    path.push({ x: nx, z: nz });
  }
  if (path.length < 2) return;
  slide();
  arrive(s, o, c.ev);
}
function burstBrazier(c: Ctx, x: number, z: number): void {
  const s = c.s;
  if (s.fx[idx(x, z)]?.spent) return;
  const k = idx(x, z);
  (s.fx[k] ?? (s.fx[k] = {})).spent = true;
  c.ev.push({ type: 'burst', x, z });
  emitCombo(s, c.ev, 'IGNITE', c.u, null, null);
  for (const [dx, dz] of DIR8) igniteTile(c, x + dx, z + dz, 3);
}
/** Fire on a tile: burns a web away and sets whoever stands there Burning. */
function igniteTile(c: Ctx, x: number, z: number, turns: number): void {
  const s = c.s;
  if (!inb(x, z)) return;
  const t = terrAt(s, x, z);
  if (t === '#' || t === 'o' || t === '~' || t === 'I' || t === 'B') return;
  clearFx(s, x, z, 'web');
  setFx(s, x, z, 'fire', turns);
  c.ev.push({ type: 'fire', x, z });
  const o = unitAt(s, x, z);
  if (o && !isDowned(o)) addStatus(o, 'burn', { t: 2, dmg: 6 + (c.u.mods.burnDmg || 0), by: c.u.id }, c.ev);
}
/** Ending any move on a tile: water wets, fire burns, a web Roots a non-Weaver, and an enemy's Satchel next to it blows. */
export function arrive(s: BattleState, o: Unit, ev: BattleEvent[]): void {
  if (!standing(o) || o.under) return;
  const t = terrAt(s, o.x, o.z), f = s.fx[idx(o.x, o.z)];
  if (t === '~') addStatus(o, 'wet', { t: 2, by: null }, ev);
  else if (f?.fire && !o.st.burn) addStatus(o, 'burn', { t: 2, dmg: 6, by: null }, ev);
  if (f?.web && o.cls !== 'weaver') root(s, o, null, ev);
  for (const p of square(o.x, o.z, 1)) {
    const by = s.fx[idx(p.x, p.z)]?.charge;
    if (by === undefined) continue;
    const d = getUnit(s, by);
    if (d && d.team !== o.team) blow(s, p.x, p.z, ev);
  }
}
/** A Satchel Charge goes off: 20 (+Black Powder) to every unit within 1, each pushed 1 straight away from it. */
function blow(s: BattleState, x: number, z: number, ev: BattleEvent[]): void {
  const owner = getUnit(s, s.fx[idx(x, z)]?.charge);
  clearFx(s, x, z, 'charge');
  if (!owner) return;
  ev.push({ type: 'blast', x, z });
  const c: Ctx = { s, u: owner, ev, power: 1 }, caught = unitsIn(s, square(x, z, 1));
  for (const o of caught) hit(c, o, 20 + (owner.mods.satchelDmg || 0), 'phys');
  for (const o of caught) pull(c, o, x, z, 1, physicsOf(c, o), -1);
}
function chargeOf(s: BattleState, u: Unit): Pos | null {
  for (let k = 0; k < s.fx.length; k++) if (s.fx[k]?.charge === u.id) return { x: k % N, z: (k / N) | 0 };
  return null;
}

// ---------- underground ----------
function addMouth(s: BattleState, u: Unit, x: number, z: number, ev: BattleEvent[]): void {
  s.mouths = s.mouths.filter(m => m.x !== x || m.z !== z);
  s.mouths.push({ team: u.team, net: u.id, x, z, t: 3 + (u.mods.mouthTurns || 0) });
  ev.push({ type: 'mouth', team: u.team, x, z });
}
/** Up on its tile, or the nearest free one: a new mouth, and its Satchel blows. */
export function surface(s: BattleState, u: Unit, ev: BattleEvent[]): void {
  const at = nearestFree(s, u.x, u.z, u);
  u.under = 0; u.surfaced = true;
  if (at) { u.x = at.x; u.z = at.z; }
  ev.push({ type: 'surface', id: u.id, x: u.x, z: u.z });
  addMouth(s, u, u.x, u.z, ev);
  const ch = chargeOf(s, u);
  if (ch) blow(s, ch.x, ch.z, ev);
  arrive(s, u, ev);
}
/** A Quake under an enemy: forced up and Stunned. */
function quake(c: Ctx, o: Unit): void {
  if (!o.under || o.team === c.u.team || !standing(o)) return;
  surface(c.s, o, c.ev);
  addStatus(o, 'stun', { t: 1, by: c.u.id }, c.ev);
}

// ---------- threads ----------
function tie(s: BattleState, w: Unit, o: Unit, ev: BattleEvent[]): void {
  const len = Math.max(1, cheb(w.x, w.z, o.x, o.z)), old = s.threads.find(t => t.by === w.id && t.to === o.id);
  if (old) old.len = len;
  else {
    const mine = s.threads.filter(t => t.by === w.id);
    const drop = mine.length >= threadCap(s, w) ? mine[0] : undefined;
    if (drop) { s.threads = s.threads.filter(t => t !== drop); ev.push({ type: 'snap', by: drop.by, to: drop.to }); }
    s.threads.push({ by: w.id, to: o.id, len });
  }
  ev.push({ type: 'thread', by: w.id, to: o.id });
}
/** A Thread breaks once its ends lose sight of each other, or either is underground, Downed or Burning. */
export function breakThreads(s: BattleState, ev: BattleEvent[]): void {
  if (!s.threads.length) return;
  s.threads = s.threads.filter(t => {
    const a = getUnit(s, t.by), b = getUnit(s, t.to);
    const ok = !!a && !!b && standing(a) && standing(b) && !a.under && !b.under && !a.st.burn && !b.st.burn && los(s, a.x, a.z, b.x, b.z);
    if (!ok) ev.push({ type: 'snap', by: t.by, to: t.to });
    return ok;
  });
}
/** Web of Fate: an enemy held more than 2 away at the end of its turn is pulled back to 2 and takes 12. */
export function webOfFate(s: BattleState, o: Unit, ev: BattleEvent[]): void {
  for (const t of s.threads.slice()) {
    const w = getUnit(s, t.by);
    if (t.to !== o.id || !w || w.team === o.team || !w.mods.webOfFate || !standing(w) || !standing(o)) continue;
    const d = cheb(w.x, w.z, o.x, o.z);
    if (d <= 2) continue;
    const c: Ctx = { s, u: w, ev, power: 1 };
    pull(c, o, w.x, w.z, d - 2, 'full', 1);
    hit(c, o, 12, 'phys');
  }
}

// ---------- the skills, one handler each ----------
function tgt(c: CastCtx): Unit {
  if (!c.target) throw new Error(`${c.skill.name} needs a unit target`);
  return c.target;
}
function burn(c: Ctx): NonNullable<Statuses['burn']> { return { t: 2, dmg: 6 + (c.u.mods.burnDmg || 0), by: c.u.id }; }
function poison(c: Ctx): NonNullable<Statuses['poison']> { return { t: 3, dmg: 6 + (c.u.mods.poisonDmg || 0), by: c.u.id }; }
function teleport(c: Ctx, o: Unit, at: Pos): void {
  c.ev.push({ type: 'teleport', id: o.id, x: at.x, z: at.z });
  o.x = at.x; o.z = at.z;
  arrive(c.s, o, c.ev);
}

const RUN: Record<SkillKey, (c: CastCtx) => void> = {
  basic(c) { hit(c, tgt(c), CLASSES[c.u.cls].basic.dmg + (c.u.mods.basicDmg || 0), 'phys'); },
  helpup(c) { revive(c.s, tgt(c), 0.3, c.ev, c.u); },

  burrow(c) {
    const u = c.u;
    u.under = 2; u.moved = true;
    c.ev.push({ type: 'burrow', id: u.id, x: u.x, z: u.z });
    addMouth(c.s, u, u.x, u.z, c.ev);
  },
  upheaval(c) {
    const o = tgt(c), u = c.u;
    hit(c, o, 18 + (u.mods.upheavalDmg || 0), 'phys');
    pull(c, o, u.x, u.z, 1, 'full', -1);
    if (u.mods.undertow) u.under = 2;
  },
  undermine(c) {
    if (c.u.mods.quickSink) { openPit(c.s, c.tx, c.tz, c.ev); return; }
    setFx(c.s, c.tx, c.tz, 'sink', 1);
    c.ev.push({ type: 'terrain', tiles: [{ x: c.tx, z: c.tz }], kind: 'sink' });
  },
  satchel(c) {
    const old = chargeOf(c.s, c.u);
    if (old) clearFx(c.s, old.x, old.z, 'charge');
    const k = idx(c.tx, c.tz);
    (c.s.fx[k] ?? (c.s.fx[k] = {})).charge = c.u.id;
    c.ev.push({ type: 'charge', x: c.tx, z: c.tz });
  },
  dragunder(c) {
    const o = tgt(c), at = dragLanding(c.s, c.u);
    if (!at) return;
    if (o.life.kind === 'downed') {
      o.life = { kind: 'downed', bleed: o.life.bleed + 1 };
      c.ev.push({ type: 'teleport', id: o.id, x: at.x, z: at.z });
      o.x = at.x; o.z = at.z;
      return;
    }
    teleport(c, o, at);
  },
  tremor(c) {
    const s = c.s, u = c.u;
    for (const o of s.units) {
      if (o.team === u.team || !standing(o) || cheb(o.x, o.z, u.x, u.z) > 2) continue;
      if (o.under) quake(c, o);
      else root(s, o, u.id, c.ev);
    }
  },
  stoneskin(c) {
    const s = c.s, u = c.u;
    shield(u, 30, c.ev);
    if (!s.mouths.some(m => m.team === u.team && m.x === u.x && m.z === u.z)) return;
    for (const a of s.units) if (a !== u && a.team === u.team && standing(a) && !a.under && cheb(a.x, a.z, u.x, u.z) <= 1) shield(a, 15, c.ev);
  },
  warren(c) { addMouth(c.s, c.u, c.tx, c.tz, c.ev); },

  snap(c) {
    const call = c.s.calls.find(k => k.by === c.u.id);
    if (!call) return;
    c.s.calls = c.s.calls.filter(k => k !== call);
    landCall(c.s, c.u, call, 0.5, c.ev);
  },
  frostbolt(c) {
    const s = c.s, o = tgt(c), wet = o.st.wet;
    hit(c, o, 12, 'frost', wet ? { name: 'FREEZE', mult: 1, setup: wet.by } : null);
    if (standing(o)) {
      if (wet) { delete o.st.wet; addStatus(o, 'stun', { t: 1, by: c.u.id }, c.ev); }
      else root(s, o, c.u.id, c.ev);
    }
    const iced: Pos[] = [];
    for (const t of square(o.x, o.z, 1)) if (terrAt(s, t.x, t.z) === '~') { setFx(s, t.x, t.z, 'ice', 3); iced.push(t); }
    if (iced.length) c.ev.push({ type: 'terrain', tiles: iced, kind: 'ice' });
  },
  firebolt(c) {
    const o = tgt(c), b = o.st.burn;
    if (b) {
      delete o.st.burn;
      hit(c, o, 12 + b.dmg * b.t * 3, 'fire', { name: 'COMBUST', mult: 1, setup: b.by });
      return;
    }
    hit(c, o, 14, 'fire');
    if (standing(o)) addStatus(o, 'burn', burn(c), c.ev);
  },
  prison(c) {
    const o = tgt(c);
    encase(o, o.team !== c.u.team && c.u.mods.absZero ? 2 : 1, c.u.id, true, c.ev);
  },

  tether(c) { tie(c.s, c.u, tgt(c), c.ev); },
  reel(c) {
    const s = c.s, u = c.u, feast = !!u.mods.feast;
    const held = s.threads.filter(t => t.by === u.id).map(t => getUnit(s, t.to)).filter((o): o is Unit => !!o && standing(o));
    held.sort((a, b) => cheb(a.x, a.z, u.x, u.z) - cheb(b.x, b.z, u.x, u.z));
    for (const o of held) {
      const d = cheb(o.x, o.z, u.x, u.z), foe = o.team !== u.team, from = { x: o.x, z: o.z };
      pull(c, o, u.x, u.z, foe && feast ? d - 1 : Math.min(2, d - 1), physicsOf(c, o), 1);
      if (!feast || !foe || !standing(o) || (o.x === from.x && o.z === from.z) || cheb(o.x, o.z, u.x, u.z) > 1) continue;
      hit(c, o, 12, 'phys');
      if (standing(o)) addStatus(o, 'poison', poison(c), c.ev);
    }
  },
  web(c) {
    const s = c.s, turns = 3 + (c.u.mods.webTurns || 0) + (s.party[c.u.team].has('greatweb') ? 1 : 0);
    const tiles = square(c.tx, c.tz, 1).filter(t => !isSolid(s, t.x, t.z));
    for (const t of tiles) setFx(s, t.x, t.z, 'web', turns);
    c.ev.push({ type: 'terrain', tiles, kind: 'web' });
  },
  cocoon(c) {
    const o = tgt(c);
    if (o.team === c.u.team && standing(o)) shield(o, 40, c.ev);
    else encase(o, 1, c.u.id, false, c.ev);
  },
  venombite(c) {
    const o = tgt(c), u = c.u, st = o.st.stun || o.st.root;
    hit(c, o, 12, 'phys', st && standing(o) ? { name: 'SHATTER', mult: 2, setup: st.by } : null);
    if (standing(o)) addStatus(o, 'poison', poison(c), c.ev);
    if (u.mods.biteHeal) heal(c.s, u, u.mods.biteHeal, c.ev, u);
  },
  puppet(c) {
    const s = c.s, m = puppetMoves(s, c.u).get(idx(c.tx, c.tz)), o = m && getUnit(s, m.id);
    if (!m || !o) return;
    c.ev.push({ type: 'move', id: o.id, path: m.path });
    for (const p of m.path.slice(1)) if (s.fx[idx(p.x, p.z)]?.fire && !o.st.burn) addStatus(o, 'burn', { t: 2, dmg: 6, by: null }, c.ev);
    o.x = c.tx; o.z = c.tz;
    arrive(s, o, c.ev);
  },
  sharedpain(c) { addStatus(c.u, 'share', { t: 1, by: c.u.id }, c.ev); },
  skitter(c) {
    const at = landingNear(c.s, c.u, tgt(c), c.u.x, c.u.z);
    if (at) teleport(c, c.u, at);
  },
};

// ---------- Calls ----------
export function callTiles(skill: CallSkill, x: number, z: number): Pos[] {
  const r = SKILLS[skill].aoe;
  return r ? square(x, z, r) : [{ x, z }];
}
/** Hurts an enemy, or an ally when the caster lacks Benevolent Heavens; heals that ally for half otherwise. True when it hurt. */
function strike(c: LandCtx, o: Unit, base: number, kind: DamageKind, combo?: Combo | null): boolean {
  if (o.team === c.u.team && c.u.mods.benevolent) { heal(c.s, o, base * c.power * 0.5, c.ev, c.u); return false; }
  hit(c, o, base, kind, combo);
  return true;
}

const LAND: Record<CallSkill, (c: LandCtx) => void> = {
  meteor(c) {
    for (const t of c.tiles) {
      const tt = terrAt(c.s, t.x, t.z);
      if (tt === 'B') burstBrazier(c, t.x, t.z);
      else if (tt === 'G' || c.s.fx[idx(t.x, t.z)]?.web) igniteTile(c, t.x, t.z, 2);
    }
    for (const o of c.victims) {
      const center = o.x === c.x && o.z === c.z;
      if (strike(c, o, center ? 30 : 15, 'fire') && standing(o)) addStatus(o, 'burn', burn(c), c.ev);
    }
  },
  thunderhead(c) {
    for (const o of c.victims) {
      const wet = o.st.wet;
      strike(c, o, 20, 'shock', wet && standing(o) ? { name: 'CONDUCT', mult: 1.5, setup: wet.by } : null);
    }
  },
  gravitywell(c) {
    const benevolent = !!c.u.mods.benevolent, dist = Math.max(1, Math.floor(2 * c.power));
    const pulled = c.victims.filter(o => !(benevolent && o.team === c.u.team));
    pulled.sort((a, b) => cheb(a.x, a.z, c.x, c.z) - cheb(b.x, b.z, c.x, c.z));
    for (const o of pulled) pull(c, o, c.x, c.z, dist, 'full', 1);
  },
  recall(c) {
    const r = c.call.recall, o = r && getUnit(c.s, r.id);
    if (!r || !o || !standing(o) || o.under) return;
    const there = unitAt(c.s, r.x, r.z);
    if ((o.x !== r.x || o.z !== r.z) && !there && !isSolid(c.s, r.x, r.z)) teleport(c, o, r);
    const back = r.hp - o.hp;
    if (back > 0) {
      o.hp += back;
      c.s.stats.heal[c.u.team] += back;
      c.ev.push({ type: 'heal', id: o.id, amount: back });
    }
    if (c.u.mods.recallCleanse) {
      for (const k of BAD_KEYS) delete o.st[k];
      c.ev.push({ type: 'cleanse', id: o.id });
    }
  },
};

/** One landing of `call` centered on (x, z): Quakes surface enemies first, then the skill, then Absolute Zero, Sleet and Star-Tether on everyone it hit. */
function landAt(s: BattleState, u: Unit, call: Call, x: number, z: number, power: number, ev: BattleEvent[]): void {
  const tiles = callTiles(call.skill, x, z);
  ev.push({ type: 'land', id: u.id, skill: call.skill, x, z, tiles, power });
  const c: LandCtx = { s, u, ev, power, call, x, z, tiles, victims: [] };
  if (call.skill === 'recall') { LAND.recall(c); return; }
  if (SKILLS[call.skill].quake) for (const o of s.units) if (o.under && tiles.some(t => t.x === o.x && t.z === o.z)) quake(c, o);
  c.victims = unitsIn(s, tiles);
  const hurt = c.victims.filter(o => !(o.team === u.team && u.mods.benevolent));
  const held = new Set(hurt.filter(o => o.st.root || o.st.encased));
  LAND[call.skill](c);
  for (const o of hurt) {
    if (!standing(o)) continue;
    if (u.mods.absZero && held.has(o)) addStatus(o, 'stun', { t: 1, by: u.id }, ev);
    if (u.mods.callWet) addStatus(o, 'wet', { t: 2, by: u.id }, ev);
    if (o.team !== u.team && s.party[u.team].has('startether') && s.threads.some(t => t.to === o.id && getUnit(s, t.by)?.team === u.team)) {
      addStatus(o, 'expose', { t: 2, by: u.id }, ev);
    }
  }
}

/** A Call lands: Conjunction, then Deep Impact's echoes on the other mouths of a tunnel in its area. */
export function landCall(s: BattleState, u: Unit, call: Call, power: number, ev: BattleEvent[]): void {
  const team: Team = call.team;
  if (s.party[team].has('conjunction') && s.callRound[team] === s.round) power *= 1.25;
  s.callRound[team] = s.round;
  const tiles = callTiles(call.skill, call.x, call.z);
  const inArea = (x: number, z: number) => tiles.some(t => t.x === x && t.z === z);
  const hole = call.skill !== 'recall' && s.party[team].has('deepimpact') ? s.mouths.find(m => m.team === team && inArea(m.x, m.z)) : undefined;
  const echoes = hole ? s.mouths.filter(m => m.net === hole.net && !inArea(m.x, m.z)).map(m => ({ x: m.x, z: m.z })) : [];
  landAt(s, u, call, call.x, call.z, power, ev);
  for (const e of echoes) {
    if (s.phase.kind === 'over' || !standing(u)) return;
    landAt(s, u, call, e.x, e.z, power * 0.5, ev);
  }
}

/** At the very start of a unit's activation, its pending Calls land, oldest first. */
export function landCalls(s: BattleState, u: Unit, ev: BattleEvent[]): void {
  const mine = s.calls.filter(c => c.by === u.id);
  if (!mine.length) return;
  s.calls = s.calls.filter(c => c.by !== u.id);
  for (const call of mine) {
    if (s.phase.kind === 'over' || !standing(u)) return;
    landCall(s, u, call, 1, ev);
  }
}

// ---------- the board after a round ----------
/** A pit opens: whoever stands there falls (the Downed are lost); mouths and charges there are gone. */
export function openPit(s: BattleState, x: number, z: number, ev: BattleEvent[]): void {
  const k = idx(x, z), f = s.fx[k] ?? (s.fx[k] = {});
  delete f.sink; delete f.charge; delete f.web;
  f.pit = 3;
  s.mouths = s.mouths.filter(m => m.x !== x || m.z !== z);
  ev.push({ type: 'terrain', tiles: [{ x, z }], kind: 'pit' });
  const o = unitAt(s, x, z);
  if (!o) return;
  if (standing(o)) { ev.push({ type: 'fall', id: o.id, x, z }); down(s, o, ev, null); return; }
  o.life = { kind: 'dead' };
  ev.push({ type: 'death', id: o.id, team: o.team, cause: 'fell' });
  checkWinner(s);
}

// ---------- commands ----------
function isBasic(id: SkillId): id is BasicSkillId { return id.startsWith('basic_'); }

/** Casts as the current unit, mutating `s`. Null when the cast is illegal. */
export function performCast(s: BattleState, id: SkillId, tx: number, tz: number): BattleEvent[] | null {
  const u = current(s);
  if (!u || !canUse(s, u, id)) return null;
  if (!castTargets(s, u, id).some(t => t.x === tx && t.z === tz)) return null;
  const sk = SKILLS[id];
  const target = sk.target === 'tile' || sk.target === 'self' ? null : unitAt(s, tx, tz);
  const cast: CastEvent = { type: 'cast', id: u.id, team: u.team, skill: id, tx, tz, fx: u.x, fz: u.z, target: target ? target.id : null };
  const ev: BattleEvent[] = [cast];
  if (u.under && !(id === 'upheaval' && u.mods.undertow)) surface(s, u, ev);
  if (standing(u)) {
    if (isCall(id)) {
      s.calls.push({ by: u.id, team: u.team, skill: id, x: tx, z: tz, recall: id === 'recall' && target ? { id: target.id, x: target.x, z: target.z, hp: target.hp } : null });
      ev.push({ type: 'call', id: u.id, team: u.team, skill: id, tiles: callTiles(id, tx, tz) });
    } else {
      const c: CastCtx = { s, u, ev, power: 1, skill: sk, tx, tz, target, cast };
      RUN[isBasic(id) ? 'basic' : id](c);
    }
  }
  if (!sk.free) u.acted = true;
  if (cdOf(u, id) > 0) u.cd[id] = cdOf(u, id);
  breakThreads(s, ev);
  checkWinner(s);
  return ev;
}

/** Moves the current unit, mutating `s`. Null when the tile isn't reachable. */
export function performMove(s: BattleState, x: number, z: number): BattleEvent[] | null {
  const u = current(s);
  if (!u || u.moved) return null;
  const p = reachable(s, u).get(idx(x, z));
  if (!p) return null;
  const ev: BattleEvent[] = [u.under ? { type: 'move', id: u.id, path: p, under: true } : { type: 'move', id: u.id, path: p }];
  u.x = x; u.z = z; u.moved = true;
  if (!u.under) {
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i];
      if (!a || !b) continue;
      if (s.fx[idx(b.x, b.z)]?.fire && !u.st.burn && !u.st.wet) addStatus(u, 'burn', { t: 2, dmg: 6, by: null }, ev);
      if (cheb(a.x, a.z, b.x, b.z) <= 1) continue;
      const m = s.mouths.find(mo => mo.x === b.x && mo.z === b.z && mo.team === u.team), net = m && getUnit(s, m.net);
      if (net?.mods.tunnelShield) shield(u, net.mods.tunnelShield, ev);
    }
    arrive(s, u, ev);
  }
  breakThreads(s, ev);
  checkWinner(s);
  return ev;
}
