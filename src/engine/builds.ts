import { CLASSES, NODE, PAIRS, POINTS, TREES } from './tables';
import type { ClassId, MemberBuild, Mods, NodeId, PartyBonusId, PartyBonuses, Role } from './types';

function prereqTaken(cls: ClassId, picks: readonly NodeId[], id: NodeId): boolean {
  const n = NODE[id];
  if (!n || n.cls !== cls) return false;
  const before = TREES[cls][n.branch]?.nodes[n.tier - 1];
  return n.tier === 0 || (!!before && picks.includes(before.id));
}

export function treeValid(cls: ClassId, picks: readonly NodeId[]): boolean {
  if (picks.length > POINTS) return false;
  return picks.every(id => prereqTaken(cls, picks, id));
}

export function canTake(cls: ClassId, picks: readonly NodeId[], id: NodeId): boolean {
  return !picks.includes(id) && picks.length < POINTS && prereqTaken(cls, picks, id);
}

export function canDrop(cls: ClassId, picks: readonly NodeId[], id: NodeId): boolean {
  const n = NODE[id];
  if (!n) return false;
  const next = TREES[cls][n.branch]?.nodes[n.tier + 1];
  return picks.includes(id) && !(next && picks.includes(next.id));
}

type ModKey = keyof Mods;
const MOD_KEYS = [
  'hp', 'guardShield', 'stunImmune', 'move', 'pushDist', 'juggernaut', 'dmg', 'exposeOnTaunt', 'rally',
  'burnDmg', 'fireDmg', 'wildfire', 'rootTurns', 'frostDmg', 'deepFreeze', 'range', 'chain', 'overcharge',
  'markTurns', 'predator', 'markAmt', 'highDmg', 'deadeye', 'basicDmg', 'hitrun',
  'heal', 'reviveHp', 'lifeline', 'judgCd', 'crusade', 'sanctShield', 'martyr',
  'opportunist', 'executioner', 'grasswalk', 'vanish', 'poisonDmg', 'poisonTurns', 'venom',
] satisfies ModKey[];
type Assert<T extends true> = T;
export type EveryModKeyListed = Assert<[Exclude<ModKey, (typeof MOD_KEYS)[number]>] extends [never] ? true : false>;

export function modsOf(cls: ClassId, picks: readonly NodeId[]): Mods {
  const m: Mods = {};
  for (const id of picks) {
    const n = NODE[id];
    if (!n || n.cls !== cls) continue;
    for (const key of MOD_KEYS) {
      const v = n.mods[key];
      if (v !== undefined) m[key] = (m[key] ?? 0) + v;
    }
  }
  return m;
}

export function partyBonuses(members: readonly { cls: ClassId }[]): PartyBonuses {
  const classes = new Set(members.map(m => m.cls));
  const out = new Set<PartyBonusId>();
  for (const p of PAIRS) if (classes.has(p.a) && classes.has(p.b)) out.add(p.id);
  const roles = new Set<Role>(members.map(m => CLASSES[m.cls].role));
  if (roles.has('tank') && roles.has('support') && roles.has('damage')) out.add('trinity');
  return out;
}

export function newMember(cls: ClassId, name: string): MemberBuild {
  const C = CLASSES[cls];
  return { name, cls, skills: C.defaults.slice(), tree: C.tree.slice() };
}
