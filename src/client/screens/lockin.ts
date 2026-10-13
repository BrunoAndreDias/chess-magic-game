import * as THREE from 'three';
import type { ClassId } from '../../engine/index';
import { clipFor, weightAt } from '../board/acts';
import type { Act, ActClip } from '../board/acts';
import type { Fx } from '../board/fx';
import type { Mood } from './camp';

export type V3 = readonly [number, number, number];

/** A camera: where it stands and what it looks at. */
export interface Shot { from: V3; at: V3 }

/** The lineup's resting camera. A lock-in's shot is blended from it. */
export const HOME: Shot = { from: [0, 3.1, 7.6], at: [0, 0.85, 0.2] };

/** The front spot every shot frames: the selected figure stands here, facing +z. */
export const FRONT = { x: 0, z: 1.5, scale: 1.3 };

/** The body's offset from its resting pose: metres up, radians turned and swayed side to side, and its scale. */
export interface Body { y: number; spin: number; roll: number; sx: number; sy: number; sz: number }

/** A lock-in `t` seconds in. */
export interface Moment {
  /** The shot, and how far the camera has come from `HOME` to it: 0 at rest, 1 on the shot. */
  cam: Shot & { k: number };
  body: Body;
  /** The class-glow burst around the figure, 0 to 1. */
  flare: number;
  /** How hard the camera shakes, 0 to 1. */
  shake: number;
  mood: Mood;
}

/** An action clip, started so its strike lands `strike` seconds into the lock-in. `hold` keeps its last frame until the next play. */
export interface Play { act: Act; strike: number; hold?: boolean }

/** What a cue may touch: the lineup's effects, the front figure's feet, its head and hands in the world, and the lock-in's clock. */
export interface LockCtx { fx: Fx; feet: THREE.Vector3; ties: () => THREE.Vector3[]; t: () => number }

/** A one-off effect `at` seconds in. */
export interface Cue { at: number; play: (s: LockCtx) => void }

export interface LockIn {
  sec: number;
  /** The moment `t` seconds in. Reduced motion keeps the camera, body and clips at rest and only changes light and mood. */
  moment: (t: number, reduced: boolean) => Moment;
  plays: readonly Play[];
  /** In time order. */
  cues: readonly Cue[];
}

const BODY: Body = { y: 0, spin: 0, roll: 0, sx: 1, sy: 1, sz: 1 };

/** No lock-in running. */
export const REST: Moment = { cam: { ...HOME, k: 0 }, body: BODY, flare: 0, shake: 0, mood: { dark: 0, fire: 0 } };

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

const seg = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));

const easeInOut = (x: number): number => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);

/** 0 to 1 over `a` to `b`, eased at both ends. */
const ramp = (t: number, a: number, b: number): number => easeInOut(seg(t, a, b));

/** Rises over `a` to `b`, holds, and falls back over `c` to `d`. */
const span = (t: number, a: number, b: number, c: number, d: number): number => ramp(t, a, b) * (1 - ramp(t, c, d));

/** A blow at `at`: up to 1 within 40 ms, then dying away to nothing over `fall` seconds. */
const blow = (t: number, at: number, fall: number): number => (t < at ? 0 : t < at + 0.04 ? (t - at) / 0.04 : (1 - seg(t, at + 0.04, at + 0.04 + fall)) ** 2);

const mix = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

/** A body squashed by `amount`, springing back to 1 by `k` 1. A negative amount stretches. */
function squash(k: number, amount: number): Pick<Body, 'sx' | 'sy' | 'sz'> {
  const d = amount * (1 - k) ** 2;

  return { sx: 1 + d / 2, sy: 1 - d, sz: 1 + d / 2 };
}

/** A body hitting the ground at `at`, squashed by `amount` and springing back over the next 0.3 s. */
const landing = (t: number, at: number, amount: number): Pick<Body, 'sx' | 'sy' | 'sz'> => squash(seg(t, at, at + 0.3), t >= at ? amount : 0);

const r3 = (x: number): number => Math.round(x * 1000) / 1000 + 0;

const tidy = (m: Moment): Moment => ({
  cam: { from: [r3(m.cam.from[0]), r3(m.cam.from[1]), r3(m.cam.from[2])], at: [r3(m.cam.at[0]), r3(m.cam.at[1]), r3(m.cam.at[2])], k: r3(m.cam.k) },
  body: { y: r3(m.body.y), spin: r3(m.body.spin), roll: r3(m.body.roll), sx: r3(m.body.sx), sy: r3(m.body.sy), sz: r3(m.body.sz) },
  flare: r3(m.flare),
  shake: r3(m.shake),
  mood: { dark: r3(m.mood.dark), fire: r3(m.mood.fire) },
});

/** Lets each moment stop caring about its ends and about reduced motion: outside `sec` every lock-in is exactly at rest. */
function lockIn(sec: number, plays: readonly Play[], cues: readonly Cue[], at: (t: number) => Moment): LockIn {
  return {
    sec, plays, cues,
    moment: (t, reduced) => {
      if (t < 0 || t >= sec) return REST;
      const m = at(t);

      return tidy(reduced ? { ...REST, flare: m.flare, mood: m.mood } : m);
    },
  };
}

/** A clip the figure shows: its frame, in seconds, and its blend over idle. */
export interface Shown { name: string; time: number; weight: number }

/**
 * Which clip of `lock` the figure shows `t` seconds in, at what frame and blend, among the clips in `acts`. A play the
 * figure has no clip for (after `clipFor`'s fallbacks) is skipped, leaving the body's procedural motion. Null before
 * the first play, outside the lock-in and under reduced motion.
 */
export function clipAt(lock: LockIn, t: number, acts: ReadonlyMap<string, ActClip>, reduced: boolean): Shown | null {
  if (reduced || t < 0 || t >= lock.sec) return null;
  let shown: Shown | null = null;

  for (const p of lock.plays) {
    const name = clipFor(acts, p.act), clip = name === null ? undefined : acts.get(name);

    if (name === null || !clip) continue;
    const start = p.strike - clip.strike;

    if (t < start) break;
    const cut: boolean = shown !== null && shown.weight > 0, time = Math.min(t - start, clip.length);
    shown = { name, time: r3(time), weight: r3(weightAt(time, clip.length, cut, p.hold ?? false)) };
  }

  return shown;
}

/** The cues that come due by `t` after the first `fired` have played: each plays once, even when one frame jumps past several. */
export function due(cues: readonly Cue[], fired: number, t: number): readonly Cue[] {
  let n = fired;

  while (n < cues.length && cues[n]!.at <= t) n++;

  return cues.slice(fired, n);
}

const STAR = 0xfff1c0, CALL = 0xb48cff, GHOST = 0x7dffb2, BELL = 0xe8b65a, GLASS = 0xdff4ff, THREAD = 0xf6ecd2;

const up = (feet: THREE.Vector3, y: number): THREE.Vector3 => feet.clone().setY(feet.y + y);

/** The Astromancer's star is called on its `cast` strike and lands on the sigil this much later. */
const STAR_CALL = 0.75, STAR_LAND = 1.05;

/** The Bellringer's tolls, the last on its `toll` clip's strike, and how hard each rings. */
const TOLLS = [{ at: 0.35, size: 0.45 }, { at: 0.7, size: 0.65 }, { at: 1.05, size: 1 }] as const;

/** The Marionettist is hauled up on its strings, hangs, falls, lands and bows. */
const HAUL = 0.55, HUNG = 1, DROP = 1.35, LAND = 1.5, BOW = 1.85, HAUL_Y = 0.75;

const SHATTER = 1.3;

/** The Mirrormime's panes stand this far from its feet, one in front and two behind its shoulders. */
const PANE_R = 0.95, PANES = [0, (2 * Math.PI) / 3, (-2 * Math.PI) / 3] as const;

/** The Marionettist's height off the ground `t` seconds in: hauled up, held, then falling free. */
function hauled(t: number): number {
  if (t < DROP) return HAUL_Y * ramp(t, HAUL, HUNG);

  return HAUL_Y * (1 - seg(t, DROP, LAND) ** 2);
}

export const LOCK_IN: Readonly<Record<ClassId, LockIn>> = {
  /**
   * Falling star. Night closes in and the fire burns violet; a Call sigil burns under the seer as the camera drops low
   * and looks up at the sky. It casts and levitates; on the strike a star streaks down onto the sigil, the camera
   * follows it down, and the night lifts.
   */
  astromancer: lockIn(2.1, [{ act: 'cast', strike: STAR_CALL }], [
    { at: 0, play: s => { s.fx.sigil(s.feet, CALL, STAR_LAND + 0.15); } },
    { at: STAR_CALL, play: s => { void s.fx.projectile(new THREE.Vector3(s.feet.x + 2.4, 7.5, s.feet.z + 0.6), up(s.feet, 0.15), STAR, 0.9, STAR_LAND - STAR_CALL, 0); } },
    { at: STAR_LAND, play: s => { void s.fx.ring(up(s.feet, 0.05), STAR, 2.4, 0.6); void s.fx.ring(up(s.feet, 0.06), CALL, 1.5, 0.45); void s.fx.burst(up(s.feet, 0.6), STAR, 3, 0.5); s.fx.sparkles(up(s.feet, 0.2), STAR, 10); } },
  ], t => {
    const down = ramp(t, STAR_LAND - 0.05, STAR_LAND + 0.25);
    const lift = t < STAR_LAND ? 0.35 * ramp(t, 0.25, STAR_CALL) : 0;

    return {
      cam: { from: mix([1.1, 0.9, 5.2], [0.5, 1.3, 5.6], down), at: mix([-0.3, 2.6, 0.8], [0, 1.7, FRONT.z], down), k: span(t, 0, 0.45, 1.55, 2.1) },
      body: { ...BODY, y: lift, ...landing(t, STAR_LAND, 0.18) },
      flare: 0.25 * span(t, 0, 0.3, 0.7, 1) + blow(t, STAR_LAND, 0.7),
      shake: 0.6 * blow(t, STAR_LAND, 0.35),
      mood: { dark: 0.8 * span(t, 0, 0.35, STAR_LAND + 0.1, 1.75), fire: span(t, 0, 0.3, 1.5, 2.1) },
    };
  }),

  /**
   * The ferry back. The fire gutters ghost green; the Gravecaller goes down and stays down a beat while wisps rise and
   * a ring closes in on it, then rises as souls spiral up and a green burst blooms. The camera watches low from the side,
   * drifting.
   */
  gravecaller: lockIn(2.2, [{ act: 'down', strike: 0.45, hold: true }, { act: 'rise', strike: 1.45 }], [
    { at: 0.25, play: s => { s.fx.wisps(s.feet, GHOST, 6, 0.9); } },
    { at: 0.5, play: s => { void s.fx.implode(up(s.feet, 0.06), GHOST, 1.9, 0.65); } },
    { at: 1.2, play: s => { s.fx.wisps(s.feet, GHOST, 12, 1); } },
    { at: 1.45, play: s => { void s.fx.burst(up(s.feet, 1.2), GHOST, 2.6, 0.55); void s.fx.ring(up(s.feet, 0.06), GHOST, 2.2, 0.55); } },
  ], t => {
    const sunk = span(t, 0.1, 0.5, 1.15, 1.55);

    return {
      cam: { from: mix([3.6, 0.8, 4.4], [2.7, 1, 5], seg(t, 0, 2.2)), at: [0, 1.4 + 0.3 * ramp(t, 1.15, 1.6), FRONT.z], k: span(t, 0, 0.5, 1.7, 2.2) },
      body: { ...BODY, y: -0.14 * sunk, spin: -0.5 * sunk, sy: 1 - 0.08 * sunk },
      flare: 0.35 * span(t, 0.5, 0.8, 0.95, 1.2) + blow(t, 1.45, 0.6),
      shake: 0.25 * blow(t, 1.45, 0.3),
      mood: { dark: 0.5 * span(t, 0, 0.4, 1.4, 2.1), fire: span(t, 0, 0.3, 1.6, 2.2) },
    };
  }),

  /** Three tolls. Dead front; each toll rings the ground gold and kicks the camera one step closer, the third hardest. */
  bellringer: lockIn(2, [{ act: 'toll', strike: TOLLS[2].at }], TOLLS.map(({ at, size }) => ({
    at,
    play: (s: LockCtx) => { void s.fx.ring(up(s.feet, 0.06), BELL, 1 + 1.8 * size, 0.5); void s.fx.burst(up(s.feet, 1.9), BELL, 1 + 1.4 * size, 0.4); },
  })), t => {
    const rung = Math.max(...TOLLS.map(({ at, size }) => size * blow(t, at, 0.3)));

    return {
      cam: { from: [0, 1.7, 5.3], at: [0, 1.85, FRONT.z], k: TOLLS.reduce((k, { at }) => k + ramp(t, at, at + 0.07) / 3, 0) * (1 - ramp(t, 1.5, 2)) },
      body: { ...BODY, ...squash(0, 0.06 * rung) },
      flare: rung,
      shake: Math.max(...TOLLS.map(({ at, size }) => size * size * blow(t, at, 0.18))),
      mood: { dark: 0.5 * span(t, 0, 0.25, 1.3, 1.9) * (1 - 0.8 * rung), fire: span(t, 0, 0.2, 1.4, 2) },
    };
  }),

  /**
   * Strings. They drop from the dark onto its head and hands, the camera tilts up after them, and the Marionettist is
   * hauled up limp and swinging, dropped, lands with a squash and takes a showman's bow, under a theatre spotlight.
   */
  marionettist: lockIn(2.2, [{ act: 'attack', strike: BOW }], [
    { at: 0, play: s => {
      const t0 = s.t();
      s.fx.strings(() => {
        const k = ramp(s.t() - t0, 0, 0.3);

        return s.ties().map(p => p.setY(9 + (p.y - 9) * k));
      }, 9, THREAD, DROP + 0.15);
    } },
    { at: LAND, play: s => { void s.fx.ring(up(s.feet, 0.05), THREAD, 1.5, 0.4); } },
    { at: BOW, play: s => { s.fx.sparkles(up(s.feet, 1.5), THREAD, 8); } },
  ], t => {
    const y = hauled(t), limp = span(t, HAUL, 0.75, 1.15, DROP);

    return {
      cam: { from: [0.45, 1.4, 5.6], at: [0, 1.35 + 0.3 * y + 0.35 * span(t, 0.1, 0.4, 0.5, 0.95), FRONT.z], k: span(t, 0, 0.4, 1.75, 2.2) },
      body: { ...BODY, y, roll: 0.2 * limp * Math.sin((t - HAUL) * 7), spin: 0.18 * limp * Math.sin((t - HAUL) * 4.5), ...landing(t, LAND, 0.2) },
      flare: 0.4 * blow(t, LAND, 0.4) + 0.6 * blow(t, BOW, 0.28),
      shake: 0.45 * blow(t, LAND, 0.25),
      mood: { dark: 0.85 * span(t, 0, 0.35, 1.8, 2.2), fire: 0.5 * span(t, 0, 0.35, 1.8, 2.2) },
    };
  }),

  /** Glass. The camera circles 70° around the Mirrormime as three panes rise about it; it presses on them, and on its strike they all shatter. */
  mirrormime: lockIn(2.2, [{ act: 'cast', strike: SHATTER }], [
    { at: 0.05, play: s => { for (const a of PANES) s.fx.pane(new THREE.Vector3(s.feet.x + Math.sin(a) * PANE_R, s.feet.y, s.feet.z + Math.cos(a) * PANE_R), a, GLASS, SHATTER - 0.05); } },
    { at: SHATTER, play: s => {
      for (const a of PANES) s.fx.shards(new THREE.Vector3(s.feet.x + Math.sin(a) * PANE_R, s.feet.y + 0.95, s.feet.z + Math.cos(a) * PANE_R), GLASS, 14);
      void s.fx.burst(up(s.feet, 1.1), GLASS, 3.2, 0.4);
    } },
  ], t => {
    const a = -0.6 + 1.22 * ramp(t, 0, 1.9);

    return {
      cam: { from: [Math.sin(a) * 4, 1.7, FRONT.z + Math.cos(a) * 4], at: [0, 1.6, FRONT.z], k: span(t, 0, 0.45, 1.7, 2.2) },
      body: { ...BODY, ...landing(t, SHATTER, -0.08) },
      flare: 0.2 * span(t, 0.1, 0.5, 0.9, SHATTER) + blow(t, SHATTER, 0.45),
      shake: 0.4 * blow(t, SHATTER, 0.25),
      mood: { dark: 0.6 * span(t, 0, 0.4, SHATTER, 1.9), fire: span(t, 0, 0.3, 1.6, 2.2) },
    };
  }),
};
