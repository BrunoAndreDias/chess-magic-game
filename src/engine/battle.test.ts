import { describe, expect, test } from 'vitest';
import { apply, createBattle } from './battle';
import { partyBonuses, roleOf } from './builds';
import { mulberry32 } from './rng';
import { bare, cast, end, move, orders, run, stage, uid, unit } from './testkit';
import type { BattleEvent, MemberBuild } from './types';

const trio = () => [bare('delver'), bare('astromancer'), bare('weaver')];
const after = (events: BattleEvent[], type: BattleEvent['type']) => events.slice(events.findIndex(e => e.type === type));

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

describe('life', () => {
  test('a Downed character bleeds out after two of its own turns', () => {
    const s0 = stage({ a: [bare('delver'), bare('weaver')], b: [bare('astromancer'), bare('weaver')], place: { 1: [5, 2], 3: [5, 1] }, hp: { 3: 10 } });
    const hit = run(s0, ...orders([1, 2], [3, 4]), cast(1, 'basic_delver', 5, 1));
    expect(hit.events).toContainEqual({ type: 'downed', id: 3, team: 1 });
    expect(unit(hit.state, 3).life).toEqual({ kind: 'downed', bleed: 2 });

    const firstTurn = run(hit.state, end(1));
    expect(firstTurn.events.slice(0, 2)).toEqual([{ type: 'activate', id: 3, team: 1, qi: 1 }, { type: 'bleed', id: 3, left: 1 }]);

    const round2 = run(firstTurn.state, end(4), end(2), ...orders([1, 2], [3, 4]));
    expect(round2.events.slice(-3)).toEqual([
      { type: 'activate', id: 3, team: 1, qi: 0 },
      { type: 'death', id: 3, team: 1, cause: 'bled' },
      { type: 'activate', id: 1, team: 0, qi: 1 },
    ]);
  });

  test('Help Up revives at 30% of max HP', () => {
    const s0 = stage({ a: [bare('delver'), bare('weaver')], b: [bare('astromancer')], life: { 2: { kind: 'downed', bleed: 2 } } });
    const r = run(s0, ...orders([1, 2], [3]), cast(1, 'helpup', 1, 0));
    expect(r.events.at(-1)).toEqual({ type: 'revive', id: 2, by: 1 });
    expect([unit(r.state, 2).hp, unit(r.state, 2).maxHp, unit(r.state, 2).life]).toEqual([51, 170, { kind: 'up' }]);
  });
});

describe('underground', () => {
  test('a burrowed Delver cannot be targeted, moves under a wall, and surfaces at the end of its next turn leaving a mouth', () => {
    const s0 = stage({ a: [bare('delver')], b: [bare('astromancer')], place: { 1: [5, 1], 2: [8, 1] }, terr: [[4, 2, '#'], [5, 2, '#'], [6, 2, '#']] });
    const live = run(s0, ...orders([1], [2])).state;

    const open = run(live, end(1));
    expect(apply(open.state, cast(2, 'basic_astromancer', 5, 1)).ok).toBe(true);

    const sunk = run(live, cast(1, 'burrow', 5, 1), end(1));
    expect(sunk.events.slice(0, 3)).toEqual([
      { type: 'cast', id: 1, team: 0, skill: 'burrow', tx: 5, tz: 1, fx: 5, fz: 1, target: null },
      { type: 'burrow', id: 1, x: 5, z: 1 },
      { type: 'mouth', team: 0, x: 5, z: 1 },
    ]);
    expect(apply(sunk.state, cast(2, 'basic_astromancer', 5, 1))).toEqual({ ok: false, error: '(5, 1) is not a target of basic_astromancer' });

    const under = run(sunk.state, end(2), ...orders([1], [2]), end(2), move(1, 5, 3));
    expect(under.events.at(-1)).toEqual({ type: 'move', id: 1, path: [{ x: 5, z: 1 }, { x: 5, z: 2 }, { x: 5, z: 3 }], under: true });
    expect(unit(under.state, 1).under).toBe(1);

    const up = run(under.state, end(1));
    expect(up.events.slice(0, 2)).toEqual([{ type: 'surface', id: 1, x: 5, z: 3 }, { type: 'mouth', team: 0, x: 5, z: 3 }]);
    expect(unit(up.state, 1).under).toBe(0);
    expect(up.state.mouths).toEqual([{ team: 0, net: 1, x: 5, z: 1, t: 1 }, { team: 0, net: 1, x: 5, z: 3, t: 2 }]);
  });

  test('an ally on a Tunnel Mouth steps to a joined mouth for 1 move, and Safe Passage shields it', () => {
    const wright = bare('delver', undefined, ['d_mouth', 'd_hp2', 'd_shield']);
    const s0 = stage({ a: [wright, bare('weaver')], b: [bare('astromancer')], place: { 1: [5, 0], 2: [3, 0], 3: [6, 9] } });
    s0.mouths = [{ team: 0, net: uid(1), x: 3, z: 0, t: 5 }, { team: 0, net: uid(1), x: 8, z: 2, t: 5 }];
    const r = run(run(s0, ...orders([2, 1], [3])).state, move(2, 8, 2));
    expect(r.events).toEqual([{ type: 'move', id: 2, path: [{ x: 3, z: 0 }, { x: 8, z: 2 }] }, { type: 'shield', id: 2, amount: 15 }]);
    expect([unit(r.state, 2).x, unit(r.state, 2).z, unit(r.state, 2).shield]).toEqual([8, 2, 15]);
  });

  test('Upheaval from below pushes the enemy into a wall: SLAM', () => {
    const s0 = stage({ a: [bare('delver')], b: [bare('weaver')], place: { 1: [5, 1], 2: [6, 1] }, terr: [[7, 1, '#']] });
    const live = run(s0, ...orders([1], [2]), cast(1, 'burrow', 5, 1), end(1), end(2), ...orders([1], [2]), end(2)).state;
    const r = run(live, cast(1, 'upheaval', 6, 1));
    expect(r.events.slice(1)).toEqual([
      { type: 'surface', id: 1, x: 5, z: 1 },
      { type: 'mouth', team: 0, x: 5, z: 1 },
      { type: 'damage', id: 2, amount: 18, absorbed: 0, kind: 'phys' },
      { type: 'move', id: 2, path: [{ x: 6, z: 1 }], slide: true },
      { type: 'combo', name: 'SLAM', id: 2, by: 1, team: 0, setup: null },
      { type: 'damage', id: 2, amount: 6, absorbed: 0, kind: 'slam' },
      { type: 'status', id: 2, key: 'stun' },
    ]);
    expect(unit(r.state, 2).hp).toBe(146);
  });

  test('Undermine opens a pit at the end of the round, and whoever stands there falls', () => {
    const s0 = stage({ a: [bare('delver', ['undermine', 'satchel', 'stoneskin'])], b: [bare('astromancer')], place: { 1: [5, 1], 2: [7, 3] } });
    const sunk = run(run(s0, ...orders([1], [2])).state, cast(1, 'undermine', 5, 3), end(1), move(2, 5, 3));
    expect(sunk.events[1]).toEqual({ type: 'terrain', tiles: [{ x: 5, z: 3 }], kind: 'sink' });
    const r = run(sunk.state, end(2));
    expect(after(r.events, 'terrain')).toEqual([
      { type: 'terrain', tiles: [{ x: 5, z: 3 }], kind: 'pit' },
      { type: 'fall', id: 2, x: 5, z: 3 },
      { type: 'downed', id: 2, team: 1 },
      { type: 'over', winner: 0, reason: 'wipe' },
    ]);
  });
});

describe('calls', () => {
  const sky = () => stage({
    a: [bare('astromancer'), bare('weaver')], b: [bare('delver')],
    place: { 1: [4, 0], 2: [7, 2], 3: [6, 2] },
  });

  test('a Call marks its area now and lands at the start of the caster\'s next activation, hitting allies too', () => {
    const called = run(sky(), ...orders([1, 2], [3]), cast(1, 'meteor', 6, 2));
    expect(called.events.at(-1)).toEqual({
      type: 'call', id: 1, team: 0, skill: 'meteor',
      tiles: [{ x: 5, z: 1 }, { x: 6, z: 1 }, { x: 7, z: 1 }, { x: 5, z: 2 }, { x: 6, z: 2 }, { x: 7, z: 2 }, { x: 5, z: 3 }, { x: 6, z: 3 }, { x: 7, z: 3 }],
    });
    expect(called.state.calls).toEqual([{ by: 1, team: 0, skill: 'meteor', x: 6, z: 2, recall: null }]);

    const landed = run(called.state, end(1), end(3), end(2), ...orders([1, 2], [3]), end(3));
    expect(after(landed.events, 'activate').slice(-6)).toEqual([
      { type: 'activate', id: 1, team: 0, qi: 1 },
      expect.objectContaining({ type: 'land', id: 1, skill: 'meteor', x: 6, z: 2, power: 1 }),
      { type: 'damage', id: 3, amount: 30, absorbed: 0, kind: 'fire' },
      { type: 'status', id: 3, key: 'burn' },
      { type: 'damage', id: 2, amount: 15, absorbed: 0, kind: 'fire' },
      { type: 'status', id: 2, key: 'burn' },
    ]);
    expect([unit(landed.state, 3).hp, unit(landed.state, 2).hp, landed.state.calls]).toEqual([160, 155, []]);
  });

  test('a Call fizzles when its caster is Downed before it lands', () => {
    const s0 = stage({ a: [bare('astromancer')], b: [bare('weaver')], place: { 1: [4, 0], 2: [4, 1] }, hp: { 1: 10 } });
    const called = run(s0, ...orders([1], [2]), cast(1, 'meteor', 6, 2), end(1)).state;
    const r = run(called, cast(2, 'basic_weaver', 4, 0));
    expect(r.events.slice(1)).toEqual([
      { type: 'damage', id: 1, amount: 14, absorbed: 0, kind: 'phys' },
      { type: 'downed', id: 1, team: 0 },
      { type: 'fizzle', id: 1 },
      { type: 'over', winner: 1, reason: 'wipe' },
    ]);
    expect(r.state.calls).toEqual([]);
  });

  test('Snap lands the pending Call at once, at half power', () => {
    const r = run(run(sky(), ...orders([1, 2], [3])).state, cast(1, 'meteor', 6, 2), cast(1, 'snap', 4, 0));
    expect(r.events.slice(3)).toEqual([
      expect.objectContaining({ type: 'land', id: 1, skill: 'meteor', x: 6, z: 2, power: 0.5 }),
      { type: 'damage', id: 3, amount: 15, absorbed: 0, kind: 'fire' },
      { type: 'status', id: 3, key: 'burn' },
      { type: 'damage', id: 2, amount: 8, absorbed: 0, kind: 'fire' },
      { type: 'status', id: 2, key: 'burn' },
    ]);
    expect(r.state.calls).toEqual([]);
  });

  test('Glacial Prison makes the target skip its turn, then leaves it Wet', () => {
    const s0 = stage({ a: [bare('astromancer', ['prison', 'frostbolt', 'meteor'])], b: [bare('delver')], place: { 1: [4, 0], 2: [4, 3] } });
    const r = run(run(s0, ...orders([1], [2]), cast(1, 'prison', 4, 3)).state, end(1));
    expect(r.events.slice(0, 3)).toEqual([{ type: 'activate', id: 2, team: 1, qi: 1 }, { type: 'skip', id: 2 }, { type: 'status', id: 2, key: 'wet' }]);
    expect(unit(r.state, 2).st).toEqual({ wet: { t: 2, by: 1 } });
  });
});

describe('threads', () => {
  test('a held enemy may only end its move within the Thread\'s length of the Weaver', () => {
    const s0 = stage({ a: [bare('weaver')], b: [bare('delver')], place: { 1: [5, 1], 2: [5, 3] } });
    const tied = run(s0, ...orders([1], [2]), cast(1, 'tether', 5, 3), end(1));
    expect(tied.state.threads).toEqual([{ by: 1, to: 2, len: 2 }]);
    expect(apply(tied.state, move(2, 5, 6))).toEqual({ ok: false, error: '(5, 6) is not reachable' });
    expect(apply(tied.state, move(2, 7, 3)).ok).toBe(true);
  });

  test('a Thread snaps as soon as a wall stands between its ends', () => {
    const s0 = stage({ a: [bare('weaver')], b: [bare('delver')], place: { 1: [4, 0], 2: [4, 2] }, terr: [[3, 1, '#']] });
    const r = run(run(s0, ...orders([1], [2]), cast(1, 'tether', 4, 2), end(1)).state, move(2, 2, 2));
    expect(r.events).toEqual([{ type: 'move', id: 2, path: [{ x: 4, z: 2 }, { x: 3, z: 2 }, { x: 2, z: 2 }] }, { type: 'snap', by: 1, to: 2 }]);
    expect(r.state.threads).toEqual([]);
  });

  test('Reel pulls a held enemy 2 toward the Weaver; into a unit it SLAMs', () => {
    const s0 = stage({ a: [bare('weaver'), bare('delver')], b: [bare('delver')], place: { 1: [5, 0], 2: [5, 1], 3: [5, 3] } });
    const r = run(s0, ...orders([1, 2], [3]), cast(1, 'tether', 5, 3), cast(1, 'reel', 5, 0));
    expect(after(r.events, 'move')).toEqual([
      { type: 'move', id: 3, path: [{ x: 5, z: 3 }, { x: 5, z: 2 }], slide: true },
      { type: 'combo', name: 'SLAM', id: 3, by: 1, team: 0, setup: null },
      { type: 'damage', id: 3, amount: 6, absorbed: 0, kind: 'slam' },
      { type: 'status', id: 3, key: 'stun' },
    ]);
  });

  test('a web stops a walker and Roots it through its next turn; nobody but a Weaver paths through', () => {
    const s0 = stage({ a: [bare('weaver')], b: [bare('delver')], place: { 1: [5, 0], 2: [8, 3] } });
    const webbed = run(s0, ...orders([1], [2]), cast(1, 'web', 5, 3), end(1));
    expect(apply(webbed.state, move(2, 5, 3))).toEqual({ ok: false, error: '(5, 3) is not reachable' });
    const caught = run(webbed.state, move(2, 6, 3));
    expect(caught.events[0]).toEqual({ type: 'move', id: 2, path: [{ x: 8, z: 3 }, { x: 7, z: 3 }, { x: 6, z: 3 }] });
    expect(caught.events.at(-1)).toEqual({ type: 'status', id: 2, key: 'root' });
    const next = run(caught.state, end(2), ...orders([1], [2]));
    expect(apply(next.state, move(2, 7, 3))).toEqual({ ok: false, error: 'already moved' });
  });
});

describe('party', () => {
  const build = (cls: MemberBuild['cls'], tree: MemberBuild['tree']): MemberBuild => ({ ...bare(cls), tree });
  const sapper = build('delver', ['d_hp', 'd_quick', 'd_satchel', 'd_earth']);
  const pyre = build('astromancer', ['a_fire', 'a_range', 'a_burn', 'a_twin']);
  const spinner = build('weaver', ['w_cocoon', 'w_reach', 'w_silk', 'w_spare']);
  const maxHp = (team: MemberBuild[]) => createBattle({ map: 'storm', starter: 0, teams: [team, [bare('delver')]] }, mulberry32(1)).units.filter(u => u.team === 0).map(u => u.maxHp);

  test('a party covering tank, damage and support gets +20 max HP each; three damage paths get nothing', () => {
    expect(maxHp([sapper, pyre, spinner])).toEqual([240, 160, 190]);
    expect(maxHp([pyre, pyre, pyre])).toEqual([140, 140, 140]);
  });

  test('a role is the keystone\'s path, else the path with most points, first on a tie, else damage', () => {
    expect(roleOf('weaver', ['w_hp', 'w_leash', 'w_poison'])).toBe('tank');
    expect(roleOf('weaver', ['w_poison', 'w_fang', 'w_hp'])).toBe('damage');
    expect(roleOf('weaver', ['w_poison', 'w_hp'])).toBe('tank');
    expect(roleOf('weaver', [])).toBe('damage');
    expect(roleOf('delver', ['d_mouth', 'd_hp2', 'd_shield', 'd_city', 'd_hp', 'd_quick'])).toBe('support');
  });

  test('a class taken twice gives its resonance', () => {
    expect([...partyBonuses([bare('weaver'), bare('weaver'), bare('delver')])]).toEqual(['silktunnels', 'greatweb']);
  });
});

describe('apply', () => {
  test('an order that lists a unit twice is rejected', () => {
    const s0 = stage({ a: trio(), b: trio() });
    expect(apply(s0, { kind: 'order', team: 0, order: [uid(1), uid(1), uid(1)] })).toEqual({ ok: false, error: 'an order lists a unit more than once' });
  });

  test('a stale command for a unit whose turn ended is rejected and changes nothing', () => {
    const s0 = stage({ a: trio(), b: trio() });
    const later = run(s0, ...orders([1, 2, 3], [4, 5, 6]), end(1)).state;
    const before = structuredClone(later);
    expect(apply(later, move(1, 0, 1))).toEqual({ ok: false, error: 'unit 1 is not the current unit' });
    expect(later).toEqual(before);
  });

  test('a legal command leaves the input state untouched', () => {
    const s0 = run(stage({ a: trio(), b: trio() }), ...orders([1, 2, 3], [4, 5, 6])).state;
    const before = structuredClone(s0);
    const r = apply(s0, move(1, 0, 3));
    expect(r.ok && [unit(r.state, 1).x, unit(r.state, 1).z]).toEqual([0, 3]);
    expect(s0).toEqual(before);
  });

  test('rejects the wrong phase, unreachable tiles, unusable skills and targets out of range', () => {
    const s0 = stage({ a: [bare('delver')], b: [bare('astromancer')], place: { 1: [2, 3], 2: [2, 2] } });
    expect(apply(s0, move(1, 2, 4))).toEqual({ ok: false, error: 'not the act phase (order)' });
    const live = run(s0, ...orders([1], [2])).state;
    expect(apply(live, move(1, 2, 9))).toEqual({ ok: false, error: '(2, 9) is not reachable' });
    expect(apply(live, cast(1, 'basic_delver', 2, 11))).toEqual({ ok: false, error: '(2, 11) is not a target of basic_delver' });
    expect(apply(live, cast(1, 'upheaval', 2, 2))).toEqual({ ok: false, error: 'upheaval is not usable now' });
    const moved = run(live, move(1, 3, 3)).state;
    expect(apply(moved, cast(1, 'burrow', 3, 3))).toEqual({ ok: false, error: 'burrow is not usable now' });
  });
});
