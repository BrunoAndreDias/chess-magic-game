interface Tween { t: number; dur: number; step: (p: number) => void; done: () => void }

export const easeInOut = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/** Time-driven animations stepped by the board's frame loop. Each resolves when it reaches its end. */
export class Tweens {
  #list: Tween[] = [];
  /** While set, new tweens jump straight to their end (hidden tab: no frames will come). */
  instant = false;

  run(sec: number, step: (p: number) => void): Promise<void> {
    if (this.instant) { step(1); return Promise.resolve(); }

    return new Promise(done => { this.#list.push({ t: 0, dur: Math.max(1e-3, sec), step, done }); });
  }
  wait(sec: number): Promise<void> { return this.run(sec, () => {}); }

  update(dt: number): void {
    const list = this.#list;

    for (let i = list.length - 1; i >= 0; i--) {
      const tw = list[i]!;
      tw.t += dt;
      const p = Math.min(1, tw.t / tw.dur);
      tw.step(p);

      if (p >= 1) { list.splice(i, 1); tw.done(); }
    }
  }

  /** Jump every running tween to its end. */
  flush(): void {
    const list = this.#list;
    this.#list = [];

    for (const tw of list) { tw.step(1); tw.done(); }
  }
}
