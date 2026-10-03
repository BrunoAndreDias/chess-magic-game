import * as THREE from 'three';
import { DIR4, N, idx, inb } from '../../engine/index';
import type { BattleState, Pos, TerrainChar, TileFx } from '../../engine/index';
import type { Highlight, HighlightTone } from '../board';
import { BIOMES } from '../biome';
import type { Biome } from '../biome';
import { OFF, basic, decal, disposeTree, glow, keep, mat, mesh, seeded } from './art';

export type FxKey = Exclude<keyof TileFx, 'spent'>;
export const FX_KEYS: readonly FxKey[] = ['fire', 'smoke', 'ice', 'web', 'bone'];

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
  hz: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

const TOP: Partial<Record<TerrainChar, number>> = { '^': 0.42, '~': -0.14 };
const SLAB_H: Partial<Record<TerrainChar, number>> = { '^': 0.72, '~': 0.16 };
const SCORCHED_COL = [0x2a2224, 0x261f20] as const;
export const CHASM_Y = -1.4;

const TONE: Readonly<Record<HighlightTone, { color: number; opacity: number }>> = {
  move: { color: 0x5b8cff, opacity: 0.55 },
  path: { color: 0xa9c3ff, opacity: 0.9 },
  target: { color: 0xff6b5b, opacity: 0.65 },
  aoe: { color: 0xffb04a, opacity: 0.9 },
  deploy: { color: 0xe8b65a, opacity: 0.4 },
  selected: { color: 0xffe9b0, opacity: 0.8 },
  hazard: { color: 0xd65cff, opacity: 0.85 },
  friendly: { color: 0xffe14a, opacity: 0.95 },
  altar: { color: 0xffd36b, opacity: 0.6 },
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
/** Diagonal stripes with a rim: reads as danger on floor, water and grass, and stays distinct from the solid red target fill. */
const HZ_TEX = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = 7;
  for (let k = -64; k < 128; k += 16) { g.beginPath(); g.moveTo(k, 64); g.lineTo(k + 64, 0); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 4;
  g.strokeRect(2, 2, 60, 60);
  return new THREE.CanvasTexture(c);
})();
const HL_Y = 0.045;

function canvasTex(draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  draw(c.getContext('2d')!);
  return new THREE.CanvasTexture(c);
}
/** Eight spokes and a spiral of silk, white on clear. */
function drawWeb(g: CanvasRenderingContext2D): void {
  g.translate(64, 64);
  const fill = g.createRadialGradient(0, 0, 0, 0, 0, 64);
  fill.addColorStop(0, 'rgba(255,255,255,0.22)');
  fill.addColorStop(1, 'rgba(255,255,255,0.04)');
  g.fillStyle = fill;
  g.fillRect(-64, -64, 128, 128);
  g.strokeStyle = 'rgba(250,245,255,0.95)';
  g.lineWidth = 3;
  const spokes = 8;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 64, Math.sin(a) * 64); g.stroke();
  }
  g.lineWidth = 2.2;
  for (let r = 10; r < 62; r += 9) {
    g.beginPath();
    for (let i = 0; i <= spokes; i++) {
      const a = (i / spokes) * Math.PI * 2, rr = r + (i % 2) * 2;
      // Each strand sags toward the centre between spokes.
      if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else { const m = a - Math.PI / spokes; g.quadraticCurveTo(Math.cos(m) * rr * 0.86, Math.sin(m) * rr * 0.86, Math.cos(a) * rr, Math.sin(a) * rr); }
    }
    g.stroke();
  }
}

const pickMat = keep(new THREE.MeshBasicMaterial({ visible: false }));
const shared = {
  rim: mat(0x2a2430), void: basic(0x0c0618),
  bowl: mat(0x6a4a2a, { metalness: 0.4 }), leg: mat(0x3a2a1a), plank: mat(0x8a6a44), band: mat(0x5a4a34),
  ice: new THREE.MeshStandardMaterial({ color: 0xcff4ff, emissive: 0x5ab6e0, emissiveIntensity: 0.35, roughness: 0.1, transparent: true, opacity: 0.9 }),
  fireBase: basic(0xff5a1a, 0.35),
  web: new THREE.MeshBasicMaterial({ map: canvasTex(drawWeb), transparent: true, depthWrite: false }),
  bone: mat(0xe8e2d0, { roughness: 0.6 }), marrow: mat(0x9a8f78),
};
for (const m of Object.values(shared)) keep(m);

/** Per-load materials the tiles of one map share, rebuilt when the biome changes. */
interface Look { biome: Biome; wall: THREE.Material; cap: THREE.Material; grass: THREE.Material; water: THREE.MeshStandardMaterial }

function makeLook(biome: Biome): Look {
  return {
    biome,
    wall: keep(mat(biome.wall)), cap: keep(mat(biome.cap)), grass: keep(mat(biome.grass)),
    water: keep(new THREE.MeshStandardMaterial({ color: biome.water, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.82, emissive: biome.waterGlow, emissiveIntensity: 0.6 })),
  };
}

type Build = (t: TileView, rnd: () => number, neighbour: (dx: number, dz: number) => TerrainChar | null, look: Look) => void;

const slabCols = (t: TileView, b: Biome): readonly [number, number] =>
  t.base === '.' && t.origin === 'G' ? SCORCHED_COL : t.base === '^' ? b.high : t.base === 'G' ? b.grassBed : b.floor;

function slab(t: TileView, { biome }: Look): void {
  const h = SLAB_H[t.base] ?? 0.3, top = TOP[t.base] ?? 0;
  const m = mesh(new THREE.BoxGeometry(0.97, h, 0.97), mat(slabCols(t, biome)[(t.x + t.z) % 2]!, { roughness: biome.floorRough }), 0, top - h / 2, 0);
  m.receiveShadow = true;
  m.castShadow = t.base === '^';
  t.group.add(m);
}

const BUILD: Readonly<Record<TerrainChar, Build>> = {
  '.': (t, _r, _n, look) => slab(t, look),
  '^': (t, _r, _n, look) => slab(t, look),
  '+': (t, _r, _n, look) => {
    slab(t, look);
    const rune = decal(new THREE.RingGeometry(0.22, 0.4, 6), new THREE.MeshBasicMaterial({ color: 0x7ee081, transparent: true, opacity: 0.8, side: THREE.DoubleSide }), 0.02);
    const g = glow(0x7ee081, 0.9, 0.5);
    g.position.y = 0.4;
    t.group.add(rune, g);
  },
  'A': (t, _r, _n, look) => {
    slab(t, look);
    t.group.add(decal(new THREE.RingGeometry(0.22, 0.4, 8), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.8, side: THREE.DoubleSide }), 0.02));
  },
  'G': (t, rnd, _n, look) => {
    slab(t, look);
    for (let i = 0; i < 7; i++) {
      const tuft = mesh(new THREE.ConeGeometry(0.07, 0.5 + rnd() * 0.35, 4), look.grass, (rnd() - 0.5) * 0.8, 0.28, (rnd() - 0.5) * 0.8);
      tuft.rotation.z = (rnd() - 0.5) * 0.4;
      tuft.castShadow = true;
      t.group.add(tuft);
    }
  },
  '~': (t, _r, _n, look) => {
    slab(t, look);
    t.group.add(decal(new THREE.PlaneGeometry(1, 1), look.water, -0.1));
  },
  'I': (t, _r, _n, look) => {
    slab(t, look);
    t.group.add(mesh(new THREE.BoxGeometry(0.98, 0.08, 0.98), shared.ice, 0, -0.02, 0));
  },
  '#': (t, rnd, _n, look) => {
    slab(t, look);
    const h = 1.5 + rnd() * 0.5, b = mesh(new THREE.BoxGeometry(0.98, h, 0.98), look.wall, 0, h / 2, 0);
    b.castShadow = b.receiveShadow = true;
    t.group.add(b, mesh(new THREE.BoxGeometry(1.04, 0.12, 1.04), look.cap, 0, h + 0.06, 0));
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
  'B': (t, rnd, _n, look) => {
    slab(t, look);
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
  /** Ribs and long bones lashed upright, tall enough to read as a wall from above. */
  bone: () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.BoxGeometry(0.9, 0.14, 0.5), shared.marrow, 0, 0.07, 0));
    for (let i = 0; i < 5; i++) {
      const h = 1.05 + (i % 2) * 0.3, x = -0.36 + i * 0.18;
      const b = mesh(new THREE.CylinderGeometry(0.05, 0.065, h, 6), shared.bone, x, h / 2, (i % 2 ? 0.06 : -0.06));
      b.rotation.z = (i - 2) * 0.06;
      b.castShadow = true;
      g.add(b, mesh(new THREE.SphereGeometry(0.085, 8, 6), shared.bone, x + (i - 2) * 0.03, h, b.position.z));
    }
    const rib = mesh(new THREE.TorusGeometry(0.42, 0.03, 5, 16, Math.PI), shared.bone, 0, 0.75, 0);
    g.add(rib);
    return g;
  },
  web: () => {
    const w = decal(new THREE.PlaneGeometry(1.02, 1.02), shared.web, 0.07);
    w.rotation.z = Math.random() * Math.PI;
    // Above the hazard stripes: a web changes how the tile plays, so it must read through them.
    w.renderOrder = 5;
    return w;
  },
};

/** The map: one record per tile holding its base meshes, overlays, pick box and highlight quad. */
export class Terrain {
  readonly root = new THREE.Group();
  #tiles: TileView[] = [];
  #look = makeLook(BIOMES.span);

  constructor(parent: THREE.Object3D) { parent.add(this.root); }

  tile(x: number, z: number): TileView | undefined { return this.#tiles[idx(x, z)]; }
  get picks(): THREE.Object3D[] { return this.#tiles.map(t => t.pick); }

  load(s: BattleState): void {
    for (const t of this.#tiles) { disposeTree(t.group); disposeTree(t.hl); disposeTree(t.hz); }
    this.#tiles = [];
    this.#disposeLook();
    this.#look = makeLook(BIOMES[s.map]);
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const base = s.terr[idx(x, z)] ?? '.';
      const group = new THREE.Group();
      group.position.set(x - OFF, 0, z - OFF);
      this.root.add(group);
      const hl = decal(new THREE.PlaneGeometry(0.94, 0.94), new THREE.MeshBasicMaterial({ map: HL_TEX, transparent: true, depthWrite: false }), 0) as TileView['hl'];
      hl.renderOrder = 3;
      hl.visible = false;
      const hz = decal(new THREE.PlaneGeometry(0.98, 0.98), new THREE.MeshBasicMaterial({ map: HZ_TEX, transparent: true, depthWrite: false }), 0) as TileView['hz'];
      hz.renderOrder = 4;
      hz.visible = false;
      this.root.add(hl, hz);
      const t: TileView = { x, z, origin: base, base, group, pick: new THREE.Mesh(), fx: {}, spent: false, brazier: null, hl, hz };
      this.#tiles.push(t);
    }
    for (const t of this.#tiles) this.#build(t, s);
    this.sync(s);
  }

  #build(t: TileView, s: BattleState): void {
    const rnd = seeded(1 + idx(t.x, t.z) * 31);
    BUILD[t.base](t, rnd, (dx, dz) => (inb(t.x + dx, t.z + dz) ? s.terr[idx(t.x + dx, t.z + dz)] ?? null : null), this.#look);
    const top = t.base === 'o' ? 0 : t.base === '#' ? 1.6 : TOP[t.base] ?? 0;
    const pick = mesh(new THREE.BoxGeometry(1, top + 0.3, 1), pickMat, 0, (top - 0.3) / 2, 0);
    pick.userData.tile = { x: t.x, z: t.z } satisfies Pos;
    t.pick = pick;
    t.group.add(pick);
    t.hl.position.set(t.x - OFF, Math.max(0, TOP[t.base] ?? 0) + HL_Y, t.z - OFF);
    t.hz.position.copy(t.hl.position).setY(t.hl.position.y + 0.005);
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
      o.position.y += Math.max(0, TOP[t.base] ?? 0);
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

  /** Make every tile match `s`: base terrain (burnt grass, crumbled tiles), overlays and spent braziers. */
  sync(s: BattleState): void {
    this.rebase(s, this.#tiles.filter(t => (s.terr[idx(t.x, t.z)] ?? '.') !== t.base));
    for (const t of this.#tiles) {
      const f = s.fx[idx(t.x, t.z)];
      for (const key of FX_KEYS) this.setFx(t.x, t.z, key, f?.[key] !== undefined);
      this.setSpent(t.x, t.z, !!f?.spent);
    }
  }

  /** Rebuild `tiles` to their base in `s`, and the chasm tiles beside them, whose rim walls face their neighbours. */
  rebase(s: BattleState, tiles: readonly Pos[]): void {
    const views = tiles.flatMap(p => this.tile(p.x, p.z) ?? []), near = new Set<TileView>();
    for (const t of views) {
      t.group.position.y = 0;
      this.#rebuild(t, s, s.terr[idx(t.x, t.z)] ?? '.');
    }
    for (const t of views) for (const [dx, dz] of DIR4) {
      const n = this.tile(t.x + dx, t.z + dz);
      if (n && inb(n.x, n.z) && n.base === 'o' && !views.includes(n)) near.add(n);
    }
    for (const n of near) this.#rebuild(n, s, 'o');
  }

  /** Later layers win where they overlap. */
  highlight(layers: readonly Highlight[]): void {
    for (const t of this.#tiles) t.hl.visible = t.hz.visible = false;
    for (const layer of layers) {
      const tone = TONE[layer.tone];
      for (const p of layer.tiles) {
        const t = this.tile(p.x, p.z);
        if (!t) continue;
        const q = layer.tone === 'hazard' || layer.tone === 'friendly' ? t.hz : t.hl;
        q.visible = true;
        q.material.color.setHex(tone.color);
        q.material.opacity = layer.opacity ?? tone.opacity;
      }
    }
  }

  update(time: number): void {
    this.#look.water.emissiveIntensity = 0.5 + 0.15 * Math.sin(time * 1.5);
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

  #disposeLook(): void {
    const { wall, cap, grass, water } = this.#look;
    for (const m of [wall, cap, grass, water]) m.dispose();
  }

  dispose(): void {
    for (const t of this.#tiles) { disposeTree(t.group); disposeTree(t.hl); disposeTree(t.hz); }
    this.#tiles = [];
    this.#disposeLook();
    this.root.removeFromParent();
  }
}
