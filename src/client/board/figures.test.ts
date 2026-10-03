import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { CLASS_ORDER } from '../../engine/index';

/** The glTF JSON chunk of a .glb: magic, version, length, then the first chunk's length and type. */
function gltf(path: string): { nodes?: { name?: string }[]; materials?: { name?: string }[] } {
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
