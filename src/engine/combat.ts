import {
  BAD_KEYS, barricadeTiles, castTargets, chainTargets, cheb, current, enemiesIn, getUnit, idx, inb, isAlive, isDebuffed, isDowned,
  isSolid, isWet, landingNear, onHigh, reachable, sign, square, standing, terrAt, unitAt, canUse, cdOf,
} from './board';
import { BLEED, CLASSES, DARK_ROUND, DIR8, SKILLS } from './tables';
import type { SkillDef } from './tables';
import type {
  BasicSkillId, BattleEvent, BattleState, ClassSkillId, ComboName, DamageKind, Pos, SkillId, Statuses, StatusKey, TileFx, Unit, UnitId,
} from './types';

type CastEvent = Extract<BattleEvent, { type: 'cast' }>;
type SkillKey = ClassSkillId | 'basic' | 'helpup';
type Fx = Exclude<keyof TileFx, 'spent'>;

interface Ctx {
  s: BattleState; u: Unit; skill: SkillDef; tx: number; tz: number; target: Unit | null;
  ev: BattleEvent[]; cast: CastEvent; emp: number | null; refund: boolean;
}
interface Combo { name: ComboName; mult: number; setup: UnitId | null }

export function setFx(s: BattleState, x: number, z: number, key: Fx, val: number): void {
  const k = idx(x, z);
  const f = s.fx[k] ?? (s.fx[k] = {});
  f[key] = val;
}
function clearFx(s: BattleState, x: number, z: number, key: Fx): void {
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
  let v = 1 + (m.dmg || 0);
  if (kind === 'fire') v *= 1 + (m.fireDmg || 0);
  if (kind === 'frost') v *= 1 + (m.frostDmg || 0);
  if (onHigh(s, u) && terrAt(s, tgt.x, tgt.z) !== '^' && cheb(u.x, u.z, tgt.x, tgt.z) > 1) v *= 1.15 + (m.highDmg || 0);
  if (m.deepFreeze && (tgt.st.stun || tgt.st.root)) v *= 1 + m.deepFreeze;
  if (m.opportunist && isDebuffed(tgt)) v *= 1 + m.opportunist;
  for (const a of s.units) if (a !== u && standing(a) && a.team === u.team && a.mods.rally && cheb(a.x, a.z, u.x, u.z) <= 1) v *= 1 + a.mods.rally;
  return v;
}
function victimMult(s: BattleState, o: Unit, src: Unit): number {
  let v = 1;
  if (o.st.mark) v *= 1 + o.st.mark.amt + (s.party[src.team].has('pack') ? 0.15 : 0);
  if (o.st.expose) v *= 1.25;
  if (o.st.taunt && s.party[src.team].has('holdblast')) {
    const tb = getUnit(s, o.st.taunt.by);
    if (tb && tb.team === src.team) v *= 1.2;
  }
  for (const a of s.units) if (a !== o && standing(a) && a.team === o.team && a.mods.martyr && cheb(a.x, a.z, o.x, o.z) <= 2) v *= 1 - a.mods.martyr;
  return v;
}

/** Raw damage to one unit (no attacker scaling): shields, guard redirect, downing, finishing. */
export function damage(s: BattleState, o: Unit, amt: number, ev: BattleEvent[], kind: DamageKind, src: Unit | null): number {
  if (!isAlive(o) || amt <= 0) return 0;
  if (isDowned(o)) {
    o.life = { kind: 'dead' };
    ev.push({ type: 'death', id: o.id, team: o.team, cause: 'finished' });
    if (src && isAlive(src)) emitCombo(s, ev, 'EXECUTE', src, o.id, null);
    checkWinner(s);
    return 0;
  }
  amt = Math.round(amt);
  if (o.st.guard && kind !== 'guard') {
    const g = getUnit(s, o.st.guard.by);
    if (g && standing(g) && g !== o) {
      const half = Math.round(amt / 2);
      amt -= half;
      ev.push({ type: 'guarded', id: o.id, by: g.id });
      damage(s, g, half, ev, 'guard', null);
    }
  }
  const ab = Math.min(o.shield, amt);
  o.shield -= ab;
  const d = amt - ab;
  o.hp = Math.max(0, o.hp - d);
  if (src) s.stats.dmg[src.team] += d + ab;
  ev.push({ type: 'damage', id: o.id, amount: d, absorbed: ab, kind });
  if (o.hp <= 0) down(s, o, ev, src);
  return d;
}
function down(s: BattleState, o: Unit, ev: BattleEvent[], src: Unit | null): void {
  o.life = { kind: 'downed', bleed: BLEED };
  o.shield = 0; o.st = {}; o.hp = 0;
  if (src) s.stats.downs[src.team]++;
  ev.push({ type: 'downed', id: o.id, team: o.team });
  for (const a of s.units) if (a.st.guard && a.st.guard.by === o.id) delete a.st.guard;
  if (src && src.mods.vanish) src.cd.shadowstep = 0;
  checkWinner(s);
}
/** An attack: attacker scaling × victim scaling × combo multiplier. */
function hit(c: Ctx, o: Unit | null, base: number, kind: DamageKind, combo?: Combo | null): number {
  const s = c.s, u = c.u;
  if (!o || !isAlive(o)) return 0;
  if (isDowned(o)) { damage(s, o, 1, c.ev, kind, u); if (u.mods.executioner) c.refund = true; return 0; }
  let mult = srcMult(s, u, o, kind) * victimMult(s, o, u) * (c.emp || 1);
  if (combo) { mult *= combo.mult; emitCombo(s, c.ev, combo.name, u, o.id, combo.setup); }
  return damage(s, o, base * mult, c.ev, kind, u);
}
export function addStatus<K extends StatusKey>(o: Unit, key: K, val: NonNullable<Statuses[K]>, ev: BattleEvent[]): void {
  if (!standing(o)) return;
  if ((key === 'stun' || key === 'root') && o.mods.stunImmune) { ev.push({ type: 'resist', id: o.id }); return; }
  if (key === 'burn' && o.st.wet) { ev.push({ type: 'steam', id: o.id }); return; }
  o.st[key] = val;
  if (key === 'wet' && o.st.burn) delete o.st.burn;
  const p = o.st.poison;
  if (key === 'poison' && p && p.venom) o.st.expose = { t: p.t, by: p.by };
  ev.push({ type: 'status', id: o.id, key });
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
function revive(s: BattleState, o: Unit, frac: number, ev: BattleEvent[], src: Unit): void {
  o.life = { kind: 'up' };
  o.hp = Math.max(1, Math.round(o.maxHp * frac));
  s.stats.revives[o.team]++;
  ev.push({ type: 'revive', id: o.id, by: src.id });
  if (src.mods.lifeline) o.shield = Math.max(o.shield, src.mods.lifeline);
}

// ---------- the map reacting ----------
/** Push a unit away from (fromX, fromZ): slams, chasms, fire, braziers. */
function push(c: Ctx, o: Unit, fromX: number, fromZ: number, dist: number): void {
  const s = c.s, dx = sign(o.x - fromX), dz = sign(o.z - fromZ), path: Pos[] = [{ x: o.x, z: o.z }];
  if (!dx && !dz) return;
  for (let k = 0; k < dist; k++) {
    const nx = o.x + dx, nz = o.z + dz, t = terrAt(s, nx, nz);
    if (inb(nx, nz) && t === 'o') {
      path.push({ x: nx, z: nz });
      c.ev.push({ type: 'move', id: o.id, path, slide: true });
      c.ev.push({ type: 'fall', id: o.id, x: nx, z: nz });
      emitCombo(s, c.ev, 'ABYSS', c.u, o.id, null);
      o.x = nx; o.z = nz;
      down(s, o, c.ev, c.u);
      return;
    }
    if (!inb(nx, nz) || isSolid(s, nx, nz) || unitAt(s, nx, nz)) {
      c.ev.push({ type: 'move', id: o.id, path, slide: true });
      if (t === 'B' && inb(nx, nz)) burstBrazier(c, nx, nz);
      emitCombo(s, c.ev, 'SLAM', c.u, o.id, null);
      damage(s, o, 6, c.ev, 'slam', c.u);
      addStatus(o, 'stun', { t: 1, by: c.u.id }, c.ev);
      if (s.party[c.u.team].has('anvilarrow')) addStatus(o, 'mark', { t: 2, amt: 0.3, pred: false, by: c.u.id }, c.ev);
      return;
    }
    o.x = nx; o.z = nz;
    path.push({ x: nx, z: nz });
  }
  c.ev.push({ type: 'move', id: o.id, path, slide: true });
  enterTile(s, o, c.ev);
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
function igniteTile(c: Ctx, x: number, z: number, turns: number): void {
  const s = c.s;
  if (!inb(x, z)) return;
  const t = terrAt(s, x, z);
  if (t === '#' || t === 'o' || t === '~' || t === 'I' || t === 'B') return;
  setFx(s, x, z, 'fire', turns);
  c.ev.push({ type: 'fire', x, z });
  const o = unitAt(s, x, z);
  if (o && !isDowned(o)) addStatus(o, 'burn', { t: 2, dmg: 6 + (c.u.mods.burnDmg || 0), by: c.u.id }, c.ev);
}
/** Stepping onto a tile: water wets, fire burns. */
function enterTile(s: BattleState, o: Unit, ev: BattleEvent[]): void {
  const t = terrAt(s, o.x, o.z), f = s.fx[idx(o.x, o.z)];
  if (t === '~') addStatus(o, 'wet', { t: 2, by: null }, ev);
  else if (f?.fire && !o.st.burn) addStatus(o, 'burn', { t: 2, dmg: 6, by: null }, ev);
}

// ---------- the skills, one handler each ----------
function tgt(c: Ctx): Unit {
  if (!c.target) throw new Error(`${c.skill.name} needs a unit target`);
  return c.target;
}

const RUN: Record<SkillKey, (c: Ctx) => void> = {
  basic(c) {
    const b = CLASSES[c.u.cls].basic, o = tgt(c);
    hit(c, o, b.dmg + (c.u.mods.basicDmg || 0), 'phys');
    if (c.u.mods.juggernaut && standing(o)) push(c, o, c.u.x, c.u.z, 1);
  },
  shieldbash(c) {
    const o = tgt(c);
    hit(c, o, 14, 'phys');
    if (standing(o)) push(c, o, c.u.x, c.u.z, 1 + (c.u.mods.pushDist || 0));
  },
  guard(c) {
    const o = tgt(c);
    for (const a of c.s.units) if (a.st.guard && a.st.guard.by === c.u.id) delete a.st.guard;
    addStatus(o, 'guard', { by: c.u.id }, c.ev);
    if (c.u.mods.guardShield) o.shield = Math.max(o.shield, c.u.mods.guardShield);
  },
  taunt(c) {
    for (const o of c.s.units) if (standing(o) && o.team !== c.u.team && cheb(o.x, o.z, c.u.x, c.u.z) <= 2) {
      addStatus(o, 'taunt', { t: 1, by: c.u.id }, c.ev);
      if (c.u.mods.exposeOnTaunt) addStatus(o, 'expose', { t: 1, by: c.u.id }, c.ev);
    }
  },
  barricade(c) {
    const tiles = barricadeTiles(c.s, c.u, c.tx, c.tz);
    for (const t of tiles) { setFx(c.s, t.x, t.z, 'wall', 3); setFx(c.s, t.x, t.z, 'whp', 30); clearFx(c.s, t.x, t.z, 'fire'); }
    c.ev.push({ type: 'terrain', tiles, kind: 'wall' });
  },
  sunder(c) {
    const o = tgt(c);
    hit(c, o, 12, 'phys');
    if (standing(o)) addStatus(o, 'expose', { t: 2, by: c.u.id }, c.ev);
  },

  fireball(c) {
    const s = c.s, tiles = square(c.tx, c.tz, 1), main = unitAt(s, c.tx, c.tz);
    if (terrAt(s, c.tx, c.tz) === 'B') burstBrazier(c, c.tx, c.tz);
    for (const t of tiles) {
      if (terrAt(s, t.x, t.z) === 'B' && !(t.x === c.tx && t.z === c.tz)) burstBrazier(c, t.x, t.z);
      if (terrAt(s, t.x, t.z) === 'G') igniteTile(c, t.x, t.z, 2);
    }
    for (const o of enemiesIn(s, c.u, tiles)) {
      hit(c, o, o === main ? 18 : 6, 'fire');
      if (standing(o)) addStatus(o, 'burn', { t: 2, dmg: 6 + (c.u.mods.burnDmg || 0), by: c.u.id }, c.ev);
    }
    igniteTile(c, c.tx, c.tz, 2);
  },
  frostbolt(c) {
    const s = c.s, o = tgt(c), wet = isWet(s, o, c.u), setup = wet && o.st.wet ? o.st.wet.by : null;
    hit(c, o, 12, 'frost', wet ? { name: 'FREEZE', mult: 1, setup } : null);
    if (standing(o)) {
      if (wet) { delete o.st.wet; addStatus(o, 'stun', { t: 1, by: c.u.id }, c.ev); }
      else addStatus(o, 'root', { t: 1 + (c.u.mods.rootTurns || 0), by: c.u.id }, c.ev);
    }
    const iced: Pos[] = [];
    for (const t of square(o.x, o.z, 1)) if (terrAt(s, t.x, t.z) === '~') { setFx(s, t.x, t.z, 'ice', 3); clearFx(s, t.x, t.z, 'flood'); iced.push(t); }
    if (iced.length) c.ev.push({ type: 'terrain', tiles: iced, kind: 'ice' });
  },
  lightning(c) {
    const s = c.s, o = tgt(c), wet = isWet(s, o, c.u), mult = wet ? (c.u.mods.overcharge ? 2 : 1.5) : 1, chain = chainTargets(s, c.u, o);
    c.cast.chain = [o.id, ...chain.map(a => a.id)];
    hit(c, o, 16, 'shock', wet ? { name: 'CONDUCT', mult, setup: o.st.wet ? o.st.wet.by : null } : null);
    for (const a of chain) hit(c, a, wet ? 16 * mult * 0.5 : 8, 'shock');
  },
  flood(c) {
    const s = c.s, tiles = square(c.tx, c.tz, 1).filter(t => { const tt = terrAt(s, t.x, t.z); return tt !== '#' && tt !== 'o' && tt !== 'B'; });
    for (const t of tiles) {
      setFx(s, t.x, t.z, 'flood', 3); clearFx(s, t.x, t.z, 'fire'); clearFx(s, t.x, t.z, 'ice');
      const o = unitAt(s, t.x, t.z);
      if (o && !isDowned(o)) { if (o.st.burn) delete o.st.burn; addStatus(o, 'wet', { t: 2, by: c.u.id }, c.ev); }
    }
    c.ev.push({ type: 'terrain', tiles, kind: 'flood' });
  },
  combust(c) {
    const o = tgt(c), b = o.st.burn;
    if (b) {
      const extra = b.dmg * b.t * 3, setup = b.by;
      delete o.st.burn;
      hit(c, o, 12 + extra, 'fire', { name: 'COMBUST', mult: 1, setup });
    } else {
      hit(c, o, 12, 'fire');
      if (standing(o)) addStatus(o, 'burn', { t: 2, dmg: 6 + (c.u.mods.burnDmg || 0), by: c.u.id }, c.ev);
    }
  },

  mark(c) {
    const o = tgt(c), m = c.u.mods;
    hit(c, o, 6, 'phys');
    if (standing(o)) addStatus(o, 'mark', { t: 2 + (m.markTurns || 0), amt: 0.3 + (m.markAmt || 0), pred: !!m.predator, by: c.u.id }, c.ev);
  },
  pinshot(c) {
    const o = tgt(c);
    hit(c, o, 12, 'phys');
    if (standing(o)) addStatus(o, 'root', { t: 1, by: c.u.id }, c.ev);
  },
  snipe(c) {
    const o = tgt(c), st = o.st.stun || o.st.root;
    hit(c, o, 22, 'phys', st ? { name: 'PINNED', mult: c.u.mods.deadeye ? 2 : 1.5, setup: st.by } : null);
  },
  volley(c) {
    for (const o of enemiesIn(c.s, c.u, square(c.tx, c.tz, 1))) hit(c, o, 10, 'phys');
  },
  smokearrow(c) {
    const tiles = square(c.tx, c.tz, 1).filter(t => !isSolid(c.s, t.x, t.z));
    for (const t of tiles) setFx(c.s, t.x, t.z, 'smoke', 2);
    c.ev.push({ type: 'terrain', tiles, kind: 'smoke' });
  },

  heal(c) {
    const o = tgt(c), src = c.u;
    heal(c.s, o, 26 * (1 + (src.mods.heal || 0)), c.ev, src);
    if (src.mods.lifeline) o.shield = Math.max(o.shield, src.mods.lifeline);
    if (c.s.party[src.team].has('guiding')) addStatus(o, 'haste', { t: 1, by: src.id }, c.ev);
  },
  resurrect(c) { revive(c.s, tgt(c), 0.5 + (c.u.mods.reviveHp || 0), c.ev, c.u); },
  bless(c) {
    const o = tgt(c);
    for (const k of BAD_KEYS) delete o.st[k];
    addStatus(o, 'empower', { t: 3, amt: 0.4, by: c.u.id }, c.ev);
    if (c.u.mods.crusade) addStatus(o, 'haste', { t: 1, by: c.u.id }, c.ev);
    c.ev.push({ type: 'cleanse', id: o.id });
  },
  sanctuary(c) {
    const amt = 20 + (c.u.mods.sanctShield || 0);
    for (const o of c.s.units) if (standing(o) && o.team === c.u.team && cheb(o.x, o.z, c.u.x, c.u.z) <= 2) {
      o.shield = Math.max(o.shield, amt);
      c.ev.push({ type: 'shield', id: o.id, amount: amt });
    }
  },
  judgment(c) {
    const o = tgt(c), st = o.st.mark || o.st.expose;
    hit(c, o, 14, 'holy', st ? { name: 'JUDGMENT', mult: 1, setup: st.by } : null);
    if (st && standing(o)) addStatus(o, 'stun', { t: 1, by: c.u.id }, c.ev);
  },

  backstab(c) {
    const party = c.s.party[c.u.team], o = tgt(c), st = o.st.stun || o.st.root || (party.has('smokefire') && o.st.burn);
    const m = (c.u.mods.executioner ? 2.5 : 2) * (party.has('hammer') ? 1.25 : 1);
    hit(c, o, 20, 'phys', st && !isDowned(o) ? { name: 'SHATTER', mult: m, setup: st.by } : null);
  },
  shadowstep(c) {
    const at = landingNear(c.s, c.u, tgt(c), c.u.x, c.u.z);
    if (!at) return;
    c.ev.push({ type: 'teleport', id: c.u.id, x: at.x, z: at.z });
    c.u.x = at.x; c.u.z = at.z;
    enterTile(c.s, c.u, c.ev);
  },
  poison(c) {
    const o = tgt(c), m = c.u.mods;
    hit(c, o, 10, 'poison');
    if (standing(o)) addStatus(o, 'poison', { t: 3 + (m.poisonTurns || 0), dmg: 6 + (m.poisonDmg || 0), venom: !!m.venom, by: c.u.id }, c.ev);
  },
  kidney(c) {
    const o = tgt(c);
    hit(c, o, 8, 'phys');
    if (standing(o)) addStatus(o, 'stun', { t: 1, by: c.u.id }, c.ev);
  },
  smokebomb(c) {
    const tiles = square(c.u.x, c.u.z, 1).filter(t => !isSolid(c.s, t.x, t.z));
    for (const t of tiles) setFx(c.s, t.x, t.z, 'smoke', 2);
    c.ev.push({ type: 'terrain', tiles, kind: 'smoke' });
  },
  helpup(c) { revive(c.s, tgt(c), c.s.party[c.u.team].has('shadowmend') ? 0.5 : 0.3, c.ev, c.u); },
};

function isBasic(id: SkillId): id is BasicSkillId { return id.startsWith('basic_'); }

/** Casts as the current unit, mutating `s`. Null when the cast is illegal. */
export function performCast(s: BattleState, id: SkillId, tx: number, tz: number): BattleEvent[] | null {
  const u = current(s);
  if (!u || !canUse(u, id)) return null;
  if (!castTargets(s, u, id).some(t => t.x === tx && t.z === tz)) return null;
  const sk = SKILLS[id];
  const target = sk.target === 'enemy' || sk.target === 'ally' || sk.target === 'downed' ? unitAt(s, tx, tz) : null;
  let emp: number | null = null;
  if (sk.damaging && u.st.empower) { emp = 1 + u.st.empower.amt; delete u.st.empower; }
  const cast: CastEvent = { type: 'cast', id: u.id, team: u.team, skill: id, tx, tz, fx: u.x, fz: u.z, target: target ? target.id : null, empowered: emp !== null };
  const ev: BattleEvent[] = [cast];
  const c: Ctx = { s, u, skill: sk, tx, tz, target, ev, cast, emp, refund: false };
  RUN[isBasic(id) ? 'basic' : id](c);
  if (emp && target && s.party[u.team].has('blessed') && standing(target) && target.team !== u.team) addStatus(target, 'expose', { t: 2, by: u.id }, ev);
  if (!sk.free && !c.refund) u.acted = true;
  if (cdOf(u, id) > 0) u.cd[id] = cdOf(u, id);
  if (u.mods.hitrun && sk.damaging && u.moved && !sk.free) { u.moved = false; u.moveCap = u.mods.hitrun; }
  checkWinner(s);
  return ev;
}

/** Moves the current unit, mutating `s`. Null when the tile isn't reachable. */
export function performMove(s: BattleState, x: number, z: number): BattleEvent[] | null {
  const u = current(s);
  if (!u || u.moved) return null;
  const p = reachable(s, u).get(idx(x, z));
  if (!p) return null;
  const ev: BattleEvent[] = [{ type: 'move', id: u.id, path: p }];
  for (let i = 1; i < p.length; i++) {
    const step = p[i];
    if (!step) continue;
    if (s.fx[idx(step.x, step.z)]?.fire && !u.st.burn && !u.st.wet) addStatus(u, 'burn', { t: 2, dmg: 6, by: null }, ev);
  }
  u.x = x; u.z = z; u.moved = true; u.moveCap = 0;
  enterTile(s, u, ev);
  return ev;
}

