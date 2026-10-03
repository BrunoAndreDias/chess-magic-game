import * as THREE from 'three';
import { CLASSES } from '../../engine/index';
import type { ClassId, Life, ModelId, StatusKey, Team, Unit, UnitId } from '../../engine/index';
import { GOLD, TEAM_HEX, basic, decal, glow, hex, keep, mat, mesh, seeded } from './art';

/** What the unit's label and aura show right now: `before` at the start of a play, nudged by each event, `after` at its end. */
export interface Shown { name: string; hp: number; maxHp: number; shield: number; life: Life; st: Set<StatusKey>; ice: boolean }

export interface UnitView {
  id: UnitId;
  team: Team;
  group: THREE.Group;
  body: THREE.Group;
  weapon: THREE.Object3D;
  height: number;
  main: THREE.MeshStandardMaterial;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  bubble: THREE.Mesh;
  blood: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  aura: THREE.Sprite;
  disc: THREE.Mesh;
  /** Glacial Prison's block and the Weaver's cocoon; `shown` picks which. */
  ice: THREE.Mesh;
  cocoon: THREE.Group;
  spin: THREE.Object3D | null;
  label: HTMLElement;
  shown: Shown;
  /** 0 standing, 1 lying down. */
  pose: number;
  bob: number;
}

interface Kit { main: THREE.MeshStandardMaterial; trim: THREE.Material; skin: THREE.Material; accent: THREE.Material; accentHex: number }
/** `spin` turns slowly every frame (the Astromancer's orbiting star). */
interface Model { height: number; weapon: THREE.Object3D; spin: THREE.Object3D | null }

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

/** A flat five-pointed star facing +z. */
export function starGeometry(outer: number, inner = outer * 0.45, depth = outer * 0.25): THREE.BufferGeometry {
  const sh = new THREE.Shape();
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? inner : outer;
    if (i === 0) sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); else sh.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
  g.translate(0, 0, -depth / 2);
  return g;
}

const MODELS: Readonly<Record<ModelId, (body: THREE.Group, k: Kit, look: number) => Model>> = {
  guardian: (body, k, look) => {
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
    return { height: 1.05, weapon: pick, spin: null };
  },
  elementalist: (body, k) => {
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
    return { height: 1.75, weapon: staff, spin: orbit };
  },
  rogue: (body, k, look) => {
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
    return { height: 1.25, weapon: spool, spin: null };
  },
};

/** A class's figure in team colours, standing at the origin. The battle and the setup lineup both use it. */
export function buildModel(cls: ClassId, team: Team, look: number): { body: THREE.Group; main: THREE.MeshStandardMaterial } & Model {
  const body = new THREE.Group(), C = CLASSES[cls];
  const k: Kit = {
    main: mat(team === 0 ? 0x3d6fe0 : 0xcf4436, { roughness: 0.7 }),
    trim: mat(team === 0 ? 0x1f3a80 : 0x7a1f1a),
    skin: skins[look % skins.length]!,
    accent: mat(hex(C.color), { roughness: 0.6 }),
    accentHex: hex(C.color),
  };
  const model = MODELS[C.model](body, k, look);
  body.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = true; });
  return { body, main: k.main, ...model };
}

const iceMat = keep(new THREE.MeshStandardMaterial({ color: 0xbfeaff, emissive: 0x3a9ad0, emissiveIntensity: 0.45, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55, flatShading: true }));
const silkMat = keep(new THREE.MeshStandardMaterial({ color: 0xf6f0fa, emissive: 0x6a5a7a, emissiveIntensity: 0.25, roughness: 0.9, transparent: true, opacity: 0.88 }));

function buildCocoon(height: number): THREE.Group {
  const g = new THREE.Group(), shell = mesh(new THREE.SphereGeometry(0.42, 14, 10), silkMat, 0, height * 0.5, 0);
  shell.scale.y = height * 0.72;
  g.add(shell);
  for (let i = 0; i < 5; i++) {
    const wrap = mesh(new THREE.TorusGeometry(0.43 - Math.abs(i - 2) * 0.06, 0.018, 5, 20), silk, 0, height * (0.2 + i * 0.15), 0);
    wrap.rotation.x = Math.PI / 2 + (i % 2 ? 0.25 : -0.2);
    g.add(wrap);
  }
  g.visible = false;
  return g;
}

export function buildUnit(u: Unit, labels: HTMLElement): UnitView {
  const group = new THREE.Group(), { body, main, height, weapon, spin } = buildModel(u.cls, u.team, u.slot + u.team);
  const ice = mesh(new THREE.BoxGeometry(0.86, height + 0.25, 0.86), iceMat, 0, (height + 0.25) / 2, 0), cocoon = buildCocoon(height);
  ice.visible = false;
  body.add(ice, cocoon);
  group.add(body);

  const disc = decal(new THREE.CircleGeometry(0.44, 28), basic(TEAM_HEX[u.team], 0.35), 0.02);
  const ring = decal(new THREE.RingGeometry(0.47, 0.58, 32), basic(GOLD, 0.95), 0.03) as UnitView['ring'];
  ring.visible = false;
  const bubble = mesh(new THREE.SphereGeometry(0.72, 20, 14), basic(0xe0c477, 0.18), 0, 0.72, 0);
  bubble.visible = false;
  const blood = decal(new THREE.RingGeometry(0.2, 0.62, 28), basic(0xc0392b, 0.6), 0.035) as UnitView['blood'];
  blood.visible = false;
  const aura = glow(0xffffff, 1.4, 0);
  aura.position.y = 0.8;
  group.add(disc, ring, bubble, blood, aura);
  group.rotation.y = u.team === 0 ? 0 : Math.PI;
  group.traverse(o => { o.userData.unit = u.id; });

  const label = document.createElement('div');
  label.className = `bd-unit bd-t${u.team}`;
  label.innerHTML = '<div class="bd-st"></div><div class="bd-n"></div><div class="bd-bar"><i></i><s></s></div>';
  labels.appendChild(label);

  return {
    id: u.id, team: u.team, group, body, weapon, height, main, disc, ice, cocoon, spin,
    ring, bubble, blood, aura, label, shown: shownOf(u), pose: 0, bob: Math.random() * 6,
  };
}

export function shownOf(u: Unit): Shown {
  return {
    name: u.name, hp: u.hp, maxHp: u.maxHp, shield: u.shield, life: u.life, st: new Set(Object.keys(u.st) as StatusKey[]),
    ice: !!u.st.encased?.ice,
  };
}

const DOWN_TILT = -Math.PI / 2 * 0.9;
export function setPose(v: UnitView, down: number): void {
  v.pose = down;
  v.body.rotation.x = DOWN_TILT * down;
  v.body.position.y = 0.2 * down;
  v.blood.visible = down >= 1;
}

const AURA: readonly (readonly [StatusKey, number])[] = [
  ['burn', 0xff6a2b], ['stun', 0xffd36b], ['expose', 0xff8a8a], ['share', 0xd06a9a], ['wet', 0x4fb3ff], ['poison', 0x8fe36b],
];

export function animateUnit(v: UnitView, time: number): void {
  const s = v.shown, up = s.life.kind === 'up';
  if (v.pose === 0) v.body.position.y = Math.sin(time * 2 + v.bob) * 0.025;
  const encased = s.st.has('encased');
  v.ice.visible = encased && s.ice;
  v.cocoon.visible = encased && !s.ice;
  if (v.spin) v.spin.rotation.y = time * 1.6;
  v.bubble.visible = up && s.shield > 0;
  if (v.blood.visible) v.blood.material.opacity = 0.45 + 0.25 * Math.sin(time * 4);
  const aura = up ? AURA.find(([key]) => s.st.has(key)) : undefined;
  const am = v.aura.material;
  am.opacity = aura ? 0.32 + 0.12 * Math.sin(time * 5) : 0;
  if (aura) am.color.setHex(aura[1]);
  if (v.ring.visible) v.ring.material.opacity = 0.65 + 0.3 * Math.sin(time * 5);
}

export function face(v: UnitView, x: number, z: number): void {
  const dx = x - v.group.position.x, dz = z - v.group.position.z;
  if (Math.abs(dx) + Math.abs(dz) > 0.01) v.group.rotation.y = Math.atan2(dx, dz);
}
