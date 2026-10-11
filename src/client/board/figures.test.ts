import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { CLASS_ORDER } from '../../engine/index';
import { isAct } from './acts';

/** The glTF JSON chunk of a .glb: magic, version, length, then the first chunk's length and type. */
interface Gltf {
  nodes?: { name?: string; mesh?: number; children?: number[]; rotation?: number[]; extras?: { color?: unknown; size?: unknown } }[];
  meshes?: { primitives: { material?: number }[] }[];
  materials?: { name?: string }[];
  animations?: { name?: string; extras?: { strike?: unknown }; samplers: { input: number }[] }[];
  accessors?: { max?: number[] }[];
}

function gltf(path: string): Gltf {
  const b = readFileSync(path);

  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
}

const model = (cls: string): string => new URL(`../../../public/models/${cls}.glb`, import.meta.url).pathname;

const figure = (cls: string): Gltf => gltf(model(cls));

/** The parts of a .glb's JSON that locate a skinned mesh's vertex attributes in its binary chunk. */
interface Skinned {
  nodes: { name?: string; mesh?: number; skin?: number }[];
  skins: { joints: number[] }[];
  accessors: { bufferView: number; byteOffset?: number; componentType: number; count: number }[];
  bufferViews: { byteOffset?: number; byteStride?: number }[];
  meshes: { primitives: { attributes: Record<string, number> }[] }[];
}

/** Per skinned mesh of a .glb, the bones that carry any of its weight, read from its JOINTS_0 and WEIGHTS_0. */
function weighted(path: string): Record<string, string[]> {
  const b = readFileSync(path), length = b.readUInt32LE(12), bin = b.subarray(28 + length);
  const j: Skinned = JSON.parse(b.subarray(20, 20 + length).toString('utf8'));

  const vec4 = (k: number) => {
    const a = j.accessors[k]!, v = j.bufferViews[a.bufferView]!, size = { 5121: 1, 5123: 2, 5126: 4 }[a.componentType] ?? 4;
    const at = (v.byteOffset ?? 0) + (a.byteOffset ?? 0), stride = v.byteStride ?? 4 * size;
    const get = (o: number) => (size === 1 ? bin.readUInt8(o) : size === 2 ? bin.readUInt16LE(o) : bin.readFloatLE(o));

    return Array.from({ length: a.count }, (_, i) => [0, 1, 2, 3].map(c => get(at + i * stride + c * size)));
  };

  return Object.fromEntries(j.nodes.flatMap(n => {
    if (n.skin === undefined || n.mesh === undefined) return [];
    const joints = j.skins[n.skin]!.joints, names = new Set<string>();

    for (const { attributes: { JOINTS_0, WEIGHTS_0 } } of j.meshes[n.mesh]!.primitives) {
      const ws = vec4(WEIGHTS_0!);

      vec4(JOINTS_0!).forEach((js, i) => js.forEach((x, c) => { if (ws[i]![c]! > 0.01) names.add(j.nodes[joints[x]!]?.name ?? '?'); }));
    }

    return [[n.name ?? '?', [...names].sort()]];
  }));
}

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

  expect([procedural, turned]).toEqual([[], []]);
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

test('every figure authors its action clips, told apart from its idle clips by name', () => {
  const acts = Object.fromEntries(CLASS_ORDER.map(cls => [cls, (figure(cls).animations ?? []).flatMap(a => a.name ?? []).filter(isAct).sort()]));
  expect(acts).toEqual({
    astromancer: ['attack', 'cast', 'down', 'hit', 'move', 'rise'], gravecaller: ['attack', 'cast', 'down', 'hit', 'move', 'rise'],
    bellringer: ['attack', 'cast', 'down', 'hit', 'knell', 'move', 'peal', 'rise', 'toll'],
  });
  const idle = (figure('bellringer').animations ?? []).flatMap(a => a.name ?? []).filter(n => !isAct(n)).sort();
  expect(idle).toEqual(['beadsAction', 'bell_swingAction', 'breathAction', 'clapperAction', 'hourglassAction', 'ribbonsAction', 'rigAction']);
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

test('every figure skins its garment top to its spine and its sleeves along its arms, and hangs its head, fists and what they hold on its bones', () => {
  const ARM = ['clavicle', 'elbow', 'forearm', 'shoulder', 'upperarm'];
  const arms = (...drapes: string[]) => ['chest', ...drapes, 'hips', ...ARM.flatMap(b => [`${b}_l`, `${b}_r`])].sort();

  const ridden = {
    astromancer: { chest_mesh: 'chest', armillary: 'chest', forearm_l_mesh: 'forearm_l', hand_r_mesh: 'hand_r', weapon: 'hand_r', hand_l_mesh: 'hand_l', planet: 'hand_l' },
    bellringer: { chest_mesh: 'chest', forearm_l_mesh: 'forearm_l', hand_r_mesh: 'hand_r', weapon: 'hand_r', hand_l_mesh: 'hand_l', beads: 'hand_l' },
    gravecaller: { chest_mesh: 'chest', forearm_l_mesh: 'forearm_l', hand_r_mesh: 'hand_r', weapon: 'hand_r', hand_l_mesh: 'hand_l', bell_swing: 'hand_l' },
  };

  const found = Object.fromEntries(CLASS_ORDER.map(cls => {
    const nodes = figure(cls).nodes ?? [];
    const parent = (name: string) => nodes.find(n => n.children?.some(c => nodes[c]?.name === name))?.name;

    return [cls, { skin: weighted(model(cls)), ridden: Object.fromEntries(Object.keys(ridden[cls]).map(n => [n, parent(n)])) }];
  }));

  expect(found).toEqual({
    astromancer: { skin: { rig_skin: arms('drape_l', 'drape_r') }, ridden: ridden.astromancer },
    bellringer: { skin: { rig_skin: arms('drape_l') }, ridden: ridden.bellringer },
    gravecaller: { skin: { rig_skin: arms('drape_l') }, ridden: ridden.gravecaller },
  });
});
