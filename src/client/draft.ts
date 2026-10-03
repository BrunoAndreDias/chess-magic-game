import { CLASSES, CLASS_ORDER, MAP_ORDER, POINTS, TREES, canTake, newMember } from '../engine/index';
import type { BattleSetup, ClassId, ClassSkillId, MapId, MemberBuild, NodeId, Pos, Team } from '../engine/index';
import type { Seats } from '../host/match';

export const LOCAL = 'local';
type Timer = 0 | 20 | 30 | 45;
export const TIMERS: readonly Timer[] = [20, 30, 45, 0];

export interface Member extends MemberBuild { human: boolean }
/** Everything the setup screen edits. It outlives a battle, so Rematch and Change parties start from it. */
export interface Draft {
  teams: [Member[], Member[]];
  sel: { team: Team; slot: number };
  map: MapId;
  timer: Timer;
}

const NAMES: readonly [readonly string[], readonly string[]] = [['Aldric', 'Seren', 'Kip'], ['Morvath', 'Ysolde', 'Grix']];
const CLASSES_BY_TEAM: readonly [readonly ClassId[], readonly ClassId[]] = [['warden', 'wizard', 'cleric'], ['rogue', 'ranger', 'cleric']];

export function defaultDraft(opts: { allAi: boolean; map: MapId }): Draft {
  const team = (t: Team): Member[] => CLASSES_BY_TEAM[t].map((c, i) => ({ ...newMember(c, NAMES[t][i] ?? 'Hero'), human: t === 0 && !opts.allAi }));
  return { teams: [team(0), team(1)], sel: { team: 0, slot: 0 }, map: opts.map, timer: 30 };
}

export function selected(d: Draft): Member {
  const m = d.teams[d.sel.team][d.sel.slot];
  if (!m) throw new Error(`no member at ${d.sel.team}/${d.sel.slot}`);
  return m;
}

export function recommended(m: Member, cls: ClassId = m.cls): Member {
  const C = CLASSES[cls];
  return { ...m, cls, skills: C.defaults.slice(), tree: C.tree.slice() };
}

/** Picking a fourth skill drops the oldest pick; the last one can't be dropped. */
export function toggleSkill(m: Member, id: ClassSkillId): Member {
  if (m.skills.includes(id)) return m.skills.length > 1 ? { ...m, skills: m.skills.filter(s => s !== id) } : m;
  const keep = m.skills.length >= 3 ? m.skills.slice(1) : m.skills;
  return { ...m, skills: [...keep, id] };
}

export function randomMember(m: Member, rnd: () => number): Member {
  const cls = CLASS_ORDER[Math.floor(rnd() * CLASS_ORDER.length)] ?? 'warden', C = CLASSES[cls];
  const skills = C.skills.slice().sort(() => rnd() - 0.5).slice(0, 3);
  const tree: NodeId[] = [];
  for (let k = 0; k < 40 && tree.length < POINTS; k++) {
    const branch = TREES[cls][Math.floor(rnd() * 3)];
    const n = branch?.nodes.find(nd => canTake(cls, tree, nd.id));
    if (n) tree.push(n.id);
  }
  return { ...m, cls, skills, tree };
}

/** A battlefield at random, never `not`, so a redraw always changes the map. */
export function drawMap(rnd: () => number, not?: MapId): MapId {
  const pool = MAP_ORDER.filter(id => id !== not);
  return pool[Math.floor(rnd() * pool.length)] ?? 'span';
}

export function humanTeams(d: Draft): Team[] {
  return ([0, 1] as const).filter(t => d.teams[t].some(m => m.human));
}

function build(m: Member): MemberBuild { return { name: m.name.trim() || 'Hero', cls: m.cls, skills: m.skills.slice(), tree: m.tree.slice() }; }

export function battleSetup(d: Draft, deploy: [readonly Pos[], readonly Pos[]] | null): BattleSetup {
  return { map: d.map, starter: 0, teams: [d.teams[0].map(build), d.teams[1].map(build)], ...(deploy ? { deploy } : {}) };
}

export function seats(d: Draft): Seats {
  const seat = (m: Member) => (m.human ? { kind: 'player' as const, player: LOCAL } : { kind: 'ai' as const });
  return [d.teams[0].map(seat), d.teams[1].map(seat)];
}
