import * as THREE from 'three';
import { statusKeys } from '../../engine/index';
import type { Life, StatusKey, Team, Unit, UnitId } from '../../engine/index';
import { GOLD, TEAM_HEX, basic, decal, glow, keep, mesh } from './art';
import { h } from '../dom';
import { buildModel } from './models';

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
  idle: ((time: number) => void) | null;
  label: HTMLElement;
  /** The label's status icons, name, and HP and shield bars. */
  parts: { st: HTMLElement; n: HTMLElement; hp: HTMLElement; sh: HTMLElement };
  shown: Shown;
  /** 0 standing, 1 lying down. */
  pose: number;
  bob: number;
}


/** The unit each of its scene objects belongs to, for picking. */
export const UNIT_OF = new WeakMap<THREE.Object3D, UnitId>();

const silk = keep(basic(0xf4eefa));

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
  const group = new THREE.Group(), { body, main, height, weapon, idle } = buildModel(u.cls, u.team);
  const ice = mesh(new THREE.BoxGeometry(0.86, height + 0.25, 0.86), iceMat, 0, (height + 0.25) / 2, 0), cocoon = buildCocoon(height);
  ice.visible = false;
  body.add(ice, cocoon);
  group.add(body);

  const disc = decal(new THREE.CircleGeometry(0.44, 28), basic(TEAM_HEX[u.team], 0.35), 0.02);
  const ring = decal(new THREE.RingGeometry(0.47, 0.58, 32), basic(GOLD, 0.95), 0.03);
  ring.visible = false;
  const bubble = mesh(new THREE.SphereGeometry(0.72, 20, 14), basic(0xe0c477, 0.18), 0, 0.72, 0);
  bubble.visible = false;
  const blood = decal(new THREE.RingGeometry(0.2, 0.62, 28), basic(0xc0392b, 0.6), 0.035);
  blood.visible = false;
  const aura = glow(0xffffff, 1.4, 0);
  aura.position.y = 0.8;
  group.add(disc, ring, bubble, blood, aura);
  group.rotation.y = u.team === 0 ? 0 : Math.PI;
  group.traverse(o => { UNIT_OF.set(o, u.id); });

  const parts = { st: h('div', { class: 'bd-st' }), n: h('div', { class: 'bd-n' }), hp: h('i'), sh: h('s') };
  const label = h('div', { class: `bd-unit bd-t${u.team}` }, parts.st, parts.n, h('div', { class: 'bd-bar' }, parts.hp, parts.sh));
  labels.appendChild(label);

  return {
    id: u.id, team: u.team, group, body, weapon, height, main, disc, ice, cocoon, idle,
    ring, bubble, blood, aura, label, parts, shown: shownOf(u), pose: 0, bob: Math.random() * 6,
  };
}

export function shownOf(u: Unit): Shown {
  return {
    name: u.name, hp: u.hp, maxHp: u.maxHp, shield: u.shield, life: u.life, st: new Set(statusKeys(u.st)),
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
  ['burn', 0xff6a2b], ['stun', 0xffd36b], ['hush', 0xc8b4ff], ['wither', 0xb89a6a], ['expose', 0xff8a8a], ['share', 0xd06a9a], ['guard', 0xe0b04a], ['wet', 0x4fb3ff], ['poison', 0x8fe36b],
];

export function animateUnit(v: UnitView, time: number): void {
  const s = v.shown, up = s.life.kind === 'up';

  if (v.pose === 0) v.body.position.y = Math.sin(time * 2 + v.bob) * 0.025;
  const encased = s.st.has('encased');
  v.ice.visible = encased && s.ice;
  v.cocoon.visible = encased && !s.ice;
  v.idle?.(time);
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
