import * as THREE from 'three';
import { DIR4, N, idx, inb } from '../../engine/index';
import type { BattleState, Pos, TerrainChar, TileFx } from '../../engine/index';
import type { Highlight, HighlightTone } from '../board';
import { OFF, basic, decal, disposeTree, glow, keep, mat, mesh, seeded } from './art';

export type FxKey = Exclude<keyof TileFx, 'spent' | 'whp'>;
const FX_KEYS: readonly FxKey[] = ['fire', 'smoke', 'ice', 'flood', 'wall'];

interface Brazier { flame: THREE.Sprite; core: THREE.Sprite; light: THREE.PointLight; ph: number }

export interface TileView {
  x: number;
  z: number;
  /** The terrain this tile was loaded with, so burnt grass can look scorched. */
  origin: TerrainChar;
  base: TerrainChar;
  group: THREE.Group;
  pick: THREE.Mesh;
  fx: Partial<Record<FxKey, THREE.Object3D>>;
  spent: boolean;
  brazier: Brazier | null;
  hl: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

const TOP: Partial<Record<TerrainChar, number>> = { '^': 0.42, '~': -0.14 };
const SLAB_H: Partial<Record<TerrainChar, number>> = { '^': 0.72, '~': 0.16 };
const SLAB_COL: Partial<Record<TerrainChar, readonly [number, number]>> = {
  '^': [0x8a7458, 0x7e6a50], 'G': [0x2c3a26, 0x283522],
};
const FLOOR_COL = [0x3b3740, 0x35313a] as const;
const SCORCHED_COL = [0x2a2224, 0x261f20] as const;
export const CHASM_Y = -1.4;

const TONE: Readonly<Record<HighlightTone, { color: number; opacity: number }>> = {
  move: { color: 0x5b8cff, opacity: 0.55 },
  path: { color: 0xa9c3ff, opacity: 0.9 },
  target: { color: 0xff6b5b, opacity: 0.65 },
  aoe: { color: 0xffb04a, opacity: 0.9 },
  deploy: { color: 0xe8b65a, opacity: 0.4 },
  selected: { color: 0xffe9b0, opacity: 0.8 },
};

/** White fill with a brighter rim, tinted per tone, so a highlight still reads on water and under a unit's disc. */
const HL_TEX = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(4, 4, 56, 56);
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 4;
  g.strokeRect(4, 4, 56, 56);
  return new THREE.CanvasTexture(c);
})();
const HL_Y = 0.045;

const pickMat = keep(new THREE.MeshBasicMaterial({ visible: false }));
const shared = {
  wall: mat(0x5a5260), cap: mat(0x6a6270), grass: mat(0x4f7a3a), rim: mat(0x2a2430), void: basic(0x0c0618),
  water: new THREE.MeshStandardMaterial({ color: 0x1f5a8a, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.82, emissive: 0x0a2a44, emissiveIntensity: 0.6 }),
  bowl: mat(0x6a4a2a, { metalness: 0.4 }), leg: mat(0x3a2a1a), plank: mat(0x8a6a44), band: mat(0x5a4a34),
  ice: new THREE.MeshStandardMaterial({ color: 0xcff4ff, emissive: 0x5ab6e0, emissiveIntensity: 0.35, roughness: 0.1, transparent: true, opacity: 0.9 }),
  flood: new THREE.MeshStandardMaterial({ color: 0x2a6aa0, transparent: true, opacity: 0.7, roughness: 0.1, emissive: 0x0a2a44 }),
  fireBase: basic(0xff5a1a, 0.35),
};
for (const m of Object.values(shared)) keep(m);

type Build = (t: TileView, rnd: () => number, neighbour: (dx: number, dz: number) => TerrainChar | null) => void;

function slab(t: TileView): void {
  const h = SLAB_H[t.base] ?? 0.3, top = TOP[t.base] ?? 0;
  const cols = t.base === '.' && t.origin === 'G' ? SCORCHED_COL : SLAB_COL[t.base] ?? FLOOR_COL;
  const m = mesh(new THREE.BoxGeometry(0.97, h, 0.97), mat(cols[(t.x + t.z) % 2]!), 0, top - h / 2, 0);
  m.receiveShadow = true;
  m.castShadow = t.base === '^';
  t.group.add(m);
}

const BUILD: Readonly<Record<TerrainChar, Build>> = {
  '.': slab,
  '^': slab,
  '+': t => {
    slab(t);
    const rune = decal(new THREE.RingGeometry(0.22, 0.4, 6), new THREE.MeshBasicMaterial({ color: 0x7ee081, transparent: true, opacity: 0.8, side: THREE.DoubleSide }), 0.02);
    const g = glow(0x7ee081, 0.9, 0.5);
    g.position.y = 0.4;
    t.group.add(rune, g);
  },
  'G': (t, rnd) => {
    slab(t);
    for (let i = 0; i < 7; i++) {
      const tuft = mesh(new THREE.ConeGeometry(0.07, 0.5 + rnd() * 0.35, 4), shared.grass, (rnd() - 0.5) * 0.8, 0.28, (rnd() - 0.5) * 0.8);
      tuft.rotation.z = (rnd() - 0.5) * 0.4;
      tuft.castShadow = true;
      t.group.add(tuft);
    }
  },
  '~': t => {
    slab(t);
    t.group.add(decal(new THREE.PlaneGeometry(1, 1), shared.water, -0.1));
  },
  'I': t => {
    slab(t);
    t.group.add(mesh(new THREE.BoxGeometry(0.98, 0.08, 0.98), shared.ice, 0, -0.02, 0));
  },
  '#': (t, rnd) => {
    slab(t);
    const h = 1.5 + rnd() * 0.5, b = mesh(new THREE.BoxGeometry(0.98, h, 0.98), shared.wall, 0, h / 2, 0);
    b.castShadow = b.receiveShadow = true;
    t.group.add(b, mesh(new THREE.BoxGeometry(1.04, 0.12, 1.04), shared.cap, 0, h + 0.06, 0));
  },
  'o': (t, _rnd, neighbour) => {
    t.group.add(mesh(new THREE.BoxGeometry(1, 0.1, 1), shared.void, 0, -1.5, 0));
    const g = glow(0x7a3aff, 1.9, 0.55);
    g.position.y = -1.1;
    t.group.add(g);
    for (const [dx, dz] of DIR4) {
      const n = neighbour(dx, dz);
      if (n === null || n === 'o') continue;
      t.group.add(mesh(new THREE.BoxGeometry(dx ? 0.12 : 1, 1.4, dz ? 0.12 : 1), shared.rim, dx * 0.45, -0.75, dz * 0.45));
    }
  },
  'B': (t, rnd) => {
    slab(t);
    const bowl = mesh(new THREE.CylinderGeometry(0.36, 0.18, 0.35, 10), shared.bowl, 0, 0.7, 0);
    bowl.castShadow = true;
    const flame = glow(0xff7a2a, 1.3), core = glow(0xffe0a0, 0.5);
    flame.position.y = 1.05;
    core.position.y = 1.0;
    const light = new THREE.PointLight(0xff7a2a, Math.PI, 6, 2);
    light.position.y = 1.3;
    t.group.add(bowl, mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.6, 6), shared.leg, 0, 0.3, 0), flame, core, light);
    t.brazier = { flame, core, light, ph: rnd() * 9 };
  },
};

const FX_BUILD: Readonly<Record<FxKey, () => THREE.Object3D>> = {
  fire: () => {
    const g = new THREE.Group();
    g.add(decal(new THREE.PlaneGeometry(0.9, 0.9), shared.fireBase, 0.03));
    for (let i = 0; i < 3; i++) {
      const s = glow(i ? 0xff7a2a : 0xffd08a, 0.6, 0.9);
      s.position.set((Math.random() - 0.5) * 0.5, 0.3, (Math.random() - 0.5) * 0.5);
      s.userData.flick = Math.random() * 9;
      g.add(s);
    }
    return g;
  },
  smoke: () => {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const s = glow(0x8a8f9a, 1.3, 0.45, false);
      s.position.set((Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6);
      s.userData.drift = Math.random() * 9;
      g.add(s);
    }
    return g;
  },
  ice: () => mesh(new THREE.BoxGeometry(0.98, 0.08, 0.98), shared.ice, 0, -0.02, 0),
  flood: () => decal(new THREE.PlaneGeometry(1, 1), shared.flood, 0.04),
  wall: () => {
    const g = new THREE.Group(), b = mesh(new THREE.BoxGeometry(0.95, 1.1, 0.95), shared.plank, 0, 0.55, 0);
    b.castShadow = true;
    g.add(b);
    for (let r = 0; r < 3; r++) g.add(mesh(new THREE.BoxGeometry(1, 0.08, 1), shared.band, 0, 0.2 + r * 0.35, 0));
    return g;
  },
};

/** The map: one record per tile holding its base meshes, overlays, pick box and highlight quad. */
export class Terrain {
  readonly root = new THREE.Group();
  #tiles: TileView[] = [];

  constructor(parent: THREE.Object3D) { parent.add(this.root); }

  tile(x: number, z: number): TileView | undefined { return this.#tiles[idx(x, z)]; }
  get picks(): THREE.Object3D[] { return this.#tiles.map(t => t.pick); }

  load(s: BattleState): void {
    for (const t of this.#tiles) disposeTree(t.group);
    this.#tiles = [];
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const base = s.terr[idx(x, z)] ?? '.';
      const group = new THREE.Group();
      group.position.set(x - OFF, 0, z - OFF);
      this.root.add(group);
      const hl = decal(new THREE.PlaneGeometry(0.94, 0.94), new THREE.MeshBasicMaterial({ map: HL_TEX, transparent: true, depthWrite: false }), 0) as TileView['hl'];
      hl.renderOrder = 3;
      hl.visible = false;
      this.root.add(hl);
      const t: TileView = { x, z, origin: base, base, group, pick: new THREE.Mesh(), fx: {}, spent: false, brazier: null, hl };
      this.#tiles.push(t);
    }
    for (const t of this.#tiles) this.#build(t, s);
    this.sync(s);
  }

  #build(t: TileView, s: BattleState): void {
    const rnd = seeded(1 + idx(t.x, t.z) * 31);
    BUILD[t.base](t, rnd, (dx, dz) => (inb(t.x + dx, t.z + dz) ? s.terr[idx(t.x + dx, t.z + dz)] ?? null : null));
    const top = t.base === 'o' ? 0 : t.base === '#' ? 1.6 : TOP[t.base] ?? 0;
    const pick = mesh(new THREE.BoxGeometry(1, top + 0.3, 1), pickMat, 0, (top - 0.3) / 2, 0);
    pick.userData.tile = { x: t.x, z: t.z } satisfies Pos;
    t.pick = pick;
    t.group.add(pick);
    t.hl.position.set(t.x - OFF, Math.max(0, TOP[t.base] ?? 0) + HL_Y, t.z - OFF);
  }

  #rebuild(t: TileView, s: BattleState, base: TerrainChar): void {
    const fx = t.fx;
    for (const c of [...t.group.children]) if (!Object.values(fx).includes(c)) disposeTree(c);
    t.base = base;
    t.brazier = null;
    this.#build(t, s);
  }

  /** Where a unit stands on this tile. A unit downed in a chasm rests at its bottom. */
  standY(x: number, z: number, resting = true): number {
    const t = this.tile(x, z);
    if (!t) return 0;
    if (t.base === 'o') return resting ? CHASM_Y : 0;
    if (t.fx.ice) return 0.02;
    return TOP[t.base] ?? 0;
  }
  at(x: number, z: number, y = 0, resting = true): THREE.Vector3 {
    return new THREE.Vector3(x - OFF, this.standY(x, z, resting) + y, z - OFF);
  }

  setFx(x: number, z: number, key: FxKey, on: boolean): void {
    const t = this.tile(x, z);
    if (!t || !!t.fx[key] === on) return;
    if (on) {
      const o = FX_BUILD[key]();
      t.fx[key] = o;
      t.group.add(o);
    } else {
      disposeTree(t.fx[key]!);
      delete t.fx[key];
    }
  }
  setSpent(x: number, z: number, spent: boolean): void {
    const t = this.tile(x, z);
    if (!t) return;
    t.spent = spent;
    if (!t.brazier) return;
    t.brazier.flame.visible = t.brazier.core.visible = !spent;
    // Hiding a light changes the light count and recompiles every shader; dimming it does not.
    t.brazier.light.intensity = spent ? 0 : Math.PI;
  }

  /** Make every tile match `s`: base terrain (burnt grass), overlays and spent braziers. */
  sync(s: BattleState): void {
    for (const t of this.#tiles) {
      const k = idx(t.x, t.z), base = s.terr[k] ?? '.', f = s.fx[k];
      if (base !== t.base) this.#rebuild(t, s, base);
      for (const key of FX_KEYS) this.setFx(t.x, t.z, key, !!f?.[key]);
      this.setSpent(t.x, t.z, !!f?.spent);
    }
  }

  /** Later layers win where they overlap. */
  highlight(layers: readonly Highlight[]): void {
    for (const t of this.#tiles) t.hl.visible = false;
    for (const layer of layers) {
      const tone = TONE[layer.tone];
      for (const p of layer.tiles) {
        const t = this.tile(p.x, p.z);
        if (!t) continue;
        t.hl.visible = true;
        t.hl.material.color.setHex(tone.color);
        t.hl.material.opacity = tone.opacity;
      }
    }
  }

  update(time: number): void {
    shared.water.emissiveIntensity = 0.5 + 0.15 * Math.sin(time * 1.5);
    for (const t of this.#tiles) {
      const b = t.brazier;
      if (b && !t.spent) {
        b.light.intensity = Math.PI * (0.9 + 0.25 * Math.sin(time * 10 + b.ph));
        b.flame.scale.setScalar(1.2 + 0.2 * Math.sin(time * 12 + b.ph));
      }
      if (t.fx.fire) for (const c of t.fx.fire.children) {
        const ph = c.userData.flick as number | undefined;
        if (ph === undefined) continue;
        c.scale.setScalar(0.55 + 0.2 * Math.sin(time * 14 + ph));
        c.position.y = 0.3 + 0.08 * Math.sin(time * 9 + ph);
      }
      if (t.fx.smoke) for (const c of t.fx.smoke.children) {
        const ph = c.userData.drift as number;
        c.position.y += Math.sin(time + ph) * 0.002;
        (c as THREE.Sprite).material.rotation += 0.004;
      }
    }
  }

  dispose(): void {
    for (const t of this.#tiles) { disposeTree(t.group); disposeTree(t.hl); }
    this.#tiles = [];
    this.root.removeFromParent();
  }
}
