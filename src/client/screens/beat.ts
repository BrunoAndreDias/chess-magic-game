/** The lock-in beat, `t` seconds after a lock: how far the camera has pushed in, how bright the flare burns, and the figure's chosen motion. */
export interface Beat {
  /** 0 at the resting camera, 1 pushed in on the figure. */
  push: number;
  /** The class-glow burst, 0 to 1. */
  flare: number;
  /** Metres the figure rises. */
  lift: number;
  /** Radians the figure has turned. */
  spin: number;
  /** The figure's height scale: below 1 is a crouch. */
  squash: number;
}

export const BEAT_SEC = 1.6;
const REST: Beat = { push: 0, flare: 0, lift: 0, spin: 0, squash: 1 };

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const easeOut = (x: number): number => 1 - (1 - x) ** 3;
const easeInOut = (x: number): number => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
const r3 = (x: number): number => Math.round(x * 1000) / 1000 + 0;

/**
 * 0 to 0.12 s the figure crouches as the flare ignites; it springs up and turns once until 0.7 s, landing at 0.5 s;
 * the camera reaches the figure at 0.45 s, holds, and eases back out from 1.05 s. Reduced motion keeps only a softer flare.
 */
export function lockBeat(t: number, reduced: boolean): Beat {
  if (t < 0 || t >= BEAT_SEC) return REST;
  const flare = t < 0.12 ? t / 0.12 : Math.exp(-(t - 0.12) * 3.2);
  if (reduced) return { ...REST, flare: r3(flare * 0.6) };
  const push = t < 0.45 ? easeOut(t / 0.45) : t < 1.05 ? 1 : 1 - easeInOut((t - 1.05) / (BEAT_SEC - 1.05));
  const hop = clamp01((t - 0.12) / 0.38);
  const squash = t < 0.12 ? 1 - 0.08 * (t / 0.12) : t < 0.2 ? 0.92 + 0.08 * ((t - 0.12) / 0.08) : t >= 0.5 && t < 0.64 ? 1 - 0.05 * Math.sin(Math.PI * (t - 0.5) / 0.14) : 1;
  return {
    push: r3(push),
    flare: r3(flare),
    lift: r3(t < 0.5 ? 0.22 * Math.sin(Math.PI * hop) : 0),
    spin: r3(2 * Math.PI * easeInOut(clamp01((t - 0.12) / 0.58))),
    squash: r3(squash),
  };
}
