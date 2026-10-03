import { CLASS_ORDER, MAP_ORDER, aiDeploy, current, aiOrder, aiTurn, apply, createBattle, mulberry32, newMember } from '../src/engine/index';
import type { AiOpts, BattleEvent, BattleState, ClassId, Command, MapId, MemberBuild, Rng, Team } from '../src/engine/index';

// npm run sim -- [battles] [--blind]
// --blind: one team ignores the map rule (team 1 on even battles, team 0 on odd), to measure what playing around it is worth.
const args = process.argv.slice(2), blindMode = args.includes('--blind');
const battles = Number(args.find(a => !a.startsWith('--'))) || 8;

function party(r: Rng): MemberBuild[] {
  return [0, 1, 2].map(i => {
    const c: ClassId = CLASS_ORDER[Math.floor(r() * CLASS_ORDER.length)] ?? 'warden';
    return newMember(c, `${c}${i}`);
  });
}

interface MapStats { n: number; rounds: number; reasons: Record<string, number>; storm: number; falls: number; awareWins: number; draws: number }
const per = new Map<MapId, MapStats>(MAP_ORDER.map(m => [m, { n: 0, rounds: 0, reasons: {}, storm: 0, falls: 0, awareWins: 0, draws: 0 }]));
const wins: [number, number, number] = [0, 0, 0], combos: Record<string, number> = {}, cls: Record<string, [number, number]> = {};
let rounds = 0, ms = 0;

for (let i = 0; i < battles; i++) {
  const r = mulberry32(100 + i);
  const map = MAP_ORDER[i % MAP_ORDER.length] ?? 'span', st = per.get(map);
  if (!st) throw new Error(`no stats for ${map}`);
  const blind: Team | null = blindMode ? (i % 2 === 0 ? 1 : 0) : null;
  const opts = (t: Team): AiOpts => ({ ignoreMap: t === blind });
  const teams: [MemberBuild[], MemberBuild[]] = [party(r), party(r)];
  const bare = createBattle({ map, starter: 0, teams: [[], []] }, r);
  const deploy: [ReturnType<typeof aiDeploy>, ReturnType<typeof aiDeploy>] = [aiDeploy(bare, 0, teams[0], r, opts(0)), aiDeploy(bare, 1, teams[1], r, opts(1))];
  let s: BattleState = createBattle({ map, starter: 0, teams, deploy }, r);
  const t0 = performance.now();
  const run = (cmds: Command[]) => {
    for (const cmd of cmds) {
      const res = apply(s, cmd);
      if (!res.ok) throw new Error(`${JSON.stringify(cmd)}: ${res.error}`);
      s = res.state;
      res.events.forEach((e: BattleEvent) => {
        if (e.type === 'combo') combos[e.name] = (combos[e.name] ?? 0) + 1;
        if (e.type === 'damage' && e.kind === 'storm') st.storm += e.amount + e.absorbed;
        if (e.type === 'fall' && !res.events.some(c => c.type === 'combo' && c.name === 'ABYSS' && c.id === e.id)) st.falls++;
      });
    }
  };
  for (let guard = 0; s.phase.kind !== 'over' && guard < 500; guard++) {
    if (s.phase.kind === 'order') run([{ kind: 'order', team: 0, order: aiOrder(s, 0, r) }, { kind: 'order', team: 1, order: aiOrder(s, 1, r) }]);
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
  if (winner !== 'draw') for (const m of teams[winner]) (cls[m.cls] ??= [0, 0])[0]++;
  for (const tm of teams) for (const m of tm) (cls[m.cls] ??= [0, 0])[1]++;
}
console.log('wins', wins, 'avg rounds', (rounds / battles).toFixed(1), 'avg ms', (ms / battles).toFixed(0));
console.log('combos', JSON.stringify(combos));
console.log('class win share', Object.entries(cls).map(([k, v]) => `${k} ${((100 * v[0]) / v[1]).toFixed(0)}%`).join(', '));
for (const [map, st] of per) {
  if (!st.n) continue;
  const aware = blindMode ? ` aware wins ${((100 * st.awareWins) / st.n).toFixed(0)}% (draws ${st.draws})` : '';
  console.log(`${map.padEnd(6)} n ${st.n} avg rounds ${(st.rounds / st.n).toFixed(1)} ${JSON.stringify(st.reasons)} storm dmg ${st.storm} falls ${st.falls}${aware}`);
}
