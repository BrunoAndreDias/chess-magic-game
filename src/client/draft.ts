import { CLASSES, MAP_ORDER, POINTS, SKILL_PICKS, TREES, lineup, newMember } from '../engine/index';
import type { BattleSetup, ClassId, ClassSkillId, MapId, MemberBuild, NodeId, PickState, Pos, Team } from '../engine/index';
import type { Seats } from '../host/match';

export const LOCAL = 'local';

type Timer = 0 | 20 | 30 | 45;

export const TIMERS: readonly Timer[] = [20, 30, 45, 0];

export interface Member extends MemberBuild { human: boolean }

/** Everything the draft screen edits. It outlives a battle, so Rematch and Change parties start from it. */
export interface Draft {
  /** Members in turn order: the pick phase reorders them. */
  teams: [Member[], Member[]];
  /** Opens and closes every round. */
  starter: Team;
  sel: { team: Team; slot: number };
  map: MapId;
  timer: Timer;
}

const NAMES: readonly [readonly string[], readonly string[]] = [['Aldric', 'Seren', 'Kip'], ['Morvath', 'Ysolde', 'Grix']];

const CLASSES_BY_TEAM: readonly [readonly ClassId[], readonly ClassId[]] = [['gravecaller', 'astromancer', 'bellringer'], ['bellringer', 'astromancer', 'gravecaller']];

export function defaultDraft(opts: { allAi: boolean; map: MapId; starter: Team }): Draft {
  const team = (t: Team): Member[] => CLASSES_BY_TEAM[t].map((c, i) => ({ ...newMember(c, NAMES[t][i] ?? 'Hero'), human: t === 0 && !opts.allAi }));

  return { teams: [team(0), team(1)], starter: opts.starter, sel: { team: 0, slot: 0 }, map: opts.map, timer: 30 };
}

export function drawStarter(rnd: () => number): Team { return rnd() < 0.5 ? 0 : 1; }

/** Each team in lineup order, playing its locked class. A member whose class changed starts from that class's recommended build. */
export function afterPicks(d: Draft, p: PickState): Draft {
  const team = (t: Team): Member[] => lineup(p, t).map(l => {
    const m = d.teams[t][l.member];

    if (!m) throw new Error(`no member ${l.member} on team ${t}`);

    return m.cls === l.cls ? m : recommended(m, l.cls);
  });

  return { ...d, teams: [team(0), team(1)], starter: p.starter, sel: { team: humanTeams(d)[0] ?? 0, slot: 0 } };
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

/** Picking a skill past SKILL_PICKS drops the oldest pick; the last one can't be dropped. */
export function toggleSkill(m: Member, id: ClassSkillId): Member {
  if (m.skills.includes(id)) return m.skills.length > 1 ? { ...m, skills: m.skills.filter(s => s !== id) } : m;
  const keep = m.skills.length >= SKILL_PICKS ? m.skills.slice(1) : m.skills;

  return { ...m, skills: [...keep, id] };
}

/** SKILL_PICKS random skills of its class, a keystone path and the other 2 points in a second path. */
export function randomMember(m: Member, rnd: () => number): Member {
  const cls = m.cls, C = CLASSES[cls];
  const skills = C.skills.slice().sort(() => rnd() - 0.5).slice(0, SKILL_PICKS);
  const paths = TREES[cls], key = Math.floor(rnd() * paths.length), dip = (key + 1 + Math.floor(rnd() * (paths.length - 1))) % paths.length;
  const tree: NodeId[] = [...(paths[key]?.nodes ?? []), ...(paths[dip]?.nodes ?? [])].map(n => n.id).slice(0, POINTS);

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
  const setup: BattleSetup = { map: d.map, starter: d.starter, teams: [d.teams[0].map(build), d.teams[1].map(build)] };

  if (deploy) setup.deploy = deploy;

  return setup;
}

export function seats(d: Draft): Seats {
  const seat = (m: Member) => (m.human ? { kind: 'player' as const, player: LOCAL } : { kind: 'ai' as const });

  return [d.teams[0].map(seat), d.teams[1].map(seat)];
}
