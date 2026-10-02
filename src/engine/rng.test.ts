import { expect, test } from 'vitest';
import { mulberry32 } from './rng';

test('same seed gives the same sequence', () => {
  const a = mulberry32(42), b = mulberry32(42);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
  expect(seqA).toEqual(seqB);
  expect(seqA[0]).toBeCloseTo(0.6011037519201636, 12);
});
