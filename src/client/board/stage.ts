import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Team } from '../../engine/index';
import { OFF, glow, mat, mesh, seeded } from './art';

interface Flicker { light: THREE.PointLight; sprite: THREE.Sprite; ph: number }
interface CamGoal { target: THREE.Vector3; pos: THREE.Vector3; t: number }

/** Renderer, camera, lights and the crypt around the map: everything that outlives a battle. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly world = new THREE.Group();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  readonly controls: OrbitControls;
  readonly lantern = new THREE.PointLight(0xffc27a, 1.3, 7, 2);
  readonly #torches: Flicker[] = [];
  #goal: CamGoal | null = null;
  #shake = 0;
  readonly #shakeOff = new THREE.Vector3();

  constructor(readonly canvas: HTMLCanvasElement) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = r;

    const s = this.scene;
    s.background = new THREE.Color(0x07080d);
    s.fog = new THREE.Fog(0x07080d, 16, 40);
    s.add(this.world);
    s.add(new THREE.HemisphereLight(0x8a9cc8, 0x1a1420, 0.42 * Math.PI));
    s.add(new THREE.AmbientLight(0xffffff, 0.06 * Math.PI));
    const moon = new THREE.DirectionalLight(0xc8d4ff, 0.45 * Math.PI);
    moon.position.set(-6, 16, -4);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    Object.assign(moon.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 50 });
    moon.shadow.bias = -0.0008;
    s.add(moon);
    this.lantern.position.set(0, 2.4, 0);
    s.add(this.lantern);
    this.#buildCrypt();

    const c = new OrbitControls(this.camera, canvas);
    c.enablePan = false;
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.minDistance = 7;
    c.maxDistance = 26;
    c.minPolarAngle = 0.3;
    c.maxPolarAngle = 1.2;
    c.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    c.addEventListener('start', () => { this.#goal = null; });
    this.controls = c;
    this.overview(0, true);
  }

  #buildCrypt(): void {
    const rnd = seeded(7), w = this.world;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 40), mat(0x0d0b10, { roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.32;
    floor.receiveShadow = true;
    w.add(floor);
    const stone = mat(0x4a4450), lim = OFF + 1.2, d = OFF + 1.1;
    for (let side = 0; side < 4; side++) for (let k = -lim; k <= lim; k += 1) {
      const h = 0.5 + rnd() * 0.7, b = mesh(new THREE.BoxGeometry(1, h, 0.8), stone), y = h / 2 - 0.3;
      if (side === 0) b.position.set(k, y, -d);
      else if (side === 1) b.position.set(k, y, d);
      else { b.position.set(side === 2 ? -d : d, y, k); b.rotation.y = Math.PI / 2; }
      b.castShadow = b.receiveShadow = true;
      w.add(b);
    }
    const bracket = mat(0x3a2a1a);
    for (const [x, z] of [[-OFF - 0.6, -3], [OFF + 0.6, -3], [-OFF - 0.6, 3], [OFF + 0.6, 3], [0, -OFF - 0.6], [0, OFF + 0.6]] as const) {
      const sprite = glow(0xff9a4a, 1.2);
      sprite.position.set(x, 1.5, z);
      w.add(sprite, mesh(new THREE.CylinderGeometry(0.1, 0.05, 0.35, 6), bracket, x, 1.25, z));
      const light = new THREE.PointLight(0xff8a3a, 0.9 * Math.PI, 9, 2);
      light.position.copy(sprite.position);
      w.add(light);
      this.#torches.push({ light, sprite, ph: rnd() * 10 });
    }
  }

  resize(): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    const cur = this.renderer.getSize(new THREE.Vector2());
    if (cur.x === w && cur.y === h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Behind `at`, from `team`'s side of the board. */
  follow(at: THREE.Vector3, team: Team): void {
    const side = team === 0 ? -1 : 1, target = at.clone().setY(0);
    this.#goal = { target, pos: target.clone().add(new THREE.Vector3(0, 9.5, 10.5 * side)), t: 0 };
  }
  overview(team: Team, instant = false): void {
    this.#goal = { target: new THREE.Vector3(), pos: new THREE.Vector3(0, 14.5, team === 1 ? 13 : -13), t: instant ? 1 : 0 };
    if (instant) { this.camera.position.copy(this.#goal.pos); this.controls.target.copy(this.#goal.target); this.controls.update(); this.#goal = null; }
  }
  shake(sec: number): void { this.#shake = Math.max(this.#shake, sec); }

  update(dt: number, time: number): void {
    const g = this.#goal;
    if (g) {
      g.t = Math.min(1, g.t + dt * 2.2);
      const k = g.t >= 1 ? 1 : Math.min(1, dt * 4);
      this.controls.target.lerp(g.target, k);
      this.camera.position.lerp(g.pos, k);
      if (g.t >= 1) this.#goal = null;
    }
    for (const t of this.#torches) {
      t.light.intensity = 0.9 * Math.PI * (0.85 + 0.2 * Math.sin(time * 9 + t.ph) + 0.08 * Math.sin(time * 23 + t.ph));
      t.sprite.scale.setScalar(1.1 + 0.12 * Math.sin(time * 11 + t.ph));
    }
    this.controls.update();
  }

  render(dt: number): void {
    if (this.#shake > 0) {
      this.#shake -= dt;
      const k = Math.max(0, this.#shake) / 0.4;
      this.#shakeOff.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.25 * k);
    } else this.#shakeOff.set(0, 0, 0);
    this.camera.position.add(this.#shakeOff);
    this.renderer.render(this.scene, this.camera);
    this.camera.position.sub(this.#shakeOff);
  }

  dispose(): void {
    this.controls.dispose();
    this.renderer.dispose();
  }
}
