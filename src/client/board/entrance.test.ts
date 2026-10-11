import { expect, test } from 'vitest';
import { bare, stage, uid } from '../../engine/testkit';
import { ENTRANCE, arrivals } from './entrance';
import type { Arrival } from './entrance';

const WHO: readonly Arrival[] = ['astromancer', 'gravecaller', 'bellringer', 'marionettist', 'mirrormime', 'doll'];

test('every entrance ends exactly at rest on its tile, and starts away from it', () => {
  const rest = { y: 0, spin: 0, sx: 1, sy: 1, sz: 1, shown: true };

  for (const who of WHO) {
    const e = ENTRANCE[who];
    expect([who, e.pose(e.sec), e.pose(e.sec + 1)]).toEqual([who, rest, rest]);
    expect([who, e.pose(0)]).not.toEqual([who, rest]);
  }
});

test('units arrive in the first round\'s turn order, each Doll just after its Marionettist, and a broken Doll stays away', () => {
  const s = stage({ a: [bare('marionettist'), bare('astromancer')], b: [bare('mirrormime'), bare('bellringer')], starter: 1 });
  const doll = s.units.find(u => u.owner === uid(1))!.id;
  const plan = (st: typeof s) => arrivals(st).map(a => [a.id, a.who, +a.at.toFixed(2)]);

  expect(plan(s)).toEqual([[uid(3), 'mirrormime', 0], [uid(1), 'marionettist', 0.35], [doll, 'doll', 0.8], [uid(2), 'astromancer', 0.7], [uid(4), 'bellringer', 1.05]]);

  const broken = stage({ a: [bare('marionettist')], b: [bare('mirrormime')], starter: 0 });
  broken.units.find(u => u.owner === uid(1))!.life = { kind: 'dead' };
  expect(plan(broken)).toEqual([[uid(1), 'marionettist', 0], [uid(2), 'mirrormime', 0.35]]);
});
