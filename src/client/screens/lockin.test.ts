import { expect, test } from 'vitest';
import { CLASS_ORDER } from '../../engine/index';
import { clipAt, due, LOCK_IN } from './lockin';
import type { Cue, Moment } from './lockin';

const still = { y: 0, spin: 0, roll: 0, sx: 1, sy: 1, sz: 1 };

const deg = (r: number): number => (r * 180) / Math.PI;

/** How far the camera looks up from level, in degrees. */
const pitch = (m: Moment): number => deg(Math.atan2(m.cam.at[1] - m.cam.from[1], Math.hypot(m.cam.at[0] - m.cam.from[0], m.cam.at[2] - m.cam.from[2])));

test('the Bellringer\'s camera steps in on each toll rather than pushing smoothly, and the third toll rings hardest', () => {
  const k = (t: number) => LOCK_IN.bellringer.moment(t, false).cam.k;

  expect([0.2, 0.5, 0.6, 0.8, 1.2].map(k)).toEqual([0, 0.333, 0.333, 0.667, 1]);
  expect([0.39, 0.74, 1.09].map(t => LOCK_IN.bellringer.moment(t, false).flare)).toEqual([0.45, 0.65, 1]);
});

test('the Astromancer levitates looking up at the sky, and the star\'s landing squashes it and levels the camera', () => {
  const m = (t: number) => LOCK_IN.astromancer.moment(t, false);

  expect([m(0.75).body, m(1.05).body]).toEqual([{ ...still, y: 0.35 }, { ...still, sx: 1.09, sy: 0.82, sz: 1.09 }]);
  expect([pitch(m(0.6)) > 15, pitch(m(1.4)) < 10]).toEqual([true, true]);
});

test('the Marionettist hangs on its strings, falls and lands squashed', () => {
  const body = (t: number) => LOCK_IN.marionettist.moment(t, false).body;

  expect([body(0.3).y, body(1.2).y, body(1.42).y]).toEqual([0, 0.75, 0.587]);
  expect(body(1.5)).toEqual({ ...still, sx: 1.1, sy: 0.8, sz: 1.1 });
});

test('the Mirrormime\'s camera circles 70 degrees around it at one height', () => {
  const [a, b] = [0, 1.9].map(t => LOCK_IN.mirrormime.moment(t, false).cam.from);
  const yaw = (p: readonly number[]) => Math.atan2(p[0]!, p[2]! - 1.5);

  expect([Math.round(deg(yaw(b!) - yaw(a!))), a![1], b![1]]).toEqual([70, 1.7, 1.7]);
});

test('reduced motion keeps the camera at rest and the body still, and only changes the flare and the camp', () => {
  expect(LOCK_IN.astromancer.moment(0.6, true)).toEqual({
    cam: { from: [0, 3.1, 7.6], at: [0, 0.85, 0.2], k: 0 }, body: still, flare: 0.25, shake: 0, mood: { dark: 0.8, fire: 1 },
  });
  expect(LOCK_IN.astromancer.moment(0.6, false).cam.k).toBe(1);

  for (const cls of CLASS_ORDER) {
    const m = LOCK_IN[cls].moment(1.06, true);
    expect([cls, m.cam.k, m.body, m.shake]).toEqual([cls, 0, still, 0]);
  }
});

test('every lock-in is back at rest by its end, so the hold ends without a jump', () => {
  for (const cls of CLASS_ORDER) {
    const m = LOCK_IN[cls].moment(LOCK_IN[cls].sec - 0.001, false);
    expect([cls, m.cam.k, m.body, m.flare, m.shake, m.mood]).toEqual([cls, 0, still, 0, 0, { dark: 0, fire: 0 }]);
  }
});

test('every class\'s cues are in time order and inside its lock-in', () => {
  for (const cls of CLASS_ORDER) {
    const at = LOCK_IN[cls].cues.map(c => c.at);
    expect([cls, at.every(t => t < LOCK_IN[cls].sec), at]).toEqual([cls, true, [...at].sort((x, y) => x - y)]);
  }
});

test('the Gravecaller goes down, stays down on the clip\'s last frame, then cuts straight into its rise', () => {
  const acts = new Map([['down', { length: 0.5, strike: 0.4 }], ['rise', { length: 0.6, strike: 0.3 }]]);
  const at = (t: number) => clipAt(LOCK_IN.gravecaller, t, acts, false);

  expect([at(0.02), at(0.1), at(0.8), at(1.3), at(1.72)]).toEqual([
    null,
    { name: 'down', time: 0.05, weight: 0.5 },
    { name: 'down', time: 0.5, weight: 1 },
    { name: 'rise', time: 0.15, weight: 1 },
    { name: 'rise', time: 0.57, weight: 0.3 },
  ]);
  expect([clipAt(LOCK_IN.gravecaller, 0.8, acts, true), clipAt(LOCK_IN.gravecaller, 0.8, new Map([['cast', { length: 1, strike: 0.5 }]]), false)]).toEqual([null, null]);
});

test('the Bellringer strikes its last toll with the toll clip, or with cast on a figure without one', () => {
  const cast = { length: 0.75, strike: 0.4 };

  expect(clipAt(LOCK_IN.bellringer, 1.05, new Map([['toll', { length: 1.333, strike: 0.875 }], ['cast', cast]]), false)).toEqual({ name: 'toll', time: 0.875, weight: 1 });
  expect(clipAt(LOCK_IN.bellringer, 1.05, new Map([['cast', cast]]), false)).toEqual({ name: 'cast', time: 0.4, weight: 1 });
});

test('a cue plays once, even when one slow frame jumps past several', () => {
  const cues: Cue[] = [0, 0.5, 0.9].map(at => ({ at, play: () => {} }));

  expect(due(cues, 0, 1.2)).toEqual(cues);
  expect(due(cues, 3, 1.5)).toEqual([]);
  expect(due(cues, 1, 0.6)).toEqual([cues[1]]);
});
