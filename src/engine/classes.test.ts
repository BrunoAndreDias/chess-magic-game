import { describe, expect, test } from 'vitest';
import { apply } from './battle';
import { idx, reachable } from './board';
import { bare, begin, cast, end, move, ready, run, stage, turns, unit } from './testkit';
import type { BattleEvent, NodeId } from './types';

const after = (events: BattleEvent[], type: BattleEvent['type']) => events.slice(events.findIndex(e => e.type === type));

const lich = ['g_hp', 'g_cap', 'g_ward', 'g_undying'] as const;

describe('souls', () => {
  test('a hit of 20 after shields drops a Soul on the target\'s tile; 19 does not', () => {
    const bolt = (shield: number) => {
      const s0 = stage({ a: [bare('gravecaller')], b: [bare('bellringer')], place: { 1: [5, 1], 2: [5, 4] } });
      unit(s0, 1).souls = 1;
      unit(s0, 2).shield = shield;

      return run(s0, begin, cast(1, 'soulbolt', 5, 4));
    };

    const hard = bolt(0);
    expect(after(hard.events, 'damage')).toEqual([{ type: 'damage', id: 2, amount: 20, absorbed: 0, kind: 'phys' }, { type: 'soul', x: 5, z: 4 }]);
    expect(hard.state.souls).toEqual([{ x: 5, z: 4, t: 3 }]);
    const soft = bolt(1);
    expect(after(soft.events, 'damage')).toEqual([{ type: 'damage', id: 2, amount: 19, absorbed: 1, kind: 'phys' }]);
    expect(soft.state.souls).toEqual([]);
  });

  test('Harvest gathers the Souls within 3 and leaves the one 4 away', () => {
    const s0 = stage({ a: [bare('gravecaller')], b: [bare('bellringer')], place: { 1: [5, 1], 2: [9, 9] } });
    s0.souls = [{ x: 5, z: 5, t: 3 }, { x: 5, z: 4, t: 2 }];
    const r = run(s0, begin, cast(1, 'harvest', 5, 1));
    expect(r.events.at(-1)).toEqual({ type: 'gather', id: 1, from: [{ x: 5, z: 4 }] });
    expect([unit(r.state, 1).souls, r.state.souls]).toEqual([1, [{ x: 5, z: 5, t: 3 }]]);
  });

  test('a Gravecaller gathers a Soul by ending its move on it', () => {
    const s0 = stage({ a: [bare('gravecaller')], b: [bare('bellringer')], place: { 1: [5, 1], 2: [9, 9] } });
    s0.souls = [{ x: 5, z: 3, t: 3 }];
    const r = run(s0, begin, move(1, 5, 3));
    expect(r.events.at(-1)).toEqual({ type: 'gather', id: 1, from: [{ x: 5, z: 3 }] });
    expect([unit(r.state, 1).souls, r.state.souls]).toEqual([1, []]);
  });

  test('Souls on the ground last 3 rounds', () => {
    const s0 = stage({ a: [bare('bellringer')], b: [bare('bellringer')], place: { 1: [5, 1], 2: [9, 9] } });
    s0.souls = [{ x: 3, z: 3, t: 1 }, { x: 4, z: 4, t: 3 }];
    const r = run(s0, begin, end(1), end(2));
    expect(r.state.souls).toEqual([{ x: 4, z: 4, t: 2 }]);
  });
});

describe('rites', () => {
  /** A Gravecaller at (3, 1) holding `souls`, a Downed ally at (5, 1), and enemies at (6, 1) and (9, 1): 3 and 6 tiles east. */
  const ferry = (souls: number, tree: NodeId[] = []) => {
    const s0 = stage({
      a: [bare('gravecaller', undefined, tree), bare('bellringer')], b: [bare('bellringer'), bare('bellringer')],
      place: { 1: [3, 1], 2: [5, 1], 3: [6, 1], 4: [9, 1] }, life: { 2: { kind: 'downed', bleed: 2 } },
    });

    unit(s0, 1).souls = souls;

    return run(ready(s0, 1), begin).state;
  };

  test('The Crossing is refused with no held Soul; with two it spends both, hits the enemy on its line for 24 and stands the Downed ally up at 40%, unpaid', () => {
    expect(apply(ferry(0), cast(1, 'crossing', 4, 1))).toEqual({ ok: false, error: 'crossing is not usable now' });
    const r = run(ferry(2), cast(1, 'crossing', 4, 1));
    expect(r.events.slice(1)).toEqual([
      { type: 'spend', id: 1, n: 2 },
      { type: 'revive', id: 2, by: 1 },
      { type: 'damage', id: 3, amount: 24, absorbed: 0, kind: 'phys' },
      { type: 'soul', x: 6, z: 1 },
    ]);
    expect([unit(r.state, 1).souls, unit(r.state, 1).hp, unit(r.state, 2).hp, unit(r.state, 2).life, unit(r.state, 4).hp]).toEqual([0, 160, 62, { kind: 'up' }, 155]);
  });

  test('Far Shore stretches The Crossing\'s line to 7 tiles', () => {
    const r = run(ferry(1, ['g_line']), cast(1, 'crossing', 4, 1));
    expect(r.events.filter(e => e.type === 'damage')).toEqual([
      { type: 'damage', id: 3, amount: 12, absorbed: 0, kind: 'phys' },
      { type: 'damage', id: 4, amount: 12, absorbed: 0, kind: 'phys' },
    ]);
  });

  test('Bone Wall needs no Soul: it raises 3 tiles across the caster\'s line, skipping the tile with a unit, and nobody walks through it', () => {
    const s0 = stage({ a: [bare('gravecaller', ['bonewall', 'soulbolt'])], b: [bare('bellringer')], place: { 1: [5, 1], 2: [6, 6] } });
    const live = run(s0, begin).state;
    unit(live, 2).x = 6; unit(live, 2).z = 3;
    const r = run(live, cast(1, 'bonewall', 5, 3));
    expect(r.events.at(-1)).toEqual({ type: 'terrain', tiles: [{ x: 5, z: 3 }, { x: 4, z: 3 }], kind: 'bone' });
    const walker = unit(r.state, 1);
    walker.moved = false;
    expect([reachable(r.state, walker).has(idx(5, 3)), reachable(r.state, walker).has(idx(5, 2))]).toEqual([false, true]);
  });
});

describe('reap', () => {
  const reap = (hp: number) => {
    const s0 = stage({
      a: [bare('gravecaller', ['wither', 'soulbolt', 'siphon']), bare('bellringer')], b: [bare('astromancer')],
      place: { 1: [3, 1], 2: [5, 2], 3: [5, 3] }, hp: { 3: hp },
    });

    unit(s0, 1).souls = 1;
    unit(s0, 3).maxHp = 100;

    return run(s0, begin, cast(1, 'wither', 5, 3), end(1), end(3), cast(2, 'basic_bellringer', 5, 3));
  };

  test('a hit that leaves a Withered enemy at 20% HP Downs it (REAP); at 21% it stands', () => {
    expect(after(reap(35).events, 'damage')).toEqual([
      { type: 'damage', id: 3, amount: 15, absorbed: 0, kind: 'phys' },
      { type: 'combo', name: 'REAP', id: 3, by: 2, team: 0, setup: 1 },
      { type: 'downed', id: 3, team: 1 },
      { type: 'soul', x: 5, z: 3 },
      { type: 'over', winner: 0, reason: 'wipe' },
    ]);
    const spared = reap(36);
    expect(after(spared.events, 'damage')).toEqual([{ type: 'damage', id: 3, amount: 15, absorbed: 0, kind: 'phys' }]);
    expect([unit(spared.state, 3).hp, unit(spared.state, 3).life]).toEqual([21, { kind: 'up' }]);
  });

  test('a Withered unit ending its turn on a shrine heals nothing; unwithered it heals 12', () => {
    const shrine = (wither: boolean) => {
      const s0 = stage({ a: [bare('gravecaller', ['wither', 'soulbolt', 'siphon'])], b: [bare('astromancer')], place: { 1: [3, 1], 2: [3, 3] }, hp: { 2: 50 }, terr: [[3, 3, '+']] });
      unit(s0, 1).souls = 1;
      const live = run(s0, begin).state;

      return run(wither ? run(live, cast(1, 'wither', 3, 3)).state : live, end(1), end(2)).state;
    };

    expect([unit(shrine(true), 2).hp, unit(shrine(false), 2).hp]).toEqual([50, 62]);
  });
});

describe('undying', () => {
  const downedLich = (souls: number) => {
    const s0 = stage({ a: [bare('gravecaller', undefined, [...lich])], b: [bare('bellringer')], place: { 1: [5, 1], 2: [9, 9] }, life: { 1: { kind: 'downed', bleed: 2 } } });
    unit(s0, 1).souls = souls;

    return run(s0, begin);
  };

  test('a Downed Undying Gravecaller spends a Soul instead of bleeding, and still takes its turn: move 1, no basic', () => {
    const r = downedLich(2);
    expect(r.events.slice(1)).toEqual([{ type: 'activate', id: 1, team: 0, qi: 0 }, { type: 'spend', id: 1, n: 1 }]);
    expect([unit(r.state, 1).souls, unit(r.state, 1).life]).toEqual([1, { kind: 'downed', bleed: 2 }]);
    expect(apply(r.state, move(1, 5, 3))).toEqual({ ok: false, error: '(5, 3) is not reachable' });
    expect(apply(r.state, move(1, 5, 2)).ok).toBe(true);
  });

  test('with no Soul left it bleeds as normal, and still takes its turn', () => {
    const r = downedLich(0);
    expect(r.events.slice(1)).toEqual([{ type: 'activate', id: 1, team: 0, qi: 0 }, { type: 'bleed', id: 1, left: 1 }]);
    expect(r.state.phase).toEqual(expect.objectContaining({ kind: 'act', qi: 0 }));
  });
});

describe('psychopomp', () => {
  test('Ferryman: a Downed ally within 3 doesn\'t bleed, and Help Up brings it back at 70%', () => {
    const ferryman = bare('gravecaller', undefined, ['g_line', 'g_hp2', 'g_shield', 'g_ferry']);
    const s0 = stage({ a: [bare('bellringer'), bare('bellringer'), ferryman], b: [bare('bellringer')], place: { 1: [5, 1], 2: [6, 1], 3: [3, 1], 4: [9, 9] }, life: { 1: { kind: 'downed', bleed: 2 } } });
    const r = run(s0, begin);
    expect(r.events.slice(1, 3)).toEqual([{ type: 'activate', id: 1, team: 0, qi: 0 }, { type: 'activate', id: 4, team: 1, qi: 1 }]);
    const up = run(r.state, end(4), cast(2, 'helpup', 5, 1));
    expect(up.events.slice(-2)).toEqual([{ type: 'damage', id: 2, amount: 109, absorbed: 0, kind: 'drain' }, { type: 'revive', id: 1, by: 2 }]);
    expect([unit(up.state, 1).hp, unit(up.state, 2).hp]).toEqual([109, 46]);
  });
});

describe('toll', () => {
  const bells = () => {
    const s0 = stage({
      a: [bare('bellringer'), bare('bellringer'), bare('astromancer')], b: [bare('bellringer'), bare('bellringer'), bare('astromancer')],
      place: { 1: [5, 2], 2: [4, 2], 3: [6, 2], 4: [5, 5], 5: [6, 5], 6: [9, 9] },
    });

    return run(s0, begin).state;
  };

  test('Toll sends an enemy to the end of the round and an ally to right after the caster', () => {
    const live = bells();
    const foe = run(live, cast(1, 'toll', 5, 5));
    expect(foe.events.at(-1)).toEqual({ type: 'queue', queue: turns(1, 2, 5, 6, 3, 4) });
    const ally = run(live, cast(1, 'toll', 6, 2));
    expect(ally.state.phase).toEqual({ kind: 'act', queue: turns(1, 3, 4, 2, 5, 6), qi: 0, tolled: [3] });
  });

  test('a unit Tolled once this round can\'t be Tolled again', () => {
    const second = run(bells(), cast(1, 'toll', 5, 5), end(1)).state;
    expect(apply(second, cast(2, 'toll', 5, 5))).toEqual({ ok: false, error: '(5, 5) is not a target of toll' });
    expect(run(second, cast(2, 'toll', 6, 5)).events.at(-1)).toEqual({ type: 'queue', queue: turns(1, 2, 6, 3, 4, 5) });
  });

  test('Final Hour: the Herald Tolls itself to the end, and its last-in-round Clapper hits for +50% and +20%', () => {
    const herald = bare('bellringer', undefined, ['b_knell', 'b_last', 'b_peal', 'b_final']);
    const s0 = stage({ a: [herald], b: [bare('bellringer')], place: { 1: [5, 1], 2: [5, 2] } });
    const r = run(s0, begin, cast(1, 'toll', 5, 1));
    expect(r.events.slice(-2)).toEqual([{ type: 'queue', queue: turns(2, '+', 1) }, { type: 'activate', id: 2, team: 1, qi: 0 }]);
    const last = run(r.state, end(2), cast(1, 'basic_bellringer', 5, 2));
    expect(after(last.events, 'damage')[0]).toEqual({ type: 'damage', id: 2, amount: 27, absorbed: 0, kind: 'phys' });
  });
});

describe('bellringer skills', () => {
  test('Encore gives an ally that already acted an extra turn at the end of the round, and its cooldowns don\'t tick on it', () => {
    const s0 = stage({ a: [bare('bellringer', ['peal', 'hush']), bare('bellringer')], b: [bare('bellringer')], place: { 1: [3, 1], 2: [4, 1], 3: [9, 9] } });
    const r = run(ready(s0, 2), begin, cast(1, 'peal', 3, 1), end(1), end(3), cast(2, 'encore', 3, 1));
    expect(r.events.at(-1)).toEqual({ type: 'queue', queue: turns(1, 3, 2, '+', 1) });
    const extra = run(r.state, end(2));
    expect(extra.events.at(-1)).toEqual({ type: 'activate', id: 1, team: 0, qi: 3 });
    expect(unit(extra.state, 1).cd.peal).toBe(2);
    const own = run(extra.state, end(1));
    expect(unit(own.state, 1).cd.peal).toBe(1);
  });

  test('a Hushed enemy can use its basic attack but no skill on its next turn, and is free again after', () => {
    const s0 = stage({ a: [bare('bellringer')], b: [bare('astromancer')], place: { 1: [5, 1], 2: [5, 3] } });
    const hushed = run(s0, begin, cast(1, 'hush', 5, 3), end(1)).state;
    expect(apply(hushed, cast(2, 'frostbolt', 5, 1))).toEqual({ ok: false, error: 'frostbolt is not usable now' });
    expect(apply(hushed, cast(2, 'basic_astromancer', 5, 1)).ok).toBe(true);
    const next = run(hushed, end(2), end(1)).state;
    expect(apply(next, cast(2, 'frostbolt', 5, 1)).ok).toBe(true);
  });

  test('Knell on a unit that already acted this round hits ×1.5 and Roots; on one still to act it hits 12', () => {
    const s0 = stage({ a: [bare('bellringer')], b: [bare('bellringer'), bare('bellringer')], starter: 1, place: { 1: [5, 1], 2: [5, 4], 3: [6, 4] } });
    const live = run(s0, begin, end(2)).state;
    expect(after(run(live, cast(1, 'knell', 5, 4)).events, 'damage')).toEqual([
      { type: 'damage', id: 2, amount: 18, absorbed: 0, kind: 'phys' },
      { type: 'status', id: 2, key: 'root' },
    ]);
    expect(after(run(live, cast(1, 'knell', 6, 4)).events, 'damage')).toEqual([{ type: 'damage', id: 3, amount: 12, absorbed: 0, kind: 'phys' }]);
  });

  test('Encore also takes an ally still to act this round: it acts in its own turn and again at the end', () => {
    const s0 = stage({ a: [bare('bellringer'), bare('bellringer')], b: [bare('bellringer')], place: { 1: [3, 1], 2: [4, 1], 3: [9, 9] } });
    expect(run(ready(s0, 1), begin, cast(1, 'encore', 4, 1)).events.at(-1)).toEqual({ type: 'queue', queue: turns(1, 3, 2, '+', 2) });
  });

  test('Swift Encore brings Encore back a turn sooner', () => {
    const encore = (tree: NodeId[]) => {
      const s0 = stage({ a: [bare('bellringer'), bare('bellringer', undefined, tree)], b: [bare('bellringer')], place: { 1: [3, 1], 2: [4, 1], 3: [9, 9] } });

      return unit(run(ready(s0, 2), begin, end(1), end(3), cast(2, 'encore', 3, 1)).state, 2).cd.encore;
    };

    expect([encore([]), encore(['b_reach', 'b_encore'])]).toEqual([5, 4]);
  });

  test('Bell Guard shields an ally next to the Bellringer: an enemy that hits it is Hushed, until the Bellringer\'s next turn', () => {
    const s0 = stage({ a: [bare('bellringer', ['bellguard', 'hush']), bare('bellringer')], b: [bare('bellringer')], place: { 1: [5, 1], 2: [6, 1], 3: [6, 2] } });
    const r = run(s0, begin, cast(1, 'bellguard', 6, 1), end(1), cast(3, 'basic_bellringer', 6, 1));
    expect(after(r.events, 'damage')).toEqual([{ type: 'damage', id: 2, amount: 0, absorbed: 15, kind: 'phys' }, { type: 'status', id: 3, key: 'hush' }]);
    expect([unit(r.state, 3).st.hush, unit(r.state, 2).st.guard]).toEqual([{ t: 2, by: 1 }, { t: 1, by: 1 }]);
    expect(unit(run(r.state, end(3), end(2)).state, 2).st.guard).toBe(undefined);
  });
});

describe('resonances', () => {
  test('Death Knell: a Downed enemy of a Gravecaller and Bellringer party loses 2 bleed a turn and is gone after one', () => {
    const bleedOut = (a: ReturnType<typeof bare>[]) => {
      const s0 = stage({ a, b: [bare('bellringer'), bare('bellringer')], place: { 1: [0, 0], 2: [1, 0], 3: [5, 9], 4: [9, 9] }, life: { 3: { kind: 'downed', bleed: 2 } } });

      return run(run(s0, begin).state, end(1)).events.slice(1, 2);
    };

    expect(bleedOut([bare('gravecaller'), bare('bellringer')])).toEqual([{ type: 'death', id: 3, team: 1, cause: 'bled' }]);
    expect(bleedOut([bare('gravecaller'), bare('astromancer')])).toEqual([{ type: 'bleed', id: 3, left: 1 }]);
  });
});
