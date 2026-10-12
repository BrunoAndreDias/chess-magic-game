import type { MapId } from '../engine/index';

/** How a map looks: sky, light, and the stone, grass and water its tiles are made of. Scenery around the board lives in board/scenery.ts. */
export interface Biome {
  sky: number;
  fog: { near: number; far: number };
  hemi: { sky: number; ground: number; k: number };
  ambient: number;
  sun: { color: number; k: number; pos: readonly [number, number, number] };
  /** Checkerboard pairs for '.', '^' and 'G' slabs. */
  floor: readonly [number, number];
  high: readonly [number, number];
  grassBed: readonly [number, number];
  floorRough: number;
  wall: number;
  cap: number;
  grass: number;
  water: number;
  waterGlow: number;
  /** Painted into the grout, cracks and chipped edges of every stone. */
  moss: number;
  /** The ground around the plinth and the stone of the plinth itself. */
  ground: number;
  trim: number;
  /** The metal rail that frames the board on the plinth's lip. */
  rail: number;
}

export const BIOMES = {
  span: {
    sky: 0x1b1430, fog: { near: 14, far: 34 },
    hemi: { sky: 0xb8a4e0, ground: 0x1a1030, k: 0.45 }, ambient: 0.06,
    sun: { color: 0xffc8b8, k: 0.55, pos: [-10, 9, -6] },
    floor: [0xa29c96, 0x968f8a], high: [0xb4aa98, 0xa89e8c], grassBed: [0x2c3a26, 0x283522], floorRough: 0.85,
    wall: 0x6e665c, cap: 0x7e766a, grass: 0x5a7a44, water: 0x1f5a8a, waterGlow: 0x0a2a44, moss: 0x6a7a5a, ground: 0x2a2236, trim: 0x6a6070, rail: 0x9a8ab8,
  },
  storm: {
    sky: 0x0b1519, fog: { near: 10, far: 30 },
    hemi: { sky: 0x7fa8c0, ground: 0x0a1418, k: 0.4 }, ambient: 0.05,
    sun: { color: 0xa8d0ff, k: 0.35, pos: [4, 16, 6] },
    floor: [0x2f3c42, 0x2a363b], high: [0x4a5a5e, 0x43525a], grassBed: [0x2c3a26, 0x283522], floorRough: 0.35,
    wall: 0x3a4648, cap: 0x56666a, grass: 0x4f7a3a, water: 0x1a6a78, waterGlow: 0x0a3a44, moss: 0x3a5a4a, ground: 0x10181c, trim: 0x3e4a4e, rail: 0x8aa4b0,
  },
  altar: {
    sky: 0x2a2018, fog: { near: 18, far: 44 },
    hemi: { sky: 0xa8bce0, ground: 0x3a3420, k: 0.68 }, ambient: 0.08,
    sun: { color: 0xffd8a4, k: 1.15, pos: [8, 12, -3] },
    floor: [0xbc9f74, 0xb3966d], high: [0xe2c99a, 0xdbc192], grassBed: [0x3a4a22, 0x34431e], floorRough: 0.9,
    wall: 0x9c9284, cap: 0xcdbb94, grass: 0x6aa03a, water: 0x2a7a8a, waterGlow: 0x0a3a44, moss: 0x6f8f3a, ground: 0x4a6a26, trim: 0x8e8070, rail: 0xe0b25a,
  },
} satisfies Record<MapId, Biome>;

export const css = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
