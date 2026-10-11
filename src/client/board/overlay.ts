import * as THREE from 'three';
import { STATUS } from '../../engine/index';
import type { UnitView } from './units';

const CSS = `
.bd-unit{position:absolute;left:0;top:0;transform:translate(-50%,-100%);text-align:center;white-space:nowrap;pointer-events:none;font-family:-apple-system,system-ui,sans-serif;will-change:transform}
.bd-unit .bd-n{font-size:11px;font-weight:700;color:#ece2cf;text-shadow:0 1px 3px #000,0 0 2px #000;letter-spacing:.01em}
.bd-unit .bd-bar{position:relative;width:60px;height:6px;margin:2px auto 0;background:#1b1720;border:1px solid #000;border-radius:3px;overflow:hidden}
.bd-unit .bd-bar i{position:absolute;left:0;top:0;bottom:0;transition:width .25s ease-out}
.bd-unit.bd-t0 .bd-bar i{background:#6fd06b}
.bd-unit.bd-t1 .bd-bar i{background:#ef6a5a}
.bd-unit .bd-bar s{position:absolute;right:0;top:0;bottom:0;background:#e0c477;transition:width .25s ease-out}
.bd-unit .bd-st{font-size:12px;height:15px;line-height:15px;text-shadow:0 1px 2px #000}
.bd-unit.bd-down .bd-n{color:#ff7a6a}
.bd-float{position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;font:800 18px/1 -apple-system,system-ui,sans-serif;text-shadow:0 2px 4px #000,0 0 2px #000;will-change:transform,opacity}
.bd-float.bd-big{font:900 28px/1 Georgia,serif;letter-spacing:.04em}
`;

interface Float { el: HTMLElement; pos: THREE.Vector3; t: number; life: number }

/** In-world DOM: unit labels and floating numbers, projected onto the labels layer every frame. */
/** A point on screen, in CSS pixels. */
export interface ScreenPos { x: number; y: number }

/** `ok` is false behind the camera. */
export interface Projected extends ScreenPos { ok: boolean }

export class Overlay {
  readonly #floats: Float[] = [];
  readonly #style: HTMLStyleElement;
  readonly #v = new THREE.Vector3();
  #dx = 0;
  #dy = 0;
  #w = 1;
  #h = 1;

  constructor(readonly el: HTMLElement, readonly camera: THREE.Camera, readonly canvas: HTMLCanvasElement) {
    this.#style = document.createElement('style');
    this.#style.textContent = CSS;
    document.head.appendChild(this.#style);
  }

  /** Canvas pixel offset inside the labels layer and canvas size, read once per frame. */
  measure(): void {
    // The camera moved this frame but its matrices only refresh at render; without this the labels trail a frame behind.
    this.camera.updateMatrixWorld();
    const c = this.canvas.getBoundingClientRect(), l = this.el.getBoundingClientRect();
    this.#dx = c.left - l.left;
    this.#dy = c.top - l.top;
    this.#w = c.width;
    this.#h = c.height;
  }

  /** Position in the labels layer; `ok` is false behind the camera. */
  project(p: THREE.Vector3): Projected {
    const v = this.#v.copy(p).project(this.camera);

    return { x: this.#dx + (v.x * 0.5 + 0.5) * this.#w, y: this.#dy + (-v.y * 0.5 + 0.5) * this.#h, ok: v.z < 1 };
  }
  /** Position in the browser viewport. */
  viewport(p: THREE.Vector3): ScreenPos {
    const v = this.#v.copy(p).project(this.camera), c = this.canvas.getBoundingClientRect();

    return { x: c.left + (v.x * 0.5 + 0.5) * c.width, y: c.top + (-v.y * 0.5 + 0.5) * c.height };
  }

  float(text: string, color: string, pos: THREE.Vector3, big = false): void {
    const el = document.createElement('div');
    el.className = big ? 'bd-float bd-big' : 'bd-float';
    el.textContent = text;
    el.style.color = color;
    this.el.appendChild(el);
    // Several numbers on one unit in quick succession would stack on one spot.
    const crowd = this.#floats.filter(f => f.t < 0.4 && f.pos.distanceToSquared(pos) < 0.5).length;
    this.#floats.push({ el, pos: pos.clone().add(new THREE.Vector3(0, crowd * 0.35, 0)), t: 0, life: big ? 1.6 : 1.2 });
  }

  label(v: UnitView): void {
    const g = v.group, s = v.shown, el = v.label;
    const lift = v.pose > 0.5 ? 0.8 : v.height + 0.4;
    const p = this.project(new THREE.Vector3(g.position.x, g.position.y + lift, g.position.z));

    if (!p.ok || !g.visible || v.arriving) { el.style.display = 'none'; return; }

    el.style.display = '';
    el.style.transform = `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-100%)`;
    el.classList.toggle('bd-down', s.life.kind === 'downed');
    const name = s.life.kind === 'downed' ? `${s.name} · DOWNED ${s.life.bleed}` : s.name;
    const { st, n, hp, sh } = v.parts;

    if (n.textContent !== name) n.textContent = name;
    const icons = [...s.st].map(k => STATUS[k].icon).join('');

    if (st.textContent !== icons) st.textContent = icons;
    const hpW = `${Math.round(Math.max(0, s.hp) / s.maxHp * 100)}%`, shW = `${Math.min(100, Math.round(s.shield / s.maxHp * 100))}%`;

    if (hp.style.width !== hpW) hp.style.width = hpW;

    if (sh.style.width !== shW) sh.style.width = shW;
  }

  update(dt: number): void {
    for (let k = this.#floats.length - 1; k >= 0; k--) {
      const f = this.#floats[k]!;
      f.t += dt;
      const q = this.project(this.#v.copy(f.pos).add(new THREE.Vector3(0, f.t * 0.8, 0)));
      f.el.style.transform = `translate(${q.x.toFixed(1)}px,${q.y.toFixed(1)}px) translate(-50%,-50%)`;
      f.el.style.opacity = String(Math.max(0, 1 - Math.max(0, f.t - f.life * 0.6) / (f.life * 0.4)));

      if (f.t > f.life) { f.el.remove(); this.#floats.splice(k, 1); }
    }
  }

  clearFloats(): void {
    for (const f of this.#floats) f.el.remove();
    this.#floats.length = 0;
  }

  dispose(): void {
    this.clearFloats();
    this.#style.remove();
  }
}
