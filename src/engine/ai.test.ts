import { describe, expect, test } from 'vitest';
import { aiTurn } from './ai';
import { mulberry32 } from './rng';
import { bare, begin, run, stage, uid, unit } from './testkit';
import type { Command } from './types';

const casts = (cmds: Command[]) => cmds.flatMap(c => (c.kind === 'cast' ? [`${c.skill} ${c.at.x},${c.at.z}`] : []));

describe('ai', () => {
  test('a Gravecaller with a Soul stands a Downed ally up with Last Rites; without one it can\'t', () => {
    const scene = (souls: number) => {
      const s0 = stage({ a: [bare('gravecaller'), bare('bellringer')], b: [bare('bellringer')], place: { 1: [3, 1], 2: [5, 1], 3: [6, 8] }, life: { 2: { kind: 'downed', bleed: 2 } } });
      unit(s0, 1).souls = souls;

      return casts(aiTurn(run(s0, begin).state, mulberry32(1)));
    };

    expect(scene(1)).toContain('lastrites 5,1');
    expect(scene(0)).not.toContain('lastrites 5,1');
  });

  test('a Gravecaller Harvests the Souls in reach', () => {
    const s0 = stage({ a: [bare('gravecaller')], b: [bare('bellringer')], place: { 1: [3, 1], 2: [9, 9] } });
    s0.souls = [{ x: 4, z: 3, t: 3 }, { x: 2, z: 4, t: 3 }];
    const live = run(s0, begin).state;
    const after = run(live, ...aiTurn(live, mulberry32(1))).state;
    expect([unit(after, 1).souls, after.souls]).toEqual([2, []]);
  });

  test('a Bellringer Tolls the enemy standing in its party\'s pending Meteor, so the Meteor lands before it can step out', () => {
    const s0 = stage({
      a: [bare('bellringer'), bare('astromancer'), bare('bellringer')], b: [bare('bellringer'), bare('bellringer'), bare('bellringer')],
      place: { 1: [6, 3], 2: [2, 0], 3: [0, 1], 4: [6, 6], 5: [11, 10], 6: [10, 11] },
    });

    s0.calls = [{ by: uid(2), team: 0, skill: 'meteor', x: 6, z: 6, recall: null }];
    const live = run(s0, begin).state;
    expect(casts(aiTurn(live, mulberry32(1)))).toContain('toll 6,6');
  });
});
