import type { ClassId } from '../engine/index';

/** One synthesized tone: an oscillator `at` seconds in, rising to `gain` and decaying to silence over `dur`. */
export interface Note {
  at: number;
  hz: number;
  dur: number;
  gain: number;
  wave: OscillatorType;
  /** A lowpass that closes from the first cutoff to the second over the note: a plucked string's brightness dying away. */
  lp?: readonly [number, number];
}

/** A class's lock sound: tones on a root, each placed by a frequency ratio or by semitones above the root. */
interface Voice {
  root: number;
  parts: readonly ({ at: number; dur: number; gain: number; wave: OscillatorType; lp?: readonly [number, number] } & ({ ratio: number } | { step: number }))[];
}

/** Sustained bell partials are inharmonic: hum, prime, minor-third tierce, quint, nominal, and a short clang above. */
const VOICES: Readonly<Record<ClassId, Voice>> = {
  bellringer: { root: 220, parts: [
    { ratio: 0.5, at: 0, dur: 2.6, gain: 0.22, wave: 'sine' },
    { ratio: 1, at: 0, dur: 2.0, gain: 0.3, wave: 'sine' },
    { ratio: 1.2, at: 0, dur: 1.5, gain: 0.16, wave: 'sine' },
    { ratio: 1.5, at: 0, dur: 1.2, gain: 0.1, wave: 'sine' },
    { ratio: 2, at: 0, dur: 1.1, gain: 0.14, wave: 'sine' },
    { ratio: 4.2, at: 0, dur: 0.18, gain: 0.08, wave: 'triangle' },
  ] },
  gravecaller: { root: 98, parts: [
    { ratio: 1, at: 0, dur: 2.4, gain: 0.34, wave: 'sine' },
    { ratio: 2.76, at: 0.01, dur: 1.4, gain: 0.14, wave: 'sine' },
    { ratio: 5.4, at: 0.01, dur: 0.7, gain: 0.06, wave: 'sine' },
    { ratio: 1.5, at: 0.32, dur: 1.8, gain: 0.12, wave: 'triangle', lp: [900, 200] },
  ] },
  astromancer: { root: 659.25, parts: [
    { step: 0, at: 0, dur: 0.9, gain: 0.14, wave: 'sine' },
    { step: 4, at: 0.07, dur: 0.9, gain: 0.13, wave: 'sine' },
    { step: 7, at: 0.14, dur: 1.0, gain: 0.12, wave: 'sine' },
    { step: 11, at: 0.21, dur: 1.1, gain: 0.11, wave: 'sine' },
    { step: 12, at: 0.28, dur: 1.4, gain: 0.12, wave: 'triangle' },
    { step: 24, at: 0.28, dur: 0.8, gain: 0.04, wave: 'sine' },
  ] },
  weaver: { root: 196, parts: [
    { step: 0, at: 0, dur: 0.9, gain: 0.2, wave: 'sawtooth', lp: [4200, 260] },
    { step: 7, at: 0.09, dur: 0.8, gain: 0.13, wave: 'sawtooth', lp: [3600, 240] },
    { step: 12, at: 0.18, dur: 1.1, gain: 0.1, wave: 'triangle', lp: [3000, 300] },
  ] },
};

const round2 = (x: number): number => Math.round(x * 100) / 100;

/** The notes of `cls`'s lock sound, in hertz. */
export function score(cls: ClassId): Note[] {
  const v = VOICES[cls];
  return v.parts.map(p => ({
    at: p.at, dur: p.dur, gain: p.gain, wave: p.wave, ...(p.lp ? { lp: p.lp } : {}),
    hz: round2(v.root * ('ratio' in p ? p.ratio : 2 ** (p.step / 12))),
  }));
}

/** The slice of `Storage` the mute preference needs. `store` may throw (blocked site data, a sandbox), so every access is guarded. */
export interface Prefs { getItem(key: string): string | null; setItem(key: string, value: string): void }
const MUTE_KEY = 'party-tactics.muted';

export function readMuted(store: () => Prefs): boolean {
  try { return store().getItem(MUTE_KEY) === '1'; } catch { return false; }
}

/** Remembers the choice; false when it could not be stored. */
export function writeMuted(store: () => Prefs, muted: boolean): boolean {
  try { store().setItem(MUTE_KEY, muted ? '1' : '0'); return true; } catch { return false; }
}

const local = (): Prefs => window.localStorage;
let ctx: AudioContext | null = null;
let muted = readMuted(local);

export const isMuted = (): boolean => muted;
export function setMuted(on: boolean): void {
  muted = on;
  writeMuted(local, on);
}

/** Plays `cls`'s lock sound. Silent until the player has interacted with the page, since browsers refuse audio before that. */
export function playLock(cls: ClassId): void {
  if (muted || !navigator.userActivation?.hasBeenActive) return;
  ctx ??= new AudioContext();
  void ctx.resume();
  const ac = ctx, t0 = ac.currentTime + 0.02, out = ac.createDynamicsCompressor();
  out.connect(ac.destination);
  for (const n of score(cls)) {
    const t = t0 + n.at, osc = ac.createOscillator(), env = ac.createGain();
    osc.type = n.wave;
    osc.frequency.value = n.hz;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(n.gain, t + 0.006);
    env.gain.exponentialRampToValueAtTime(1e-4, t + n.dur);
    let tail: AudioNode = osc;
    if (n.lp) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(n.lp[0], t);
      f.frequency.exponentialRampToValueAtTime(n.lp[1], t + n.dur);
      tail.connect(f);
      tail = f;
    }
    tail.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + n.dur + 0.05);
  }
}
