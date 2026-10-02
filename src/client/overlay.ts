import { byId, h } from './dom';

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export function reportError(msg: string): void {
  const box = byId('errbox');
  box.classList.remove('hidden');
  box.textContent += `${msg}\n`;
}

export function installErrorOverlay(): void {
  addEventListener('error', e => reportError(`Error: ${e.message}${e.filename ? `  (${e.filename.split('/').pop()}:${e.lineno})` : ''}`));
  addEventListener('unhandledrejection', e => {
    const r: unknown = e.reason;
    reportError(`Error: ${r instanceof Error ? r.stack ?? r.message : String(r)}`);
  });
}

/** A centred title that holds for `ms`, then fades. Resolves once it is gone. */
export async function banner(text: string, color: string, sub: string, ms = 800): Promise<void> {
  const b = byId('banner');
  b.replaceChildren(text, sub ? h('small', null, sub) : '');
  b.style.color = color;
  b.classList.add('show');
  await wait(ms);
  b.classList.remove('show');
  await wait(200);
}

let comboTimer: ReturnType<typeof setTimeout> | undefined;
export function comboBanner(name: string, credit: string, info: string): void {
  const c = byId('combo');
  c.replaceChildren(h('div', { class: 'cn' }, `${name}!`), h('div', { class: 'cw' }, credit), h('div', { class: 'ci' }, info));
  c.classList.add('show');
  clearTimeout(comboTimer);
  comboTimer = setTimeout(() => c.classList.remove('show'), 1600);
}

export function clearBanners(): void {
  byId('banner').classList.remove('show');
  byId('combo').classList.remove('show');
}
