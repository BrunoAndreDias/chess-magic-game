import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CLASS_ORDER } from '../../engine/index';
import type { ClassId, Team } from '../../engine/index';
import { rig } from './acts';
import type { Rig } from './acts';
import { TEAM_HEX, glow, hex, keep } from './art';

/** What the board needs from a figure: `main` flashes on a hit (its emissive is reset to 0 after), `weapon` bobs on a cast without a clip, `height` places labels and effects, `rig` ticks every frame with the clock in seconds and plays the action clips. */
export interface Figure {
  body: THREE.Group;
  main: THREE.MeshStandardMaterial;
  height: number;
  weapon: THREE.Object3D;
  rig: Rig;
}

/** A class's loaded .glb, built by art/build.sh from art/figures/<class>.py. Its conventions are documented in art/figures/common.py. */
interface Source { scene: THREE.Group; clips: THREE.AnimationClip[]; height: number }

const SOURCES = new Map<ClassId, Source>();

/** Stands in for every `void` material: black that no light, fog or tone mapping can shade. */
const VOID = keep(new THREE.MeshBasicMaterial({ name: 'void', color: 0x000000, fog: false }));

/** Stands in for a `spirit` material: its atlas colour added to whatever is behind, unlit and unfogged, so black is clear. */
const spirit = (m: THREE.MeshStandardMaterial): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({
  name: 'spirit', map: m.map, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false,
});

/** Figure colour maps whose sRGB bytes upload as RGBA8; see {@link decodeSrgb}. */
const RAW_SRGB = new WeakSet<THREE.Texture>();

/**
 * Chrome on Metal uploads a 2048px map into an sRGB texture in about 26 ms and into RGBA8 in about 3 ms, and every WebGL
 * context uploads each figure's maps again. So figure colour maps upload their sRGB bytes as RGBA8 and the shader decodes
 * them, the way three decodes video. `copy` resets a standard material's defines, so every clone needs this again.
 */
function decodeSrgb(m: THREE.Material): void {
  if (!(m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshBasicMaterial)) return;

  const raw = (t: THREE.Texture | null): boolean => {
    if (t?.colorSpace === THREE.SRGBColorSpace) { t.colorSpace = THREE.NoColorSpace; RAW_SRGB.add(t); }

    return !!t && RAW_SRGB.has(t);
  };

  if (raw(m.map)) m.defines = { ...m.defines, DECODE_VIDEO_TEXTURE: '' };

  if (m instanceof THREE.MeshStandardMaterial && raw(m.emissiveMap)) m.defines = { ...m.defines, DECODE_VIDEO_TEXTURE_EMISSIVE: '' };
}

/** Fetches every class figure once; call before the first `buildModel`. */
export async function loadFigures(): Promise<void> {
  const loader = new GLTFLoader();
  await Promise.all(CLASS_ORDER.map(async cls => {
    const g = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${cls}.glb`);
    g.scene.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = true;
      o.geometry.userData.shared = true;

      // A skinned mesh's bounds are taken once, from whatever pose it first draws in; a raised arm would cull early.
      if (o instanceof THREE.SkinnedMesh) o.frustumCulled = false;
      const m: THREE.Material | THREE.Material[] = o.material;

      if (m instanceof THREE.Material && m.name === 'void') o.material = VOID;
      else if (m instanceof THREE.MeshStandardMaterial && m.name === 'spirit') {
        o.material = spirit(m);
        o.castShadow = false;
      }

      for (const x of [o.material].flat()) { keep(x); decodeSrgb(x); }
    });
    // GLTFLoader drops animation extras; an action clip's `strike` lives there (art/figures/common.py).
    g.animations.forEach((clip, i) => { Object.assign(clip.userData, g.parser.json.animations?.[i]?.extras); });
    SOURCES.set(cls, { scene: g.scene, clips: g.animations, height: new THREE.Box3().setFromObject(g.scene).max.y });
  }));
}

/**
 * Gives a clone its team: `main` and `team` materials become the clone's own (only they change per unit; every other
 * material and all geometry stay shared with the source), and each glow empty gets its halo.
 */
function dress(body: THREE.Object3D, team: Team): Map<THREE.Material, THREE.MeshStandardMaterial> {
  const own = new Map<THREE.Material, THREE.MeshStandardMaterial>();

  const mine = (m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial => {
    let c = own.get(m);

    if (c) return c;
    c = m.clone();
    decodeSrgb(c);

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

  // The glb's custom props, per art/figures/common.py: `color` is "#rrggbb" and `size` is metres.
  for (const o of glows) o.add(glow(hex(String(o.userData.color)), Number(o.userData.size), 0.9));

  return own;
}

/** A class's figure in team colours, standing at the origin and facing +z. The battle and the setup lineup both use it. */
export function buildModel(cls: ClassId, team: Team): Figure {
  const src = SOURCES.get(cls);

  if (!src) throw new Error(`figure ${cls} is not loaded`);
  // A skinned mesh's clone must bind the clone's own bones, which Object3D.clone leaves pointing at the source's.
  // SAFETY: SkeletonUtils.clone copies the root with its own clone(), which keeps its class, and a glTF scene is a Group.
  const body = clone(src.scene) as THREE.Group, own = dress(body, team);
  const main = [...own.values()].find(m => m.name === 'main');
  const weapon = body.getObjectByName('weapon');

  if (!main || !weapon) throw new Error(`figure ${cls} needs a 'main' material and a 'weapon' object`);

  return { body, main, height: src.height, weapon, rig: rig(body, src.clips) };
}

/** How tall the board Doll stands: a little shorter than the Marionettist that works it. */
const DOLL_HEIGHT = 1.2;

/**
 * A Marionettist's Doll on the board: the puppet the art hangs from its crossbar (the `doll` node), cloned and grown to
 * a body's height, standing at the origin. It plays no clips; the hit flash uses its own copy of the puppet's material.
 */
export function buildDoll(team: Team): Figure {
  const node = SOURCES.get('marionettist')?.scene.getObjectByName('doll');

  if (!node) throw new Error('the marionettist figure has no doll node');
  const puppet = node.clone(true);
  puppet.position.set(0, 0, 0);
  puppet.quaternion.identity();
  puppet.scale.setScalar(1);
  puppet.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(puppet), k = DOLL_HEIGHT / Math.max(0.01, box.max.y - box.min.y);
  puppet.scale.setScalar(k);
  puppet.position.set(-k * (box.min.x + box.max.x) / 2, -k * box.min.y, -k * (box.min.z + box.max.z) / 2);
  const body = new THREE.Group();
  body.add(puppet);
  const own = dress(body, team);
  let main = [...own.values()].find(m => m.name === 'main');

  if (!main) {
    const first = puppet.getObjectByProperty('type', 'Mesh');
    main = first instanceof THREE.Mesh && first.material instanceof THREE.MeshStandardMaterial ? first.material.clone() : new THREE.MeshStandardMaterial();

    if (first instanceof THREE.Mesh) first.material = main;
    decodeSrgb(main);
  }

  body.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = true; });

  return { body, main, height: DOLL_HEIGHT, weapon: puppet, rig: rig(body, []) };
}

/**
 * Readies every class figure for `r` before one is shown: shaders compile off the main thread against `scene`'s lights
 * and textures upload one a frame, so the first frame that draws a class does not stall on either. The stand-ins never
 * join `scene`, and their materials are never disposed, so the programs they compiled stay cached.
 */
export async function warmFigures(r: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene): Promise<void> {
  const figs = new THREE.Group(), textures = new Set<THREE.Texture>();

  for (const cls of CLASS_ORDER) figs.add(buildModel(cls, 0).body);

  figs.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;

    for (const m of [o.material].flat()) for (const v of Object.values(m)) if (v instanceof THREE.Texture) textures.add(v);
  });
  await r.compileAsync(figs, camera, scene);

  for (const t of textures) {
    await new Promise(next => requestAnimationFrame(next));

    if (r.getContext().isContextLost()) return;
    r.initTexture(t);
  }
}
