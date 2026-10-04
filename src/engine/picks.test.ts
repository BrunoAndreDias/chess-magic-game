import { describe, expect, test } from 'vitest';
import { aiLock, applyPick, lineup, newPicks, onClock } from './picks';
import type { PickCmd, PickState } from './picks';

function picks(p: PickState, ...cmds: PickCmd[]): PickState {
  return cmds.reduce((s, cmd) => {
    const r = applyPick(s, cmd);
    if (!r.ok) throw new Error(`${JSON.stringify(cmd)} rejected: ${r.error}`);
    return r.state;
  }, p);
}

describe('picks', () => {
  test('six locks in turn order give each team its lineup, and the clock stops', () => {
    const done = picks(newPicks(1),
      { kind: 'lock', team: 1, member: 2, cls: 'bellringer' },
      { kind: 'lock', team: 0, member: 1, cls: 'weaver' },
      { kind: 'lock', team: 1, member: 0, cls: 'weaver' },
      { kind: 'lock', team: 0, member: 0, cls: 'gravecaller' },
      { kind: 'lock', team: 0, member: 2, cls: 'gravecaller' },
      { kind: 'lock', team: 1, member: 1, cls: 'astromancer' });
    expect(lineup(done, 1)).toEqual([
      { team: 1, member: 2, cls: 'bellringer' }, { team: 1, member: 0, cls: 'weaver' }, { team: 1, member: 1, cls: 'astromancer' },
    ]);
    expect(lineup(done, 0)).toEqual([
      { team: 0, member: 1, cls: 'weaver' }, { team: 0, member: 0, cls: 'gravecaller' }, { team: 0, member: 2, cls: 'gravecaller' },
    ]);
    expect(onClock(done)).toBe(null);
    expect(onClock(newPicks(1))).toBe(1);
    expect(applyPick(done, { kind: 'lock', team: 1, member: 0, cls: 'weaver' })).toEqual({ ok: false, error: 'member 0 of team 1 is already locked' });
  });

  test('a team locks only on its own step', () => {
    const p = newPicks(0);
    expect(applyPick(p, { kind: 'lock', team: 1, member: 0, cls: 'weaver' })).toEqual({ ok: false, error: 'not team 1\'s step' });
    const r = applyPick(p, { kind: 'lock', team: 0, member: 0, cls: 'weaver' });
    expect(r.ok && [r.state.locks, onClock(r.state)]).toEqual([[{ team: 0, member: 0, cls: 'weaver' }], 1]);
    const theirs = picks(p, { kind: 'lock', team: 0, member: 0, cls: 'weaver' });
    expect(applyPick(theirs, { kind: 'lock', team: 1, member: 0, cls: 'weaver' }).ok).toBe(true);
  });

  test('a locked member can\'t be locked again; an unlocked one can', () => {
    const p = picks(newPicks(0), { kind: 'lock', team: 0, member: 1, cls: 'astromancer' }, { kind: 'lock', team: 1, member: 1, cls: 'astromancer' });
    expect(applyPick(p, { kind: 'lock', team: 0, member: 1, cls: 'weaver' })).toEqual({ ok: false, error: 'member 1 of team 0 is already locked' });
    const r = applyPick(p, { kind: 'lock', team: 0, member: 2, cls: 'weaver' });
    expect(r.ok && lineup(r.state, 0)).toEqual([{ team: 0, member: 1, cls: 'astromancer' }, { team: 0, member: 2, cls: 'weaver' }]);
  });

  test('a team pre-selects off its step and changes its mind, then locks; a locked member takes no more pre-selects', () => {
    const p = picks(newPicks(0),
      { kind: 'hover', team: 1, member: 0, cls: 'weaver' },
      { kind: 'hover', team: 1, member: 0, cls: 'bellringer' },
      { kind: 'hover', team: 1, member: 2, cls: 'gravecaller' },
      { kind: 'hover', team: 1, member: 2, cls: null });
    expect(p.hover).toEqual([[null, null, null], ['bellringer', null, null]]);
    const locked = picks(p, { kind: 'lock', team: 0, member: 0, cls: 'astromancer' }, { kind: 'lock', team: 1, member: 0, cls: 'bellringer' });
    expect(lineup(locked, 1)).toEqual([{ team: 1, member: 0, cls: 'bellringer' }]);
    expect(applyPick(locked, { kind: 'hover', team: 1, member: 0, cls: 'weaver' })).toEqual({ ok: false, error: 'member 0 of team 1 is already locked' });
    const r = applyPick(locked, { kind: 'hover', team: 1, member: 1, cls: 'weaver' });
    expect(r.ok && r.state.hover[1]).toEqual(['bellringer', 'weaver', null]);
  });

  test('applyPick leaves its input untouched', () => {
    const p = picks(newPicks(1), { kind: 'hover', team: 0, member: 1, cls: 'weaver' }, { kind: 'lock', team: 1, member: 0, cls: 'astromancer' });
    const before = structuredClone(p);
    const hovered = applyPick(p, { kind: 'hover', team: 0, member: 1, cls: 'bellringer' });
    const locked = applyPick(p, { kind: 'lock', team: 0, member: 1, cls: 'gravecaller' });
    expect([hovered.ok && hovered.state.hover[0], locked.ok && locked.state.locks.length]).toEqual([[null, 'bellringer', null], 2]);
    expect(p).toEqual(before);
  });

  test('the AI locks its lowest unlocked member in a class the team doesn\'t have yet', () => {
    const p = picks(newPicks(0), { kind: 'lock', team: 0, member: 0, cls: 'astromancer' }, { kind: 'lock', team: 1, member: 0, cls: 'weaver' });
    expect(aiLock(p, 0, () => 0)).toEqual({ kind: 'lock', team: 0, member: 1, cls: 'weaver' });
    expect(aiLock(p, 0, () => 0.99)).toEqual({ kind: 'lock', team: 0, member: 1, cls: 'bellringer' });
    expect(aiLock(newPicks(0), 0, () => 0)).toEqual({ kind: 'lock', team: 0, member: 0, cls: 'astromancer' });
  });
});
