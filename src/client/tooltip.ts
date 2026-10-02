import { byId } from './dom';
import type { Child } from './dom';

const mouse = { x: 0, y: 0 };
let el: HTMLElement | null = null;
/** The HUD element a tip belongs to; the tip goes when a re-render removes it, since no pointerleave fires then. */
let owner: Element | null = null;

function box(): HTMLElement { return (el ??= byId('tooltip')); }

function place(): void {
  const t = box();
  let x = mouse.x + 16, y = mouse.y + 16;
  const w = t.offsetWidth, hh = t.offsetHeight;
  if (x + w > innerWidth - 8) x = mouse.x - w - 16;
  if (y + hh > innerHeight - 8) y = mouse.y - hh - 16;
  t.style.left = `${Math.max(4, x)}px`;
  t.style.top = `${Math.max(4, y)}px`;
}

export function trackMouse(): void {
  addEventListener('pointermove', ev => {
    mouse.x = ev.clientX; mouse.y = ev.clientY;
    if (owner && !owner.isConnected) hideTip();
    else if (el && el.style.display === 'block') place();
  }, { passive: true });
}

export function showTip(...content: Child[]): void {
  owner = null;
  const t = box();
  t.replaceChildren();
  for (const c of content.flat(4)) if (c !== null && c !== undefined && c !== false) t.append(c instanceof Node ? c : String(c));
  t.style.display = 'block';
  place();
}

export function hideTip(): void { owner = null; box().style.display = 'none'; }

/** Shows `content()` while the pointer is over `target`. */
export function withTip<T extends Element>(target: T, content: () => Child[]): T {
  target.addEventListener('pointerenter', () => { showTip(...content()); owner = target; });
  target.addEventListener('pointerleave', hideTip);
  return target;
}
