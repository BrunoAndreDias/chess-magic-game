import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CLASS_ORDER } from '../../engine/index';
import type { ClassId, Team } from '../../engine/index';
import { TEAM_HEX, glow, hex, keep } from './art';

/** What the board needs from a figure: `main` flashes on a hit (its emissive is reset to 0 after), `weapon` bobs on a cast, `height` places labels and effects, `idle` runs every frame with the clock in seconds. */
export interface Figure {
  body: THREE.Group;
  main: THREE.MeshStandardMaterial;
  height: number;
  weapon: THREE.Object3D;
  idle: ((time: number) => void) | null;
}

/** A class's loaded .glb, built by art/build.sh from art/figures/<class>.py. Its conventions are documented in art/figures/common.py. */
interface Source { scene: THREE.Group; clips: THREE.AnimationClip[]; height: number }
const SOURCES = new Map<ClassId, Source>();
/** Stands in for every `void` material: black that no light, fog or tone mapping can shade. */
const VOID = keep(new THREE.MeshBasicMaterial({ name: 'void', color: 0x000000, fog: false }));

/** Fetches every class figure once; call before the first `buildModel`. */
export async function loadFigures(): Promise<void> {
  const loader = new GLTFLoader();
  await Promise.all(CLASS_ORDER.map(async cls => {
    const g = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${cls}.glb`);
    g.scene.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = true;
      o.geometry.userData.shared = true;
      if ((o.material as THREE.Material).name === 'void') o.material = VOID;
      keep(o.material as THREE.Material);
    });
    SOURCES.set(cls, { scene: g.scene, clips: g.animations, height: new THREE.Box3().setFromObject(g.scene).max.y });
  }));
}

/** A class's figure in team colours, standing at the origin and facing +z. The battle and the setup lineup both use it. */
export function buildModel(cls: ClassId, team: Team): Figure {
  const src = SOURCES.get(cls);
  if (!src) throw new Error(`figure ${cls} is not loaded`);
  const body = src.scene.clone(true), own = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  // Only `main` and `team` change per unit; every other material and all geometry stay shared with the source.
  const mine = (m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial => {
    let c = own.get(m);
    if (c) return c;
    c = m.clone();
    if (m.name === 'team') {
      c.color.setHex(TEAM_HEX[team]);
      if (c.emissiveIntensity > 0 && c.emissive.getHex() !== 0) c.emissive.setHex(TEAM_HEX[team]);
    }
    own.set(m, c);
    return c;
  };
  const glows: THREE.Object3D[] = [];
  body.traverse(o => {
    if (o instanceof THREE.Mesh && (o.material.name === 'main' || o.material.name === 'team')) o.material = mine(o.material);
    if (o.name.startsWith('glow')) glows.push(o);
  });
  for (const o of glows) o.add(glow(hex(o.userData.color as string), o.userData.size as number, 0.9));
  const main = [...own.values()].find(m => m.name === 'main');
  const weapon = body.getObjectByName('weapon');
  if (!main || !weapon) throw new Error(`figure ${cls} needs a 'main' material and a 'weapon' object`);
  let idle: Figure['idle'] = null;
  if (src.clips.length) {
    const mixer = new THREE.AnimationMixer(body);
    for (const clip of src.clips) mixer.clipAction(clip).play();
    idle = t => { mixer.setTime(t); };
  }
  return { body, main, height: src.height, weapon, idle };
}
