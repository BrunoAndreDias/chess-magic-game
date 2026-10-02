import {
  CLASSES, CLASS_ORDER, COMBO_INFO, SKILLS, MAP_ORDER, N, POINTS, TREES, aiOrder, aiTurn, apply, canTake, createBattle, mulberry32, newMember,
} from '../src/engine/index';
import type { BattleEvent, BattleState, ClassId, ClassSkillId, Command, MemberBuild, NodeId, Rng, TileFx } from '../src/engine/index';
import { loadProto } from './proto';
import type { ProtoEvent, ProtoState } from './proto';

type Snap = { [k: string]: Snap } | Snap[] | string | number | boolean | null;

const NUMERIC_PAYLOAD = ['t', 'dmg', 'amt'];
const BOOL_PAYLOAD: Record<string, string> = { poison: 'venom', mark: 'pred' };
const ID_BY = new Set(['guard', 'taunt']);

function statusSnap(key: string, v: Record<string, unknown>): Snap {
  const o: Record<string, Snap> = {};
  for (const f of NUMERIC_PAYLOAD) { const n = v[f]; if (typeof n === 'number') o[f] = n; }
  const b = BOOL_PAYLOAD[key];
  if (b) o[b] = !!v[b];
  if (ID_BY.has(key)) o.by = typeof v.by === 'number' ? v.by : null;
  return o;
}
function sortedRecord(entries: [string, Snap][]): Snap {
  const o: Record<string, Snap> = {};
  for (const [k, v] of entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) o[k] = v;
  return o;
}
function fxSnap(f: Record<string, unknown> | undefined): Snap {
  if (!f) return null;
  return sortedRecord(Object.entries(f).map(([k, v]): [string, Snap] => [k, v === true ? 1 : typeof v === 'number' ? v : String(v)]));
}
function cdSnap(cd: Record<string, number | undefined>): Snap {
  return sortedRecord(Object.entries(cd).flatMap(([k, v]): [string, Snap][] => (v ? [[k, v]] : [])));
}

function protoSnap(s: ProtoState): Snap {
  return {
    round: s.round, starter: s.starter, phase: s.phase,
    winner: s.winner === null ? null : s.winner === -1 ? 'draw' : s.winner, reason: s.winner === null ? null : s.reason,
    queue: s.phase === 'act' ? s.queue.slice() : null, qi: s.phase === 'act' ? s.qi : null,
    units: s.units.map(u => ({
      id: u.id, team: u.team, x: u.x, z: u.z, hp: u.hp, maxHp: u.maxHp, shield: u.shield,
      life: !u.alive ? 'dead' : u.downed ? `downed:${u.downed}` : 'up',
      st: sortedRecord(Object.entries(u.st).map(([k, v]): [string, Snap] => [k, statusSnap(k, v)])),
      cd: cdSnap(u.cd), moved: u.moved, acted: u.acted, moveCap: u.moveCap,
    })),
    tiles: Array.from({ length: N * N }, (_, k) => ({ terr: s.terr[k] ?? '?', fx: fxSnap(s.fx[k]) })),
    combos: s.combos.slice(), stats: { dmg: s.stats.dmg.slice(), heal: s.stats.heal.slice(), downs: s.stats.downs.slice(), revives: s.stats.revives.slice() },
  };
}

function portSnap(s: BattleState): Snap {
  const ph = s.phase;
  return {
    round: s.round, starter: s.starter, phase: ph.kind,
    winner: ph.kind === 'over' ? ph.winner : null, reason: ph.kind === 'over' ? ph.reason : null,
    queue: ph.kind === 'act' ? ph.queue.slice() : null, qi: ph.kind === 'act' ? ph.qi : null,
    units: s.units.map(u => ({
      id: u.id, team: u.team, x: u.x, z: u.z, hp: u.hp, maxHp: u.maxHp, shield: u.shield,
      life: u.life.kind === 'downed' ? `downed:${u.life.bleed}` : u.life.kind,
      st: sortedRecord(Object.entries(u.st).map(([k, v]): [string, Snap] => [k, statusSnap(k, { ...v })])),
      cd: cdSnap(u.cd), moved: u.moved, acted: u.acted, moveCap: u.moveCap,
    })),
    tiles: s.terr.map((terr, k) => {
      const f: TileFx | undefined = s.fx[k];
      return { terr, fx: fxSnap(f ? { ...f } : undefined) };
    }),
    combos: s.combos.slice(), stats: { dmg: s.stats.dmg.slice(), heal: s.stats.heal.slice(), downs: s.stats.downs.slice(), revives: s.stats.revives.slice() },
  };
}

function protoEvents(ev: ProtoEvent[]): Snap {
  return ev.map(e => [e.type, typeof e.id === 'number' ? e.id : null, typeof e.amount === 'number' ? e.amount : null, typeof e.name === 'string' ? e.name : null]);
}
function portEvents(ev: BattleEvent[]): Snap {
  return ev.filter(e => e.type !== 'over').map(e => [
    e.type,
    'id' in e && typeof e.id === 'number' ? e.id : null,
    'amount' in e ? e.amount : null,
    e.type === 'combo' ? e.name : null,
  ]);
}

/** First path at which a and b differ, with both values. */
function diff(a: Snap, b: Snap, path: string): [string, Snap, Snap] | null {
  if (a === b) return null;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return [path, a, b];
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = diff(a[i] ?? null, b[i] ?? null, `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (Array.isArray(a) || Array.isArray(b)) return [path, a, b];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const d = diff(a[k] ?? null, b[k] ?? null, `${path}.${k}`);
    if (d) return d;
  }
  return null;
}

function play(port: BattleState, cmds: readonly Command[]): { state: BattleState; events: BattleEvent[] } {
  let state = port;
  const events: BattleEvent[] = [];
  for (const cmd of cmds) {
    const r = apply(state, cmd);
    if (!r.ok) throw new Error(`port rejected its own AI command ${JSON.stringify(cmd)}: ${r.error}`);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

function partyClasses(r: Rng): ClassId[] {
  return [0, 1, 2].map(() => CLASS_ORDER[Math.floor(r() * CLASS_ORDER.length)] ?? 'warden');
}

/** Any 3 of the class's skills and 5 valid tree points, so every skill and node gets played. */
function randomBuild(r: Rng, cls: ClassId, name: string): MemberBuild {
  const pool = CLASSES[cls].skills.slice(), skills: ClassSkillId[] = [];
  while (skills.length < 3) skills.push(...pool.splice(Math.floor(r() * pool.length), 1));
  const tree: NodeId[] = [];
  for (let k = 0; k < POINTS; k++) {
    const open = TREES[cls].flatMap(b => b.nodes.map(n => n.id)).filter(id => canTake(cls, tree, id));
    const id = open[Math.floor(r() * open.length)];
    if (id) tree.push(id);
  }
  return { name, cls, skills, tree };
}

const L = loadProto();
const battles = Number(process.argv[2]) || 8;
const randomBuilds = process.argv.includes('--random-builds');
let snapshots = 0, protoMs = 0, portMs = 0;
const seen = new Set<string>();

for (let i = 0; i < battles; i++) {
  const rp = mulberry32(100 + i), rt = mulberry32(100 + i);
  Math.random = rp;
  const map = MAP_ORDER[i % MAP_ORDER.length] ?? 'crypt';
  const classes = [partyClasses(rp), partyClasses(rp)];
  partyClasses(rt); partyClasses(rt);
  const rb = mulberry32(9000 + i);
  const members = (cs: ClassId[]) => cs.map((c, j) => (randomBuilds ? randomBuild(rb, c, `${c}${j}`) : newMember(c, `${c}${j}`)));
  const teams: [MemberBuild[], MemberBuild[]] = [members(classes[0] ?? []), members(classes[1] ?? [])];
  const P = L.createBattle({ map, starter: 0, teams: teams.map(tm => tm.map(m => ({ ...m, skills: m.skills.slice(), tree: m.tree.slice(), ctrl: 'ai' }))) });
  const t0 = performance.now();
  let S = createBattle({ map, starter: 0, teams }, rt);
  portMs += performance.now() - t0;

  const compare = (what: string, pev: ProtoEvent[] | null, tev: BattleEvent[] | null) => {
    snapshots++;
    for (const e of tev ?? []) if (e.type === 'cast') seen.add(e.skill.startsWith('basic_') ? 'basic' : e.skill); else if (e.type === 'combo') seen.add(e.name);
    const d = diff(protoSnap(P), portSnap(S), 'state') ?? (pev && tev ? diff(protoEvents(pev), portEvents(tev), 'events') : null);
    if (!d) return;
    const [path, pv, tv] = d;
    const unit = /units\[(\d+)\]/.exec(path);
    const uid = unit ? P.units[Number(unit[1])]?.id : null;
    console.log(`parity: divergence in seed ${100 + i} (battle ${i}, ${map}) round ${P.round} after ${what}${uid ? `, unit ${uid}` : ''}`);
    console.log(`  field ${path}`);
    console.log(`  prototype ${JSON.stringify(pv)}`);
    console.log(`  port      ${JSON.stringify(tv)}`);
    process.exit(1);
  };
  compare('deploy', null, null);

  let guard = 0;
  while (P.winner === null && guard++ < 500) {
    if (P.phase === 'order') {
      let t = performance.now();
      const pev = L.setOrders(P, L.aiOrder(P, 0, rp), L.aiOrder(P, 1, rp));
      protoMs += performance.now() - t;
      t = performance.now();
      const res = play(S, [{ kind: 'order', team: 0, order: aiOrder(S, 0, rt) }, { kind: 'order', team: 1, order: aiOrder(S, 1, rt) }]);
      portMs += performance.now() - t;
      S = res.state;
      compare('orders', pev, res.events);
      continue;
    }
    let t = performance.now();
    const pev = L.aiActivation(P, rp);
    protoMs += performance.now() - t;
    t = performance.now();
    const res = play(S, aiTurn(S, rt));
    portMs += performance.now() - t;
    S = res.state;
    compare('activation', pev, res.events);
  }
}
console.log(`parity: ${battles}/${battles} battles identical${randomBuilds ? ' (random builds)' : ''}, ${snapshots} snapshots compared`);
const unplayed = [...Object.keys(SKILLS).filter(k => !k.startsWith('basic_')), 'basic', ...Object.keys(COMBO_INFO)].filter(k => !seen.has(k));
console.log(`never played: ${unplayed.length ? unplayed.join(', ') : 'none'}`);
console.log(`time per battle: prototype ${(protoMs / battles).toFixed(1)} ms, port ${(portMs / battles).toFixed(1)} ms`);
