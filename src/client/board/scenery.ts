import * as THREE from 'three';
import type { MapId } from '../../engine/index';
import type { Biome } from '../biome';
import { OFF, glow, mat, merge, mesh, seeded } from './art';

export interface Scenery {
  root: THREE.Group;
  /** Returns the lightning flash 0..1 for Stage to add to its lighting; 0 on maps without lightning. */
  update(time: number): number;
}

const TORCH_SPOTS = [[-OFF - 0.6, -3], [OFF + 0.6, -3], [-OFF - 0.6, 3], [OFF + 0.6, 3], [0, -OFF - 0.6], [0, OFF + 0.6]] as const;

function disc(root: THREE.Group, color: number, radius: number): void {
  const floor = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), mat(color, { roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.32;
  floor.receiveShadow = true;
  root.add(floor);
}

/** Square ring of boxes around the board; heights are boxes sunk 0.3 into the ground. */
function wallRing(root: THREE.Group, rnd: () => number, stone: THREE.Material, minH: number, range: number): void {
  const lim = OFF + 1.2, d = OFF + 1.1, boxes: THREE.Mesh[] = [];

  for (let side = 0; side < 4; side++) for (let k = -lim; k <= lim; k += 1) {
    const h = minH + rnd() * range, b = mesh(new THREE.BoxGeometry(1, h, 0.8), stone), y = h / 2 - 0.3;

    if (side === 0) b.position.set(k, y, -d);
    else if (side === 1) b.position.set(k, y, d);
    else { b.position.set(side === 2 ? -d : d, y, k); b.rotation.y = Math.PI / 2; }

    b.castShadow = b.receiveShadow = true;
    boxes.push(b);
  }

  root.add(merge(boxes));
}

interface Flame { light: THREE.PointLight; sprite: THREE.Sprite; ph: number }

function torches(root: THREE.Group, rnd: () => number, color: number, lightColor: number): Flame[] {
  const bracket = mat(0x3a2a1a);

  return TORCH_SPOTS.map(([x, z]) => {
    const sprite = glow(color, 1.2);
    sprite.position.set(x, 1.5, z);
    root.add(sprite, mesh(new THREE.CylinderGeometry(0.1, 0.05, 0.35, 6), bracket, x, 1.25, z));
    const light = new THREE.PointLight(lightColor, 0.9 * Math.PI, 9, 2);
    light.position.copy(sprite.position);
    root.add(light);

    return { light, sprite, ph: rnd() * 10 };
  });
}

function flicker(fs: readonly Flame[], time: number): void {
  for (const t of fs) {
    t.light.intensity = 0.9 * Math.PI * (0.85 + 0.2 * Math.sin(time * 9 + t.ph) + 0.08 * Math.sin(time * 23 + t.ph));
    t.sprite.scale.setScalar(1.1 + 0.12 * Math.sin(time * 11 + t.ph));
  }
}

/** A clump of grass blades on the ground. */
function tufts(rnd: () => number, m: THREE.Material, x: number, z: number, n: number): THREE.Mesh[] {
  return Array.from({ length: n }, () => {
    const tuft = mesh(new THREE.ConeGeometry(0.08, 0.4 + rnd() * 0.4, 4), m, x + (rnd() - 0.5) * 1.2, -0.1, z + (rnd() - 0.5) * 1.2);
    tuft.rotation.z = (rnd() - 0.5) * 0.4;

    return tuft;
  });
}

function span(b: Biome): Scenery {
  const rnd = seeded(7), root = new THREE.Group();
  const dark = mat(0x332c3c, { roughness: 1 }), lit = mat(0x4a4252, { roughness: 1 }), pillar = mat(b.cap);

  const rock: THREE.Mesh[] = [];

  // Cones hang inside the footprint so only their flanks show past the edges in perspective.
  for (const gx of [-4, 0, 4]) for (const gz of [-4, 0, 4]) {
    const len = 3 + rnd() * 2.7, x = gx + (rnd() - 0.5) * 1.2, z = gz + (rnd() - 0.5) * 1.2;
    const c = mesh(new THREE.ConeGeometry(2.7 + rnd() * 0.4, len, 5), rnd() < 0.5 ? dark : lit, x, -1.6 - len / 2, z);
    c.rotation.set(Math.PI + (rnd() - 0.5) * 0.15, rnd() * 3, (rnd() - 0.5) * 0.15);
    rock.push(c);
  }

  const keel = mesh(new THREE.ConeGeometry(OFF + 1, 3, 6), dark, 0, -3.1, 0);
  keel.rotation.x = Math.PI;
  rock.push(keel);

  for (const m of [dark, lit]) {
    const same = rock.filter(c => c.material === m);

    if (same.length) root.add(merge(same));
  }

  const islets: { g: THREE.Group; y: number; ph: number }[] = [];

  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rnd() * 0.4, r = 11 + rnd() * 7, s = 0.5 + rnd() * 0.9, g = new THREE.Group();
    const y = -6 + rnd() * 5;
    g.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    const top = mesh(new THREE.DodecahedronGeometry(s, 0), lit);
    top.scale.y = 0.45;
    const under = mesh(new THREE.ConeGeometry(s * 0.8, s * 1.8, 5), dark, 0, -s * 0.9, 0);
    under.rotation.x = Math.PI;
    g.add(top, under);

    if (i % 4 === 1) {
      const h = 0.7 + rnd() * 0.8, p = mesh(new THREE.CylinderGeometry(0.22, 0.28, h, 6), pillar, 0, s * 0.3 + h / 2, 0);
      p.rotation.z = (rnd() - 0.5) * 0.2;
      g.add(p);
    }

    root.add(g);
    islets.push({ g, y, ph: rnd() * 6 });
  }

  const motes: { s: THREE.Sprite; x: number; z: number; y: number; ph: number }[] = [];

  for (let i = 0; i < 7; i++) {
    const s = glow(0xb48cff, 0.6, 0.8), a = rnd() * 6.3, r = 6 + rnd() * 8;
    const m = { s, x: Math.cos(a) * r, z: Math.sin(a) * r, y: -1 + rnd() * 4, ph: rnd() * 6 };
    root.add(s);
    motes.push(m);
  }

  for (const x of [-8, 8]) {
    const light = new THREE.PointLight(0xb48cff, 0.5 * Math.PI, 14, 2);
    light.position.set(x, 0.5, 0);
    root.add(light);
  }

  return {
    root,
    update(time) {
      for (const i of islets) {
        i.g.position.y = i.y + 0.25 * Math.sin(time * 0.5 + i.ph);
        i.g.rotation.y = time * 0.05 + i.ph;
      }

      for (const m of motes) m.s.position.set(m.x + Math.sin(time * 0.3 + m.ph) * 0.8, m.y + Math.sin(time * 0.4 + m.ph * 2) * 0.6, m.z + Math.cos(time * 0.3 + m.ph) * 0.8);

      return 0;
    },
  };
}

const RAIN = 700, RAIN_H = 12, RAIN_SPAN = 30, LIGHTNING_EVERY = 7, LIGHTNING_LEN = 0.12;

function storm(): Scenery {
  const rnd = seeded(11), root = new THREE.Group();
  disc(root, 0x0b1216, 40);
  wallRing(root, rnd, mat(0x2e3a3e, { roughness: 0.4 }), 0.65, 0.2);
  const iron = mat(0x2a3036, { metalness: 0.6, roughness: 0.4 }), rods: Flame[] = [];

  for (const [x, z] of TORCH_SPOTS) {
    const sprite = glow(0xbfe6ff, 0.9);
    sprite.position.set(x, 3.05, z);
    root.add(sprite, mesh(new THREE.CylinderGeometry(0.03, 0.06, 3.2, 6), iron, x, 1.3, z));
    const light = new THREE.PointLight(0x9fd8ff, 0.5 * Math.PI, 9, 2);
    light.position.set(x, 2.8, z);
    root.add(light);
    rods.push({ light, sprite, ph: rnd() * 10 });
  }

  const pos = new Float32Array(RAIN * 6), seed = new Float32Array(RAIN * 3);

  for (let i = 0; i < RAIN; i++) {
    seed[i * 3] = (rnd() - 0.5) * RAIN_SPAN;
    seed[i * 3 + 1] = rnd() * RAIN_H;
    seed[i * 3 + 2] = (rnd() - 0.5) * RAIN_SPAN;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9fc4d8, opacity: 0.35, transparent: true }));
  rain.frustumCulled = false;
  root.add(rain);

  return {
    root,
    update(time) {
      const phase = time % LIGHTNING_EVERY, flash = phase < LIGHTNING_LEN ? 1 - phase / LIGHTNING_LEN : 0;

      for (const r of rods) {
        r.light.intensity = 0.5 * Math.PI * (0.8 + 0.25 * Math.sin(time * 13 + r.ph) + 2 * flash);
        r.sprite.scale.setScalar(0.8 + 0.15 * Math.sin(time * 17 + r.ph) + flash);
      }

      for (let i = 0; i < RAIN; i++) {
        const y = (((seed[i * 3 + 1]! - time * 14) % RAIN_H) + RAIN_H) % RAIN_H, x = seed[i * 3]!, z = seed[i * 3 + 2]!, o = i * 6;
        pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
        pos[o + 3] = x + 0.06; pos[o + 4] = y + 0.35; pos[o + 5] = z;
      }

      geo.attributes.position!.needsUpdate = true;

      return flash;
    },
  };
}

function altar(): Scenery {
  const rnd = seeded(13), root = new THREE.Group(), stone = mat(0xa0825a);
  disc(root, 0x2a3818, 40);
  wallRing(root, rnd, stone, 0.5, 0.4);
  const fs = torches(root, rnd, 0xffb05a, 0xffb05a);

  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = sx * (OFF + 2.2), z = sz * (OFF + 2.2);
    const shaft = mesh(new THREE.CylinderGeometry(0.22, 0.42, 3.2, 4), stone, x, 1.3, z);
    shaft.rotation.y = Math.PI / 4;
    shaft.castShadow = true;
    const tip = mesh(new THREE.ConeGeometry(0.22, 0.4, 4), mat(0xb8946a), x, 3.1, z);
    tip.rotation.y = Math.PI / 4;
    const sun = glow(0xffd36b, 1.0, 0.85);
    sun.position.set(x, 3.6, z);
    root.add(shaft, tip, sun);
  }

  const blades = mat(0x6aa03a);

  root.add(merge(Array.from({ length: 14 }, () => {
    const a = rnd() * 6.3, r = OFF + 3 + rnd() * 8;

    return tufts(rnd, blades, Math.cos(a) * r, Math.sin(a) * r, 5);
  }).flat()));

  return { root, update(time) { flicker(fs, time); return 0; } };
}

export const SCENERY: Readonly<Record<MapId, (b: Biome) => Scenery>> = { span, storm, altar };
