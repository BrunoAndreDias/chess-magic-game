import { actionsOf, cheb, current, idx, isAlive, standing, terrAt } from './board';
import { addStatus, checkWinner, damage, fxEmpty, heal } from './combat';
import { DARK_ROUND, MAX_ROUNDS } from './tables';
import type { BattleEvent, BattleState, Team, Unit, UnitId } from './types';

/** The starter opens and closes the round; the rest alternate. */
export function buildQueue(sOrder: readonly UnitId[], oOrder: readonly UnitId[]): UnitId[] {
  const q: UnitId[] = [], n = Math.max(sOrder.length, oOrder.length);
  for (let i = 0; i < n; i++) {
    const a = sOrder[i], b = oOrder[i];
    if (a !== undefined) q.push(a);
    if (b !== undefined) q.push(b);
  }
  const last = sOrder[sOrder.length - 1];
  if (sOrder.length >= 2 && last !== undefined && q[q.length - 1] !== last) { q.splice(q.indexOf(last), 1); q.push(last); }
  return q;
}

export function orderable(s: BattleState, t: Team): Unit[] { return s.units.filter(u => isAlive(u) && u.team === t); }

/** Unknown ids are dropped and missing ones appended, then the round starts. */
export function setOrders(s: BattleState, ord0: readonly UnitId[], ord1: readonly UnitId[]): BattleEvent[] {
  if (s.phase.kind !== 'order') return [];
  const fix = (t: Team, ord: readonly UnitId[]) => {
    const ids = orderable(s, t).map(u => u.id), out = ord.filter(id => ids.includes(id));
    for (const id of ids) if (!out.includes(id)) out.push(id);
    return out;
  };
  const o: [UnitId[], UnitId[]] = [fix(0, ord0), fix(1, ord1)];
  const queue = buildQueue(o[s.starter], o[s.starter === 0 ? 1 : 0]);
  s.phase = { kind: 'act', queue, qi: 0 };
  const ev: BattleEvent[] = [{ type: 'round', round: s.round, starter: s.starter, queue: queue.slice() }];
  beginActivation(s, ev);
  return ev;
}

function beginActivation(s: BattleState, ev: BattleEvent[]): void {
  for (;;) {
    const ph = s.phase;
    if (ph.kind !== 'act') return;
    const u = current(s);
    if (!u || !isAlive(u)) {
      ph.qi++;
      if (ph.qi >= ph.queue.length) { endRound(s, ev); return; }
      continue;
    }
    ev.push({ type: 'activate', id: u.id, team: u.team, qi: ph.qi });
    u.moved = false; u.acted = false; u.moveCap = 0;
    for (const id of actionsOf(u)) { const c = u.cd[id]; if (c !== undefined && c > 0) u.cd[id] = c - 1; }
    for (const a of s.units) if (a.st.guard && a.st.guard.by === u.id) delete a.st.guard;
    if (u.life.kind === 'downed') {
      const bleed = u.life.bleed - 1;
      if (bleed <= 0) {
        u.life = { kind: 'dead' };
        ev.push({ type: 'death', id: u.id, team: u.team, cause: 'bled' });
        checkWinner(s);
      } else {
        u.life = { kind: 'downed', bleed };
        ev.push({ type: 'bleed', id: u.id, left: bleed });
      }
      if (advance(s, ev)) return;
      continue;
    }
    startOfTurn(s, u, ev);
    if (!standing(u) || s.phase.kind === 'over') {
      if (s.phase.kind === 'over') return;
      if (advance(s, ev)) return;
      continue;
    }
    if (u.st.stun) {
      delete u.st.stun;
      ev.push({ type: 'skip', id: u.id });
      tickStatuses(s, u);
      if (advance(s, ev)) return;
      continue;
    }
    if (u.st.root) u.moved = true;
    return;
  }
}

function startOfTurn(s: BattleState, u: Unit, ev: BattleEvent[]): void {
  if (s.round >= DARK_ROUND) {
    const dd = 4 * (s.round - DARK_ROUND + 1);
    ev.push({ type: 'dark', id: u.id, amount: dd });
    damage(s, u, dd, ev, 'dark', null);
    if (!standing(u)) return;
  }
  const b = u.st.burn;
  if (b) {
    damage(s, u, b.dmg, ev, 'burn', null);
    if (standing(u)) for (const o of s.units) {
      if (o !== u && standing(o) && o.team === u.team && cheb(o.x, o.z, u.x, u.z) <= 1 && !o.st.burn) {
        const src = s.units.find(w => w.team !== u.team && w.mods.wildfire && isAlive(w));
        if (src) addStatus(o, 'burn', { t: 2, dmg: b.dmg, by: src.id }, ev);
      }
    }
  }
  if (standing(u) && u.st.poison) damage(s, u, u.st.poison.dmg, ev, 'poison', null);
  if (standing(u) && u.st.guard && s.party[u.team].has('bastion')) heal(s, u, 8, ev, null);
}

type TickingKey = 'root' | 'mark' | 'expose' | 'taunt' | 'haste' | 'burn' | 'poison' | 'empower';
const TICKING: readonly TickingKey[] = ['root', 'mark', 'expose', 'taunt', 'haste', 'burn', 'poison', 'empower'];
function tickStatuses(s: BattleState, u: Unit): void {
  for (const k of TICKING) {
    const v = u.st[k];
    if (!v) continue;
    v.t--;
    if (v.t <= 0) delete u.st[k];
  }
  const wet = u.st.wet;
  if (wet) { if (terrAt(s, u.x, u.z) === '~') wet.t = 2; else if (--wet.t <= 0) delete u.st.wet; }
}

/** Ends the current unit's turn and runs the queue on to the next unit that can act. */
export function endActivation(s: BattleState): BattleEvent[] {
  const u = current(s), ev: BattleEvent[] = [];
  if (!u) return ev;
  if (standing(u)) {
    const t = terrAt(s, u.x, u.z), f = s.fx[idx(u.x, u.z)];
    if (t === '+') heal(s, u, 12, ev, null);
    if (f?.fire && !u.st.burn) addStatus(u, 'burn', { t: 2, dmg: 6, by: null }, ev);
    if (t === '~') addStatus(u, 'wet', { t: 2, by: u.st.wet ? u.st.wet.by : null }, ev);
    tickStatuses(s, u);
  }
  u.moveCap = 0; u.moved = true; u.acted = true;
  if (!advance(s, ev)) beginActivation(s, ev);
  return ev;
}

/** True when the round (or the battle) ended. */
function advance(s: BattleState, ev: BattleEvent[]): boolean {
  const ph = s.phase;
  if (ph.kind !== 'act') return true;
  ph.qi++;
  if (ph.qi >= ph.queue.length) { endRound(s, ev); return true; }
  return false;
}

const EXPIRING: readonly ('fire' | 'smoke' | 'ice' | 'flood' | 'wall')[] = ['fire', 'smoke', 'ice', 'flood', 'wall'];
function endRound(s: BattleState, ev: BattleEvent[]): void {
  const burnt: number[] = [];
  s.fx.forEach((f, k) => {
    if (!f) return;
    for (const key of EXPIRING) {
      const v = f[key];
      if (!v) continue;
      if (v - 1 > 0) { f[key] = v - 1; continue; }
      delete f[key];
      if (key === 'fire' && s.terr[k] === 'G') { s.terr[k] = '.'; burnt.push(k); }
      if (key === 'wall') delete f.whp;
    }
    if (fxEmpty(f)) s.fx[k] = undefined;
  });
  ev.push({ type: 'roundEnd', round: s.round, burnt });
  s.round++;
  s.starter = s.starter === 0 ? 1 : 0;
  if (s.round > MAX_ROUNDS) {
    const hp = [0, 0];
    for (const u of s.units) if (standing(u)) hp[u.team] = (hp[u.team] ?? 0) + u.hp / u.maxHp;
    const [h0 = 0, h1 = 0] = hp;
    s.phase = { kind: 'over', winner: h0 > h1 ? 0 : h1 > h0 ? 1 : 'draw', reason: 'rounds' };
    return;
  }
  s.phase = { kind: 'order', orders: [null, null] };
}

