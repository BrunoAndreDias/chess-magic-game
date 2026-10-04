import { describe, expect, test } from 'vitest';
import { apply, createBattle } from './battle';
import { partyBonuses, roleOf } from './builds';
import { COVERAGE, idx, reachable, threadCap } from './index';
import { mulberry32 } from './rng';
import { bare, begin, cast, end, move, run, stage, turns, uid, unit } from './testkit';
import type { BattleEvent, MemberBuild } from './types';

const trio = () => [bare('astromancer'), bare('weaver'), bare('weaver')];
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
    const s0 = stage({ a: [bare('weaver'), bare('weaver')], b: [bare('astromancer'), bare('weaver')], place: { 1: [5, 2], 3: [5, 1] }, hp: { 3: 10 } });
    const hit = run(s0, begin, cast(1, 'basic_weaver', 5, 1));
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
    const s0 = stage({ a: [bare('astromancer'), bare('weaver')], b: [bare('astromancer')], life: { 2: { kind: 'downed', bleed: 2 } } });
    const r = run(s0, begin, cast(1, 'helpup', 1, 0));
    expect(r.events.at(-1)).toEqual({ type: 'revive', id: 2, by: 1 });
    expect([unit(r.state, 2).hp, unit(r.state, 2).maxHp, unit(r.state, 2).life]).toEqual([51, 170, { kind: 'up' }]);
  });
});

describe('calls', () => {
  const sky = () => stage({
    a: [bare('astromancer'), bare('weaver')], b: [bare('weaver')],
    place: { 1: [4, 0], 2: [7, 2], 3: [6, 2] },
  });

  test('a Call marks its area now and lands at the start of the caster\'s next activation, hitting allies too', () => {
    const called = run(sky(), begin, cast(1, 'meteor', 6, 2));
    expect(called.events.at(-1)).toEqual({
      type: 'call', id: 1, team: 0, skill: 'meteor',
      tiles: [{ x: 5, z: 1 }, { x: 6, z: 1 }, { x: 7, z: 1 }, { x: 5, z: 2 }, { x: 6, z: 2 }, { x: 7, z: 2 }, { x: 5, z: 3 }, { x: 6, z: 3 }, { x: 7, z: 3 }],
    });
    expect(called.state.calls).toEqual([{ by: 1, team: 0, skill: 'meteor', x: 6, z: 2, recall: null }]);

    const landed = run(called.state, end(1), end(3), end(2));
    expect(after(landed.events, 'activate').slice(-7)).toEqual([
      { type: 'activate', id: 1, team: 0, qi: 0 },
      expect.objectContaining({ type: 'land', id: 1, skill: 'meteor', x: 6, z: 2, power: 1 }),
      { type: 'damage', id: 3, amount: 30, absorbed: 0, kind: 'fire' },
      { type: 'soul', x: 6, z: 2 },
      { type: 'status', id: 3, key: 'burn' },
      { type: 'damage', id: 2, amount: 15, absorbed: 0, kind: 'fire' },
      { type: 'status', id: 2, key: 'burn' },
    ]);
    expect([unit(landed.state, 3).hp, unit(landed.state, 2).hp, landed.state.calls]).toEqual([140, 155, []]);
  });

  test('a Call fizzles when its caster is Downed before it lands', () => {
    const s0 = stage({ a: [bare('astromancer')], b: [bare('weaver')], place: { 1: [4, 0], 2: [4, 1] }, hp: { 1: 10 } });
    const called = run(s0, begin, cast(1, 'meteor', 6, 2), end(1)).state;
    const r = run(called, cast(2, 'basic_weaver', 4, 0));
    expect(r.events.slice(1)).toEqual([
      { type: 'damage', id: 1, amount: 14, absorbed: 0, kind: 'phys' },
      { type: 'downed', id: 1, team: 0 },
      { type: 'soul', x: 4, z: 0 },
      { type: 'fizzle', id: 1 },
      { type: 'over', winner: 1, reason: 'wipe' },
    ]);
    expect(r.state.calls).toEqual([]);
  });

  test('with Benevolent Heavens a Meteor heals an ally on burning grass and doesn\'t set it Burning', () => {
    const orrery = bare('astromancer', undefined, ['a_recall', 'a_hp', 'a_cleanse', 'a_benev']);
    const s0 = stage({ a: [orrery, bare('weaver')], b: [bare('weaver')], place: { 1: [4, 0], 2: [6, 2], 3: [7, 2] }, hp: { 2: 100 }, terr: [[6, 2, 'G'], [7, 2, 'G']] });
    const r = run(s0, begin, cast(1, 'meteor', 6, 2), end(1), end(3), end(2));
    expect(r.events).toContainEqual({ type: 'heal', id: 2, amount: 8 });
    expect([unit(r.state, 2).hp, unit(r.state, 2).st]).toEqual([108, {}]);
    expect(unit(r.state, 3).st.burn).toEqual({ t: 2, dmg: 6, by: 1 });
  });

  test('with Benevolent Heavens a Gravity Well still pulls allies', () => {
    const orrery = bare('astromancer', undefined, ['a_recall', 'a_hp', 'a_cleanse', 'a_benev']);
    const s0 = stage({ a: [orrery, bare('weaver')], b: [bare('weaver')], place: { 1: [2, 0], 2: [6, 4], 3: [9, 9] } });
    const r = run(s0, begin, cast(1, 'gravitywell', 6, 2), end(1), end(3), end(2));
    expect([unit(r.state, 2).x, unit(r.state, 2).z]).toEqual([6, 2]);
  });

  test('Snap lands the pending Call at once, at half power', () => {
    const r = run(run(sky(), begin).state, cast(1, 'meteor', 6, 2), cast(1, 'snap', 4, 0));
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
    const s0 = stage({ a: [bare('astromancer', ['prison', 'frostbolt', 'meteor'])], b: [bare('weaver')], place: { 1: [4, 0], 2: [4, 3] } });
    const r = run(run(s0, begin, cast(1, 'prison', 4, 3)).state, end(1));
    expect(r.events.slice(0, 3)).toEqual([{ type: 'activate', id: 2, team: 1, qi: 1 }, { type: 'skip', id: 2 }, { type: 'status', id: 2, key: 'wet' }]);
    expect(unit(r.state, 2).st).toEqual({ wet: { t: 2, by: 1 } });
  });
});

describe('encased', () => {
  test('Encased during its own turn, a unit can neither cast nor move, and it still skips its next turn', () => {
    const s0 = stage({ a: [bare('weaver'), bare('astromancer')], b: [bare('weaver')], place: { 1: [3, 0], 2: [5, 1], 3: [6, 9] } });
    const live = run(s0, begin, end(1), end(3)).state;
    const r = { state: structuredClone(live) };
    unit(r.state, 2).st.encased = { t: 1, by: uid(1), ice: false };
    expect(apply(live, cast(2, 'meteor', 5, 4)).ok).toBe(true);
    expect(apply(r.state, cast(2, 'meteor', 5, 4))).toEqual({ ok: false, error: 'meteor is not usable now' });
    expect(reachable(r.state, unit(r.state, 2)).size).toBe(0);
    expect(reachable(live, unit(live, 2)).has(idx(5, 2))).toBe(true);

    const next = run(r.state, end(2), end(1), end(3));
    const turn = next.events.findIndex(e => e.type === 'activate' && e.id === 2);
    expect(next.events.slice(turn, turn + 2)).toEqual([{ type: 'activate', id: 2, team: 0, qi: 2 }, { type: 'skip', id: 2 }]);
  });

  test('Fate Weaver spares the Weaver herself once: Encased at 1 HP', () => {
    const spinner = bare('weaver', ['reel', 'web', 'cocoon'], ['w_cocoon', 'w_reach', 'w_silk', 'w_spare']);
    const s0 = stage({ a: [bare('weaver')], b: [spinner], place: { 1: [5, 1], 2: [6, 1] }, hp: { 2: 10 } });
    const r = run(s0, begin, cast(1, 'basic_weaver', 6, 1));
    expect(r.events).toContainEqual({ type: 'encased', id: 2 });
    expect([unit(r.state, 2).hp, unit(r.state, 2).spared]).toEqual([1, true]);
  });

  test('Help Up frees a Cocooned ally, and it acts on its next turn', () => {
    const s0 = stage({
      a: [bare('weaver', ['cocoon', 'web', 'reel']), bare('astromancer'), bare('weaver')], b: [bare('weaver')],
      place: { 1: [3, 1], 2: [4, 2], 3: [3, 2], 4: [10, 10] }, life: { 3: { kind: 'downed', bleed: 2 } },
    });
    const r = run(s0, begin, cast(1, 'cocoon', 3, 2), end(1), end(4), cast(2, 'helpup', 3, 2));
    expect([unit(r.state, 3).life, unit(r.state, 3).st]).toEqual([{ kind: 'up' }, {}]);
    const next = run(r.state, end(2));
    expect(next.events).toEqual([{ type: 'activate', id: 3, team: 0, qi: 3 }]);
    expect(apply(next.state, cast(3, 'reel', 3, 2)).ok).toBe(true);
  });

  test('Recall gives an Encased ally its HP back but leaves it where it is', () => {
    const s0 = stage({
      a: [bare('astromancer', ['recall', 'meteor', 'frostbolt']), bare('weaver')], b: [bare('astromancer', ['prison', 'frostbolt', 'meteor']), bare('astromancer')],
      starter: 1, place: { 1: [4, 0], 2: [2, 2], 3: [2, 5], 4: [1, 5] },
    });
    const r = run(s0, begin, end(3), cast(1, 'recall', 2, 2), end(1), move(2, 1, 2), end(2), cast(4, 'basic_astromancer', 1, 2), end(4),
      cast(3, 'prison', 1, 2), end(3));
    expect(after(r.events, 'land').slice(1)).toEqual([{ type: 'heal', id: 2, amount: 34 }]);
    expect([unit(r.state, 2).x, unit(r.state, 2).z, unit(r.state, 2).hp]).toEqual([1, 2, 170]);
  });

  test('Absolute Zero on an Encased unit: the skipped turn spends the Encase, and the Stun skips the turn after', () => {
    const rime = bare('astromancer', ['thunderhead', 'prison', 'frostbolt'], ['a_frost', 'a_prison', 'a_wet', 'a_zero']);
    const s0 = stage({
      a: [rime, bare('astromancer', ['prison', 'meteor', 'frostbolt'])], b: [bare('weaver'), bare('weaver')],
      place: { 1: [2, 2], 2: [4, 3], 3: [10, 10], 4: [3, 5] },
    });
    const jailed = run(s0, begin, cast(1, 'thunderhead', 3, 5), end(1), end(3), end(4), cast(2, 'prison', 3, 5), end(2));
    const r2 = run(jailed.state, end(1), end(3));
    expect(r2.events).toContainEqual({ type: 'skip', id: 4 });
    expect(unit(r2.state, 4).st).toEqual({ stun: { t: 1, by: 1 }, wet: { t: 2, by: 2 } });
    const r3 = run(r2.state, end(2), end(1), end(3));
    expect(r3.events.slice(-3, -1)).toEqual([{ type: 'activate', id: 4, team: 1, qi: 2 }, { type: 'skip', id: 4 }]);
    expect(unit(r3.state, 4).st).toEqual({ wet: { t: 1, by: 2 } });
  });
});

describe('threads', () => {
  test('a held enemy may only end its move within the Thread\'s length of the Weaver', () => {
    const s0 = stage({ a: [bare('weaver')], b: [bare('astromancer')], place: { 1: [5, 1], 2: [5, 3] } });
    const tied = run(s0, begin, cast(1, 'tether', 5, 3), end(1));
    expect(tied.state.threads).toEqual([{ by: 1, to: 2, len: 2 }]);
    expect(apply(tied.state, move(2, 5, 6))).toEqual({ ok: false, error: '(5, 6) is not reachable' });
    expect(apply(tied.state, move(2, 7, 3)).ok).toBe(true);
  });

  test('a Thread snaps as soon as a wall stands between its ends', () => {
    const s0 = stage({ a: [bare('weaver')], b: [bare('astromancer')], place: { 1: [4, 0], 2: [4, 2] }, terr: [[3, 1, '#']] });
    const r = run(run(s0, begin, cast(1, 'tether', 4, 2), end(1)).state, move(2, 2, 2));
    expect(r.events).toEqual([{ type: 'move', id: 2, path: [{ x: 4, z: 2 }, { x: 3, z: 2 }, { x: 2, z: 2 }] }, { type: 'snap', by: 1, to: 2 }]);
    expect(r.state.threads).toEqual([]);
  });

  test('a Thread breaks at the start of an activation when a Call sets its Weaver Burning, and the leash goes with it', () => {
    const s0 = stage({ a: [bare('astromancer')], b: [bare('weaver')], starter: 1, place: { 1: [3, 2], 2: [3, 5] } });
    const called = run(s0, begin, end(2), cast(1, 'meteor', 3, 5), end(1), cast(2, 'tether', 3, 2));
    expect(called.state.threads).toEqual([{ by: 2, to: 1, len: 3 }]);
    const r = run(called.state, end(2));
    expect(r.events.slice(-2)).toEqual([{ type: 'status', id: 2, key: 'burn' }, { type: 'snap', by: 2, to: 1 }]);
    expect(r.state.threads).toEqual([]);
    expect(apply(r.state, move(1, 3, 0)).ok).toBe(true);
  });

  test('a Thread snaps the moment its end is Downed, even by the blow that ends the battle', () => {
    const s0 = stage({ a: [bare('astromancer'), bare('weaver')], b: [bare('weaver')], place: { 1: [4, 0], 2: [5, 1], 3: [6, 3] }, hp: { 3: 10 } });
    const r = run(s0, begin, cast(1, 'meteor', 6, 3), end(1), end(3), cast(2, 'tether', 6, 3), end(2));
    expect(after(r.events, 'downed')).toEqual([{ type: 'downed', id: 3, team: 1 }, { type: 'soul', x: 6, z: 3 }, { type: 'snap', by: 2, to: 3 }, { type: 'over', winner: 0, reason: 'wipe' }]);
    expect(r.state.threads).toEqual([]);
  });

  test('a Thread held by a Weaver who is not standing leashes nothing', () => {
    const s = stage({ a: [bare('weaver')], b: [bare('astromancer')], place: { 1: [5, 1], 2: [5, 3] }, life: { 1: { kind: 'downed', bleed: 2 } } });
    s.threads = [{ by: uid(1), to: uid(2), len: 1 }];
    expect(reachable(s, unit(s, 2)).has(idx(8, 3))).toBe(true);
    s.units[0]!.life = { kind: 'up' };
    expect(reachable(s, unit(s, 2)).has(idx(8, 3))).toBe(false);
  });

  test('Reel pulls a held enemy 2 toward the Weaver; into a unit it SLAMs', () => {
    const s0 = stage({ a: [bare('weaver'), bare('astromancer')], b: [bare('astromancer')], place: { 1: [5, 0], 2: [5, 1], 3: [5, 3] } });
    const r = run(s0, begin, cast(1, 'tether', 5, 3), cast(1, 'reel', 5, 0));
    expect(after(r.events, 'move')).toEqual([
      { type: 'move', id: 3, path: [{ x: 5, z: 3 }, { x: 5, z: 2 }], slide: true },
      { type: 'combo', name: 'SLAM', id: 3, by: 1, team: 0, setup: null },
      { type: 'damage', id: 3, amount: 6, absorbed: 0, kind: 'slam' },
      { type: 'status', id: 3, key: 'stun' },
    ]);
  });

  test('a Weaver holds 3 Threads, one more with Many Hands and one more in a Great Web party', () => {
    const s = stage({ a: [bare('weaver'), bare('weaver', undefined, ['w_hp', 'w_leash', 'w_thread'])], b: [bare('weaver')] });
    expect([threadCap(s, unit(s, 1)), threadCap(s, unit(s, 2)), threadCap(s, unit(s, 3))]).toEqual([4, 5, 3]);
  });

  test('Puppet Strings walks a held enemy to a tile within 2 steps of it', () => {
    const s0 = stage({ a: [bare('weaver', ['puppet', 'web', 'reel'])], b: [bare('astromancer')], place: { 1: [3, 2], 2: [3, 5] } });
    const tied = run(s0, begin, cast(1, 'tether', 3, 5)).state;
    expect(apply(tied, cast(1, 'puppet', 9, 9))).toEqual({ ok: false, error: '(9, 9) is not a target of puppet' });
    const r = run(tied, cast(1, 'puppet', 3, 7));
    expect(r.events[1]).toEqual({ type: 'move', id: 2, path: [{ x: 3, z: 5 }, { x: 3, z: 6 }, { x: 3, z: 7 }] });
  });

  test('a web stops a walker and Roots it through its next turn; nobody but a Weaver paths through', () => {
    const s0 = stage({ a: [bare('weaver')], b: [bare('astromancer')], place: { 1: [5, 0], 2: [8, 3] } });
    const webbed = run(s0, begin, cast(1, 'web', 5, 3), end(1));
    expect(apply(webbed.state, move(2, 5, 3))).toEqual({ ok: false, error: '(5, 3) is not reachable' });
    const caught = run(webbed.state, move(2, 6, 3));
    expect(caught.events[0]).toEqual({ type: 'move', id: 2, path: [{ x: 8, z: 3 }, { x: 7, z: 3 }, { x: 6, z: 3 }] });
    expect(caught.events.at(-1)).toEqual({ type: 'status', id: 2, key: 'root' });
    const next = run(caught.state, end(2), end(1));
    expect(apply(next.state, move(2, 7, 3))).toEqual({ ok: false, error: 'already moved' });
  });
});

describe('party', () => {
  const build = (cls: MemberBuild['cls'], tree: MemberBuild['tree']): MemberBuild => ({ ...bare(cls), tree });
  const rime = build('astromancer', ['a_frost', 'a_prison', 'a_wet', 'a_zero']);
  const pyre = build('astromancer', ['a_fire', 'a_range', 'a_burn', 'a_twin']);
  const spinner = build('weaver', ['w_cocoon', 'w_reach', 'w_silk', 'w_spare']);
  const maxHp = (team: MemberBuild[]) => createBattle({ map: 'storm', starter: 0, teams: [team, [bare('weaver')]] }, mulberry32(1)).units.filter(u => u.team === 0).map(u => u.maxHp);

  test('a party covering tank, damage and support gets the coverage HP each; three damage paths get nothing', () => {
    const alone = [rime, pyre, spinner].map(m => maxHp([m])[0] ?? 0), bonus = (hps: number[], base: number[]) => hps.map((hp, i) => hp - (base[i] ?? 0));
    expect(bonus(maxHp([rime, pyre, spinner]), alone)).toEqual([COVERAGE.hp, COVERAGE.hp, COVERAGE.hp]);
    expect(bonus(maxHp([pyre, pyre, pyre]), [alone[1] ?? 0, alone[1] ?? 0, alone[1] ?? 0])).toEqual([0, 0, 0]);
  });

  test('a role is the keystone\'s path, else the path with most points, first on a tie, else damage', () => {
    expect(roleOf('weaver', ['w_hp', 'w_leash', 'w_poison'])).toBe('tank');
    expect(roleOf('weaver', ['w_poison', 'w_fang', 'w_hp'])).toBe('damage');
    expect(roleOf('weaver', ['w_poison', 'w_hp'])).toBe('tank');
    expect(roleOf('weaver', [])).toBe('damage');
    expect(roleOf('weaver', ['w_cocoon', 'w_reach', 'w_silk', 'w_spare', 'w_hp', 'w_leash'])).toBe('support');
  });

  test('a class taken twice gives its resonance', () => {
    expect([...partyBonuses([bare('weaver'), bare('weaver'), bare('astromancer')])]).toEqual(['startether', 'greatweb']);
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
    const s0 = stage({ a: [bare('weaver')], b: [bare('astromancer')], place: { 1: [2, 3], 2: [2, 2] } });
    expect(apply(s0, move(1, 2, 4))).toEqual({ ok: false, error: 'not the act phase (ready)' });
    const live = run(s0, begin).state;
    expect(apply(live, move(1, 2, 9))).toEqual({ ok: false, error: '(2, 9) is not reachable' });
    expect(apply(live, cast(1, 'basic_weaver', 2, 11))).toEqual({ ok: false, error: '(2, 11) is not a target of basic_weaver' });
    expect(apply(live, cast(1, 'basic_weaver', 2, 2)).ok).toBe(true);
    const moved = run(live, move(1, 3, 3)).state;
    expect(apply(moved, move(1, 3, 4))).toEqual({ ok: false, error: 'already moved' });
  });
});
