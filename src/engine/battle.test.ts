import { describe, expect, test } from 'vitest';
import { apply, createBattle } from './battle';
import { partyBonuses, roleOf } from './builds';
import { COVERAGE, ultIn } from './index';
import { mulberry32 } from './rng';
import { bare, begin, cast, end, move, ready, run, stage, turns, unit } from './testkit';
import type { BattleEvent, MemberBuild } from './types';

const trio = () => [bare('astromancer'), bare('bellringer'), bare('bellringer')];

const after = (events: BattleEvent[], type: BattleEvent['type']) => events.slice(events.findIndex(e => e.type === type));

describe('turn order', () => {
  test('the starter opens and closes every round, in slot order', () => {
    const s0 = stage({ a: trio(), b: trio(), starter: 1 });
    const r1 = run(s0, begin);
    expect(r1.events[0]).toEqual({ type: 'round', round: 1, starter: 1, queue: turns(4, 1, 5, 2, 3, 6) });
    expect(r1.state.phase).toEqual({ kind: 'act', queue: turns(4, 1, 5, 2, 3, 6), qi: 0, tolled: [] });

    const r2 = run(r1.state, end(4), end(1), end(5), end(2), end(3), end(6));
    expect(after(r2.events, 'roundEnd').slice(0, 3)).toEqual([
      { type: 'roundEnd', round: 1, burnt: [] },
      { type: 'round', round: 2, starter: 1, queue: turns(4, 1, 5, 2, 3, 6) },
      { type: 'activate', id: 4, team: 1, qi: 0 },
    ]);
  });

  test('a dead unit drops out of the next round\'s queue', () => {
    const s0 = stage({ a: trio(), b: trio(), life: { 5: { kind: 'dead' } } });
    const r = run(s0, begin, end(1), end(4), end(2), end(6), end(3));
    expect(r.events.filter(e => e.type === 'round')).toEqual([
      { type: 'round', round: 1, starter: 0, queue: turns(1, 4, 2, 6, 3) },
      { type: 'round', round: 2, starter: 0, queue: turns(1, 4, 2, 6, 3) },
    ]);
  });

  test('begin opens round 1 once', () => {
    const s0 = stage({ a: trio(), b: trio() });
    expect(apply(s0, end(1))).toEqual({ ok: false, error: 'not the act phase (ready)' });
    const live = run(s0, begin).state;
    expect(apply(live, begin)).toEqual({ ok: false, error: 'not the ready phase (act)' });
  });
});

describe('life', () => {
  test('a Downed character bleeds out after two of its own turns', () => {
    const s0 = stage({ a: [bare('bellringer'), bare('bellringer')], b: [bare('astromancer'), bare('bellringer')], place: { 1: [5, 2], 3: [5, 1] }, hp: { 3: 10 } });
    const hit = run(s0, begin, cast(1, 'basic_bellringer', 5, 1));
    expect(hit.events).toContainEqual({ type: 'downed', id: 3, team: 1 });
    expect(unit(hit.state, 3).life).toEqual({ kind: 'downed', bleed: 2 });

    const firstTurn = run(hit.state, end(1));
    expect(firstTurn.events.slice(0, 2)).toEqual([{ type: 'activate', id: 3, team: 1, qi: 1 }, { type: 'bleed', id: 3, left: 1 }]);

    const round2 = run(firstTurn.state, end(4), end(2), end(1));
    expect(round2.events.slice(-3)).toEqual([
      { type: 'activate', id: 3, team: 1, qi: 1 },
      { type: 'death', id: 3, team: 1, cause: 'bled' },
      { type: 'activate', id: 4, team: 1, qi: 2 },
    ]);
  });

  test('Help Up revives at 30% of max HP', () => {
    const s0 = stage({ a: [bare('astromancer'), bare('bellringer')], b: [bare('astromancer')], life: { 2: { kind: 'downed', bleed: 2 } } });
    const r = run(s0, begin, cast(1, 'helpup', 1, 0));
    expect(r.events.slice(-2)).toEqual([{ type: 'damage', id: 1, amount: 47, absorbed: 0, kind: 'drain' }, { type: 'revive', id: 2, by: 1 }]);
    expect([unit(r.state, 2).hp, unit(r.state, 2).maxHp, unit(r.state, 2).life, unit(r.state, 1).hp]).toEqual([47, 155, { kind: 'up' }, 108]);
  });

  test('Help Up gives only what the caster can spare: at 20 HP the ally stands at 19 and the caster at 1', () => {
    const s0 = stage({ a: [bare('astromancer'), bare('bellringer')], b: [bare('astromancer')], hp: { 1: 20 }, life: { 2: { kind: 'downed', bleed: 2 } } });
    const r = run(s0, begin, cast(1, 'helpup', 1, 0));
    expect(r.events.slice(-2)).toEqual([{ type: 'damage', id: 1, amount: 19, absorbed: 0, kind: 'drain' }, { type: 'revive', id: 2, by: 1 }]);
    expect([unit(r.state, 1).hp, unit(r.state, 2).hp]).toEqual([1, 19]);
  });

  test('Help Up is refused when the caster is at 1 HP and works at 2', () => {
    const scene = (hp: number) => run(stage({ a: [bare('astromancer'), bare('bellringer')], b: [bare('astromancer')], hp: { 1: hp }, life: { 2: { kind: 'downed', bleed: 2 } } }), begin).state;
    expect(apply(scene(1), cast(1, 'helpup', 1, 0))).toEqual({ ok: false, error: 'helpup is not usable now' });
    const r = run(scene(2), cast(1, 'helpup', 1, 0));
    expect([unit(r.state, 1).hp, unit(r.state, 2).hp, unit(r.state, 2).life]).toEqual([1, 1, { kind: 'up' }]);
  });
});

describe('calls', () => {
  const sky = () => stage({
    a: [bare('astromancer'), bare('bellringer')], b: [bare('bellringer')],
    place: { 1: [4, 0], 2: [7, 2], 3: [6, 2] },
  });

  test('a Call marks its area now and lands at the start of the caster\'s next activation, hitting allies too', () => {
    const called = run(sky(), begin, cast(1, 'thunderhead', 6, 2));
    expect(called.events.at(-1)).toEqual({
      type: 'call', id: 1, team: 0, skill: 'thunderhead',
      tiles: [{ x: 5, z: 1 }, { x: 6, z: 1 }, { x: 7, z: 1 }, { x: 5, z: 2 }, { x: 6, z: 2 }, { x: 7, z: 2 }, { x: 5, z: 3 }, { x: 6, z: 3 }, { x: 7, z: 3 }],
    });
    expect(called.state.calls).toEqual([{ by: 1, team: 0, skill: 'thunderhead', x: 6, z: 2, recall: null }]);

    const landed = run(called.state, end(1), end(3), end(2));
    expect(after(landed.events, 'activate').slice(-6)).toEqual([
      { type: 'activate', id: 1, team: 0, qi: 0 },
      expect.objectContaining({ type: 'land', id: 1, skill: 'thunderhead', x: 6, z: 2, power: 1 }),
      { type: 'damage', id: 3, amount: 20, absorbed: 0, kind: 'shock' },
      { type: 'soul', x: 6, z: 2 },
      { type: 'damage', id: 2, amount: 20, absorbed: 0, kind: 'shock' },
      { type: 'soul', x: 7, z: 2 },
    ]);
    expect([unit(landed.state, 3).hp, unit(landed.state, 2).hp, landed.state.calls]).toEqual([135, 135, []]);
  });

  test('a Call fizzles when its caster is Downed before it lands', () => {
    const s0 = stage({ a: [bare('astromancer')], b: [bare('bellringer')], place: { 1: [4, 0], 2: [4, 1] }, hp: { 1: 10 } });
    const called = run(s0, begin, cast(1, 'thunderhead', 6, 2), end(1)).state;
    const r = run(called, cast(2, 'basic_bellringer', 4, 0));
    expect(r.events.slice(1)).toEqual([
      { type: 'damage', id: 1, amount: 15, absorbed: 0, kind: 'phys' },
      { type: 'downed', id: 1, team: 0 },
      { type: 'soul', x: 4, z: 0 },
      { type: 'fizzle', id: 1 },
      { type: 'over', winner: 1, reason: 'wipe' },
    ]);
    expect(r.state.calls).toEqual([]);
  });

  test('Falling Star lands 40 at its center and 20 around, and sets Burning', () => {
    const landed = run(ready(sky(), 1), begin, cast(1, 'fallingstar', 6, 2), end(1), end(3), end(2));
    expect(after(landed.events, 'land').slice(1)).toEqual([
      { type: 'damage', id: 3, amount: 40, absorbed: 0, kind: 'fire' },
      { type: 'soul', x: 6, z: 2 },
      { type: 'status', id: 3, key: 'burn' },
      { type: 'damage', id: 2, amount: 20, absorbed: 0, kind: 'fire' },
      { type: 'soul', x: 7, z: 2 },
      { type: 'status', id: 2, key: 'burn' },
    ]);
  });

  test('casting a Falling Star pulls the enemies within 1 of its area a tile toward the center, not allies; into a wall it SLAMs for 6 and stuns', () => {
    const scene = (terr: [number, number, '#'][]) => {
      const s0 = stage({ a: [bare('astromancer'), bare('bellringer')], b: [bare('bellringer')], place: { 1: [2, 0], 2: [4, 2], 3: [6, 4] }, terr });

      return run(ready(s0, 1), begin, cast(1, 'fallingstar', 6, 2));
    };

    const open = scene([]);
    expect(after(open.events, 'call').slice(1)).toEqual([{ type: 'move', id: 3, path: [{ x: 6, z: 4 }, { x: 6, z: 3 }], slide: true }]);
    expect([unit(open.state, 2).x, unit(open.state, 2).z]).toEqual([4, 2]);
    expect(after(scene([[6, 3, '#']]).events, 'call').slice(1)).toEqual([
      { type: 'move', id: 3, path: [{ x: 6, z: 4 }], slide: true },
      { type: 'combo', name: 'SLAM', id: 3, by: 1, team: 0, setup: null },
      { type: 'damage', id: 3, amount: 6, absorbed: 0, kind: 'slam' },
      { type: 'status', id: 3, key: 'stun' },
    ]);
  });

  test('with Benevolent Heavens a Falling Star heals an ally on burning grass and doesn\'t set it Burning', () => {
    const orrery = bare('astromancer', undefined, ['a_recall', 'a_hp', 'a_cleanse', 'a_benev']);
    const s0 = stage({ a: [orrery, bare('bellringer')], b: [bare('bellringer')], place: { 1: [4, 0], 2: [6, 2], 3: [7, 2] }, hp: { 2: 100 }, terr: [[6, 2, 'G'], [7, 2, 'G']] });
    const r = run(ready(s0, 1), begin, cast(1, 'fallingstar', 6, 2), end(1), end(3), end(2));
    expect(r.events).toContainEqual({ type: 'heal', id: 2, amount: 10 });
    expect([unit(r.state, 2).hp, unit(r.state, 2).st]).toEqual([110, {}]);
    expect(unit(r.state, 3).st.burn).toEqual({ t: 2, dmg: 6, by: 1 });
  });

  test('Snap lands the pending Call at once, at half power', () => {
    const r = run(run(sky(), begin).state, cast(1, 'thunderhead', 6, 2), cast(1, 'snap', 4, 0));
    expect(r.events.slice(3)).toEqual([
      expect.objectContaining({ type: 'land', id: 1, skill: 'thunderhead', x: 6, z: 2, power: 0.5 }),
      { type: 'damage', id: 3, amount: 10, absorbed: 0, kind: 'shock' },
      { type: 'damage', id: 2, amount: 10, absorbed: 0, kind: 'shock' },
    ]);
    expect(r.state.calls).toEqual([]);
  });

  test('Absolute Zero: a unit Rooted when the Call lands is Stunned by it, one not Rooted only gets Wet', () => {
    const rime = bare('astromancer', ['thunderhead', 'frostbolt'], ['a_frost', 'a_reach', 'a_wet', 'a_zero']);

    const s0 = stage({
      a: [rime, bare('astromancer')], b: [bare('bellringer'), bare('bellringer')],
      place: { 1: [2, 2], 2: [3, 2], 3: [3, 5], 4: [4, 6] },
    });

    const r = run(s0, begin, cast(1, 'thunderhead', 3, 5), end(1), end(3), end(4), cast(2, 'frostbolt', 3, 5), end(2));
    expect(after(r.events, 'land').slice(1)).toEqual([
      { type: 'damage', id: 3, amount: 20, absorbed: 0, kind: 'shock' },
      { type: 'soul', x: 3, z: 5 },
      { type: 'damage', id: 4, amount: 20, absorbed: 0, kind: 'shock' },
      { type: 'soul', x: 4, z: 6 },
      { type: 'status', id: 3, key: 'stun' },
      { type: 'status', id: 3, key: 'wet' },
      { type: 'status', id: 4, key: 'wet' },
    ]);
  });
});

describe('ultimate', () => {
  test('the ultimate is ready on the unit\'s 4th own turn, and back 5 of its turns after it\'s cast', () => {
    let s = run(stage({ a: [bare('astromancer')], b: [bare('bellringer')], place: { 1: [2, 0], 2: [9, 11] } }), begin).state;
    const timer: number[] = [];
    const turn = () => { s = run(s, end(1), end(2)).state; timer.push(ultIn(unit(s, 1))); };

    timer.push(ultIn(unit(s, 1)));
    turn(); turn();
    expect(apply(s, cast(1, 'fallingstar', 2, 5))).toEqual({ ok: false, error: 'fallingstar is not usable now' });
    turn();
    s = run(s, cast(1, 'fallingstar', 2, 5)).state;
    timer.push(ultIn(unit(s, 1)));
    turn(); turn(); turn(); turn(); turn();
    expect(timer).toEqual([3, 2, 1, 0, 5, 4, 3, 2, 1, 0]);
  });
});

describe('party', () => {
  const build = (cls: MemberBuild['cls'], tree: MemberBuild['tree']): MemberBuild => ({ ...bare(cls), tree });
  const rime = build('astromancer', ['a_frost', 'a_reach', 'a_wet', 'a_zero']);
  const pyre = build('astromancer', ['a_fire', 'a_range', 'a_burn', 'a_twin']);
  const orrery = build('astromancer', ['a_recall', 'a_hp', 'a_cleanse', 'a_benev']);
  const maxHp = (team: MemberBuild[]) => createBattle({ map: 'storm', starter: 0, teams: [team, [bare('bellringer')]] }, mulberry32(1)).units.filter(u => u.team === 0).map(u => u.maxHp);

  test('a party covering tank, damage and support gets the coverage HP each; three damage paths get nothing', () => {
    const alone = [rime, pyre, orrery].map(m => maxHp([m])[0] ?? 0), bonus = (hps: number[], base: number[]) => hps.map((hp, i) => hp - (base[i] ?? 0));
    expect(bonus(maxHp([rime, pyre, orrery]), alone)).toEqual([COVERAGE.hp, COVERAGE.hp, COVERAGE.hp]);
    expect(bonus(maxHp([pyre, pyre, pyre]), [alone[1] ?? 0, alone[1] ?? 0, alone[1] ?? 0])).toEqual([0, 0, 0]);
  });

  test('a role is the keystone\'s path, else the path with most points, first on a tie, else damage', () => {
    expect(roleOf('astromancer', ['a_frost', 'a_reach', 'a_fire'])).toBe('tank');
    expect(roleOf('astromancer', ['a_fire', 'a_range', 'a_frost'])).toBe('damage');
    expect(roleOf('astromancer', ['a_fire', 'a_frost'])).toBe('tank');
    expect(roleOf('astromancer', [])).toBe('damage');
    expect(roleOf('astromancer', ['a_recall', 'a_hp', 'a_cleanse', 'a_benev', 'a_frost', 'a_reach'])).toBe('support');
  });

  test('a class taken twice gives its resonance', () => {
    expect([...partyBonuses([bare('astromancer'), bare('astromancer'), bare('bellringer')])]).toEqual(['appointedhour', 'conjunction']);
  });
});

describe('apply', () => {
  test('a stale command for a unit whose turn ended is rejected and changes nothing', () => {
    const s0 = stage({ a: trio(), b: trio() });
    const later = run(s0, begin, end(1)).state;
    const before = structuredClone(later);
    expect(apply(later, move(1, 0, 1))).toEqual({ ok: false, error: 'unit 1 is not the current unit' });
    expect(later).toEqual(before);
  });

  test('a legal command leaves the input state untouched', () => {
    const s0 = run(stage({ a: trio(), b: trio() }), begin).state;
    const before = structuredClone(s0);
    const r = apply(s0, move(1, 0, 3));
    expect(r.ok && [unit(r.state, 1).x, unit(r.state, 1).z]).toEqual([0, 3]);
    expect(s0).toEqual(before);
  });

  test('rejects the wrong phase, unreachable tiles, unusable skills and targets out of range', () => {
    const s0 = stage({ a: [bare('bellringer')], b: [bare('astromancer')], place: { 1: [2, 3], 2: [2, 2] } });
    expect(apply(s0, move(1, 2, 4))).toEqual({ ok: false, error: 'not the act phase (ready)' });
    const live = run(s0, begin).state;
    expect(apply(live, move(1, 2, 9))).toEqual({ ok: false, error: '(2, 9) is not reachable' });
    expect(apply(live, cast(1, 'basic_bellringer', 2, 11))).toEqual({ ok: false, error: '(2, 11) is not a target of basic_bellringer' });
    expect(apply(live, cast(1, 'basic_bellringer', 2, 2)).ok).toBe(true);
    const moved = run(live, move(1, 3, 3)).state;
    expect(apply(moved, move(1, 3, 4))).toEqual({ ok: false, error: 'already moved' });
  });
});
