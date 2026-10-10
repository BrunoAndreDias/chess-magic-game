import { expect, test } from 'vitest';
import { castAt, lockBeat } from './beat';

test('the figure crouches, springs, turns and lands while the camera pushes in and the flare fades', () => {
  expect(lockBeat(0, false)).toEqual({ push: 0, flare: 0, lift: 0, spin: 0, squash: 1 });
  expect(lockBeat(0.06, false)).toEqual({ push: 0.349, flare: 0.5, lift: 0, spin: 0, squash: 0.96 });
  expect(lockBeat(0.31, false)).toEqual({ push: 0.97, flare: 0.544, lift: 0.22, spin: 0.884, squash: 1 });
  expect(lockBeat(0.57, false)).toEqual({ push: 1, flare: 0.237, lift: 0, spin: 6, squash: 0.95 });
  expect(lockBeat(1.325, false)).toEqual({ push: 0.5, flare: 0.021, lift: 0, spin: 6.283, squash: 1 });
  expect(lockBeat(1.6, false)).toEqual({ push: 0, flare: 0, lift: 0, spin: 0, squash: 1 });
});

test('reduced motion keeps the camera and figure still and only dims the flare', () => {
  expect(lockBeat(0.31, true)).toEqual({ push: 0, flare: 0.327, lift: 0, spin: 0, squash: 1 });
  expect(lockBeat(0.31, false).push).toBe(0.97);
});

test('a cast clip starts so its strike lands with the beat, fades over idle, and stays idle under reduced motion', () => {
  const clip = { length: 0.75, strike: 0.25 };

  expect([0.1, 0.3, 0.5, 0.95].map(t => castAt(t, clip, false))).toEqual([
    { time: 0, weight: 0 }, { time: 0.05, weight: 0.5 }, { time: 0.25, weight: 1 }, { time: 0.7, weight: 0.5 },
  ]);
  expect(castAt(0.5, { length: 1, strike: 0.8 }, false)).toEqual({ time: 0.5, weight: 1 });
  expect([castAt(0.5, clip, true), castAt(1.6, clip, false), castAt(-0.1, clip, false)]).toEqual([null, null, null]);
});
