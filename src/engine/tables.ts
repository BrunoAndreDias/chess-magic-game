import type {
  CallSkill, ClassId, ClassSkillId, ComboName, InnateSkillId, MapId, Mods, NodeId, PairId, Role, SkillId, SkillTarget, StatusKey, TerrainChar,
} from './types';

export const N = 12;
export const DEPLOY_ROWS = 3;
export const MAX_ROUNDS = 20;
export const BLEED = 2;
export const POINTS = 6;
export const DARK_ROUND = 8;

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
    favors: 'Pullers and the patient: Upheaval, Reel and Gravity Well drop enemies off the edge, and a Root or Stun at the right moment leaves them on a tile about to fall.' },
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
  id: ClassId; name: string; icon: string; color: string; model: string; hp: number; move: number;
  /** One line: the class mechanic. */
  mechanic: string;
  plays: string; basic: { name: string; range: number; dmg: number }; innate: InnateSkillId;
  skills: readonly ClassSkillId[]; defaults: readonly ClassSkillId[]; tree: readonly NodeId[];
}

export const CLASSES = {
  delver: { id: 'delver', name: 'Delver', icon: '⛏️', color: '#c9a06a', model: 'guardian', hp: 190, move: 3, innate: 'burrow',
    mechanic: 'Underground: sink after acting, move under walls and units, leave tunnels the party can walk.',
    plays: 'A mole-kin sapper who fights from below and dives the backline.', basic: { name: 'Pick', range: 1, dmg: 16 },
    skills: ['upheaval', 'undermine', 'satchel', 'dragunder', 'tremor', 'stoneskin', 'warren'], defaults: ['upheaval', 'satchel', 'stoneskin'],
    tree: ['d_strike', 'd_upheave', 'd_deep', 'd_undertow', 'd_hp', 'd_quick'] },
  astromancer: { id: 'astromancer', name: 'Astromancer', icon: '☄️', color: '#9a8cff', model: 'elementalist', hp: 140, move: 3, innate: 'snap',
    mechanic: 'Calls: the big spells land at the start of your next turn.',
    plays: 'The battle mage whose big spells fall from the sky, where the enemy will be.', basic: { name: 'Starbolt', range: 4, dmg: 10 },
    skills: ['meteor', 'thunderhead', 'gravitywell', 'frostbolt', 'firebolt', 'prison', 'recall'], defaults: ['meteor', 'frostbolt', 'gravitywell'],
    tree: ['a_fire', 'a_range', 'a_burn', 'a_twin', 'a_frost', 'a_prison'] },
  weaver: { id: 'weaver', name: 'Weaver', icon: '🕸️', color: '#d06a9a', model: 'rogue', hp: 170, move: 3, innate: 'tether',
    mechanic: 'Threads: tie up to 3 units, then pull, leash or share damage along them.',
    plays: 'A spider-kin who ties the battlefield together with silk.', basic: { name: 'Fang', range: 1, dmg: 14 },
    skills: ['reel', 'web', 'cocoon', 'venombite', 'puppet', 'sharedpain', 'skitter'], defaults: ['reel', 'web', 'venombite'],
    tree: ['w_hp', 'w_leash', 'w_thread', 'w_fate', 'w_poison', 'w_fang'] },
} satisfies Record<ClassId, ClassDef>;
export const CLASS_ORDER: readonly ClassId[] = ['delver', 'astromancer', 'weaver'];

// ---------- passive trees: 3 paths of 4 (three nodes, then a keystone). A node needs the one before it ----------
export interface NodeDef { id: NodeId; name: string; key?: true; text: string; mods: Mods }
export interface BranchDef { name: string; role: Role; color: string; nodes: readonly [NodeDef, NodeDef, NodeDef, NodeDef] }

const TREE_TABLE = {
  delver: [
    { name: 'Sapper', role: 'tank', color: '#c9a06a', nodes: [
      { id: 'd_hp', name: 'Hard Hide', text: '+30 max HP.', mods: { hp: 30 } },
      { id: 'd_quick', name: 'Quick Sink', text: 'Undermine collapses at once.', mods: { quickSink: 1 } },
      { id: 'd_satchel', name: 'Black Powder', text: 'Satchel Charge +8 damage.', mods: { satchelDmg: 8 } },
      { id: 'd_earth', name: 'Earthbreaker', key: true, text: 'Enemies who start their turn next to you are Rooted, and you take 15% less damage.', mods: { earthbreaker: 1 } }] },
    { name: 'Ambusher', role: 'damage', color: '#ff9a4a', nodes: [
      { id: 'd_strike', name: 'From Below', text: '+15% damage on a turn you surface.', mods: { surfaceDmg: 0.15 } },
      { id: 'd_upheave', name: 'Rockburst', text: 'Upheaval +6 damage.', mods: { upheavalDmg: 6 } },
      { id: 'd_deep', name: 'Deep Runner', text: 'Underground move +1.', mods: { underMove: 1 } },
      { id: 'd_undertow', name: 'Undertow', key: true, text: 'Upheaval doesn’t surface you: strike from below and stay under until the end of your next turn.', mods: { undertow: 1 } }] },
    { name: 'Tunnelwright', role: 'support', color: '#8fd1a0', nodes: [
      { id: 'd_mouth', name: 'Shored Tunnels', text: 'Tunnel Mouths last 2 rounds longer.', mods: { mouthTurns: 2 } },
      { id: 'd_hp2', name: 'Thick Skin', text: '+20 max HP.', mods: { hp: 20 } },
      { id: 'd_shield', name: 'Safe Passage', text: 'Allies who come out of your tunnels get a 15 shield.', mods: { tunnelShield: 15 } },
      { id: 'd_city', name: 'Undercity', key: true, text: 'Downed allies on your mouths don’t bleed, and enemies can’t cave your mouths in.', mods: { undercity: 1 } }] }],
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
      { id: 'a_benev', name: 'Benevolent Heavens', key: true, text: 'Your Calls heal allies in their area for half what they’d deal, instead of hurting them. Gravity Well doesn’t pull allies.', mods: { benevolent: 1 } }] }],
  weaver: [
    { name: 'Matriarch', role: 'tank', color: '#d06a9a', nodes: [
      { id: 'w_hp', name: 'Chitin', text: '+30 max HP.', mods: { hp: 30 } },
      { id: 'w_leash', name: 'Short Leash', text: 'Enemies you hold deal 20% less damage to everyone but you.', mods: { leashDmg: 0.2 } },
      { id: 'w_thread', name: 'Many Hands', text: '+1 Thread.', mods: { threads: 1 } },
      { id: 'w_fate', name: 'Web of Fate', key: true, text: 'Start each turn with a 10 shield per Thread you hold. An enemy you hold that ends its turn more than 2 from you is pulled back to 2 and takes 12.', mods: { webOfFate: 1 } }] },
    { name: 'Widow', role: 'damage', color: '#8fe36b', nodes: [
      { id: 'w_poison', name: 'Virulence', text: 'Poison +3 a turn.', mods: { poisonDmg: 3 } },
      { id: 'w_fang', name: 'Long Fangs', text: 'Fang +6 damage.', mods: { basicDmg: 6 } },
      { id: 'w_bite', name: 'Drink Deep', text: 'Venom Bite heals you 8.', mods: { biteHeal: 8 } },
      { id: 'w_feast', name: 'Feast', key: true, text: 'Reel pulls enemies all the way to you, and you bite each one that arrives next to you for 12 and Poison.', mods: { feast: 1 } }] },
    { name: 'Spinner', role: 'support', color: '#b8e0ff', nodes: [
      { id: 'w_cocoon', name: 'Quick Silk', text: 'Cocoon cooldown −1.', mods: { cocoonCd: 1 } },
      { id: 'w_reach', name: 'Long Line', text: 'Tether range +2.', mods: { threadRange: 2 } },
      { id: 'w_silk', name: 'Strong Silk', text: 'Webs last 2 rounds longer.', mods: { webTurns: 2 } },
      { id: 'w_spare', name: 'Fate Weaver', key: true, text: 'The first time each ally you hold would be Downed, it is Encased at 1 HP instead.', mods: { fateWeaver: 1 } }] }],
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
  { id: 'deepimpact', a: 'delver', b: 'astromancer', name: 'Deep Impact', text: 'A Call whose area holds one of your Tunnel Mouths also lands on every other mouth of that tunnel, at half power.' },
  { id: 'silktunnels', a: 'delver', b: 'weaver', name: 'Silk Tunnels', text: 'Allies a Weaver holds walk between joined Tunnel Mouths for free.' },
  { id: 'startether', a: 'astromancer', b: 'weaver', name: 'Star-Tether', text: 'An enemy held by your Weaver when your Call hits it is Exposed for 2 turns.' },
  { id: 'warren', a: 'delver', b: 'delver', name: 'Shared Warren', text: 'Every Tunnel Mouth of your party is joined into one network.' },
  { id: 'conjunction', a: 'astromancer', b: 'astromancer', name: 'Conjunction', text: 'A Call that lands in a round where another of your Calls already landed deals +25%.' },
  { id: 'greatweb', a: 'weaver', b: 'weaver', name: 'Great Web', text: '+1 Thread each, and your webs last 1 round longer.' },
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
} satisfies Record<StatusKey, StatusDef>;
export const STATUS: Readonly<Record<StatusKey, StatusDef>> = STATUS_TABLE;

// ---------- skills ----------
export interface SkillDef {
  name: string; icon: string; target: SkillTarget; range?: number; cd: number; los?: true; aoe?: number; color?: string;
  sets?: readonly string[]; pays?: readonly string[]; map?: true; empty?: true; noSelf?: true; free?: true; generic?: true; basic?: true;
  /** Marks its area now and lands at the start of the caster's next activation. */
  call?: true;
  /** Hits underground units: forces them up and Stuns them. */
  quake?: true;
  innate?: true;
  cls?: ClassId; text: string;
}

function basicSkill(cls: ClassId): SkillDef {
  const b = CLASSES[cls].basic, ranged = b.range > 1;
  return { name: b.name, icon: ranged ? '✦' : '⚔️', target: 'enemy', range: b.range, ...(ranged ? { los: true } : {}), cd: 0, basic: true, cls, color: '#e8e2d0',
    text: `${ranged ? 'Ranged attack' : 'Melee attack'} for ${b.dmg}. Finishes Downed enemies.` };
}

const SKILL_TABLE = {
  burrow: { name: 'Burrow', icon: '🕳️', target: 'self', cd: 2, free: true, innate: true, cls: 'delver', color: '#c9a06a',
    text: 'Free. Only if you haven’t moved; uses your move. Go Underground until the end of your next turn and leave a Tunnel Mouth.' },
  upheaval: { name: 'Upheaval', icon: '🌋', target: 'enemy', range: 1, cd: 2, cls: 'delver', color: '#ff9a4a', sets: ['Slam → Stun', 'Abyss → Downed'],
    text: 'Only from underground. Burst up next to an enemy: 18 damage and push it 1. Into a wall, unit or edge: SLAM. Into a chasm: ABYSS.' },
  undermine: { name: 'Undermine', icon: '🕳️', target: 'tile', range: 2, cd: 3, empty: true, map: true, cls: 'delver',
    text: 'An empty tile collapses into a pit at the end of the round, for 3 rounds. Anyone there falls and is Downed at its edge; the Downed are lost.' },
  satchel: { name: 'Satchel Charge', icon: '💣', target: 'tile', range: 1, cd: 3, empty: true, map: true, cls: 'delver', color: '#ff6a2b',
    text: 'Plant a charge. It blows when an enemy ends a move next to it, or when you surface: 20 to every unit within 1, pushed 1 outward.' },
  dragunder: { name: 'Drag Under', icon: '🫳', target: 'friend', range: 1, cd: 3, noSelf: true, cls: 'delver',
    text: 'An ally within 1, standing or Downed, comes out next to your newest Tunnel Mouth. A Downed ally skips its next bleed.' },
  tremor: { name: 'Tremor', icon: '〰️', target: 'self', cd: 3, aoe: 2, quake: true, cls: 'delver', sets: ['Rooted'],
    text: 'Enemies within 2 are Rooted. Quake: an underground enemy in range is forced up and Stunned.' },
  stoneskin: { name: 'Stoneskin', icon: '🪨', target: 'self', cd: 3, cls: 'delver',
    text: 'A 30 shield. On a Tunnel Mouth, each ally within 1 also gets 15.' },
  warren: { name: 'Warren', icon: '🚪', target: 'tile', range: 4, los: true, cd: 2, empty: true, map: true, cls: 'delver',
    text: 'Open a Tunnel Mouth on an empty tile you can see.' },

  snap: { name: 'Snap', icon: '✨', target: 'self', cd: 3, free: true, innate: true, cls: 'astromancer', color: '#9a8cff',
    text: 'Free. Your oldest pending Call lands right now, at half power.' },
  meteor: { name: 'Meteor', icon: '☄️', target: 'tile', range: 6, cd: 3, aoe: 1, call: true, quake: true, map: true, cls: 'astromancer', color: '#ff6a2b', sets: ['Burning'],
    text: 'Call. 30 at the center, 15 around, and Burning. Ignites grass, bursts braziers, burns webs. Quake.' },
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

  helpup: { name: 'Help Up', icon: '🤝', target: 'downed', range: 1, cd: 0, color: '#fff3b0', generic: true,
    text: 'Pull a Downed ally next to you back up at 30% HP.' },

  basic_delver: basicSkill('delver'),
  basic_astromancer: basicSkill('astromancer'),
  basic_weaver: basicSkill('weaver'),
} satisfies Record<SkillId, SkillDef>;
export const SKILLS: Readonly<Record<SkillId, SkillDef>> = SKILL_TABLE;
export function isCall(id: SkillId): id is CallSkill { return !!SKILLS[id].call; }

export const COMBO_INFO = {
  SLAM: 'Forced into an obstacle: stunned.', ABYSS: 'Forced into a chasm or pit: Downed at its edge.', FREEZE: 'Frostbolt on a Wet enemy: stunned.',
  CONDUCT: 'Thunderhead on a Wet enemy: ×1.5.', COMBUST: 'Firebolt on a Burning enemy: the whole burn at once, tripled.',
  SHATTER: 'Venom Bite on a Stunned or Rooted enemy: ×2.', EXECUTE: 'Any hit on a Downed enemy finishes it.', IGNITE: 'Fire on a brazier: it bursts into flames.',
} satisfies Record<ComboName, string>;
