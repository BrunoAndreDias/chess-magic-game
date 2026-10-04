import { CLASS_ORDER, CLASSES, MAP_ORDER, SKILLS, TREES, aiDeploy, aiTurn, apply, createBattle, current, getUnit, mulberry32 } from '../src/engine/index';
import type { AiOpts, BattleEvent, BattleState, ClassId, Command, MapId, MemberBuild, NodeId, Rng, Role, Team } from '../src/engine/index';

// npm run sim -- [battles] [--blind] [--dumb] [--from=K]
// --from=K: start at battle K, so shards of one long run can go in parallel.
// --blind: one team ignores the map rule (team 1 on even battles, team 0 on odd), to measure what playing around it is worth.
// --dumb: team 0 is three damage keystones, team 1 covers tank, damage and support.
const args = process.argv.slice(2), blindMode = args.includes('--blind'), dumbMode = args.includes('--dumb');
const battles = Number(args.find(a => !a.startsWith('--'))) || 8;
const from = Number(args.find(a => a.startsWith('--from='))?.slice(7)) || 0;

const pick = <T>(r: Rng, xs: readonly T[]): T => {
  const x = xs[Math.floor(r() * xs.length)];
  if (x === undefined) throw new Error('pick from an empty list');
  return x;
};
function shuffled<T>(r: Rng, xs: readonly T[]): T[] {
  const out = xs.slice();
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j] as T, out[i] as T]; }
  return out;
}

/** A random class, 3 random skills, a keystone (in a path of `role` when given) and 2 points in another path. */
function member(r: Rng, i: number, role?: Role): MemberBuild {
  const cls: ClassId = pick(r, CLASS_ORDER), tree = TREES[cls];
  const key = role ? tree.findIndex(b => b.role === role) : Math.floor(r() * 3);
  const other = pick(r, [0, 1, 2].filter(b => b !== key));
  const nodes: NodeId[] = [...(tree[key]?.nodes ?? []).map(n => n.id), ...(tree[other]?.nodes ?? []).slice(0, 2).map(n => n.id)];
  return { name: `${cls}${i}`, cls, skills: shuffled(r, CLASSES[cls].skills).slice(0, 3), tree: nodes };
}
function party(r: Rng, roles?: readonly Role[]): MemberBuild[] {
  return [0, 1, 2].map(i => member(r, i, roles?.[i]));
}
function keystonePath(m: MemberBuild): string {
  const b = TREES[m.cls].find(br => br.nodes[3] && m.tree.includes(br.nodes[3].id));
  return `${m.cls} ${b?.name ?? '-'}`;
}

/** Each class's mechanic, and the Gravecaller's Rites on top: the share of battles a side had the class and used it. */
type Mechanic = 'call' | 'thread' | 'harvest' | 'rite' | 'toll';
const MECHANICS_OF: Record<ClassId, readonly Mechanic[]> = { astromancer: ['call'], weaver: ['thread'], gravecaller: ['harvest', 'rite'], bellringer: ['toll'] };

interface MapStats { n: number; rounds: number; reasons: Record<string, number>; storm: number; falls: number; awareWins: number; draws: number }
const per = new Map<MapId, MapStats>(MAP_ORDER.map(m => [m, { n: 0, rounds: 0, reasons: {}, storm: 0, falls: 0, awareWins: 0, draws: 0 }]));
const wins: [number, number, number] = [0, 0, 0], combos: Record<string, number> = {};
const cls: Record<string, [number, number]> = {}, path: Record<string, [number, number]> = {};
const mech: Record<Mechanic, [number, number]> = { call: [0, 0], thread: [0, 0], harvest: [0, 0], rite: [0, 0], toll: [0, 0] };
let rounds = 0, ms = 0;

for (let i = from; i < from + battles; i++) {
  const r = mulberry32(100 + i);
  const map = MAP_ORDER[i % MAP_ORDER.length] ?? 'span', st = per.get(map);
  if (!st) throw new Error(`no stats for ${map}`);
  const blind: Team | null = blindMode ? (i % 2 === 0 ? 1 : 0) : null;
  const opts = (t: Team): AiOpts => ({ ignoreMap: t === blind });
  const teams: [MemberBuild[], MemberBuild[]] = dumbMode
    ? [party(r, ['damage', 'damage', 'damage']), party(r, shuffled(r, ['tank', 'damage', 'support'] as const))]
    : [party(r), party(r)];
  const bare = createBattle({ map, starter: 0, teams: [[], []] }, r);
  const deploy: [ReturnType<typeof aiDeploy>, ReturnType<typeof aiDeploy>] = [aiDeploy(bare, 0, teams[0], r, opts(0)), aiDeploy(bare, 1, teams[1], r, opts(1))];
  let s: BattleState = createBattle({ map, starter: (i % 2) as Team, teams, deploy }, r);
  const used = [new Set<Mechanic>(), new Set<Mechanic>()];
  const t0 = performance.now();
  const run = (cmds: Command[]) => {
    for (const cmd of cmds) {
      const res = apply(s, cmd);
      if (!res.ok) throw new Error(`${JSON.stringify(cmd)}: ${res.error}`);
      res.events.forEach((e: BattleEvent) => {
        if (e.type === 'combo') combos[e.name] = (combos[e.name] ?? 0) + 1;
        if (e.type === 'damage' && e.kind === 'storm') st.storm += e.amount + e.absorbed;
        if (e.type === 'fall' && !res.events.some(c => c.type === 'combo' && c.name === 'ABYSS' && c.id === e.id)) st.falls++;
        if (e.type === 'call') used[e.team]?.add('call');
        if (e.type === 'thread') { const u = getUnit(s, e.by); if (u) used[u.team]?.add('thread'); }
        if (e.type === 'cast' && e.skill === 'harvest') used[e.team]?.add('harvest');
        if (e.type === 'cast' && SKILLS[e.skill].rite) used[e.team]?.add('rite');
        if (e.type === 'cast' && e.skill === 'toll') used[e.team]?.add('toll');
      });
      s = res.state;
    }
  };
  for (let guard = 0; s.phase.kind !== 'over' && guard < 500; guard++) {
    if (s.phase.kind === 'ready') run([{ kind: 'begin' }]);
    else run(aiTurn(s, r, opts(current(s)?.team ?? 0)));
  }
  ms += performance.now() - t0;
  if (s.phase.kind !== 'over') throw new Error(`battle ${i} did not finish`);
  const { winner, reason } = s.phase;
  wins[winner === 'draw' ? 2 : winner]++;
  rounds += s.round;
  st.n++; st.rounds += s.round;
  st.reasons[reason] = (st.reasons[reason] ?? 0) + 1;
  if (winner === 'draw') st.draws++;
  else if (blind !== null && winner !== blind) st.awareWins++;
  teams.forEach((tm, t) => {
    const won = winner === t ? 1 : 0;
    for (const m of tm) {
      const c = (cls[m.cls] ??= [0, 0]); c[0] += won; c[1]++;
      const p = (path[keystonePath(m)] ??= [0, 0]); p[0] += won; p[1]++;
    }
    for (const c of new Set(tm.map(m => m.cls))) for (const k of MECHANICS_OF[c]) {
      mech[k][1]++;
      if (used[t]?.has(k)) mech[k][0]++;
    }
  });
}
const pct = (v: [number, number]) => `${((100 * v[0]) / Math.max(1, v[1])).toFixed(0)}%`;
console.log('wins', wins, 'avg rounds', (rounds / battles).toFixed(1), 'avg ms', (ms / battles).toFixed(0));
console.log('combos', JSON.stringify(combos));
console.log('class win share', Object.entries(cls).map(([k, v]) => `${k} ${pct(v)}`).join(', '));
console.log('keystone path win share');
for (const c of CLASS_ORDER) for (const b of TREES[c]) {
  const v = path[`${c} ${b.name}`];
  if (v) console.log(`  ${c.padEnd(12)}${b.name.padEnd(13)}${b.role.padEnd(8)}${pct(v).padStart(4)}  (n ${v[1]})`);
}
console.log('mechanic use (battles where a side had the class)', Object.entries(mech).map(([k, v]) => `${k} ${pct(v)}`).join(', '));
if (dumbMode) console.log(`three damage keystones win ${pct([wins[0], battles])} (draws ${wins[2]})`);
for (const [map, st] of per) {
  if (!st.n) continue;
  const aware = blindMode ? ` aware wins ${((100 * st.awareWins) / st.n).toFixed(0)}% (draws ${st.draws})` : '';
  console.log(`${map.padEnd(6)} n ${st.n} avg rounds ${(st.rounds / st.n).toFixed(1)} ${JSON.stringify(st.reasons)} storm dmg ${st.storm} falls ${st.falls}${aware}`);
}
