import * as THREE from 'three';
import { SKILLS } from '../../engine/index';
import type { SkillId } from '../../engine/index';

/** The motions a figure may author as one-shot clips, besides one per skill id (art/figures/common.py). */
const MOTIONS = ['cast', 'attack', 'hit', 'move', 'down', 'rise'] as const;
export type Motion = (typeof MOTIONS)[number];
export type Act = Motion | SkillId;

const isSkill = (name: string): name is SkillId => Object.hasOwn(SKILLS, name);

/** A clip named after a motion or a skill plays once on demand; every other clip loops as idle. */
export const isAct = (name: string): boolean => (MOTIONS as readonly string[]).includes(name) || isSkill(name);

/** Where an act turns when its figure has no clip of that name. */
const FALLBACK: { readonly [K in Motion]?: Motion } = { attack: 'cast' };
const fallback = (a: Act): Act | undefined => (isSkill(a) ? (SKILLS[a].basic ? 'attack' : 'cast') : FALLBACK[a]);

/** The clip that plays `act` on a figure with these clips, or null when the board keeps its procedural motion. */
export function clipFor(clips: { has(name: string): boolean }, act: Act): string | null {
  for (let a: Act | undefined = act; a !== undefined; a = fallback(a)) if (clips.has(a)) return a;
  return null;
}

const FADE = 0.1;
/**
 * A clip's blend over idle `t` seconds into a play lasting `length`. It fades in, unless it `cut` in over another
 * clip's pose, and fades out at its end, unless it must `hold` its last frame.
 */
export function weightAt(t: number, length: number, cut: boolean, hold: boolean): number {
  return Math.max(0, Math.min(1, cut ? 1 : t / FADE, hold ? 1 : (length - t) / FADE));
}

export interface ActClip { length: number; strike: number }
/** Sets the started clip's frame and blend; a no-op once another clip has started on the figure. */
export type Pose = (time: number, weight: number) => void;

/** A figure's clips on one mixer: idle clips loop on the clock, action clips are posed frame by frame by the board. */
export interface Rig {
  /** Advances the idle clips to `time` seconds and applies every pose. */
  tick(time: number): void;
  acts: ReadonlyMap<string, ActClip>;
  /** Hands the figure to action clip `name`; `cut` says another clip still showed, so this one should not fade in. */
  start(name: string): { cut: boolean; pose: Pose };
}

/** Builds the rig for a figure's clone. An action clip's `strike` (seconds) is in its userData, else its midpoint. */
export function rig(body: THREE.Object3D, clips: readonly THREE.AnimationClip[]): Rig {
  const mixer = new THREE.AnimationMixer(body);
  const idles = clips.filter(c => !isAct(c.name)).map(c => mixer.clipAction(c).play());
  const acts = new Map(clips.filter(c => isAct(c.name)).map(c => {
    const action = mixer.clipAction(c).play(), tracks = new Set(c.tracks.map(t => t.name));
    action.timeScale = 0;
    action.setEffectiveWeight(0);
    // An idle clip yields only where the action moves the same node property, so the rest of the figure keeps breathing.
    const under = idles.filter(i => i.getClip().tracks.some(t => tracks.has(t.name)));
    const strike = typeof c.userData.strike === 'number' ? c.userData.strike : c.duration / 2;
    return [c.name, { action, under, length: c.duration, strike }] as const;
  }));
  type Entry = NonNullable<ReturnType<typeof acts.get>>;
  const blend = (e: Entry, w: number): void => {
    e.action.setEffectiveWeight(w);
    for (const i of e.under) i.setEffectiveWeight(1 - w);
  };
  let last: number | null = null, turn = 0, shown: Entry | null = null;
  return {
    tick(time) {
      if (last === null) mixer.setTime(time);
      else mixer.update(time - last);
      last = time;
    },
    acts,
    start(name) {
      const e = acts.get(name);
      if (!e) throw new Error(`no action clip ${name}`);
      const me = ++turn, cut = shown !== null && shown.action.getEffectiveWeight() > 0;
      if (shown && shown !== e) blend(shown, 0);
      shown = e;
      return {
        cut,
        pose: (time, weight) => {
          if (turn !== me) return;
          e.action.time = time;
          blend(e, weight);
        },
      };
    },
  };
}
