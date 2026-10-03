import { expect, test } from 'vitest';
import { createBattle, mulberry32 } from '../engine/index';
import type { MapId } from '../engine/index';
import { endChip, roundHazard, timeline } from './rules';

const empty = (map: MapId) => createBattle({ map, starter: 0, teams: [[], []] }, mulberry32(1));

test('the storm timeline lists each strike line with its rounds', () => {
  expect(timeline(empty('storm'))).toEqual([
    { when: 'Rounds 1, 5, 9…', what: 'The edges: columns 1, 2, 11, 12' },
    { when: 'Rounds 2, 6, 10…', what: 'The center: columns 6, 7' },
    { when: 'Rounds 3, 7, 11…', what: 'The midline: rows 6, 7' },
    { when: 'Rounds 4, 8, 12…', what: 'The backlines: rows 1, 2, 11, 12' },
  ]);
});

test('the crumble timeline counts the tiles that fall each time', () => {
  expect(timeline(empty('span'))).toEqual([
    { when: 'End of round 3', what: 'The side bridges crumble: 12 tiles' },
    { when: 'End of round 5', what: 'The back rows crumble: 20 tiles' },
    { when: 'End of round 7', what: 'The back rows crumble: 20 tiles' },
    { when: 'End of round 9', what: 'The plateaus crumble: 24 tiles' },
  ]);
});

test('the altar chip shows both favors against the goal', () => {
  const s = empty('altar');
  s.favor = [2, 1];
  expect(endChip(s)).toEqual({ icon: '☀', text: 'Blue 2 · Red 1 of 5' });
});

test('the round banner names the coming hazard, and crumble rounds without falls stay quiet', () => {
  expect(roundHazard(empty('storm'), 3)).toBe('⚡ Lightning at round end: the midline');
  expect(roundHazard(empty('span'), 1)).toBe(null);
  expect(endChip(empty('span'))).toBe(null);
  expect(roundHazard(empty('span'), 3)).toBe('⬇ The side bridges crumble: 12 tiles fall at round end');
});
