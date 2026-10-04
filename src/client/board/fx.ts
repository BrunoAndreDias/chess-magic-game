import * as THREE from 'three';
import { decal, disposeTree, glow, mesh } from './art';
import { easeInOut } from './tween';
import type { Tweens } from './tween';

/** Short-lived effects. Each removes itself when its tween ends; the promise resolves on impact where that matters. */
export class Fx {
  constructor(readonly world: THREE.Object3D, readonly tweens: Tweens) {}

  #spawn<T extends THREE.Object3D>(o: T, sec: number, step: (p: number) => void): Promise<void> {
    this.world.add(o);

    return this.tweens.run(sec, step).then(() => disposeTree(o));
  }

  burst(pos: THREE.Vector3, color: number, size: number, sec = 0.4): Promise<void> {
    const s = glow(color, 0.2, 1);
    s.position.copy(pos);

    return this.#spawn(s, sec, p => { s.scale.setScalar(size * (0.3 + 0.7 * p)); s.material.opacity = 1 - p; });
  }

  ring(pos: THREE.Vector3, color: number, radius: number, sec = 0.45): Promise<void> {
    const m = decal(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }), 0);
    m.position.copy(pos);
    const mm = m.material;

    return this.#spawn(m, sec, p => { m.scale.setScalar(0.1 + radius * easeInOut(p)); mm.opacity = 0.9 * (1 - p); });
  }

  /** A ring that closes in on `pos`: a pull, or time running backwards. */
  implode(pos: THREE.Vector3, color: number, radius: number, sec = 0.45): Promise<void> {
    const m = decal(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }), 0);
    m.position.copy(pos);
    const mm = m.material;

    return this.#spawn(m, sec, p => { m.scale.setScalar(0.1 + radius * (1 - easeInOut(p))); m.rotation.z = p * 2; mm.opacity = 0.9 * Math.sin(p * Math.PI); });
  }

  /** A dark cloud gathering over `pos` for `sec`. */
  cloud(pos: THREE.Vector3, width: number, sec: number): Promise<void> {
    const g = new THREE.Group(), puffs: THREE.Sprite[] = [];

    for (let i = 0; i < 7; i++) {
      const s = glow(i % 2 ? 0x4a4e60 : 0x6a6e80, 1.4 + Math.random() * 0.8, 0, false);
      s.position.set((Math.random() - 0.5) * width, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * width);
      puffs.push(s);
      g.add(s);
    }

    g.position.copy(pos);

    return this.#spawn(g, sec, p => { for (const s of puffs) s.material.opacity = 0.85 * Math.min(1, p * 4, (1 - p) * 4); g.rotation.y = p * 0.4; });
  }

  sparkles(pos: THREE.Vector3, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const s = glow(color, 0.35, 1), off = new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 0.3, (Math.random() - 0.5) * 0.8);
      void this.#spawn(s, 0.8 + Math.random() * 0.3, p => { s.position.copy(pos).add(off); s.position.y += p * 1.3; s.material.opacity = 1 - p; });
    }
  }

  /** Resolves on impact. `arc` lifts the flight path's midpoint. */
  projectile(from: THREE.Vector3, to: THREE.Vector3, color: number, size: number, sec: number, arc: number): Promise<void> {
    const halo = glow(color, size * 2.2, 1), core = mesh(new THREE.SphereGeometry(size * 0.35, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const g = new THREE.Group();
    g.add(halo, core);
    let lastTrail = 0;

    return this.#spawn(g, sec, p => {
      g.position.lerpVectors(from, to, p);
      g.position.y += Math.sin(p * Math.PI) * arc;

      if (p - lastTrail > 0.08) { lastTrail = p; this.#trail(g.position, color, size); }
    }).then(() => { void this.burst(to, color, size * 4, 0.35); });
  }
  #trail(pos: THREE.Vector3, color: number, size: number): void {
    const t = glow(color, size * 1.3, 0.6);
    t.position.copy(pos);
    void this.#spawn(t, 0.25, p => { t.material.opacity = 0.6 * (1 - p); });
  }

  bolt(a: THREE.Vector3, b: THREE.Vector3, color: number, jag = 0.35): void {
    const pts: THREE.Vector3[] = [], n = 9;

    for (let i = 0; i <= n; i++) {
      const p = new THREE.Vector3().lerpVectors(a, b, i / n);

      if (i > 0 && i < n) p.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(jag));
      pts.push(p);
    }

    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, transparent: true }));
    const lm = line.material;
    void this.burst(b, color, 1.6, 0.35);
    void this.#spawn(line, 0.35, p => { lm.opacity = (1 - p) * (Math.random() < 0.3 ? 0.3 : 1); });
  }

  flash(m: THREE.MeshStandardMaterial, color: number): void {
    m.emissive.setHex(color);
    void this.tweens.run(0.35, p => { m.emissiveIntensity = 1 - p; }).then(() => { m.emissive.setHex(0); m.emissiveIntensity = 1; });
  }
}
