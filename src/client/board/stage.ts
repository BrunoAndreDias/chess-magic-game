import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Team } from '../../engine/index';
import { BIOMES } from '../biome';
import type { MapId } from '../../engine/index';
import { disposeTree } from './art';
import { SCENERY } from './scenery';
import type { Scenery } from './scenery';

const FLASH_SKY = new THREE.Color(0xcfe6ff);
interface CamGoal { target: THREE.Vector3; pos: THREE.Vector3; t: number }

/** Renderer, camera, lights and the scenery around the map: everything that outlives a battle. The map's biome sets the sky, light and scenery. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly world = new THREE.Group();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  readonly controls: OrbitControls;
  readonly lantern = new THREE.PointLight(0xffc27a, 1.3, 7, 2);
  readonly #sky = new THREE.Color();
  readonly #hemi = new THREE.HemisphereLight();
  readonly #ambient = new THREE.AmbientLight();
  readonly #sun = new THREE.DirectionalLight();
  #hemiK = 0;
  #scenery: { map: MapId; s: Scenery } | null = null;
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
    s.background = this.#sky;
    s.fog = new THREE.Fog(0x000000, 1, 2);
    s.add(this.world, this.#hemi, this.#ambient);
    const sun = this.#sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 50 });
    sun.shadow.bias = -0.0008;
    s.add(sun);
    this.setBiome('span');
    this.lantern.position.set(0, 2.4, 0);
    s.add(this.lantern);

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

  setBiome(map: MapId): void {
    if (this.#scenery?.map === map) return;
    const b = BIOMES[map], fog = this.scene.fog as THREE.Fog;
    this.#sky.setHex(b.sky);
    fog.color.setHex(b.sky);
    fog.near = b.fog.near;
    fog.far = b.fog.far;
    this.#hemi.color.setHex(b.hemi.sky);
    this.#hemi.groundColor.setHex(b.hemi.ground);
    this.#hemiK = b.hemi.k;
    this.#hemi.intensity = b.hemi.k * Math.PI;
    this.#ambient.intensity = b.ambient * Math.PI;
    this.#sun.color.setHex(b.sun.color);
    this.#sun.intensity = b.sun.k * Math.PI;
    this.#sun.position.set(...b.sun.pos);
    if (this.#scenery) disposeTree(this.#scenery.s.root);
    const s = SCENERY[map](b);
    this.world.add(s.root);
    this.#scenery = { map, s };
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
    const flash = this.#scenery?.s.update(time) ?? 0, b = this.#scenery ? BIOMES[this.#scenery.map] : null;
    if (b) {
      this.#hemi.intensity = this.#hemiK * Math.PI * (1 + 3 * flash);
      this.#sky.setHex(b.sky).lerp(FLASH_SKY, flash * 0.5);
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
