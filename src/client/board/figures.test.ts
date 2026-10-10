import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { CLASS_ORDER } from '../../engine/index';

/** The glTF JSON chunk of a .glb: magic, version, length, then the first chunk's length and type. */
interface Gltf {
  nodes?: { name?: string; mesh?: number; rotation?: number[]; extras?: { color?: unknown; size?: unknown } }[];
  meshes?: { primitives: { material?: number }[] }[];
  materials?: { name?: string }[];
}

function gltf(path: string): Gltf {
  const b = readFileSync(path);

  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
}

test('every class figure carries what buildModel reads: main and team materials and a weapon node', () => {
  const missing = CLASS_ORDER.flatMap(cls => {
    const j = gltf(new URL(`../../../public/models/${cls}.glb`, import.meta.url).pathname);
    const mats = new Set(j.materials?.map(m => m.name)), nodes = new Set(j.nodes?.map(n => n.name));

    return [...['main', 'team'].filter(m => !mats.has(m)), ...(nodes.has('weapon') ? [] : ['weapon'])].map(x => `${cls}: ${x}`);
  });

  expect(missing).toEqual([]);
});

test('every weapon keeps its own rotation identity, since the cast pose overwrites its x tilt', () => {
  const turned = CLASS_ORDER.filter(cls => {
    const j = gltf(new URL(`../../../public/models/${cls}.glb`, import.meta.url).pathname);
    const q = j.nodes?.find(n => n.name === 'weapon')?.rotation ?? [0, 0, 0, 1];

    return q.some((v, i) => Math.abs(v - (i === 3 ? 1 : 0)) > 1e-6);
  });

  expect(turned).toEqual([]);
});

test('every glow empty carries the colour and size its halo is built from', () => {
  const bad = CLASS_ORDER.flatMap(cls => {
    const j = gltf(new URL(`../../../public/models/${cls}.glb`, import.meta.url).pathname);

    return (j.nodes ?? []).filter(n => n.name?.startsWith('glow'))
      .filter(n => !/^#[0-9a-f]{6}$/i.test(String(n.extras?.color)) || !(Number(n.extras?.size) > 0))
      .map(n => `${cls}: ${n.name}`);
  });

  expect(bad).toEqual([]);
});

test('the gravecaller face is the void material, not a painted surface the lights can shade', () => {
  const j = gltf(new URL('../../../public/models/gravecaller.glb', import.meta.url).pathname);
  expect(j.materials?.map(m => m.name)).toContain('void');
});

test('the gravecaller ghost skulls, and only they, draw with the spirit material loadFigures makes additive', () => {
  const j = gltf(new URL('../../../public/models/gravecaller.glb', import.meta.url).pathname);
  const mats = (mesh: number) => j.meshes?.[mesh]?.primitives.map(p => j.materials?.[p.material ?? -1]?.name) ?? [];
  const spirit = (j.nodes ?? []).filter(n => n.mesh !== undefined && mats(n.mesh).includes('spirit'));
  expect(spirit.map(n => n.name?.replace(/\.\d+/, ''))).toEqual(['skull_face_mesh', 'skull_face_mesh']);
});
