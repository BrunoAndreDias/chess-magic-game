import * as THREE from 'three';
import { DIR4, N, idx, inb } from '../../engine/index';
import type { BattleState, Pos, TerrainChar, TileFx } from '../../engine/index';
import type { Highlight, HighlightTone } from '../board';
import { BIOMES } from '../biome';
import type { Biome } from '../biome';
import { OFF, basic, decal, disposeTree, glow, keep, mat, mesh, seeded } from './art';
import { SWAY, blades, block, bake, kit, paintBlock, prep, rock, shade, shaft, tint } from './kit';
import type { Kit, Part } from './kit';

export type FxKey = Exclude<keyof TileFx, 'spent' | 'glassBy'>;

export const FX_KEYS: readonly FxKey[] = ['fire', 'smoke', 'ice', 'bone', 'glass'];

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
  /** Static stone, grass and metal in board space, merged with every other tile's unless the tile is `loose`. */
  parts: Part[];
  /** Drawn on its own so it can move, as a crumbling tile falls. */
  loose: boolean;
  hl: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  hz: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}

const TOP: Partial<Record<TerrainChar, number>> = { '^': 0.42, '~': -0.14 };

const SLAB_H: Partial<Record<TerrainChar, number>> = { '^': 0.72, '~': 0.16 };

const SCORCHED_COL = [0x2a2224, 0x261f20] as const;

export const CHASM_Y = -1.4;

const TONE: Readonly<Record<HighlightTone, { color: number; opacity: number }>> = {
  move: { color: 0x5b8cff, opacity: 0.7 },
  path: { color: 0xa9c3ff, opacity: 0.9 },
  target: { color: 0xff6b5b, opacity: 0.65 },
  aoe: { color: 0xffb04a, opacity: 0.9 },
  deploy: { color: 0xe8b65a, opacity: 0.4 },
  selected: { color: 0xffe9b0, opacity: 0.8 },
  hazard: { color: 0xd65cff, opacity: 0.85 },
  friendly: { color: 0xffe14a, opacity: 0.95 },
  altar: { color: 0xffd36b, opacity: 0.6 },
  pull: { color: 0xff5cc8, opacity: 0.95 },
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

const pickMat = keep(new THREE.MeshBasicMaterial({ visible: false }));

const shared = {
  void: basic(0x0c0618),
  ice: new THREE.MeshStandardMaterial({ color: 0xcff4ff, emissive: 0x5ab6e0, emissiveIntensity: 0.35, roughness: 0.1, transparent: true, opacity: 0.9 }),
  fireBase: basic(0xff5a1a, 0.35),
  bone: mat(0xe8e2d0, { roughness: 0.6 }), marrow: mat(0x9a8f78),
  glass: new THREE.MeshStandardMaterial({ color: 0xe8f6ff, emissive: 0x6a8aff, emissiveIntensity: 0.25, roughness: 0.02, metalness: 0.3, transparent: true, opacity: 0.28, depthWrite: false }),
  glassEdge: new THREE.LineBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.85 }),
  sun: new THREE.MeshStandardMaterial({ map: sunTexture(), emissive: 0xffb84a, emissiveIntensity: 0.8, roughness: 0.35, metalness: 0.5, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
};

for (const m of Object.values(shared)) keep(m);

/** The altar's gold inlay: rays, rings and a disc, laid across every 'A' tile as one emblem. */
function sunTexture(): THREE.CanvasTexture {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!, mid = S / 2;

  const ink = (col: string, dx: number, dy: number): void => {
    g.save();
    g.translate(mid + dx, mid + dy);
    g.strokeStyle = g.fillStyle = col;
    g.lineWidth = 12;
    g.beginPath(); g.arc(0, 0, 228, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 5;
    g.beginPath(); g.arc(0, 0, 200, 0, Math.PI * 2); g.stroke();

    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, r = i % 2 ? 150 : 188, w = i % 2 ? 0.09 : 0.13;
      g.beginPath();
      g.moveTo(Math.cos(a - w) * 92, Math.sin(a - w) * 92);
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      g.lineTo(Math.cos(a + w) * 92, Math.sin(a + w) * 92);
      g.fill();
    }

    g.lineWidth = 8;
    g.beginPath(); g.arc(0, 0, 80, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, 56, 0, Math.PI * 2); g.fill();
    g.restore();
  };

  ink('rgba(70,40,10,0.7)', 3, 4);
  ink('#f2c766', 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;

  return t;
}

/** Per-load materials and layout facts the tiles of one map share, rebuilt when the map changes. */
interface Look {
  biome: Biome;
  kit: Kit;
  water: THREE.MeshStandardMaterial;
  /** The rectangle the altar tiles cover, so each one shows its slice of the emblem. */
  altar: { x0: number; z0: number; w: number; d: number } | null;
}

function makeLook(biome: Biome, s: BattleState | null): Look {
  const as = s ? s.terr.flatMap((c, k) => (c === 'A' ? [{ x: k % N, z: Math.floor(k / N) }] : [])) : [];
  const xs = as.map(p => p.x), zs = as.map(p => p.z);

  return {
    biome, kit: kit(biome),
    water: keep(new THREE.MeshStandardMaterial({ color: biome.water, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.82, emissive: biome.waterGlow, emissiveIntensity: 0.6 })),
    altar: as.length ? { x0: Math.min(...xs), z0: Math.min(...zs), w: Math.max(...xs) - Math.min(...xs) + 1, d: Math.max(...zs) - Math.min(...zs) + 1 } : null,
  };
}

/** What a tile's builder works with. Static stone goes into `parts`, in the tile's own space; anything that animates or glows goes on the group. */
interface Ctx {
  t: TileView;
  rnd: () => number;
  near: (dx: number, dz: number) => TerrainChar | null;
  look: Look;
  parts: Part[];
}

type Build = (c: Ctx) => void;

/** How high each terrain stands, for the occlusion a taller neighbour throws on a tile's top. */
const RISE: Partial<Record<TerrainChar, number>> = { '#': 1.8, '^': 0.42, 'G': 0.3, '~': -0.14, 'o': -2 };

const slabCols = (t: TileView, b: Biome): readonly [number, number] =>
  t.base === '.' && t.origin === 'G' ? SCORCHED_COL : t.base === '^' ? b.high : t.base === 'G' ? b.grassBed : b.floor;

/** Darkens a top near a taller neighbour, edge and corner alike, like the soft contact shadow a painter adds. */
function occlusion(c: Ctx, top: number): (p: THREE.Vector3, n: THREE.Vector3) => number {
  const rise: [number, number, number][] = [];

  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const n = c.near(dx, dz);

    if ((dx || dz) && n !== null) {
      const k = Math.min(1, ((RISE[n] ?? 0) - top) / 0.7);

      if (k > 0.05) rise.push([dx, dz, k * (dx && dz ? 0.3 : 0.45)]);
    }
  }

  return (p, nrm) => {
    if (nrm.y < 0.2 || !rise.length) return 1;
    let k = 1;

    for (const [dx, dz, s] of rise) {
      const ex = dx ? Math.max(0, 1 - (0.5 - p.x * dx) / 0.42) : 1, ez = dz ? Math.max(0, 1 - (0.5 - p.z * dz) / 0.42) : 1;
      k *= 1 - s * ex * ex * ez * ez;
    }

    return k;
  };
}

function grout(b: Biome): number {
  return new THREE.Color(b.floor[1]).multiplyScalar(0.32).lerp(new THREE.Color(b.moss).multiplyScalar(0.45), 0.45).getHex();
}

function slab(c: Ctx): void {
  const { t, rnd, look, parts } = c, h = SLAB_H[t.base] ?? 0.3, top = TOP[t.base] ?? 0, col = slabCols(t, look.biome)[(t.x + t.z) % 2]!;

  if (t.base === '^') {
    parts.push({ slot: 'stone', geo: paintBlock(block(0.97, 0.44, 0.97, rnd, 0.06).translate(0, top - 0.3 - 0.22, 0), top - 0.3, -0.3, new THREE.Color(col).multiplyScalar(0.82).getHex(), rnd) });
  }

  const sh = t.base === '^' ? 0.3 : h, w = t.base === '^' ? 0.92 : 0.94;
  const g = block(w, sh, w, rnd, 0.075, 0.022).rotateX((rnd() - 0.5) * 0.025).rotateZ((rnd() - 0.5) * 0.025).translate(0, top - sh / 2, 0);
  paintBlock(g, top, top - sh, col, rnd);
  parts.push({ slot: 'stone', geo: shade(g, occlusion(c, top)) });

  if (t.base !== '~') parts.push({ slot: 'plain', geo: tint(prep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, -0.11, 0)), grout(look.biome)) });

  // Weeds where four stones meet; each tile seeds only its own far corner so no corner doubles up.
  if ((t.base === '.' || t.base === 'G') && t.origin !== 'G' && rnd() < 0.35) {
    parts.push({ slot: 'grass', geo: blades(rnd, 9, () => [0.5 + (rnd() - 0.5) * 0.12, -0.02, 0.5 + (rnd() - 0.5) * 0.12], [0.07, 0.2], new THREE.Color(look.biome.moss).multiplyScalar(0.5).getHex(), look.biome.grass) });
  }
}

/** A ruined pillar: three courses of chunky stone, a heavier cap that may have cracked off, rubble at the foot. */
function ruin(c: Ctx): void {
  const { rnd, look: { biome }, parts } = c;
  let y = 0;

  for (const [i, [w, h]] of ([[0.98, 0.62], [0.92, 0.52], [0.94, 0.46]] as const).entries()) {
    const hh = h * (0.9 + rnd() * 0.2), split = i > 0 && rnd() < 0.7, alongX = (i + c.t.x) % 2 === 0;

    for (const half of split ? [-1, 1] : [0]) {
      const cut = 0.5 + (rnd() - 0.5) * 0.2, bw = split ? w * (half < 0 ? cut : 1 - cut) - 0.03 : w, at = split ? half * (w / 2 - bw / 2 - 0.015) : 0;

      const g = block(alongX ? bw : w, hh, alongX ? w : bw, rnd, 0.07, 0.035).rotateY((rnd() - 0.5) * 0.1)
        .translate((alongX ? at : 0) + (rnd() - 0.5) * 0.04, y + hh / 2, (alongX ? 0 : at) + (rnd() - 0.5) * 0.04);

      paintBlock(g, y + hh, y, new THREE.Color(biome.wall).offsetHSL(0, 0, (rnd() - 0.5) * 0.06).getHex(), rnd);
      parts.push({ slot: 'stone', geo: shade(g, p => 0.62 + 0.42 * Math.min(1, p.y / 1.8)) });
    }

    y += hh;
  }

  const broken = rnd() < 0.5;
  const capW = broken ? 0.62 : 1.04, cap = block(capW, 0.18, broken ? 0.9 : 1.04, rnd, 0.06, 0.03);
  cap.rotateZ(broken ? 0.14 : 0).translate(broken ? -0.18 : 0, y + 0.09 + (broken ? 0.03 : 0), 0);
  parts.push({ slot: 'stone', geo: paintBlock(cap, y + 0.18, y, biome.cap, rnd) });

  for (let i = 0; i < 2 + Math.floor(rnd() * 2); i++) {
    const a = rnd() * 6.3, g = rock(rnd, 0.08 + rnd() * 0.06, biome.wall).translate(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45);
    parts.push({ slot: 'stone', geo: g });
  }
}

const BUILD: Readonly<Record<TerrainChar, Build>> = {
  '.': slab,
  '^': slab,
  '+': c => {
    slab(c);
    const rune = decal(new THREE.RingGeometry(0.22, 0.4, 6), new THREE.MeshBasicMaterial({ color: 0x7ee081, transparent: true, opacity: 0.8, side: THREE.DoubleSide }), 0.02);
    const g = glow(0x7ee081, 0.9, 0.5);
    g.position.y = 0.4;
    c.t.group.add(rune, g);
  },
  'A': c => {
    slab(c);
    const a = c.look.altar;

    if (!a) return;
    const geo = new THREE.PlaneGeometry(1, 1), uv = geo.attributes.uv!, u0 = (c.t.x - a.x0) / a.w, v0 = (c.t.z - a.z0) / a.d;

    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) / a.w, 1 - (v0 + (1 - uv.getY(i)) / a.d));
    const inlay = decal(geo, shared.sun, 0.022);
    inlay.renderOrder = 1;
    c.t.group.add(inlay);
  },
  'G': c => {
    slab(c);
    const { rnd, look: { biome } } = c;
    c.parts.push({ slot: 'grass', geo: blades(rnd, 120, () => [(rnd() - 0.5) * 0.92, 0, (rnd() - 0.5) * 0.92], [0.45, 0.9], new THREE.Color(biome.grassBed[0]).multiplyScalar(0.7).getHex(), new THREE.Color(biome.grass).offsetHSL(0.02, 0.05, 0.12).getHex()) });
  },
  '~': c => {
    slab(c);
    c.t.group.add(decal(new THREE.PlaneGeometry(1, 1), c.look.water, -0.1));
  },
  'I': c => {
    slab(c);
    c.t.group.add(mesh(new THREE.BoxGeometry(0.98, 0.08, 0.98), shared.ice, 0, -0.02, 0));
  },
  '#': c => {
    slab(c);
    ruin(c);
  },
  'o': c => {
    const { t, rnd, near, parts } = c;
    t.group.add(mesh(new THREE.BoxGeometry(1, 0.1, 1), shared.void, 0, -1.5, 0));
    const g = glow(0x7a3aff, 1.9, 0.55);
    g.position.y = -1.1;
    t.group.add(g);

    for (const [dx, dz] of DIR4) {
      const n = near(dx, dz);

      if (n === null || n === 'o') continue;
      const lip = block(dx ? 0.14 : 1, 1.4, dz ? 0.14 : 1, rnd, 0.04, 0.05).translate(dx * 0.44, -0.75, dz * 0.44);
      parts.push({ slot: 'stone', geo: paintBlock(lip, -0.05, -1.45, c.look.biome.wall, rnd) });
    }
  },
  'B': c => {
    slab(c);
    const { t, rnd, parts, look: { biome } } = c;
    parts.push({ slot: 'stone', geo: paintBlock(block(0.52, 0.22, 0.52, rnd, 0.05).translate(0, 0.11, 0), 0.22, 0, biome.cap, rnd) });
    parts.push({ slot: 'stone', geo: shaft(8, 0.13, 0.09, 0.36, rnd, biome.wall).translate(0, 0.22, 0) });
    const bowl = prep(new THREE.LatheGeometry([0.06, 0.2, 0.33, 0.37, 0.34].map((r, i) => new THREE.Vector2(r, i * 0.07)), 12));
    bowl.computeVertexNormals();
    parts.push({ slot: 'metal', geo: shade(tint(bowl.translate(0, 0.58, 0), 0x6a4a2a), p => 0.5 + 0.9 * (p.y - 0.58) / 0.28) });
    parts.push({ slot: 'plain', geo: tint(prep(new THREE.CircleGeometry(0.32, 12).rotateX(-Math.PI / 2).translate(0, 0.84, 0)), 0x3a1608) });
    const flame = glow(0xff7a2a, 1.3), core = glow(0xffe0a0, 0.5);
    flame.position.y = 1.05;
    core.position.y = 1.0;
    const light = new THREE.PointLight(0xff7a2a, Math.PI, 6, 2);
    light.position.y = 1.3;
    t.group.add(flame, core, light);
    t.brazier = { flame, core, light, ph: rnd() * 9 };
  },
};

/** The tile each pick box stands for. */
export const TILE_OF = new WeakMap<THREE.Object3D, Pos>();

/** Each flame's flicker or smoke puff's drift phase, so neighbours move out of step. */
const PHASE = new WeakMap<THREE.Object3D, number>();

const FX_BUILD: Readonly<Record<FxKey, () => THREE.Object3D>> = {
  fire: () => {
    const g = new THREE.Group();
    g.add(decal(new THREE.PlaneGeometry(0.9, 0.9), shared.fireBase, 0.03));

    for (let i = 0; i < 3; i++) {
      const s = glow(i ? 0xff7a2a : 0xffd08a, 0.6, 0.9);
      s.position.set((Math.random() - 0.5) * 0.5, 0.3, (Math.random() - 0.5) * 0.5);
      PHASE.set(s, Math.random() * 9);
      g.add(s);
    }

    return g;
  },
  smoke: () => {
    const g = new THREE.Group();

    for (let i = 0; i < 4; i++) {
      const s = glow(0x8a8f9a, 1.3, 0.45, false);
      s.position.set((Math.random() - 0.5) * 0.6, 0.4 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6);
      PHASE.set(s, Math.random() * 9);
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
  /** A mime's invisible wall made visible: a clear block of glass with bright edges and a glint, so it reads as a wall you can see through. */
  glass: () => {
    const g = new THREE.Group(), box = new THREE.BoxGeometry(0.9, 1.2, 0.9);
    const pane = mesh(box, shared.glass, 0, 0.6, 0);
    pane.renderOrder = 4;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), shared.glassEdge);
    edges.position.y = 0.6;
    const glint = glow(0xeaf4ff, 0.5, 0.8);
    glint.position.set(0.3, 1.05, 0.3);
    PHASE.set(glint, Math.random() * 9);
    g.add(pane, edges, glint);

    return g;
  },
};

/** The map: one record per tile holding its base meshes, overlays, pick box and highlight quad. */
export class Terrain {
  readonly root = new THREE.Group();
  #tiles: TileView[] = [];
  #look = makeLook(BIOMES.span, null);
  #merged: THREE.Mesh[] = [];

  constructor(parent: THREE.Object3D) { parent.add(this.root); }

  tile(x: number, z: number): TileView | undefined { return this.#tiles[idx(x, z)]; }
  get picks(): THREE.Object3D[] { return this.#tiles.map(t => t.pick); }

  load(s: BattleState): void {
    // The map, picks, scout and battle screens each load the same map, and building its stone takes about 45 ms.
    if (this.#look.biome === BIOMES[s.map] && this.#tiles.length && this.#tiles.every(t => t.origin === (s.terr[idx(t.x, t.z)] ?? '.'))) {
      this.rebase(s, this.#tiles.filter(t => t.loose || t.group.position.y !== 0));
      this.sync(s);

      return;
    }

    this.#clear();
    this.#look = makeLook(BIOMES[s.map], s);

    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const base = s.terr[idx(x, z)] ?? '.';
      const group = new THREE.Group();
      group.position.set(x - OFF, 0, z - OFF);
      this.root.add(group);
      const hl = decal(new THREE.PlaneGeometry(0.94, 0.94), new THREE.MeshBasicMaterial({ map: HL_TEX, transparent: true, depthWrite: false }), 0);
      hl.renderOrder = 3;
      hl.visible = false;
      const hz = decal(new THREE.PlaneGeometry(0.98, 0.98), new THREE.MeshBasicMaterial({ map: HZ_TEX, transparent: true, depthWrite: false }), 0);
      hz.renderOrder = 4;
      hz.visible = false;
      this.root.add(hl, hz);
      const t: TileView = { x, z, origin: base, base, group, pick: new THREE.Mesh(), fx: {}, spent: false, brazier: null, parts: [], loose: false, hl, hz };
      this.#tiles.push(t);
    }

    for (const t of this.#tiles) this.#build(t, s);
    this.#remesh();
    this.sync(s);
  }

  #build(t: TileView, s: BattleState): void {
    const rnd = seeded(1 + idx(t.x, t.z) * 31), parts: Part[] = [];
    BUILD[t.base]({ t, rnd, near: (dx, dz) => (inb(t.x + dx, t.z + dz) ? s.terr[idx(t.x + dx, t.z + dz)] ?? null : null), look: this.#look, parts });

    for (const p of parts) p.geo.translate(t.x - OFF, 0, t.z - OFF);
    t.parts = parts;
    t.loose = false;
    const top = t.base === 'o' ? 0 : t.base === '#' ? 1.6 : TOP[t.base] ?? 0;
    const pick = mesh(new THREE.BoxGeometry(1, top + 0.3, 1), pickMat, 0, (top - 0.3) / 2, 0);
    TILE_OF.set(pick, { x: t.x, z: t.z });
    t.pick = pick;
    t.group.add(pick);
    t.hl.position.set(t.x - OFF, Math.max(0, TOP[t.base] ?? 0) + HL_Y, t.z - OFF);
    t.hz.position.copy(t.hl.position).setY(t.hl.position.y + 0.005);
  }

  #rebuild(t: TileView, s: BattleState, base: TerrainChar): void {
    const fx = t.fx;

    for (const c of [...t.group.children]) if (!Object.values(fx).includes(c)) disposeTree(c);

    for (const p of t.parts) p.geo.dispose();
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

    if (views.length) this.#remesh();
  }

  /** Pull `tiles` out of the merged board into meshes of their own, so moving a tile's group moves its stone. */
  loosen(tiles: readonly Pos[]): void {
    for (const p of tiles) {
      const t = this.tile(p.x, p.z);

      if (!t || t.loose) continue;
      t.loose = true;

      for (const part of t.parts) t.group.add(mesh(part.geo, this.#look.kit[part.slot], OFF - t.x, 0, OFF - t.z));
    }

    this.#remesh();
  }

  #remesh(): void {
    for (const m of this.#merged) disposeTree(m);
    this.#merged = bake(this.#look.kit, this.#tiles.flatMap(t => (t.loose ? [] : t.parts)));
    this.root.add(...this.#merged);
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
    SWAY.value = time;
    this.#look.water.emissiveIntensity = 0.5 + 0.15 * Math.sin(time * 1.5);

    for (const t of this.#tiles) {
      const b = t.brazier;

      if (b && !t.spent) {
        b.light.intensity = Math.PI * (0.9 + 0.25 * Math.sin(time * 10 + b.ph));
        b.flame.scale.setScalar(1.2 + 0.2 * Math.sin(time * 12 + b.ph));
      }

      if (t.fx.fire) for (const c of t.fx.fire.children) {
        const ph = PHASE.get(c);

        if (ph === undefined) continue;
        c.scale.setScalar(0.55 + 0.2 * Math.sin(time * 14 + ph));
        c.position.y = 0.3 + 0.08 * Math.sin(time * 9 + ph);
      }

      if (t.fx.smoke) for (const c of t.fx.smoke.children) {
        const ph = PHASE.get(c);

        if (ph === undefined || !(c instanceof THREE.Sprite)) continue;
        c.position.y += Math.sin(time + ph) * 0.002;
        c.material.rotation += 0.004;
      }

      if (t.fx.glass) for (const c of t.fx.glass.children) {
        const ph = PHASE.get(c);

        // The glint slides down the pane now and then.
        if (ph !== undefined) c.position.y = 0.25 + ((time * 0.6 + ph) % 3 < 1 ? 0.85 * (1 - ((time * 0.6 + ph) % 1)) : 0.85);
      }
    }
  }

  #clear(): void {
    for (const t of this.#tiles) {
      disposeTree(t.group); disposeTree(t.hl); disposeTree(t.hz);

      for (const p of t.parts) p.geo.dispose();
    }

    for (const m of this.#merged) disposeTree(m);
    this.#tiles = [];
    this.#merged = [];
    this.#look.water.dispose();
  }

  dispose(): void {
    this.#clear();
    this.root.removeFromParent();
  }
}
