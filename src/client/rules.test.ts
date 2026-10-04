import { expect, test } from 'vitest';
import { MAPS, MAX_ROUNDS, createBattle, idx, mulberry32, threatName } from '../engine/index';
import type { BattleState, MapId } from '../engine/index';
import { endChip, roundHazard, stormSteps, timeline } from './rules';

const empty = (map: MapId) => createBattle({ map, starter: 0, teams: [[], []] }, mulberry32(1));

/** The Span with every tile solid but (0, 0) and (1, 0), so exactly those two can fall, at the round row 0 crumbles. */
function twoTiles(): { s: BattleState; round: number } {
  const s = empty('span');
  s.terr = s.terr.map(() => '#');
  s.terr[idx(0, 0)] = '.';
  s.terr[idx(1, 0)] = '.';
  const round = Array.from({ length: MAX_ROUNDS }, (_, i) => i + 1).find(r => threatName(s, r) !== null);
  if (round === undefined) throw new Error('row 0 of the Span never falls');
  return { s, round };
}

test('a storm cycle lists each line\'s first three rounds and its columns and rows counted from 1', () => {
  expect(stormSteps([{ name: 'West', cols: [0, 4] }, { name: 'Cross', cols: [11], rows: [2] }])).toEqual([
    { when: 'Rounds 1, 3, 5…', what: 'West: columns 1, 5' },
    { when: 'Rounds 2, 4, 6…', what: 'Cross: columns 12, rows 3' },
  ]);
});

test('the crumble timeline counts the tiles that fall, from the current round on, and skips rounds where nothing falls', () => {
  const { s, round } = twoTiles();
  expect(timeline(s)).toEqual([{ when: `End of round ${round}`, what: `${threatName(s, round)}: 2 tiles` }]);
  s.round = round + 1;
  expect(timeline(s)).toEqual([]);
});

test('the round banner and the end chip name what falls, and stay quiet on a round where nothing does', () => {
  const { s, round } = twoTiles();
  expect(roundHazard(s, round)).toBe(`⬇ ${threatName(s, round)}: 2 tiles fall at round end`);
  expect(roundHazard(s, round + 1)).toBe(null);
  s.round = round;
  expect(endChip(s)).toEqual({ icon: '⬇', text: '2 tiles fall' });
  s.round = round + 1;
  expect(endChip(s)).toBe(null);
});

test('the altar chip shows both favors against the goal', () => {
  const s = empty('altar'), rule = MAPS.altar.rule;
  if (rule.kind !== 'altar') throw new Error('the Sun Altar has an altar rule');
  s.favor = [2, 1];
  expect(endChip(s)).toEqual({ icon: '☀', text: `Blue 2 · Red 1 of ${rule.goal}` });
});
