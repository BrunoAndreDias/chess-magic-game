import * as THREE from 'three';
import { glow } from '../board/art';
import { prep, rock, shaft } from '../board/kit';
import { NOISE_GLSL, QUAD_GLSL, loose, merged, particles, shader } from './camp-art';
import type { Air } from './camp-art';
import type { Mood } from './camp';

export const EMBER = 0xff8a3a;

const EMBERS = 56, SMOKE = 14;

/** Flame tongues as offset from the fire's centre, then width, height and a seed. */
const TONGUES = [[0, 0, 0.46, 1.0], [0.12, 0.05, 0.3, 0.66], [-0.11, -0.05, 0.32, 0.74], [0.03, -0.1, 0.24, 0.5]] as const;

const FLAME_VERT = /* glsl */ `
uniform float uTime;
attribute vec2 corner;
attribute vec4 aData;
varying vec2 vUv;
varying float vSeed;
void main() {
  vec4 base = modelMatrix * vec4(position, 1.0);
  vec3 to = cameraPosition - base.xyz;
  // Turns about the vertical only, so a camera looking up still sees the flame stand upright.
  vec3 right = normalize(vec3(to.z, 0.0, -to.x) + vec3(1e-4, 0.0, 0.0));
  float h = aData.y * (1.0 + 0.1 * sin(uTime * 7.0 + aData.z * 11.0));
  vec3 w = base.xyz + right * corner.x * aData.x * 0.5 + vec3(0.0, (corner.y * 0.5 + 0.5) * h, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  vUv = corner * 0.5 + 0.5;
  vSeed = aData.z;
}`;

const FLAME_FRAG = /* glsl */ `
uniform float uTime, uFire, uDark;
uniform vec3 uGlow;
varying vec2 vUv;
varying float vSeed;
${NOISE_GLSL}
void main() {
  vec2 p = vec2(vUv.x * 2.0 - 1.0, vUv.y);
  float t = uTime + vSeed * 13.0;
  p.x += (noise(vec2(p.y * 2.0 - t * 1.3, vSeed * 9.0)) - 0.5) * 0.7 * p.y;
  // A teardrop: widest a fifth of the way up, closing to a point at the top.
  float width = 0.5 * sin(3.1416 * pow(p.y, 0.4));
  float body = smoothstep(0.0, 0.3, width - abs(p.x));
  float licks = fbm(vec2(p.x * 3.0 + vSeed * 5.0, p.y * 3.5 - t * 3.2));
  float heat = clamp(body * (1.1 - 0.5 * p.y) - licks * 1.6 * p.y - 0.1, 0.0, 1.0);
  vec3 deep = mix(vec3(0.5, 0.05, 0.0), uGlow * 0.2, uFire);
  vec3 mid = mix(vec3(1.0, 0.3, 0.02), uGlow * 0.85, uFire);
  vec3 core = mix(vec3(1.0, 0.72, 0.3), mix(uGlow, vec3(1.0), 0.45), uFire);
  vec3 col = mix(deep, mid, smoothstep(0.1, 0.45, heat));
  col = mix(col, core, smoothstep(0.5, 0.85, heat));
  gl_FragColor = vec4(col * smoothstep(0.02, 0.3, heat) * 0.6 * (1.0 - 0.55 * uDark), 1.0);
  #include <colorspace_fragment>
}`;

/** aData: seed, lives per second, spiral radius, rise. */
const EMBER_VERT = /* glsl */ `
uniform float uTime, uFire, uDark;
uniform vec3 uGlow;
${QUAD_GLSL}
varying vec3 vCol;
void main() {
  float life = fract(uTime * aData.y + aData.x);
  float turn = aData.x * 6.2832 + life * 2.6;
  vec3 at = position + vec3(cos(turn), 0.0, sin(turn)) * aData.z * (0.25 + life) + vec3(0.06 * sin(uTime * 2.3 + aData.x * 20.0) * life, 0.15 + life * aData.w, 0.0);
  gl_Position = billboard(at, 0.022 * (1.0 - 0.6 * life));
  vec3 hot = mix(vec3(1.0, 0.78, 0.38), vec3(1.0, 0.3, 0.06), life);
  float fade = smoothstep(0.0, 0.06, life) * (1.0 - life) * (1.0 - life);
  vCol = mix(hot, uGlow * 1.3, uFire) * fade * (0.65 + 0.35 * sin(uTime * 19.0 + aData.x * 50.0)) * (1.0 - 0.45 * uDark) * 1.6;
}`;

const SPARK_FRAG = /* glsl */ `
varying vec2 vC;
varying vec3 vCol;
void main() {
  float a = 1.0 - smoothstep(0.0, 1.0, length(vC));
  gl_FragColor = vec4(vCol * a * a, 1.0);
  #include <colorspace_fragment>
}`;

/** aData: seed, lives per second, then two spare. */
const SMOKE_VERT = /* glsl */ `
uniform float uDrift, uFire, uDark;
uniform vec3 uGlow;
${QUAD_GLSL}
varying vec4 vCol;
varying float vSeed;
void main() {
  float life = fract(uDrift * aData.y + aData.x);
  vec3 at = position + vec3(0.9 * life * life + 0.15 * sin(life * 5.0 + aData.x * 9.0), 0.75 + life * 3.6, 0.15 * sin(life * 4.0 + aData.x * 5.0) - 0.5 * life);
  gl_Position = billboard(at, mix(0.22, 1.25, life));
  vec3 lit = mix(vec3(0.3, 0.13, 0.06), uGlow * 0.3, uFire);
  vCol = vec4(mix(lit, vec3(0.06, 0.06, 0.075), smoothstep(0.0, 0.45, life)), sin(3.1416 * life) * 0.2 * (1.0 - 0.7 * uDark));
  vSeed = aData.x;
}`;

const SMOKE_FRAG = /* glsl */ `
varying vec2 vC;
varying vec4 vCol;
varying float vSeed;
${NOISE_GLSL}
void main() {
  float r = length(vC);
  float a = (1.0 - smoothstep(0.2, 1.0, r)) * (0.45 + 0.55 * fbm(vC * 1.6 + vSeed * 13.0));
  gl_FragColor = vec4(vCol.rgb, vCol.a * a);
  #include <colorspace_fragment>
}`;

export interface Fire {
  /** The ring of stones and the logs, for the shadow-casting stone mesh. */
  stones: THREE.BufferGeometry[];
  /** The glow and the light, which light the camp from its first frame. */
  glow: THREE.Object3D[];
  /** Coals, flame tongues, embers and smoke, which hide behind the front figure at rest and can arrive a few frames late. */
  flames: THREE.Object3D[];
  step(time: number, mood: Mood, cls: THREE.Color): void;
}

/** A campfire at `at`: logs in a cone inside a ring of stones, glowing coals, flame tongues, rising embers and a thin plume of smoke. */
export function buildFire(a: Air, at: THREE.Vector3, rnd: () => number): Fire {
  const stones: THREE.BufferGeometry[] = [];

  for (let i = 0; i < 10; i++) {
    const t = (i / 10) * Math.PI * 2 + rnd() * 0.2;
    stones.push(rock(rnd, 0.1 + rnd() * 0.03, 0x4c4652).translate(at.x + Math.cos(t) * 0.5, -0.02, at.z + Math.sin(t) * 0.5));
  }

  // Logs lie in a low star, their burning ends raised a little where they meet over the coals.
  for (let i = 0; i < 5; i++) {
    const g = shaft(6, 0.06, 0.045, 0.6, rnd, 0x3a2416).translate(0, -0.6, 0);
    g.rotateX(1.22 + rnd() * 0.08).rotateY((i / 5) * Math.PI * 2 + rnd() * 0.4).translate(at.x, 0.21, at.z);
    stones.push(g);
  }

  const coalParts = Array.from({ length: 8 }, () => {
    const t = rnd() * Math.PI * 2, d = rnd() * 0.22;

    return prep(new THREE.DodecahedronGeometry(0.05 + rnd() * 0.04, 0)).translate(at.x + Math.cos(t) * d, 0.03, at.z + Math.sin(t) * d);
  });

  const coalMat = new THREE.MeshBasicMaterial({ color: 0xff5a1a }), coals = new THREE.Mesh(merged(coalParts), coalMat);

  const flames = loose(particles(TONGUES.length, i => {
    const [x, z, w, h] = TONGUES[i]!;

    return { pos: [at.x + x, 0.04, at.z + z], data: [w, h, i * 0.37 + 0.11, 0] };
  }), shader(a, FLAME_VERT, FLAME_FRAG, true));

  const embers = loose(particles(EMBERS, () => ({
    pos: [at.x, 0, at.z], data: [rnd(), 0.35 + rnd() * 0.4, 0.06 + rnd() * 0.22, 1.2 + rnd() * 1.4],
  })), shader(a, EMBER_VERT, SPARK_FRAG, true));

  const smoke = loose(particles(SMOKE, i => ({ pos: [at.x, 0, at.z], data: [i / SMOKE + rnd() * 0.03, 0.07, 0, 0] })), shader(a, SMOKE_VERT, SMOKE_FRAG, false));

  const halo = glow(EMBER, 2.2, 0.7), pool = glow(0xff6a20, 5, 0.18);
  halo.position.set(at.x, 0.45, at.z);
  pool.position.set(at.x, 0.05, at.z);

  const light = new THREE.PointLight(EMBER, 7, 9, 1.6);
  light.position.set(at.x, 0.7, at.z);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);

  const hot = new THREE.Color(0xff5a1a);

  return {
    stones,
    glow: [halo, pool, light],
    flames: [coals, flames, embers, smoke],
    step(time, mood, cls) {
      const flicker = 0.85 + 0.12 * Math.sin(time * 9) + 0.07 * Math.sin(time * 23), dim = 1 - 0.75 * mood.dark;
      light.intensity = 7 * dim * flicker * (1 + 0.4 * mood.fire);
      light.color.setHex(EMBER).lerp(cls, mood.fire);
      halo.material.color.copy(light.color);
      halo.material.opacity = 0.7 * dim;
      halo.scale.setScalar(2.1 + 0.18 * Math.sin(time * 11));
      pool.material.color.copy(light.color);
      pool.material.opacity = 0.18 * dim * (1 + 0.5 * mood.fire);
      coalMat.color.copy(hot).lerp(cls, mood.fire).multiplyScalar((0.8 + 0.2 * Math.sin(time * 5)) * (1 - 0.5 * mood.dark));
    },
  };
}
