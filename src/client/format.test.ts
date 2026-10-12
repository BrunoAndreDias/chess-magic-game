import { describe as suite, expect, test } from 'vitest';
import { BLEED, COVERAGE, PAIRS, createBattle, mulberry32, newMember } from '../engine/index';
import { uid } from '../engine/testkit';
import type { BattleEvent, BattleState, NodeId, PairId, PartyBonusId } from '../engine/index';
import { callLines, comboCredit, describe, openingLines, previewLines } from './format';

const pathed = (m: ReturnType<typeof newMember>, tree: NodeId[]) => ({ ...m, tree });

const s = createBattle({
  map: 'storm', starter: 0,
  teams: [[newMember('gravecaller', 'Aldric'), newMember('astromancer', 'Seren'), newMember('astromancer', 'Kip')],
    [pathed(newMember('gravecaller', 'Morvath'), ['g_bolt', 'g_reach', 'g_burst', 'g_reap']),
      pathed(newMember('astromancer', 'Ysolde'), ['a_recall', 'a_hp', 'a_cleanse', 'a_benev']),
      pathed(newMember('bellringer', 'Grix'), ['b_hp', 'b_clapper', 'b_guard', 'b_thee'])]],
  deploy: [[{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }], [{ x: 0, z: 11 }, { x: 1, z: 11 }, { x: 2, z: 11 }]],
}, mulberry32(1));

const id = uid;

const line = (e: BattleEvent) => describe(e, s);

suite('describe', () => {
  test('names the round order', () => {
    expect(line({ type: 'round', round: 2, starter: 1, queue: [4, 1, 5, 2, 3, 6].map(n => ({ id: id(n), extra: false })) }))
      .toEqual({ tone: 'sys', text: 'Round 2: Morvath → Aldric → Ysolde → Seren → Kip → Grix' });
  });
  test('casts name the skill and the target, coloured by the caster', () => {
    expect(line({ type: 'cast', id: id(2), team: 0, skill: 'frostbolt', tx: 1, tz: 9, fx: 1, fz: 2, target: id(4) }))
      .toEqual({ tone: 't0', text: 'Seren uses Frostbolt on Morvath.' });
    expect(line({ type: 'cast', id: id(4), team: 1, skill: 'bonewall', tx: 1, tz: 9, fx: 1, fz: 9, target: null }))
      .toEqual({ tone: 't1', text: 'Morvath uses Bone Wall.' });
  });
  test('damage reads its kind and what the shield took', () => {
    expect(line({ type: 'damage', id: id(4), amount: 18, absorbed: 6, kind: 'fire' })).toEqual({ tone: 't1', text: 'Morvath takes 18 fire damage (6 blocked).' });
    expect(line({ type: 'damage', id: id(1), amount: 12, absorbed: 0, kind: 'phys' })).toEqual({ tone: 't0', text: 'Aldric takes 12 damage.' });
    expect(line({ type: 'damage', id: id(3), amount: 0, absorbed: 9, kind: 'phys' })).toEqual({ tone: 't0', text: "Kip's shield absorbs 9." });
    expect(line({ type: 'damage', id: id(3), amount: 4, absorbed: 0, kind: 'dark' })).toEqual({ tone: 't0', text: 'The dark drains 4 HP from Kip.' });
  });
  test('downs, revives and deaths are system lines', () => {
    expect(line({ type: 'downed', id: id(3), team: 0 })).toEqual({ tone: 'sys', text: `Kip is DOWNED! Help them up within ${BLEED} of their turns.` });
    expect(line({ type: 'revive', id: id(3), by: id(1) })).toEqual({ tone: 'sys', text: 'Kip is back on their feet thanks to Aldric!' });
    expect(line({ type: 'death', id: id(5), team: 1, cause: 'bled' })).toEqual({ tone: 'sys', text: 'Ysolde bleeds out.' });
    expect(line({ type: 'bleed', id: id(5), left: 1 })).toEqual({ tone: 't1', text: 'Ysolde is bleeding out: 1 turn left.' });
  });
  test('statuses use their display names', () => {
    expect(line({ type: 'status', id: id(4), key: 'root' })).toEqual({ tone: 't1', text: 'Morvath is Rooted.' });
    expect(line({ type: 'encased', id: id(4) })).toEqual({ tone: 't1', text: 'Morvath is Encased.' });
  });
  test('the end of the battle names the winner and why', () => {
    expect(line({ type: 'over', winner: 0, reason: 'wipe' })).toEqual({ tone: 'sys', text: 'Blue party wins. The other party has nobody left standing.' });
    expect(line({ type: 'over', winner: 'draw', reason: 'mutual' })).toEqual({ tone: 'sys', text: 'Draw. Both parties fell.' });
  });
  test('map rules say what struck, fell or scored', () => {
    expect(line({ type: 'storm', line: 'The midline', tiles: [{ x: 0, z: 5 }] })).toEqual({ tone: 'sys', text: 'Lightning strikes the midline!' });
    expect(line({ type: 'crumble', tiles: [{ x: 1, z: 3 }, { x: 1, z: 4 }] })).toEqual({ tone: 'sys', text: 'The ground gives way: 2 tiles fall into the abyss.' });
    expect(line({ type: 'favor', team: 1, favor: [1, 3] })).toEqual({ tone: 't1', text: 'Red party holds the altar: favor 1–3.' });
    expect(line({ type: 'favor', team: null, favor: [1, 1] })).toBe(null);
    expect(line({ type: 'damage', id: id(1), amount: 36, absorbed: 0, kind: 'storm' })).toEqual({ tone: 't0', text: 'Aldric takes 36 lightning damage.' });
    expect(line({ type: 'death', id: id(4), team: 1, cause: 'fell' })).toEqual({ tone: 'sys', text: 'Morvath is lost to the abyss.' });
    expect(line({ type: 'over', winner: 0, reason: 'altar' })).toEqual({ tone: 'sys', text: 'Blue party wins. The Sun Altar grants them victory.' });
  });
  test('a Call says when it lands, then lands or fizzles', () => {
    expect(line({ type: 'call', id: id(2), team: 0, skill: 'meteor', tiles: [] })).toEqual({ tone: 't0', text: "Meteor is called: it lands at the start of Seren's next turn." });
    expect(line({ type: 'land', id: id(2), skill: 'meteor', x: 5, z: 5, tiles: [], power: 1 })).toEqual({ tone: 't0', text: "Seren's Meteor lands!" });
    expect(line({ type: 'land', id: id(5), skill: 'gravitywell', x: 5, z: 5, tiles: [], power: 0.5 })).toEqual({ tone: 't1', text: "Ysolde's Gravity Well lands at half power!" });
    expect(line({ type: 'land', id: id(5), skill: 'gravitywell', x: 5, z: 5, tiles: [], power: 0.625 })).toEqual({ tone: 't1', text: "Ysolde's Gravity Well lands at 63% power!" });
    expect(line({ type: 'fizzle', id: id(2) })).toEqual({ tone: 't0', text: "Seren's Call fizzles." });
  });
  test('a Gravecaller gathers a Soul or several', () => {
    expect(line({ type: 'gather', id: id(1), from: [{ x: 0, z: 0 }] })).toEqual({ tone: 't0', text: 'Aldric gathers a Soul.' });
    expect(line({ type: 'gather', id: id(4), from: [{ x: 0, z: 0 }, { x: 1, z: 0 }] })).toEqual({ tone: 't1', text: 'Morvath gathers 2 Souls.' });
  });
  test('a queue change reads the new order and marks extra turns', () => {
    expect(line({ type: 'queue', queue: [{ id: id(1), extra: false }, { id: id(4), extra: false }, { id: id(2), extra: true }] }))
      .toEqual({ tone: 'sys', text: 'The order is now Aldric → Morvath → Seren (extra).' });
  });
  test('a Mirror says how much it turned back, or that it turned a debuff back', () => {
    expect(line({ type: 'reflect', id: id(4), to: id(1), amount: 7 })).toEqual({ tone: 't1', text: "Morvath's Mirror turns 7 back on Aldric." });
    expect(line({ type: 'reflect', id: id(4), to: id(1), amount: 0 })).toEqual({ tone: 't1', text: "Morvath's Mirror turns the debuff back on Aldric." });
  });
  test('a broken Doll names the round it reforms, and shattered glass counts its tiles', () => {
    expect(line({ type: 'break', id: id(2), reform: 5 })).toEqual({ tone: 't0', text: 'Seren breaks. It reforms in round 5.' });
    expect(line({ type: 'shatter', tiles: [{ x: 1, z: 1 }] })).toEqual({ tone: 'sys', text: 'The glass shatters: 1 tile.' });
    expect(line({ type: 'shatter', tiles: [{ x: 1, z: 1 }, { x: 2, z: 1 }] })).toEqual({ tone: 'sys', text: 'The glass shatters: 2 tiles.' });
  });
  test('pushes say how far; walks and slides that go nowhere stay quiet', () => {
    expect(line({ type: 'move', id: id(4), path: [{ x: 3, z: 3 }, { x: 3, z: 4 }, { x: 3, z: 5 }], slide: true })).toEqual({ tone: 't1', text: 'Morvath is pushed back 2 tiles.' });
    expect(line({ type: 'move', id: id(4), path: [{ x: 3, z: 3 }], slide: true })).toBe(null);
    expect(line({ type: 'move', id: id(1), path: [{ x: 0, z: 0 }, { x: 1, z: 0 }] })).toBe(null);
  });
});

suite('combos', () => {
  test('credit the setup and the payoff', () => {
    expect(comboCredit({ type: 'combo', name: 'FREEZE', id: id(4), by: id(3), team: 0, setup: id(2) }, s)).toBe('Seren set it up → Kip pays off: FREEZE!');
    expect(comboCredit({ type: 'combo', name: 'IGNITE', id: null, by: id(2), team: 0, setup: null }, s)).toBe('Seren pays off: IGNITE!');
    expect(comboCredit({ type: 'combo', name: 'SLAM', id: id(1), by: id(5), team: 1, setup: id(5) }, s)).toBe('Ysolde sets it up and pays off: SLAM!');
    expect(line({ type: 'combo', name: 'FREEZE', id: id(4), by: id(3), team: 0, setup: id(2) })).toEqual({ tone: 'combo', text: '⚡ Seren set it up → Kip pays off: FREEZE!' });
  });
});

suite('previewLines', () => {
  test('summarise a predicted cast', () => {
    const ev: BattleEvent[] = [
      { type: 'damage', id: id(4), amount: 40, absorbed: 0, kind: 'phys' },
      { type: 'combo', name: 'FREEZE', id: id(4), by: id(3), team: 0, setup: id(2) },
      { type: 'downed', id: id(4), team: 1 },
      { type: 'activate', id: id(1), team: 0, qi: 0 },
    ];

    expect(previewLines(ev, s).map(l => l.text)).toEqual(['Morvath: −40', '⚡ COMBO: FREEZE', '✖ Morvath goes down']);
  });
});

suite('openingLines', () => {
  const pair = (p: PairId) => PAIRS.find(x => x.id === p)?.name;
  test('list a party\'s bonuses in table order with Role Coverage last, and say none when it has none', () => {
    const st: BattleState = { ...s, party: [new Set<PartyBonusId>(['coverage', 'conjunction', 'seconddawn']), new Set<PartyBonusId>()] };
    expect(openingLines(st).slice(1).map(l => l.text)).toEqual([
      `Blue party bonuses: ${pair('seconddawn')}, ${pair('conjunction')}, ${COVERAGE.name}`,
      'Red party bonuses: none',
    ]);
  });
});

suite('callLines', () => {
  const at = (moves: Record<number, [number, number]>, benevolent = false): BattleState => ({
    ...s,
    units: s.units.map(u => {
      const m = moves[u.id];
      const v = m ? { ...u, x: m[0], z: m[1] } : u;

      return v.id === 2 && benevolent ? { ...v, mods: { ...v.mods, benevolent: 1 } } : v;
    }),
  });

  const seren = (st: BattleState) => st.units.find(u => u.id === 2)!;

  test('a Meteor warns of friendly fire and names the enemies in its area', () => {
    const st = at({ 1: [5, 5], 4: [6, 6], 5: [9, 9] });
    expect(callLines(st, seren(st), 'meteor', 5, 5).map(l => l.text)).toEqual([
      "Lands at the start of Seren's next turn.",
      '⚠ Aldric: ally in the area, friendly fire',
      'Morvath: in the area now',
    ]);
  });
  test('Benevolent Heavens heals the allies in the area, and an empty area says so', () => {
    const st = at({ 1: [5, 5] }, true);
    expect(callLines(st, seren(st), 'thunderhead', 5, 5)[1]).toEqual({ tone: 't0', text: 'Aldric: ally, healed instead (Benevolent Heavens)' });
    expect(callLines(st, seren(st), 'thunderhead', 8, 5).map(l => l.text)).toEqual(["Lands at the start of Seren's next turn.", 'Nobody stands there yet.']);
  });
  test('Recall names the ally it will bring back', () => {
    expect(callLines(s, seren(s), 'recall', 0, 0)[1]).toEqual({ tone: 't0', text: 'Aldric snaps back to this tile and regains the HP it lost.' });
  });
});
