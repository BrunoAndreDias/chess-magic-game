import * as THREE from 'three';
import { glow, mat, mesh, seeded } from '../board/art';

/** What a lock-in asks of the camp at one moment. Both at 0 is the camp at rest. */
export interface Mood {
  /** How far night closes in on the front figure: at 1 the fire, sky and fill light are down to a tenth. */
  dark: number;
  /** How far the fire burns in the front figure's class glow instead of its own orange, 0 to 1. */
  fire: number;
}

export const CALM: Mood = { dark: 0, fire: 0 };

/** The place the party gathers: sky, ground, light and the fire they stand around. */
export interface Camp {
  /** Sets the class glow the fire may burn in. */
  tint(glow: number): void;
  /** Animates the camp `time` seconds in, under `mood`. */
  step(time: number, mood: Mood): void;
}

const EMBER = 0xff8a3a;

/** Builds the camp into `scene` around a fire at `fire`, with the key light on the front spot `front`. */
export function buildCamp(scene: THREE.Scene, fire: THREE.Vector3, front: { x: number; z: number }): Camp {
  const s = scene, rnd = seeded(11);
  const sky = new THREE.Color(0x07060a), night = sky.clone();
  s.background = night;
  s.fog = new THREE.Fog(0x07060a, 7, 15);
  const hemi = new THREE.HemisphereLight(0x6a7aa8, 0x120c10, 0.28 * Math.PI);
  s.add(hemi);

  const spot = new THREE.SpotLight(0xffd29a, 40, 14, 0.4, 0.55, 1.6);
  spot.position.set(0.6, 6.5, 5.2);
  spot.target.position.set(front.x, 0.8, front.z);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0008;
  s.add(spot, spot.target);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(16, 48), mat(0x17120f, { roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  s.add(ground);
  const stone = mat(0x3b3540), log = mat(0x4a2f1a), ember = mat(EMBER, { emissive: new THREE.Color(0xff5a1a), emissiveIntensity: 1.4 });

  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, b = mesh(new THREE.DodecahedronGeometry(0.13 + rnd() * 0.05, 0), stone, fire.x + Math.cos(a) * 0.45, 0.06, fire.z + Math.sin(a) * 0.45);
    b.rotation.set(rnd() * 3, rnd() * 3, 0);
    b.castShadow = b.receiveShadow = true;
    s.add(b);
  }

  for (let i = 0; i < 3; i++) {
    const l = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.62, 6), log, fire.x, 0.1, fire.z);
    l.rotation.set(Math.PI / 2 - 0.35, (i / 3) * Math.PI * 2, 0, 'YXZ');
    s.add(l);
  }

  s.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), ember, fire.x, 0.06, fire.z));
  const flames: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>[] = [];
  const own = [0xff5a1a, 0xffa040, 0xffe08a].map(c => new THREE.Color(c));

  for (const [i, [sz, y]] of ([[0.17, 0.26], [0.11, 0.3], [0.06, 0.26]] as const).entries()) {
    const f = mesh(new THREE.ConeGeometry(sz, sz * 3.4, 7), new THREE.MeshBasicMaterial({ color: own[i], transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }), fire.x, y, fire.z);
    flames.push(f);
    s.add(f);
  }

  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2, d = 4.2 + rnd() * 3.5, b = mesh(new THREE.DodecahedronGeometry(0.25 + rnd() * 0.5, 0), stone, Math.cos(a) * d, 0.05, Math.sin(a) * d - 1.5);
    b.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    b.receiveShadow = true;
    s.add(b);
  }

  const sprite = glow(EMBER, 2.2, 0.75);
  sprite.position.set(fire.x, 0.45, fire.z);
  const pool = glow(0xff6a20, 5, 0.18);
  pool.position.set(fire.x, 0.05, fire.z);
  const light = new THREE.PointLight(EMBER, 7, 9, 1.6);
  light.position.set(fire.x, 0.7, fire.z);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  s.add(sprite, pool, light);

  const tinted = new THREE.Color(), cls = new THREE.Color(EMBER), hemiK = hemi.intensity, spotK = spot.intensity;

  return {
    tint(c) { cls.setHex(c); },
    step(time, mood) {
      const lit = 1 - 0.9 * mood.dark;
      light.intensity = 7 * lit * (0.85 + 0.12 * Math.sin(time * 9) + 0.07 * Math.sin(time * 23));
      light.color.setHex(EMBER).lerp(cls, mood.fire);
      sprite.material.color.copy(light.color);
      sprite.scale.setScalar(2.1 + 0.18 * Math.sin(time * 11));
      hemi.intensity = hemiK * lit;
      spot.intensity = spotK * (1 - 0.6 * mood.dark);
      night.copy(sky).multiplyScalar(lit);
      flames.forEach((f, i) => {
        f.scale.set(1, 1 + 0.18 * Math.sin(time * (8 + i * 3) + i), 1);
        f.rotation.y = time * (0.6 + i * 0.4);
        f.material.color.copy(tinted.copy(own[i]!).lerp(cls, mood.fire));
      });
    },
  };
}
