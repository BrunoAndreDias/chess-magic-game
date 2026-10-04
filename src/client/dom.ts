type Child = Node | string | number | null | undefined | false | readonly Child[];

interface Props {
  class?: string;
  style?: Record<string, string>;
  data?: Record<string, string>;
  [attr: string]: unknown;
}

function append(el: Element, children: readonly Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;

    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

function assign(el: Element, props: Props | null | undefined): void {
  if (!props) return;

  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;

    if (k === 'class') el.setAttribute('class', String(v));
    else if (k === 'style') for (const [p, val] of Object.entries(v as Record<string, string>)) (el as HTMLElement | SVGElement).style.setProperty(p, val);
    else if (k === 'data') for (const [p, val] of Object.entries(v as Record<string, string>)) (el as HTMLElement).dataset[p] = val;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
}

/** Builds an HTML element. Text children become text nodes, so user data is never parsed as markup. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  assign(el, props);
  append(el, children);

  return el;
}

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  assign(el, props);
  append(el, children);

  return el;
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);

  if (!el) throw new Error(`#${id} is missing from index.html`);

  return el as T;
}

export type { Child };
