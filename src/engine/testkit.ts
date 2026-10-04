import { apply, createBattle } from './battle';
import { mulberry32 } from './rng';
import type { BattleEvent, BattleState, ClassId, ClassSkillId, Command, Life, MapId, MemberBuild, NodeId, SkillId, Team, TerrainChar, Turn, UnitId } from './types';
import { CLASSES, N } from './tables';

export const uid = (n: number) => n as UnitId;

/** A queue of turns; ids after `'+'` are extra turns. */
export const turns = (...ids: (number | '+')[]): Turn[] => {
  let extra = false;

  return ids.flatMap(n => (n === '+' ? ((extra = true), []) : [{ id: uid(n), extra }]));
};

/** A bare member: default skills, no passive picks, so damage numbers are the skill's base numbers. */
export function bare(cls: ClassId, skills: readonly ClassSkillId[] = CLASSES[cls].defaults, tree: readonly NodeId[] = []): MemberBuild {
  return { name: `${cls}`, cls, skills, tree };
}

/**
 * A battle deployed in each team's back row, ids numbered team 0 first.
 * `place` then moves units anywhere (by id), `life`/`hp` override their condition, `terr` repaints tiles and `round` skips ahead, to stage a scene.
 */
export function stage(opts: {
  a: MemberBuild[]; b: MemberBuild[]; map?: MapId; starter?: Team;
  place?: Record<number, [number, number]>; hp?: Record<number, number>; life?: Record<number, Life>;
  terr?: [number, number, TerrainChar][]; round?: number;
}): BattleState {
  const s = createBattle({
    map: opts.map ?? 'storm', starter: opts.starter ?? 0, teams: [opts.a, opts.b],
    deploy: [opts.a.map((_, i) => ({ x: i, z: 0 })), opts.b.map((_, i) => ({ x: i, z: 11 }))],
  }, mulberry32(1));

  for (const u of s.units) {
    const p = opts.place?.[u.id], hp = opts.hp?.[u.id], life = opts.life?.[u.id];

    if (p) [u.x, u.z] = p;

    if (hp !== undefined) u.hp = hp;

    if (life) { u.life = life; if (life.kind !== 'up') u.hp = 0; }
  }

  for (const [x, z, t] of opts.terr ?? []) s.terr[z * N + x] = t;

  if (opts.round) s.round = opts.round;

  return s;
}

/** Applies each command in turn; throws on the first rejection. */
export function run(state: BattleState, ...cmds: Command[]): { state: BattleState; events: BattleEvent[] } {
  let s = state;
  const events: BattleEvent[] = [];

  for (const cmd of cmds) {
    const r = apply(s, cmd);

    if (!r.ok) throw new Error(`${JSON.stringify(cmd)} rejected: ${r.error}`);
    s = r.state;
    events.push(...r.events);
  }

  return { state: s, events };
}

export const begin: Command = { kind: 'begin' };

export const end = (id: number): Command => ({ kind: 'endTurn', unit: uid(id) });

export const cast = (id: number, skill: SkillId, x: number, z: number): Command =>
  ({ kind: 'cast', unit: uid(id), skill, at: { x, z } });

export const move = (id: number, x: number, z: number): Command => ({ kind: 'move', unit: uid(id), to: { x, z } });

export function unit(s: BattleState, id: number) {
  const u = s.units.find(v => v.id === id);

  if (!u) throw new Error(`no unit ${id}`);

  return u;
}
