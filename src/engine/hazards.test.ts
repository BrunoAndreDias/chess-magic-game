import { describe, expect, test } from 'vitest';
import { doomed, threatName } from './hazards';
import { MAPS, WET_SHOCK } from './tables';
import { bare, begin, cast, end, run, stage, unit } from './testkit';
import type { BattleEvent } from './types';

/** From the first event of `type` through the end of the round, leaving out the next round's opening. */
const after = (events: BattleEvent[], type: BattleEvent['type']) => {
  const end = events.findIndex(e => e.type === 'roundEnd');
  return events.slice(events.findIndex(e => e.type === type), end < 0 ? undefined : end + 1);
};

const storm = MAPS.storm.rule, altar = MAPS.altar.rule;
if (storm.kind !== 'storm' || altar.kind !== 'altar') throw new Error('the Storm Court and the Sun Altar keep their rules');

describe('storm', () => {
  const dmg = storm.dmg, wet = Math.round(dmg * WET_SHOCK);

  test('the round-1 strike hits the edge columns: its damage, more when Wet, and it finishes the Downed', () => {
    const s0 = stage({
      a: [bare('weaver'), bare('weaver'), bare('weaver')], b: [bare('weaver'), bare('weaver')],
      place: { 1: [0, 2], 2: [10, 3], 3: [2, 0], 4: [5, 9], 5: [11, 8] }, life: { 5: { kind: 'downed', bleed: 2 } },
    });
    expect(threatName(s0)).toBe('The edges');
    const r = run(s0, begin, end(1), end(4), end(2), end(3));
    const [strike, ...rest] = after(r.events, 'storm');
    expect(strike?.type === 'storm' && [strike.line, strike.tiles.length]).toEqual(['The edges', 48]);
    expect(rest).toEqual([
      { type: 'damage', id: 1, amount: dmg, absorbed: 0, kind: 'storm' },
      { type: 'soul', x: 0, z: 2 },
      { type: 'damage', id: 2, amount: wet, absorbed: 0, kind: 'storm' },
      { type: 'soul', x: 10, z: 3 },
      { type: 'death', id: 5, team: 1, cause: 'finished' },
      { type: 'roundEnd', round: 1, burnt: [] },
    ]);
    expect([1, 2, 3, 4].map(id => unit(r.state, id).hp)).toEqual([170 - dmg, 170 - wet, 170, 170]);

    const r2 = run(r.state, end(1), end(4), end(2), end(3));
    const [strike2, ...rest2] = after(r2.events, 'storm');
    expect(strike2?.type === 'storm' && strike2.line).toBe('The center');
    expect(rest2).toEqual([{ type: 'damage', id: 4, amount: dmg, absorbed: 0, kind: 'storm' }, { type: 'soul', x: 5, z: 9 }, { type: 'roundEnd', round: 2, burnt: [] }]);
  });
});

describe('crumble', () => {
  test('at the end of round 3 the side bridges fall: the standing are Downed, the Downed are lost', () => {
    const s0 = stage({
      map: 'span', round: 3, a: [bare('weaver'), bare('astromancer')], b: [bare('weaver'), bare('astromancer')],
      place: { 1: [1, 4], 2: [5, 2], 3: [10, 6], 4: [6, 9] }, life: { 3: { kind: 'downed', bleed: 2 } },
    });
    expect(threatName(s0)).toBe('The side bridges crumble');
    const r = run(s0, begin, end(1), end(4), end(2));
    const [fall, ...rest] = after(r.events, 'crumble');
    expect(fall?.type === 'crumble' && fall.tiles.length).toBe(12);
    expect(rest).toEqual([
      { type: 'fall', id: 1, x: 1, z: 2 },
      { type: 'downed', id: 1, team: 0 },
      { type: 'soul', x: 1, z: 2 },
      { type: 'death', id: 3, team: 1, cause: 'fell' },
      { type: 'roundEnd', round: 3, burnt: [] },
    ]);
    expect([1, 3, 6, 10].map(x => r.state.terr[4 * 12 + x])).toEqual(['o', '.', '.', 'o']);
  });

  test('a fall that leaves a party nobody standing ends the battle', () => {
    const s0 = stage({ map: 'span', round: 3, a: [bare('weaver')], b: [bare('weaver')], place: { 1: [5, 2], 2: [1, 5] } });
    const r = run(s0, begin, end(1), end(2));
    expect(after(r.events, 'crumble').slice(1)).toEqual([
      { type: 'fall', id: 2, x: 3, z: 5 },
      { type: 'downed', id: 2, team: 1 },
      { type: 'soul', x: 3, z: 5 },
      { type: 'over', winner: 0, reason: 'wipe' },
    ]);
  });
});

describe('altar', () => {
  const hold = (place: Record<number, [number, number]>, favor: [number, number] = [0, 0]) => {
    const s0 = stage({ map: 'altar', a: [bare('astromancer'), bare('weaver')], b: [bare('astromancer'), bare('weaver')], place });
    s0.favor = favor;
    return run(s0, begin, end(1), end(3), end(4), end(2));
  };

  test('the party with more standing on the altar gains favor; a tie gains nothing', () => {
    const more = hold({ 1: [5, 5], 2: [6, 5], 3: [5, 6], 4: [9, 9] });
    expect(after(more.events, 'favor')).toEqual([{ type: 'favor', team: 0, favor: [1, 0] }, { type: 'roundEnd', round: 1, burnt: [] }]);
    const tie = hold({ 1: [5, 5], 2: [2, 2], 3: [5, 6], 4: [9, 9] }, [2, 1]);
    expect(after(tie.events, 'favor')[0]).toEqual({ type: 'favor', team: null, favor: [2, 1] });
  });

  test('the favor that reaches the goal wins the battle', () => {
    const goal = altar.goal, r = hold({ 1: [2, 2], 2: [3, 2], 3: [5, 6], 4: [9, 9] }, [goal - 2, goal - 1]);
    expect(after(r.events, 'favor')).toEqual([{ type: 'favor', team: 1, favor: [goal - 2, goal] }, { type: 'over', winner: 1, reason: 'altar' }]);
    expect(r.state.phase).toEqual({ kind: 'over', winner: 1, reason: 'altar' });
  });
});

describe('doomed', () => {
  test('a Rooted unit on a strike line is doomed; one that still has its turn is not', () => {
    const s0 = stage({ a: [bare('weaver')], b: [bare('astromancer')], starter: 1, place: { 1: [0, 5], 2: [4, 5] } });
    const live = run(s0, begin).state;
    expect(doomed(live, unit(live, 1))).toBe(false);
    const pinned = run(live, cast(2, 'frostbolt', 0, 5)).state;
    expect(doomed(pinned, unit(pinned, 1))).toBe(true);
  });
});
