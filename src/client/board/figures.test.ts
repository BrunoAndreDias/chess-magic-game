import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { CLASS_ORDER } from '../../engine/index';

/** The glTF JSON chunk of a .glb: magic, version, length, then the first chunk's length and type. */
interface Gltf {
  nodes?: { name?: string; mesh?: number }[];
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
