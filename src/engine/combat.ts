import {
  BAD_KEYS, actedCount, actedThisRound, canUse, castOrigin, castTargets, cdOf, cheb, current, dancePath, dollMoves, dollOf, getUnit, glassOnLine, idx, inb, isAlive,
  isDoll, isDowned, isSolid, lastToAct, lineTiles, nearestFree, nextTurn, onHigh, reachable, shards, sign, soulAt, soulCap, soulsInReach, square, standing, standingDoll,
  terrAt, unitAt, unitsIn, wallTiles,
} from './board';
import {
  BLEED, BURN, CLASSES, DARK_ROUND, DIR8, DOLL, EXPOSE, HIGH_GROUND, NODE_N, PAIR_N, REAP_AT, REFLECT, SKILLS, SKILL_N as K, SOUL_HIT, SOUL_ROUNDS, STATUS, WET_SHOCK,
  WET_TURNS, isCall,
} from './tables';
import type { SkillDef } from './tables';
import type {
  BasicSkillId, BattleEvent, BattleState, Call, CallSkill, ClassSkillId, ComboName, DamageKind, InnateSkillId, Pos, SkillId, Soul, Statuses, StatusKey,
  TileFx, Unit, UnitId,
} from './types';

type CastEvent = Extract<BattleEvent, { type: 'cast' }>;

type SkillKey = Exclude<ClassSkillId | InnateSkillId, CallSkill> | 'basic' | 'helpup';

type Fx = Exclude<keyof TileFx, 'spent' | 'glassBy'>;

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

export function fxEmpty(f: TileFx): boolean {
  for (const _ in f) return false;

  return true;
}

export function checkWinner(s: BattleState): void {
  if (s.phase.kind === 'over') return;
  const a = s.units.some(u => u.team === 0 && standing(u) && !isDoll(u)), b = s.units.some(u => u.team === 1 && standing(u) && !isDoll(u));

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

  if (onHigh(s, u) && terrAt(s, tgt.x, tgt.z) !== '^' && cheb(u.x, u.z, tgt.x, tgt.z) > 1) v *= 1 + HIGH_GROUND.dmg;

  if (m.lastDmg && lastToAct(s, u, false)) v *= 1 + m.lastDmg;

  if (m.finalHour && lastToAct(s, u, true)) v *= 1 + m.finalHour;

  return v;
}

/**
 * Raw damage to one unit (no attacker scaling): Encased immunity, shields, downing, finishing.
 * A hit of SOUL_HIT or more drops a Soul; a unit's hit that leaves a Withered enemy (or a Reaper's target) at REAP_AT of max HP or less Downs it (REAP).
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
  const foe = !!src && src.team !== o.team && kind !== 'mirror';

  if (foe && !isDoll(o)) {
    const taken = standInFor(s, o, amt, ev, kind, src);

    if (taken >= amt) return 0;
    amt -= taken;
  }

  const back = foe && src && standing(src) ? mirrored(s, o, amt) : 0;

  if (back) amt -= Math.floor(amt * REFLECT);

  if (isDoll(o) && foe && dollOwner(s, o)?.mods.tangled) amt = Math.round(amt * NODE_N.p_tangled.taken);
  const ab = Math.min(o.shield, amt);
  o.shield -= ab;
  let d = amt - ab;
  o.hp -= d;

  if (src) s.stats.dmg[src.team] += d + ab;
  ev.push({ type: 'damage', id: o.id, amount: d, absorbed: ab, kind });

  if (src && back) turnBack(s, o, src, back, ev);

  if (isDoll(o)) {
    const owner = dollOwner(s, o);

    if (foe && src && standing(src) && owner?.mods.tangled) root(s, src, owner.id, ev);

    if (o.hp <= 0) breakDoll(s, o, ev);

    return d;
  }

  o.took += d;

  if (o.st.guard && src && src.team !== o.team && standing(src)) hush(s, src, o.id, ev);

  if (o.hp <= 0) { down(s, o, ev, src); return d; }

  if (d >= SOUL_HIT) dropSoul(s, o.x, o.z, ev);

  if (src && src.team !== o.team && !o.st.encased && o.hp <= o.maxHp * REAP_AT && (o.st.wither || src.mods.reap)) {
    emitCombo(s, ev, 'REAP', src, o.id, o.st.wither?.by ?? null);
    down(s, o, ev, src);
  }

  return d;
}

// ---------- reflection ----------
/** What a hit of `amt` on `o` turns back on its attacker: a Mirrored unit's share (the whole hit with Hall of Mirrors), or a Commedia Doll's. Spends the Mirror. */
function mirrored(s: BattleState, o: Unit, amt: number): number {
  if (isDoll(o)) return s.party[o.team].has('commedia') ? Math.floor(amt * PAIR_N.commedia.share) : 0;
  const m = o.st.mirror;

  if (!m || m.spent) return 0;
  const by = getUnit(s, m.by);

  if (!by?.mods.quicksilver) { if (by?.mods.smokeMirrors) m.spent = true; else delete o.st.mirror; }

  return by?.mods.hallMirrors ? amt : Math.floor(amt * REFLECT);
}

/** `back` damage returns from `o` to the attacker `src`. It can't be turned back again. */
function turnBack(s: BattleState, o: Unit, src: Unit, back: number, ev: BattleEvent[]): void {
  ev.push({ type: 'reflect', id: o.id, to: src.id, amount: back });
  const at = { x: src.x, z: src.z };
  damage(s, src, back, ev, 'mirror', o);

  if (isDoll(o)) return;

  if (s.party[o.team].has('blackmirror')) dropSoul(s, at.x, at.z, ev);

  if (s.party[o.team].has('echochamber') && standing(src)) hush(s, src, o.id, ev);
}

// ---------- the Doll ----------
function dollOwner(s: BattleState, d: Unit): Unit | null { return getUnit(s, d.owner); }

/**
 * The part of an enemy hit on `o` its party's Doll takes instead: all of it under a Stand-In, a quarter with Understudy, when `o` stands next to the Doll.
 * Returns the damage the Doll took for it.
 */
function standInFor(s: BattleState, o: Unit, amt: number, ev: BattleEvent[], kind: DamageKind, src: Unit | null): number {
  for (const d of s.units) {
    if (d.team !== o.team || !isDoll(d) || !standing(d) || cheb(d.x, d.z, o.x, o.z) > 1) continue;
    const owner = dollOwner(s, d);

    if (!owner || !standing(owner)) continue;
    const share = owner.st.standin ? 1 : owner.mods.understudy ? NODE_N.p_understudy.share : 0;
    const moved = Math.min(amt, Math.round(amt * share));

    if (moved <= 0) continue;
    ev.push({ type: 'standin', from: o.id, to: d.id });
    damage(s, d, moved, ev, kind, src);

    return moved;
  }

  return 0;
}

/** The rounds a broken Doll waits before it reforms. */
function reformDelay(s: BattleState, d: Unit): number {
  const owner = dollOwner(s, d), p = s.party[d.team];
  const sooner = (owner?.mods.dollReform || 0) + (p.has('bonepuppet') ? PAIR_N.bonepuppet.reform : 0) + (p.has('troupe') ? PAIR_N.troupe.reform : 0);

  return Math.max(1, DOLL.reform - sooner);
}

/** A Doll breaks: off the board until its owner's turn `reformDelay` rounds on. With Bone Puppet it drops a Soul. */
export function breakDoll(s: BattleState, d: Unit, ev: BattleEvent[]): void {
  if (s.party[d.team].has('bonepuppet')) dropSoul(s, d.x, d.z, ev);
  d.life = { kind: 'dead' };
  d.hp = 0; d.shield = 0; d.st = {};
  d.reform = s.round + reformDelay(s, d);
  ev.push({ type: 'break', id: d.id, reform: d.reform });
}

/** A broken Doll stands up again at full HP on the free tile nearest its owner. */
export function reformDoll(s: BattleState, owner: Unit, d: Unit, ev: BattleEvent[]): void {
  const at = nearestFree(s, owner.x, owner.z);

  if (!at) return;
  d.life = { kind: 'up' };
  d.hp = d.maxHp; d.shield = 0; d.x = at.x; d.z = at.z;
  delete d.reform;
  ev.push({ type: 'reform', id: d.id, x: at.x, z: at.z });
}

/** A standing unit drops into the chasm at (x, z) and clings to the edge: Downed on the nearest free tile of solid ground. A Doll breaks. */
export function fall(s: BattleState, o: Unit, x: number, z: number, ev: BattleEvent[], src: Unit | null): void {
  if (isDoll(o)) { ev.push({ type: 'fall', id: o.id, x, z }); breakDoll(s, o, ev); return; }

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

  checkWinner(s);
}

/** An attack: attacker scaling × Exposed × combo × the context's power. Downed targets are finished. */
function hit(c: Ctx, o: Unit | null, base: number, kind: DamageKind, combo?: Combo | null): number {
  const s = c.s, u = c.u;

  if (!o || !isAlive(o)) return 0;

  if (isDowned(o)) { damage(s, o, 1, c.ev, kind, u); return 0; }

  let mult = srcMult(s, u, o, kind) * (o.st.expose ? 1 + EXPOSE : 1) * c.power;

  if (combo) { mult *= combo.mult; emitCombo(s, c.ev, combo.name, u, o.id, combo.setup); }

  return damage(s, o, base * mult, c.ev, kind, u);
}

/** Puts a status on a standing character (a Doll takes none). A Mirror with Smoke and Mirrors hands an enemy's debuff back to whoever cast it. */
export function addStatus<K extends StatusKey>(s: BattleState, o: Unit, key: K, val: NonNullable<Statuses[K]>, ev: BattleEvent[], bounce = true): void {
  if (!standing(o) || isDoll(o)) return;
  const m = o.st.mirror, by = getUnit(s, val.by);

  if (bounce && m && STATUS[key].bad && by && by.team !== o.team && standing(by) && getUnit(s, m.by)?.mods.smokeMirrors) {
    ev.push({ type: 'reflect', id: o.id, to: by.id, amount: 0 });
    // Handed to the unit whose turn it is, a ticking debuff needs a turn more to outlast the end of this one.
    const t = current(s) === by && key !== 'stun' ? val.t + 1 : val.t;
    addStatus(s, by, key, { ...val, t, by: o.id }, ev, false);

    return;
  }

  if (key === 'burn' && o.st.wet) { ev.push({ type: 'steam', id: o.id }); return; }

  o.st[key] = val;

  if (key === 'wet' && o.st.burn) delete o.st.burn;
  ev.push({ type: 'status', id: o.id, key });
}

/** Encased: skips its turns, takes no damage, can't be moved. */
function encase(o: Unit, t: number, by: UnitId, ev: BattleEvent[]): void {
  if (!isAlive(o) || isDoll(o)) return;
  o.st.encased = { t, by };
  ev.push({ type: 'encased', id: o.id });
}

/** A Root that still holds on the unit's next turn, even when it lands during its own. */
function root(s: BattleState, o: Unit, by: UnitId | null, ev: BattleEvent[]): void {
  addStatus(s, o, 'root', { t: current(s) === o ? 2 : 1, by }, ev);
}

/** Hushed through the unit's next turn, even when it lands during its own. */
function hush(s: BattleState, o: Unit, by: UnitId, ev: BattleEvent[]): void {
  addStatus(s, o, 'hush', { t: current(s) === o ? 2 : 1, by }, ev);
}

/** Mirrored until its next turn; Backing Glass adds a shield, and Hall of Mirrors flashes on the enemies around it. */
function mirror(c: Ctx, o: Unit): void {
  const s = c.s, u = c.u;
  addStatus(s, o, 'mirror', { t: 1, by: u.id }, c.ev);

  if (u.mods.mirrorShield) shield(o, u.mods.mirrorShield, c.ev);

  if (!u.mods.hallMirrors) return;

  for (const e of s.units) if (e.team !== u.team && standing(e) && cheb(e.x, e.z, o.x, o.z) <= NODE_N.m_hall.radius) hit(c, e, NODE_N.m_hall.flash, 'phys');
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

/** Stands a Downed ally up at `frac` of its max HP, more while its party has a Ferryman, paid from the caster's own HP (never its last); a Psychopomp's touch adds a shield. */
function revive(s: BattleState, o: Unit, frac: number, ev: BattleEvent[], src: Unit): void {
  if (s.units.some(f => f.team === src.team && isAlive(f) && f.mods.ferryman)) frac = Math.max(frac, NODE_N.g_ferry.hp);
  o.life = { kind: 'up' };
  const give = Math.min(Math.max(1, Math.round(o.maxHp * frac)), src.hp - 1);
  src.hp -= give;
  ev.push({ type: 'damage', id: src.id, amount: give, absorbed: 0, kind: 'drain' });
  o.hp = give;
  s.stats.revives[o.team]++;
  ev.push({ type: 'revive', id: o.id, by: src.id });

  if (src.mods.riteShield) shield(o, src.mods.riteShield, ev);
}

// ---------- souls ----------
/** A Soul drops on (x, z), unless one already lies there. It lasts longer while either party is a Charnel House. */
function dropSoul(s: BattleState, x: number, z: number, ev: BattleEvent[]): void {
  if (soulAt(s, x, z) || isSolid(s, x, z)) return;
  s.souls.push({ x, z, t: SOUL_ROUNDS + (s.party.some(p => p.has('charnel')) ? PAIR_N.charnel.soulTurns : 0) });
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
/**
 * Forced movement toward (px, pz), re-aimed every step.
 * It SLAMs into walls, units and the edge and drops into chasms (ABYSS).
 */
function pull(c: Ctx, o: Unit, px: number, pz: number, dist: number): void {
  const s = c.s;

  if (!standing(o) || o.st.encased || dist <= 0) return;
  const path: Pos[] = [{ x: o.x, z: o.z }];
  const slide = () => { if (path.length > 1) c.ev.push({ type: 'move', id: o.id, path, slide: true }); };

  for (let k = 0; k < dist; k++) {
    const dx = sign(px - o.x), dz = sign(pz - o.z);

    if (!dx && !dz) break;
    const nx = o.x + dx, nz = o.z + dz, t = terrAt(s, nx, nz);

    if (inb(nx, nz) && t === 'o') {
      path.push({ x: nx, z: nz });
      c.ev.push({ type: 'move', id: o.id, path, slide: true });
      emitCombo(s, c.ev, 'ABYSS', c.u, o.id, null);
      fall(s, o, nx, nz, c.ev, c.u);

      return;
    }

    if (!inb(nx, nz) || isSolid(s, nx, nz) || unitAt(s, nx, nz)) {
      c.ev.push({ type: 'move', id: o.id, path, slide: true });

      if (t === 'B' && inb(nx, nz)) burstBrazier(c, nx, nz);
      emitCombo(s, c.ev, 'SLAM', c.u, o.id, null);
      damage(s, o, 6, c.ev, 'slam', c.u);
      addStatus(s, o, 'stun', { t: 1, by: c.u.id }, c.ev);

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

/** Fire on a tile: sets whoever stands there Burning, except a Benevolent caster's allies. */
function igniteTile(c: Ctx, x: number, z: number, turns: number): void {
  const s = c.s;

  if (!inb(x, z)) return;
  const t = terrAt(s, x, z);

  if (isSolid(s, x, z) || t === '~' || t === 'I') return;
  setFx(s, x, z, 'fire', turns);
  c.ev.push({ type: 'fire', x, z });
  const o = unitAt(s, x, z);

  if (o && !isDowned(o) && !(o.team === c.u.team && c.u.mods.benevolent)) addStatus(s, o, 'burn', burn(c), c.ev);
}

/** Ending any move on a tile: water wets, fire burns. */
export function arrive(s: BattleState, o: Unit, ev: BattleEvent[]): void {
  if (!standing(o)) return;
  const t = terrAt(s, o.x, o.z), f = s.fx[idx(o.x, o.z)];

  if (t === '~') addStatus(s, o, 'wet', { t: WET_TURNS, by: null }, ev);
  else if (f?.fire && !o.st.burn) addStatus(s, o, 'burn', { t: BURN.turns, dmg: BURN.dmg, by: null }, ev);
}

// ---------- the skills, one handler each ----------
function tgt(c: CastCtx): Unit {
  if (!c.target) throw new Error(`${c.skill.name} needs a unit target`);

  return c.target;
}

function burn(c: Ctx): NonNullable<Statuses['burn']> { return { t: BURN.turns, dmg: BURN.dmg + (c.u.mods.burnDmg || 0), by: c.u.id }; }

function teleport(c: Ctx, o: Unit, at: Pos): void {
  c.ev.push({ type: 'teleport', id: o.id, x: at.x, z: at.z });
  o.x = at.x; o.z = at.z;
  arrive(c.s, o, c.ev);
}

const RUN: Record<SkillKey, (c: CastCtx) => void> = {
  basic(c) { hit(c, tgt(c), CLASSES[c.u.cls].basic.dmg + (c.u.mods.basicDmg || 0), 'phys'); },
  helpup(c) { revive(c.s, tgt(c), K.helpup.hp, c.ev, c.u); },

  snap(c) {
    const call = c.s.calls.find(k => k.by === c.u.id);

    if (!call) return;
    c.s.calls = c.s.calls.filter(k => k !== call);
    landCall(c.s, c.u, call, K.snap.power, c.ev);
  },
  frostbolt(c) {
    const s = c.s, o = tgt(c), wet = o.st.wet;
    hit(c, o, K.frostbolt.dmg, 'frost', wet ? { name: 'FREEZE', mult: 1, setup: wet.by } : null);

    if (standing(o)) {
      if (wet) { delete o.st.wet; addStatus(s, o, 'stun', { t: 1, by: c.u.id }, c.ev); }
      else root(s, o, c.u.id, c.ev);
    }

    const iced: Pos[] = [];

    for (const t of square(o.x, o.z, 1)) if (terrAt(s, t.x, t.z) === '~') { setFx(s, t.x, t.z, 'ice', K.frostbolt.iceTurns); iced.push(t); }

    if (iced.length) c.ev.push({ type: 'terrain', tiles: iced, kind: 'ice' });
  },
  firebolt(c) {
    const o = tgt(c), b = o.st.burn;

    if (b) {
      delete o.st.burn;
      hit(c, o, K.firebolt.combust + b.dmg * b.t * K.firebolt.combustMult, 'fire', { name: 'COMBUST', mult: 1, setup: b.by });

      return;
    }

    hit(c, o, K.firebolt.dmg, 'fire');

    if (standing(o)) addStatus(c.s, o, 'burn', burn(c), c.ev);
  },
  prison(c) {
    const o = tgt(c);
    encase(o, o.team !== c.u.team && c.u.mods.absZero ? NODE_N.a_zero.turns : K.prison.turns, c.u.id, c.ev);
  },

  harvest(c) { gather(c.s, c.u, soulsInReach(c.s, c.u), c.ev); },
  lastrites(c) { revive(c.s, tgt(c), K.lastrites.hp, c.ev, c.u); },
  bonewall(c) {
    const tiles = wallTiles(c.s, c.u, c.tx, c.tz);

    for (const t of tiles) setFx(c.s, t.x, t.z, 'bone', K.bonewall.turns);
    c.ev.push({ type: 'terrain', tiles, kind: 'bone' });
  },
  wither(c) { addStatus(c.s, tgt(c), 'wither', { t: K.wither.turns, by: c.u.id }, c.ev); },
  soulbolt(c) { hit(c, tgt(c), K.soulbolt.dmg + K.soulbolt.perSoul * c.u.souls + (c.u.mods.soulBoltDmg || 0), 'phys'); },
  soulburst(c) {
    const s = c.s, u = c.u;
    s.souls = s.souls.filter(o => o.x !== c.tx || o.z !== c.tz);

    for (const o of unitsIn(s, square(c.tx, c.tz, K.soulburst.radius))) if (o.team !== u.team) hit(c, o, K.soulburst.dmg + (u.mods.burstDmg || 0), 'phys');
  },
  siphon(c) {
    const s = c.s, u = c.u, took = hit(c, tgt(c), K.siphon.dmg, 'drain');
    const hurt = (a: Unit) => a.hp / a.maxHp;
    const reach = (a: Unit) => cheb(a.x, a.z, u.x, u.z) <= K.siphon.reach;
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

    if (o.team === u.team && o !== u && u.mods.accel) { addStatus(s, o, 'haste', { t: 1, by: u.id }, c.ev); shield(o, NODE_N.b_accel.shield, c.ev); }

    if (o.team !== u.team && u.mods.tollHush) addStatus(s, o, 'hush', { t: 1, by: u.id }, c.ev);
    const called = s.calls.some(k => k.team === u.team && k.skill !== 'recall' && callTiles(k.skill, k.x, k.z).some(p => p.x === o.x && p.z === o.z));

    if (o.team !== u.team && called && s.party[u.team].has('appointedhour')) root(s, o, u.id, c.ev);
  },
  knell(c) {
    const s = c.s, o = tgt(c), late = actedThisRound(s, o.id);
    hit(c, o, (K.knell.dmg + (c.u.mods.knellDmg || 0)) * (late ? K.knell.lateMult : 1), 'phys');

    if (late && standing(o)) root(s, o, c.u.id, c.ev);
  },
  hush(c) { hush(c.s, tgt(c), c.u.id, c.ev); },
  peal(c) {
    const s = c.s, u = c.u, dmg = K.peal.dmg + K.peal.perActed * actedCount(s) + (u.mods.pealDmg || 0);

    for (const o of s.units) if (o.team !== u.team && standing(o) && cheb(o.x, o.z, u.x, u.z) <= K.peal.radius) hit(c, o, dmg, 'phys');
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

    const b = o.st.burn;
    o.st = {};
    o.shield = 0;
    c.ev.push({ type: 'cleanse', id: o.id });

    if (b) damage(s, o, b.dmg * b.t, c.ev, 'burn', u);
  },
  bellguard(c) {
    shield(c.u, K.bellguard.shield + (c.u.mods.guardShield || 0), c.ev);
    addStatus(c.s, c.u, 'guard', { t: 1, by: c.u.id }, c.ev);
  },

  strings(c) {
    const s = c.s, d = standingDoll(s, c.u), path = dollMoves(s, c.u).get(idx(c.tx, c.tz));

    if (!d || !path) return;
    d.x = c.tx; d.z = c.tz;
    c.ev.push({ type: 'move', id: d.id, path });
    arrive(s, d, c.ev);
  },
  switch(c) {
    const s = c.s, u = c.u, o = tgt(c), d = standingDoll(s, u);

    if (!d) return;
    const a = { x: o.x, z: o.z }, b = { x: d.x, z: d.z };
    d.x = -1;
    teleport(c, o, b);
    teleport(c, d, a);

    if (o !== u && u.mods.understudy) shield(o, NODE_N.p_understudy.shield, c.ev);
  },
  dance(c) {
    const s = c.s, u = c.u, o = tgt(c), path = dancePath(s, u, o), last = path[path.length - 1];

    if (!last || path.length < 2) return;
    o.x = last.x; o.z = last.z;
    c.ev.push({ type: 'move', id: o.id, path });
    arrive(s, o, c.ev);
    const called = s.calls.some(k => k.team === u.team && k.skill !== 'recall' && callTiles(k.skill, k.x, k.z).some(p => p.x === o.x && p.z === o.z));

    if (o.team !== u.team && called && s.party[u.team].has('fatedstrings')) root(s, o, u.id, c.ev);
  },
  tangle(c) {
    const s = c.s, d = standingDoll(s, c.u);

    if (!d) return;

    for (const o of unitsIn(s, square(d.x, d.z, 1))) {
      if (o.team === c.u.team || !standing(o)) continue;
      hit(c, o, K.tangle.dmg, 'phys');

      if (standing(o)) root(s, o, c.u.id, c.ev);
    }
  },
  razorwire(c) {
    const s = c.s, u = c.u, d = standingDoll(s, u);

    if (!d) return;

    for (const o of unitsIn(s, lineTiles(u.x, u.z, d.x, d.z))) if (o.team !== u.team) hit(c, o, K.razorwire.dmg + (u.mods.wireDmg || 0), 'phys');
  },
  splinter(c) {
    const s = c.s, u = c.u, d = standingDoll(s, u);

    if (!d) return;

    for (const o of unitsIn(s, square(d.x, d.z, 1))) if (o.team !== u.team) hit(c, o, K.splinter.dmg + (u.mods.splinterDmg || 0), 'phys');
    breakDoll(s, d, c.ev);
  },
  standin(c) { addStatus(c.s, c.u, 'standin', { t: 1, by: c.u.id }, c.ev); },
  rebuild(c) {
    const s = c.s, d = dollOf(s, c.u);

    if (!d) return;

    if (!standing(d)) { reformDoll(s, c.u, d, c.ev); return; }

    heal(s, d, d.maxHp - d.hp, c.ev, c.u);
    shield(d, K.rebuild.shield, c.ev);
  },

  reflect(c) { mirror(c, tgt(c)); },
  glasswall(c) {
    const s = c.s, tiles = wallTiles(s, c.u, c.tx, c.tz);

    for (const t of tiles) {
      setFx(s, t.x, t.z, 'glass', K.glasswall.turns);
      const f = s.fx[idx(t.x, t.z)];

      if (f) f.glassBy = c.u.team;
    }

    c.ev.push({ type: 'terrain', tiles, kind: 'glass' });
  },
  ricochet(c) {
    const s = c.s, u = c.u, o = tgt(c);
    hit(c, o, K.ricochet.dmg + (u.mods.ricochetDmg || 0), 'phys');

    if (o.team === u.team) return;

    const next = s.units.filter(e => e !== o && e.team !== u.team && standing(e) && cheb(e.x, e.z, o.x, o.z) <= K.ricochet.reach)
      .sort((a, b) => cheb(a.x, a.z, o.x, o.z) - cheb(b.x, b.z, o.x, o.z))[0];

    if (next) hit(c, next, K.ricochet.bounce + (u.mods.ricochetDmg || 0), 'phys');
  },
  retort(c) { hit(c, tgt(c), K.retort.dmg + (c.u.mods.retortDmg || 0) + Math.floor(c.u.took * K.retort.took), 'phys'); },
  mock(c) {
    const o = tgt(c);
    addStatus(c.s, o, 'mock', { t: current(c.s) === o ? 2 : 1, by: c.u.id }, c.ev);
  },
  mirrorball(c) {
    const s = c.s, u = c.u, near = s.units.filter(o => standing(o) && !isDoll(o) && cheb(o.x, o.z, u.x, u.z) <= K.mirrorball.radius);

    for (const o of near) if (o.team === u.team) mirror(c, o);

    for (const o of s.units) if (o.team !== u.team && standing(o) && cheb(o.x, o.z, u.x, u.z) <= K.mirrorball.radius) hit(c, o, K.mirrorball.dmg, 'phys');
  },
  shatter(c) {
    const s = c.s, u = c.u, glass = shards(s, u.team);

    for (const g of glass) {
      const f = s.fx[idx(g.x, g.z)];

      if (!f) continue;
      delete f.glass; delete f.glassBy;

      if (fxEmpty(f)) s.fx[idx(g.x, g.z)] = undefined;
    }

    c.ev.push({ type: 'shatter', tiles: glass });
    const near = s.units.filter(o => o.team !== u.team && standing(o) && glass.some(g => cheb(g.x, g.z, o.x, o.z) <= 1));

    for (const o of near) hit(c, o, K.shatter.dmg + (u.mods.shatterDmg || 0), 'phys');
  },
  reversal(c) {
    const s = c.s, u = c.u, o = tgt(c), bad = BAD_KEYS.filter(k => o.st[k]), moved = bad.map(k => [k, o.st[k]] as const);

    const foe = s.units.filter(e => e.team !== u.team && standing(e) && !isDoll(e) && cheb(e.x, e.z, o.x, o.z) <= K.reversal.reach)
      .sort((a, b) => cheb(a.x, a.z, o.x, o.z) - cheb(b.x, b.z, o.x, o.z))[0];

    for (const k of bad) delete o.st[k];
    c.ev.push({ type: 'cleanse', id: o.id });

    if (!foe) return;

    for (const [k, v] of moved) if (v) addStatus(s, foe, k, { ...v, by: u.id }, c.ev);
  },
  equalize(c) {
    const s = c.s, u = c.u, o = tgt(c), mid = (u.hp / u.maxHp + o.hp / o.maxHp) / 2;

    if (o.team === u.team) {
      const give = Math.min(K.equalize.most, Math.round((mid - o.hp / o.maxHp) * o.maxHp), u.hp - 1);

      if (give <= 0) return;
      u.hp -= give;
      c.ev.push({ type: 'damage', id: u.id, amount: give, absorbed: 0, kind: 'drain' });
      heal(s, o, give, c.ev, u);

      return;
    }

    const took = damage(s, o, Math.min(K.equalize.most, Math.round((o.hp / o.maxHp - mid) * o.maxHp)), c.ev, 'drain', u);

    if (took > 0) heal(s, u, took, c.ev, u);
  },
};

// ---------- Calls ----------
export function callTiles(skill: CallSkill, x: number, z: number): Pos[] {
  const r = SKILLS[skill].aoe;

  return r ? square(x, z, r) : [{ x, z }];
}

/** Hurts an enemy, or an ally when the caster lacks Benevolent Heavens; heals that ally for a share of it otherwise. True when it hurt. */
function strike(c: LandCtx, o: Unit, base: number, kind: DamageKind, combo?: Combo | null): boolean {
  if (o.team === c.u.team && c.u.mods.benevolent) { heal(c.s, o, base * c.power * NODE_N.a_benev.heal, c.ev, c.u); return false; }

  hit(c, o, base, kind, combo);

  return true;
}

const LAND: Record<CallSkill, (c: LandCtx) => void> = {
  meteor(c) {
    for (const t of c.tiles) {
      const tt = terrAt(c.s, t.x, t.z);

      if (tt === 'B') burstBrazier(c, t.x, t.z);
      else if (tt === 'G') igniteTile(c, t.x, t.z, 2);
    }

    for (const o of c.victims) {
      const center = o.x === c.x && o.z === c.z;

      if (strike(c, o, center ? K.meteor.center : K.meteor.edge, 'fire') && standing(o)) addStatus(c.s, o, 'burn', burn(c), c.ev);
    }
  },
  thunderhead(c) {
    for (const o of c.victims) {
      const wet = o.st.wet;
      strike(c, o, K.thunderhead.dmg, 'shock', wet && standing(o) ? { name: 'CONDUCT', mult: WET_SHOCK, setup: wet.by } : null);
    }
  },
  gravitywell(c) {
    const dist = Math.max(1, Math.floor(K.gravitywell.pull * c.power));
    const pulled = c.victims.slice();
    pulled.sort((a, b) => cheb(a.x, a.z, c.x, c.z) - cheb(b.x, b.z, c.x, c.z));

    for (const o of pulled) pull(c, o, c.x, c.z, dist);
  },
  recall(c) {
    const r = c.call.recall, o = r && getUnit(c.s, r.id);

    if (r && o && isDowned(o) && r.hp > 0 && c.s.party[c.call.team].has('seconddawn')) {
      o.life = { kind: 'up' };
      o.hp = 0;
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

/** One landing of `call` centered on (x, z): the skill, then Absolute Zero and Sleet on everyone it hit. */
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

    if (u.mods.absZero && held.has(o)) addStatus(s, o, 'stun', { t: 1, by: u.id }, ev);

    if (u.mods.callWet) addStatus(s, o, 'wet', { t: WET_TURNS, by: u.id }, ev);
  }
}

/** A Call lands, stronger with Conjunction when another of the party's Calls already landed this round. */
export function landCall(s: BattleState, u: Unit, call: Call, power: number, ev: BattleEvent[]): void {
  const team = call.team;

  if (s.party[team].has('conjunction') && s.callRound[team] === s.round) power *= 1 + PAIR_N.conjunction.dmg;
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
  let target = sk.target === 'tile' || sk.target === 'self' ? null : unitAt(s, tx, tz);
  const from = target ? castOrigin(s, u, id, tx, tz) : { x: u.x, z: u.z };
  const cast: CastEvent = { type: 'cast', id: u.id, team: u.team, skill: id, tx, tz, fx: from.x, fz: from.z, target: target ? target.id : null };
  const ev: BattleEvent[] = [cast];
  const glass = target && sk.los && target.team !== u.team ? glassOnLine(s, from.x, from.z, tx, tz, u.team) : null;

  // A shot through an enemy's Invisible Wall bounces off it and hits whoever fired it.
  if (glass) { ev.push({ type: 'bounce', id: u.id, x: glass.x, z: glass.z }); target = u; }

  if (sk.rite) { u.souls--; ev.push({ type: 'spend', id: u.id }); }

  if (isAlive(u)) {
    if (isCall(id)) {
      s.calls.push({ by: u.id, team: u.team, skill: id, x: tx, z: tz, recall: id === 'recall' && target ? { id: target.id, x: target.x, z: target.z, hp: target.hp } : null });
      ev.push({ type: 'call', id: u.id, team: u.team, skill: id, tiles: callTiles(id, tx, tz) });
    } else {
      const c: CastCtx = { s, u, ev, power: 1, skill: sk, tx: target ? target.x : tx, tz: target ? target.z : tz, target, cast };
      RUN[isBasic(id) ? 'basic' : id](c);
    }
  }

  if (!sk.free) u.acted = true;
  const cd = cdOf(s, u, id);

  if (cd > 0) u.cd[id] = cd;
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

  for (const b of p.slice(1)) if (s.fx[idx(b.x, b.z)]?.fire && !u.st.burn && !u.st.wet) addStatus(s, u, 'burn', { t: BURN.turns, dmg: BURN.dmg, by: null }, ev);
  arrive(s, u, ev);
  const here = soulAt(s, x, z);

  if (here && soulCap(s, u)) gather(s, u, [here], ev);
  checkWinner(s);

  return ev;
}
