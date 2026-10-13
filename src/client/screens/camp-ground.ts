import * as THREE from 'three';
import { blades, block, bush, jitter, noise2, paint, paintBlock, prep, shade, shaft, tint } from '../board/kit';
import { NOISE_GLSL, QUAD_GLSL, loose, merged, owns, particles, runeTexture, shader } from './camp-art';
import type { Air } from './camp-art';

const GROUND_R = 34, FIREFLIES = 26;

/**
 * The broken ring of standing stones around the fire, open toward the camera. `deg` runs round the fire from +x, so 90 faces
 * the camera and 270 stands straight behind the party; `r` is the distance from the fire. A lying stone has fallen outward.
 */
const RING: readonly { deg: number; r: number; w: number; h: number; d: number; lean: number; lying?: boolean }[] = [
  { deg: 146, r: 5.6, w: 0.8, h: 2.1, d: 0.5, lean: 0.05 },
  { deg: 168, r: 5.4, w: 0.8, h: 2.7, d: 0.5, lean: -0.04 },
  { deg: 191, r: 5.7, w: 1.0, h: 0.55, d: 2.1, lean: 0, lying: true },
  { deg: 212, r: 5.5, w: 0.95, h: 3.0, d: 0.55, lean: 0.03 },
  { deg: 228, r: 5.7, w: 0.8, h: 1.0, d: 0.5, lean: -0.1 },
  { deg: 306, r: 5.6, w: 0.9, h: 2.6, d: 0.55, lean: 0.06 },
  { deg: 327, r: 5.4, w: 1.0, h: 2.9, d: 0.55, lean: -0.03 },
  { deg: 349, r: 5.7, w: 0.9, h: 0.5, d: 1.9, lean: 0, lying: true },
  { deg: 12, r: 5.5, w: 0.8, h: 1.7, d: 0.45, lean: 0.1 },
  { deg: 34, r: 5.6, w: 0.75, h: 2.3, d: 0.5, lean: -0.05 },
];

const MOSS = new THREE.Color(0x6f8a52);

const GRASS_MAT_FIX = (s: THREE.WebGLProgramParametersWithUniforms): void => {
  // Blades light the same from both sides: their normals point up, and a back face must not flip them.
  s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>',
    THREE.ShaderChunk.normal_fragment_begin.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;', 'float faceDirection = 1.0;'));
};

const MIST_VERT = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const MIST_FRAG = /* glsl */ `
uniform float uDrift, uDark, uFire;
uniform vec3 uGlow, uMist, uCentre;
varying vec3 vW;
${NOISE_GLSL}
void main() {
  float r = length(vW.xz - uCentre.xz);
  vec2 q = vW.xz * 0.2 + vec2(uDrift * 0.04, uDrift * 0.015) + vW.y * 7.0;
  float n = fbm(q + 1.5 * fbm(q * 0.7 - uDrift * 0.02));
  float a = smoothstep(0.35, 0.75, n) * smoothstep(3.4, 6.5, r) * (1.0 - smoothstep(11.0, 17.0, r)) * (0.6 - vW.y * 0.55);
  vec3 col = mix(uMist, uGlow * 0.45, uFire * 0.3) * (1.0 - 0.9 * uDark);
  gl_FragColor = vec4(col, a * (1.0 - 0.5 * uDark));
  #include <colorspace_fragment>
}`;

/** aData: phase, wander speed, blink rate, spare. */
const FLY_VERT = /* glsl */ `
uniform float uTime, uDrift, uDark;
${QUAD_GLSL}
varying vec3 vCol;
void main() {
  float s = aData.y, p = aData.x * 6.2832;
  vec3 at = position + vec3(sin(uDrift * s + p) * 0.6, sin(uDrift * s * 1.3 + p * 2.0) * 0.2, cos(uDrift * s * 0.8 + p * 3.0) * 0.6);
  gl_Position = billboard(at, 0.07);
  float blink = pow(0.5 + 0.5 * sin(uTime * aData.z + p * 5.0), 5.0);
  vCol = vec3(0.8, 1.0, 0.42) * blink * (1.0 - 0.85 * uDark);
}`;

const FLY_FRAG = /* glsl */ `
varying vec2 vC;
varying vec3 vCol;
void main() {
  float r = length(vC);
  gl_FragColor = vec4(vCol * (pow(1.0 - smoothstep(0.0, 1.0, r), 3.0) + 2.5 * (1.0 - smoothstep(0.0, 0.18, r))), 1.0);
  #include <colorspace_fragment>
}`;

/**
 * A point at distance `r0` to `r1` from `c`, kept out of the wedge between the party and the camera, and out of the lane
 * behind the front figure that the resting camera sees its head against.
 */
function aside(rnd: () => number, c: THREE.Vector3, r0: number, r1: number): [number, number] {
  for (;;) {
    const t = rnd() * Math.PI * 2, d = r0 + rnd() * (r1 - r0), x = c.x + Math.cos(t) * d, z = c.z + Math.sin(t) * d;

    const front = z < 2 || Math.abs(x) > 3.2 + (z - 2) * 0.4, lane = z < -1 && Math.abs(x) < 0.5 + 0.1 * (7.6 - z);

    if (front && !lane) return [x, z];
  }
}

/** Packed earth round the hearth, giving way to dark grass that fades toward the fog; uv tiles the dirt grain every 1.7 m. */
function groundGeometry(c: THREE.Vector3): THREE.BufferGeometry {
  const g = new THREE.RingGeometry(0.001, 1, 128, 56), pos = g.attributes.position!;

  // Rings crowd toward the fire, where the camera looks closest.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), r = Math.hypot(x, y), k = (GROUND_R * r ** 1.8) / Math.max(r, 1e-6);
    pos.setXY(i, x * k, y * k);
  }

  g.rotateX(-Math.PI / 2).translate(c.x, 0, c.z);
  const uv = g.attributes.uv!;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3));

  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 1.7, pos.getZ(i) / 1.7);
  const dirt = new THREE.Color(0x4a3e33), dirt2 = new THREE.Color(0x342b25), ash = new THREE.Color(0x1c1918), grass = new THREE.Color(0x253226), grass2 = new THREE.Color(0x182019), col = new THREE.Color(), alt = new THREE.Color();

  return paint(g, v => {
    const r = Math.hypot(v.x - c.x, v.z - c.z), n = noise2(v.x * 0.6, v.z * 0.6) * 0.65 + noise2(v.x * 2.1, v.z * 2.1) * 0.35;
    col.copy(dirt).lerp(dirt2, THREE.MathUtils.smoothstep(n, 0.35, 0.75));
    alt.copy(grass).lerp(grass2, THREE.MathUtils.smoothstep(n, 0.3, 0.7));
    col.lerp(alt, THREE.MathUtils.smoothstep(r + (n - 0.5) * 1.6, 2.6, 4.2)).lerp(ash, 1 - THREE.MathUtils.smoothstep(r, 0.35, 0.75));

    return col.multiplyScalar(1 - 0.55 * THREE.MathUtils.smoothstep(r, 5, 20));
  });
}

/** Flat stones laid round the fire pit. */
function hearth(rnd: () => number, c: THREE.Vector3): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [], n = 13;

  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.12, r = 0.78 + (rnd() - 0.5) * 0.06, h = 0.06;
    const g = block(0.34 + rnd() * 0.06, h, 0.3 + rnd() * 0.08, rnd, 0.025, 0.012);
    paintBlock(g, h / 2, -h / 2, 0x5c5550, rnd);
    out.push(g.rotateY(-t + Math.PI / 2).translate(c.x + Math.cos(t) * r, h / 2 - 0.025, c.z + Math.sin(t) * r));
  }

  return out;
}

/** Narrows a standing stone toward its top, so it reads as a menhir and not a box. */
function taper(g: THREE.BufferGeometry, h: number): void {
  const pos = g.attributes.position!;

  for (let i = 0; i < pos.count; i++) {
    const k = Math.max(0, pos.getY(i)) / h;
    pos.setXYZ(i, pos.getX(i) * (1 - 0.35 * k * k), pos.getY(i), pos.getZ(i) * (1 - 0.2 * k));
  }
}

/** A standing stone's place: on the ring, turned so its face looks at the fire, leaning a little. */
function placement(s: (typeof RING)[number], c: THREE.Vector3): THREE.Matrix4 {
  const t = THREE.MathUtils.degToRad(s.deg), x = c.x + Math.cos(t) * s.r, z = c.z + Math.sin(t) * s.r;

  return new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(s.lean, Math.atan2(-Math.cos(t), -Math.sin(t)), s.lean * 0.6, 'YXZ')), new THREE.Vector3(1, 1, 1));
}

/** The stones themselves and, on each one still standing tall, a rune on the face toward the fire. */
function ring(rnd: () => number, c: THREE.Vector3) {
  const stones: THREE.BufferGeometry[] = [], runes: THREE.BufferGeometry[] = [], lichen = new THREE.Color();

  for (const [i, s] of RING.entries()) {
    const m = placement(s, c), g = block(s.w, s.h, s.d, rnd, 0.09, 0.07).translate(0, s.h / 2 - (s.lying ? 0.12 : 0.05), 0);

    if (!s.lying) taper(g, s.h);
    paintBlock(g, s.h, 0, 0x45434f, rnd);
    paint(g, p => lichen.setRGB(1, 1, 1).lerp(MOSS, 0.5 * THREE.MathUtils.smoothstep(noise2(p.x * 3 + i, p.y * 3), 0.55, 0.8) * (1 - Math.min(1, p.y / s.h))));
    stones.push(g.applyMatrix4(m));

    if (s.lying || s.h < 1.5) continue;
    const q = i % 4, rune = new THREE.PlaneGeometry(0.36, 0.5).translate(0, s.h * 0.55, (s.d / 2) * 0.89 + 0.03), uv = rune.attributes.uv!;

    for (let k = 0; k < uv.count; k++) uv.setXY(k, (q % 2) * 0.5 + uv.getX(k) * 0.5, Math.floor(q / 2) * 0.5 + uv.getY(k) * 0.5);
    runes.push(rune.applyMatrix4(m));
  }

  return { stones, runes };
}

/** A dark pine a metre tall: a trunk under three stacked boughs, the tops of the boughs catching the moon. */
function pine(rnd: () => number): THREE.BufferGeometry {
  const parts = [shaft(5, 0.035, 0.022, 0.35, rnd, 0x15100d)];

  for (let k = 0; k < 3; k++) {
    const r = (0.95 - k * 0.24) * 0.28, ch = 0.45 - k * 0.06, y = 0.22 + k * 0.22;
    const g = jitter(prep(new THREE.ConeGeometry(r, ch, 8, 2).rotateY(rnd() * 3).translate(0, y + ch / 2, 0)), r * 0.25, Math.floor(rnd() * 999));
    g.computeVertexNormals();
    parts.push(shade(tint(g, 0x111c18), (p, n) => 0.55 + 0.6 * Math.max(0, n.y) * (0.6 + 0.4 * Math.min(1, (p.y - y) / ch))));
  }

  return merged(parts);
}

/** A bare dead tree a metre tall: a leaning trunk and three crooked limbs. */
function snag(rnd: () => number): THREE.BufferGeometry {
  const parts = [shaft(5, 0.05, 0.02, 1, rnd, 0x1d1714).rotateZ(0.08)];

  for (let k = 0; k < 3; k++) parts.push(shaft(4, 0.02, 0.007, 0.3 + rnd() * 0.2, rnd, 0x1d1714).rotateZ((k % 2 ? 1 : -1) * (0.6 + rnd() * 0.4)).rotateY(rnd() * 6).translate(0, 0.45 + k * 0.15, 0));

  return merged(parts);
}

/** `n` copies of `kinds` set at `spot`, each scaled by `size` and turned, so a whole treeline costs a few builds. */
function scatter(kinds: readonly THREE.BufferGeometry[], n: number, rnd: () => number, spot: () => [number, number], size: (kind: number) => number): THREE.BufferGeometry[] {
  return Array.from({ length: n }, (_, i) => {
    const [x, z] = spot(), k = i % kinds.length, s = size(k);

    return kinds[k]!.clone().scale(s, s, s).rotateY(rnd() * 6.3).translate(x, 0, z);
  });
}

/** What is left of an arched gate, `r` from `c` at `deg` and facing it: two piers, one broken short, and the lintel that fell from it. */
function gate(rnd: () => number, c: THREE.Vector3, deg: number, r: number): THREE.BufferGeometry[] {
  const t = THREE.MathUtils.degToRad(deg), x = c.x + Math.cos(t) * r, z = c.z + Math.sin(t) * r, turn = Math.atan2(-Math.cos(t), -Math.sin(t));

  const col = 0x3e3b47, parts = [
    paintBlock(block(0.9, 3.4, 0.9, rnd, 0.08, 0.05).translate(-1.5, 1.7, 0), 3.4, 0, col, rnd),
    paintBlock(block(0.9, 2.2, 0.9, rnd, 0.08, 0.06).translate(1.5, 1.1, 0), 2.2, 0, col, rnd),
    paintBlock(block(2.6, 0.6, 0.9, rnd, 0.08, 0.05).translate(-0.55, 3.7, 0), 4.0, 3.4, col, rnd),
    paintBlock(block(1.6, 0.55, 0.85, rnd, 0.08, 0.05).rotateZ(0.5).translate(2.3, 0.35, 0.9), 0.6, 0, col, rnd),
  ];

  return parts.map(g => g.rotateY(turn).translate(x, 0, z));
}

export interface Ground {
  /** The hearth and the stone ring, which the fire throws shadows from. */
  near: THREE.BufferGeometry[];
  earth: THREE.Mesh;
  /** The runes on the stones, whose colour `Camp.step` drives. */
  runes: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
}

/** The ground the camp stands on, the hearth round the fire and the ring of standing stones with their runes. */
export function buildGround(c: THREE.Vector3, dirt: THREE.Texture, rnd: () => number): Ground {
  const earth = new THREE.Mesh(groundGeometry(c), owns(new THREE.MeshStandardMaterial({ map: dirt, vertexColors: true, roughness: 1 }), dirt));
  earth.receiveShadow = true;
  const { stones, runes } = ring(rnd, c), runeTex = runeTexture(rnd);
  const runeMat = owns(new THREE.MeshBasicMaterial({ map: runeTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), runeTex);

  return { near: [...hearth(rnd, c), ...stones], earth, runes: new THREE.Mesh(merged(runes), runeMat) };
}

export interface Wilds {
  /** Trees, ruins and brush out in the fog, which cast nothing. */
  far: THREE.BufferGeometry[];
  objects: THREE.Object3D[];
}

/** The land past the stones: grass, brush, a ruined gate and the treeline, with mist pooling between and fireflies over it. */
export function buildWilds(a: Air, c: THREE.Vector3, rnd: () => number): Wilds {
  const trees = [pine(rnd), pine(rnd), pine(rnd), snag(rnd)], brush = [0, 1].map(() => bush(rnd, 1, 0x1b261d));

  const far = [
    ...gate(rnd, c, 293, 14),
    ...scatter(trees, 34, rnd, () => aside(rnd, c, 10, 18), k => (k === 3 ? 2.5 + rnd() * 1.5 : 3.5 + rnd() * 3)),
    ...scatter(brush, 10, rnd, () => aside(rnd, c, 6.2, 10), () => 0.45 + rnd() * 0.5),
  ];

  for (const g of [...trees, ...brush]) g.dispose();

  const tufts = Array.from({ length: 110 }, () => {
    const [cx, cz] = aside(rnd, c, 3.3, 12), r = 0.25 + rnd() * 0.45;

    return blades(rnd, 16, () => [cx + (rnd() - 0.5) * r * 2, 0, cz + (rnd() - 0.5) * r * 2], [0.12, 0.42], 0x0e130d, 0x3c4630);
  });

  const grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  grassMat.onBeforeCompile = GRASS_MAT_FIX;
  const grass = new THREE.Mesh(merged(tufts), grassMat);
  grass.receiveShadow = true;
  const mist = new THREE.Mesh(merged([0.06, 0.32, 0.62].map(y => new THREE.RingGeometry(3.2, 18, 72, 6).rotateX(-Math.PI / 2).translate(c.x, y, c.z))), shader(a, MIST_VERT, MIST_FRAG, false, { uMist: { value: new THREE.Color(0x3a4258) }, uCentre: { value: c } }));

  const flies = loose(particles(FIREFLIES, () => {
    const [x, z] = aside(rnd, c, 3.6, 9);

    return { pos: [x, 0.35 + rnd() * 1.3, z], data: [rnd(), 0.2 + rnd() * 0.25, 0.7 + rnd() * 1.1, 0] };
  }), shader(a, FLY_VERT, FLY_FRAG, true));

  return { far, objects: [grass, mist, flies] };
}
