import { describe, expect, test } from 'vitest';
import { newMember } from '../engine/index';
import { uid } from '../engine/testkit';
import type { BattleEvent, BattleSetup } from '../engine/index';
import { Match } from './match';
import type { Seats } from './match';

const setup: BattleSetup = {
  map: 'span', starter: 0,
  teams: [[newMember('bellringer', 'Wi'), newMember('astromancer', 'As'), newMember('bellringer', 'We')], [newMember('gravecaller', 'Gr'), newMember('gravecaller', 'Gw'), newMember('astromancer', 'As')]],
};

const ai: Seats = [[{ kind: 'ai' }, { kind: 'ai' }, { kind: 'ai' }], [{ kind: 'ai' }, { kind: 'ai' }, { kind: 'ai' }]];

const id = uid;

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

  test('a paced match plays one AI turn per callback and ends where the unpaced one does', () => {
    const later: (() => void)[] = [];
    const m = new Match(setup, ai, 42, next => later.push(next));
    m.start();
    expect(later.length).toBe(1);
    expect(m.state.phase.kind).toBe('act');

    for (let next = later.shift(); next; next = later.shift()) next();
    const unpaced = new Match(setup, ai, 42);
    unpaced.start();
    expect(m.state.phase.kind).toBe('over');
    expect(m.state).toEqual(unpaced.state);
  });
});
