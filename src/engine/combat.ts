import {
  BAD_KEYS, actedCount, actedThisRound, boneTiles, canUse, castTargets, cdOf, cheb, current, getUnit, heldBy, idx, inb, isAlive, isDowned, isSolid, landingNear, lastToAct, los, nextTurn,
  nearestFree, onHigh, puppetMoves, reachable, sign, soulAt, soulCap, soulsInReach, square, standing, terrAt, threadCap, unitAt, unitsIn,
} from './board';
import { BLEED, CLASSES, DARK_ROUND, DIR8, SKILLS, SOUL_HIT, SOUL_ROUNDS, isCall } from './tables';
import type { SkillDef } from './tables';
import type {
  BasicSkillId, BattleEvent, BattleState, Call, CallSkill, ClassSkillId, ComboName, DamageKind, InnateSkillId, Pos, SkillId, Soul, Statuses, StatusKey,
  TileFx, Unit, UnitId,
} from './types';

type CastEvent = Extract<BattleEvent, { type: 'cast' }>;

type SkillKey = Exclude<ClassSkillId | InnateSkillId, CallSkill> | 'basic' | 'helpup';

type Fx = Exclude<keyof TileFx, 'spent'>;

/** `full`: SLAM into obstacles, ABYSS into chasms. `soft`: stop short. */
type Physics = 'full' | 'soft';

/** Whoever is acting: a caster, or a Call landing (`power` 0.5 for Snap). */
interface Ctx { s: BattleState; u: Unit; ev: BattleEvent[]; power: number }

interface CastCtx extends Ctx { skill: SkillDef; tx: number; tz: number; target: Unit | null; cast: CastEvent }

interface LandCtx extends Ctx { call: Call; x: number; z: number; tiles: Pos[]; victims: Unit[] }

interface Combo { name: ComboName; mult: number; setup: UnitId | null }

function setFx(s: BattleState, x: number, z: number, key: Fx, val: number): void {
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
  let v = 1;

  if (kind === 'fire') v *= 1 + (m.fireDmg || 0);

  if (kind === 'frost') v *= 1 + (m.frostDmg || 0);

  if (onHigh(s, u) && terrAt(s, tgt.x, tgt.z) !== '^' && cheb(u.x, u.z, tgt.x, tgt.z) > 1) v *= 1.15;

  if (m.lastDmg && lastToAct(s, u, false)) v *= 1 + m.lastDmg;

  if (m.finalHour && lastToAct(s, u, true)) v *= 1 + m.finalHour;

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

/** The Weaver with Fate Weaver who is `o` or holds `o` while standing, if `o` hasn't been spared yet. */
function fateWeaver(s: BattleState, o: Unit): Unit | null {
  if (o.spared) return null;

  if (o.mods.fateWeaver) return o;

  for (const t of s.threads) {
    if (t.to !== o.id) continue;
    const w = getUnit(s, t.by);

    if (w && w !== o && w.team === o.team && standing(w) && w.mods.fateWeaver) return w;
  }

  return null;
}

/**
 * Raw damage to one unit (no attacker scaling): Encased immunity, Shared Pain, shields, Fate Weaver, downing, finishing.
 * A hit of 20 or more drops a Soul; a unit's hit that leaves a Withered enemy (or a Reaper's target) at 20% HP or less Downs it (REAP).
 */
export function damage(s: BattleState, o: Unit, amt: number, ev: BattleEvent[], kind: DamageKind, src: Unit | null): number {
  if (!isAlive(o) || amt <= 0 || o.st.encased) return 0;

  if (isDowned(o)) {
    o.life = { kind: 'dead' };
    ev.push({ type: 'death', id: o.id, team: o.team, cause: 'finished' });

    if (src && isAlive(src)) emitCombo(s, ev, 'EXECUTE', src, o.id, null);
    checkWinner(s);

    return 0;
  }

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

  if (o.st.guard && src && src.team !== o.team && standing(src)) hush(s, src, o.id, ev);

  if (o.hp <= 0) { down(s, o, ev, src); return d; }

  if (d >= SOUL_HIT) dropSoul(s, o.x, o.z, ev);

  if (src && src.team !== o.team && !o.st.encased && o.hp * 5 <= o.maxHp && (o.st.wither || src.mods.reap)) {
    emitCombo(s, ev, 'REAP', src, o.id, o.st.wither?.by ?? null);
    down(s, o, ev, src);
  }

  return d;
}

/** A standing unit drops into the chasm at (x, z) and clings to the edge: Downed on the nearest free tile of solid ground. */
export function fall(s: BattleState, o: Unit, x: number, z: number, ev: BattleEvent[], src: Unit | null): void {
  const at = nearestFree(s, x, z, o);

  if (at) { o.x = at.x; o.z = at.z; }

  ev.push({ type: 'fall', id: o.id, x: o.x, z: o.z });
  down(s, o, ev, src);
}

/** Downed: its Soul drops, or goes straight to a Reaper who caused it; a Gravecaller without Undying spills the Souls it held. */
export function down(s: BattleState, o: Unit, ev: BattleEvent[], src: Unit | null): void {
  o.life = { kind: 'downed', bleed: BLEED };
  o.shield = 0; o.st = {}; o.hp = 0;

  if (src) s.stats.downs[src.team]++;
  ev.push({ type: 'downed', id: o.id, team: o.team });

  if (src && src !== o && src.mods.reap && isAlive(src) && src.souls < soulCap(s, src)) {
    src.souls++;
    ev.push({ type: 'gather', id: src.id, from: [{ x: o.x, z: o.z }] });
  } else dropSoul(s, o.x, o.z, ev);

  if (o.souls && !o.mods.undying) { spillSouls(s, o, ev); o.souls = 0; }

  if (s.calls.some(c => c.by === o.id)) {
    s.calls = s.calls.filter(c => c.by !== o.id);
    ev.push({ type: 'fizzle', id: o.id });
  }

  breakThreads(s, ev);
  checkWinner(s);
}

/** An attack: attacker scaling × Exposed × combo × the context's power. Downed targets are finished. */
function hit(c: Ctx, o: Unit | null, base: number, kind: DamageKind, combo?: Combo | null): number {
  const s = c.s, u = c.u;

  if (!o || !isAlive(o)) return 0;

  if (isDowned(o)) { damage(s, o, 1, c.ev, kind, u); return 0; }

  let mult = srcMult(s, u, o, kind) * (o.st.expose ? 1.25 : 1) * c.power;

  if (combo) { mult *= combo.mult; emitCombo(s, c.ev, combo.name, u, o.id, combo.setup); }

  return damage(s, o, base * mult, c.ev, kind, u);
}

export function addStatus<K extends StatusKey>(o: Unit, key: K, val: NonNullable<Statuses[K]>, ev: BattleEvent[]): void {
  if (!standing(o)) return;

  if (key === 'burn' && o.st.wet) { ev.push({ type: 'steam', id: o.id }); return; }

  o.st[key] = val;

  if (key === 'wet' && o.st.burn) delete o.st.burn;
  ev.push({ type: 'status', id: o.id, key });
}

/** Encased: skips its turns, takes no damage, can't be moved. The only status a Downed unit can take (Cocoon, Fate Weaver). */
function encase(o: Unit, t: number, by: UnitId, ice: boolean, ev: BattleEvent[]): void {
  if (!isAlive(o)) return;
  o.st.encased = { t, by, ice };
  ev.push({ type: 'encased', id: o.id });
}

/** A Root that still holds on the unit's next turn, even when it lands during its own. */
function root(s: BattleState, o: Unit, by: UnitId | null, ev: BattleEvent[]): void {
  addStatus(o, 'root', { t: current(s) === o ? 2 : 1, by }, ev);
}

/** Hushed through the unit's next turn, even when it lands during its own. */
function hush(s: BattleState, o: Unit, by: UnitId, ev: BattleEvent[]): void {
  addStatus(o, 'hush', { t: current(s) === o ? 2 : 1, by }, ev);
}

export function heal(s: BattleState, o: Unit, amt: number, ev: BattleEvent[], src: Unit | null): number {
  if (!standing(o) || o.st.wither) return 0;

  if (s.round >= DARK_ROUND) amt /= 2;
  const h = Math.min(Math.round(amt), o.maxHp - o.hp);
  o.hp += h;

  if (src) s.stats.heal[src.team] += h;
  ev.push({ type: 'heal', id: o.id, amount: h });

  return h;
}

function shield(o: Unit, amt: number, ev: BattleEvent[]): void {
  if (o.st.wither) return;
  o.shield = Math.max(o.shield, amt);
  ev.push({ type: 'shield', id: o.id, amount: amt });
}

/** Stands a Downed ally up at `frac` of its max HP, 60% while its party has a Ferryman; a Psychopomp's touch adds a shield. */
function revive(s: BattleState, o: Unit, frac: number, ev: BattleEvent[], src: Unit): void {
  if (s.units.some(f => f.team === src.team && isAlive(f) && f.mods.ferryman)) frac = Math.max(frac, 0.6);
  o.life = { kind: 'up' };
  delete o.st.encased;
  o.hp = Math.max(1, Math.round(o.maxHp * frac));
  s.stats.revives[o.team]++;
  ev.push({ type: 'revive', id: o.id, by: src.id });

  if (src.mods.riteShield) shield(o, src.mods.riteShield, ev);
}

// ---------- souls ----------
/** A Soul drops on (x, z), unless one already lies there. It lasts 2 rounds longer while either party is a Charnel House. */
function dropSoul(s: BattleState, x: number, z: number, ev: BattleEvent[]): void {
  if (soulAt(s, x, z) || isSolid(s, x, z)) return;
  s.souls.push({ x, z, t: SOUL_ROUNDS + (s.party.some(p => p.has('charnel')) ? 2 : 0) });
  ev.push({ type: 'soul', x, z });
}

/** A Downed Gravecaller's held Souls fall on its tile and the nearest free ones around it. */
function spillSouls(s: BattleState, o: Unit, ev: BattleEvent[]): void {
  let left = o.souls;

  for (let r = 1; r <= 2 && left > 0; r++) {
    for (const p of square(o.x, o.z, r)) {
      if (left <= 0) break;

      if (cheb(p.x, p.z, o.x, o.z) !== r || soulAt(s, p.x, p.z) || isSolid(s, p.x, p.z)) continue;
      dropSoul(s, p.x, p.z, ev);
      left--;
    }
  }
}

/** `u` takes `souls` into its hand, as many as it has room for. */
function gather(s: BattleState, u: Unit, souls: readonly Soul[], ev: BattleEvent[]): void {
  const taken = souls.slice(0, soulCap(s, u) - u.souls);

  if (!taken.length) return;
  s.souls = s.souls.filter(o => !taken.includes(o));
  u.souls += taken.length;
  ev.push({ type: 'gather', id: u.id, from: taken.map(o => ({ x: o.x, z: o.z })) });
}

// ---------- the map reacting ----------
function physicsOf(c: Ctx, o: Unit): Physics { return o.team === c.u.team ? 'soft' : 'full'; }

/**
 * Forced movement toward (px, pz) (`dir` 1) or away from it (`dir` -1), re-aimed every step.
 * `full` physics SLAMs into walls, units and the edge and drops into chasms (ABYSS); `soft` stops short.
 */
function pull(c: Ctx, o: Unit, px: number, pz: number, dist: number, kind: Physics, dir: 1 | -1): void {
  const s = c.s;

  if (!standing(o) || o.st.encased || dist <= 0) return;
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
      emitCombo(s, c.ev, 'ABYSS', c.u, o.id, null);
      fall(s, o, nx, nz, c.ev, c.u);

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

/** Fire on a tile: burns a web away and sets whoever stands there Burning, except a Benevolent caster's allies. */
function igniteTile(c: Ctx, x: number, z: number, turns: number): void {
  const s = c.s;

  if (!inb(x, z)) return;
  const t = terrAt(s, x, z);

  if (isSolid(s, x, z) || t === '~' || t === 'I') return;
  clearFx(s, x, z, 'web');
  setFx(s, x, z, 'fire', turns);
  c.ev.push({ type: 'fire', x, z });
  const o = unitAt(s, x, z);

  if (o && !isDowned(o) && !(o.team === c.u.team && c.u.mods.benevolent)) addStatus(o, 'burn', { t: 2, dmg: 6 + (c.u.mods.burnDmg || 0), by: c.u.id }, c.ev);
}

/** Ending any move on a tile: water wets, fire burns, a web Roots a non-Weaver. */
export function arrive(s: BattleState, o: Unit, ev: BattleEvent[]): void {
  if (!standing(o)) return;
  const t = terrAt(s, o.x, o.z), f = s.fx[idx(o.x, o.z)];

  if (t === '~') addStatus(o, 'wet', { t: 2, by: null }, ev);
  else if (f?.fire && !o.st.burn) addStatus(o, 'burn', { t: 2, dmg: 6, by: null }, ev);

  if (f?.web && o.cls !== 'weaver') root(s, o, null, ev);
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

/** A Thread breaks once its ends lose sight of each other, or either is Downed or Burning. */
export function breakThreads(s: BattleState, ev: BattleEvent[]): void {
  if (!s.threads.length) return;
  s.threads = s.threads.filter(t => {
    const a = getUnit(s, t.by), b = getUnit(s, t.to);
    const ok = !!a && !!b && standing(a) && standing(b) && !a.st.burn && !b.st.burn && los(s, a.x, a.z, b.x, b.z);

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

  harvest(c) { gather(c.s, c.u, soulsInReach(c.s, c.u), c.ev); },
  lastrites(c) { revive(c.s, tgt(c), 0.4, c.ev, c.u); },
  bonewall(c) {
    const tiles = boneTiles(c.s, c.u, c.tx, c.tz);

    for (const t of tiles) setFx(c.s, t.x, t.z, 'bone', 2);
    c.ev.push({ type: 'terrain', tiles, kind: 'bone' });
  },
  wither(c) { addStatus(tgt(c), 'wither', { t: 2, by: c.u.id }, c.ev); },
  soulbolt(c) { hit(c, tgt(c), 14 + 6 * c.u.souls + (c.u.mods.soulBoltDmg || 0), 'phys'); },
  soulburst(c) {
    const s = c.s, u = c.u;
    s.souls = s.souls.filter(o => o.x !== c.tx || o.z !== c.tz);

    for (const o of unitsIn(s, square(c.tx, c.tz, 1))) if (o.team !== u.team) hit(c, o, 18 + (u.mods.burstDmg || 0), 'phys');
  },
  siphon(c) {
    const s = c.s, u = c.u, took = hit(c, tgt(c), 12, 'drain');
    const hurt = (a: Unit) => a.hp / a.maxHp;
    const silk = s.party[u.team].has('soulsilk');
    const reach = (a: Unit) => cheb(a.x, a.z, u.x, u.z) <= 3 || (silk && heldBy(s, a, u.team));
    const mend = s.units.filter(a => a.team === u.team && standing(a) && !a.st.wither && reach(a)).sort((a, b) => hurt(a) - hurt(b))[0];

    if (mend && took > 0) heal(s, mend, took, c.ev, u);
  },
  toll(c) {
    const s = c.s, u = c.u, o = tgt(c), ph = s.phase;

    if (ph.kind !== 'act') return;
    ph.tolled.push(o.id);

    if (o === u) {
      ph.queue.splice(ph.qi, 1);
      ph.queue.push({ id: u.id, extra: true });
    } else {
      const [turn] = ph.queue.splice(nextTurn(s, o.id), 1);

      if (!turn) return;

      if (o.team === u.team) ph.queue.splice(ph.qi + 1, 0, turn); else ph.queue.push(turn);
    }

    c.ev.push({ type: 'queue', queue: ph.queue.map(t => ({ ...t })) });

    if (o.team === u.team && o !== u && u.mods.accel) { addStatus(o, 'haste', { t: 1, by: u.id }, c.ev); shield(o, 15, c.ev); }

    if (o.team !== u.team && u.mods.tollHush) addStatus(o, 'hush', { t: 1, by: u.id }, c.ev);
    const called = s.calls.some(k => k.team === u.team && k.skill !== 'recall' && callTiles(k.skill, k.x, k.z).some(p => p.x === o.x && p.z === o.z));

    if (o.team !== u.team && called && s.party[u.team].has('appointedhour')) root(s, o, u.id, c.ev);
  },
  knell(c) {
    const s = c.s, o = tgt(c), late = actedThisRound(s, o.id);
    hit(c, o, (12 + (c.u.mods.knellDmg || 0)) * (late ? 1.5 : 1), 'phys');

    if (late && standing(o)) root(s, o, c.u.id, c.ev);
  },
  hush(c) { hush(c.s, tgt(c), c.u.id, c.ev); },
  peal(c) {
    const s = c.s, u = c.u, dmg = 10 + 3 * actedCount(s) + (u.mods.pealDmg || 0);

    for (const o of s.units) if (o.team !== u.team && standing(o) && cheb(o.x, o.z, u.x, u.z) <= 2) hit(c, o, dmg, 'phys');
  },
  encore(c) {
    const ph = c.s.phase;

    if (ph.kind !== 'act') return;
    ph.queue.push({ id: tgt(c).id, extra: true });
    c.ev.push({ type: 'queue', queue: ph.queue.map(t => ({ ...t })) });
  },
  overture(c) {
    const s = c.s, u = c.u, ph = s.phase;

    if (ph.kind !== 'act') return;
    const later = ph.queue.slice(ph.qi + 1), ours = later.filter(t => getUnit(s, t.id)?.team === u.team);
    ph.queue = [...ph.queue.slice(0, ph.qi + 1), ...ours, ...later.filter(t => !ours.includes(t))];
    c.ev.push({ type: 'queue', queue: ph.queue.map(t => ({ ...t })) });
  },
  hourglass(c) {
    const s = c.s, u = c.u, o = tgt(c);

    if (o.team === u.team) {
      for (const k of BAD_KEYS) delete o.st[k];
      c.ev.push({ type: 'cleanse', id: o.id });

      return;
    }

    const { burn: b, poison: p } = o.st;
    o.st = {};
    o.shield = 0;
    c.ev.push({ type: 'cleanse', id: o.id });

    if (b) damage(s, o, b.dmg * b.t, c.ev, 'burn', u);

    if (p && standing(o)) damage(s, o, p.dmg * p.t, c.ev, 'poison', u);
  },
  bellguard(c) {
    shield(c.u, 25 + (c.u.mods.guardShield || 0), c.ev);
    addStatus(c.u, 'guard', { t: 1, by: c.u.id }, c.ev);
  },
  equalize(c) {
    const s = c.s, u = c.u, o = tgt(c), mid = (u.hp / u.maxHp + o.hp / o.maxHp) / 2;

    if (o.team === u.team) {
      const give = Math.min(30, Math.round((mid - o.hp / o.maxHp) * o.maxHp), u.hp - 1);

      if (give <= 0) return;
      u.hp -= give;
      c.ev.push({ type: 'damage', id: u.id, amount: give, absorbed: 0, kind: 'drain' });
      heal(s, o, give, c.ev, u);

      return;
    }

    const took = damage(s, o, Math.min(30, Math.round((o.hp / o.maxHp - mid) * o.maxHp)), c.ev, 'drain', u);

    if (took > 0) heal(s, u, took, c.ev, u);
  },
};

// ---------- Calls ----------
export function callTiles(skill: CallSkill, x: number, z: number): Pos[] {
  const r = SKILLS[skill].aoe;

  return r ? square(x, z, r) : [{ x, z }];
}

/** Hurts an enemy, or an ally when the caster lacks Benevolent Heavens; heals that ally for a quarter otherwise. True when it hurt. */
function strike(c: LandCtx, o: Unit, base: number, kind: DamageKind, combo?: Combo | null): boolean {
  if (o.team === c.u.team && c.u.mods.benevolent) { heal(c.s, o, base * c.power * 0.25, c.ev, c.u); return false; }

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
    const dist = Math.max(1, Math.floor(2 * c.power));
    const pulled = c.victims.slice();
    pulled.sort((a, b) => cheb(a.x, a.z, c.x, c.z) - cheb(b.x, b.z, c.x, c.z));

    for (const o of pulled) pull(c, o, c.x, c.z, dist, 'full', 1);
  },
  recall(c) {
    const r = c.call.recall, o = r && getUnit(c.s, r.id);

    if (r && o && isDowned(o) && r.hp > 0 && c.s.party[c.call.team].has('seconddawn')) {
      o.life = { kind: 'up' };
      o.hp = 0;
      delete o.st.encased;
      c.s.stats.revives[o.team]++;
      c.ev.push({ type: 'revive', id: o.id, by: c.u.id });
    }

    if (!r || !o || !standing(o)) return;
    const there = unitAt(c.s, r.x, r.z);

    if ((o.x !== r.x || o.z !== r.z) && !there && !isSolid(c.s, r.x, r.z) && !o.st.encased) teleport(c, o, r);
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

/** One landing of `call` centered on (x, z): the skill, then Absolute Zero, Sleet and Star-Tether on everyone it hit. */
function landAt(s: BattleState, u: Unit, call: Call, x: number, z: number, power: number, ev: BattleEvent[]): void {
  const tiles = callTiles(call.skill, x, z);
  ev.push({ type: 'land', id: u.id, skill: call.skill, x, z, tiles, power });
  const c: LandCtx = { s, u, ev, power, call, x, z, tiles, victims: [] };

  if (call.skill === 'recall') { LAND.recall(c); return; }

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

/** A Call lands, +25% with Conjunction when another of the party's Calls already landed this round. */
export function landCall(s: BattleState, u: Unit, call: Call, power: number, ev: BattleEvent[]): void {
  const team = call.team;

  if (s.party[team].has('conjunction') && s.callRound[team] === s.round) power *= 1.25;
  s.callRound[team] = s.round;
  landAt(s, u, call, call.x, call.z, power, ev);
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

  if (sk.rite) { u.souls--; ev.push({ type: 'spend', id: u.id }); }

  if (isAlive(u)) {
    if (isCall(id)) {
      s.calls.push({ by: u.id, team: u.team, skill: id, x: tx, z: tz, recall: id === 'recall' && target ? { id: target.id, x: target.x, z: target.z, hp: target.hp } : null });
      ev.push({ type: 'call', id: u.id, team: u.team, skill: id, tiles: callTiles(id, tx, tz) });
    } else {
      const c: CastCtx = { s, u, ev, power: 1, skill: sk, tx, tz, target, cast };
      RUN[isBasic(id) ? 'basic' : id](c);
    }
  }

  if (!sk.free) u.acted = true;
  const cd = cdOf(s, u, id);

  if (cd > 0) u.cd[id] = cd;
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
  const ev: BattleEvent[] = [{ type: 'move', id: u.id, path: p }];
  u.x = x; u.z = z; u.moved = true;

  for (const b of p.slice(1)) if (s.fx[idx(b.x, b.z)]?.fire && !u.st.burn && !u.st.wet) addStatus(u, 'burn', { t: 2, dmg: 6, by: null }, ev);
  arrive(s, u, ev);
  const here = soulAt(s, x, z);

  if (here && soulCap(s, u)) gather(s, u, [here], ev);
  breakThreads(s, ev);
  checkWinner(s);

  return ev;
}
