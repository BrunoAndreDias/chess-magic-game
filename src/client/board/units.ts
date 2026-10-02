import * as THREE from 'three';
import { CLASSES } from '../../engine/index';
import type { ClassId, Life, StatusKey, Team, Unit, UnitId } from '../../engine/index';
import { GOLD, TEAM_HEX, basic, decal, glow, hex, keep, mat, mesh } from './art';

/** What the unit's label and aura show right now: `before` at the start of a play, nudged by each event, `after` at its end. */
export interface Shown { name: string; hp: number; maxHp: number; shield: number; life: Life; st: Set<StatusKey> }

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
  label: HTMLElement;
  shown: Shown;
  /** 0 standing, 1 lying down. */
  pose: number;
  bob: number;
}

interface Kit { main: THREE.MeshStandardMaterial; trim: THREE.Material; skin: THREE.Material; accent: THREE.Material; accentHex: number }
interface Model { height: number; weapon: THREE.Object3D }

const steel = keep(mat(0xd7dde6, { metalness: 0.4 }));
const wood = keep(mat(0x6b4a2b));
const skins = [0xe6c39c, 0xc99a74, 0x8d5f43].map(c => keep(mat(c, { flatShading: false })));

const MODELS: Readonly<Record<ClassId, (body: THREE.Group, k: Kit) => Model>> = {
  warden: (body, k) => {
    body.add(mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.85, 8), k.main, 0, 0.43, 0));
    for (const sd of [-1, 1]) {
      const pad = mesh(new THREE.SphereGeometry(0.17, 8, 6), k.trim, sd * 0.33, 0.82, 0);
      pad.scale.y = 0.75;
      body.add(pad);
    }
    body.add(
      mesh(new THREE.SphereGeometry(0.16, 12, 10), k.skin, 0, 1.03, 0),
      mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.2, 10), k.trim, 0, 1.12, 0),
      mesh(new THREE.BoxGeometry(0.05, 0.14, 0.3), k.accent, 0, 1.28, 0),
    );
    const shield = new THREE.Group();
    shield.add(mesh(new THREE.BoxGeometry(0.08, 0.66, 0.5), k.trim), mesh(new THREE.SphereGeometry(0.09, 8, 6), k.accent, -0.05, 0.02, 0));
    shield.position.set(-0.43, 0.55, 0.1);
    const sword = new THREE.Group();
    sword.add(mesh(new THREE.BoxGeometry(0.05, 0.75, 0.1), steel, 0, 0.5, 0), mesh(new THREE.BoxGeometry(0.22, 0.05, 0.06), k.trim, 0, 0.12, 0));
    sword.position.set(0.42, 0.25, 0.1);
    body.add(shield, sword);
    return { height: 1.3, weapon: sword };
  },
  wizard: (body, k) => {
    body.add(
      mesh(new THREE.ConeGeometry(0.33, 0.92, 10), k.main, 0, 0.46, 0),
      mesh(new THREE.SphereGeometry(0.155, 14, 10), k.skin, 0, 1.02, 0),
      mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 16), k.trim, 0, 1.11, 0),
    );
    const hat = mesh(new THREE.ConeGeometry(0.2, 0.55, 10), k.trim, 0, 1.38, 0);
    hat.rotation.z = -0.14;
    const staff = new THREE.Group(), orb = glow(k.accentHex, 0.55, 0.9);
    orb.position.y = 1.38;
    staff.add(mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.35, 6), wood, 0, 0.675, 0), mesh(new THREE.SphereGeometry(0.09, 10, 8), basic(k.accentHex), 0, 1.38, 0), orb);
    staff.position.set(0.32, 0, 0.05);
    body.add(hat, staff);
    return { height: 1.6, weapon: staff };
  },
  ranger: (body, k) => {
    body.add(
      mesh(new THREE.CylinderGeometry(0.2, 0.27, 0.85, 8), k.main, 0, 0.43, 0),
      mesh(new THREE.SphereGeometry(0.15, 12, 10), k.skin, 0, 1.0, 0),
      mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6), k.trim, -0.12, 0.72, -0.22),
    );
    const cap = mesh(new THREE.ConeGeometry(0.19, 0.28, 8), k.accent, 0, 1.17, -0.02);
    cap.rotation.x = -0.35;
    const bow = new THREE.Group(), arc = mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 18, Math.PI), mat(0x7a5530));
    arc.rotation.z = -Math.PI / 2;
    bow.add(arc, mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.84, 4), basic(0xeeeeee)));
    bow.position.set(0.34, 0.72, 0.12);
    body.add(cap, bow);
    return { height: 1.3, weapon: bow };
  },
  cleric: (body, k) => {
    body.add(
      mesh(new THREE.ConeGeometry(0.37, 0.95, 10), k.main, 0, 0.475, 0),
      mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.1, 10), k.accent, 0, 0.62, 0),
      mesh(new THREE.SphereGeometry(0.155, 14, 10), k.skin, 0, 1.05, 0),
    );
    const halo = mesh(new THREE.TorusGeometry(0.2, 0.03, 8, 24), basic(0xffe38a), 0, 1.34, 0), hg = glow(0xffe38a, 0.7, 0.5);
    halo.rotation.x = Math.PI / 2;
    hg.position.y = 1.34;
    const mace = new THREE.Group();
    mace.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), mat(0x8a6a3a), 0, 0.35, 0), mesh(new THREE.DodecahedronGeometry(0.11, 0), mat(0xd8d0b0, { metalness: 0.3 }), 0, 0.74, 0));
    mace.position.set(0.36, 0.2, 0.08);
    body.add(halo, hg, mace);
    return { height: 1.5, weapon: mace };
  },
  rogue: (body, k) => {
    body.add(
      mesh(new THREE.ConeGeometry(0.24, 0.86, 8), k.main, 0, 0.43, 0),
      mesh(new THREE.SphereGeometry(0.14, 12, 10), k.skin, 0, 0.97, 0.02),
    );
    const hood = mesh(new THREE.ConeGeometry(0.21, 0.5, 8), k.trim, 0, 1.1, -0.03);
    hood.rotation.x = -0.25;
    const sash = mesh(new THREE.TorusGeometry(0.15, 0.045, 6, 12), k.accent, 0, 0.86, 0);
    sash.rotation.x = Math.PI / 2;
    const daggers = new THREE.Group();
    for (const sd of [-1, 1]) {
      const d = mesh(new THREE.BoxGeometry(0.035, 0.34, 0.07), steel, sd * 0.3, 0.5, 0.15);
      d.rotation.x = 0.5;
      daggers.add(d);
    }
    body.add(hood, sash, daggers);
    return { height: 1.2, weapon: daggers };
  },
};

export function buildUnit(u: Unit, labels: HTMLElement): UnitView {
  const group = new THREE.Group(), body = new THREE.Group(), C = CLASSES[u.cls];
  const k: Kit = {
    main: mat(u.team === 0 ? 0x3d6fe0 : 0xcf4436, { roughness: 0.7 }),
    trim: mat(u.team === 0 ? 0x1f3a80 : 0x7a1f1a),
    skin: skins[(u.slot + u.team) % skins.length]!,
    accent: mat(hex(C.color), { roughness: 0.6 }),
    accentHex: hex(C.color),
  };
  const model = MODELS[u.cls](body, k);
  body.traverse(o => { if (o instanceof THREE.Mesh) o.castShadow = true; });
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
    id: u.id, team: u.team, group, body, weapon: model.weapon, height: model.height, main: k.main,
    ring, bubble, blood, aura, label, shown: shownOf(u), pose: 0, bob: Math.random() * 6,
  };
}

export function shownOf(u: Unit): Shown {
  return { name: u.name, hp: u.hp, maxHp: u.maxHp, shield: u.shield, life: u.life, st: new Set(Object.keys(u.st) as StatusKey[]) };
}

const DOWN_TILT = -Math.PI / 2 * 0.9;
export function setPose(v: UnitView, down: number): void {
  v.pose = down;
  v.body.rotation.x = DOWN_TILT * down;
  v.body.position.y = 0.2 * down;
  v.blood.visible = down >= 1;
}

const AURA: readonly (readonly [StatusKey, number])[] = [['empower', 0xffe08a], ['burn', 0xff6a2b], ['stun', 0xffd36b], ['wet', 0x4fb3ff], ['mark', 0xf2e36b], ['poison', 0x8fe36b]];

export function animateUnit(v: UnitView, time: number): void {
  const s = v.shown, up = s.life.kind === 'up';
  if (v.pose === 0) v.body.position.y = Math.sin(time * 2 + v.bob) * 0.025;
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
