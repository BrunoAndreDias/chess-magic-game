import { canDeploy, cheb, idx } from './board';
import { CLASSES, N } from './tables';
import type { Rng } from './rng';
import type { BattleState, MemberBuild, Pos, Team } from './types';

function depthOf(team: Team, z: number): number { return team === 0 ? z : N - 1 - z; }

export function aiDeploy(s: BattleState, team: Team, members: readonly MemberBuild[], rng: Rng): Pos[] {
  const pos: (Pos | null)[] = members.map(() => null), mid = (N - 1) / 2;
  const tankFirst = (i: number) => (CLASSES[members[i]?.cls ?? 'warden'].role === 'tank' ? 0 : 1);
  const order = members.map((_m, i) => i).sort((a, b) => tankFirst(a) - tankFirst(b));
  for (const i of order) {
    const cls = members[i]?.cls;
    let best: Pos | null = null, bs = -1e9;
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      if (!canDeploy(s, team, x, z) || pos.some(p => p && p.x === x && p.z === z)) continue;
      const d = depthOf(team, z), t = s.terr[idx(x, z)];
      let sc = rng() * 1.2 - Math.abs(x - mid) * 0.15;
      if (cls === 'warden') sc += d * 1.2;
      else if (cls === 'rogue') sc += d * 0.8 + (t === 'G' ? 3 : 0);
      else if (cls === 'cleric') sc += (d === 1 ? 1.5 : 0);
      else sc += (t === '^' ? 4 : 0) + (d === 1 ? 1 : 0);
      if (t === '~') sc -= 3;
      for (const p of pos) {
        if (!p) continue;
        const dd = cheb(p.x, p.z, x, z);
        if (dd === 1) sc += cls === 'cleric' ? 1.5 : 0.5;
        else if (dd > 3) sc -= 1;
      }
      if (sc > bs) { bs = sc; best = { x, z }; }
    }
    pos[i] = best;
  }
  return pos.map(p => { if (!p) throw new Error(`team ${team}: no deploy tile left`); return p; });
}
