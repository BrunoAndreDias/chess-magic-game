import type {
  CallSkill, ClassId, ClassSkillId, ComboName, InnateSkillId, MapId, Mods, NodeId, PairId, Role, SkillId, SkillTarget, StatusKey, TerrainChar,
} from './types';

export const N = 12;

export const DEPLOY_ROWS = 3;

export const MAX_ROUNDS = 20;

export const BLEED = 2;

export const POINTS = 6;

export const DARK_ROUND = 8;

/** Rounds a Soul lies on the ground. */
export const SOUL_ROUNDS = 3;

/** One hit at least this big (after shields) drops a Soul. */
export const SOUL_HIT = 20;

export const DIR4: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const DIR8: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export interface TerrainDef { name: string; solid?: true; sight?: true; pit?: true; cost?: number; text?: string }

// '.' floor  '#' wall  'o' chasm  '~' water  'G' tall grass  '^' high ground  'B' brazier  '+' shrine  'I' ice  'A' altar
const TERRAIN_TABLE = {
  '.': { name: 'Floor' },
  '#': { name: 'Wall', solid: true, sight: true, text: 'Blocks movement and line of sight.' },
  'o': { name: 'Chasm', solid: true, pit: true, text: 'Impassable. A character pushed in falls and is Downed, clinging to the nearest edge.' },
  '~': { name: 'Water', cost: 2, text: 'Costs 2 move. Standing in it makes you Wet: Thunderhead Conducts (×1.5), Frostbolt Freezes (stun). Puts out burning.' },
  'G': { name: 'Tall grass', text: 'Hides whoever stands in it: enemies can only target them from 2 tiles, or when one of their allies is next to them. Burns.' },
  '^': { name: 'High ground', text: 'Ranged attacks from here get +1 range and +15% damage against targets below.' },
  'B': { name: 'Brazier', solid: true, text: 'Solid. Hit it with fire, or push someone into it, and it bursts: fire on the 8 tiles around.' },
  '+': { name: 'Shrine', text: 'End your turn here to heal 12.' },
  'I': { name: 'Ice', text: 'Frozen water: walk on it freely, no Wet.' },
  'A': { name: 'Sun Altar', text: 'At the end of each round, the party with more characters standing here gains 1 favor. 5 favor wins the battle.' },
} satisfies Record<TerrainChar, TerrainDef>;

export const TERRAIN: Readonly<Record<TerrainChar, TerrainDef>> = TERRAIN_TABLE;

export interface StormLine { name: string; cols?: readonly number[]; rows?: readonly number[] }

/** What the map does at the end of each round. Fully known in advance: no dice. */
export type MapRule =
  /** `rounds` uses the map's own rows layout: a digit is the round at whose end the tile falls, '.' never falls. */
  | { kind: 'crumble'; rounds: readonly string[]; names: Readonly<Partial<Record<number, string>>> }
  /** Round r strikes `cycle[(r - 1) % cycle.length]`. */
  | { kind: 'storm'; dmg: number; cycle: readonly StormLine[] }
  | { kind: 'altar'; goal: number };

export interface MapDef {
  id: MapId; name: string; rows: readonly string[]; rule: MapRule;
  /** One line under the name: what the map does. */
  tagline: string;
  /** How the rule works, for the map reveal and the scout panel. */
  ruleText: string;
  /** Which builds and plays it rewards. */
  favors: string;
}

// maps are 180°-symmetric: rows 6..11 are rows 5..0 reversed
const MAP_TABLE = {
  span: { id: 'span', name: 'Shattered Span',
    rows: ['.....oo.....', '.#........#.', '...^....^...', 'o.oo....oo.o', 'o.o.#..B.o.o', 'o.o......o.o'],
    rule: { kind: 'crumble', rounds: ['555555555555', '777777777777', '999999999999', '.3........3.', '.3........3.', '.3........3.'],
      names: { 3: 'The side bridges crumble', 5: 'The back rows crumble', 7: 'The back rows crumble', 9: 'The plateaus crumble' } },
    tagline: 'The edges fall away. Only the island lasts.',
    ruleText: 'Crumble: at the end of round 3 the side bridges fall, then the back rows at the end of rounds 5, 7 and 9. Anyone standing on a falling tile drops and is Downed, clinging to the nearest solid ground; anyone already Downed there is lost.',
    favors: 'Pullers and the patient: Reel and Gravity Well drop enemies off the edge, and a Root or Stun at the right moment leaves them on a tile about to fall.' },
  storm: { id: 'storm', name: 'Storm Court',
    rows: ['............', '..#......#..', '............', '.~~..^...~~.', '.~~.#..#.~~.', '.....~~....+'],
    rule: { kind: 'storm', dmg: 24, cycle: [
      { name: 'The edges', cols: [0, 1, 10, 11] },
      { name: 'The center', cols: [5, 6] },
      { name: 'The midline', rows: [5, 6] },
      { name: 'The backlines', rows: [0, 1, 10, 11] }] },
    tagline: 'Lightning strikes known lines at the end of every round.',
    ruleText: 'Storm: at the end of each round lightning strikes, in a fixed cycle, the edges (columns 1-2 and 11-12), the center columns, the midline, then the backlines. Anyone standing there takes 24, 36 if Wet, and the Downed are finished.',
    favors: 'Control: Root, Stun or push an enemy into the next strike after it has moved. Wet targets take half again. Plan your turn order so nobody is caught.' },
  altar: { id: 'altar', name: 'Sun Altar',
    rows: ['............', '.GG......GG.', '....#..#....', '.G........G.', '.GG.B^..^GG.', '#....AA....#'],
    rule: { kind: 'altar', goal: 5 },
    tagline: 'Hold the altar. Five rounds of favor wins.',
    ruleText: 'Altar: at the end of each round, the party with more characters standing on the Sun Altar gains 1 favor. Ties gain nothing. The first party to 5 favor wins at once.',
    favors: 'Tanks and area control: a Meteor on the altar makes holders leave or eat it, Puppet Strings walks them off, and grass on the flanks hides the ambush.' },
} satisfies Record<MapId, MapDef>;

export const MAPS: Readonly<Record<MapId, MapDef>> = MAP_TABLE;

export const MAP_ORDER: readonly MapId[] = ['span', 'storm', 'altar'];

const TERRAIN_CHARS = new Set<string>(Object.keys(TERRAIN));

function isTerrainChar(c: string): c is TerrainChar { return TERRAIN_CHARS.has(c); }

/** The full N×N grid of a half-map layout (rows 0..5), row-major: rows 6..11 are rows 5..0 reversed. */
export function mirrored(half: readonly string[]): string[] {
  const out: string[] = [];

  for (const row of half) out.push(...row);

  for (let z = half.length - 1; z >= 0; z--) out.push(...(half[z] ?? '').split('').reverse());

  return out;
}

/** The full N×N base terrain of a map, row-major. */
export function mapTerrain(id: MapId): TerrainChar[] {
  return mirrored(MAPS[id].rows).map(c => {
    if (!isTerrainChar(c)) throw new Error(`map ${id}: unknown terrain '${c}'`);

    return c;
  });
}

export interface ClassDef {
  id: ClassId; name: string; icon: string; color: string; hp: number; move: number;
  /** One line: the class mechanic. */
  mechanic: string;
  plays: string; basic: { name: string; range: number; dmg: number }; innate: InnateSkillId;
  skills: readonly ClassSkillId[]; defaults: readonly ClassSkillId[]; tree: readonly NodeId[];
}

export const CLASSES = {
  astromancer: { id: 'astromancer', name: 'Astromancer', icon: '☄️', color: '#9a8cff', hp: 140, move: 3, innate: 'snap',
    mechanic: 'Calls: the big spells land at the start of your next turn.',
    plays: 'The battle mage whose big spells fall from the sky, where the enemy will be.', basic: { name: 'Starbolt', range: 4, dmg: 10 },
    skills: ['meteor', 'thunderhead', 'gravitywell', 'frostbolt', 'firebolt', 'prison', 'recall'], defaults: ['meteor', 'frostbolt', 'gravitywell'],
    tree: ['a_fire', 'a_range', 'a_burn', 'a_twin', 'a_frost', 'a_prison'] },
  weaver: { id: 'weaver', name: 'Weaver', icon: '🕸️', color: '#d06a9a', hp: 170, move: 3, innate: 'tether',
    mechanic: 'Threads: tie up to 3 units, then pull, leash or share damage along them.',
    plays: 'A spider-kin who ties the battlefield together with silk.', basic: { name: 'Fang', range: 1, dmg: 14 },
    skills: ['reel', 'web', 'cocoon', 'venombite', 'puppet', 'sharedpain', 'skitter'], defaults: ['reel', 'web', 'venombite'],
    tree: ['w_hp', 'w_leash', 'w_thread', 'w_fate', 'w_poison', 'w_fang'] },
  gravecaller: { id: 'gravecaller', name: 'Gravecaller', icon: '💀', color: '#9fe0b8', hp: 160, move: 3, innate: 'harvest',
    mechanic: 'Souls: hard hits and Downs drop Souls; gather them and spend them on Rites.',
    plays: 'A bone priest who ferries souls, raising the fallen and reaping the dying.', basic: { name: 'Bone Lash', range: 2, dmg: 12 },
    skills: ['lastrites', 'bonewall', 'wither', 'soulbolt', 'soulburst', 'siphon', 'equalize'], defaults: ['soulbolt', 'lastrites', 'siphon'],
    tree: ['g_bolt', 'g_reach', 'g_burst', 'g_reap', 'g_hp', 'g_cap'] },
  bellringer: { id: 'bellringer', name: 'Bellringer', icon: '🔔', color: '#e0b04a', hp: 175, move: 3, innate: 'toll',
    mechanic: 'Toll: move a unit’s turn in this round’s queue.',
    plays: 'A monk with a great bronze bell on its back, who calls the hour.', basic: { name: 'Clapper', range: 1, dmg: 15 },
    skills: ['knell', 'hush', 'peal', 'encore', 'overture', 'hourglass', 'bellguard'], defaults: ['knell', 'hush', 'peal'],
    tree: ['b_knell', 'b_last', 'b_peal', 'b_final', 'b_hp', 'b_clapper'] },
} satisfies Record<ClassId, ClassDef>;

export const CLASS_ORDER: readonly ClassId[] = ['astromancer', 'weaver', 'gravecaller', 'bellringer'];

// ---------- passive trees: 3 paths of 4 (three nodes, then a keystone). A node needs the one before it ----------
export interface NodeDef { id: NodeId; name: string; key?: true; text: string; mods: Mods }

export interface BranchDef { name: string; role: Role; color: string; nodes: readonly [NodeDef, NodeDef, NodeDef, NodeDef] }

const TREE_TABLE = {
  astromancer: [
    { name: 'Rime', role: 'tank', color: '#7fd8ff', nodes: [
      { id: 'a_frost', name: 'Hoarfrost', text: 'Frost +20% damage.', mods: { frostDmg: 0.2 } },
      { id: 'a_prison', name: 'Cold Cell', text: 'Glacial Prison cooldown −1.', mods: { prisonCd: 1 } },
      { id: 'a_wet', name: 'Sleet', text: 'Your Calls make everyone they hit Wet.', mods: { callWet: 1 } },
      { id: 'a_zero', name: 'Absolute Zero', key: true, text: 'Units Rooted or Encased when your Call lands are Stunned by it, and Glacial Prison holds an enemy 2 turns.', mods: { absZero: 1 } }] },
    { name: 'Pyre', role: 'damage', color: '#ff6a2b', nodes: [
      { id: 'a_fire', name: 'Kindling', text: 'Fire +20% damage.', mods: { fireDmg: 0.2 } },
      { id: 'a_range', name: 'Far Sight', text: 'Call range +1.', mods: { callRange: 1 } },
      { id: 'a_burn', name: 'Searing', text: 'Burning deals +3 a turn.', mods: { burnDmg: 3 } },
      { id: 'a_twin', name: 'Twin Stars', key: true, text: 'You can hold two Calls at once.', mods: { twinStars: 1 } }] },
    { name: 'Orrery', role: 'support', color: '#ffe08a', nodes: [
      { id: 'a_recall', name: 'Long Orbit', text: 'Recall range +2.', mods: { recallRange: 2 } },
      { id: 'a_hp', name: 'Starward', text: '+25 max HP.', mods: { hp: 25 } },
      { id: 'a_cleanse', name: 'Clean Return', text: 'Recall also cleanses debuffs.', mods: { recallCleanse: 1 } },
      { id: 'a_benev', name: 'Benevolent Heavens', key: true, text: 'Your Calls heal allies in their area for a quarter of what they’d deal, instead of hurting them.', mods: { benevolent: 1 } }] }],
  weaver: [
    { name: 'Matriarch', role: 'tank', color: '#d06a9a', nodes: [
      { id: 'w_hp', name: 'Chitin', text: '+30 max HP.', mods: { hp: 30 } },
      { id: 'w_leash', name: 'Short Leash', text: 'Enemies you hold deal 20% less damage to everyone but you.', mods: { leashDmg: 0.2 } },
      { id: 'w_thread', name: 'Many Hands', text: '+1 Thread.', mods: { threads: 1 } },
      { id: 'w_fate', name: 'Web of Fate', key: true, text: 'Start each turn with a 10 shield per Thread you hold. An enemy you hold that ends its turn more than 2 from you is pulled back to 2 and takes 12.', mods: { webOfFate: 1 } }] },
    { name: 'Widow', role: 'damage', color: '#8fe36b', nodes: [
      { id: 'w_poison', name: 'Virulence', text: 'Poison +3 a turn.', mods: { poisonDmg: 3 } },
      { id: 'w_fang', name: 'Long Fangs', text: 'Fang +10 damage.', mods: { basicDmg: 10 } },
      { id: 'w_bite', name: 'Drink Deep', text: 'Venom Bite heals you 8.', mods: { biteHeal: 8 } },
      { id: 'w_feast', name: 'Feast', key: true, text: 'Reel pulls enemies all the way to you, and you bite each one that arrives next to you for 12 and Poison.', mods: { feast: 1 } }] },
    { name: 'Spinner', role: 'support', color: '#b8e0ff', nodes: [
      { id: 'w_cocoon', name: 'Quick Silk', text: 'Cocoon cooldown −1.', mods: { cocoonCd: 1 } },
      { id: 'w_reach', name: 'Long Line', text: 'Tether range +2 and +20 max HP.', mods: { threadRange: 2, hp: 20 } },
      { id: 'w_silk', name: 'Strong Silk', text: 'Webs last 2 rounds longer.', mods: { webTurns: 2 } },
      { id: 'w_spare', name: 'Fate Weaver', key: true, text: 'The first time you or an ally you hold would be Downed, it is Encased at 1 HP instead.', mods: { fateWeaver: 1 } }] }],
  gravecaller: [
    { name: 'Lich', role: 'tank', color: '#9fe0b8', nodes: [
      { id: 'g_hp', name: 'Grave Flesh', text: '+25 max HP.', mods: { hp: 25 } },
      { id: 'g_cap', name: 'Deep Pockets', text: 'Hold 1 more Soul.', mods: { soulCap: 1 } },
      { id: 'g_ward', name: 'Soul Ward', text: 'Start your turn with a 6 shield for each Soul you hold.', mods: { soulShield: 6 } },
      { id: 'g_undying', name: 'Undying', key: true, text: 'While Downed you still take turns: move 1, then one skill but not your basic. Each Downed turn spends a held Soul instead of bleeding; with none, you bleed as normal.', mods: { undying: 1 } }] },
    { name: 'Reaper', role: 'damage', color: '#c06aff', nodes: [
      { id: 'g_bolt', name: 'Sharp Bones', text: 'Soul Bolt +4 damage.', mods: { soulBoltDmg: 4 } },
      { id: 'g_reach', name: 'Long Scythe', text: 'Harvest range +2.', mods: { harvestRange: 2 } },
      { id: 'g_burst', name: 'Overflow', text: 'Soul Burst +8 damage.', mods: { burstDmg: 8 } },
      { id: 'g_reap', name: 'Reap', key: true, text: 'Enemies a hit of yours leaves at 20% HP or less are Downed at once (REAP), and every Down you cause hands you its Soul directly.', mods: { reap: 1 } }] },
    { name: 'Psychopomp', role: 'support', color: '#fff3b0', nodes: [
      { id: 'g_rites', name: 'Far Call', text: 'Last Rites range +2.', mods: { riteRange: 2 } },
      { id: 'g_hp2', name: 'Pale Robes', text: '+20 max HP.', mods: { hp: 20 } },
      { id: 'g_shield', name: 'Safe Passage', text: 'Allies you stand up get a 20 shield.', mods: { riteShield: 20 } },
      { id: 'g_ferry', name: 'Ferryman', key: true, text: 'Downed allies within 2 of you don’t bleed, and anyone in your party who stands an ally up (Help Up or Last Rites) brings it back at 60% HP.', mods: { ferryman: 1 } }] }],
  bellringer: [
    { name: 'Carillon', role: 'tank', color: '#e0b04a', nodes: [
      { id: 'b_hp', name: 'Bronze Frame', text: '+30 max HP.', mods: { hp: 30 } },
      { id: 'b_clapper', name: 'Heavy Clapper', text: 'Clapper +6 damage.', mods: { basicDmg: 6 } },
      { id: 'b_guard', name: 'Thick Bell', text: 'Bell Guard +15 shield.', mods: { guardShield: 15 } },
      { id: 'b_thee', name: 'Toll for Thee', key: true, text: 'Enemies you Toll are Hushed on their moved turn, and Toll’s cooldown −1.', mods: { tollHush: 1, tollCd: 1 } }] },
    { name: 'Herald', role: 'damage', color: '#ff8a4a', nodes: [
      { id: 'b_knell', name: 'Deep Knell', text: 'Knell +6 damage.', mods: { knellDmg: 6 } },
      { id: 'b_last', name: 'Last Word', text: '+20% damage when you’re the last of your party to act this round.', mods: { lastDmg: 0.2 } },
      { id: 'b_peal', name: 'Loud Peal', text: 'Peal +3 damage.', mods: { pealDmg: 3 } },
      { id: 'b_final', name: 'Final Hour', key: true, text: 'Toll can target you before you move or act: your turn moves to the end of the round, and a turn you take last in the round deals +50% damage.', mods: { finalHour: 0.5 } }] },
    { name: 'Conductor', role: 'support', color: '#8fd1ff', nodes: [
      { id: 'b_reach', name: 'Far Toll', text: 'Toll range +2.', mods: { tollRange: 2 } },
      { id: 'b_encore', name: 'Swift Encore', text: 'Encore cooldown −1.', mods: { encoreCd: 1 } },
      { id: 'b_hp2', name: 'Steady Hands', text: '+20 max HP.', mods: { hp: 20 } },
      { id: 'b_accel', name: 'Accelerando', key: true, text: 'Allies you Toll get +2 move and a 15 shield on that turn, and Toll’s cooldown −1.', mods: { accel: 1, tollCd: 1 } }] }],
} satisfies Record<ClassId, readonly [BranchDef, BranchDef, BranchDef]>;

export const TREES: Readonly<Record<ClassId, readonly [BranchDef, BranchDef, BranchDef]>> = TREE_TABLE;

type Assert<T extends true> = T;

type NoMissing<All, Listed> = [Exclude<All, Listed>] extends [never] ? true : false;

export type EveryNodeInATree = Assert<NoMissing<NodeId, (typeof TREE_TABLE)[ClassId][number]['nodes'][number]['id']>>;

export interface NodeInfo extends NodeDef { cls: ClassId; branch: number; tier: number }

export const NODE: Partial<Record<NodeId, NodeInfo>> = {};

for (const cls of CLASS_ORDER) TREES[cls].forEach((b, branch) => b.nodes.forEach((n, tier) => { NODE[n.id] = { ...n, cls, branch, tier }; }));

export const KEYSTONE_TIER = 3;

// ---------- party resonances: every pair of classes in the party, and every class taken twice ----------
export interface PairDef { id: PairId; a: ClassId; b: ClassId; name: string; text: string }

const PAIR_TABLE = [
  { id: 'startether', a: 'astromancer', b: 'weaver', name: 'Star-Tether', text: 'An enemy held by your Weaver when your Call hits it is Exposed for 2 turns.' },
  { id: 'seconddawn', a: 'astromancer', b: 'gravecaller', name: 'Second Dawn', text: 'A Recall that lands on a Downed ally stands it back up at the HP it had when you cast.' },
  { id: 'appointedhour', a: 'astromancer', b: 'bellringer', name: 'Appointed Hour', text: 'An enemy Tolled while standing in one of your pending Calls’ areas is Rooted.' },
  { id: 'soulsilk', a: 'weaver', b: 'gravecaller', name: 'Soul Silk', text: 'Last Rites and Siphon reach any ally your Weaver holds, at any range.' },
  { id: 'clockworksilk', a: 'weaver', b: 'bellringer', name: 'Clockwork Silk', text: 'Toll reaches any unit your Weaver holds, at any range.' },
  { id: 'deathknell', a: 'gravecaller', b: 'bellringer', name: 'Death Knell', text: 'Downed enemies lose 2 bleed a turn instead of 1.' },
  { id: 'conjunction', a: 'astromancer', b: 'astromancer', name: 'Conjunction', text: 'A Call that lands in a round where another of your Calls already landed deals +25%.' },
  { id: 'greatweb', a: 'weaver', b: 'weaver', name: 'Great Web', text: '+1 Thread each, and your webs last 1 round longer.' },
  { id: 'charnel', a: 'gravecaller', b: 'gravecaller', name: 'Charnel House', text: 'Souls last 2 rounds longer, and each Gravecaller holds 1 more.' },
  { id: 'pealofbells', a: 'bellringer', b: 'bellringer', name: 'Peal of Bells', text: 'Each Bellringer’s Toll gets +1 range and −1 cooldown. A unit still can’t be Tolled twice in a round.' },
] satisfies readonly PairDef[];

export const PAIRS: readonly PairDef[] = PAIR_TABLE;

export type EveryPairListed = Assert<NoMissing<PairId, (typeof PAIR_TABLE)[number]['id']>>;

export const COVERAGE: { id: 'coverage'; name: string; text: string } = { id: 'coverage', name: 'Role Coverage', text: 'A tank, a damage and a support path: +40 max HP for everyone.' };

// ---------- statuses: durations count the owner's turns and tick down at the end of each of them ----------
export interface StatusDef { name: string; icon: string; color: string; bad?: true; text: string }

const STATUS_TABLE = {
  stun: { name: 'Stunned', icon: '💫', color: '#ffd36b', bad: true, text: 'Loses its next turn.' },
  root: { name: 'Rooted', icon: '🌿', color: '#8fe36b', bad: true, text: 'Can’t move on its next turn.' },
  wet: { name: 'Wet', icon: '💧', color: '#4fb3ff', bad: true, text: 'Thunderhead Conducts (×1.5), Frostbolt Freezes (stun). Can’t burn.' },
  burn: { name: 'Burning', icon: '🔥', color: '#ff7a3a', bad: true, text: 'Takes fire damage at the start of its turn. Breaks Threads.' },
  poison: { name: 'Poisoned', icon: '☠️', color: '#8fe36b', bad: true, text: 'Takes poison damage at the start of its turn.' },
  expose: { name: 'Exposed', icon: '🩸', color: '#ff8a8a', bad: true, text: 'Takes +25% damage.' },
  encased: { name: 'Encased', icon: '🧊', color: '#b8e8ff', text: 'Skips its turn, can’t be damaged or moved.' },
  share: { name: 'Shared Pain', icon: '🕸️', color: '#d06a9a', text: 'Half the damage to the allies it holds comes to it instead.' },
  wither: { name: 'Withered', icon: '🥀', color: '#b89a6a', bad: true, text: 'Can’t be healed or shielded. A hit that leaves it at 20% HP or less Downs it (REAP).' },
  hush: { name: 'Hushed', icon: '🔇', color: '#c8b4ff', bad: true, text: 'Can move and use its basic attack, nothing else. Free skills included.' },
  guard: { name: 'Bell Guard', icon: '🛎️', color: '#e0b04a', text: 'Until its next turn, enemies that hit it are Hushed.' },
  haste: { name: 'Quickened', icon: '💨', color: '#8fd1ff', text: '+2 move on its next turn.' },
} satisfies Record<StatusKey, StatusDef>;

export const STATUS: Readonly<Record<StatusKey, StatusDef>> = STATUS_TABLE;

// ---------- skills ----------
export interface SkillDef {
  name: string; icon: string; target: SkillTarget; range?: number; cd: number; los?: true; aoe?: number; color?: string;
  sets?: readonly string[]; pays?: readonly string[]; map?: true; empty?: true; noSelf?: true; free?: true; generic?: true; basic?: true;
  /** Marks its area now and lands at the start of the caster's next activation. */
  call?: true;
  /** Costs one held Soul, and can't be cast without one. */
  rite?: true;
  innate?: true;
  cls?: ClassId; text: string;
}

function basicSkill(cls: ClassId): SkillDef {
  const b = CLASSES[cls].basic, ranged = b.range > 1;

  return { name: b.name, icon: ranged ? '✦' : '⚔️', target: 'enemy', range: b.range, ...(ranged ? { los: true } : {}), cd: 0, basic: true, cls, color: '#e8e2d0',
    text: `${ranged ? 'Ranged attack' : 'Melee attack'} for ${b.dmg}. Finishes Downed enemies.` };
}

const SKILL_TABLE = {
  snap: { name: 'Snap', icon: '✨', target: 'self', cd: 3, free: true, innate: true, cls: 'astromancer', color: '#9a8cff',
    text: 'Free. Your oldest pending Call lands right now, at half power.' },
  meteor: { name: 'Meteor', icon: '☄️', target: 'tile', range: 6, cd: 3, aoe: 1, call: true, map: true, cls: 'astromancer', color: '#ff6a2b', sets: ['Burning'],
    text: 'Call. 30 at the center, 15 around, and Burning. Ignites grass, bursts braziers, burns webs.' },
  thunderhead: { name: 'Thunderhead', icon: '⛈️', target: 'tile', range: 5, cd: 2, aoe: 1, call: true, cls: 'astromancer', color: '#c9a7ff', pays: ['Wet → CONDUCT ×1.5'],
    text: 'Call. 20 shock to everyone in a 3×3 area. Wet: CONDUCT, ×1.5.' },
  gravitywell: { name: 'Gravity Well', icon: '🌀', target: 'tile', range: 5, cd: 3, aoe: 2, call: true, map: true, cls: 'astromancer', color: '#7a6aff', sets: ['Slam → Stun', 'Abyss → Downed'],
    text: 'Call. Everyone within 2 of the center is pulled 2 toward it, nearest first. Into a wall or unit: SLAM. Into a chasm: ABYSS.' },
  frostbolt: { name: 'Frostbolt', icon: '❄️', target: 'enemy', range: 4, los: true, cd: 2, cls: 'astromancer', color: '#7fd8ff', sets: ['Rooted'], pays: ['Wet → FREEZE (stun)'], map: true,
    text: '12 and Rooted. Against Wet: FREEZE, stunned instead. Freezes water within 1.' },
  firebolt: { name: 'Firebolt', icon: '🔥', target: 'enemy', range: 4, los: true, cd: 2, cls: 'astromancer', color: '#ff9a4a', sets: ['Burning'], pays: ['Burning → COMBUST'],
    text: '14 and Burning. Against a Burning target: COMBUST, 12 plus triple its remaining burn, at once.' },
  prison: { name: 'Glacial Prison', icon: '🧊', target: 'any', range: 3, cd: 3, cls: 'astromancer', color: '#b8e8ff',
    text: 'Any other unit is Encased for 1 turn: it skips its turn and can’t be damaged or moved. Then it’s Wet.' },
  recall: { name: 'Recall', icon: '⏪', target: 'ally', range: 4, cd: 3, call: true, cls: 'astromancer', color: '#ffe08a',
    text: 'Call. When it lands, the ally snaps back to where it stood when you cast, if that’s free, and gets back the HP it lost since.' },

  tether: { name: 'Tether', icon: '🧵', target: 'any', range: 4, los: true, cd: 2, free: true, innate: true, cls: 'weaver', color: '#d06a9a',
    text: 'Free. Tie a Thread to any other unit you can see. An enemy can’t end a move farther from you than it was. You hold 3; a 4th replaces the oldest.' },
  reel: { name: 'Reel', icon: '🎣', target: 'self', cd: 2, cls: 'weaver', sets: ['Slam → Stun', 'Abyss → Downed'],
    text: 'Pull everyone you hold 2 toward you. An enemy pulled into a wall or unit: SLAM; into a chasm: ABYSS. Allies stop short.' },
  web: { name: 'Web', icon: '🕸️', target: 'tile', range: 4, cd: 3, aoe: 1, map: true, cls: 'weaver', sets: ['Rooted'],
    text: 'Webs on a 3×3 area for 3 rounds. Stepping onto a web stops you and Roots you. Fire burns webs.' },
  cocoon: { name: 'Cocoon', icon: '🥚', target: 'any', range: 1, cd: 3, cls: 'weaver',
    text: 'Range 1, or anyone you hold. An ally gets a 40 shield; a Downed ally or an enemy is Encased for 1 turn.' },
  venombite: { name: 'Venom Bite', icon: '🕷️', target: 'enemy', range: 1, cd: 2, cls: 'weaver', color: '#8fe36b', sets: ['Poisoned'], pays: ['Rooted / Stunned → SHATTER ×2'],
    text: '12 and Poisoned (6 a turn for 3 turns). On a Rooted or Stunned target: SHATTER, ×2.' },
  puppet: { name: 'Puppet Strings', icon: '🪢', target: 'tile', cd: 3, map: true, cls: 'weaver',
    text: 'An enemy you hold walks to an empty tile within 2 steps of it: into the storm, off the altar, onto a web.' },
  sharedpain: { name: 'Shared Pain', icon: '💞', target: 'self', cd: 3, cls: 'weaver',
    text: 'Until your next turn, half the damage allies you hold would take hits you instead.' },
  skitter: { name: 'Skitter', icon: '🦗', target: 'any', range: 5, cd: 3, free: true, cls: 'weaver',
    text: 'Free. Leap next to a unit you hold.' },

  harvest: { name: 'Harvest', icon: '🌾', target: 'self', cd: 2, free: true, innate: true, cls: 'gravecaller', color: '#9fe0b8',
    text: 'Free. Gather every Soul within 3. You also gather a Soul by ending a move on it. You hold 3.' },
  lastrites: { name: 'Last Rites', icon: '🕯️', target: 'downed', range: 3, cd: 3, rite: true, cls: 'gravecaller', color: '#fff3b0',
    text: 'Rite. A Downed ally within 3 stands up at 40% HP.' },
  bonewall: { name: 'Bone Wall', icon: '🦴', target: 'tile', range: 3, cd: 2, empty: true, map: true, rite: true, cls: 'gravecaller', color: '#e8e2d0',
    text: 'Rite. A wall of 3 tiles across your line, for 2 rounds. It blocks moves and sight, and breaks Threads. Tiles with units are skipped.' },
  wither: { name: 'Wither', icon: '🥀', target: 'enemy', range: 3, cd: 3, rite: true, cls: 'gravecaller', color: '#b89a6a', sets: ['Withered → REAP'],
    text: 'Rite. Withered for 2 turns: no healing or shields, and a hit that leaves it at 20% HP or less Downs it (REAP).' },
  soulbolt: { name: 'Soul Bolt', icon: '👻', target: 'enemy', range: 4, los: true, cd: 2, cls: 'gravecaller', color: '#9fe0b8',
    text: '14, plus 6 for each Soul you hold. Spends none.' },
  soulburst: { name: 'Soul Burst', icon: '💥', target: 'tile', range: 4, cd: 2, aoe: 1, map: true, cls: 'gravecaller', color: '#c06aff',
    text: 'A Soul on the ground bursts: 18 to every enemy within 1 of it.' },
  siphon: { name: 'Siphon', icon: '🩸', target: 'enemy', range: 3, cd: 2, cls: 'gravecaller', color: '#ff8a8a',
    text: '12, and the most wounded ally within 3 of you (yourself included) heals what it took.' },
  equalize: { name: 'Equalize', icon: '⚖️', target: 'any', range: 3, cd: 3, cls: 'gravecaller',
    text: 'Your HP % and its HP % even out, moving at most 30 HP. Take from an enemy healthier than you, give to an ally hurt worse.' },

  toll: { name: 'Toll', icon: '🔔', target: 'any', range: 4, cd: 2, free: true, innate: true, cls: 'bellringer', color: '#e0b04a',
    text: 'Free. A unit within 4 that hasn’t acted this round: an enemy moves to the end of the round, an ally to right after you. Once per unit per round.' },
  knell: { name: 'Knell', icon: '🔕', target: 'enemy', range: 4, los: true, cd: 2, cls: 'bellringer', color: '#e0b04a', pays: ['Late → ×1.5, Rooted'],
    text: '12. Late (it already acted this round): ×1.5 and Rooted.' },
  hush: { name: 'Hush', icon: '🔇', target: 'enemy', range: 3, cd: 3, cls: 'bellringer', color: '#c8b4ff', sets: ['Hushed'],
    text: 'Hushed for its next turn: it can move and use its basic attack, nothing else. Free innates included.' },
  peal: { name: 'Peal', icon: '📯', target: 'self', aoe: 2, cd: 2, cls: 'bellringer', color: '#ffd36b',
    text: 'Every enemy within 2 takes 10, plus 3 for each unit that already acted this round.' },
  encore: { name: 'Encore', icon: '🎭', target: 'ally', range: 3, cd: 4, noSelf: true, cls: 'bellringer', color: '#8fd1ff',
    text: 'An ally within 3 that already acted this round takes an extra turn at the end of the round. Cooldowns don’t tick on that turn.' },
  overture: { name: 'Overture', icon: '🎼', target: 'self', cd: 4, free: true, cls: 'bellringer', color: '#8fd1ff',
    text: 'Free. Every ally that hasn’t acted this round moves to right after you, in its current order. Not a Toll.' },
  hourglass: { name: 'Hourglass', icon: '⏳', target: 'any', range: 3, cd: 3, cls: 'bellringer',
    text: 'Its timed statuses run out now. An enemy takes its remaining Burn and Poison at once and loses its shield; an ally only loses its debuffs.' },
  bellguard: { name: 'Bell Guard', icon: '🛎️', target: 'self', cd: 3, cls: 'bellringer', color: '#e0b04a',
    text: 'A 25 shield. Until your next turn, enemies that hit you are Hushed.' },

  helpup: { name: 'Help Up', icon: '🤝', target: 'downed', range: 1, cd: 0, color: '#fff3b0', generic: true,
    text: 'Pull a Downed ally next to you back up at 30% HP.' },

  basic_astromancer: basicSkill('astromancer'),
  basic_weaver: basicSkill('weaver'),
  basic_gravecaller: basicSkill('gravecaller'),
  basic_bellringer: basicSkill('bellringer'),
} satisfies Record<SkillId, SkillDef>;

export const SKILLS: Readonly<Record<SkillId, SkillDef>> = SKILL_TABLE;

export function isCall(id: SkillId): id is CallSkill { return !!SKILLS[id].call; }

export const COMBO_INFO = {
  SLAM: 'Forced into an obstacle: stunned.', ABYSS: 'Forced into a chasm or pit: Downed at its edge.', FREEZE: 'Frostbolt on a Wet enemy: stunned.',
  CONDUCT: 'Thunderhead on a Wet enemy: ×1.5.', COMBUST: 'Firebolt on a Burning enemy: the whole burn at once, tripled.',
  SHATTER: 'Venom Bite on a Stunned or Rooted enemy: ×2.', EXECUTE: 'Any hit on a Downed enemy finishes it.', IGNITE: 'Fire on a brazier: it bursts into flames.',
  REAP: 'A hit leaves a Withered enemy (or a Reaper’s target) at 20% HP or less: Downed at once.',
} satisfies Record<ComboName, string>;
