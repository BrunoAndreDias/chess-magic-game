import * as THREE from 'three';
import { noise2 } from '../board/kit';
import { NOISE_GLSL, QUAD_GLSL, loose, merged, particles, shader } from './camp-art';
import type { Air } from './camp-art';

/** Where the moon hangs: behind the party and to the left, so the camera finds it when it looks up past the front figure. */
export const MOON_DIR = new THREE.Vector3(-0.36, 0.55, -0.76).normalize();

const SKY_R = 40, STAR_R = 37, STARS = 1100;

/** Thin cloud drifting across the sky: the dome draws it, and stars behind it fade. */
const CLOUD_GLSL = /* glsl */ `
${NOISE_GLSL}
float cloud(vec3 d, float drift) {
  vec2 p = d.xz / (d.y + 0.12) * 0.8 + vec2(drift * 0.012, drift * 0.005);
  return smoothstep(0.5, 0.8, fbm(p + 0.6 * fbm(p * 2.3))) * smoothstep(0.02, 0.22, d.y);
}`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
uniform float uDark, uDrift;
uniform vec3 uZenith, uHorizon, uWarm, uMoon;
varying vec3 vDir;
${CLOUD_GLSL}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.5, h));
  // The battle's fires, far off past the hills on the right, warm a low stretch of the horizon.
  float az = atan(d.x, -d.z);
  col += uWarm * exp(-pow((az - 0.75) / 0.45, 2.0)) * exp(-max(h, 0.0) * 12.0);
  vec3 band = normalize(vec3(0.55, 0.3, 0.78));
  float milky = exp(-pow(dot(d, band) / 0.17, 2.0)) * smoothstep(0.05, 0.45, h);
  col += vec3(0.02, 0.022, 0.036) * milky * (0.3 + 1.4 * fbm(d.xz / (0.35 + h) * 4.0));
  float m = dot(d, uMoon);
  vec2 face = (d.xy - uMoon.xy) * 90.0;
  float disc = smoothstep(0.9991, 0.99935, m);
  col = mix(col, vec3(1.0, 0.97, 0.88) * (0.72 + 0.28 * fbm(face * 0.7)), disc);
  col += vec3(0.4, 0.45, 0.6) * (pow(max(m, 0.0), 900.0) * 0.6 + pow(max(m, 0.0), 90.0) * 0.12 + pow(max(m, 0.0), 12.0) * 0.05);
  float c = cloud(d, uDrift);
  col = mix(col, vec3(0.016, 0.019, 0.028) + vec3(0.2, 0.22, 0.27) * pow(max(m, 0.0), 8.0), c * 0.9);
  gl_FragColor = vec4(col * (1.0 - 0.93 * uDark), 1.0);
  #include <colorspace_fragment>
  gl_FragColor.rgb += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
}`;

const STAR_VERT = /* glsl */ `
uniform float uTime, uDark, uDrift;
${QUAD_GLSL}
${CLOUD_GLSL}
varying vec3 vCol;
void main() {
  gl_Position = billboard(position, aData.x);
  float twinkle = 0.7 + 0.3 * sin(uTime * (1.2 + aData.y * 2.5) + aData.y * 40.0);
  vec3 d = normalize(position);
  float haze = smoothstep(0.03, 0.3, d.y) * (1.0 - 0.95 * cloud(d, uDrift));
  vCol = mix(vec3(0.72, 0.8, 1.0), vec3(1.0, 0.86, 0.68), aData.z) * aData.w * twinkle * haze * (1.0 - 0.85 * uDark);
}`;

const STAR_FRAG = /* glsl */ `
varying vec2 vC;
varying vec3 vCol;
void main() {
  float a = 1.0 - smoothstep(0.0, 1.0, length(vC));
  gl_FragColor = vec4(vCol * a * a, 1.0);
  #include <colorspace_fragment>
}`;

/** A closed band of hills at radius `r`: its ridge rises from `base` by up to `rise`, from noise that wraps around the circle. */
function ridge(r: number, base: number, rise: number, seed: number, hex: number): THREE.BufferGeometry {
  const n = 180, pos: number[] = [], col: number[] = [], index: number[] = [], c = new THREE.Color(hex);

  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
    const h = base + rise * (0.65 * noise2(x * 2.2 + seed, z * 2.2) + 0.35 * noise2(x * 7 + seed, z * 7));
    pos.push(x * r, h, z * r, x * r, -2, z * r);
    col.push(c.r, c.g, c.b, c.r, c.g, c.b);

    if (i < n) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(index);

  return g;
}

/** The night around the camp: a dome with its moon and a band of stars, a star field, and two rings of hills the fog swallows. */
export function buildSky(a: Air, horizon: THREE.Color, rnd: () => number): THREE.Object3D[] {
  const dome = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 48, 24), shader(a, SKY_VERT, SKY_FRAG, false, {
    uZenith: { value: new THREE.Color(0x03040a) }, uHorizon: { value: horizon }, uWarm: { value: new THREE.Color(0x2a0e04) }, uMoon: { value: MOON_DIR },
  }));

  dome.material.transparent = false;
  dome.material.side = THREE.BackSide;
  dome.renderOrder = -1;

  const stars = loose(particles(STARS, () => {
    const y = 0.02 + rnd() * 0.98, phi = rnd() * Math.PI * 2, ring = Math.sqrt(1 - y * y), bright = rnd() ** 3;

    return { pos: [Math.cos(phi) * ring * STAR_R, y * STAR_R, Math.sin(phi) * ring * STAR_R], data: [0.045 + 0.08 * bright, rnd(), rnd() < 0.2 ? 1 : 0, 0.25 + 0.95 * bright] };
  }), shader(a, STAR_VERT, STAR_FRAG, true));

  const hills = new THREE.Mesh(merged([ridge(31, 0.8, 6.5, 3, 0x10131f), ridge(22, -0.4, 4, 11, 0x07080d)]), new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));

  return [dome, stars, hills];
}
