/** One frame: `work` is the board's own time inside the frame callback, `gap` the time since the previous frame began, `calls` and `tris` what it drew. */
export interface Frame { work: number; gap: number; calls: number; tris: number }

export interface Spread { p50: number; p95: number; max: number }

/** What a stretch of frames cost. Times in ms; `calls` and `tris` are the most any one frame drew, the rest are live totals. */
export interface PerfReport {
  frames: number;
  fps: number;
  work: Spread;
  gap: Spread;
  /** Frames that missed a 60 Hz deadline by half a frame or more. */
  janks: number;
  calls: number;
  tris: number;
  geometries: number;
  textures: number;
  programs: number;
}

/** The part of three's `renderer.info` the report reads. */
interface GlInfo { memory: { geometries: number; textures: number }; programs: readonly unknown[] | null }

const CAP = 7200;

const JANK_MS = 25;

/** Ring buffer of the last {@link CAP} frames, read as percentiles. */
export class PerfMeter {
  readonly #frames: Frame[] = [];
  #at = 0;

  push(f: Frame): void {
    if (this.#frames.length < CAP) this.#frames.push(f);
    else this.#frames[this.#at] = f;
    this.#at = (this.#at + 1) % CAP;
  }

  reset(): void { this.#frames.length = 0; this.#at = 0; }

  report(info: GlInfo): PerfReport {
    const fs = this.#frames, gaps = fs.map(f => f.gap), total = gaps.reduce((a, b) => a + b, 0);

    return {
      frames: fs.length,
      fps: total > 0 ? round(1000 * fs.length / total) : 0,
      work: spread(fs.map(f => f.work)),
      gap: spread(gaps),
      janks: gaps.filter(g => g >= JANK_MS).length,
      calls: Math.max(0, ...fs.map(f => f.calls)),
      tris: Math.max(0, ...fs.map(f => f.tris)),
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
    };
  }
}

function spread(xs: number[]): Spread {
  const s = [...xs].sort((a, b) => a - b), at = (q: number) => round(s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0);

  return { p50: at(0.5), p95: at(0.95), max: round(s.at(-1) ?? 0) };
}

const round = (x: number): number => Math.round(x * 100) / 100;

/** A corner readout of the last second's frames, for `?perf`. */
export function mountPerfHud(debug: { perf(): PerfReport; perfReset(): void }): void {
  const el = document.createElement('div');
  el.id = 'perfhud';
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:98;padding:3px 7px;border-radius:4px;background:rgba(0,0,0,.65);color:#cfe8d0;font:11px/1.4 ui-monospace,monospace;pointer-events:none;white-space:pre';
  document.body.append(el);
  setInterval(() => {
    const r = debug.perf();
    debug.perfReset();
    el.textContent = `${Math.round(r.fps)} fps  work ${r.work.p50}/${r.work.p95} ms  ${r.janks} janks\n${r.calls} calls  ${Math.round(r.tris / 1000)}k tris  ${r.programs} shaders`;
  }, 1000);
}
