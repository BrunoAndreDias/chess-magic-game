import * as THREE from 'three';
import type { ClassId, Team } from '../../engine/index';
import type { Pose as ClipPose, Rig } from '../board/acts';
import { Fx } from '../board/fx';
import { buildModel, warmFigures } from '../board/models';
import { disposeTree, glow, hex } from '../board/art';
import { Tweens } from '../board/tween';
import { CREST } from '../crest';
import type { Draft } from '../draft';
import { buildCamp } from './camp';
import type { Camp } from './camp';
import { clipAt, due, FRONT, HOME, LOCK_IN, REST } from './lockin';
import type { Body, Moment, LockCtx } from './lockin';

/** Where a party member stands: index 0 is the front spot for the selected one, then back-right, back-left. */
interface Station { x: number; z: number; scale: number; turn: number }

const STATIONS: readonly Station[] = [
  { ...FRONT, turn: 0 },
  { x: 1.75, z: -0.7, scale: 0.95, turn: -0.45 },
  { x: -1.75, z: -0.7, scale: 0.95, turn: 0.45 },
];

const SWAP_SEC = 0.4;

/** The party slot each figure's scene objects belong to, for picking. */
const SLOT_OF = new WeakMap<THREE.Object3D, number>();

const FIRE = new THREE.Vector3(0, 0, 0.2);

const HOME_FROM = new THREE.Vector3(...HOME.from), HOME_AT = new THREE.Vector3(...HOME.at), SHOT = new THREE.Vector3(), LOOK = new THREE.Vector3();

/** Seconds for the class aura to warm to full after the front figure changes. */
const WARM_SEC = 0.9;

interface Pose { x: number; z: number; scale: number; turn: number }

interface Figure {
  key: string; cls: ClassId; root: THREE.Group; body: THREE.Group; height: number; rig: Rig; from: Pose; to: Station; t: number; ph: number; locked: boolean;
  /** The lock-in clip the figure shows, from its first frame until the lock-in moves on. */
  act: { name: string; pose: ClipPose } | null;
}

/** The class-glow light set around the front figure: a rim behind it, a pool under it, and the lock-in burst. */
interface Aura { rim: THREE.PointLight; pool: THREE.Sprite; flash: THREE.PointLight; burst: THREE.Sprite; key: string; warm: number }

/** The running lock-in: whose, since when on the wall clock, and how many of its cues have played. */
interface Beat { slot: number; team: Team; cls: ClassId; start: number; fired: number }

/** Puts the lock-in's body offset over the figure's resting pose for this frame. */
function offset(f: Figure, b: Body): void {
  f.root.position.y += b.y;
  f.root.rotation.y += b.spin;
  f.root.rotation.z = b.roll;
  f.body.scale.set(b.sx, f.body.scale.y * b.sy, b.sz);
}

const ease = (t: number): number => 1 - (1 - t) ** 3;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The party standing around a fire, selected member in front. It only renders `draft`; picks go back through `onPick`. */
export class Lineup {
  readonly #renderer: THREE.WebGLRenderer;
  readonly #scene = new THREE.Scene();
  readonly #camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
  readonly #figs: (Figure | null)[] = [null, null, null];
  readonly #camp: Camp;
  readonly #aura: Aura;
  readonly #tweens = new Tweens();
  readonly #fx = new Fx(this.#scene, this.#tweens);
  readonly #still = window.matchMedia('(prefers-reduced-motion: reduce)');
  /** The running lock-in, timed on the wall clock so it ends with the draft's hold even when frames are slow. */
  #beat: Beat | null = null;
  #team: Team = 0;
  readonly #ray = new THREE.Raycaster();
  readonly #resize: ResizeObserver;
  readonly #off: (() => void)[] = [];
  #raf = 0;
  #last = performance.now();
  #time = 0;

  constructor(readonly canvas: HTMLCanvasElement, readonly plates: HTMLElement, onPick: (slot: number) => void) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.#renderer = r;
    this.#camp = buildCamp(this.#scene, FIRE, FRONT);
    this.#aura = this.#buildAura();
    this.#camera.position.copy(HOME_FROM);
    this.#camera.lookAt(HOME_AT);

    this.#resize = new ResizeObserver(() => this.#fit());
    this.#resize.observe(canvas);
    const move = (ev: PointerEvent) => { canvas.style.cursor = this.#hit(ev) === null ? '' : 'pointer'; };

    const click = (ev: PointerEvent) => { const slot = this.#hit(ev); if (slot !== null) onPick(slot); };

    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('click', click);
    this.#off.push(() => canvas.removeEventListener('pointermove', move), () => canvas.removeEventListener('click', click));
    this.#raf = requestAnimationFrame(this.#frame);
    void warmFigures(r, this.#camera, this.#scene).then(() => this.#warmCues());
  }

  /** Compiles what every lock-in's cues draw, so the first lock does not stall on new shaders. */
  async #warmCues(): Promise<void> {
    const r = this.#renderer, g = new THREE.Group(), tweens = new Tweens(), at = new THREE.Vector3();

    if (r.getContext().isContextLost()) return;
    const ctx: LockCtx = { fx: new Fx(g, tweens), feet: at, ties: () => [at.clone()], t: () => 0 };

    for (const lock of Object.values(LOCK_IN)) for (const cue of lock.cues) cue.play(ctx);
    await r.compileAsync(g, this.#camera, this.#scene);
    tweens.flush();
  }

  #buildAura(): Aura {
    const rim = new THREE.PointLight(0xffffff, 0, 4.5, 1.4);
    rim.position.set(0.15, 2.1, FRONT.z - 0.75);
    const flash = new THREE.PointLight(0xffffff, 0, 6, 1.5);
    flash.position.set(0, 1.2, FRONT.z + 0.6);
    const pool = glow(0xffffff, 3.2, 0);
    pool.position.set(FRONT.x, 0.04, FRONT.z);
    const burst = glow(0xffffff, 1, 0);
    burst.position.set(FRONT.x, 1.1, FRONT.z + 0.2);
    this.#scene.add(rim, flash, pool, burst);

    return { rim, pool, flash, burst, key: '', warm: 0 };
  }

  /** Plays the class's lock-in on the member in `slot`, from the top even when one is already running. */
  lockIn(slot: number): void {
    const f = this.#figs[slot];

    this.#settle();

    if (f) this.#beat = { slot, team: this.#team, cls: f.cls, start: performance.now(), fired: 0 };
  }

  /** Ends the running lock-in: its effects go, and its figure returns to idle on the next frame. */
  #settle(): void {
    this.#beat = null;
    this.#tweens.flush();
  }

  /** Brings the scene in line with the draft: rebuilds members whose class or team changed and walks everyone to their spot. `locked` is per slot of the shown team. */
  sync(draft: Draft, locked: readonly boolean[]): void {
    const team: Team = draft.sel.team;
    const front = draft.teams[team][draft.sel.slot];
    this.#team = team;

    if (this.#beat && (this.#beat.team !== team || this.#beat.slot !== draft.sel.slot)) this.#settle();

    if (front) this.#tint(`${team}:${draft.sel.slot}:${front.cls}`, CREST[front.cls].glow);
    draft.teams[team].forEach((m, slot) => {
      const to = STATIONS[(slot - draft.sel.slot + 3) % 3]!, key = `${team}:${m.cls}`;
      let f = this.#figs[slot];

      if (f && f.key !== key) { disposeTree(f.root); f = null; }

      if (!f) {
        const { body, height, rig } = buildModel(m.cls, team), root = new THREE.Group();
        root.add(body);
        root.traverse(o => { SLOT_OF.set(o, slot); });
        this.#scene.add(root);
        const prev = this.#figs[slot];
        f = { key, cls: m.cls, root, body, height, rig, from: prev ? pose(prev) : { ...to }, to, t: prev ? 0 : 1, ph: slot * 2.1, locked: locked[slot] ?? false, act: null };
        this.#figs[slot] = f;

        return;
      }

      f.locked = locked[slot] ?? false;

      if (f.to !== to) { f.from = pose(f); f.to = to; f.t = 0; }
    });
    this.#place();
  }

  /** Recolours the aura for a new front figure and lets it warm up from dark. */
  #tint(key: string, css: string): void {
    const a = this.#aura;

    if (a.key === key) return;
    a.key = key;
    a.warm = 0;
    const c = hex(css);
    a.rim.color.setHex(c);
    a.flash.color.setHex(c);
    a.pool.material.color.setHex(c);
    a.burst.material.color.setHex(c);
    this.#camp.tint(c);
  }

  #stepAura(dt: number, time: number, flare: number): void {
    const a = this.#aura, still = this.#still.matches;
    a.warm = Math.min(1, a.warm + dt / WARM_SEC);
    const w = a.warm * a.warm * (3 - 2 * a.warm), breathe = still ? 1 : 0.9 + 0.1 * Math.sin(time * 1.3);
    a.rim.intensity = (9 + 14 * flare) * w * breathe;
    a.pool.material.opacity = (0.2 + 0.35 * flare) * w;
    a.flash.intensity = 16 * flare;
    a.burst.material.opacity = 0.55 * flare;
    a.burst.scale.setScalar(1.2 + 2 * flare);
  }

  /** What a cue of the running lock-in may touch: the front figure's feet, head and hands, and the lock-in's clock. */
  #cueCtx(f: Figure, b: Beat): LockCtx {
    const ties = [new THREE.Vector3(0, f.height, 0), new THREE.Vector3(0.3, f.height * 0.6, 0), new THREE.Vector3(-0.3, f.height * 0.6, 0)];

    return {
      fx: this.#fx,
      feet: new THREE.Vector3(FRONT.x, 0, FRONT.z),
      ties: () => { f.body.updateWorldMatrix(true, false); return ties.map(p => f.body.localToWorld(p.clone())); },
      t: () => (performance.now() - b.start) / 1000,
    };
  }

  #hit(ev: PointerEvent): number | null {
    const rect = this.canvas.getBoundingClientRect();
    this.#ray.setFromCamera(new THREE.Vector2(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1), this.#camera);
    const hit = this.#ray.intersectObjects(this.#figs.flatMap(f => (f ? [f.root] : [])), true)[0];

    return (hit && SLOT_OF.get(hit.object)) ?? null;
  }

  #fit(): void {
    const w = this.canvas.clientWidth, hh = this.canvas.clientHeight;

    if (!w || !hh) return;
    this.#renderer.setSize(w, hh, false);
    const c = this.#camera, aspect = w / hh, halfWidth = 2.85, dist = HOME_FROM.length();
    c.aspect = aspect;
    c.fov = Math.max(34, THREE.MathUtils.radToDeg(2 * Math.atan(halfWidth / (dist * aspect))));
    c.updateProjectionMatrix();
    this.#place();
    this.#renderer.render(this.#scene, this.#camera);
  }

  /** Pins each nameplate under its member's feet. */
  #place(): void {
    const w = this.canvas.clientWidth, hh = this.canvas.clientHeight, v = new THREE.Vector3();

    for (const el of this.plates.querySelectorAll<HTMLElement>('[data-slot]')) {
      const f = this.#figs[Number(el.dataset.slot)];

      if (!f) continue;
      v.set(f.root.position.x, 0, f.root.position.z).project(this.#camera);
      el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * hh}px) translate(-50%, 16px)`;
    }
  }

  readonly #frame = (now: number): void => {
    this.#raf = requestAnimationFrame(this.#frame);
    const wall = Math.max(0, (now - this.#last) / 1000), dt = Math.min(0.05, wall);
    this.#last = now;
    const time = (this.#time += dt), still = this.#still.matches;

    if (this.#beat && (now - this.#beat.start) / 1000 >= LOCK_IN[this.#beat.cls].sec) this.#settle();
    const beat = this.#beat, bt = beat ? (now - beat.start) / 1000 : -1, lock = beat ? LOCK_IN[beat.cls] : null;
    const front = beat ? this.#figs[beat.slot] ?? null : null, m: Moment = lock ? lock.moment(bt, still) : REST;

    if (beat && lock && front && !still) for (const cue of due(lock.cues, beat.fired, bt)) { beat.fired++; cue.play(this.#cueCtx(front, beat)); }

    // Effects run on the wall clock too, so they keep pace with the lock-in's moments when frames are slow.
    this.#tweens.update(wall);

    for (const f of this.#figs) {
      if (!f) continue;
      f.t = Math.min(1, f.t + dt / SWAP_SEC);
      const k = ease(f.t), r = f.root;
      r.position.set(lerp(f.from.x, f.to.x, k), Math.sin(f.t * Math.PI) * 0.12, lerp(f.from.z, f.to.z, k));
      r.scale.setScalar(lerp(f.from.scale, f.to.scale, k));
      r.rotation.set(0, lerp(f.from.turn, f.to.turn, k), 0);
      f.body.position.y = Math.sin(time * 1.6 + f.ph) * 0.02;
      f.body.scale.set(1, 1 + Math.sin(time * 1.6 + f.ph + 0.8) * 0.012, 1);

      if (f.to === STATIONS[0] && f.t >= 1 && !f.locked && !still) r.rotation.y += 0.32 * Math.sin(time * 0.55 + f.ph);
      const at = lock && f === front ? clipAt(lock, bt, f.rig.acts, still) : null;

      if (f === front) offset(f, m.body);

      if (at) {
        if (f.act?.name !== at.name) f.act = { name: at.name, pose: f.rig.start(at.name).pose };
        f.act.pose(at.time, at.weight);
      } else if (f.act) {
        f.act.pose(0, 0);
        f.act = null;
      }

      f.rig.tick(time);
    }

    this.#stepAura(dt, time, m.flare);
    const c = this.#camera, shake = 0.25 * m.shake;
    c.position.lerpVectors(HOME_FROM, SHOT.set(...m.cam.from), m.cam.k);
    c.position.add(SHOT.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(shake));
    c.lookAt(LOOK.lerpVectors(HOME_AT, SHOT.set(...m.cam.at), m.cam.k));
    this.plates.style.opacity = String(1 - 0.9 * m.cam.k);
    this.#camp.step(time, m.mood);
    this.#place();
    this.#renderer.render(this.#scene, this.#camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.#raf);
    this.#resize.disconnect();
    this.#settle();

    for (const off of this.#off) off();

    for (const o of [...this.#scene.children]) disposeTree(o);
    this.#renderer.dispose();
    this.#renderer.forceContextLoss();
  }
}

function pose(f: Figure): Pose {
  return { x: f.root.position.x, z: f.root.position.z, scale: f.root.scale.x, turn: f.root.rotation.y };
}
