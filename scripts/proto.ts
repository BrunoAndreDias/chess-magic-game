import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The slice of the prototype's logic API the scripts drive. */
export interface ProtoUnit {
  id: number; team: number; x: number; z: number; hp: number; maxHp: number; shield: number; alive: boolean; downed: number;
  st: Record<string, Record<string, unknown>>; cd: Record<string, number>; moved: boolean; acted: boolean; moveCap: number;
}
export interface ProtoState {
  round: number; starter: number; phase: string; queue: number[]; qi: number; winner: number | null; reason: string;
  units: ProtoUnit[]; terr: string[]; fx: Record<string, Record<string, number>>; combos: number[];
  stats: { dmg: number[]; heal: number[]; downs: number[]; revives: number[] };
}
export interface ProtoEvent { type: string; id?: unknown; amount?: unknown; name?: unknown }
export interface ProtoMember { name: string; cls: string; skills: string[]; tree: string[]; ctrl: string }
export interface ProtoApi {
  MAP_ORDER: string[];
  CLASS_ORDER: string[];
  newMember(cls: string, name: string, ctrl: string): ProtoMember;
  createBattle(opts: { map: string; teams: ProtoMember[][]; starter: number }): ProtoState;
  setOrders(s: ProtoState, a: number[], b: number[]): ProtoEvent[];
  aiOrder(s: ProtoState, team: number, rnd: () => number): number[];
  aiActivation(s: ProtoState, rnd: () => number): ProtoEvent[];
}

function isProtoApi(x: unknown): x is ProtoApi {
  if (typeof x !== 'object' || x === null) return false;
  return ['newMember', 'createBattle', 'setOrders', 'aiOrder', 'aiActivation'].every(k => typeof Reflect.get(x, k) === 'function');
}

const DEFAULT_HTML = fileURLToPath(new URL('../prototypes-party/party-tactics.html', import.meta.url));

/** Evaluates the prototype's `<script id="logic">` block the way the old headless runner did. */
export function loadProto(path = process.env.PROTO ?? DEFAULT_HTML): ProtoApi {
  const html = readFileSync(path, 'utf8');
  const src = html.split('<script id="logic">')[1]?.split('</script>')[0];
  if (!src) throw new Error(`${path}: no <script id="logic"> block`);
  const api: unknown = new Function('module', `${src};return module.exports;`)({ exports: {} });
  if (!isProtoApi(api)) throw new Error(`${path}: logic block did not export the expected API`);
  return api;
}
