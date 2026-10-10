import { expect, test } from 'vitest';
import { readMuted, score, writeMuted } from './sound';
import type { Prefs } from './sound';

test('the Astromancer arpeggiates up from its root by semitones and the Bellringer strikes inharmonic partials', () => {
  expect(score('astromancer').map(n => [n.at, n.hz])).toEqual([[0, 659.25], [0.07, 830.6], [0.14, 987.76], [0.21, 1244.5], [0.28, 1318.5], [0.28, 2637]]);
  expect(score('bellringer').map(n => n.hz)).toEqual([110, 220, 264, 330, 440, 924]);
});

test('a note carries a closing lowpass only when its part has one', () => {
  expect(score('weaver')[0]).toEqual({ at: 0, hz: 196, dur: 0.9, gain: 0.2, wave: 'sawtooth', lp: [4200, 260] });
  expect(score('gravecaller')[0]).toEqual({ at: 0, hz: 98, dur: 2.4, gain: 0.34, wave: 'sine' });
});

function memory(): Prefs & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
}
const blocked = (): Prefs => { throw new DOMException('denied', 'SecurityError'); };

test('mute is remembered across reads', () => {
  const s = memory();
  expect(readMuted(() => s)).toBe(false);
  expect(writeMuted(() => s, true)).toBe(true);
  expect(readMuted(() => s)).toBe(true);
  expect(writeMuted(() => s, false)).toBe(true);
  expect(readMuted(() => s)).toBe(false);
});

test('blocked storage reads as sound on and reports the write as lost', () => {
  const s = memory();
  expect(writeMuted(() => s, true)).toBe(true);
  expect(writeMuted(blocked, true)).toBe(false);
  expect(readMuted(blocked)).toBe(false);
  const throwsOnRead: Prefs = { getItem: () => { throw new Error('quota'); }, setItem: () => {} };
  expect(readMuted(() => throwsOnRead)).toBe(false);
});
