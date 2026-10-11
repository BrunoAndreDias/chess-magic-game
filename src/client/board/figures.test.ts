import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { CLASS_ORDER } from '../../engine/index';
import { isAct } from './acts';

/** The glTF JSON chunk of a .glb: magic, version, length, then the first chunk's length and type. */
interface Gltf {
  nodes?: { name?: string; mesh?: number; rotation?: number[]; extras?: { color?: unknown; size?: unknown } }[];
  meshes?: { primitives: { material?: number }[] }[];
  materials?: { name?: string }[];
  animations?: { name?: string; extras?: { strike?: unknown }; samplers: { input: number }[] }[];
  accessors?: { max?: number[] }[];
}

function gltf(path: string): Gltf {
  const b = readFileSync(path);

  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
}

const figure = (cls: string): Gltf => gltf(new URL(`../../../public/models/${cls}.glb`, import.meta.url).pathname);

test('every class figure carries what buildModel reads: main and team materials and a weapon node', () => {
  const missing = CLASS_ORDER.flatMap(cls => {
    const j = figure(cls);
    const mats = new Set(j.materials?.map(m => m.name)), nodes = new Set(j.nodes?.map(n => n.name));

    return [...['main', 'team'].filter(m => !mats.has(m)), ...(nodes.has('weapon') ? [] : ['weapon'])].map(x => `${cls}: ${x}`);
  });

  expect(missing).toEqual([]);
});

test('every figure that casts without a clip keeps its weapon rotation identity, since the procedural cast bob overwrites its x tilt', () => {
  const procedural = CLASS_ORDER.filter(cls => !(figure(cls).animations ?? []).some(a => a.name === 'cast'));

  const turned = procedural.filter(cls => {
    const q = figure(cls).nodes?.find(n => n.name === 'weapon')?.rotation ?? [0, 0, 0, 1];

    return q.some((v, i) => Math.abs(v - (i === 3 ? 1 : 0)) > 1e-6);
  });

  expect([procedural, turned]).toEqual([['astromancer', 'gravecaller'], []]);
});

test('every glow empty carries the colour and size its halo is built from', () => {
  const bad = CLASS_ORDER.flatMap(cls => {
    const j = figure(cls);

    return (j.nodes ?? []).filter(n => n.name?.startsWith('glow'))
      .filter(n => !/^#[0-9a-f]{6}$/i.test(String(n.extras?.color)) || !(Number(n.extras?.size) > 0))
      .map(n => `${cls}: ${n.name}`);
  });

  expect(bad).toEqual([]);
});

test('the gravecaller face is the void material, not a painted surface the lights can shade', () => {
  const j = figure('gravecaller');
  expect(j.materials?.map(m => m.name)).toContain('void');
});

test('the gravecaller ghost skulls, and only they, draw with the spirit material loadFigures makes additive', () => {
  const j = figure('gravecaller');
  const mats = (mesh: number) => j.meshes?.[mesh]?.primitives.map(p => j.materials?.[p.material ?? -1]?.name) ?? [];
  const spirit = (j.nodes ?? []).filter(n => n.mesh !== undefined && mats(n.mesh).includes('spirit'));
  expect(spirit.map(n => n.name?.replace(/\.\d+/, ''))).toEqual(['skull_face_mesh', 'skull_face_mesh']);
});

test('the bellringer alone authors action clips, told apart from its idle clips by name', () => {
  const acts = Object.fromEntries(CLASS_ORDER.map(cls => [cls, (figure(cls).animations ?? []).flatMap(a => a.name ?? []).filter(isAct).sort()]));
  expect(acts).toEqual({
    astromancer: [], gravecaller: [],
    bellringer: ['attack', 'cast', 'down', 'hit', 'knell', 'move', 'peal', 'rise', 'toll'],
  });
  const idle = (figure('bellringer').animations ?? []).flatMap(a => a.name ?? []).filter(n => !isAct(n)).sort();
  expect(idle).toEqual(['beadsAction', 'bell_swingAction', 'breathAction', 'clapperAction', 'hourglassAction', 'ribbonsAction']);
});

test('every action clip strikes within its own length, where the board fires its effect', () => {
  const bad = CLASS_ORDER.flatMap(cls => {
    const j = figure(cls);

    return (j.animations ?? []).filter(a => isAct(a.name ?? '')).filter(a => {
      const length = Math.max(...a.samplers.map(s => j.accessors?.[s.input]?.max?.[0] ?? 0)), strike = Number(a.extras?.strike);

      return !(strike >= 0 && strike <= length);
    }).map(a => `${cls}: ${a.name}`);
  });

  expect(bad).toEqual([]);
});
