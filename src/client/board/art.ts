import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { N } from '../../engine/index';
import type { Team } from '../../engine/index';

export const OFF = (N - 1) / 2;

export const TEAM_HEX: Readonly<Record<Team, number>> = { 0: 0x5b8cff, 1: 0xff6b5b };

export const TEAM_CSS: Readonly<Record<Team, string>> = { 0: '#5b8cff', 1: '#ff6b5b' };

export const GOLD = 0xe8b65a;

export const hex = (css: string): number => parseInt(css.slice(1), 16);

export function mat(color: number, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...opts });
}

export function basic(color: number, opacity = 1): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
}

export function mesh<G extends THREE.BufferGeometry, M extends THREE.Material>(geo: G, m: M, x = 0, y = 0, z = 0): THREE.Mesh<G, M> {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);

  return o;
}

/** A flat quad lying on the ground. */
export function decal<G extends THREE.BufferGeometry, M extends THREE.Material>(geo: G, m: M, y: number): THREE.Mesh<G, M> {
  const o = mesh(geo, m, 0, y, 0);
  o.rotation.x = -Math.PI / 2;

  return o;
}

const GLOW_TEX = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.3, 'rgba(255,255,255,.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);

  return new THREE.CanvasTexture(c);
})();

export function glow(color: number, size: number, opacity = 1, additive = true): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: GLOW_TEX, color, opacity, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  }));

  s.scale.set(size, size, 1);

  return s;
}

/** Deterministic so a map looks the same every time it loads. */
export function seeded(seed: number): () => number {
  let s = seed;

  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

/** Materials made once and reused by many meshes; disposing a tile must not free them. Loaded figure geometry carries the same flag. */
export function keep<T extends THREE.Material>(m: T): T { m.userData.shared = true; return m; }

export function disposeTree(o: THREE.Object3D): void {
  o.traverse(c => {
    if (!(c instanceof THREE.Mesh || c instanceof THREE.Sprite || c instanceof THREE.Line)) return;

    // Every Sprite shares one module-level geometry inside three.
    if (!(c instanceof THREE.Sprite) && !c.geometry.userData.shared) c.geometry.dispose();

    for (const x of [c.material].flat()) if (!x.userData.shared) x.dispose();
  });
  o.removeFromParent();
}

/** One mesh drawn in one call from `parts`, which share a material and a parent and never move apart. Takes the first part's material and shadow flags. */
export function merge(parts: readonly THREE.Mesh[]): THREE.Mesh {
  const geos = parts.map(p => { p.updateMatrix(); return p.geometry.clone().applyMatrix4(p.matrix); });
  const geo = mergeGeometries(geos);

  for (const g of [...geos, ...parts.map(p => p.geometry)]) g.dispose();

  if (!geo) throw new Error('merge: parts have mismatched attributes');
  const first = parts[0]!, o = new THREE.Mesh(geo, first.material);
  o.castShadow = first.castShadow;
  o.receiveShadow = first.receiveShadow;

  return o;
}

/** A flat five-pointed star facing +z. */
export function starGeometry(outer: number, inner = outer * 0.45, depth = outer * 0.25): THREE.BufferGeometry {
  const sh = new THREE.Shape();

  for (let i = 0; i <= 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? inner : outer;

    if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }

  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);

  return g;
}
