import * as THREE from 'three';
import { N, current } from '../../engine/index';
import type { BattleEvent, BattleState, MapId, Pos, Team, Unit, UnitId } from '../../engine/index';
import type { Board, Highlight, TileInput } from '../board';
import { OFF, disposeTree } from './art';
import { playEvent } from './events';
import type { PlayCtx } from './events';
import { Fx } from './fx';
import { Marks } from './marks';
import type { MarkCounts } from './marks';
import { Picker } from './input';
import { Overlay } from './overlay';
import { PerfMeter } from './perf';
import type { PerfReport } from './perf';
import { Stage } from './stage';
import { FX_KEYS, Terrain } from './terrain';
import { Tweens } from './tween';
import { warmFigures } from './models';
import { UNIT_OF, animateUnit, buildUnit, setPose, shownOf } from './units';
import type { UnitView } from './units';

/** What the scene currently shows, read back from the meshes for the browser playtest. */
export interface BoardDebug {
  units(): { id: UnitId; x: number; z: number; visible: boolean; down: boolean; hp: number; shield: number }[];
  marks(): MarkCounts;
  /** Per tile `x,z` the base terrain char and overlay keys, e.g. `3,4:.:fire+smoke`. */
  tiles(): string[];
  busy(): boolean;
  /** Seconds of animation time elapsed, independent of the frame rate. */
  clock(): number;
  /** Frame cost since the last reset; with `sync` on, each frame waits for the GPU so `work` includes its time. */
  perf(): PerfReport;
  perfReset(sync?: boolean): void;
}

class BoardView implements Board {
  readonly #stage: Stage;
  readonly #terrain: Terrain;
  readonly #tweens = new Tweens();
  readonly #fx: Fx;
  readonly #overlay: Overlay;
  readonly #marks: Marks;
  readonly #picker: Picker;
  readonly #views = new Map<UnitId, UnitView>();
  readonly #unitRoot = new THREE.Group();
  #map: MapId | null = null;
  #active: UnitId | null = null;
  #follow = true;
  /** Bumped by load/dispose so an in-flight play stops touching the scene. */
  #gen = 0;
  #queue: Promise<void> = Promise.resolve();
  #playing = 0;
  #raf = 0;
  #last = performance.now();
  #time = 0;
  readonly #meter = new PerfMeter();
  #sync = false;
  readonly #onVisibility: () => void;

  constructor(canvas: HTMLCanvasElement, readonly labels: HTMLElement) {
    this.#stage = new Stage(canvas);
    this.#stage.world.add(this.#unitRoot);
    this.#terrain = new Terrain(this.#stage.world);
    this.#fx = new Fx(this.#stage.world, this.#tweens);
    this.#overlay = new Overlay(labels, this.#stage.camera, canvas);
    this.#marks = new Marks(this.#stage.world, labels, this.#terrain, this.#overlay, this.#tweens, this.#views);
    this.#picker = new Picker(canvas, this.#stage.camera, () => ({
      tiles: this.#terrain.picks,
      units: [...this.#views.values()].flatMap(v => (v.group.visible ? [v.group] : [])),
      tileOfUnit: o => { const id = UNIT_OF.get(o), v = id === undefined ? undefined : this.#views.get(id); return v ? tileOf(v) : null; },
    }));
    // A hidden tab gets no animation frames, so a play would never resolve; finish animations instantly instead.
    this.#onVisibility = () => { this.#tweens.instant = document.hidden; if (document.hidden) this.#tweens.flush(); };

    document.addEventListener('visibilitychange', this.#onVisibility);
    this.#onVisibility();
    this.#raf = requestAnimationFrame(this.#frame);
  }

  get debug(): BoardDebug {
    return {
      units: () => [...this.#views.values()].map(v => ({
        id: v.id, ...tileOf(v), visible: v.group.visible, down: v.pose === 1, hp: v.shown.hp, shield: v.shown.shield,
      })),
      marks: () => this.#marks.counts,
      tiles: () => {
        const out: string[] = [];

        for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
          const t = this.#terrain.tile(x, z);

          if (t) out.push(`${x},${z}:${t.base}:${FX_KEYS.filter(k => t.fx[k]).join('+')}${t.spent ? ':spent' : ''}`);
        }

        return out;
      },
      busy: () => this.#playing > 0,
      clock: () => this.#time,
      perf: () => this.#meter.report(this.#stage.renderer.info),
      perfReset: (sync = false) => { this.#sync = sync; this.#meter.reset(); },
    };
  }

  load(state: BattleState): void {
    this.#gen++;
    this.#tweens.flush();
    this.#overlay.clearFloats();

    for (const v of this.#views.values()) { disposeTree(v.group); v.label.remove(); }

    this.#views.clear();
    this.#stage.setBiome(state.map);
    this.#terrain.load(state);
    this.#map = state.map;
    this.#snap(state);
  }

  play(events: readonly BattleEvent[], before: BattleState, after: BattleState, onEvent?: (e: BattleEvent) => Promise<void> | void): Promise<void> {
    const gen = this.#gen;
    this.#playing++;

    const run = async (): Promise<void> => {
      if (gen !== this.#gen) return;

      if (this.#map !== before.map) this.load(before);
      else this.#snap(before);
      const g = this.#gen, ctx = this.#ctx(before, after);

      for (const e of events) {
        await onEvent?.(e);

        if (g !== this.#gen) return;
        await playEvent(e, ctx);

        if (g !== this.#gen) return;
      }

      this.#snap(after);
    };

    const p = this.#queue.then(run).finally(() => { this.#playing--; });
    this.#queue = p.catch(() => {});

    return p;
  }

  #ctx(before: BattleState, after: BattleState): PlayCtx {
    return {
      before, after, views: this.#views, terrain: this.#terrain, marks: this.#marks, fx: this.#fx, tweens: this.#tweens, overlay: this.#overlay, stage: this.#stage,
      follow: () => this.#follow,
      setActive: id => this.#setActive(id),
      active: () => this.#active,
    };
  }

  /** Make the scene match `s` exactly: terrain, overlays, every unit's tile, visibility, pose and label. */
  #snap(s: BattleState): void {
    this.#terrain.sync(s);
    const seen = new Set<UnitId>();

    for (const u of s.units) {
      seen.add(u.id);
      let v = this.#views.get(u.id);

      if (!v) {
        v = buildUnit(u, this.labels);
        this.#unitRoot.add(v.group);
        this.#views.set(u.id, v);
      }

      this.#place(v, u);
    }

    for (const [id, v] of this.#views) if (!seen.has(id)) { disposeTree(v.group); v.label.remove(); this.#views.delete(id); }

    this.#marks.sync(s);
    this.#setActive(s.phase.kind === 'act' ? current(s)?.id ?? null : null);
  }

  #place(v: UnitView, u: Unit): void {
    v.group.position.copy(this.#terrain.at(u.x, u.z));
    v.group.scale.setScalar(1);
    v.group.rotation.z = 0;
    v.group.visible = u.life.kind !== 'dead';
    v.shown = shownOf(u);
    setPose(v, u.life.kind === 'downed' ? 1 : 0);
  }

  #setActive(id: UnitId | null): void {
    this.#active = id;

    for (const [vid, v] of this.#views) v.ring.visible = vid === id && v.shown.life.kind !== 'dead';
  }

  highlight(layers: readonly Highlight[]): void { this.#terrain.highlight(layers); }

  focus(unit: UnitId | null, team: Team): void {
    if (unit === null) { this.#stage.overview(team); return; }

    const v = this.#views.get(unit);

    if (v && this.#follow) this.#stage.follow(v.group.position, team);
  }

  setFollow(on: boolean): void { this.#follow = on; }

  onInput(listener: (input: TileInput) => void): void { this.#picker.listen(listener); }

  warm(): void { void warmFigures(this.#stage.renderer, this.#stage.camera, this.#stage.scene); }

  screenOf(tile: Pos): { x: number; y: number } {
    return this.#overlay.viewport(this.#terrain.at(tile.x, tile.z, 0.05));
  }

  dispose(): void {
    this.#gen++;
    cancelAnimationFrame(this.#raf);
    document.removeEventListener('visibilitychange', this.#onVisibility);
    this.#tweens.instant = true;
    this.#tweens.flush();
    this.#picker.dispose();

    for (const v of this.#views.values()) { disposeTree(v.group); v.label.remove(); }

    this.#views.clear();
    this.#marks.dispose();
    this.#terrain.dispose();
    this.#overlay.dispose();
    this.#stage.dispose();
  }

  readonly #frame = (now: number): void => {
    this.#raf = requestAnimationFrame(this.#frame);
    const start = performance.now(), gap = now - this.#last, dt = Math.min(0.1, gap / 1000);
    this.#last = now;
    this.#time += dt;
    const t = this.#time, st = this.#stage;
    st.resize();
    this.#tweens.update(dt);
    st.update(dt, t);
    this.#terrain.update(t);
    const av = this.#active !== null ? this.#views.get(this.#active) : undefined;

    if (av && av.group.visible) {
      st.lantern.position.lerp(av.group.position.clone().add(new THREE.Vector3(0, 2.4, 0)), Math.min(1, dt * 5));
      st.lantern.intensity = 1.3 * Math.PI;
    } else st.lantern.intensity = 0.5 * Math.PI;
    this.#overlay.measure();

    for (const v of this.#views.values()) {
      animateUnit(v, t);
      this.#overlay.label(v);
    }

    this.#marks.update(dt);
    this.#overlay.update(dt);
    st.render(dt);

    if (this.#sync) st.renderer.getContext().finish();
    this.#meter.push(performance.now() - start, gap);
  };
}

function tileOf(v: UnitView): Pos {
  return { x: Math.round(v.group.position.x + OFF), z: Math.round(v.group.position.z + OFF) };
}

export function createBoard(canvas: HTMLCanvasElement, labels: HTMLElement): Board & { readonly debug: BoardDebug } {
  return new BoardView(canvas, labels);
}

