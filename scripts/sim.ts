import { CLASS_ORDER, MAP_ORDER, aiOrder, aiTurn, apply, createBattle, mulberry32, newMember } from '../src/engine/index';
import type { BattleEvent, BattleState, ClassId, Command, MemberBuild, Rng } from '../src/engine/index';

function party(r: Rng): MemberBuild[] {
  return [0, 1, 2].map(i => {
    const c: ClassId = CLASS_ORDER[Math.floor(r() * CLASS_ORDER.length)] ?? 'warden';
    return newMember(c, `${c}${i}`);
  });
}

const battles = Number(process.argv[2]) || 8;
const wins: [number, number, number] = [0, 0, 0], reasons: Record<string, number> = {}, combos: Record<string, number> = {}, cls: Record<string, [number, number]> = {};
let rounds = 0, ms = 0;

for (let i = 0; i < battles; i++) {
  const r = mulberry32(100 + i);
  const map = MAP_ORDER[i % MAP_ORDER.length] ?? 'span';
  const teams: [MemberBuild[], MemberBuild[]] = [party(r), party(r)];
  let s: BattleState = createBattle({ map, starter: 0, teams }, r);
  const t0 = performance.now();
  const run = (cmds: Command[]) => {
    for (const cmd of cmds) {
      const res = apply(s, cmd);
      if (!res.ok) throw new Error(`${JSON.stringify(cmd)}: ${res.error}`);
      s = res.state;
      res.events.forEach((e: BattleEvent) => { if (e.type === 'combo') combos[e.name] = (combos[e.name] ?? 0) + 1; });
    }
  };
  for (let guard = 0; s.phase.kind !== 'over' && guard < 500; guard++) {
    if (s.phase.kind === 'order') run([{ kind: 'order', team: 0, order: aiOrder(s, 0, r) }, { kind: 'order', team: 1, order: aiOrder(s, 1, r) }]);
    else run(aiTurn(s, r));
  }
  ms += performance.now() - t0;
  if (s.phase.kind !== 'over') throw new Error(`battle ${i} did not finish`);
  const { winner, reason } = s.phase;
  wins[winner === 'draw' ? 2 : winner]++;
  rounds += s.round;
  reasons[reason] = (reasons[reason] ?? 0) + 1;
  if (winner !== 'draw') for (const m of teams[winner]) (cls[m.cls] ??= [0, 0])[0]++;
  for (const tm of teams) for (const m of tm) (cls[m.cls] ??= [0, 0])[1]++;
}
console.log('wins', wins, 'avg rounds', (rounds / battles).toFixed(1), 'avg ms', (ms / battles).toFixed(0), JSON.stringify(reasons));
console.log('combos', JSON.stringify(combos));
console.log('class win share', Object.entries(cls).map(([k, v]) => `${k} ${((100 * v[0]) / v[1]).toFixed(0)}%`).join(', '));
