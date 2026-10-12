import * as THREE from 'three';
import type { MapId } from '../../engine/index';
import type { Biome } from '../biome';
import { OFF, glow, mat, merge, mesh, seeded } from './art';
import { bake, blades, block, bush, kit, noise2, paint, paintBlock, prep, rock, shade, shaft, tint } from './kit';
import type { Part } from './kit';

export interface Scenery {
  root: THREE.Group;
  /** Returns the lightning flash 0..1 for Stage to add to its lighting; 0 on maps without lightning. */
  update(time: number): number;
}

const TORCH_SPOTS = [[-OFF - 0.6, -3], [OFF + 0.6, -3], [-OFF - 0.6, 3], [OFF + 0.6, 3], [0, -OFF - 0.6], [0, OFF + 0.6]] as const;

const GROUND_Y = -0.55;

const EDGE = OFF + 0.5;

/** Where the plinth's lowest step meets the ground. */
const RIM = EDGE + 1.7;

/** Stone blocks laid in a square band from `inner` to `outer` around the board, tops at `top`, each a little different. */
function band(parts: Part[], rnd: () => number, inner: number, outer: number, top: number, bottom: number, hex: number): void {
  const w = outer - inner, mid = (inner + outer) / 2, h = top - bottom;

  for (let side = 0; side < 4; side++) {
    const len = side < 2 ? outer : inner;

    for (let a = -len; a < len - 0.05;) {
      const l = Math.min(len - a, 0.9 + rnd() * 0.9), c = a + l / 2;
      const g = block(l - 0.04, h, w - 0.04, rnd, 0.06, 0.03).translate(0, top - h / 2, 0);
      paintBlock(g, top, bottom, hex, rnd);

      if (side >= 2) g.rotateY(Math.PI / 2);
      g.translate(side < 2 ? c : (side === 2 ? -mid : mid), 0, side < 2 ? (side === 0 ? -mid : mid) : c);
      parts.push({ slot: 'stone', geo: g });
      a += l;
    }
  }
}

/** The carved plinth the board sits on: a raised lip with medallions at the corners and two broad steps down to the ground. */
function plinth(parts: Part[], rnd: () => number, b: Biome): void {
  const dark = new THREE.Color(b.trim).multiplyScalar(0.82).getHex();
  band(parts, rnd, EDGE, EDGE + 0.7, 0.12, -0.5, b.trim);
  band(parts, rnd, EDGE + 0.7, EDGE + 1.2, -0.17, GROUND_Y - 0.1, dark);
  band(parts, rnd, EDGE + 1.2, RIM, -0.38, GROUND_Y - 0.1, new THREE.Color(dark).multiplyScalar(0.88).getHex());

  // A gilded rail along the lip's inner edge frames the playable stone.
  for (let side = 0; side < 4; side++) {
    const len = 2 * (EDGE + 0.06), g = prep(new THREE.BoxGeometry(len, 0.05, 0.07)).translate(0, 0.145, -(EDGE + 0.06));
    g.rotateY((side * Math.PI) / 2);
    parts.push({ slot: 'metal', geo: shade(tint(g, b.rail), (_p, n) => (n.y > 0.5 ? 1.15 : 0.7)) });
  }

  const tip = new THREE.Color(b.grass).offsetHSL(0.03, 0.05, 0.1).getHex(), root = new THREE.Color(b.ground).multiplyScalar(0.55).getHex();

  for (let i = 0; i < 40; i++) {
    const [x, z] = around(rnd, EDGE + 0.75, RIM + 0.2), y = Math.max(Math.abs(x), Math.abs(z)) < EDGE + 1.2 ? -0.17 : -0.38;
    parts.push({ slot: 'grass', geo: blades(rnd, 14, () => [x + (rnd() - 0.5) * 0.4, y, z + (rnd() - 0.5) * 0.4], [0.1, 0.32], root, tip) });
  }

  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = sx * (EDGE + 0.375), z = sz * (EDGE + 0.375);
    parts.push({ slot: 'stone', geo: paintBlock(block(0.86, 0.3, 0.86, rnd, 0.08).translate(x, 0.27, z), 0.42, 0.12, b.cap, rnd) });
    parts.push({ slot: 'stone', geo: paintBlock(block(0.5, 0.14, 0.5, rnd, 0.05).translate(x, 0.49, z), 0.56, 0.42, b.trim, rnd) });
  }
}

/** Ground that darkens at the foot of the plinth and toward the fog, mottled with patches of a second colour. */
function ground(parts: Part[], hex: number, patch: number, size: number): void {
  const g = prep(new THREE.PlaneGeometry(size, size, 64, 64).rotateX(-Math.PI / 2).translate(0, GROUND_Y, 0));
  const a = new THREE.Color(hex), p = new THREE.Color(patch), c = new THREE.Color();
  parts.push({
    slot: 'plain', geo: paint(g, v => {
      const r = Math.max(Math.abs(v.x), Math.abs(v.z)), n = noise2(v.x * 0.35, v.z * 0.35) * 0.6 + noise2(v.x * 1.3, v.z * 1.3) * 0.4;
      const foot = r < RIM + 0.55 ? 0.55 + 0.45 * Math.min(1, Math.max(0, (r - RIM) / 0.6)) : 1;

      return c.copy(a).lerp(p, Math.max(0, n - 0.45) * 1.8).multiplyScalar((0.75 + 0.4 * n) * foot * (1 - Math.min(0.55, Math.max(0, r - 12) * 0.05)));
    }),
  });
}

/** A point on the ground in the band from `r0` to `r1` around the board, square near the plinth and round far out. */
function around(rnd: () => number, r0: number, r1: number): [number, number] {
  for (;;) {
    const x = (rnd() - 0.5) * 2 * r1 * 1.15, z = (rnd() - 0.5) * 2 * r1 * 1.15;

    if (Math.max(Math.abs(x), Math.abs(z)) >= r0 && Math.hypot(x, z) <= r1 * 1.15) return [x, z];
  }
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

function storm(b: Biome): Scenery {
  const rnd = seeded(11), root = new THREE.Group();
  const parts: Part[] = [];
  plinth(parts, rnd, b);
  ground(parts, b.ground, 0x1a2a2e, 60);

  for (let i = 0; i < 24; i++) {
    const [x, z] = around(rnd, RIM + 0.25, 13);
    parts.push({ slot: 'stone', geo: rock(rnd, 0.2 + rnd() * 0.5, 0x3a464a).translate(x, GROUND_Y - 0.05, z) });
  }

  root.add(...bake(kit(b), parts));
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

function altar(b: Biome): Scenery {
  const rnd = seeded(13), root = new THREE.Group(), parts: Part[] = [];
  plinth(parts, rnd, b);
  ground(parts, b.ground, 0x7a6a3a, 80);
  const fs = torches(root, rnd, 0xffb05a, 0xffb05a);

  for (const f of fs) {
    const p = f.sprite.position, d = Math.sign(p.x || p.z) * 0.35;

    if (p.x) p.x += d; else p.z += d;
    parts.push({ slot: 'stone', geo: shaft(8, 0.2, 0.15, 0.7, rnd, b.trim).translate(p.x, 0.12, p.z) });
    const bowl = prep(new THREE.LatheGeometry([0.05, 0.17, 0.27, 0.3].map((r, i) => new THREE.Vector2(r, i * 0.07)), 10));
    bowl.computeVertexNormals();
    parts.push({ slot: 'metal', geo: shade(tint(bowl.translate(p.x, 0.82, p.z), 0x6a4a2a), q => 0.5 + 0.8 * (q.y - 0.82) / 0.21) });
    p.y = 1.2;
    f.light.position.copy(p).setY(1.45);
  }

  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = sx * (RIM + 0.9), z = sz * (RIM + 0.9);
    parts.push({ slot: 'stone', geo: paintBlock(block(1.1, 0.4, 1.1, rnd, 0.08).translate(x, GROUND_Y + 0.2, z), GROUND_Y + 0.4, GROUND_Y, b.trim, rnd) });
    parts.push({ slot: 'stone', geo: paintBlock(block(0.8, 0.25, 0.8, rnd, 0.06).translate(x, GROUND_Y + 0.52, z), GROUND_Y + 0.65, GROUND_Y + 0.4, b.cap, rnd) });
    parts.push({ slot: 'stone', geo: shaft(4, 0.36, 0.22, 3.1, rnd, b.wall).rotateY(Math.PI / 4).translate(x, GROUND_Y + 0.65, z) });
    const tip = prep(new THREE.ConeGeometry(0.22, 0.42, 4).rotateY(Math.PI / 4));
    tip.computeVertexNormals();
    parts.push({ slot: 'metal', geo: tint(tip.translate(x, GROUND_Y + 3.96, z), 0xe8b65a) });
    const sun = glow(0xffd36b, 1.3, 0.85);
    sun.position.set(x, GROUND_Y + 4.5, z);
    root.add(sun);
  }

  for (let i = 0; i < 7; i++) {
    const [x, z] = around(rnd, RIM + 2, 13), h = 0.6 + rnd() * 1.6;
    parts.push({ slot: 'stone', geo: shaft(10, 0.34, 0.3, h, rnd, b.trim).rotateZ((rnd() - 0.5) * 0.12).translate(x, GROUND_Y, z) });
    parts.push({ slot: 'stone', geo: rock(rnd, 0.25, b.trim).translate(x + 0.5, GROUND_Y, z + 0.2) });
  }

  for (let i = 0; i < 28; i++) {
    const [x, z] = around(rnd, RIM + 0.25, 14);
    parts.push({ slot: 'stone', geo: rock(rnd, 0.18 + rnd() * 0.45, 0x8a7a64).translate(x, GROUND_Y - 0.05, z) });
  }

  for (let i = 0; i < 26; i++) {
    const [x, z] = around(rnd, RIM + 0.35, 14);
    parts.push({ slot: 'plain', geo: bush(rnd, 0.45 + rnd() * 0.5, new THREE.Color(0x3f6a26).offsetHSL((rnd() - 0.5) * 0.05, 0, (rnd() - 0.5) * 0.08).getHex()).translate(x, GROUND_Y, z) });
  }

  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rnd() * 0.4, r = 15 + rnd() * 5, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 1.6 + rnd() * 1.2;
    parts.push({ slot: 'plain', geo: shaft(6, 0.22, 0.14, h, rnd, 0x5a3e26).translate(x, GROUND_Y, z) });

    for (let k = 0; k < 3; k++) parts.push({ slot: 'plain', geo: bush(rnd, 1.2 + rnd() * 0.6, 0x2f5a22).translate(x + (rnd() - 0.5) * 1.2, GROUND_Y + h - 0.6 + k * 0.5, z + (rnd() - 0.5) * 1.2) });
  }

  const root0 = new THREE.Color(b.ground).multiplyScalar(0.6).getHex(), tip = new THREE.Color(b.grass).offsetHSL(0.03, 0.05, 0.14).getHex();

  for (let i = 0; i < 70; i++) {
    const [cx, cz] = around(rnd, RIM + 0.05, 14), r = 0.4 + rnd() * 0.8;
    parts.push({ slot: 'grass', geo: blades(rnd, 70, () => [cx + (rnd() - 0.5) * r * 2, GROUND_Y, cz + (rnd() - 0.5) * r * 2], [0.25, 0.7], root0, tip) });
  }

  parts.push({ slot: 'grass', geo: blades(rnd, 2500, () => { const [x, z] = around(rnd, RIM, 14); return [x, GROUND_Y, z]; }, [0.15, 0.4], root0, tip) });

  for (let i = 0; i < 60; i++) {
    const [x, z] = around(rnd, RIM + 0.15, 13), f = prep(new THREE.IcosahedronGeometry(0.05, 0));
    parts.push({ slot: 'plain', geo: tint(f.translate(x, GROUND_Y + 0.22 + rnd() * 0.15, z), rnd() < 0.5 ? 0xfff0a0 : 0xf4f0ff) });
  }

  root.add(...bake(kit(b), parts));

  return { root, update(time) { flicker(fs, time); return 0; } };
}


export const SCENERY: Readonly<Record<MapId, (b: Biome) => Scenery>> = { span, storm, altar };
