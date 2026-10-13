import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** The uniforms every camp shader shares, so one write in `Camp.step` reaches them all. */
export interface Air {
  uTime: { value: number };
  /** Seconds for things that travel: it stops under reduced motion, while flicker and twinkle keep `uTime`. */
  uDrift: { value: number };
  uDark: { value: number };
  uFire: { value: number };
  uGlow: { value: THREE.Color };
}

export function air(): Air {
  return { uTime: { value: 0 }, uDrift: { value: 0 }, uDark: { value: 0 }, uFire: { value: 0 }, uGlow: { value: new THREE.Color() } };
}

export const NOISE_GLSL = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return s;
}`;

/** Billboards each particle's quad in view space; `size` is its half-width in metres. */
export const QUAD_GLSL = /* glsl */ `
attribute vec2 corner;
attribute vec4 aData;
varying vec2 vC;
vec4 billboard(vec3 at, float size) {
  vec4 mv = modelViewMatrix * vec4(at, 1.0);
  mv.xy += corner * size;
  vC = corner;
  return projectionMatrix * mv;
}`;

/** An unlit shader the camp's uniforms drive. Additive ones glow; the rest blend by alpha. */
export function shader(a: Air, vertexShader: string, fragmentShader: string, additive: boolean, extra: Record<string, THREE.IUniform> = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...a, ...extra }, vertexShader, fragmentShader, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

/** `n` camera-facing quads in one geometry, one per particle: each sits at `at(i)` and carries four numbers its shader reads as `aData`. */
export function particles(n: number, at: (i: number) => { pos: readonly [number, number, number]; data: readonly [number, number, number, number] }): THREE.BufferGeometry {
  const pos = new Float32Array(n * 12), corner = new Float32Array(n * 8), data = new Float32Array(n * 16), index: number[] = [];

  for (let i = 0; i < n; i++) {
    const p = at(i);

    for (let k = 0; k < 4; k++) {
      pos.set(p.pos, (i * 4 + k) * 3);
      corner.set([k % 2 ? 1 : -1, k < 2 ? -1 : 1], (i * 4 + k) * 2);
      data.set(p.data, (i * 4 + k) * 4);
    }

    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
  g.setAttribute('aData', new THREE.BufferAttribute(data, 4));
  g.setIndex(index);

  return g;
}

/** One geometry from `parts`, which it frees. */
export function merged(parts: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries([...parts]);

  for (const p of parts) p.dispose();

  if (!g) throw new Error('merged: parts have mismatched attributes');

  return g;
}

/** A mesh that three never culls: its vertices move in the shader, so the bounds it would test are wrong. */
export function loose(g: THREE.BufferGeometry, m: THREE.Material): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.frustumCulled = false;

  return o;
}

/** Frees `t` with `m`, since `disposeTree` frees materials but not their maps. */
export function owns<M extends THREE.Material>(m: M, t: THREE.Texture): M {
  m.addEventListener('dispose', () => t.dispose());

  return m;
}

/** Calls `draw` at (x, y) and at each copy across the edges of a tiling `S`-pixel canvas that a mark of radius `r` would cross. */
function wrapped(S: number, x: number, y: number, r: number, draw: (x: number, y: number) => void): void {
  for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
    if (x + dx + r < 0 || x + dx - r > S || y + dy + r < 0 || y + dy - r > S) continue;
    draw(x + dx, y + dy);
  }
}

function canvasTexture(S: number, paint: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;

  return t;
}

/** Tiling grain around a mid grey, for vertex colours to multiply: soft blotches, then marks of radius `r0` to `r1`, then speckle. */
function grain(S: number, rnd: () => number, blotches: number, marks: number, r0: number, r1: number, speckle: number): (g: CanvasRenderingContext2D) => void {
  return g => {
    g.fillStyle = '#c8c8c8';
    g.fillRect(0, 0, S, S);

    for (let i = 0; i < blotches; i++) {
      const x = rnd() * S, y = rnd() * S, r = 30 + rnd() * 90, light = rnd() < 0.5;

      wrapped(S, x, y, r, (px, py) => {
        const gr = g.createRadialGradient(px, py, 0, px, py, r);
        gr.addColorStop(0, light ? 'rgba(255,255,255,0.22)' : 'rgba(60,60,60,0.22)');
        gr.addColorStop(1, light ? 'rgba(255,255,255,0)' : 'rgba(60,60,60,0)');
        g.fillStyle = gr;
        g.fillRect(px - r, py - r, r * 2, r * 2);
      });
    }

    for (let i = 0; i < marks; i++) {
      const x = rnd() * S, y = rnd() * S, r = r0 + rnd() * (r1 - r0), turn = rnd() * Math.PI, squash = 0.55 + rnd() * 0.4;

      wrapped(S, x, y, r + 2, (px, py) => {
        g.fillStyle = 'rgba(40,36,34,0.35)';
        g.beginPath();
        g.ellipse(px + 1, py + 1.5, r, r * squash, turn, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = rnd() < 0.5 ? 'rgba(235,232,226,0.5)' : 'rgba(170,166,160,0.55)';
        g.beginPath();
        g.ellipse(px, py, r, r * squash, turn, 0, Math.PI * 2);
        g.fill();
      });
    }

    for (let i = 0; i < speckle; i++) {
      g.fillStyle = rnd() < 0.6 ? 'rgba(30,28,26,0.3)' : 'rgba(255,255,255,0.25)';
      g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2);
    }
  };
}

/** Packed earth: blotches, small pebbles, grit. */
export function dirtTexture(rnd: () => number): THREE.CanvasTexture {
  return canvasTexture(512, grain(512, rnd, 40, 160, 2, 7, 2200));
}

/** Weathered stone: broad blotches, lichen spots, pits. */
export function stoneTexture(rnd: () => number): THREE.CanvasTexture {
  return canvasTexture(256, grain(256, rnd, 18, 40, 3, 10, 700));
}

/** Four runes in a 2x2 atlas, white strokes over a soft halo, for an additive material to tint. */
export function runeTexture(rnd: () => number): THREE.CanvasTexture {
  return canvasTexture(256, g => {
    g.lineCap = g.lineJoin = 'round';

    for (let q = 0; q < 4; q++) {
      const ox = (q % 2) * 128 + 64, oy = Math.floor(q / 2) * 128 + 64, strokes: [number, number, number, number][] = [[0, -46, 0, 46]];

      for (let i = 0, n = 2 + Math.floor(rnd() * 2); i < n; i++) {
        const y = -40 + rnd() * 70, side = rnd() < 0.5 ? -1 : 1;
        strokes.push([0, y, side * (18 + rnd() * 22), y + (rnd() < 0.5 ? -1 : 1) * (14 + rnd() * 20)]);
      }

      const halo = g.createRadialGradient(ox, oy, 0, ox, oy, 60);
      halo.addColorStop(0, 'rgba(255,255,255,0.28)');
      halo.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = halo;
      g.fillRect(ox - 64, oy - 64, 128, 128);

      for (const [w, a] of [[11, 0.25], [4, 1]] as const) {
        g.strokeStyle = `rgba(255,255,255,${a})`;
        g.lineWidth = w;
        g.beginPath();

        for (const [x0, y0, x1, y1] of strokes) {
          g.moveTo(ox + x0, oy + y0);
          g.lineTo(ox + x1, oy + y1);
        }

        g.stroke();
      }
    }
  });
}
