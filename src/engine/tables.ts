import type {
  ClassId, ClassSkillId, ComboName, MapId, Mods, NodeId, PairId, Role, SkillId, SkillTarget, StatusKey, TerrainChar,
} from './types';

export const N = 12;
export const DEPLOY_ROWS = 3;
export const MAX_ROUNDS = 20;
export const BLEED = 2;
export const POINTS = 5;
export const DARK_ROUND = 8;

export const DIR4: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const DIR8: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

export interface TerrainDef { name: string; solid?: true; sight?: true; pit?: true; cost?: number; text?: string }

// '.' floor  '#' wall  'o' chasm  '~' water  'G' tall grass  '^' high ground  'B' brazier  '+' shrine  'I' ice  'A' altar
const TERRAIN_TABLE = {
  '.': { name: 'Floor' },
  '#': { name: 'Wall', solid: true, sight: true, text: 'Blocks movement and line of sight.' },
  'o': { name: 'Chasm', solid: true, pit: true, text: 'Impassable. A character pushed in falls and is Downed.' },
  '~': { name: 'Water', cost: 2, text: 'Costs 2 move. Standing in it makes you Wet: Lightning Conducts (×1.5, chains), Frost Freezes (stun). Puts out burning.' },
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
    ruleText: 'Crumble: at the end of round 3 the side bridges fall, then the back rows at the end of rounds 5, 7 and 9. Anyone standing on a falling tile drops and is Downed; anyone already Downed there is lost.',
    favors: 'Pushers and the patient: a Warden can bash enemies off the edge, and a Root or Stun at the right moment leaves them on a tile about to fall.' },
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
    favors: 'Tanks and area control: a Warden holds the altar, braziers beside it burn holders off, and grass on the flanks hides the ambush.' },
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
  id: ClassId; name: string; role: Role; roleName: string; icon: string; color: string; model: string; hp: number; move: number;
  plays: string; basic: { name: string; range: number; dmg: number };
  skills: readonly ClassSkillId[]; defaults: readonly ClassSkillId[]; tree: readonly NodeId[];
}

export const CLASSES = {
  warden: { id: 'warden', name: 'Warden', role: 'tank', roleName: 'Tank', icon: '🛡️', color: '#e0b877', model: 'guardian', hp: 240, move: 3,
    plays: 'Holds the line, guards allies and slams enemies into walls and chasms.', basic: { name: 'Strike', range: 1, dmg: 16 },
    skills: ['shieldbash', 'guard', 'taunt', 'barricade', 'sunder'], defaults: ['shieldbash', 'guard', 'taunt'], tree: ['w_cmd', 'w_int', 'w_rally', 'w_hp', 'w_gs'] },
  wizard: { id: 'wizard', name: 'Wizard', role: 'damage', roleName: 'Control', icon: '🔮', color: '#ff8a4a', model: 'elementalist', hp: 140, move: 3,
    plays: 'Turns the terrain into a weapon: soak, freeze, shock, burn.', basic: { name: 'Arcane Bolt', range: 4, dmg: 10 },
    skills: ['fireball', 'frostbolt', 'lightning', 'flood', 'combust'], defaults: ['frostbolt', 'lightning', 'flood'], tree: ['z_foc', 'z_arc', 'z_ovr', 'z_hoar', 'z_gla'] },
  ranger: { id: 'ranger', name: 'Ranger', role: 'damage', roleName: 'Marksman', icon: '🏹', color: '#8fd16a', model: 'ranger', hp: 150, move: 4,
    plays: 'Marks the target the whole party should hit, and finishes pinned prey.', basic: { name: 'Shot', range: 5, dmg: 12 },
    skills: ['mark', 'pinshot', 'snipe', 'volley', 'smokearrow'], defaults: ['mark', 'pinshot', 'snipe'], tree: ['r_trk', 'r_pred', 'r_hm', 'r_ste', 'r_per'] },
  cleric: { id: 'cleric', name: 'Cleric', role: 'support', roleName: 'Support', icon: '✨', color: '#7ee081', model: 'cleric', hp: 160, move: 3,
    plays: 'Heals, empowers and brings the fallen back.', basic: { name: 'Smite', range: 3, dmg: 10 },
    skills: ['heal', 'resurrect', 'bless', 'sanctuary', 'judgment'], defaults: ['heal', 'resurrect', 'bless'], tree: ['c_gh', 'c_sw', 'c_life', 'c_fer', 'c_swj'] },
  rogue: { id: 'rogue', name: 'Rogue', role: 'damage', roleName: 'Assassin', icon: '🗡️', color: '#b07cff', model: 'rogue', hp: 140, move: 5,
    plays: 'Dives on stunned or rooted targets and shatters them.', basic: { name: 'Stab', range: 1, dmg: 18 },
    skills: ['backstab', 'shadowstep', 'poison', 'kidney', 'smokebomb'], defaults: ['backstab', 'shadowstep', 'kidney'], tree: ['g_ke', 'g_opp', 'g_exe', 'g_fl', 'g_gw'] },
} satisfies Record<ClassId, ClassDef>;
export const CLASS_ORDER: readonly ClassId[] = ['warden', 'wizard', 'ranger', 'cleric', 'rogue'];

// ---------- passive trees: 3 branches of 3 (two small nodes, then a keystone). A node needs the one before it ----------
export interface NodeDef { id: NodeId; name: string; key?: true; text: string; mods: Mods }
export interface BranchDef { name: string; color: string; nodes: readonly [NodeDef, NodeDef, NodeDef] }

const TREE_TABLE = {
  warden: [
    { name: 'Bulwark', color: '#e0b877', nodes: [
      { id: 'w_hp', name: 'Thick Plate', text: '+30 max HP.', mods: { hp: 30 } },
      { id: 'w_gs', name: 'Shield Wall', text: 'Guard also gives the ally a 15 shield.', mods: { guardShield: 15 } },
      { id: 'w_unb', name: 'Unbreakable', key: true, text: 'Can’t be stunned or rooted.', mods: { stunImmune: 1 } }] },
    { name: 'Vanguard', color: '#ff9a4a', nodes: [
      { id: 'w_mv', name: 'Momentum', text: '+1 move.', mods: { move: 1 } },
      { id: 'w_hb', name: 'Heavy Bash', text: 'Shield Bash pushes 2 tiles.', mods: { pushDist: 1 } },
      { id: 'w_jug', name: 'Juggernaut', key: true, text: 'Your basic Strike also pushes 1 tile (and can Slam).', mods: { juggernaut: 1 } }] },
    { name: 'Warlord', color: '#ffd36b', nodes: [
      { id: 'w_cmd', name: 'Commander', text: '+10% damage.', mods: { dmg: 0.1 } },
      { id: 'w_int', name: 'Intimidate', text: 'Taunt also Exposes the enemies it hits.', mods: { exposeOnTaunt: 1 } },
      { id: 'w_rally', name: 'Rallying Presence', key: true, text: 'Allies next to you deal +15% damage.', mods: { rally: 0.15 } }] }],
  wizard: [
    { name: 'Pyromancy', color: '#ff6a2b', nodes: [
      { id: 'z_kin', name: 'Kindling', text: 'Burning deals +3 a turn.', mods: { burnDmg: 3 } },
      { id: 'z_fs', name: 'Firestarter', text: 'Fire spells +20% damage.', mods: { fireDmg: 0.2 } },
      { id: 'z_wild', name: 'Wildfire', key: true, text: 'Burning enemies set the enemies next to them alight at the start of their turn.', mods: { wildfire: 1 } }] },
    { name: 'Cryomancy', color: '#7fd8ff', nodes: [
      { id: 'z_hoar', name: 'Hoarfrost', text: 'Frostbolt roots for 2 turns.', mods: { rootTurns: 1 } },
      { id: 'z_gla', name: 'Glacier', text: 'Frost spells +20% damage.', mods: { frostDmg: 0.2 } },
      { id: 'z_deep', name: 'Deep Freeze', key: true, text: 'Stunned or rooted enemies take +25% damage from you.', mods: { deepFreeze: 0.25 } }] },
    { name: 'Storm', color: '#c9a7ff', nodes: [
      { id: 'z_foc', name: 'Focus', text: '+1 range on spells.', mods: { range: 1 } },
      { id: 'z_arc', name: 'Arc', text: 'Lightning chains to 1 more enemy.', mods: { chain: 1 } },
      { id: 'z_ovr', name: 'Overcharge', key: true, text: 'Conduct deals ×2 instead of ×1.5.', mods: { overcharge: 1 } }] }],
  ranger: [
    { name: 'Hunter', color: '#f2e36b', nodes: [
      { id: 'r_trk', name: 'Tracker', text: 'Mark lasts 1 turn longer.', mods: { markTurns: 1 } },
      { id: 'r_pred', name: 'Predator', text: 'Marked enemies can’t hide in grass from your party.', mods: { predator: 1 } },
      { id: 'r_hm', name: 'Hunter’s Mark', key: true, text: 'Your Mark makes enemies take +50% instead of +30%.', mods: { markAmt: 0.2 } }] },
    { name: 'Sniper', color: '#8fd16a', nodes: [
      { id: 'r_ste', name: 'Steady Aim', text: '+1 range.', mods: { range: 1 } },
      { id: 'r_per', name: 'Perch', text: 'High ground bonus doubled (+30% damage).', mods: { highDmg: 0.15 } },
      { id: 'r_dead', name: 'Deadeye', key: true, text: 'Pinned (Snipe vs rooted or stunned) deals ×2 instead of ×1.5.', mods: { deadeye: 1 } }] },
    { name: 'Skirmisher', color: '#5fbf8f', nodes: [
      { id: 'r_ls', name: 'Light Step', text: '+1 move.', mods: { move: 1 } },
      { id: 'r_qd', name: 'Quickdraw', text: 'Basic Shot +5 damage.', mods: { basicDmg: 5 } },
      { id: 'r_hr', name: 'Hit & Run', key: true, text: 'After you attack, you may move again (up to 2 tiles).', mods: { hitrun: 2 } }] }],
  cleric: [
    { name: 'Mercy', color: '#7ee081', nodes: [
      { id: 'c_gh', name: 'Gentle Hands', text: 'Heals +25%.', mods: { heal: 0.25 } },
      { id: 'c_sw', name: 'Second Wind', text: 'Resurrect revives at 75% HP.', mods: { reviveHp: 0.25 } },
      { id: 'c_life', name: 'Lifeline', key: true, text: 'Your heals and revives also give a 15 shield.', mods: { lifeline: 15 } }] },
    { name: 'Zeal', color: '#ffd36b', nodes: [
      { id: 'c_fer', name: 'Fervor', text: '+15% damage.', mods: { dmg: 0.15 } },
      { id: 'c_swj', name: 'Swift Judgment', text: 'Judgment cooldown −1.', mods: { judgCd: 1 } },
      { id: 'c_cru', name: 'Crusade', key: true, text: 'Bless also Hastes the ally (+2 move next turn).', mods: { crusade: 1 } }] },
    { name: 'Ward', color: '#b8e0ff', nodes: [
      { id: 'c_aeg', name: 'Aegis', text: 'Sanctuary shields +10.', mods: { sanctShield: 10 } },
      { id: 'c_vig', name: 'Vigil', text: '+25 max HP.', mods: { hp: 25 } },
      { id: 'c_mar', name: 'Martyr', key: true, text: 'Allies within 2 of you take 15% less damage.', mods: { martyr: 0.15 } }] }],
  rogue: [
    { name: 'Assassin', color: '#e05a8a', nodes: [
      { id: 'g_ke', name: 'Keen Edge', text: '+10% damage.', mods: { dmg: 0.1 } },
      { id: 'g_opp', name: 'Opportunist', text: '+20% damage to enemies with any debuff.', mods: { opportunist: 0.2 } },
      { id: 'g_exe', name: 'Executioner', key: true, text: 'Shatter deals ×2.5, and finishing a downed enemy gives your action back.', mods: { executioner: 1 } }] },
    { name: 'Shadow', color: '#9aa6ff', nodes: [
      { id: 'g_fl', name: 'Fleet', text: '+1 move.', mods: { move: 1 } },
      { id: 'g_gw', name: 'Grass Walker', text: 'In grass you can only be targeted from 1 tile.', mods: { grasswalk: 1 } },
      { id: 'g_van', name: 'Vanish', key: true, text: 'Shadowstep is ready again whenever you down an enemy.', mods: { vanish: 1 } }] },
    { name: 'Toxin', color: '#8fe36b', nodes: [
      { id: 'g_vir', name: 'Virulence', text: 'Poison +3 a turn.', mods: { poisonDmg: 3 } },
      { id: 'g_lin', name: 'Lingering', text: 'Poison lasts 1 turn longer.', mods: { poisonTurns: 1 } },
      { id: 'g_ven', name: 'Venom', key: true, text: 'Poisoned enemies are also Exposed.', mods: { venom: 1 } }] }],
} satisfies Record<ClassId, readonly [BranchDef, BranchDef, BranchDef]>;
export const TREES: Readonly<Record<ClassId, readonly [BranchDef, BranchDef, BranchDef]>> = TREE_TABLE;

type Assert<T extends true> = T;
type NoMissing<All, Listed> = [Exclude<All, Listed>] extends [never] ? true : false;
export type EveryNodeInATree = Assert<NoMissing<NodeId, (typeof TREE_TABLE)[ClassId][number]['nodes'][number]['id']>>;

export interface NodeInfo extends NodeDef { cls: ClassId; branch: number; tier: number }
export const NODE: Partial<Record<NodeId, NodeInfo>> = {};
for (const cls of CLASS_ORDER) TREES[cls].forEach((b, branch) => b.nodes.forEach((n, tier) => { NODE[n.id] = { ...n, cls, branch, tier }; }));

// ---------- party bonuses: every pair of classes in the party has one ----------
export interface PairDef { id: PairId; a: ClassId; b: ClassId; name: string; text: string }
const PAIR_TABLE = [
  { id: 'bastion', a: 'warden', b: 'cleric', name: 'Bastion', text: 'Guarded allies heal 8 at the start of their turn.' },
  { id: 'holdblast', a: 'warden', b: 'wizard', name: 'Hold & Blast', text: 'Enemies Taunted by your Warden take +20% damage.' },
  { id: 'anvilarrow', a: 'warden', b: 'ranger', name: 'Anvil & Arrow', text: 'A Shield Bash Slam also Marks the target.' },
  { id: 'hammer', a: 'warden', b: 'rogue', name: 'Hammer & Anvil', text: 'Shatter combos deal +25% more.' },
  { id: 'blessed', a: 'wizard', b: 'cleric', name: 'Blessed Elements', text: 'Empowered spells also Expose their target.' },
  { id: 'crossfire', a: 'wizard', b: 'ranger', name: 'Crossfire', text: 'Marked enemies count as Wet: Conduct and Freeze work on them.' },
  { id: 'smokefire', a: 'wizard', b: 'rogue', name: 'Smoke & Fire', text: 'Backstab also Shatters Burning enemies.' },
  { id: 'guiding', a: 'ranger', b: 'cleric', name: 'Guiding Light', text: 'Your Cleric’s heals also Haste the ally (+2 move next turn).' },
  { id: 'pack', a: 'ranger', b: 'rogue', name: 'Pack Tactics', text: 'Marked enemies take +15% more.' },
  { id: 'shadowmend', a: 'cleric', b: 'rogue', name: 'Shadow Mend', text: 'Help Up revives at 50% HP instead of 30%.' },
] satisfies readonly PairDef[];
export const PAIRS: readonly PairDef[] = PAIR_TABLE;
export type EveryPairListed = Assert<NoMissing<PairId, (typeof PAIR_TABLE)[number]['id']>>;
export const TRINITY: { id: 'trinity'; name: string; text: string } = { id: 'trinity', name: 'Holy Trinity', text: 'A tank, a support and a damage dealer: +20 max HP for everyone.' };

// ---------- statuses: durations count the owner's turns and tick down at the end of each of them ----------
export interface StatusDef { name: string; icon: string; color: string; bad?: true; text: string }
const STATUS_TABLE = {
  stun: { name: 'Stunned', icon: '💫', color: '#ffd36b', bad: true, text: 'Loses its next turn.' },
  root: { name: 'Rooted', icon: '🌿', color: '#8fe36b', bad: true, text: 'Can’t move on its next turn.' },
  wet: { name: 'Wet', icon: '💧', color: '#4fb3ff', bad: true, text: 'Lightning Conducts (×1.5, chains), Frost Freezes (stun). Can’t burn.' },
  burn: { name: 'Burning', icon: '🔥', color: '#ff7a3a', bad: true, text: 'Takes fire damage at the start of its turn.' },
  poison: { name: 'Poisoned', icon: '☠️', color: '#8fe36b', bad: true, text: 'Takes poison damage at the start of its turn.' },
  mark: { name: 'Marked', icon: '🎯', color: '#f2e36b', bad: true, text: 'Takes extra damage from everyone.' },
  expose: { name: 'Exposed', icon: '🩸', color: '#ff8a8a', bad: true, text: 'Takes +25% damage.' },
  taunt: { name: 'Taunted', icon: '📣', color: '#e0b877', bad: true, text: 'Must attack the taunter on its next turn.' },
  guard: { name: 'Guarded', icon: '🛡️', color: '#e0b877', text: 'Half the damage it takes hits its Warden instead.' },
  empower: { name: 'Empowered', icon: '⚡', color: '#ffe08a', text: 'Its next damaging skill deals +40%.' },
  haste: { name: 'Hasted', icon: '🪽', color: '#b8ffb0', text: '+2 move on its next turn.' },
} satisfies Record<StatusKey, StatusDef>;
export const STATUS: Readonly<Record<StatusKey, StatusDef>> = STATUS_TABLE;

// ---------- skills ----------
export interface SkillDef {
  name: string; icon: string; target: SkillTarget; range?: number; cd: number; los?: true; aoe?: number; color?: string;
  sets?: readonly string[]; pays?: readonly string[]; map?: true; empty?: true; noSelf?: true; free?: true; generic?: true; basic?: true;
  /** Consumes Empower and triggers Hit & Run. */
  damaging?: true;
  cls?: ClassId; text: string;
}

function basicSkill(cls: ClassId): SkillDef {
  const b = CLASSES[cls].basic, ranged = b.range > 1;
  return { name: b.name, icon: ranged ? '✦' : '⚔️', target: 'enemy', range: b.range, ...(ranged ? { los: true } : {}), cd: 0, basic: true, damaging: true, cls, color: '#e8e2d0',
    text: `${ranged ? 'Ranged attack' : 'Melee attack'} for ${b.dmg}. Finishes Downed enemies.` };
}

const SKILL_TABLE = {
  shieldbash: { name: 'Shield Bash', icon: '🛡️', target: 'enemy', range: 1, cd: 2, damaging: true, cls: 'warden', sets: ['Slam → Stun', 'Abyss → Downed'],
    text: '14 damage and push 1. Into a wall, unit or edge: SLAM (stunned). Into a chasm: falls, Downed. Into fire or a brazier: burns.' },
  guard: { name: 'Guard', icon: '🔰', target: 'ally', range: 3, cd: 2, noSelf: true, cls: 'warden',
    text: 'Until your next turn, half the damage the ally takes hits you instead.' },
  taunt: { name: 'Taunt', icon: '📣', target: 'self', cd: 3, aoe: 2, cls: 'warden',
    text: 'Enemies within 2 must attack you on their next turn.' },
  barricade: { name: 'Barricade', icon: '🧱', target: 'tile', range: 2, cd: 3, empty: true, map: true, cls: 'warden',
    text: 'Raise a 3-tile wall for 3 rounds. Blocks movement and sight; 30 HP.' },
  sunder: { name: 'Sunder', icon: '🪓', target: 'enemy', range: 1, cd: 2, damaging: true, cls: 'warden', sets: ['Exposed'],
    text: '12 damage and Expose for 2 turns (+25% damage taken).' },

  fireball: { name: 'Fireball', icon: '☄️', target: 'tile', range: 4, los: true, cd: 2, aoe: 1, damaging: true, cls: 'wizard', color: '#ff6a2b', sets: ['Burning'], map: true,
    text: '18 to the target tile, 6 around it, and Burning. Ignites grass and braziers. Wet targets don’t burn.' },
  frostbolt: { name: 'Frostbolt', icon: '❄️', target: 'enemy', range: 4, los: true, cd: 2, damaging: true, cls: 'wizard', color: '#7fd8ff', sets: ['Rooted'], pays: ['Wet → FREEZE (stun)'], map: true,
    text: '12 damage and Root. Against a Wet target: FREEZE, stunned instead. Freezes nearby water into walkable ice.' },
  lightning: { name: 'Lightning', icon: '⚡', target: 'enemy', range: 4, los: true, cd: 2, damaging: true, cls: 'wizard', color: '#c9a7ff', pays: ['Wet → CONDUCT ×1.5 + chain'],
    text: '16 damage, jumps to 1 enemy within 2 for 8. Against Wet: CONDUCT, ×1.5 and it chains to every Wet enemy within 3.' },
  flood: { name: 'Flood', icon: '🌊', target: 'tile', range: 4, cd: 3, aoe: 1, cls: 'wizard', color: '#4fb3ff', sets: ['Wet'], map: true,
    text: 'Turns a 3×3 area to water for 3 rounds: everyone inside is Wet, fire goes out.' },
  combust: { name: 'Combust', icon: '💥', target: 'enemy', range: 4, los: true, cd: 3, damaging: true, cls: 'wizard', color: '#ff9a4a', pays: ['Burning → COMBUST'],
    text: 'Against a Burning enemy: COMBUST, 12 plus triple its remaining burn, all at once. Otherwise 12 and Burning.' },

  mark: { name: 'Mark', icon: '🎯', target: 'enemy', range: 6, los: true, cd: 2, damaging: true, cls: 'ranger', color: '#f2e36b', sets: ['Marked (+30% from all)'],
    text: '6 damage and Mark for 2 turns: it takes +30% damage from everyone.' },
  pinshot: { name: 'Pinning Shot', icon: '📌', target: 'enemy', range: 5, los: true, cd: 2, damaging: true, cls: 'ranger', sets: ['Rooted'],
    text: '12 damage and Root (can’t move next turn).' },
  snipe: { name: 'Snipe', icon: '🎯', target: 'enemy', range: 7, los: true, cd: 2, damaging: true, cls: 'ranger', color: '#c8ff8a', pays: ['Rooted / Stunned → PINNED ×1.5'],
    text: '22 damage. Against a Rooted or Stunned enemy: PINNED, ×1.5.' },
  volley: { name: 'Volley', icon: '🏹', target: 'tile', range: 5, los: true, cd: 3, aoe: 1, damaging: true, cls: 'ranger',
    text: '10 damage to every enemy in a 3×3 area.' },
  smokearrow: { name: 'Smoke Arrow', icon: '💨', target: 'tile', range: 5, cd: 3, aoe: 1, cls: 'ranger', color: '#9aa0b0', map: true,
    text: 'A 3×3 smoke cloud for 2 rounds: blocks line of sight.' },

  heal: { name: 'Heal', icon: '💚', target: 'ally', range: 3, cd: 2, cls: 'cleric',
    text: 'Heal an ally (or yourself) for 26.' },
  resurrect: { name: 'Resurrect', icon: '🕯️', target: 'downed', range: 3, cd: 3, cls: 'cleric', color: '#fff3b0',
    text: 'Raise a Downed ally within 3 at 50% HP.' },
  bless: { name: 'Bless', icon: '🌟', target: 'ally', range: 3, cd: 2, cls: 'cleric', color: '#ffe08a', sets: ['Empowered'],
    text: 'Empower an ally (next damaging skill +40%) and cleanse its debuffs.' },
  sanctuary: { name: 'Sanctuary', icon: '⛪', target: 'self', cd: 3, aoe: 2, cls: 'cleric',
    text: 'You and allies within 2 gain a 20 shield.' },
  judgment: { name: 'Judgment', icon: '⚖️', target: 'enemy', range: 4, los: true, cd: 3, damaging: true, cls: 'cleric', color: '#ffd36b', pays: ['Marked / Exposed → JUDGMENT (stun)'],
    text: '14 holy damage. Against a Marked or Exposed enemy: JUDGMENT, stunned.' },

  backstab: { name: 'Backstab', icon: '🔪', target: 'enemy', range: 1, cd: 2, damaging: true, cls: 'rogue', color: '#e05a8a', pays: ['Stunned / Rooted → SHATTER ×2'],
    text: '20 damage. Against a Stunned or Rooted enemy: SHATTER, ×2.' },
  shadowstep: { name: 'Shadowstep', icon: '🌑', target: 'enemy', range: 4, cd: 3, free: true, cls: 'rogue',
    text: 'Teleport next to an enemy within 4. Free: doesn’t use your action.' },
  poison: { name: 'Poison Blade', icon: '🧪', target: 'enemy', range: 1, cd: 2, damaging: true, cls: 'rogue', color: '#8fe36b', sets: ['Poisoned'],
    text: '10 damage, then 6 poison at the start of each of its next 3 turns.' },
  kidney: { name: 'Kidney Shot', icon: '👊', target: 'enemy', range: 1, cd: 4, damaging: true, cls: 'rogue', color: '#ffd36b', sets: ['Stunned'],
    text: '8 damage and Stun: it loses its next turn.' },
  smokebomb: { name: 'Smoke Bomb', icon: '💣', target: 'self', cd: 3, aoe: 1, cls: 'rogue', color: '#9aa0b0', map: true,
    text: 'Smoke on you and the 8 tiles around for 2 rounds: blocks line of sight.' },

  helpup: { name: 'Help Up', icon: '🤝', target: 'downed', range: 1, cd: 0, color: '#fff3b0', generic: true,
    text: 'Pull a Downed ally next to you back up at 30% HP.' },

  basic_warden: basicSkill('warden'),
  basic_wizard: basicSkill('wizard'),
  basic_ranger: basicSkill('ranger'),
  basic_cleric: basicSkill('cleric'),
  basic_rogue: basicSkill('rogue'),
} satisfies Record<SkillId, SkillDef>;
export const SKILLS: Readonly<Record<SkillId, SkillDef>> = SKILL_TABLE;

export const COMBO_INFO = {
  SLAM: 'Shield Bash into an obstacle: stunned.', ABYSS: 'Pushed into a chasm: Downed.', FREEZE: 'Frost on a Wet enemy: stunned.',
  CONDUCT: 'Lightning on a Wet enemy: ×1.5 and chains through the Wet.', COMBUST: 'Combust on a Burning enemy: the whole burn at once, tripled.',
  PINNED: 'Snipe on a Rooted or Stunned enemy: ×1.5.', JUDGMENT: 'Judgment on a Marked or Exposed enemy: stunned.',
  SHATTER: 'Backstab on a Stunned or Rooted enemy: ×2.', EXECUTE: 'Any hit on a Downed enemy finishes it.', IGNITE: 'Fire on a brazier: it bursts into flames.',
} satisfies Record<ComboName, string>;
