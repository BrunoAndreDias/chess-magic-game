import { describe, expect, test } from 'vitest';
import { newMember } from '../engine/index';
import type { BattleEvent, BattleSetup, UnitId } from '../engine/index';
import { Match } from './match';
import type { Seats } from './match';

const setup: BattleSetup = {
  map: 'span', starter: 0,
  teams: [[newMember('delver', 'De'), newMember('astromancer', 'As'), newMember('weaver', 'We')], [newMember('weaver', 'We'), newMember('delver', 'De'), newMember('astromancer', 'As')]],
};
const ai: Seats = [[{ kind: 'ai' }, { kind: 'ai' }, { kind: 'ai' }], [{ kind: 'ai' }, { kind: 'ai' }, { kind: 'ai' }]];
const id = (n: number) => n as UnitId;

describe('Match', () => {
  test('a player can only command the units and team they hold', () => {
    const seats: Seats = [[{ kind: 'player', player: 'ana' }, { kind: 'player', player: 'ana' }, { kind: 'player', player: 'ana' }], ai[1]];
    const m = new Match(setup, seats, 1);
    m.start();
    expect(m.state.phase.kind === 'order' && m.state.phase.orders[0]).toBe(null);
    expect(m.state.phase.kind === 'order' && m.state.phase.orders[1]).toEqual([6, 5, 4]);

    expect(m.submit('bob', { kind: 'order', team: 0, order: [id(1), id(2), id(3)] })).toEqual({ ok: false, error: 'bob holds no seat on team 0' });
    expect(m.submit('ana', { kind: 'order', team: 1, order: [id(4), id(5), id(6)] })).toEqual({ ok: false, error: 'ana holds no seat on team 1' });
    expect(m.submit('ana', { kind: 'order', team: 0, order: [id(1), id(2), id(3)] }).ok).toBe(true);

    const ph = m.state.phase;
    expect(ph.kind === 'act' && ph.queue[ph.qi]).toBe(1);
    expect(m.submit('ana', { kind: 'endTurn', unit: id(4) })).toEqual({ ok: false, error: 'ana does not hold unit 4' });
    expect(m.submit('bob', { kind: 'endTurn', unit: id(1) })).toEqual({ ok: false, error: 'bob does not hold unit 1' });

    const seen: BattleEvent[] = [];
    m.subscribe(ev => seen.push(...ev));
    expect(m.submit('ana', { kind: 'endTurn', unit: id(1) }).ok).toBe(true);
    expect(seen[0]).toEqual({ type: 'activate', id: 6, team: 1, qi: 1 });
    expect(seen.at(-1)).toEqual({ type: 'activate', id: 2, team: 0, qi: 2 });
    const after = m.state.phase;
    expect(after.kind === 'act' && after.queue[after.qi]).toBe(2);
  });

  test('an all-AI match plays to the end, the same way for the same seed', () => {
    const play = (seed: number) => {
      const m = new Match(setup, ai, seed);
      let events = 0;
      m.subscribe(ev => { events += ev.length; });
      m.start();
      return { state: m.state, events };
    };
    const a = play(42), b = play(42), c = play(43);
    expect(a.state.phase).toEqual({ kind: 'over', winner: 0, reason: 'wipe' });
    expect(a.state.round).toBe(9);
    expect(b).toEqual(a);
    expect(c.state).not.toEqual(a.state);
  });
});
