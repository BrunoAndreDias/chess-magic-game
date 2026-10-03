import * as THREE from 'three';
import { CLASSES } from '../../engine/index';
import type { ClassId, Team } from '../../engine/index';
import { basic, glow, hex, keep, mat, mesh, starGeometry } from './art';

interface Kit { main: THREE.MeshStandardMaterial; trim: THREE.Material; skin: THREE.Material; accent: THREE.Material; accentHex: number }
/** `idle` runs every frame with the clock in seconds, for motion the figure owns (an orbiting star, a swaying bell). */
interface Model { height: number; weapon: THREE.Object3D; idle: ((time: number) => void) | null }
/** What the board needs from a figure: `main` flashes on a hit (its emissive is reset to 0 after), `weapon` bobs on a cast, `height` places labels and effects. */
export type Figure = { body: THREE.Group; main: THREE.MeshStandardMaterial } & Model;

const steel = keep(mat(0xd7dde6, { metalness: 0.4 }));
const wood = keep(mat(0x6b4a2b));
const skins = [0xe6c39c, 0xc99a74, 0x8d5f43].map(c => keep(mat(c, { flatShading: false })));
const furs = [0x5a4636, 0x6e5a48, 0x3e3029].map(c => keep(mat(c)));
const chitins = [0x2a2230, 0x3a2a24, 0x1f2a2a].map(c => keep(mat(c, { roughness: 0.5 })));
const claw = keep(mat(0xeadfc6));
const nose = keep(mat(0xe8a0a0, { flatShading: false }));
const black = keep(basic(0x0a0608));
const silk = keep(basic(0xf4eefa));

/** A cylinder from `a` to `b`. */
function limb(a: THREE.Vector3, b: THREE.Vector3, r: number, m: THREE.Material): THREE.Mesh {
  const len = a.distanceTo(b), o = mesh(new THREE.CylinderGeometry(r * 0.8, r, len, 6), m);
  o.position.copy(a).add(b).multiplyScalar(0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return o;
}

const MODELS: Readonly<Record<ClassId, (body: THREE.Group, k: Kit, look: number) => Model>> = {
  bellringer: (body, k, look) => {
    const fur = furs[look % furs.length]!;
    const torso = mesh(new THREE.SphereGeometry(0.4, 10, 8), k.main, 0, 0.46, -0.02);
    torso.scale.set(1.08, 0.9, 1);
    const apron = mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.2, 10), k.trim, 0, 0.28, 0.02);
    const head = mesh(new THREE.SphereGeometry(0.21, 10, 8), fur, 0, 0.84, 0.3);
    head.scale.set(1, 0.9, 1.1);
    const snout = mesh(new THREE.ConeGeometry(0.09, 0.26, 8), fur, 0, 0.8, 0.53);
    snout.rotation.x = Math.PI / 2;
    body.add(torso, apron, head, snout, mesh(new THREE.SphereGeometry(0.045, 8, 6), nose, 0, 0.8, 0.66));
    for (const sd of [-1, 1]) {
      body.add(mesh(new THREE.SphereGeometry(0.025, 6, 4), black, sd * 0.09, 0.9, 0.46));
      const shoulder = mesh(new THREE.SphereGeometry(0.15, 8, 6), fur, sd * 0.38, 0.55, 0.12);
      const paw = mesh(new THREE.SphereGeometry(0.13, 8, 6), fur, sd * 0.42, 0.34, 0.3);
      paw.scale.set(1.1, 0.55, 1);
      body.add(shoulder, paw, mesh(new THREE.BoxGeometry(0.16, 0.12, 0.2), k.trim, sd * 0.2, 0.06, 0.04));
      for (let c = -1; c <= 1; c++) {
        const cl = mesh(new THREE.ConeGeometry(0.03, 0.17, 5), claw, sd * 0.42 + c * 0.055, 0.3, 0.43);
        cl.rotation.x = Math.PI / 2 + 0.5;
        body.add(cl);
      }
    }
    const lamp = new THREE.Group(), lampGlow = glow(k.accentHex, 0.6, 0.95);
    lampGlow.position.z = 0.07;
    lamp.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.07, 8), k.trim), mesh(new THREE.SphereGeometry(0.045, 8, 6), basic(k.accentHex), 0, 0, 0.04), lampGlow);
    lamp.position.set(0, 1.02, 0.33);
    lamp.rotation.x = Math.PI / 2 - 0.2;
    const band = mesh(new THREE.TorusGeometry(0.2, 0.03, 6, 16), k.trim, 0, 0.94, 0.3);
    band.rotation.x = Math.PI / 2 - 0.25;
    body.add(band, lamp);
    const pick = new THREE.Group(), head2 = mesh(new THREE.ConeGeometry(0.05, 0.5, 5), steel, 0, 0.82, 0);
    head2.rotation.z = Math.PI / 2;
    pick.add(mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.9, 6), wood, 0, 0.42, 0), head2, mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), k.trim, 0, 0.82, 0));
    pick.position.set(0.5, 0.05, 0.2);
    pick.rotation.z = -0.25;
    body.add(pick);
    return { height: 1.05, weapon: pick, idle: null };
  },
  astromancer: (body, k) => {
    body.add(
      mesh(new THREE.ConeGeometry(0.34, 0.95, 12), k.main, 0, 0.475, 0),
      mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.08, 12), k.accent, 0, 0.55, 0),
      mesh(new THREE.SphereGeometry(0.155, 14, 10), k.skin, 0, 1.03, 0),
      mesh(new THREE.ConeGeometry(0.12, 0.24, 8), silk, 0, 0.88, 0.1),
      mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.03, 18), k.trim, 0, 1.13, 0),
    );
    const hat = new THREE.Group(), cone = mesh(new THREE.ConeGeometry(0.21, 0.72, 12), k.trim, 0, 0.36, 0);
    const star = mesh(starGeometry(0.08), basic(k.accentHex), 0, 0.3, 0.15);
    star.rotation.x = -0.28;
    hat.add(cone, star);
    hat.position.y = 1.13;
    hat.rotation.z = -0.12;
    hat.rotation.x = -0.08;
    const staff = new THREE.Group(), orbit = new THREE.Group(), mote = mesh(starGeometry(0.06), basic(0xfff3c0), 0.17, 0, 0);
    const moteGlow = glow(0xfff3c0, 0.3, 0.9);
    moteGlow.position.x = 0.17;
    orbit.add(mote, moteGlow);
    orbit.position.y = 1.45;
    orbit.rotation.z = 0.35;
    const orb = glow(k.accentHex, 0.6, 0.9);
    orb.position.y = 1.45;
    staff.add(mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.45, 6), wood, 0, 0.72, 0), mesh(new THREE.SphereGeometry(0.08, 12, 8), basic(k.accentHex), 0, 1.45, 0), orb, orbit,
      mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 12), k.trim, 0, 1.36, 0));
    staff.position.set(0.34, 0, 0.06);
    body.add(hat, staff);
    return { height: 1.75, weapon: staff, idle: t => { orbit.rotation.y = t * 1.6; } };
  },
  gravecaller: (body, k, look) => MODELS.astromancer(body, k, look),
  weaver: (body, k, look) => {
    const shell = chitins[look % chitins.length]!;
    const abdomen = mesh(new THREE.SphereGeometry(0.34, 12, 10), k.main, 0, 0.44, -0.32);
    abdomen.scale.set(1, 0.85, 1.15);
    const mark = mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 12), k.accent, 0, 0.72, -0.36);
    mark.rotation.x = Math.PI / 2 - 0.5;
    const thorax = mesh(new THREE.SphereGeometry(0.18, 10, 8), shell, 0, 0.46, 0.04);
    const torso = mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.42, 8), k.trim, 0, 0.74, 0.08);
    torso.rotation.x = -0.12;
    body.add(abdomen, mark, thorax, torso, mesh(new THREE.SphereGeometry(0.13, 12, 10), k.skin, 0, 1.03, 0.12));
    const hood = mesh(new THREE.SphereGeometry(0.15, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), k.main, 0, 1.06, 0.07);
    hood.rotation.x = -0.75;
    body.add(hood);
    for (const [ex, ey] of [[-0.05, 1.06], [0.05, 1.06], [-0.085, 1.1], [0.085, 1.1]] as const) body.add(mesh(new THREE.SphereGeometry(0.02, 6, 4), basic(k.accentHex), ex, ey, 0.235));
    for (const sd of [-1, 1]) {
      const fang = mesh(new THREE.ConeGeometry(0.018, 0.09, 5), claw, sd * 0.035, 0.94, 0.22);
      fang.rotation.x = Math.PI;
      body.add(fang);
      for (let i = 0; i < 4; i++) {
        const a = -0.9 + i * 0.6, dir = new THREE.Vector3(sd * Math.cos(a), 0, Math.sin(-a) * 0.9 + 0.05);
        const hip = new THREE.Vector3(0, 0.46, 0.02).addScaledVector(dir, 0.12);
        const knee = new THREE.Vector3(0, 0.74 - i * 0.03, 0.02).addScaledVector(dir, 0.4);
        const foot = new THREE.Vector3(0, 0.02, 0.02).addScaledVector(dir, 0.62);
        body.add(limb(hip, knee, 0.035, shell), limb(knee, foot, 0.028, shell), mesh(new THREE.SphereGeometry(0.04, 6, 4), shell, knee.x, knee.y, knee.z));
      }
    }
    const spool = new THREE.Group(), thread = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.35, 4), silk, 0.04, -0.2, 0.04);
    thread.rotation.z = 0.2;
    spool.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 10), silk), mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.025, 10), wood, 0, 0.08, 0),
      mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.025, 10), wood, 0, -0.08, 0), thread);
    spool.position.set(0.24, 0.76, 0.2);
    spool.rotation.z = 0.5;
    body.add(limb(new THREE.Vector3(0.12, 0.88, 0.1), new THREE.Vector3(0.22, 0.72, 0.2), 0.035, k.trim), spool);
    return { height: 1.25, weapon: spool, idle: null };
  },
};

/** A class's figure in team colours, standing at the origin. The battle and the setup lineup both use it. */
export function buildModel(cls: ClassId, team: Team, look: number): Figure {
  const body = new THREE.Group(), C = CLASSES[cls];
  const k: Kit = {
    main: mat(team === 0 ? 0x3d6fe0 : 0xcf4436, { roughness: 0.7 }),
    trim: mat(team === 0 ? 0x1f3a80 : 0x7a1f1a),
    skin: skins[look % skins.length]!,
    accent: mat(hex(C.color), { roughness: 0.6 }),
    accentHex: hex(C.color),
  };
  const model = MODELS[cls](body, k, look);
  body.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = true; });
  return { body, main: k.main, ...model };
}
