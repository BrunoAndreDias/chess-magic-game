import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Biome } from '../biome';
import { keep } from './art';

/**
 * The procedural board kit: painted canvas textures, bevelled and jittered stone, grass blades, rocks and foliage, all built at load time
 * from the biome. Every piece is a Part, a non-indexed geometry with position, normal, uv and colour in its owner's local space, and
 * `bake` merges the parts that share a slot into one mesh, so a whole board draws in a handful of calls.
 */
export type Slot = 'stone' | 'plain' | 'metal' | 'grass';

export interface Part { slot: Slot; geo: THREE.BufferGeometry }

export type Kit = Readonly<Record<Slot, THREE.Material>>;

/** Drives the grass sway of every kit; one value for the whole scene. */
export const SWAY = { value: 0 };

const SLOT_SHADOW: Readonly<Record<Slot, { cast: boolean; receive: boolean }>> = {
  stone: { cast: true, receive: true },
  plain: { cast: true, receive: true },
  metal: { cast: true, receive: true },
  grass: { cast: false, receive: true },
};

/** A cheap hash noise in [0, 1). */
export function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;

  return s - Math.floor(s);
}

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

/** Smooth value noise in [0, 1). */
export function noise2(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash3(ix, 0, iz), b = hash3(ix + 1, 0, iz), c = hash3(ix, 0, iz + 1), d = hash3(ix + 1, 0, iz + 1);

  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

/** Four 512px stone faces, each painted with mottling, strokes, chipped and mossy edges and a crack or two. Tiles pick a quadrant and a turn. */
function stoneAtlas(moss: number, rnd: () => number): THREE.CanvasTexture {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S * 2;
  const g = c.getContext('2d')!, mossCss = `#${moss.toString(16).padStart(6, '0')}`;

  for (let q = 0; q < 4; q++) {
    const ox = (q % 2) * S, oy = Math.floor(q / 2) * S;
    g.save();
    g.beginPath();
    g.rect(ox, oy, S, S);
    g.clip();
    g.fillStyle = '#e9e3d9';
    g.fillRect(ox, oy, S, S);

    for (let i = 0; i < 70; i++) {
      const x = ox + rnd() * S, y = oy + rnd() * S, r = 30 + rnd() * 140, light = rnd() < 0.5;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, light ? 'rgba(255,252,244,0.45)' : 'rgba(150,140,128,0.28)');
      gr.addColorStop(1, light ? 'rgba(255,252,244,0)' : 'rgba(150,140,128,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }

    for (let i = 0; i < 220; i++) {
      const x = ox + rnd() * S, y = oy + rnd() * S, r = 4 + rnd() * 14;
      g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,250,0.14)' : 'rgba(110,100,90,0.12)';
      g.beginPath();
      g.ellipse(x, y, r, r * (0.6 + rnd() * 0.4), rnd() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }

    for (let i = 0; i < 900; i++) {
      g.fillStyle = rnd() < 0.6 ? 'rgba(80,70,60,0.25)' : 'rgba(255,255,255,0.3)';
      g.fillRect(ox + rnd() * S, oy + rnd() * S, 1 + rnd() * 2.5, 1 + rnd() * 2.5);
    }

    // Painted occlusion along the border, so the stone reads as rounded even under flat light.
    for (const [x0, y0, x1, y1] of [[ox, oy, ox + 60, oy], [ox + S, oy, ox + S - 60, oy], [ox, oy, ox, oy + 60], [ox, oy + S, ox, oy + S - 60]] as const) {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(70,60,50,0.55)');
      gr.addColorStop(1, 'rgba(70,60,50,0)');
      g.fillStyle = gr;
      g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.max(Math.abs(x1 - x0), y0 === y1 ? S : 0), Math.max(Math.abs(y1 - y0), x0 === x1 ? S : 0));
    }

    for (let i = 0; i < 9; i++) {
      const side = Math.floor(rnd() * 4), t = 40 + rnd() * (S - 80), w = 20 + rnd() * 50, d = 10 + rnd() * 26;

      const at = (u: number, v: number): [number, number] =>
        side === 0 ? [ox + u, oy + v] : side === 1 ? [ox + u, oy + S - v] : side === 2 ? [ox + v, oy + u] : [ox + S - v, oy + u];

      g.fillStyle = 'rgba(60,50,42,0.6)';
      g.beginPath();
      g.moveTo(...at(t - w / 2, 0));
      g.lineTo(...at(t - w / 4, d * (0.6 + rnd() * 0.4)));
      g.lineTo(...at(t + w / 5, d));
      g.lineTo(...at(t + w / 2, 0));
      g.fill();
      g.strokeStyle = 'rgba(255,250,236,0.55)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(...at(t - w / 4, d * 0.8 + 3));
      g.lineTo(...at(t + w / 5, d + 3));
      g.stroke();
    }

    for (let k = 0, n = 1 + Math.floor(rnd() * 2); k < n; k++) {
      let x = ox + (rnd() < 0.5 ? 0 : S), y = oy + rnd() * S, a = x === ox ? 0 : Math.PI;
      const pts: [number, number][] = [[x, y]];

      for (let i = 0, len = 6 + Math.floor(rnd() * 7); i < len; i++) {
        a += (rnd() - 0.5) * 1.3;
        x += Math.cos(a) * (18 + rnd() * 22);
        y += Math.sin(a) * (18 + rnd() * 22);
        pts.push([x, y]);
      }

      for (const [col, w, dy] of [['rgba(255,248,232,0.5)', 3, 2], ['rgba(40,32,26,0.75)', 2.5, 0]] as const) {
        g.strokeStyle = col;
        g.lineWidth = w;
        g.beginPath();
        pts.forEach(([px, py], i) => (i ? g.lineTo(px, py + dy) : g.moveTo(px, py + dy)));
        g.stroke();
      }

      for (const [px, py] of pts) if (rnd() < 0.4) {
        g.fillStyle = mossCss;
        g.globalAlpha = 0.35 + rnd() * 0.3;
        g.beginPath();
        g.arc(px, py, 3 + rnd() * 6, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
    }

    for (let i = 0; i < 26; i++) {
      const side = Math.floor(rnd() * 4), t = rnd() * S, r = 5 + rnd() * 16;
      const [x, y] = side === 0 ? [ox + t, oy + rnd() * 10] : side === 1 ? [ox + t, oy + S - rnd() * 10] : side === 2 ? [ox + rnd() * 10, oy + t] : [ox + S - rnd() * 10, oy + t];
      g.fillStyle = mossCss;
      g.globalAlpha = 0.25 + rnd() * 0.4;
      g.beginPath();
      g.ellipse(x, y, r, r * 0.6, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }

    g.globalAlpha = 1;
    g.restore();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;

  return t;
}

/** Blades lean in a wind that only the vertex shader knows; the base stays planted because sway grows with the blade's height. */
function grassMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  m.onBeforeCompile = shader => {
    shader.uniforms.uTime = SWAY;
    shader.vertexShader = `uniform float uTime;\nattribute float sway;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 swW = modelMatrix * vec4(transformed, 1.0);
      float swK = sway * sway;
      transformed.x += swK * (0.07 * sin(uTime * 1.6 + swW.x * 0.8 + swW.z * 0.5) + 0.025 * sin(uTime * 3.7 + swW.z * 2.9));
      transformed.z += swK * 0.05 * sin(uTime * 1.2 + swW.x * 0.4 - swW.z * 0.9);`);
    // Blades light the same from both sides: their normals point up, and a back face must not flip them.
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;'));
  };

  return m;
}

const KITS = new Map<Biome, Kit>();

/** The materials one biome's board and scenery share. Made once per biome and kept for the session. */
export function kit(b: Biome): Kit {
  const had = KITS.get(b);

  if (had) return had;

  const k: Kit = {
    stone: keep(new THREE.MeshStandardMaterial({ map: stoneAtlas(b.moss, seededLocal(b.moss)), vertexColors: true, roughness: b.floorRough })),
    plain: keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })),
    metal: keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.6 })),
    grass: keep(grassMaterial()),
  };

  KITS.set(b, k);

  return k;
}

function seededLocal(seed: number): () => number {
  let s = (seed % 2147483646) + 1;

  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/** One mesh per slot from `parts`, each part moved by its offset. */
export function bake(k: Kit, parts: readonly Part[]): THREE.Mesh[] {
  const by = new Map<Slot, THREE.BufferGeometry[]>();

  for (const p of parts) {
    const list = by.get(p.slot) ?? [];
    list.push(p.geo);
    by.set(p.slot, list);
  }

  return [...by].map(([slot, geos]) => {
    const geo = mergeGeometries(geos);

    if (!geo) throw new Error(`bake: ${slot} parts have mismatched attributes`);
    const m = new THREE.Mesh(geo, k[slot]);
    m.castShadow = SLOT_SHADOW[slot].cast;
    m.receiveShadow = SLOT_SHADOW[slot].receive;

    return m;
  });
}

/** A non-indexed copy carrying position, normal, uv and a white colour, the attribute set every slot merges on. */
export function prep(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src.clone();
  src.dispose();
  const n = g.attributes.position!.count;

  if (!g.attributes.normal) g.computeVertexNormals();

  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));

  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);

  return g;
}

const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Color();

/** Multiply each vertex colour by the colour `f` returns for its position and normal. */
export function paint(g: THREE.BufferGeometry, f: (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color): THREE.BufferGeometry {
  const pos = g.attributes.position!, nor = g.attributes.normal!, col = g.attributes.color!;

  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i);
    _n.fromBufferAttribute(nor, i);
    const k = f(_p, _n);
    col.setXYZ(i, col.getX(i) * k.r, col.getY(i) * k.g, col.getZ(i) * k.b);
  }

  return g;
}

/** Multiply each vertex colour by the grey `f` returns for its position and normal. */
export function shade(g: THREE.BufferGeometry, f: (p: THREE.Vector3, n: THREE.Vector3) => number): THREE.BufferGeometry {
  return paint(g, (p, n) => _c.setScalar(f(p, n)));
}

export function tint(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);

  return paint(g, () => c);
}

/** Moves every vertex by `amp` of noise keyed on its position, so seams shared by duplicate vertices stay closed. */
export function jitter(g: THREE.BufferGeometry, amp: number, seed: number): THREE.BufferGeometry {
  const pos = g.attributes.position!;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), qx = Math.round(x * 500), qy = Math.round(y * 500), qz = Math.round(z * 500);
    pos.setXYZ(i, x + (hash3(qx, qy, qz + seed) - 0.5) * amp, y + (hash3(qy, qz, qx + seed) - 0.5) * amp, z + (hash3(qz, qx, qy + seed) - 0.5) * amp);
  }

  return g;
}

/** A bevelled stone block centred on the origin. Its uvs land in one quadrant of the stone atlas at one of four turns. */
export function block(w: number, h: number, d: number, rnd: () => number, bevel = 0.06, amp = 0.025): THREE.BufferGeometry {
  const g = jitter(prep(new RoundedBoxGeometry(w, h, d, 1, Math.min(bevel, w / 2, h / 2, d / 2))), amp, Math.floor(rnd() * 1000));
  const uv = g.attributes.uv!, q = Math.floor(rnd() * 4), turn = Math.floor(rnd() * 4), ox = (q % 2) * 0.5, oy = Math.floor(q / 2) * 0.5;

  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i), v = uv.getY(i);

    for (let r = 0; r < turn; r++) [u, v] = [1 - v, u];
    uv.setXY(i, ox + 0.004 + u * 0.492, oy + 0.004 + v * 0.492);
  }

  return g;
}

const COOL = new THREE.Color(0.6, 0.66, 0.98), WHITE = new THREE.Color(1, 1, 1), SIDE = new THREE.Color();

/** Shade a block like a painted miniature: lit bevels, sides falling into shadow toward `floor`, and darker low down. */
export function paintBlock(g: THREE.BufferGeometry, top: number, floor: number, hex: number, rnd: () => number): THREE.BufferGeometry {
  const base = new THREE.Color(hex).offsetHSL((rnd() - 0.5) * 0.035, (rnd() - 0.5) * 0.16, (rnd() - 0.5) * 0.09);
  tint(g, base.getHex());

  return paint(g, (p, n) => {
    if (n.y > 0.95) return SIDE.setScalar(1.02);

    if (n.y > 0.2) return SIDE.setScalar(1.18);
    const t = Math.min(1, Math.max(0, (p.y - floor) / Math.max(0.01, top - floor)));

    // Shadowed sides sink toward a cool violet instead of black, the warm/cool split a painter puts on a lit block.
    return SIDE.copy(COOL).lerp(WHITE, t).multiplyScalar(0.5 + 0.45 * t);
  });
}

/** Thin tapered blade cards, darker at the root and sun-bleached at the tip. `spot` places each blade in the owner's space. */
export function blades(rnd: () => number, n: number, spot: () => [number, number, number], h: readonly [number, number], root: number, tip: number): THREE.BufferGeometry {
  const pos: number[] = [], sway: number[] = [], col: number[] = [];
  const r = new THREE.Color(root), t = new THREE.Color(tip), mid = new THREE.Color();

  for (let i = 0; i < n; i++) {
    const [x, y, z] = spot(), len = h[0] + rnd() * (h[1] - h[0]), w = 0.035 + rnd() * 0.03, a = rnd() * Math.PI;
    const ca = Math.cos(a) * w, sa = Math.sin(a) * w, lean = (rnd() - 0.5) * 0.5, lx = Math.cos(a + 1.57) * lean * len, lz = Math.sin(a + 1.57) * lean * len;
    const hue = (rnd() - 0.5) * 0.05, light = (rnd() - 0.5) * 0.12;
    const P = (k: number, side: number): [number, number, number] => [x + ca * side * (1 - k) + lx * k * k, y + len * k, z + sa * side * (1 - k) + lz * k * k];
    const ring: [number, number, number][] = [P(0, -1), P(0, 1), P(0.5, -1), P(0.5, 1), P(1, 0)];
    const ks = [0, 0, 0.5, 0.5, 1];

    for (const [a0, b0, c0] of [[0, 1, 2], [1, 3, 2], [2, 3, 4]] as const) for (const v of [a0, b0, c0]) {
      pos.push(...ring[v]!);
      const k = ks[v]!;
      sway.push(k);
      mid.copy(r).lerp(t, k).offsetHSL(hue, 0, light);
      col.push(mid.r, mid.g, mid.b);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: pos.length }, (_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('sway', new THREE.Float32BufferAttribute(sway, 1));

  return g;
}

/** A chunky faceted boulder resting on y = 0. */
export function rock(rnd: () => number, size: number, hex: number): THREE.BufferGeometry {
  const g = prep(new THREE.IcosahedronGeometry(size, 1));
  g.scale(1 + rnd() * 0.5, 0.55 + rnd() * 0.35, 1 + rnd() * 0.4);
  g.rotateY(rnd() * 6.3);
  jitter(g, size * 0.35, Math.floor(rnd() * 999));
  g.computeVertexNormals();
  g.translate(0, size * 0.25, 0);
  tint(g, new THREE.Color(hex).offsetHSL(0, 0, (rnd() - 0.5) * 0.06).getHex());

  return shade(g, (p, n) => (0.55 + 0.3 * Math.max(0, n.y) + 0.25 * Math.min(1, Math.max(0, p.y / size))));
}

/** A soft round shrub: overlapping spheres with normals pointing out of the whole clump, so it shades as one mass. */
export function bush(rnd: () => number, size: number, hex: number): THREE.BufferGeometry {
  const balls: THREE.BufferGeometry[] = [];

  for (let i = 0, n = 3 + Math.floor(rnd() * 3); i < n; i++) {
    const r = size * (0.45 + rnd() * 0.35), a = rnd() * 6.3, d = size * 0.45 * rnd();
    const g = prep(new THREE.IcosahedronGeometry(r, 1));
    jitter(g, r * 0.25, i * 13);
    g.translate(Math.cos(a) * d, r * 0.75 + rnd() * size * 0.25, Math.sin(a) * d);
    balls.push(g);
  }

  const g = mergeGeometries(balls)!;

  for (const b of balls) b.dispose();
  const pos = g.attributes.position!, nor = g.attributes.normal!, c = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    c.fromBufferAttribute(pos, i).sub(new THREE.Vector3(0, size * 0.4, 0)).normalize();
    nor.setXYZ(i, c.x, c.y, c.z);
  }

  const base = new THREE.Color(hex), lit = base.clone().offsetHSL(0.04, 0.05, 0.12);

  return paint(g, (p, n) => base.clone().lerp(lit, Math.max(0, n.y) * 0.8).multiplyScalar(0.55 + 0.45 * Math.min(1, p.y / (size * 1.2))));
}

/** A tapered n-sided shaft, like an obelisk or a column, standing on y = 0. */
export function shaft(sides: number, rBot: number, rTop: number, h: number, rnd: () => number, hex: number): THREE.BufferGeometry {
  const g = prep(new THREE.CylinderGeometry(rTop, rBot, h, sides, 3));
  g.computeVertexNormals();
  g.translate(0, h / 2, 0);
  jitter(g, 0.02, Math.floor(rnd() * 999));
  tint(g, hex);

  return shade(g, p => 0.5 + 0.55 * Math.min(1, p.y / h));
}
