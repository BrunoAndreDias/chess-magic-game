import * as THREE from 'three';
import { CLASSES, CLASS_ORDER } from '../engine/index';
import type { MapId, Team } from '../engine/index';
import { BIOMES } from './biome';
import { TEAM_HEX, basic, decal, mat, mesh } from './board/art';
import { buildModel, loadFigures } from './board/models';
import { installErrorOverlay } from './overlay';

/** Every class model, both teams: close up on top, at battle distance on a biome's light below. `?biome=span|storm|altar`. After `art/build.sh`, reload to see new figures. */
installErrorOverlay();

const params = new URLSearchParams(location.search);

await loadFigures();

const canvas = document.getElementById('c') as HTMLCanvasElement, names = document.getElementById('names')!;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

renderer.shadowMap.enabled = true;

renderer.setScissorTest(true);

const biomeId = (params.get('biome') ?? 'storm') as MapId, B = BIOMES[biomeId] ?? BIOMES.storm;

function lit(s: THREE.Scene, b = B): void {
  s.background = new THREE.Color(b.sky);
  s.add(new THREE.HemisphereLight(b.hemi.sky, b.hemi.ground, b.hemi.k * Math.PI), new THREE.AmbientLight(0xffffff, b.ambient * Math.PI));
  const sun = new THREE.DirectionalLight(b.sun.color, b.sun.k * Math.PI);
  sun.position.set(...b.sun.pos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
  s.add(sun);
}

const idles: ((time: number) => void)[] = [];

function place(s: THREE.Scene, cls: (typeof CLASS_ORDER)[number], team: Team, x: number, z: number, turn: number): void {
  const root = new THREE.Group(), { body, idle } = buildModel(cls, team);
  root.add(body, decal(new THREE.CircleGeometry(0.44, 28), basic(TEAM_HEX[team], 0.35), 0.02));
  root.position.set(x, 0, z);
  root.rotation.y = turn;

  if (idle) idles.push(idle);
  s.add(root);
}

const close = new THREE.Scene();

lit(close, { ...B, ambient: B.ambient + 0.08, hemi: { ...B.hemi, k: B.hemi.k + 0.25 } });

const closeCam = new THREE.PerspectiveCamera(22, 1, 0.1, 80);

closeCam.position.set(0, 2.4, 13);

closeCam.lookAt(0, 0.8, 0);

const floor = mesh(new THREE.PlaneGeometry(40, 10), mat(B.floor[0], { roughness: 0.9 }));

floor.rotation.x = -Math.PI / 2;

floor.receiveShadow = true;

close.add(floor);

CLASS_ORDER.forEach((cls, i) => {
  for (const team of [0, 1] as const) place(close, cls, team, (i - 1.5) * 2.6 + (team ? 0.55 : -0.55), 0, team ? -0.5 : 0.5);
});

const far = new THREE.Scene();

lit(far);

const farCam = new THREE.PerspectiveCamera(45, 1, 0.1, 200);

farCam.position.set(0, 9.5, -10.5);

farCam.lookAt(0, 0, 0);

for (let x = -4; x <= 3; x++) for (let z = -2; z <= 1; z++) {
  const t = mesh(new THREE.BoxGeometry(0.96, 0.3, 0.96), mat(B.floor[(x + z) & 1]!, { roughness: B.floorRough }), x + 0.5, -0.15, z + 0.5);
  t.receiveShadow = true;
  far.add(t);
}

CLASS_ORDER.forEach((cls, i) => {
  place(far, cls, 0, (i - 1.5) * 2 + 0.5, -0.5, 0);
  place(far, cls, 1, (i - 1.5) * 2 - 0.5, 1.5, Math.PI);
});

const label = CLASS_ORDER.map(cls => {
  const d = document.createElement('div');
  d.textContent = CLASSES[cls].name;
  d.style.color = CLASSES[cls].color;
  names.appendChild(d);

  return d;
});

function frame(t: number): void {
  requestAnimationFrame(frame);
  const w = canvas.clientWidth, h = canvas.clientHeight, split = Math.round(h * 0.55);

  if (renderer.getSize(new THREE.Vector2()).x !== w) renderer.setSize(w, h, false);

  for (const f of idles) f(t / 1000);
  closeCam.aspect = w / split;
  closeCam.updateProjectionMatrix();
  // The battle camera's 45° spans the whole window; this strip shows the same pixels per metre.
  farCam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(22.5)) * ((h - split) / h)));
  farCam.aspect = w / (h - split);
  farCam.updateProjectionMatrix();
  label.forEach((d, i) => { d.style.left = `${((i + 0.5) / 4) * 100}%`; d.style.top = '14px'; });
  renderer.setViewport(0, h - split, w, split);
  renderer.setScissor(0, h - split, w, split);
  renderer.render(close, closeCam);
  renderer.setViewport(0, 0, w, h - split);
  renderer.setScissor(0, 0, w, h - split);
  renderer.render(far, farCam);
}

requestAnimationFrame(frame);
