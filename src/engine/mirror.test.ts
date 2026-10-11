import { describe, expect, test } from 'vitest';
import { castTargets, idx, reachable } from './board';
import { bare, begin, cast, end, run, stage, uid, unit } from './testkit';
import type { BattleEvent, NodeId } from './types';

const after = (events: BattleEvent[], type: BattleEvent['type']) => events.slice(events.findIndex(e => e.type === type));

const hits = (events: BattleEvent[]) => events.filter(e => e.type === 'damage' || e.type === 'reflect');

/** A Mirrormime Mirrors its ally (2), then two Bellringers (3, 4) hit that ally in turn. */
function mirroredAlly(tree: NodeId[] = []) {
  const s0 = stage({
    a: [bare('mirrormime', undefined, tree), bare('astromancer')], b: [bare('bellringer'), bare('bellringer')],
    place: { 1: [5, 1], 2: [5, 3], 3: [5, 4], 4: [6, 4] },
  });

  return run(s0, begin, cast(1, 'reflect', 5, 3), end(1), cast(3, 'basic_bellringer', 5, 3), end(3), cast(4, 'basic_bellringer', 5, 3));
}

describe('reflection', () => {
  test('Reflect turns half of the next enemy hit back on the attacker; the hit after lands whole', () => {
    const r = mirroredAlly();
    expect(hits(r.events)).toEqual([
      { type: 'damage', id: 2, amount: 8, absorbed: 0, kind: 'phys' },
      { type: 'reflect', id: 2, to: 3, amount: 7 },
      { type: 'damage', id: 3, amount: 7, absorbed: 0, kind: 'mirror' },
      { type: 'damage', id: 2, amount: 15, absorbed: 0, kind: 'phys' },
    ]);
  });

  test('Quicksilver keeps the Mirror up through every hit until the ally\'s next turn', () => {
    const r = mirroredAlly(['m_hp', 'm_reach', 'm_shield', 'm_quick']);
    expect(hits(r.events).slice(-3)).toEqual([
      { type: 'damage', id: 2, amount: 6, absorbed: 2, kind: 'phys' },
      { type: 'reflect', id: 2, to: 4, amount: 7 },
      { type: 'damage', id: 4, amount: 7, absorbed: 0, kind: 'mirror' },
    ]);
  });

  test('Hall of Mirrors flashes on the enemies near the ally, and turns the whole hit back though the ally still takes only half', () => {
    const r = mirroredAlly(['m_rico', 'm_retort', 'm_shatter', 'm_hall']);
    expect(hits(r.events).slice(0, 5)).toEqual([
      { type: 'damage', id: 3, amount: 8, absorbed: 0, kind: 'phys' },
      { type: 'damage', id: 4, amount: 8, absorbed: 0, kind: 'phys' },
      { type: 'damage', id: 2, amount: 8, absorbed: 0, kind: 'phys' },
      { type: 'reflect', id: 2, to: 3, amount: 15 },
      { type: 'damage', id: 3, amount: 15, absorbed: 0, kind: 'mirror' },
    ]);
  });

  test('Smoke and Mirrors hands a Frostbolt\'s Root back to the Astromancer that cast it', () => {
    const scene = (tree: NodeId[]) => {
      const s0 = stage({ a: [bare('mirrormime', undefined, tree)], b: [bare('astromancer')], place: { 1: [5, 1], 2: [5, 4] } });

      return run(s0, begin, cast(1, 'reflect', 5, 1), end(1), cast(2, 'frostbolt', 5, 1));
    };

    const smoke = scene(['m_reversal', 'm_hp2', 'm_ball', 'm_smoke']);
    expect(after(smoke.events, 'reflect').slice(2)).toEqual([{ type: 'reflect', id: 1, to: 2, amount: 0 }, { type: 'status', id: 2, key: 'root' }]);
    expect([unit(smoke.state, 1).st.root, unit(smoke.state, 2).st.root]).toEqual([undefined, { t: 2, by: 1 }]);
    expect(unit(scene([]).state, 1).st.root).toEqual({ t: 1, by: 2 });
  });
});

describe('glass', () => {
  /** The Mirrormime raises glass across column 3 at row 5; an Astromancer at (3, 7) aims a Frostbolt at `target`. */
  const shot = (target: [number, number]) => {
    const s0 = stage({ a: [bare('mirrormime'), bare('bellringer')], b: [bare('astromancer')], place: { 1: [3, 3], 2: [1, 6], 3: [3, 7] } });

    return run(s0, begin, cast(1, 'glasswall', 3, 5), end(1), cast(3, 'frostbolt', ...target));
  };

  test('an enemy shot through the glass bounces off it and hits the shooter; one that misses the glass lands', () => {
    const through = shot([3, 3]);
    expect(after(through.events, 'bounce').slice(0, 3)).toEqual([
      { type: 'bounce', id: 3, x: 3, z: 5 },
      { type: 'damage', id: 3, amount: 12, absorbed: 0, kind: 'frost' },
      { type: 'status', id: 3, key: 'root' },
    ]);
    expect(unit(through.state, 1).hp).toBe(135);
    expect(after(shot([1, 6]).events, 'damage')[0]).toEqual({ type: 'damage', id: 2, amount: 12, absorbed: 0, kind: 'frost' });
  });

  test('glass blocks moves for both parties, and Shatter breaks it on the enemies beside it', () => {
    const s0 = stage({ a: [bare('mirrormime', ['glasswall', 'shatter', 'mock'])], b: [bare('bellringer'), bare('bellringer')], place: { 1: [3, 3], 2: [3, 6], 3: [9, 9] } });
    const walled = run(s0, begin, cast(1, 'glasswall', 3, 5), end(1));
    expect(walled.events.find(e => e.type === 'terrain')).toEqual({ type: 'terrain', tiles: [{ x: 4, z: 5 }, { x: 3, z: 5 }, { x: 2, z: 5 }], kind: 'glass' });
    expect([reachable(walled.state, unit(walled.state, 2)).has(idx(3, 5)), reachable(walled.state, unit(walled.state, 2)).has(idx(3, 7))]).toEqual([false, true]);
    const shattered = run(walled.state, end(2), end(3), cast(1, 'shatter', 3, 3));
    expect(after(shattered.events, 'shatter')).toEqual([
      { type: 'shatter', tiles: [{ x: 2, z: 5 }, { x: 3, z: 5 }, { x: 4, z: 5 }] },
      { type: 'damage', id: 2, amount: 16, absorbed: 0, kind: 'phys' },
    ]);
    expect(shattered.state.fx[idx(3, 5)]).toEqual(undefined);
  });
});

describe('mirrormime skills', () => {
  test('a Mocked enemy can target only the Mirrormime among its party', () => {
    const s0 = stage({ a: [bare('mirrormime'), bare('bellringer')], b: [bare('astromancer')], place: { 1: [5, 1], 2: [4, 2], 3: [5, 4] } });
    const live = run(s0, begin).state;
    const targets = (s: typeof live) => castTargets(s, unit(s, 3), 'frostbolt').map(t => t.id);
    expect(targets(run(live, end(1)).state)).toEqual([1, 2]);
    expect(targets(run(live, cast(1, 'mock', 5, 4), end(1)).state)).toEqual([1]);
  });

  test('Retort adds half the HP the Mirrormime lost since its last turn', () => {
    const s0 = stage({ a: [bare('mirrormime', ['retort', 'ricochet', 'mock'])], b: [bare('bellringer')], place: { 1: [5, 1], 2: [5, 2] } });
    const r = run(s0, begin, end(1), cast(2, 'basic_bellringer', 5, 1), end(2), cast(1, 'retort', 5, 2));
    expect(r.events.at(-1)).toEqual({ type: 'damage', id: 2, amount: 17, absorbed: 0, kind: 'phys' });
  });

  test('Ricochet bounces to the nearest other enemy within 2', () => {
    const s0 = stage({ a: [bare('mirrormime')], b: [bare('bellringer'), bare('bellringer'), bare('bellringer')], place: { 1: [5, 1], 2: [5, 4], 3: [7, 4], 4: [5, 7] } });
    const r = run(s0, begin, cast(1, 'ricochet', 5, 4));
    expect(after(r.events, 'damage')).toEqual([{ type: 'damage', id: 2, amount: 12, absorbed: 0, kind: 'phys' }, { type: 'damage', id: 3, amount: 8, absorbed: 0, kind: 'phys' }]);
  });

  test('Reversal moves an ally\'s Root onto the nearest enemy', () => {
    const s0 = stage({ a: [bare('mirrormime', ['reversal', 'ricochet', 'mock']), bare('bellringer')], b: [bare('bellringer')], place: { 1: [5, 1], 2: [5, 3], 3: [5, 5] } });
    unit(s0, 2).st.root = { t: 1, by: uid(3) };
    const r = run(s0, begin, cast(1, 'reversal', 5, 3));
    expect([unit(r.state, 2).st, unit(r.state, 3).st]).toEqual([{}, { root: { t: 1, by: 1 } }]);
  });
});
