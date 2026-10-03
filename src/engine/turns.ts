import { actionsOf, cheb, current, idx, isAlive, standing, terrAt } from './board';
import { addStatus, breakThreads, checkWinner, damage, fxEmpty, heal, landCalls, webOfFate } from './combat';
import { endOfRound } from './hazards';
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

/** Read through a call so narrowing doesn't outlive the mutations in between. */
function over(s: BattleState): boolean { return s.phase.kind === 'over'; }

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
    u.moved = false; u.acted = false;
    for (const id of actionsOf(u)) { const c = u.cd[id]; if (c !== undefined && c > 0) u.cd[id] = c - 1; }
    landCalls(s, u, ev);
    if (over(s)) return;
    delete u.st.share;
    if (u.life.kind === 'downed') {
      if (u.mods.undying && u.souls > 0 && !u.st.encased) { u.souls--; ev.push({ type: 'spend', id: u.id }); return; }
      bleed(s, u, ev);
      if (u.mods.undying && u.life.kind === 'downed') return;
      if (advance(s, ev)) return;
      continue;
    }
    if (standing(u)) startOfTurn(s, u, ev);
    breakThreads(s, ev);
    if (!standing(u) || over(s)) {
      if (over(s)) return;
      if (advance(s, ev)) return;
      continue;
    }
    if (u.st.stun || u.st.encased) {
      ev.push({ type: 'skip', id: u.id });
      tickStatuses(s, u, ev);
      if (u.st.encased) thaw(s, u, ev);
      else delete u.st.stun;
      if (advance(s, ev)) return;
      continue;
    }
    if (u.st.root) u.moved = true;
    return;
  }
}

/** A Downed unit's turn: it bleeds, unless Encased (a Cocoon) or lying within 2 of its party's standing Ferryman. */
function bleed(s: BattleState, u: Unit, ev: BattleEvent[]): void {
  if (u.life.kind !== 'downed') return;
  const enc = u.st.encased;
  if (enc) { if (--enc.t <= 0) delete u.st.encased; return; }
  if (s.units.some(f => f.team === u.team && f.mods.ferryman && standing(f) && cheb(f.x, f.z, u.x, u.z) <= 2)) return;
  const left = u.life.bleed - 1;
  if (left <= 0) {
    u.life = { kind: 'dead' };
    ev.push({ type: 'death', id: u.id, team: u.team, cause: 'bled' });
    checkWinner(s);
    return;
  }
  u.life = { kind: 'downed', bleed: left };
  ev.push({ type: 'bleed', id: u.id, left });
}

function startOfTurn(s: BattleState, u: Unit, ev: BattleEvent[]): void {
  if (s.round >= DARK_ROUND) {
    const dd = 4 * (s.round - DARK_ROUND + 1);
    ev.push({ type: 'dark', id: u.id, amount: dd });
    damage(s, u, dd, ev, 'dark', null);
    if (!standing(u)) return;
  }
  if (u.st.burn) damage(s, u, u.st.burn.dmg, ev, 'burn', null);
  if (standing(u) && u.st.poison) damage(s, u, u.st.poison.dmg, ev, 'poison', null);
  if (!standing(u)) return;
  if (u.mods.webOfFate) {
    const n = s.threads.filter(t => t.by === u.id).length;
    if (n && 10 * n > u.shield) { u.shield = 10 * n; ev.push({ type: 'shield', id: u.id, amount: 10 * n }); }
  }
  const ward = (u.mods.soulShield || 0) * u.souls;
  if (ward > u.shield && !u.st.wither) { u.shield = ward; ev.push({ type: 'shield', id: u.id, amount: ward }); }
}

const TICKING = ['root', 'expose', 'burn', 'poison', 'wither'] as const;
function tickStatuses(s: BattleState, u: Unit, ev: BattleEvent[]): void {
  for (const k of TICKING) {
    const v = u.st[k];
    if (!v) continue;
    v.t--;
    if (v.t <= 0) delete u.st[k];
  }
  const wet = u.st.wet;
  if (wet) { if (terrAt(s, u.x, u.z) === '~') wet.t = 2; else if (--wet.t <= 0) delete u.st.wet; }
}
/** Encased counts skipped turns, not ended ones, so an Encase that lands during the unit's own turn still costs it the next. */
function thaw(s: BattleState, u: Unit, ev: BattleEvent[]): void {
  const enc = u.st.encased;
  if (!enc || --enc.t > 0) return;
  delete u.st.encased;
  if (enc.ice) addStatus(u, 'wet', { t: 2, by: enc.by }, ev);
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
    tickStatuses(s, u, ev);
    webOfFate(s, u, ev);
  }
  u.moved = true; u.acted = true;
  breakThreads(s, ev);
  checkWinner(s);
  if (over(s)) return ev;
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

const EXPIRING = ['fire', 'smoke', 'ice', 'web', 'bone'] as const;
function endRound(s: BattleState, ev: BattleEvent[]): void {
  endOfRound(s, ev);
  if (s.phase.kind === 'over') return;
  const burnt: number[] = [];
  s.fx.forEach((f, k) => {
    if (!f) return;
    for (const key of EXPIRING) {
      const v = f[key];
      if (!v) continue;
      if (v - 1 > 0) { f[key] = v - 1; continue; }
      delete f[key];
      if (key === 'fire' && s.terr[k] === 'G') { s.terr[k] = '.'; burnt.push(k); }
    }
    if (fxEmpty(f)) s.fx[k] = undefined;
  });
  for (const o of s.souls) o.t--;
  s.souls = s.souls.filter(o => o.t > 0);
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
