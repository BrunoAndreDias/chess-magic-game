import { CLASSES, KEYSTONE_TIER, NODE, PAIRS, POINTS, TREES } from './tables';
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
  'hp',
  'fireDmg', 'callRange', 'burnDmg', 'twinStars', 'frostDmg', 'prisonCd', 'callWet', 'absZero',
  'recallRange', 'recallCleanse', 'benevolent',
  'leashDmg', 'threads', 'webOfFate', 'poisonDmg', 'basicDmg', 'biteHeal', 'feast',
  'cocoonCd', 'threadRange', 'webTurns', 'fateWeaver',
  'soulCap', 'soulShield', 'undying', 'soulBoltDmg', 'harvestRange', 'burstDmg', 'reap', 'riteRange', 'riteShield', 'ferryman',
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

/** The role of the path holding the keystone; else the path with the most points (first on a tie); else damage. */
export function roleOf(cls: ClassId, tree: readonly NodeId[]): Role {
  const points = [0, 0, 0];
  for (const id of tree) {
    const n = NODE[id];
    if (!n || n.cls !== cls) continue;
    if (n.tier === KEYSTONE_TIER) return TREES[cls][n.branch]?.role ?? 'damage';
    points[n.branch] = (points[n.branch] ?? 0) + 1;
  }
  let best = -1, most = 0;
  points.forEach((p, i) => { if (p > most) { most = p; best = i; } });
  return TREES[cls][best]?.role ?? 'damage';
}

export function partyBonuses(members: readonly { cls: ClassId; tree: readonly NodeId[] }[]): PartyBonuses {
  const count = new Map<ClassId, number>();
  for (const m of members) count.set(m.cls, (count.get(m.cls) ?? 0) + 1);
  const out = new Set<PartyBonusId>();
  for (const p of PAIRS) {
    const has = p.a === p.b ? (count.get(p.a) ?? 0) >= 2 : count.has(p.a) && count.has(p.b);
    if (has) out.add(p.id);
  }
  const roles = new Set<Role>(members.map(m => roleOf(m.cls, m.tree)));
  if (roles.has('tank') && roles.has('support') && roles.has('damage')) out.add('coverage');
  return out;
}

export function newMember(cls: ClassId, name: string): MemberBuild {
  const C = CLASSES[cls];
  return { name, cls, skills: C.defaults.slice(), tree: C.tree.slice() };
}
