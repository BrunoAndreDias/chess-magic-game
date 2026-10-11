import { describe, expect, test } from 'vitest';
import { apply } from './battle';
import { castTargets, idx, reachable } from './board';
import { bare, begin, cast, end, move, run, stage, turns, unit } from './testkit';
import type { BattleEvent, NodeId } from './types';

const after = (events: BattleEvent[], type: BattleEvent['type']) => events.slice(events.findIndex(e => e.type === type));

const vent = ['p_lash', 'p_wire', 'p_splinter', 'p_ventriloquist'] as const;

describe('the doll', () => {
  test('a Marionettist starts with a 50 HP Doll on the free tile next to it, numbered after the characters and left out of the queue', () => {
    const s0 = stage({ a: [bare('marionettist'), bare('astromancer')], b: [bare('bellringer')] });
    const d = unit(s0, 4);
    expect([d.owner, d.x, d.z, d.hp, d.team]).toEqual([1, 0, 1, 50, 0]);
    expect(run(s0, begin).state.phase).toEqual({ kind: 'act', queue: turns(1, 3, 2), qi: 0, tolled: [] });
    expect(unit(stage({ a: [bare('bellringer')], b: [bare('bellringer')] }), 1).owner).toBe(undefined);
  });

  test('a party with only its Doll left standing has lost', () => {
    const s0 = stage({ a: [bare('marionettist')], b: [bare('bellringer')], place: { 1: [5, 1], 2: [5, 2], 3: [6, 1] }, hp: { 1: 10 } });
    const r = run(s0, begin, end(1), cast(2, 'basic_bellringer', 5, 1));
    expect(r.events.slice(-3)).toEqual([{ type: 'downed', id: 1, team: 0 }, { type: 'soul', x: 5, z: 1 }, { type: 'over', winner: 1, reason: 'wipe' }]);
    expect(unit(r.state, 3).life).toEqual({ kind: 'up' });
  });

  test('Strings walks the Doll up to 3 tiles but not past 4 from the Marionettist', () => {
    const s0 = stage({ a: [bare('marionettist')], b: [bare('bellringer')], place: { 1: [3, 1], 2: [9, 9], 3: [3, 2] } });
    const live = run(s0, begin).state;
    const r = run(live, cast(1, 'strings', 3, 5));
    expect(r.events.at(-1)).toEqual({ type: 'move', id: 3, path: [{ x: 3, z: 2 }, { x: 3, z: 3 }, { x: 3, z: 4 }, { x: 3, z: 5 }] });
    expect([unit(r.state, 3).x, unit(r.state, 3).z]).toEqual([3, 5]);
    const far = run(live, move(1, 3, 0)).state;
    expect(apply(far, cast(1, 'strings', 3, 5))).toEqual({ ok: false, error: '(3, 5) is not a target of strings' });
  });

  test('a standing Doll blocks an enemy\'s way through a gap; a broken one doesn\'t', () => {
    const gap = (life: 'up' | 'dead') => {
      const s0 = stage({ a: [bare('marionettist')], b: [bare('bellringer')], place: { 1: [0, 0], 2: [3, 4], 3: [3, 3] }, life: { 3: { kind: life } }, terr: [[2, 3, '#'], [4, 3, '#']] });
      const r = run(s0, begin, end(1));

      return reachable(r.state, unit(r.state, 2)).has(idx(3, 2));
    };

    expect([gap('up'), gap('dead')]).toEqual([false, true]);
  });

  test('a broken Doll reforms next to its Marionettist at full HP at the start of its turn 2 rounds later, not before', () => {
    const s0 = stage({ a: [bare('marionettist')], b: [bare('bellringer')], place: { 1: [5, 1], 2: [5, 3], 3: [5, 2] }, hp: { 3: 10 } });
    const broke = run(s0, begin, end(1), cast(2, 'basic_bellringer', 5, 2));
    expect(after(broke.events, 'damage')).toEqual([{ type: 'damage', id: 3, amount: 15, absorbed: 0, kind: 'phys' }, { type: 'break', id: 3, reform: 3 }]);
    const round2 = run(broke.state, end(2));
    expect(round2.events.some(e => e.type === 'reform')).toBe(false);
    const round3 = run(round2.state, end(1), end(2));
    expect(round3.events.slice(-2)).toEqual([{ type: 'activate', id: 1, team: 0, qi: 0 }, { type: 'reform', id: 3, x: 5, z: 0 }]);
    expect([unit(round3.state, 3).hp, unit(round3.state, 3).life]).toEqual([50, { kind: 'up' }]);
  });

  test('Switch trades places between the Marionettist and its Doll, or an ally and the Doll', () => {
    const s0 = stage({ a: [bare('marionettist'), bare('bellringer')], b: [bare('bellringer')], place: { 1: [5, 1], 2: [3, 1], 3: [9, 9], 4: [5, 4] } });
    const live = run(s0, begin).state;
    const self = run(live, cast(1, 'switch', 5, 1)).state;
    expect([[unit(self, 1).x, unit(self, 1).z], [unit(self, 4).x, unit(self, 4).z]]).toEqual([[5, 4], [5, 1]]);
    const ally = run(live, cast(1, 'switch', 3, 1)).state;
    expect([[unit(ally, 2).x, unit(ally, 2).z], [unit(ally, 4).x, unit(ally, 4).z]]).toEqual([[5, 4], [3, 1]]);
  });
});

describe('marionettist skills', () => {
  test('Stand-In: an enemy hit on an ally next to the Doll goes to the Doll; an ally away from it takes its own', () => {
    const scene = (allyAt: [number, number]) => {
      const s0 = stage({
        a: [bare('marionettist', ['standin', 'tangle', 'razorwire']), bare('bellringer')], b: [bare('bellringer')],
        place: { 1: [0, 0], 2: allyAt, 3: [5, 4], 4: [4, 4] },
      });

      return run(s0, begin, cast(1, 'standin', 0, 0), end(1), cast(3, 'basic_bellringer', allyAt[0], allyAt[1]));
    };

    const guarded = scene([5, 5]);
    expect(after(guarded.events, 'standin')).toEqual([
      { type: 'standin', from: 2, to: 4 },
      { type: 'damage', id: 4, amount: 15, absorbed: 0, kind: 'phys' },
    ]);
    // A Bellringer in the party makes it a Clockwork Doll: 70 HP.
    expect([unit(guarded.state, 2).hp, unit(guarded.state, 4).hp]).toEqual([155, 55]);
    const open = scene([6, 4]);
    expect(after(open.events, 'damage')).toEqual([{ type: 'damage', id: 2, amount: 15, absorbed: 0, kind: 'phys' }]);
  });

  test('Razor Wire cuts the enemy on the line between the Marionettist and its Doll, not the one beside it', () => {
    const s0 = stage({ a: [bare('marionettist')], b: [bare('bellringer'), bare('bellringer')], place: { 1: [5, 1], 2: [5, 3], 3: [6, 3], 4: [5, 5] } });
    const r = run(s0, begin, cast(1, 'razorwire', 5, 1));
    expect(after(r.events, 'damage')).toEqual([{ type: 'damage', id: 2, amount: 24, absorbed: 0, kind: 'phys' }, { type: 'soul', x: 5, z: 3 }]);
  });

  test('Dance walks an enemy 2 steps toward the Doll and stops next to it', () => {
    const scene = (doll: [number, number]) => {
      const s0 = stage({ a: [bare('marionettist', ['dance', 'tangle', 'razorwire'])], b: [bare('bellringer')], place: { 1: [3, 1], 2: [6, 4], 3: doll } });

      return run(s0, begin, cast(1, 'dance', 6, 4));
    };

    expect(scene([6, 0]).events.at(-1)).toEqual({ type: 'move', id: 2, path: [{ x: 6, z: 4 }, { x: 6, z: 3 }, { x: 6, z: 2 }] });
    expect(scene([6, 2]).events.at(-1)).toEqual({ type: 'move', id: 2, path: [{ x: 6, z: 4 }, { x: 6, z: 3 }] });
  });

  test('Tangle roots and nicks every enemy next to the Doll; Splinter breaks the Doll on them', () => {
    const s0 = stage({
      a: [bare('marionettist', ['tangle', 'splinter', 'razorwire'])], b: [bare('bellringer'), bare('bellringer')],
      place: { 1: [5, 1], 2: [6, 5], 3: [9, 9], 4: [5, 5] },
    });

    const live = run(s0, begin).state;
    expect(after(run(live, cast(1, 'tangle', 5, 1)).events, 'damage')).toEqual([
      { type: 'damage', id: 2, amount: 10, absorbed: 0, kind: 'phys' },
      { type: 'status', id: 2, key: 'root' },
    ]);
    const split = run(live, cast(1, 'splinter', 5, 1));
    expect(after(split.events, 'damage')).toEqual([{ type: 'damage', id: 2, amount: 26, absorbed: 0, kind: 'phys' }, { type: 'soul', x: 6, z: 5 }, { type: 'break', id: 4, reform: 3 }]);
  });

  test('Tangled Strings: an enemy that hits the Doll is Rooted, and the Doll takes half', () => {
    const tangled = bare('marionettist', undefined, ['p_doll', 'p_hp', 'p_reform', 'p_tangled']);
    const s0 = stage({ a: [tangled], b: [bare('bellringer')], place: { 1: [0, 0], 2: [5, 4], 3: [5, 3] } });
    const r = run(s0, begin, end(1), cast(2, 'basic_bellringer', 5, 3));
    expect(after(r.events, 'damage')).toEqual([{ type: 'damage', id: 3, amount: 8, absorbed: 0, kind: 'phys' }, { type: 'status', id: 2, key: 'root' }]);
  });

  test('Ventriloquist lets the Marionettist lash from its Doll\'s tile, out of its own reach', () => {
    const scene = (tree: readonly NodeId[]) => {
      const m = bare('marionettist', undefined, tree);

      return run(stage({ a: [m], b: [bare('bellringer')], place: { 1: [5, 1], 2: [5, 7], 3: [5, 5] } }), begin).state;
    };

    expect(castTargets(scene([]), unit(scene([]), 1), 'basic_marionettist')).toEqual([]);
    const live = scene(vent);
    expect(castTargets(live, unit(live, 1), 'basic_marionettist')).toEqual([{ x: 5, z: 7, id: 2 }]);
    expect(run(live, cast(1, 'basic_marionettist', 5, 7)).events[0]).toEqual({ type: 'cast', id: 1, team: 0, skill: 'basic_marionettist', tx: 5, tz: 7, fx: 5, fz: 5, target: 2 });
  });
});
