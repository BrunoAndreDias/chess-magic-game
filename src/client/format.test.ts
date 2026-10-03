import { describe as suite, expect, test } from 'vitest';
import { createBattle, mulberry32, newMember } from '../engine/index';
import type { BattleEvent, UnitId } from '../engine/index';
import { comboCredit, describe, openingLines, previewLines } from './format';

const s = createBattle({
  map: 'storm', starter: 0,
  teams: [[newMember('warden', 'Aldric'), newMember('wizard', 'Seren'), newMember('cleric', 'Kip')],
    [newMember('rogue', 'Morvath'), newMember('ranger', 'Ysolde'), newMember('cleric', 'Grix')]],
}, mulberry32(1));
const id = (n: number) => n as UnitId;
const line = (e: BattleEvent) => describe(e, s);

suite('describe', () => {
  test('names the round order', () => {
    expect(line({ type: 'round', round: 2, starter: 1, queue: [id(4), id(1), id(5), id(2), id(3), id(6)] }))
      .toEqual({ tone: 'sys', text: 'Round 2: Morvath → Aldric → Ysolde → Seren → Kip → Grix' });
  });
  test('casts name the skill and the target, coloured by the caster', () => {
    expect(line({ type: 'cast', id: id(2), team: 0, skill: 'frostbolt', tx: 1, tz: 9, fx: 1, fz: 2, target: id(4), empowered: true }))
      .toEqual({ tone: 't0', text: 'Seren uses Frostbolt on Morvath, empowered.' });
    expect(line({ type: 'cast', id: id(4), team: 1, skill: 'smokebomb', tx: 1, tz: 9, fx: 1, fz: 9, target: null, empowered: false }))
      .toEqual({ tone: 't1', text: 'Morvath uses Smoke Bomb.' });
  });
  test('damage reads its kind and what the shield took', () => {
    expect(line({ type: 'damage', id: id(4), amount: 18, absorbed: 6, kind: 'fire' })).toEqual({ tone: 't1', text: 'Morvath takes 18 fire damage (6 blocked).' });
    expect(line({ type: 'damage', id: id(1), amount: 12, absorbed: 0, kind: 'phys' })).toEqual({ tone: 't0', text: 'Aldric takes 12 damage.' });
    expect(line({ type: 'damage', id: id(3), amount: 0, absorbed: 9, kind: 'phys' })).toEqual({ tone: 't0', text: "Kip's shield absorbs 9." });
    expect(line({ type: 'damage', id: id(3), amount: 4, absorbed: 0, kind: 'dark' })).toEqual({ tone: 't0', text: 'The dark drains 4 HP from Kip.' });
  });
  test('downs, revives and deaths are system lines', () => {
    expect(line({ type: 'downed', id: id(3), team: 0 })).toEqual({ tone: 'sys', text: 'Kip is DOWNED! Help them up within 2 of their turns.' });
    expect(line({ type: 'revive', id: id(3), by: id(1) })).toEqual({ tone: 'sys', text: 'Kip is back on their feet thanks to Aldric!' });
    expect(line({ type: 'death', id: id(5), team: 1, cause: 'bled' })).toEqual({ tone: 'sys', text: 'Ysolde bleeds out.' });
    expect(line({ type: 'bleed', id: id(5), left: 1 })).toEqual({ tone: 't1', text: 'Ysolde is bleeding out: 1 turn left.' });
  });
  test('statuses use their display names', () => {
    expect(line({ type: 'status', id: id(4), key: 'root' })).toEqual({ tone: 't1', text: 'Morvath is Rooted.' });
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
  test('quiet events produce no line', () => {
    expect(line({ type: 'activate', id: id(1), team: 0, qi: 0 })).toBe(null);
    expect(line({ type: 'move', id: id(1), path: [{ x: 0, z: 0 }, { x: 1, z: 0 }] })).toBe(null);
    expect(line({ type: 'move', id: id(4), path: [{ x: 3, z: 3 }], slide: true })).toBe(null);
  });
  test('pushes say how far', () => {
    expect(line({ type: 'move', id: id(4), path: [{ x: 3, z: 3 }, { x: 3, z: 4 }, { x: 3, z: 5 }], slide: true })).toEqual({ tone: 't1', text: 'Morvath is pushed back 2 tiles.' });
  });
});

suite('combos', () => {
  test('credit the setup and the payoff', () => {
    expect(comboCredit({ type: 'combo', name: 'SHATTER', id: id(4), by: id(3), team: 0, setup: id(2) }, s)).toBe('Seren set it up → Kip pays off: SHATTER!');
    expect(comboCredit({ type: 'combo', name: 'IGNITE', id: null, by: id(2), team: 0, setup: null }, s)).toBe('Seren pays off: IGNITE!');
    expect(comboCredit({ type: 'combo', name: 'PINNED', id: id(1), by: id(5), team: 1, setup: id(5) }, s)).toBe('Ysolde sets it up and pays off: PINNED!');
    expect(line({ type: 'combo', name: 'SHATTER', id: id(4), by: id(3), team: 0, setup: id(2) })).toEqual({ tone: 'combo', text: '⚡ Seren set it up → Kip pays off: SHATTER!' });
  });
});

suite('previewLines', () => {
  test('summarise a predicted cast', () => {
    const ev: BattleEvent[] = [
      { type: 'damage', id: id(4), amount: 40, absorbed: 0, kind: 'phys' },
      { type: 'combo', name: 'SHATTER', id: id(4), by: id(3), team: 0, setup: id(2) },
      { type: 'downed', id: id(4), team: 1 },
      { type: 'activate', id: id(1), team: 0, qi: 0 },
    ];
    expect(previewLines(ev, s).map(l => l.text)).toEqual(['Morvath: −40', '⚡ COMBO: SHATTER', '✖ Morvath goes down']);
  });
});

suite('openingLines', () => {
  test('name the map and each party bonus', () => {
    expect(openingLines(s).map(l => l.text)).toEqual([
      'Storm Court. Order rule: the starting party acts first and last.',
      'Blue party bonuses: Bastion, Hold & Blast, Blessed Elements, Holy Trinity',
      'Red party bonuses: Guiding Light, Pack Tactics, Shadow Mend',
    ]);
  });
});
