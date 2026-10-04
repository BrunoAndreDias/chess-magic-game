import { expect, test } from 'vitest';
import { mulberry32 } from './rng';

test('same seed gives the same sequence', () => {
  for (const rnd of [mulberry32(42), mulberry32(42)]) expect([rnd(), rnd(), rnd()]).toEqual([0.6011037519201636, 0.44829055899754167, 0.8524657934904099]);
});
