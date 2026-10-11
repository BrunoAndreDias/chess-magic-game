import { describe, expect, it } from 'vitest';
import { PerfMeter } from './perf';

const info = { memory: { geometries: 30, textures: 5 }, programs: [{}, {}, {}] };

describe('PerfMeter', () => {
  it('reads frames as fps, percentiles and janks', () => {
    const m = new PerfMeter();

    for (let i = 1; i <= 20; i++) m.push({ work: i, gap: i === 20 ? 40 : 10, calls: i === 7 ? 412 : 300, tris: 1000 * i });

    expect(m.report(info)).toEqual({
      frames: 20, fps: 86.96, work: { p50: 11, p95: 20, max: 20 }, gap: { p50: 10, p95: 40, max: 40 }, janks: 1,
      calls: 412, tris: 20000, geometries: 30, textures: 5, programs: 3,
    });
  });

  it('keeps only the newest 7200 frames, and reset empties it', () => {
    const m = new PerfMeter();

    for (let i = 0; i < 7200; i++) m.push({ work: 1, gap: 50, calls: 900, tris: 0 });

    for (let i = 0; i < 7200; i++) m.push({ work: 2, gap: 8, calls: 500, tris: 0 });

    expect(m.report(info)).toMatchObject({ frames: 7200, janks: 0, calls: 500, work: { p50: 2, p95: 2, max: 2 } });
    m.reset();
    expect(m.report(info)).toMatchObject({ frames: 0, fps: 0, janks: 0 });
  });
});
