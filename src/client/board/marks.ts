import * as THREE from 'three';
import { SKILLS, callTiles, getUnit } from '../../engine/index';
import type { BattleState, Call, Pos, Team, UnitId } from '../../engine/index';
import { TEAM_CSS, TEAM_HEX, basic, decal, disposeTree, glow, hex, keep, mesh, starGeometry } from './art';
import type { Overlay } from './overlay';
import type { Terrain } from './terrain';
import type { Tweens } from './tween';
import type { UnitView } from './units';

/**
 * The class mechanics drawn on the board: Souls on the ground, pending Calls.
 * Each is keyed by what identifies it in the state, so `sync` can add and drop exactly the ones that changed.
 */

interface SoulView { group: THREE.Group; wisp: THREE.Object3D; ph: number }

interface CallView { call: Call; group: THREE.Group; tiles: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[]; sigil: THREE.Group; label: HTMLElement; anchor: THREE.Vector3; t0: number }

const soulKey = (p: Pos) => `${p.x},${p.z}`;

const callKey = (c: Call) => `${c.by}:${c.skill}:${c.x},${c.z}`;

const SOUL = 0x9fe0b8;

const soulCore = keep(basic(0xeafff4));

const soulTail = keep(new THREE.MeshBasicMaterial({ color: SOUL, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));

const soulRing = keep(basic(SOUL, 0.7));

/** The wisp's orbit around the tile centre, and its height. */
const SOUL_ORBIT = 0.38, SOUL_Y = 0.65;

/**
 * The call area's tile: a bright dashed rim and diagonal hatching, tinted per material. Fill is nearly clear and the
 * two teams hatch in opposite directions, so where red and blue areas overlap both stay readable instead of blending
 * to purple. `phase` shifts the stripes so two same-team areas on one tile read as a denser hatch.
 */
function callTex(team: Team, phase: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,255,255,0.1)';
  g.fillRect(3, 3, 58, 58);
  g.save();
  g.beginPath();
  g.rect(3, 3, 58, 58);
  g.clip();
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 5;
  const dir = team === 0 ? 1 : -1;

  for (let k = -64 + phase * 8; k <= 128; k += 16) {
    g.beginPath();
    g.moveTo(k, 64);
    g.lineTo(k + 64 * dir, 0);
    g.stroke();
  }

  g.restore();
  g.lineWidth = 3;
  g.setLineDash([9, 5]);
  g.strokeRect(3, 3, 58, 58);

  return new THREE.CanvasTexture(c);
}

const CALL_TEX = ([0, 1] as const).map(t => [callTex(t, 0), callTex(t, 1)] as const);

const CSS = `
.bd-call{position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;font:700 12px -apple-system,system-ui,sans-serif;padding:2px 8px;border-radius:7px;background:rgba(10,8,16,.82);border:1px solid currentColor;text-shadow:0 1px 2px #000;will-change:transform}
`;

/** How many ground Souls and pending Calls are drawn. */
export interface MarkCounts { souls: number; calls: number }

export class Marks {
  readonly root = new THREE.Group();
  readonly #souls = new Map<string, SoulView>();
  readonly #calls = new Map<string, CallView>();
  readonly #style: HTMLStyleElement;
  #time = 0;

  constructor(
    parent: THREE.Object3D,
    readonly labels: HTMLElement,
    readonly terrain: Terrain,
    readonly overlay: Overlay,
    readonly tweens: Tweens,
    readonly views: ReadonlyMap<UnitId, UnitView>,
  ) {
    parent.add(this.root);
    this.#style = document.createElement('style');
    this.#style.textContent = CSS;
    document.head.appendChild(this.#style);
  }

  get counts(): MarkCounts {
    return { souls: this.#souls.size, calls: this.#calls.size };
  }

  /** Make every mark match `s` at once. */
  sync(s: BattleState): void {
    syncMap(this.#souls, s.souls, soulKey, o => this.#buildSoul(o), v => disposeTree(v.group));
    syncMap(this.#calls, s.calls, callKey, c => this.#buildCall(c, s), v => this.#disposeCall(v));
  }

  // ---------- souls ----------
  /** A small wisp circling the tile over a faint ring, so it still shows beside the unit it dropped from, from any angle. */
  #buildSoul(p: Pos): SoulView {
    const g = new THREE.Group(), wisp = new THREE.Group();
    const tail = mesh(new THREE.ConeGeometry(0.07, 0.28, 8, 1, true), soulTail, 0, -0.16, 0);
    tail.rotation.x = Math.PI;
    wisp.add(glow(SOUL, 1.25, 1), mesh(new THREE.SphereGeometry(0.1, 10, 8), soulCore), tail);
    wisp.position.y = SOUL_Y;
    const ring = decal(new THREE.RingGeometry(0.4, 0.46, 28), soulRing, 0.05);
    ring.renderOrder = 6;
    g.add(wisp, ring);
    g.position.copy(this.terrain.at(p.x, p.z, 0, false));
    this.root.add(g);

    return { group: g, wisp, ph: Math.random() * 6 };
  }

  /** A Soul drops: the wisp rises out of the tile. */
  async dropSoul(p: Pos): Promise<void> {
    const k = soulKey(p);

    if (this.#souls.has(k)) return;
    const v = this.#buildSoul(p);
    this.#souls.set(k, v);
    await this.tweens.run(0.35, q => v.group.scale.setScalar(0.05 + 0.95 * q));
  }

  /** The Souls on `from` drift into the gatherer. A Soul handed over straight from a Down starts on that tile. */
  async gather(e: { from: readonly Pos[] }, to: UnitView | undefined): Promise<void> {
    const flying = e.from.map(p => {
      const k = soulKey(p), v = this.#souls.get(k) ?? this.#buildSoul(p);
      this.#souls.delete(k);

      return v;
    });

    const dest = to ? to.group.position.clone().add(new THREE.Vector3(0, to.height * 0.6, 0)) : null;
    const starts = flying.map(v => v.group.position.clone());
    await this.tweens.run(0.4, q => flying.forEach((v, i) => {
      if (dest) v.group.position.lerpVectors(starts[i]!, dest, q);
      v.group.scale.setScalar(1 - 0.7 * q);
    }));

    for (const v of flying) disposeTree(v.group);
  }

  // ---------- calls ----------
  #buildCall(c: Call, s: BattleState): CallView {
    const phase = [...this.#calls.values()].filter(v => v.call.team === c.team).length % 2, g = new THREE.Group(), team = TEAM_HEX[c.team], sk = SKILLS[c.skill], skillHex = hex(sk.color ?? '#9a8cff');

    const tiles = callTiles(c.skill, c.x, c.z).flatMap(p => {
      if (!this.terrain.tile(p.x, p.z)) return [];
      const q = decal(new THREE.PlaneGeometry(0.96, 0.96), new THREE.MeshBasicMaterial({ map: CALL_TEX[c.team]![phase], color: team, transparent: true, depthWrite: false, opacity: 0.8 }), 0);
      q.position.copy(this.terrain.at(p.x, p.z, 0.06, false));
      q.renderOrder = 5;
      g.add(q);

      return [q];
    });

    const center = this.terrain.at(c.x, c.z, 0, false), sigil = new THREE.Group();
    const star = mesh(starGeometry(0.22, 0.09, 0.05), basic(skillHex));
    const tail = mesh(new THREE.ConeGeometry(0.1, 0.7, 8, 1, true), new THREE.MeshBasicMaterial({ color: skillHex, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }), 0, 0.42, 0);
    const halo = glow(skillHex, 1.1, 0.8);
    sigil.add(star, tail, halo);
    sigil.position.copy(center).add(new THREE.Vector3(0, 1.6, 0));
    sigil.rotation.z = -0.5;
    const beam = mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 4), basic(team, 0.45), 0, 0.8, 0);
    beam.position.add(center);
    const ground = decal(new THREE.RingGeometry(0.28, 0.36, 5), basic(skillHex, 0.9), 0);
    ground.position.copy(center).setY(center.y + 0.08);
    ground.renderOrder = 6;
    g.add(sigil, beam, ground);
    this.root.add(g);
    const by = getUnit(s, c.by), label = document.createElement('div');
    label.className = 'bd-call';
    label.style.color = TEAM_CSS[c.team];
    label.textContent = `${sk.icon} ${sk.name} lands at the start of ${by?.name ?? 'its caster'}'s turn`;
    this.labels.appendChild(label);

    return { call: c, group: g, tiles, sigil, label, anchor: center.clone().add(new THREE.Vector3(0, 1.25, 0)), t0: this.#time };
  }

  #disposeCall(v: CallView): void { disposeTree(v.group); v.label.remove(); }

  /** A Call is cast: its area fades in and the star drops into place. */
  async placeCall(c: Call, s: BattleState): Promise<void> {
    const k = callKey(c);

    if (this.#calls.has(k)) return;
    const v = this.#buildCall(c, s), top = v.sigil.position.y;
    this.#calls.set(k, v);
    await this.tweens.run(0.45, p => { v.sigil.position.y = top + 3 * (1 - p) ** 2; for (const q of v.tiles) q.material.opacity = 0.8 * p; });
  }

  /** The marker of the Call landing (or fizzling) at `at`, removed. Null when none is drawn there. */
  takeCall(by: UnitId, at: Pos | null): THREE.Vector3 | null {
    for (const [k, v] of this.#calls) {
      if (v.call.by !== by || (at && (v.call.x !== at.x || v.call.z !== at.z))) continue;
      this.#calls.delete(k);
      const p = v.sigil.position.clone();
      this.#disposeCall(v);

      return p;
    }

    return null;
  }

  update(dt: number): void {
    const t = (this.#time += dt);

    for (const v of this.#souls.values()) {
      const a = t * 0.9 + v.ph;
      v.wisp.position.set(Math.cos(a) * SOUL_ORBIT, SOUL_Y + 0.07 * Math.sin(t * 2.2 + v.ph), Math.sin(a) * SOUL_ORBIT);
    }

    const placed: { x: number; y: number; w: number; h: number }[] = [];

    for (const v of this.#calls.values()) {
      const k = t - v.t0;
      v.sigil.position.y += Math.sin(k * 2.2) * 0.002;
      v.sigil.rotation.y = k * 1.4;

      for (const q of v.tiles) q.material.opacity = 0.55 + 0.25 * Math.sin(k * 3.2);
      const p = this.overlay.project(v.anchor);
      v.label.style.display = p.ok ? '' : 'none';
      // Two Calls side by side would print their labels over each other: later ones step down.
      const w = v.label.offsetWidth, h = v.label.offsetHeight, box = { x: p.x - w / 2, y: p.y, w, h };

      while (placed.some(o => box.x < o.x + o.w && o.x < box.x + box.w && box.y < o.y + o.h && o.y < box.y + box.h)) box.y += h + 3;
      placed.push(box);
      v.label.style.transform = `translate(${box.x.toFixed(1)}px,${box.y.toFixed(1)}px)`;
    }
  }

  dispose(): void {
    for (const v of this.#calls.values()) v.label.remove();
    disposeTree(this.root);
    this.#style.remove();
  }
}

/** Adds the entries of `want` that `have` lacks and drops the ones `want` no longer holds. */
function syncMap<T, V>(have: Map<string, V>, want: readonly T[], key: (t: T) => string, build: (t: T) => V, drop: (v: V) => void): void {
  const keys = new Set(want.map(key));

  for (const [k, v] of have) if (!keys.has(k)) { drop(v); have.delete(k); }

  for (const t of want) { const k = key(t); if (!have.has(k)) have.set(k, build(t)); }
}
