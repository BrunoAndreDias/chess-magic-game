type Child = Node | string | number | null | undefined | false | readonly Child[];

type Attr = string | number | boolean | null | undefined;

type Listener = (e: Event) => void;

/** Attributes, plus `style` (an undefined value sets nothing) and `data` maps and the two listeners the screens use. TS requires the index signature to admit the named members' types; `assign` takes those by name first. */
interface Props {
  class?: string;
  style?: Record<string, string | undefined>;
  data?: Record<string, string>;
  onclick?: (e: MouseEvent) => void;
  onchange?: Listener;
  [attr: string]: Attr | Record<string, string | undefined> | Listener | ((e: MouseEvent) => void);
}

function append(el: Element, children: readonly Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;

    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

function assign(el: HTMLElement | SVGElement, props: Props | null | undefined): void {
  if (!props) return;

  const { style, data, onclick, onchange, ...attrs } = props;

  for (const [p, val] of Object.entries(style ?? {})) if (val !== undefined) el.style.setProperty(p, val);

  for (const [p, val] of Object.entries(data ?? {})) el.dataset[p] = val;

  el.onclick = onclick ?? null;
  el.onchange = onchange ?? null;

  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;

    el.setAttribute(k, v === true ? '' : String(v));
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

export function byId(id: string): HTMLElement;
export function byId<T extends HTMLElement>(id: string, type: abstract new () => T): T;
export function byId(id: string, type: abstract new () => HTMLElement = HTMLElement): HTMLElement {
  const el = document.getElementById(id);

  if (!(el instanceof type)) throw new Error(`#${id} is missing from index.html or is not a ${type.name}`);

  return el;
}

export type { Child };
