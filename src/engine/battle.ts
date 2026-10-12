import { aiDeploy } from './ai';
import { canUse, castTargets, cloneState, current, idx, nearestFree, reachable, validDeploy } from './board';
import { partyBonuses, modsOf } from './builds';
import { performCast, performMove } from './combat';
import type { Rng } from './rng';
import { CLASSES, COVERAGE, DOLL, N, PAIR_N, SKILL_PICKS, mapTerrain } from './tables';
import { endActivation, resumeQueue, startRound } from './turns';
import type { ApplyResult, BattleEvent, BattleSetup, BattleState, Command, SkillId, Team, TileFx, UnitId } from './types';

const TEAMS: readonly Team[] = [0, 1];

/** The one place a number becomes a UnitId. */
// SAFETY: createBattle numbers units 1..6 in order, and tests name those same numbers; nothing else mints an id.
export const unitId = (n: number): UnitId => n as UnitId;

export function createBattle(setup: BattleSetup, rng: Rng): BattleState {
  const s: BattleState = {
    map: setup.map,
    terr: mapTerrain(setup.map),
    fx: Array.from({ length: N * N }, (): TileFx | undefined => undefined),
    units: [],
    round: 1,
    starter: setup.starter,
    phase: { kind: 'ready' },
    party: [partyBonuses(setup.teams[0]), partyBonuses(setup.teams[1])],
    combos: [0, 0],
    favor: [0, 0],
    stats: { dmg: [0, 0], heal: [0, 0], downs: [0, 0], revives: [0, 0] },
    souls: [],
    calls: [],
    callRound: [0, 0],
  };

  let nextId = 1;

  for (const team of TEAMS) {
    const members = setup.teams[team], given = setup.deploy?.[team];
    const pos = validDeploy(s, team, given, members.length) ? given : aiDeploy(s, team, members, rng);
    members.forEach((m, slot) => {
      const C = CLASSES[m.cls], mods = modsOf(m.cls, m.tree), p = pos[slot];

      if (!p) throw new Error(`team ${team} slot ${slot}: no deploy tile`);
      const hp = C.hp + (mods.hp || 0) + (s.party[team].has('coverage') ? COVERAGE.hp : 0);
      s.units.push({
        id: unitId(nextId++), team, slot, name: m.name, cls: m.cls, skills: m.skills.slice(0, SKILL_PICKS), tree: m.tree.slice(), mods,
        x: p.x, z: p.z, hp, maxHp: hp, shield: 0, life: { kind: 'up' }, st: {}, cd: {}, moved: false, acted: false,
        souls: 0, took: 0,
      });
    });
  }

  // Each Marionettist's Doll stands next to it, numbered after every character.
  for (const o of s.units.slice()) {
    if (CLASSES[o.cls].innate !== 'strings') continue;
    const at = nearestFree(s, o.x, o.z), p = s.party[o.team];

    if (!at) continue;
    const hp = DOLL.hp + (o.mods.dollHp || 0) + (p.has('clockwork') ? PAIR_N.clockwork.hp : 0) + (p.has('troupe') ? PAIR_N.troupe.hp : 0);
    s.units.push({
      id: unitId(nextId++), team: o.team, slot: o.slot, name: `${o.name}'s Doll`, cls: o.cls, skills: [], tree: [], mods: {},
      x: at.x, z: at.z, hp, maxHp: hp, shield: 0, life: { kind: 'up' }, st: {}, cd: {}, moved: false, acted: false, souls: 0, took: 0, owner: o.id,
    });
  }

  return s;
}

function check(state: BattleState, cmd: Command): string | null {
  const ph = state.phase;

  if (cmd.kind === 'begin') return ph.kind === 'ready' ? null : `not the ready phase (${ph.kind})`;

  if (ph.kind !== 'act') return `not the act phase (${ph.kind})`;
  const u = current(state);

  if (!u || u.id !== cmd.unit) return `unit ${cmd.unit} is not the current unit`;

  if (cmd.kind === 'move') {
    if (u.moved) return 'already moved';

    if (!reachable(state, u).has(idx(cmd.to.x, cmd.to.z))) return `(${cmd.to.x}, ${cmd.to.z}) is not reachable`;
  }

  if (cmd.kind === 'cast') {
    if (!canUse(state, u, cmd.skill)) return `${cmd.skill} is not usable now`;

    if (!castTargets(state, u, cmd.skill).some(t => t.x === cmd.at.x && t.z === cmd.at.z)) return `(${cmd.at.x}, ${cmd.at.z}) is not a target of ${cmd.skill}`;
  }

  return null;
}

/** Applies one command to a copy of `state`. `state` itself is never changed. */
export function apply(state: BattleState, cmd: Command): ApplyResult {
  const error = check(state, cmd);

  if (error) return { ok: false, error };
  const s = cloneState(state);
  let events: BattleEvent[] | null = [];

  switch (cmd.kind) {
    case 'begin': startRound(s, events); break;
    case 'move': events = performMove(s, cmd.to.x, cmd.to.z); break;
    case 'cast': {
      events = performCast(s, cmd.skill, cmd.at.x, cmd.at.z);

      if (events && s.phase.kind === 'act' && current(s)?.id !== cmd.unit) events.push(...resumeQueue(s));
      break;
    }

    case 'endTurn': events = endActivation(s); break;
  }

  if (!events) return { ok: false, error: `${cmd.kind} rejected by the rules` };

  if (s.phase.kind === 'over' && state.phase.kind !== 'over') events.push({ type: 'over', winner: s.phase.winner, reason: s.phase.reason });

  return { ok: true, state: s, events };
}

/** The events a cast by the current unit would produce, without the cast itself. Null when illegal. */
export function predict(state: BattleState, skill: SkillId, tx: number, tz: number): BattleEvent[] | null {
  const ev = performCast(cloneState(state), skill, tx, tz);

  return ev ? ev.filter(e => e.type !== 'cast') : null;
}
