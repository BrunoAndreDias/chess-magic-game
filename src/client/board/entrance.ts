import * as THREE from 'three';
import { roundQueue } from '../../engine/index';
import type { BattleState, ClassId, UnitId } from '../../engine/index';
import { playLock } from '../sound';
import type { Fx } from './fx';
import type { Stage } from './stage';
import type { Tweens } from './tween';
import type { UnitView } from './units';

/** Who walks onto the board at the start of a battle: a class, or a Marionettist's Doll. */
export type Arrival = ClassId | 'doll';

/** The body's offset from its resting transform `t` seconds into an entrance. */
export interface EnterPose { y: number; spin: number; sx: number; sy: number; sz: number; shown: boolean }

export interface EntranceCtx { fx: Fx; stage: Stage; tweens: Tweens }

/** A one-off effect `at` seconds into an entrance, on the unit's tile. */
interface Cue { at: number; play: (c: EntranceCtx, tile: THREE.Vector3, v: UnitView) => void }

export interface Entrance { sec: number; pose: (t: number) => EnterPose; cues: readonly Cue[] }

export const REST: EnterPose = { y: 0, spin: 0, sx: 1, sy: 1, sz: 1, shown: true };

const HIDDEN: EnterPose = { ...REST, shown: false };

/** Seconds between two arrivals in turn order, and from a Marionettist's arrival to its Doll's. */
const STAGGER = 0.35, DOLL_LAG = 0.45;

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

const seg = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a));

const easeOut = (x: number): number => 1 - (1 - x) ** 3;

const up = (tile: THREE.Vector3, y: number): THREE.Vector3 => tile.clone().add(new THREE.Vector3(0, y, 0));

/** A body that hits the ground squashes and springs back over `k` from 0 to 1. */
function squash(k: number, amount: number): Pick<EnterPose, 'sx' | 'sy' | 'sz'> {
  const d = amount * (1 - k) ** 2;

  return { sx: 1 + d / 2, sy: 1 - d, sz: 1 + d / 2 };
}

/** Lets each pose stop caring about its end: past `sec` every entrance is exactly at rest. */
function entrance(sec: number, cues: readonly Cue[], pose: (t: number) => EnterPose): Entrance {
  return { sec, cues, pose: t => (t >= sec ? REST : pose(t)) };
}

const STAR = 0xfff1c0, CALL = 0xb48cff, GHOST = 0x7dffb2, BELL = 0xe8b65a, GLASS = 0xdff4ff, THREAD = 0xf6ecd2;

/** One toll: a golden shockwave on the ground and a flash where the bell hangs. */
function toll(c: EntranceCtx, tile: THREE.Vector3, radius: number): void {
  void c.fx.ring(up(tile, 0.06), BELL, radius, 0.5);
  void c.fx.burst(up(tile, 1.4), BELL, radius * 1.4, 0.4);
}

/** Lowered on strings from `drop` metres up until `touch`, then a bob on the slack string. */
function puppet(drop: number, touch: number, sec: number): Entrance {
  return entrance(sec, [{ at: 0, play: (c, _, v) => { strings(c, v, sec); } }], t => {
    if (t < touch) {
      const k = t / touch;

      return { ...REST, y: drop * (1 - easeOut(k)), spin: 0.35 * Math.sin(t * 9) * (1 - k) };
    }

    const k = seg(t, touch, sec - 0.1);

    return { ...REST, y: 0.22 * Math.sin(Math.PI * k) * (1 - k), ...squash(k, 0.22) };
  });
}

/** The puppet's head and hands, each tied to a string that runs up into the dark. */
function strings(c: EntranceCtx, v: UnitView, sec: number): void {
  const h = v.height, ties = [new THREE.Vector3(0, h, 0), new THREE.Vector3(0.3, h * 0.6, 0), new THREE.Vector3(-0.3, h * 0.6, 0)];
  const top = v.group.position.y + 9;
  c.fx.strings(() => { v.body.updateWorldMatrix(true, false); return ties.map(p => v.body.localToWorld(p.clone())); }, top, THREAD, sec);
}

export const ENTRANCE: Readonly<Record<Arrival, Entrance>> = {
  /** A Call sigil burns on the tile first; a beat later the seer lands on it as a falling star. It arrives late, like its Calls. */
  astromancer: entrance(1.3, [
    { at: 0, play: (c, tile) => { c.fx.sigil(tile, CALL, 0.9); } },
    { at: 0.5, play: (c, tile) => { void c.fx.projectile(up(tile, 7.7), up(tile, 0.7), STAR, 0.4, 0.3, 0); } },
    { at: 0.8, play: (c, tile) => { void c.fx.ring(up(tile, 0.06), STAR, 1.9, 0.55); void c.fx.burst(up(tile, 0.5), STAR, 3, 0.45); c.stage.shake(0.15); } },
  ], t => {
    if (t < 0.5) return HIDDEN;

    if (t < 0.8) return { ...REST, y: 7 * (1 - seg(t, 0.5, 0.8)) };

    return { ...REST, ...squash(seg(t, 0.8, 1.1), 0.3) };
  }),

  /** A ghost-green ring opens in the ground and the Gravecaller rises out of the earth, Souls spiralling up around it. */
  gravecaller: entrance(1.3, [
    { at: 0, play: (c, tile) => { void c.fx.ring(up(tile, 0.06), GHOST, 1.3, 0.7); void c.fx.burst(up(tile, 0.1), GHOST, 2.4, 1); } },
    { at: 0.15, play: (c, tile) => { c.fx.wisps(tile, GHOST, 8, 1.1); } },
    { at: 0.45, play: (c, tile) => { void c.fx.implode(up(tile, 0.06), GHOST, 1.1, 0.6); } },
  ], t => {
    if (t < 0.15) return HIDDEN;
    const k = easeOut(seg(t, 0.15, 1.05));

    return { ...REST, y: -2.2 * (1 - k), spin: -1.4 * (1 - k) };
  }),

  /** Three tolls ring out in rhythm; the Bellringer is standing there on the third. */
  bellringer: entrance(1.25, [
    { at: 0, play: (c, tile) => { toll(c, tile, 1.4); } },
    { at: 0.35, play: (c, tile) => { toll(c, tile, 1.9); } },
    { at: 0.7, play: (c, tile) => { toll(c, tile, 2.8); c.stage.shake(0.3); playLock('bellringer'); } },
  ], t => (t < 0.7 ? HIDDEN : { ...REST, ...squash(seg(t, 0.7, 1.05), -0.25) })),

  /** Lowered onto the board on strings like one of its own puppets. */
  marionettist: puppet(5, 0.8, 1.4),

  /** The Doll drops in on its own, shorter strings. */
  doll: puppet(3.5, 0.6, 1.1),

  /** A pane of glass rises on the tile, the Mirrormime unfolds out of its plane, and the pane shatters. */
  mirrormime: entrance(1.3, [
    { at: 0, play: (c, tile, v) => { c.fx.pane(tile, v.group.rotation.y, GLASS, 0.95); } },
    { at: 0.95, play: (c, tile) => { c.fx.shards(up(tile, 0.9), GLASS, 18); void c.fx.burst(up(tile, 0.9), GLASS, 2.2, 0.35); } },
  ], t => (t < 0.35 ? HIDDEN : { ...REST, sx: Math.max(0.02, easeOut(seg(t, 0.35, 0.9))) })),
};

/** One unit's place in the opening: who arrives, and how many seconds after the first. */
export interface Arriving { id: UnitId; who: Arrival; at: number }

/** Everyone arrives in the first round's turn order, each Doll just after its Marionettist. */
export function arrivals(s: BattleState): Arriving[] {
  return roundQueue(s).flatMap((id, i) => {
    const u = s.units.find(x => x.id === id);

    if (!u) return [];
    const dolls = s.units.filter(d => d.owner === id && d.life.kind !== 'dead');

    return [{ id, who: u.cls, at: i * STAGGER }, ...dolls.map(d => ({ id: d.id, who: 'doll' as const, at: i * STAGGER + DOLL_LAG }))];
  });
}

function apply(v: UnitView, p: EnterPose): void {
  const b = v.body;
  b.position.y = p.y;
  b.rotation.y = p.spin;
  b.scale.set(p.sx, p.sy, p.sz);
  b.visible = p.shown;
}

/** Plays `e` on `v` standing on `tile`, firing each cue as its moment passes, and leaves the body at rest. */
export function playEntrance(c: EntranceCtx, v: UnitView, e: Entrance, tile: THREE.Vector3): Promise<void> {
  let next = 0;
  v.arriving = true;
  v.group.visible = true;

  return c.tweens.run(e.sec, p => {
    const t = p * e.sec;

    for (let cue = e.cues[next]; cue && cue.at <= t; cue = e.cues[++next]) cue.play(c, tile, v);
    apply(v, e.pose(t));

    if (p >= 1) v.arriving = false;
  });
}
