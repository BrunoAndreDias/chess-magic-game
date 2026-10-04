import { CLASS_ORDER } from './tables';
import { buildQueue } from './turns';
import type { ClassId, Team } from './types';

/** One seat of the pick phase: the team's next turn-order position goes to `member`, playing `cls`, for the whole battle. */
export interface Lock { team: Team; member: number; cls: ClassId }

export interface PickState {
  starter: Team;
  /** In step order; the draft is done at 6. */
  locks: Lock[];
  /** Each team's pre-selected class per member index. Private to that team. */
  hover: [(ClassId | null)[], (ClassId | null)[]];
}

export type PickCmd =
  | { kind: 'hover'; team: Team; member: number; cls: ClassId | null }
  | { kind: 'lock'; team: Team; member: number; cls: ClassId };

const PARTY = 3;

/** The team of each step. Draft order is turn order: step k fills the k-th turn of the round's queue, so the starter picks first and last. */
export function steps(starter: Team): Team[] {
  const other: Team = starter === 0 ? 1 : 0;

  return buildQueue([0, 1, 2], [3, 4, 5]).map(n => (n < PARTY ? starter : other));
}

export function newPicks(starter: Team): PickState {
  const none = () => Array.from({ length: PARTY }, (): ClassId | null => null);

  return { starter, locks: [], hover: [none(), none()] };
}

/** The team whose step it is; null when the draft is done. */
export function onClock(p: PickState): Team | null {
  return steps(p.starter)[p.locks.length] ?? null;
}

/** That team's locks in turn order. */
export function lineup(p: PickState, team: Team): Lock[] {
  return p.locks.filter(l => l.team === team);
}

const locked = (p: PickState, team: Team, member: number) => p.locks.some(l => l.team === team && l.member === member);

export function applyPick(p: PickState, cmd: PickCmd): { ok: true; state: PickState } | { ok: false; error: string } {
  const { team, member } = cmd;

  if (!Number.isInteger(member) || member < 0 || member >= PARTY) return { ok: false, error: `no member ${member}` };

  if (locked(p, team, member)) return { ok: false, error: `member ${member} of team ${team} is already locked` };

  if (cmd.kind === 'hover') {
    const hover: PickState['hover'] = [p.hover[0].slice(), p.hover[1].slice()];
    hover[team][member] = cmd.cls;

    return { ok: true, state: { ...p, hover } };
  }

  const clock = onClock(p);

  if (clock === null) return { ok: false, error: 'the draft is over' };

  if (clock !== team) return { ok: false, error: `not team ${team}'s step` };

  return { ok: true, state: { ...p, locks: [...p.locks, { team, member, cls: cmd.cls }] } };
}

/** Locks the team's lowest unlocked member, in a class the team doesn't have yet when one is left. */
export function aiLock(p: PickState, team: Team, rnd: () => number): PickCmd {
  const mine = lineup(p, team), have = new Set(mine.map(l => l.cls));
  const member = Array.from({ length: PARTY }, (_, i) => i).find(i => !locked(p, team, i)) ?? 0;
  const fresh = CLASS_ORDER.filter(c => !have.has(c)), pool = fresh.length ? fresh : CLASS_ORDER;

  return { kind: 'lock', team, member, cls: pool[Math.floor(rnd() * pool.length)] ?? 'astromancer' };
}
