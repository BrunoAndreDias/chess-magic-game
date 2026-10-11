import * as THREE from 'three';
import { basic, decal, disposeTree, glow, mesh, starGeometry } from './art';
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

  /** A star sigil burning on the ground at `pos`, flaring in and dying out over `sec`. */
  sigil(pos: THREE.Vector3, color: number, sec: number): void {
    const g = new THREE.Group(), star = mesh(starGeometry(0.42, 0.17, 0.02), basic(color, 0)), rim = decal(new THREE.RingGeometry(0.5, 0.58, 40), basic(color, 0), 0), halo = glow(color, 1.8, 0);
    star.rotation.x = -Math.PI / 2;
    halo.position.y = 0.3;
    g.add(star, rim, halo);
    g.position.copy(pos).setY(pos.y + 0.06);

    void this.#spawn(g, sec, p => {
      const a = Math.min(1, p * 5, (1 - p) * 4);
      star.material.opacity = a;
      rim.material.opacity = 0.8 * a;
      halo.material.opacity = 0.9 * a;
      star.rotation.z = p * 1.5;
    });
  }

  /** `n` wisps spiralling up around `pos` over `sec`. */
  wisps(pos: THREE.Vector3, color: number, n: number, sec: number): void {
    for (let i = 0; i < n; i++) {
      const s = glow(color, 0.45, 1), a0 = (i / n) * Math.PI * 2;
      void this.#spawn(s, sec, p => {
        const a = a0 + p * 5, r = 0.6 * (1 - p * 0.5);
        s.position.set(pos.x + Math.cos(a) * r, pos.y + p * 2.2, pos.z + Math.sin(a) * r);
        s.material.opacity = Math.min(1, p * 6, (1 - p) * 3);
      });
    }
  }

  /** Taut strings from each point `ties()` returns up to height `top`, fading into the dark above and out over the last third of `sec`. */
  strings(ties: () => readonly THREE.Vector3[], top: number, color: number, sec: number): void {
    const n = ties().length, geo = new THREE.BufferGeometry(), pts = new Float32Array(n * 6), rgba = new Float32Array(n * 8);
    const c = new THREE.Color(color);

    for (let i = 0; i < n; i++) rgba.set([c.r, c.g, c.b, 1, c.r, c.g, c.b, 0], i * 8);
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }));
    lines.frustumCulled = false;
    const lm = lines.material;

    void this.#spawn(lines, sec, p => {
      ties().forEach((t, i) => { pts.set([t.x, t.y, t.z, t.x, top, t.z], i * 6); });
      geo.attributes.position!.needsUpdate = true;
      lm.opacity = Math.min(1, (1 - p) * 3);
    });
  }

  /** A pane of glass rising out of the ground at `pos`, turned to `yaw`, standing until `sec`. */
  pane(pos: THREE.Vector3, yaw: number, color: number, sec: number): void {
    const w = 0.95, h = 1.9, g = new THREE.Group();
    const glass = mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }), 0, h / 2, 0);
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h)), new THREE.LineBasicMaterial({ color: 0xffffff }));
    rim.position.y = h / 2;
    const gleam = glow(0xffffff, 0.9, 0.7);
    gleam.position.set(-w / 4, h * 0.7, 0.02);
    g.add(glass, rim, gleam);
    g.position.copy(pos);
    g.rotation.y = yaw;

    void this.#spawn(g, sec, p => {
      g.scale.y = Math.max(0.01, Math.min(1, p / 0.3));
      gleam.position.x = -w / 2 + w * p;
    });
  }

  /** Glass splinters bursting outward from `pos` and falling. */
  shards(pos: THREE.Vector3, color: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const s = mesh(new THREE.TetrahedronGeometry(0.07 + Math.random() * 0.06), basic(color, 0.9));
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(1.6 + Math.random());
      void this.#spawn(s, 0.6 + Math.random() * 0.2, p => {
        s.position.copy(pos).addScaledVector(v, p);
        s.position.y -= 2 * p * p;
        s.rotation.set(p * 9, p * 7, 0);
        s.material.opacity = 0.9 * (1 - p);
      });
    }
  }

  flash(m: THREE.MeshStandardMaterial, color: number): void {
    m.emissive.setHex(color);
    void this.tweens.run(0.35, p => { m.emissiveIntensity = 1 - p; }).then(() => { m.emissive.setHex(0); m.emissiveIntensity = 1; });
  }
}
