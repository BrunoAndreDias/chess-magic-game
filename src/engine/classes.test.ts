import { describe, expect, test } from 'vitest';
import { apply } from './battle';
import { idx, reachable } from './board';
import { bare, begin, cast, end, move, run, stage, turns, unit } from './testkit';
import type { BattleEvent } from './types';

const after = (events: BattleEvent[], type: BattleEvent['type']) => events.slice(events.findIndex(e => e.type === type));

const lich = ['g_hp', 'g_cap', 'g_ward', 'g_undying'] as const;

describe('souls', () => {
  test('a hit of 20 after shields drops a Soul on the target\'s tile; 19 does not', () => {
    const bolt = (shield: number) => {
      const s0 = stage({ a: [bare('gravecaller')], b: [bare('weaver')], place: { 1: [5, 1], 2: [5, 4] } });
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
    const s0 = stage({ a: [bare('gravecaller')], b: [bare('weaver')], place: { 1: [5, 1], 2: [9, 9] } });
    s0.souls = [{ x: 5, z: 5, t: 3 }, { x: 5, z: 4, t: 2 }];
    const r = run(s0, begin, cast(1, 'harvest', 5, 1));
    expect(r.events.at(-1)).toEqual({ type: 'gather', id: 1, from: [{ x: 5, z: 4 }] });
    expect([unit(r.state, 1).souls, r.state.souls]).toEqual([1, [{ x: 5, z: 5, t: 3 }]]);
  });

  test('a Gravecaller gathers a Soul by ending its move on it', () => {
    const s0 = stage({ a: [bare('gravecaller')], b: [bare('weaver')], place: { 1: [5, 1], 2: [9, 9] } });
    s0.souls = [{ x: 5, z: 3, t: 3 }];
    const r = run(s0, begin, move(1, 5, 3));
    expect(r.events.at(-1)).toEqual({ type: 'gather', id: 1, from: [{ x: 5, z: 3 }] });
    expect([unit(r.state, 1).souls, r.state.souls]).toEqual([1, []]);
  });

  test('Souls on the ground last 3 rounds', () => {
    const s0 = stage({ a: [bare('weaver')], b: [bare('weaver')], place: { 1: [5, 1], 2: [9, 9] } });
    s0.souls = [{ x: 3, z: 3, t: 1 }, { x: 4, z: 4, t: 3 }];
    const r = run(s0, begin, end(1), end(2));
    expect(r.state.souls).toEqual([{ x: 4, z: 4, t: 2 }]);
  });
});

describe('rites', () => {
  test('a Rite is refused with no held Soul; with one, Last Rites spends it and stands the ally up at 40%', () => {
    const scene = (souls: number) => {
      const s0 = stage({ a: [bare('gravecaller'), bare('weaver')], b: [bare('weaver')], place: { 1: [3, 1], 2: [5, 1], 3: [9, 9] }, life: { 2: { kind: 'downed', bleed: 2 } } });
      unit(s0, 1).souls = souls;

      return run(s0, begin).state;
    };

    expect(apply(scene(0), cast(1, 'lastrites', 5, 1))).toEqual({ ok: false, error: 'lastrites is not usable now' });
    const r = run(scene(1), cast(1, 'lastrites', 5, 1));
    expect(r.events.slice(1)).toEqual([{ type: 'spend', id: 1 }, { type: 'damage', id: 1, amount: 68, absorbed: 0, kind: 'drain' }, { type: 'revive', id: 2, by: 1 }]);
    expect([unit(r.state, 1).souls, unit(r.state, 1).hp, unit(r.state, 2).hp, unit(r.state, 2).life]).toEqual([0, 92, 68, { kind: 'up' }]);
  });

  test('Bone Wall raises 3 tiles across the caster\'s line, skipping the tile with a unit, and nobody walks through it', () => {
    const s0 = stage({ a: [bare('gravecaller', ['bonewall', 'soulbolt', 'siphon'])], b: [bare('weaver')], place: { 1: [5, 1], 2: [6, 6] } });
    unit(s0, 1).souls = 1;
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
      a: [bare('gravecaller', ['wither', 'soulbolt', 'siphon']), bare('weaver')], b: [bare('astromancer')],
      place: { 1: [3, 1], 2: [5, 2], 3: [5, 3] }, hp: { 3: hp },
    });

    unit(s0, 1).souls = 1;
    unit(s0, 3).maxHp = 100;

    return run(s0, begin, cast(1, 'wither', 5, 3), end(1), end(3), cast(2, 'basic_weaver', 5, 3));
  };

  test('a hit that leaves a Withered enemy at 20% HP Downs it (REAP); at 21% it stands', () => {
    expect(after(reap(34).events, 'damage')).toEqual([
      { type: 'damage', id: 3, amount: 14, absorbed: 0, kind: 'phys' },
      { type: 'combo', name: 'REAP', id: 3, by: 2, team: 0, setup: 1 },
      { type: 'downed', id: 3, team: 1 },
      { type: 'soul', x: 5, z: 3 },
      { type: 'over', winner: 0, reason: 'wipe' },
    ]);
    const spared = reap(35);
    expect(after(spared.events, 'damage')).toEqual([{ type: 'damage', id: 3, amount: 14, absorbed: 0, kind: 'phys' }]);
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
    const s0 = stage({ a: [bare('gravecaller', undefined, [...lich])], b: [bare('weaver')], place: { 1: [5, 1], 2: [9, 9] }, life: { 1: { kind: 'downed', bleed: 2 } } });
    unit(s0, 1).souls = souls;

    return run(s0, begin);
  };

  test('a Downed Undying Gravecaller spends a Soul instead of bleeding, and still takes its turn: move 1, no basic', () => {
    const r = downedLich(2);
    expect(r.events.slice(1)).toEqual([{ type: 'activate', id: 1, team: 0, qi: 0 }, { type: 'spend', id: 1 }]);
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
  test('Ferryman: a Downed ally within 2 doesn\'t bleed, and Help Up brings it back at 60%', () => {
    const ferry = bare('gravecaller', undefined, ['g_rites', 'g_hp2', 'g_shield', 'g_ferry']);
    const s0 = stage({ a: [bare('weaver'), bare('weaver'), ferry], b: [bare('weaver')], place: { 1: [5, 1], 2: [6, 1], 3: [3, 1], 4: [9, 9] }, life: { 1: { kind: 'downed', bleed: 2 } } });
    const r = run(s0, begin);
    expect(r.events.slice(1, 3)).toEqual([{ type: 'activate', id: 1, team: 0, qi: 0 }, { type: 'activate', id: 4, team: 1, qi: 1 }]);
    const up = run(r.state, end(4), cast(2, 'helpup', 5, 1));
    expect(up.events.slice(-2)).toEqual([{ type: 'damage', id: 2, amount: 102, absorbed: 0, kind: 'drain' }, { type: 'revive', id: 1, by: 2 }]);
    expect([unit(up.state, 1).hp, unit(up.state, 2).hp]).toEqual([102, 68]);
  });
});

describe('toll', () => {
  const bells = () => {
    const s0 = stage({
      a: [bare('bellringer'), bare('bellringer'), bare('astromancer')], b: [bare('weaver'), bare('weaver'), bare('astromancer')],
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
    const s0 = stage({ a: [herald], b: [bare('weaver')], place: { 1: [5, 1], 2: [5, 2] } });
    const r = run(s0, begin, cast(1, 'toll', 5, 1));
    expect(r.events.slice(-2)).toEqual([{ type: 'queue', queue: turns(2, '+', 1) }, { type: 'activate', id: 2, team: 1, qi: 0 }]);
    const last = run(r.state, end(2), cast(1, 'basic_bellringer', 5, 2));
    expect(after(last.events, 'damage')[0]).toEqual({ type: 'damage', id: 2, amount: 27, absorbed: 0, kind: 'phys' });
  });
});

describe('bellringer skills', () => {
  test('Encore gives an ally that already acted an extra turn at the end of the round, and its cooldowns don\'t tick on it', () => {
    const s0 = stage({ a: [bare('weaver'), bare('bellringer', ['encore', 'hush', 'peal'])], b: [bare('weaver')], place: { 1: [3, 1], 2: [4, 1], 3: [9, 9] } });
    const r = run(s0, begin, cast(1, 'web', 3, 4), end(1), end(3), cast(2, 'encore', 3, 1));
    expect(r.events.at(-1)).toEqual({ type: 'queue', queue: turns(1, 3, 2, '+', 1) });
    const extra = run(r.state, end(2));
    expect(extra.events.at(-1)).toEqual({ type: 'activate', id: 1, team: 0, qi: 3 });
    expect(unit(extra.state, 1).cd.web).toBe(3);
    const own = run(extra.state, end(1));
    expect(unit(own.state, 1).cd.web).toBe(2);
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
    const s0 = stage({ a: [bare('bellringer')], b: [bare('weaver'), bare('weaver')], starter: 1, place: { 1: [5, 1], 2: [5, 4], 3: [6, 4] } });
    const live = run(s0, begin, end(2)).state;
    expect(after(run(live, cast(1, 'knell', 5, 4)).events, 'damage')).toEqual([
      { type: 'damage', id: 2, amount: 18, absorbed: 0, kind: 'phys' },
      { type: 'status', id: 2, key: 'root' },
    ]);
    expect(after(run(live, cast(1, 'knell', 6, 4)).events, 'damage')).toEqual([{ type: 'damage', id: 3, amount: 12, absorbed: 0, kind: 'phys' }]);
  });

  test('an enemy that hits a Bell Guard is Hushed', () => {
    const s0 = stage({ a: [bare('bellringer', ['bellguard', 'hush', 'peal'])], b: [bare('weaver')], place: { 1: [5, 1], 2: [5, 2] } });
    const r = run(s0, begin, cast(1, 'bellguard', 5, 1), end(1), cast(2, 'basic_weaver', 5, 1));
    expect(after(r.events, 'damage')).toEqual([{ type: 'damage', id: 1, amount: 0, absorbed: 14, kind: 'phys' }, { type: 'status', id: 2, key: 'hush' }]);
    expect(unit(r.state, 2).st.hush).toEqual({ t: 2, by: 1 });
  });
});

describe('resonances', () => {
  test('Death Knell: a Downed enemy of a Gravecaller and Bellringer party loses 2 bleed a turn and is gone after one', () => {
    const bleedOut = (a: ReturnType<typeof bare>[]) => {
      const s0 = stage({ a, b: [bare('weaver'), bare('weaver')], place: { 1: [0, 0], 2: [1, 0], 3: [5, 9], 4: [9, 9] }, life: { 3: { kind: 'downed', bleed: 2 } } });

      return run(run(s0, begin).state, end(1)).events.slice(1, 2);
    };

    expect(bleedOut([bare('gravecaller'), bare('bellringer')])).toEqual([{ type: 'death', id: 3, team: 1, cause: 'bled' }]);
    expect(bleedOut([bare('gravecaller'), bare('weaver')])).toEqual([{ type: 'bleed', id: 3, left: 1 }]);
  });

  test('Clockwork Silk: Toll reaches an enemy the party\'s Weaver holds, however far', () => {
    const scene = (tether: boolean) => {
      const s0 = stage({
        a: [bare('weaver'), bare('bellringer'), bare('astromancer')], b: [bare('astromancer'), bare('astromancer'), bare('astromancer')],
        place: { 1: [4, 1], 2: [0, 0], 3: [1, 1], 4: [11, 11], 5: [8, 4], 6: [10, 10] },
      });

      const live = run(s0, begin).state;

      return run(tether ? run(live, cast(1, 'tether', 8, 4)).state : live, end(1), end(4)).state;
    };

    expect(apply(scene(false), cast(2, 'toll', 8, 4))).toEqual({ ok: false, error: '(8, 4) is not a target of toll' });
    expect(run(scene(true), cast(2, 'toll', 8, 4)).events.at(-1)).toEqual({ type: 'queue', queue: turns(1, 4, 2, 6, 3, 5) });
  });
});
