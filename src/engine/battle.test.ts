import { describe, expect, test } from 'vitest';
import { apply } from './battle';
import { bare, cast, end, move, orders, run, stage, uid, unit } from './testkit';

const trio = () => [bare('rogue'), bare('ranger'), bare('wizard')];

describe('turn order', () => {
  test('the starter opens and closes the round, and the next round flips the starter', () => {
    const s0 = stage({ a: trio(), b: trio() });
    const r1 = run(s0, ...orders([1, 2, 3], [4, 5, 6]));
    expect(r1.events[0]).toEqual({ type: 'round', round: 1, starter: 0, queue: [1, 4, 2, 5, 6, 3] });
    expect(r1.state.phase).toEqual({ kind: 'act', queue: [1, 4, 2, 5, 6, 3], qi: 0 });

    const r2 = run(r1.state, end(1), end(4), end(2), end(5), end(6), end(3));
    expect(r2.events.at(-1)).toEqual({ type: 'roundEnd', round: 1, burnt: [] });
    expect([r2.state.round, r2.state.starter, r2.state.phase]).toEqual([2, 1, { kind: 'order', orders: [null, null] }]);

    const r3 = run(r2.state, ...orders([1, 2, 3], [4, 5, 6]));
    expect(r3.events[0]).toEqual({ type: 'round', round: 2, starter: 1, queue: [4, 1, 5, 2, 3, 6] });
  });

  test('each team orders once, and the round waits for both', () => {
    const s0 = stage({ a: trio(), b: trio() });
    const first = run(s0, { kind: 'order', team: 0, order: [uid(1), uid(2), uid(3)] });
    expect(first.events).toEqual([]);
    expect(first.state.phase).toEqual({ kind: 'order', orders: [[1, 2, 3], null] });
    expect(apply(first.state, { kind: 'order', team: 0, order: [uid(3), uid(2), uid(1)] })).toEqual({ ok: false, error: 'team 0 already submitted its order' });
  });

  test('unknown ids are dropped and missing ones appended', () => {
    const s0 = stage({ a: trio(), b: trio() });
    const r = run(s0, { kind: 'order', team: 0, order: [uid(3), uid(99)] }, { kind: 'order', team: 1, order: [] });
    expect(r.events[0]).toEqual({ type: 'round', round: 1, starter: 0, queue: [3, 4, 1, 5, 6, 2] });
  });
});

describe('combos and life', () => {
  test('Shield Bash into a wall slams: 14, then 6 slam damage and a stun that eats the next turn', () => {
    const s0 = stage({ a: [bare('warden')], b: [bare('wizard')], place: { 1: [2, 3], 2: [2, 2] } });
    const r = run(s0, ...orders([1], [2]), cast(1, 'shieldbash', 2, 2));
    expect(r.events.slice(2)).toEqual([
      { type: 'cast', id: 1, team: 0, skill: 'shieldbash', tx: 2, tz: 2, fx: 2, fz: 3, target: 2, empowered: false },
      { type: 'damage', id: 2, amount: 14, absorbed: 0, kind: 'phys' },
      { type: 'move', id: 2, path: [{ x: 2, z: 2 }], slide: true },
      { type: 'combo', name: 'SLAM', id: 2, by: 1, team: 0, setup: null },
      { type: 'damage', id: 2, amount: 6, absorbed: 0, kind: 'slam' },
      { type: 'status', id: 2, key: 'stun' },
    ]);
    const wiz = unit(r.state, 2);
    expect([wiz.hp, wiz.x, wiz.z, wiz.st]).toEqual([120, 2, 2, { stun: { t: 1, by: 1 } }]);

    const next = run(r.state, end(1));
    expect(next.events).toEqual([
      { type: 'activate', id: 2, team: 1, qi: 1 },
      { type: 'skip', id: 2 },
      { type: 'roundEnd', round: 1, burnt: [] },
    ]);
    expect(unit(next.state, 2).st).toEqual({});
  });

  test('a Downed character bleeds out after two of its own turns', () => {
    const s0 = stage({ a: [bare('rogue'), bare('cleric')], b: [bare('wizard'), bare('warden')], place: { 1: [5, 2], 3: [5, 1] }, hp: { 3: 10 } });
    const hit = run(s0, ...orders([1, 2], [3, 4]), cast(1, 'basic_rogue', 5, 1));
    expect(hit.events).toContainEqual({ type: 'downed', id: 3, team: 1 });
    expect(unit(hit.state, 3).life).toEqual({ kind: 'downed', bleed: 2 });

    const firstTurn = run(hit.state, end(1));
    expect(firstTurn.events.slice(0, 2)).toEqual([{ type: 'activate', id: 3, team: 1, qi: 1 }, { type: 'bleed', id: 3, left: 1 }]);
    expect(unit(firstTurn.state, 3).life).toEqual({ kind: 'downed', bleed: 1 });

    const round2 = run(firstTurn.state, end(4), end(2), ...orders([1, 2], [3, 4]));
    expect(round2.events.slice(-3)).toEqual([
      { type: 'activate', id: 3, team: 1, qi: 0 },
      { type: 'death', id: 3, team: 1, cause: 'bled' },
      { type: 'activate', id: 1, team: 0, qi: 1 },
    ]);
    expect(unit(round2.state, 3).life).toEqual({ kind: 'dead' });
  });

  test('Help Up revives at 30% of max HP', () => {
    const s0 = stage({ a: [bare('warden'), bare('ranger')], b: [bare('rogue')], life: { 2: { kind: 'downed', bleed: 2 } } });
    const r = run(s0, ...orders([1, 2], [3]), cast(1, 'helpup', 1, 0));
    expect(r.events.at(-1)).toEqual({ type: 'revive', id: 2, by: 1 });
    expect([unit(r.state, 2).hp, unit(r.state, 2).maxHp, unit(r.state, 2).life]).toEqual([45, 150, { kind: 'up' }]);
  });

  test('Guard sends half of a hit, rounded up, to the Warden', () => {
    const s0 = stage({ a: [bare('warden'), bare('wizard')], b: [{ ...bare('ranger'), tree: ['r_ls', 'r_qd'] }], place: { 1: [1, 2], 2: [2, 2], 3: [2, 4] } });
    const guarded = run(s0, ...orders([1, 2], [3]), cast(1, 'guard', 2, 2), end(1));
    const shot = run(guarded.state, cast(3, 'basic_ranger', 2, 2));
    expect(shot.events.slice(1)).toEqual([
      { type: 'guarded', id: 2, by: 1 },
      { type: 'damage', id: 1, amount: 9, absorbed: 0, kind: 'guard' },
      { type: 'damage', id: 2, amount: 8, absorbed: 0, kind: 'phys' },
    ]);
    expect([unit(shot.state, 1).hp, unit(shot.state, 2).hp]).toEqual([231, 132]);
  });
});

describe('apply', () => {
  test('an order that lists a unit twice is rejected', () => {
    const s0 = stage({ a: trio(), b: trio() });
    expect(apply(s0, { kind: 'order', team: 0, order: [uid(1), uid(1), uid(1)] })).toEqual({ ok: false, error: 'an order lists a unit more than once' });
  });

  test('a stale command for a unit whose turn ended is rejected and changes nothing', () => {
    const s0 = stage({ a: trio(), b: trio() });
    const after = run(s0, ...orders([1, 2, 3], [4, 5, 6]), end(1)).state;
    const before = structuredClone(after);
    expect(apply(after, move(1, 0, 1))).toEqual({ ok: false, error: 'unit 1 is not the current unit' });
    expect(after).toEqual(before);
  });

  test('a legal command leaves the input state untouched', () => {
    const s0 = run(stage({ a: trio(), b: trio() }), ...orders([1, 2, 3], [4, 5, 6])).state;
    const before = structuredClone(s0);
    const r = apply(s0, move(1, 0, 3));
    expect(r.ok && [unit(r.state, 1).x, unit(r.state, 1).z]).toEqual([0, 3]);
    expect(s0).toEqual(before);
  });

  test('rejects the wrong phase, unreachable tiles, cooled-down skills and targets out of range', () => {
    const s0 = stage({ a: [bare('warden')], b: [bare('wizard')], place: { 1: [2, 3], 2: [2, 2] } });
    expect(apply(s0, move(1, 2, 4))).toEqual({ ok: false, error: 'not the act phase (order)' });
    const live = run(s0, ...orders([1], [2])).state;
    expect(apply(live, move(1, 2, 9))).toEqual({ ok: false, error: '(2, 9) is not reachable' });
    expect(apply(live, cast(1, 'basic_warden', 2, 11))).toEqual({ ok: false, error: '(2, 11) is not a target of basic_warden' });
    expect(apply(live, cast(1, 'fireball', 2, 2))).toEqual({ ok: false, error: 'fireball is not usable now' });
    const bashed = run(live, cast(1, 'shieldbash', 2, 2)).state;
    expect(apply(bashed, cast(1, 'guard', 2, 3))).toEqual({ ok: false, error: 'guard is not usable now' });
  });
});
