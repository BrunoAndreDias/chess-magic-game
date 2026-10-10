import * as THREE from 'three';
import type { Team } from '../../engine/index';
import type { Pose as ClipPose, Rig } from '../board/acts';
import { buildModel } from '../board/models';
import { disposeTree, glow, hex, mat, mesh, seeded } from '../board/art';
import { CREST } from '../crest';
import type { Draft } from '../draft';
import { BEAT_SEC, castAt, lockBeat } from './beat';
import type { Beat } from './beat';

/** Where a party member stands: index 0 is the front spot for the selected one, then back-right, back-left. */
interface Station { x: number; z: number; scale: number; turn: number }

const STATIONS: readonly Station[] = [
  { x: 0, z: 1.5, scale: 1.3, turn: 0 },
  { x: 1.75, z: -0.7, scale: 0.95, turn: -0.45 },
  { x: -1.75, z: -0.7, scale: 0.95, turn: 0.45 },
];

const SWAP_SEC = 0.4;

/** The party slot each figure's scene objects belong to, for picking. */
const SLOT_OF = new WeakMap<THREE.Object3D, number>();

const FIRE = new THREE.Vector3(0, 0, 0.2);

const FRONT = STATIONS[0]!;

/** The resting camera, and where the lock-in beat pushes it: close on the front figure, looking up at it. */
const CAM = { from: new THREE.Vector3(0, 3.1, 7.6), at: new THREE.Vector3(0, 0.85, 0.2) };

const PUSH = { from: new THREE.Vector3(-0.5, 1.7, 5.4), at: new THREE.Vector3(0.15, 1.3, FRONT.z) };

const LOOK = new THREE.Vector3();

/** Seconds for the class aura to warm to full after the front figure changes. */
const WARM_SEC = 0.9;

interface Pose { x: number; z: number; scale: number; turn: number }

interface Fire { light: THREE.PointLight; flames: THREE.Object3D[]; sprite: THREE.Sprite }

interface Figure {
  key: string; root: THREE.Group; body: THREE.Group; rig: Rig; from: Pose; to: Station; t: number; ph: number; locked: boolean;
  /** The lock-in beat's hold on the figure's `cast` clip, from its first frame until the beat moves on. */
  cast: ClipPose | null;
}

/** The class-glow light set around the front figure: a rim behind it, a pool under it, and the lock-in burst. */
interface Aura { rim: THREE.PointLight; pool: THREE.Sprite; flash: THREE.PointLight; burst: THREE.Sprite; ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; key: string; warm: number }

/**
 * The figure's "chosen" motion `bt` seconds into the lock-in beat, applied over its resting pose each frame: its `cast`
 * clip, or the beat's procedural hop for a figure without one. Reduced motion leaves a clip figure in its idle.
 */
function chosenMotion(f: Figure, b: Beat, bt: number, reduced: boolean): void {
  const clip = f.rig.acts.get('cast');

  if (!clip) {
    f.root.position.y += b.lift;
    f.root.rotation.y += b.spin;
    f.body.scale.y *= b.squash;

    return;
  }

  const at = castAt(bt, clip, reduced);

  if (!at) return;
  f.cast ??= f.rig.start('cast').pose;
  f.cast(at.time, at.weight);
}

const ease = (t: number): number => 1 - (1 - t) ** 3;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The party standing around a fire, selected member in front. It only renders `draft`; picks go back through `onPick`. */
export class Lineup {
  readonly #renderer: THREE.WebGLRenderer;
  readonly #scene = new THREE.Scene();
  readonly #camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
  readonly #figs: (Figure | null)[] = [null, null, null];
  readonly #fire: Fire;
  readonly #aura: Aura;
  readonly #still = window.matchMedia('(prefers-reduced-motion: reduce)');
  /** The running lock-in beat, timed on the wall clock so it ends with the draft's hold even when frames are slow. */
  #beat: { slot: number; start: number } | null = null;
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
    const s = this.#scene;
    s.background = new THREE.Color(0x07060a);
    s.fog = new THREE.Fog(0x07060a, 7, 15);
    s.add(new THREE.HemisphereLight(0x6a7aa8, 0x120c10, 0.28 * Math.PI));

    const spot = new THREE.SpotLight(0xffd29a, 40, 14, 0.4, 0.55, 1.6);
    spot.position.set(0.6, 6.5, 5.2);
    spot.target.position.set(STATIONS[0]!.x, 0.8, STATIONS[0]!.z);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0008;
    s.add(spot, spot.target);

    this.#fire = this.#buildCamp();
    this.#aura = this.#buildAura();
    this.#camera.position.copy(CAM.from);
    this.#camera.lookAt(CAM.at);

    this.#resize = new ResizeObserver(() => this.#fit());
    this.#resize.observe(canvas);
    const move = (ev: PointerEvent) => { canvas.style.cursor = this.#hit(ev) === null ? '' : 'pointer'; };

    const click = (ev: PointerEvent) => { const slot = this.#hit(ev); if (slot !== null) onPick(slot); };

    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('click', click);
    this.#off.push(() => canvas.removeEventListener('pointermove', move), () => canvas.removeEventListener('click', click));
    this.#raf = requestAnimationFrame(this.#frame);
  }

  #buildCamp(): Fire {
    const s = this.#scene, rnd = seeded(11);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(16, 48), mat(0x17120f, { roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    s.add(ground);
    const stone = mat(0x3b3540), log = mat(0x4a2f1a), ember = mat(0xff7a2a, { emissive: new THREE.Color(0xff5a1a), emissiveIntensity: 1.4 });

    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2, b = mesh(new THREE.DodecahedronGeometry(0.13 + rnd() * 0.05, 0), stone, FIRE.x + Math.cos(a) * 0.45, 0.06, FIRE.z + Math.sin(a) * 0.45);
      b.rotation.set(rnd() * 3, rnd() * 3, 0);
      b.castShadow = b.receiveShadow = true;
      s.add(b);
    }

    for (let i = 0; i < 3; i++) {
      const l = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.62, 6), log, FIRE.x, 0.1, FIRE.z);
      l.rotation.set(Math.PI / 2 - 0.35, (i / 3) * Math.PI * 2, 0, 'YXZ');
      s.add(l);
    }

    s.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), ember, FIRE.x, 0.06, FIRE.z));
    const flames: THREE.Object3D[] = [];

    for (const [c, sz, y] of [[0xff5a1a, 0.17, 0.26], [0xffa040, 0.11, 0.3], [0xffe08a, 0.06, 0.26]] as const) {
      const f = mesh(new THREE.ConeGeometry(sz, sz * 3.4, 7), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }), FIRE.x, y, FIRE.z);
      flames.push(f);
      s.add(f);
    }

    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2, d = 4.2 + rnd() * 3.5, b = mesh(new THREE.DodecahedronGeometry(0.25 + rnd() * 0.5, 0), stone, Math.cos(a) * d, 0.05, Math.sin(a) * d - 1.5);
      b.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      b.receiveShadow = true;
      s.add(b);
    }

    const sprite = glow(0xff8a3a, 2.2, 0.75);
    sprite.position.set(FIRE.x, 0.45, FIRE.z);
    const pool = glow(0xff6a20, 5, 0.18);
    pool.position.set(FIRE.x, 0.05, FIRE.z);
    const light = new THREE.PointLight(0xff8a3a, 7, 9, 1.6);
    light.position.set(FIRE.x, 0.7, FIRE.z);
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    s.add(sprite, pool, light);

    return { light, flames, sprite };
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
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(FRONT.x, 0.03, FRONT.z);
    this.#scene.add(rim, flash, pool, burst, ring);

    return { rim, pool, flash, burst, ring, key: '', warm: 0 };
  }

  /** Plays the lock-in beat on the member in `slot`: the camera pushes in, the class glow bursts and the figure does its chosen motion. */
  lockIn(slot: number): void {
    this.#beat = { slot, start: performance.now() };
  }

  /** Brings the scene in line with the draft: rebuilds members whose class or team changed and walks everyone to their spot. `locked` is per slot of the shown team. */
  sync(draft: Draft, locked: readonly boolean[]): void {
    const team: Team = draft.sel.team;
    const front = draft.teams[team][draft.sel.slot];

    if (front) this.#tint(`${team}:${draft.sel.slot}:${front.cls}`, CREST[front.cls].glow);
    draft.teams[team].forEach((m, slot) => {
      const to = STATIONS[(slot - draft.sel.slot + 3) % 3]!, key = `${team}:${m.cls}`;
      let f = this.#figs[slot];

      if (f && f.key !== key) { disposeTree(f.root); f = null; }

      if (!f) {
        const { body, rig } = buildModel(m.cls, team), root = new THREE.Group();
        root.add(body);
        root.traverse(o => { SLOT_OF.set(o, slot); });
        this.#scene.add(root);
        const prev = this.#figs[slot];
        f = { key, root, body, rig, from: prev ? pose(prev) : { ...to }, to, t: prev ? 0 : 1, ph: slot * 2.1, locked: locked[slot] ?? false, cast: null };
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
    a.ring.material.color.setHex(c);
  }

  #stepAura(dt: number, time: number, bt: number, b: Beat): void {
    const a = this.#aura, still = this.#still.matches;
    a.warm = Math.min(1, a.warm + dt / WARM_SEC);
    const w = a.warm * a.warm * (3 - 2 * a.warm), breathe = still ? 1 : 0.9 + 0.1 * Math.sin(time * 1.3);
    a.rim.intensity = (9 + 14 * b.flare) * w * breathe;
    a.pool.material.opacity = (0.2 + 0.35 * b.flare) * w;
    a.flash.intensity = 26 * b.flare;
    const grow = Math.min(1, Math.max(0, bt) / 0.9);
    a.burst.material.opacity = 0.95 * b.flare;
    a.burst.scale.setScalar(1 + 3.5 * grow);
    a.ring.material.opacity = b.flare > 0 && !still ? 0.9 * (1 - grow) : 0;
    a.ring.scale.setScalar(0.3 + 2.4 * (1 - (1 - grow) ** 2));
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
    const c = this.#camera, aspect = w / hh, halfWidth = 2.85, dist = CAM.from.length();
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
    const dt = Math.min(0.05, (now - this.#last) / 1000);
    this.#last = now;
    const time = (this.#time += dt), still = this.#still.matches;
    const beat = this.#beat, bt = beat ? (now - beat.start) / 1000 : -1, b = lockBeat(bt, still);

    if (bt >= BEAT_SEC) this.#beat = null;

    for (const [slot, f] of this.#figs.entries()) {
      if (!f) continue;
      f.t = Math.min(1, f.t + dt / SWAP_SEC);
      const k = ease(f.t), r = f.root;
      r.position.set(lerp(f.from.x, f.to.x, k), Math.sin(f.t * Math.PI) * 0.12, lerp(f.from.z, f.to.z, k));
      r.scale.setScalar(lerp(f.from.scale, f.to.scale, k));
      r.rotation.y = lerp(f.from.turn, f.to.turn, k);
      f.body.position.y = Math.sin(time * 1.6 + f.ph) * 0.02;
      f.body.scale.y = 1 + Math.sin(time * 1.6 + f.ph + 0.8) * 0.012;

      if (f.to === FRONT && f.t >= 1 && !f.locked && !still) r.rotation.y += 0.32 * Math.sin(time * 0.55 + f.ph);

      if (beat?.slot === slot) chosenMotion(f, b, bt, still);
      else if (f.cast) {
        f.cast(0, 0);
        f.cast = null;
      }

      f.rig.tick(time);
    }

    this.#stepAura(dt, time, bt, b);
    this.#camera.position.lerpVectors(CAM.from, PUSH.from, b.push);
    this.#camera.lookAt(LOOK.lerpVectors(CAM.at, PUSH.at, b.push));
    this.plates.style.opacity = String(1 - 0.9 * b.push);
    const fl = this.#fire;
    fl.light.intensity = 7 * (0.85 + 0.12 * Math.sin(time * 9) + 0.07 * Math.sin(time * 23));
    fl.sprite.scale.setScalar(2.1 + 0.18 * Math.sin(time * 11));
    fl.flames.forEach((f, i) => { f.scale.set(1, 1 + 0.18 * Math.sin(time * (8 + i * 3) + i), 1); f.rotation.y = time * (0.6 + i * 0.4); });
    this.#place();
    this.#renderer.render(this.#scene, this.#camera);
  };

  dispose(): void {
    cancelAnimationFrame(this.#raf);
    this.#resize.disconnect();

    for (const off of this.#off) off();

    for (const o of [...this.#scene.children]) disposeTree(o);
    this.#renderer.dispose();
    this.#renderer.forceContextLoss();
  }
}

function pose(f: Figure): Pose {
  return { x: f.root.position.x, z: f.root.position.z, scale: f.root.scale.x, turn: f.root.rotation.y };
}
