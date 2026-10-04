import * as THREE from 'three';
import type { Pos } from '../../engine/index';
import { TILE_OF } from './terrain';
import type { TileInput } from '../board';

const CLICK_SLOP = 6;

/** Three's raycaster ignores visibility, so a hidden casing, mound or sunk body would still catch clicks. */
function drawn(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;

  return true;
}

/** Pointer to tile: raycasts the tile pick boxes (and unit bodies, which resolve to the tile they stand on). */
export class Picker {
  readonly #ray = new THREE.Raycaster();
  readonly #ndc = new THREE.Vector2();
  readonly #listeners = new Set<(i: TileInput) => void>();
  #hover: Pos | null = null;
  #down: { x: number; y: number; button: number } | null = null;
  readonly #off: () => void;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly camera: THREE.Camera,
    readonly targets: () => { tiles: THREE.Object3D[]; units: THREE.Object3D[]; tileOfUnit: (o: THREE.Object3D) => Pos | null },
  ) {
    const move = (ev: PointerEvent): void => {
      const t = this.#pick(ev);

      if (t?.x === this.#hover?.x && t?.z === this.#hover?.z) return;
      this.#hover = t;
      this.#emit({ kind: 'hover', tile: t });
    };

    const leave = (): void => { if (this.#hover) { this.#hover = null; this.#emit({ kind: 'hover', tile: null }); } };

    const down = (ev: PointerEvent): void => { this.#down = { x: ev.clientX, y: ev.clientY, button: ev.button }; };

    const up = (ev: PointerEvent): void => {
      const d = this.#down;
      this.#down = null;

      if (!d || d.button !== ev.button || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > CLICK_SLOP) return;

      if (ev.button !== 0 && ev.button !== 2) return;
      const t = this.#pick(ev);

      if (t) this.#emit({ kind: 'click', tile: t, button: ev.button === 0 ? 'left' : 'right' });
    };

    const menu = (ev: Event): void => ev.preventDefault();
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('contextmenu', menu);
    this.#off = () => {
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('contextmenu', menu);
    };
  }

  listen(fn: (i: TileInput) => void): void { this.#listeners.add(fn); }

  #emit(i: TileInput): void { for (const fn of this.#listeners) fn(i); }

  #pick(ev: PointerEvent): Pos | null {
    const r = this.canvas.getBoundingClientRect();
    this.#ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    this.#ray.setFromCamera(this.#ndc, this.camera);
    const { tiles, units, tileOfUnit } = this.targets();
    const hitUnit = this.#ray.intersectObjects(units, true).find(h => h.object instanceof THREE.Mesh && drawn(h.object));
    const hitTile = this.#ray.intersectObjects(tiles, false)[0];

    if (hitUnit && (!hitTile || hitUnit.distance <= hitTile.distance)) {
      const t = tileOfUnit(hitUnit.object);

      if (t) return t;
    }

    return (hitTile && TILE_OF.get(hitTile.object)) ?? null;
  }

  dispose(): void { this.#off(); this.#listeners.clear(); }
}
