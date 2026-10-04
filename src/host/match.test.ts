import { describe, expect, test } from 'vitest';
import { newMember } from '../engine/index';
import type { BattleEvent, BattleSetup, UnitId } from '../engine/index';
import { Match } from './match';
import type { Seats } from './match';

const setup: BattleSetup = {
  map: 'span', starter: 0,
  teams: [[newMember('weaver', 'Wi'), newMember('astromancer', 'As'), newMember('weaver', 'We')], [newMember('weaver', 'We'), newMember('weaver', 'Wi'), newMember('astromancer', 'As')]],
};
const ai: Seats = [[{ kind: 'ai' }, { kind: 'ai' }, { kind: 'ai' }], [{ kind: 'ai' }, { kind: 'ai' }, { kind: 'ai' }]];
const id = (n: number) => n as UnitId;

describe('Match', () => {
  test('a player can only command the units and team they hold', () => {
    const seats: Seats = [[{ kind: 'player', player: 'ana' }, { kind: 'player', player: 'ana' }, { kind: 'player', player: 'ana' }], ai[1]];
    const m = new Match(setup, seats, 1);
    expect(m.state.phase).toEqual({ kind: 'ready' });
    m.start();
    expect(m.submit('ana', { kind: 'begin' })).toEqual({ ok: false, error: 'the match begins itself' });

    const ph = m.state.phase;
    expect(ph.kind === 'act' && ph.queue[ph.qi]).toEqual({ id: 1, extra: false });
    expect(m.submit('ana', { kind: 'endTurn', unit: id(4) })).toEqual({ ok: false, error: 'ana does not hold unit 4' });
    expect(m.submit('bob', { kind: 'endTurn', unit: id(1) })).toEqual({ ok: false, error: 'bob does not hold unit 1' });

    const seen: BattleEvent[] = [];
    m.subscribe(ev => seen.push(...ev));
    expect(m.submit('ana', { kind: 'endTurn', unit: id(1) }).ok).toBe(true);
    expect(seen[0]).toEqual({ type: 'activate', id: 4, team: 1, qi: 1 });
    expect(seen.at(-1)).toEqual({ type: 'activate', id: 2, team: 0, qi: 2 });
    const after = m.state.phase;
    expect(after.kind === 'act' && after.queue[after.qi]).toEqual({ id: 2, extra: false });
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
    expect(a.state.phase.kind).toBe('over');
    expect(b).toEqual(a);
    expect(c.state).not.toEqual(a.state);
  });
});
