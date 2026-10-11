import type {
  CallSkill, ClassId, ClassSkillId, ComboName, InnateSkillId, MapId, Mods, NodeId, PairId, PartyBonusId, Role, SkillId, SkillTarget, StatusKey, TerrainChar,
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

/** Skills each member takes into battle, of its class's seven. */
export const SKILL_PICKS = 3;

// ---------- rule numbers: the engine reads these, and every text below that states one interpolates it ----------
/** Exposed: damage taken × (1 + this). */
export const EXPOSE = 0.25;

/** Shock (Thunderhead's CONDUCT, a storm strike) on a Wet unit: × this. */
export const WET_SHOCK = 1.5;

/** A hit that leaves a Withered enemy (or a Reaper's target) at this share of max HP or less Downs it (REAP). */
export const REAP_AT = 0.2;

export const BURN = { turns: 2, dmg: 6 };

export const WET_TURNS = 2;

/** Quickened: + this move on the next turn. */
export const HASTE_MOVE = 2;

/** An Undying Gravecaller's move while Downed. */
export const UNDYING_MOVE = 1;

/** Souls and Harvest's reach for a Gravecaller, before passives and resonances. */
export const SOULS = 3;

export const HARVEST_RANGE = 3;

/** A Marionettist's Doll: its HP, the rounds it takes to reform, how far Strings walks it and how far from its owner it may end. */
export const DOLL = { hp: 40, reform: 2, walk: 3, leash: 4 };

/** The share of a hit a Mirrored unit turns back on its attacker. */
export const REFLECT = 0.5;

export const HIGH_GROUND = { range: 1, dmg: 0.15 };

/** Tall grass: enemies see you from this many tiles. */
export const GRASS_SIGHT = 2;

export const WATER_COST = 2;

export const SHRINE_HEAL = 12;

/** `0.2` → `20%`. */
export const pct = (f: number): string => `${Math.round(f * 100)}%`;

/** A share of something as a word where English has one: `half`, `a quarter`; else a percentage. */
export const part = (f: number): string => (f === 0.5 ? 'half' : f === 0.25 ? 'a quarter' : pct(f));

/** `a quarter` → `A quarter`. */
const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

/** An area of radius `r` as its side: `1` → `3×3`. */
const side = (r: number): string => `${2 * r + 1}×${2 * r + 1}`;

export const DIR4: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const DIR8: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// ---------- map rules: declared before the tables whose texts quote them ----------
/** One digit of a crumble layout: the round at whose end the tile falls. */
function digit(round: number): string {
  if (!Number.isInteger(round) || round < 1 || round > 9) throw new Error(`crumble round ${round} must be one digit`);

  return String(round);
}

const SPAN_FALLS = { bridges: 3, back: [5, 7], plateaus: 9 } as const;

const SPAN_RULE = {
  kind: 'crumble',
  rounds: [digit(SPAN_FALLS.back[0]).repeat(N), digit(SPAN_FALLS.back[1]).repeat(N), digit(SPAN_FALLS.plateaus).repeat(N),
    ...Array.from({ length: 3 }, () => `.${digit(SPAN_FALLS.bridges)}........${digit(SPAN_FALLS.bridges)}.`)],
  names: { [SPAN_FALLS.bridges]: 'The side bridges crumble', [SPAN_FALLS.back[0]]: 'The back rows crumble', [SPAN_FALLS.back[1]]: 'The back rows crumble', [SPAN_FALLS.plateaus]: 'The plateaus crumble' },
} satisfies MapRule;

const STORM_RULE = { kind: 'storm', dmg: 24, cycle: [
  { name: 'The edges', cols: [0, 1, 10, 11] },
  { name: 'The center', cols: [5, 6] },
  { name: 'The midline', rows: [5, 6] },
  { name: 'The backlines', rows: [0, 1, 10, 11] }] } satisfies MapRule;

const ALTAR_RULE = { kind: 'altar', goal: 5 } satisfies MapRule;

/** `a, b, then c`. */
const thenList = (xs: readonly string[]): string => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')}, then ${xs[xs.length - 1]}`);

export interface TerrainDef { name: string; solid?: true; sight?: true; pit?: true; cost?: number; text?: string }

// '.' floor  '#' wall  'o' chasm  '~' water  'G' tall grass  '^' high ground  'B' brazier  '+' shrine  'I' ice  'A' altar
const TERRAIN_TABLE = {
  '.': { name: 'Floor' },
  '#': { name: 'Wall', solid: true, sight: true, text: 'Blocks movement and line of sight.' },
  'o': { name: 'Chasm', solid: true, pit: true, text: 'Impassable. A character pushed in falls and is Downed, clinging to the nearest edge.' },
  '~': { name: 'Water', cost: WATER_COST, text: `Costs ${WATER_COST} move. Standing in it makes you Wet: Thunderhead Conducts (×${WET_SHOCK}), Frostbolt Freezes (stun). Puts out burning.` },
  'G': { name: 'Tall grass', text: `Hides whoever stands in it: enemies can only target them from ${GRASS_SIGHT} tiles, or when one of their allies is next to them. Burns.` },
  '^': { name: 'High ground', text: `Ranged attacks from here get +${HIGH_GROUND.range} range and +${pct(HIGH_GROUND.dmg)} damage against targets below.` },
  'B': { name: 'Brazier', solid: true, text: 'Solid. Hit it with fire, or push someone into it, and it bursts: fire on the 8 tiles around.' },
  '+': { name: 'Shrine', text: `End your turn here to heal ${SHRINE_HEAL}.` },
  'I': { name: 'Ice', text: 'Frozen water: walk on it freely, no Wet.' },
  'A': { name: 'Sun Altar', text: `At the end of each round, the party with more characters standing here gains 1 favor. ${ALTAR_RULE.goal} favor wins the battle.` },
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
    rule: SPAN_RULE,
    tagline: 'The edges fall away. Only the island lasts.',
    ruleText: `Crumble: at the end of round ${SPAN_FALLS.bridges} the side bridges fall, then the back rows at the end of rounds ${SPAN_FALLS.back.join(' and ')}, and the plateaus at the end of round ${SPAN_FALLS.plateaus}. Anyone standing on a falling tile drops and is Downed, clinging to the nearest solid ground; anyone already Downed there is lost.`,
    favors: 'Pullers and the patient: Gravity Well drops enemies off the edge, and a Root or Stun at the right moment leaves them on a tile about to fall.' },
  storm: { id: 'storm', name: 'Storm Court',
    rows: ['............', '..#......#..', '............', '.~~..^...~~.', '.~~.#..#.~~.', '.....~~....+'],
    rule: STORM_RULE,
    tagline: 'Lightning strikes known lines at the end of every round.',
    ruleText: `Storm: at the end of each round lightning strikes, in a fixed cycle, ${thenList(STORM_RULE.cycle.map(l => l.name.toLowerCase()))}. Anyone standing there takes ${STORM_RULE.dmg}, ${Math.round(STORM_RULE.dmg * WET_SHOCK)} if Wet, and the Downed are finished.`,
    favors: `Control: Root, Stun or push an enemy into the next strike after it has moved. Wet targets take ×${WET_SHOCK}. Plan your turn order so nobody is caught.` },
  altar: { id: 'altar', name: 'Sun Altar',
    rows: ['............', '.GG......GG.', '....#..#....', '.G........G.', '.GG.B^..^GG.', '#....AA....#'],
    rule: ALTAR_RULE,
    tagline: `Hold the altar. First to ${ALTAR_RULE.goal} favor wins.`,
    ruleText: `Altar: at the end of each round, the party with more characters standing on the Sun Altar gains 1 favor. Ties gain nothing. The first party to ${ALTAR_RULE.goal} favor wins at once.`,
    favors: 'Tanks and area control: a Meteor on the altar makes holders leave or eat it, and grass on the flanks hides the ambush.' },
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
  marionettist: { id: 'marionettist', name: 'Marionettist', icon: '🪆', color: '#d9a066', hp: 150, move: 3, innate: 'strings',
    mechanic: 'The Doll: a second body on the board that you walk, swap with and fight through.',
    plays: 'A tall masked puppeteer whose wooden Doll stands where it is needed.', basic: { name: 'Wire Lash', range: 2, dmg: 12 },
    skills: ['switch', 'dance', 'tangle', 'razorwire', 'splinter', 'standin', 'rebuild'], defaults: ['switch', 'tangle', 'razorwire'],
    tree: ['p_lash', 'p_wire', 'p_splinter', 'p_ventriloquist', 'p_doll', 'p_hp'] },
  mirrormime: { id: 'mirrormime', name: 'Mirrormime', icon: '🪞', color: '#c8d4ff', hp: 150, move: 3, innate: 'reflect',
    mechanic: 'Reflection: turn hits back on whoever threw them.',
    plays: 'A harlequin mime with a mirrorball, who hands every blow back.', basic: { name: 'Glint', range: 3, dmg: 12 },
    skills: ['glasswall', 'ricochet', 'retort', 'mock', 'mirrorball', 'shatter', 'reversal'], defaults: ['glasswall', 'ricochet', 'mock'],
    tree: ['m_hp', 'm_reach', 'm_shield', 'm_quick', 'm_rico', 'm_retort'] },
} satisfies Record<ClassId, ClassDef>;

export const CLASS_ORDER: readonly ClassId[] = ['astromancer', 'gravecaller', 'bellringer', 'marionettist', 'mirrormime'];

// ---------- passive trees: 3 paths of 4 (three nodes, then a keystone). A node needs the one before it ----------
export interface NodeDef { id: NodeId; name: string; key?: true; text: string; mods: Mods }

export interface BranchDef { name: string; role: Role; color: string; nodes: readonly [NodeDef, NodeDef, NodeDef, NodeDef] }

/** Keystone numbers that aren't summed mods: the engine reads them here, the node texts quote them. */
export const NODE_N = {
  a_zero: { turns: 2 },
  a_benev: { heal: 0.25 },
  g_ferry: { range: 2, hp: 0.6 },
  b_accel: { shield: 15 },
  p_tangled: { taken: 0.5 },
  p_understudy: { share: 0.25, shield: 15 },
  m_hall: { flash: 10, radius: 2 },
};

/** A node whose text is written from its own mods, so the number shown is the number applied. */
function node<I extends NodeId, M extends Mods>(n: { id: I; name: string; key?: true; mods: M; text: (m: M) => string }): NodeDef & { id: I } {
  const out: NodeDef & { id: I } = { id: n.id, name: n.name, mods: n.mods, text: n.text(n.mods) };

  if (n.key) out.key = n.key;

  return out;
}

const cd = (n: number): string => `cooldown −${n}`;

const TREE_TABLE = {
  astromancer: [
    { name: 'Rime', role: 'tank', color: '#7fd8ff', nodes: [
      node({ id: 'a_frost', name: 'Hoarfrost', mods: { frostDmg: 0.2 }, text: m => `Frost +${pct(m.frostDmg)} damage.` }),
      node({ id: 'a_prison', name: 'Cold Cell', mods: { prisonCd: 1 }, text: m => `Glacial Prison ${cd(m.prisonCd)}.` }),
      node({ id: 'a_wet', name: 'Sleet', mods: { callWet: 1 }, text: () => 'Your Calls make everyone they hit Wet.' }),
      node({ id: 'a_zero', name: 'Absolute Zero', key: true, mods: { absZero: 1 },
        text: () => `Units Rooted or Encased when your Call lands are Stunned by it, and Glacial Prison holds an enemy ${NODE_N.a_zero.turns} turns.` })] },
    { name: 'Pyre', role: 'damage', color: '#ff6a2b', nodes: [
      node({ id: 'a_fire', name: 'Kindling', mods: { fireDmg: 0.2 }, text: m => `Fire +${pct(m.fireDmg)} damage.` }),
      node({ id: 'a_range', name: 'Far Sight', mods: { callRange: 1 }, text: m => `Call range +${m.callRange}.` }),
      node({ id: 'a_burn', name: 'Searing', mods: { burnDmg: 3 }, text: m => `Burning deals +${m.burnDmg} a turn.` }),
      node({ id: 'a_twin', name: 'Twin Stars', key: true, mods: { twinStars: 1 }, text: m => `You can hold ${1 + m.twinStars} Calls at once.` })] },
    { name: 'Orrery', role: 'support', color: '#ffe08a', nodes: [
      node({ id: 'a_recall', name: 'Long Orbit', mods: { recallRange: 2 }, text: m => `Recall range +${m.recallRange}.` }),
      node({ id: 'a_hp', name: 'Starward', mods: { hp: 25 }, text: m => `+${m.hp} max HP.` }),
      node({ id: 'a_cleanse', name: 'Clean Return', mods: { recallCleanse: 1 }, text: () => 'Recall also cleanses debuffs.' }),
      node({ id: 'a_benev', name: 'Benevolent Heavens', key: true, mods: { benevolent: 1 },
        text: () => `Your Calls heal allies in their area for ${part(NODE_N.a_benev.heal)} of what they’d deal, instead of hurting them.` })] }],
  gravecaller: [
    { name: 'Lich', role: 'tank', color: '#9fe0b8', nodes: [
      node({ id: 'g_hp', name: 'Grave Flesh', mods: { hp: 25 }, text: m => `+${m.hp} max HP.` }),
      node({ id: 'g_cap', name: 'Deep Pockets', mods: { soulCap: 1 }, text: m => `Hold ${m.soulCap} more Soul.` }),
      node({ id: 'g_ward', name: 'Soul Ward', mods: { soulShield: 6 }, text: m => `Start your turn with a ${m.soulShield} shield for each Soul you hold.` }),
      node({ id: 'g_undying', name: 'Undying', key: true, mods: { undying: 1 },
        text: () => `While Downed you still take turns: move ${UNDYING_MOVE}, then one skill but not your basic. Each Downed turn spends a held Soul instead of bleeding; with none, you bleed as normal.` })] },
    { name: 'Reaper', role: 'damage', color: '#c06aff', nodes: [
      node({ id: 'g_bolt', name: 'Sharp Bones', mods: { soulBoltDmg: 4 }, text: m => `Soul Bolt +${m.soulBoltDmg} damage.` }),
      node({ id: 'g_reach', name: 'Long Scythe', mods: { harvestRange: 2 }, text: m => `Harvest range +${m.harvestRange}.` }),
      node({ id: 'g_burst', name: 'Overflow', mods: { burstDmg: 8 }, text: m => `Soul Burst +${m.burstDmg} damage.` }),
      node({ id: 'g_reap', name: 'Reap', key: true, mods: { reap: 1 },
        text: () => `Enemies a hit of yours leaves at ${pct(REAP_AT)} HP or less are Downed at once (REAP), and every Down you cause hands you its Soul directly.` })] },
    { name: 'Psychopomp', role: 'support', color: '#fff3b0', nodes: [
      node({ id: 'g_rites', name: 'Far Call', mods: { riteRange: 2 }, text: m => `Last Rites range +${m.riteRange}.` }),
      node({ id: 'g_hp2', name: 'Pale Robes', mods: { hp: 20 }, text: m => `+${m.hp} max HP.` }),
      node({ id: 'g_shield', name: 'Safe Passage', mods: { riteShield: 20 }, text: m => `Allies you stand up get a ${m.riteShield} shield.` }),
      node({ id: 'g_ferry', name: 'Ferryman', key: true, mods: { ferryman: 1 },
        text: () => `Downed allies within ${NODE_N.g_ferry.range} of you don’t bleed, and anyone in your party who stands an ally up (Help Up or Last Rites) brings it back at ${pct(NODE_N.g_ferry.hp)} HP.` })] }],
  bellringer: [
    { name: 'Carillon', role: 'tank', color: '#e0b04a', nodes: [
      node({ id: 'b_hp', name: 'Bronze Frame', mods: { hp: 30 }, text: m => `+${m.hp} max HP.` }),
      node({ id: 'b_clapper', name: 'Heavy Clapper', mods: { basicDmg: 6 }, text: m => `Clapper +${m.basicDmg} damage.` }),
      node({ id: 'b_guard', name: 'Thick Bell', mods: { guardShield: 15 }, text: m => `Bell Guard +${m.guardShield} shield.` }),
      node({ id: 'b_thee', name: 'Toll for Thee', key: true, mods: { tollHush: 1, tollCd: 1 },
        text: m => `Enemies you Toll are Hushed on their moved turn, and Toll’s ${cd(m.tollCd)}.` })] },
    { name: 'Herald', role: 'damage', color: '#ff8a4a', nodes: [
      node({ id: 'b_knell', name: 'Deep Knell', mods: { knellDmg: 6 }, text: m => `Knell +${m.knellDmg} damage.` }),
      node({ id: 'b_last', name: 'Last Word', mods: { lastDmg: 0.2 }, text: m => `+${pct(m.lastDmg)} damage when you’re the last of your party to act this round.` }),
      node({ id: 'b_peal', name: 'Loud Peal', mods: { pealDmg: 3 }, text: m => `Peal +${m.pealDmg} damage.` }),
      node({ id: 'b_final', name: 'Final Hour', key: true, mods: { finalHour: 0.5 },
        text: m => `Toll can target you before you move or act: your turn moves to the end of the round, and a turn you take last in the round deals +${pct(m.finalHour)} damage.` })] },
    { name: 'Conductor', role: 'support', color: '#8fd1ff', nodes: [
      node({ id: 'b_reach', name: 'Far Toll', mods: { tollRange: 2 }, text: m => `Toll range +${m.tollRange}.` }),
      node({ id: 'b_encore', name: 'Swift Encore', mods: { encoreCd: 1 }, text: m => `Encore ${cd(m.encoreCd)}.` }),
      node({ id: 'b_hp2', name: 'Steady Hands', mods: { hp: 20 }, text: m => `+${m.hp} max HP.` }),
      node({ id: 'b_accel', name: 'Accelerando', key: true, mods: { accel: 1, tollCd: 1 },
        text: m => `Allies you Toll get +${HASTE_MOVE} move and a ${NODE_N.b_accel.shield} shield on that turn, and Toll’s ${cd(m.tollCd)}.` })] }],
  marionettist: [
    { name: 'Heartwood', role: 'tank', color: '#c08a4a', nodes: [
      node({ id: 'p_doll', name: 'Oak Limbs', mods: { dollHp: 25 }, text: m => `Your Doll +${m.dollHp} max HP.` }),
      node({ id: 'p_hp', name: 'Stagehand', mods: { hp: 25 }, text: m => `+${m.hp} max HP.` }),
      node({ id: 'p_reform', name: 'Spare Parts', mods: { dollReform: 1 }, text: m => `Your Doll reforms ${m.dollReform} round sooner.` }),
      node({ id: 'p_tangled', name: 'Tangled Strings', key: true, mods: { tangled: 1 },
        text: () => `Enemies that hit your Doll are Rooted, and it takes ${part(NODE_N.p_tangled.taken)} damage.` })] },
    { name: 'Ventriloquy', role: 'damage', color: '#ff7a5a', nodes: [
      node({ id: 'p_lash', name: 'Barbed Wire', mods: { basicDmg: 4 }, text: m => `Wire Lash +${m.basicDmg} damage.` }),
      node({ id: 'p_wire', name: 'Piano Wire', mods: { wireDmg: 6 }, text: m => `Razor Wire +${m.wireDmg} damage.` }),
      node({ id: 'p_splinter', name: 'Brittle Pine', mods: { splinterDmg: 6 }, text: m => `Splinter +${m.splinterDmg} damage.` }),
      node({ id: 'p_ventriloquist', name: 'Ventriloquist', key: true, mods: { ventriloquist: 1 },
        text: () => 'You can cast your basic and your skills from your Doll’s tile, as if you stood there.' })] },
    { name: 'Stagecraft', role: 'support', color: '#ffd38a', nodes: [
      node({ id: 'p_switch', name: 'Long Strings', mods: { switchRange: 2 }, text: m => `Switch range +${m.switchRange}.` }),
      node({ id: 'p_hp2', name: 'Velvet Coat', mods: { hp: 20 }, text: m => `+${m.hp} max HP.` }),
      node({ id: 'p_standin', name: 'Quick Change', mods: { standinCd: 1 }, text: m => `Stand-In ${cd(m.standinCd)}.` }),
      node({ id: 'p_understudy', name: 'Understudy', key: true, mods: { understudy: 1 },
        text: () => `${cap(part(NODE_N.p_understudy.share))} of every enemy hit on an ally next to your Doll goes to the Doll instead, and allies you Switch get a ${NODE_N.p_understudy.shield} shield.` })] }],
  mirrormime: [
    { name: 'Quicksilver', role: 'tank', color: '#b8c8e8', nodes: [
      node({ id: 'm_hp', name: 'Silvered Skin', mods: { hp: 25 }, text: m => `+${m.hp} max HP.` }),
      node({ id: 'm_reach', name: 'Long Glance', mods: { reflectRange: 2 }, text: m => `Reflect range +${m.reflectRange}.` }),
      node({ id: 'm_shield', name: 'Backing Glass', mods: { mirrorShield: 10 }, text: m => `Whoever you Mirror also gets a ${m.mirrorShield} shield.` }),
      node({ id: 'm_quick', name: 'Quicksilver', key: true, mods: { quicksilver: 1 },
        text: () => `Units you Mirror turn back ${part(REFLECT)} of every enemy hit until their next turn, not just the first.` })] },
    { name: 'Hall of Mirrors', role: 'damage', color: '#e08aff', nodes: [
      node({ id: 'm_rico', name: 'Bank Shot', mods: { ricochetDmg: 4 }, text: m => `Ricochet +${m.ricochetDmg} damage.` }),
      node({ id: 'm_retort', name: 'Sharp Tongue', mods: { retortDmg: 4 }, text: m => `Retort +${m.retortDmg} damage.` }),
      node({ id: 'm_shatter', name: 'Thin Glass', mods: { shatterDmg: 6 }, text: m => `Shatter +${m.shatterDmg} damage.` }),
      node({ id: 'm_hall', name: 'Hall of Mirrors', key: true, mods: { hallMirrors: 1 },
        text: () => `A hit your Mirror turns back comes back whole, and your Reflect flashes: ${NODE_N.m_hall.flash} to every enemy within ${NODE_N.m_hall.radius} of whoever you Mirror.` })] },
    { name: 'Smoke and Mirrors', role: 'support', color: '#9fe8d8', nodes: [
      node({ id: 'm_reversal', name: 'Sleight', mods: { reversalRange: 2 }, text: m => `Reversal range +${m.reversalRange}.` }),
      node({ id: 'm_hp2', name: 'Greasepaint', mods: { hp: 20 }, text: m => `+${m.hp} max HP.` }),
      node({ id: 'm_ball', name: 'Spotlight', mods: { ballCd: 1 }, text: m => `Mirrorball ${cd(m.ballCd)}.` }),
      node({ id: 'm_smoke', name: 'Smoke and Mirrors', key: true, mods: { smokeMirrors: 1, reflectCd: 1 },
        text: m => `Units you Mirror also turn back every debuff an enemy puts on them until their next turn, and Reflect’s ${cd(m.reflectCd)}.` })] }],
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

/** The resonances' numbers: the engine reads them here, the pair texts quote them. */
export const PAIR_N = {
  deathknell: { bleed: 2 },
  conjunction: { dmg: 0.25 },
  charnel: { soulTurns: 2, souls: 1 },
  pealofbells: { range: 1, cd: 1 },
  bonepuppet: { reform: 1 },
  clockwork: { hp: 20, walk: 1 },
  commedia: { share: 0.5 },
  troupe: { hp: 15, reform: 1 },
  infinitymirror: { range: 1, cd: 1 },
};

const PN = PAIR_N;

const PAIR_TABLE = [
  { id: 'seconddawn', a: 'astromancer', b: 'gravecaller', name: 'Second Dawn', text: 'A Recall that lands on a Downed ally stands it back up at the HP it had when you cast.' },
  { id: 'appointedhour', a: 'astromancer', b: 'bellringer', name: 'Appointed Hour', text: 'An enemy Tolled while standing in one of your pending Calls’ areas is Rooted.' },
  { id: 'deathknell', a: 'gravecaller', b: 'bellringer', name: 'Death Knell', text: `Downed enemies lose ${PN.deathknell.bleed} bleed a turn instead of 1.` },
  { id: 'fatedstrings', a: 'astromancer', b: 'marionettist', name: 'Fated Strings', text: 'An enemy your Dance leaves standing in one of your pending Calls’ areas is Rooted.' },
  { id: 'bonepuppet', a: 'gravecaller', b: 'marionettist', name: 'Bone Puppet', text: `Your Doll drops a Soul when it breaks, and reforms ${PN.bonepuppet.reform} round sooner.` },
  { id: 'clockwork', a: 'bellringer', b: 'marionettist', name: 'Clockwork Doll', text: `Your Doll gets +${PN.clockwork.hp} max HP, and Strings walks it ${PN.clockwork.walk} tile farther.` },
  { id: 'commedia', a: 'marionettist', b: 'mirrormime', name: 'Commedia', text: `A hit on your Doll turns ${part(PN.commedia.share)} of it back on the attacker.` },
  { id: 'prism', a: 'astromancer', b: 'mirrormime', name: 'Prism', text: 'Your Calls pass through Mirrored allies without hurting them.' },
  { id: 'blackmirror', a: 'gravecaller', b: 'mirrormime', name: 'Black Mirror', text: 'A hit a Mirror turns back drops a Soul on the attacker’s tile.' },
  { id: 'echochamber', a: 'bellringer', b: 'mirrormime', name: 'Echo Chamber', text: 'An enemy whose hit a Mirror turns back is Hushed.' },
  { id: 'conjunction', a: 'astromancer', b: 'astromancer', name: 'Conjunction', text: `A Call that lands in a round where another of your Calls already landed deals +${pct(PN.conjunction.dmg)}.` },
  { id: 'charnel', a: 'gravecaller', b: 'gravecaller', name: 'Charnel House', text: `Souls last ${PN.charnel.soulTurns} rounds longer, and each Gravecaller holds ${PN.charnel.souls} more.` },
  { id: 'pealofbells', a: 'bellringer', b: 'bellringer', name: 'Peal of Bells', text: `Each Bellringer’s Toll gets +${PN.pealofbells.range} range and −${PN.pealofbells.cd} cooldown. A unit still can’t be Tolled twice in a round.` },
  { id: 'troupe', a: 'marionettist', b: 'marionettist', name: 'Troupe', text: `Each Doll gets +${PN.troupe.hp} max HP and reforms ${PN.troupe.reform} round sooner.` },
  { id: 'infinitymirror', a: 'mirrormime', b: 'mirrormime', name: 'Infinity Mirror', text: `Each Mirrormime’s Reflect gets +${PN.infinitymirror.range} range and −${PN.infinitymirror.cd} cooldown.` },
] satisfies readonly PairDef[];

export const PAIRS: readonly PairDef[] = PAIR_TABLE;

export type EveryPairListed = Assert<NoMissing<PairId, (typeof PAIR_TABLE)[number]['id']>>;

const COVERAGE_HP = 40;

export const COVERAGE = {
  id: 'coverage', name: 'Role Coverage', hp: COVERAGE_HP, text: `A tank, a damage and a support path: +${COVERAGE_HP} max HP for everyone.`,
} satisfies { id: PartyBonusId; name: string; hp: number; text: string };

// ---------- statuses: durations count the owner's turns and tick down at the end of each of them ----------
export interface StatusDef { name: string; icon: string; color: string; bad?: true; text: string }

const STATUS_TABLE = {
  stun: { name: 'Stunned', icon: '💫', color: '#ffd36b', bad: true, text: 'Loses its next turn.' },
  root: { name: 'Rooted', icon: '🌿', color: '#8fe36b', bad: true, text: 'Can’t move on its next turn.' },
  wet: { name: 'Wet', icon: '💧', color: '#4fb3ff', bad: true, text: `Thunderhead Conducts (×${WET_SHOCK}), Frostbolt Freezes (stun). Can’t burn.` },
  burn: { name: 'Burning', icon: '🔥', color: '#ff7a3a', bad: true, text: 'Takes fire damage at the start of its turn.' },
  expose: { name: 'Exposed', icon: '🩸', color: '#ff8a8a', bad: true, text: `Takes +${pct(EXPOSE)} damage.` },
  encased: { name: 'Encased', icon: '🧊', color: '#b8e8ff', text: 'Skips its turn, can’t be damaged or moved.' },
  wither: { name: 'Withered', icon: '🥀', color: '#b89a6a', bad: true, text: `Can’t be healed or shielded. A hit that leaves it at ${pct(REAP_AT)} HP or less Downs it (REAP).` },
  hush: { name: 'Hushed', icon: '🔇', color: '#c8b4ff', bad: true, text: 'Can move and use its basic attack, nothing else. Free skills included.' },
  guard: { name: 'Bell Guard', icon: '🛎️', color: '#e0b04a', text: 'Until its next turn, enemies that hit it are Hushed.' },
  haste: { name: 'Quickened', icon: '💨', color: '#8fd1ff', text: `+${HASTE_MOVE} move on its next turn.` },
  mirror: { name: 'Mirrored', icon: '🪞', color: '#c8d4ff', text: `Until its next turn, ${part(REFLECT)} of the next enemy hit on it goes back to the attacker instead.` },
  mock: { name: 'Mocked', icon: '🤡', color: '#ff9ad0', bad: true, text: 'Its skills that target a unit can only target the Mirrormime that Mocked it.' },
  standin: { name: 'Stand-In', icon: '🪆', color: '#d9a066', text: 'Until its next turn, hits on allies next to its Doll go to the Doll instead.' },
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

  const def: SkillDef = { name: b.name, icon: ranged ? '✦' : '⚔️', target: 'enemy', range: b.range, cd: 0, basic: true, cls, color: '#e8e2d0',
    text: `${ranged ? 'Ranged attack' : 'Melee attack'} for ${b.dmg}. Finishes Downed enemies.` };

  if (ranged) def.los = true;

  return def;
}

/** Each skill's numbers: its handler reads them here, its text quotes them. Fractions are of max HP; `mult`s multiply the hit. */
export const SKILL_N = {
  snap: { power: 0.5 },
  meteor: { center: 30, edge: 15 },
  thunderhead: { radius: 1, dmg: 20 },
  gravitywell: { radius: 2, pull: 2 },
  frostbolt: { dmg: 12, iceTurns: 3 },
  firebolt: { dmg: 14, combust: 12, combustMult: 3 },
  prison: { range: 3, turns: 1 },
  lastrites: { range: 3, hp: 0.4 },
  bonewall: { turns: 2 },
  wither: { turns: 2 },
  soulbolt: { dmg: 14, perSoul: 6 },
  soulburst: { radius: 1, dmg: 18 },
  siphon: { dmg: 12, reach: 3 },
  equalize: { most: 30 },
  toll: { range: 4 },
  knell: { dmg: 12, lateMult: 1.5 },
  peal: { radius: 2, dmg: 10, perActed: 3 },
  encore: { range: 3 },
  bellguard: { shield: 25 },
  switch: { range: 3 },
  dance: { steps: 2 },
  tangle: { dmg: 6 },
  razorwire: { dmg: 16, reach: 6 },
  splinter: { dmg: 22 },
  rebuild: { shield: 15 },
  glasswall: { turns: 2 },
  reflect: { range: 3 },
  ricochet: { dmg: 12, bounce: 8, reach: 2 },
  retort: { dmg: 10, took: 0.5 },
  mirrorball: { radius: 2, dmg: 8 },
  shatter: { dmg: 16 },
  reversal: { range: 3, reach: 3 },
  helpup: { hp: 0.3 },
};

const K = SKILL_N;

const SKILL_TABLE = {
  snap: { name: 'Snap', icon: '✨', target: 'self', cd: 3, free: true, innate: true, cls: 'astromancer', color: '#9a8cff',
    text: `Free. Your oldest pending Call lands right now, at ${part(K.snap.power)} power.` },
  meteor: { name: 'Meteor', icon: '☄️', target: 'tile', range: 6, cd: 3, aoe: 1, call: true, map: true, cls: 'astromancer', color: '#ff6a2b', sets: ['Burning'],
    text: `Call. ${K.meteor.center} at the center, ${K.meteor.edge} around, and Burning. Ignites grass, bursts braziers.` },
  thunderhead: { name: 'Thunderhead', icon: '⛈️', target: 'tile', range: 5, cd: 2, aoe: K.thunderhead.radius, call: true, cls: 'astromancer', color: '#c9a7ff', pays: [`Wet → CONDUCT ×${WET_SHOCK}`],
    text: `Call. ${K.thunderhead.dmg} shock to everyone in a ${side(K.thunderhead.radius)} area. Wet: CONDUCT, ×${WET_SHOCK}.` },
  gravitywell: { name: 'Gravity Well', icon: '🌀', target: 'tile', range: 5, cd: 3, aoe: K.gravitywell.radius, call: true, map: true, cls: 'astromancer', color: '#7a6aff', sets: ['Slam → Stun', 'Abyss → Downed'],
    text: `Call. Everyone within ${K.gravitywell.radius} of the center is pulled ${K.gravitywell.pull} toward it, nearest first. Into a wall or unit: SLAM. Into a chasm: ABYSS.` },
  frostbolt: { name: 'Frostbolt', icon: '❄️', target: 'enemy', range: 4, los: true, cd: 2, cls: 'astromancer', color: '#7fd8ff', sets: ['Rooted'], pays: ['Wet → FREEZE (stun)'], map: true,
    text: `${K.frostbolt.dmg} and Rooted. Against Wet: FREEZE, stunned instead. Freezes water within 1.` },
  firebolt: { name: 'Firebolt', icon: '🔥', target: 'enemy', range: 4, los: true, cd: 2, cls: 'astromancer', color: '#ff9a4a', sets: ['Burning'], pays: ['Burning → COMBUST'],
    text: `${K.firebolt.dmg} and Burning. Against a Burning target: COMBUST, ${K.firebolt.combust} plus its remaining burn ×${K.firebolt.combustMult}, at once.` },
  prison: { name: 'Glacial Prison', icon: '🧊', target: 'any', range: K.prison.range, cd: 3, cls: 'astromancer', color: '#b8e8ff',
    text: `Any other unit is Encased for ${K.prison.turns} turn: it skips its turn and can’t be damaged or moved. Then it’s Wet.` },
  recall: { name: 'Recall', icon: '⏪', target: 'ally', range: 4, cd: 3, call: true, cls: 'astromancer', color: '#ffe08a',
    text: 'Call. When it lands, the ally snaps back to where it stood when you cast, if that’s free, and gets back the HP it lost since.' },

  harvest: { name: 'Harvest', icon: '🌾', target: 'self', cd: 2, free: true, innate: true, cls: 'gravecaller', color: '#9fe0b8',
    text: `Free. Gather every Soul within ${HARVEST_RANGE}. You also gather a Soul by ending a move on it. You hold ${SOULS}.` },
  lastrites: { name: 'Last Rites', icon: '🕯️', target: 'downed', range: K.lastrites.range, cd: 3, rite: true, cls: 'gravecaller', color: '#fff3b0',
    text: `Rite. A Downed ally within ${K.lastrites.range} stands up at ${pct(K.lastrites.hp)} HP, paid from your own HP (never your last).` },
  bonewall: { name: 'Bone Wall', icon: '🦴', target: 'tile', range: 3, cd: 2, empty: true, map: true, rite: true, cls: 'gravecaller', color: '#e8e2d0',
    text: `Rite. A wall of 3 tiles across your line, for ${K.bonewall.turns} rounds. It blocks moves and sight. Tiles with units are skipped.` },
  wither: { name: 'Wither', icon: '🥀', target: 'enemy', range: 3, cd: 3, rite: true, cls: 'gravecaller', color: '#b89a6a', sets: ['Withered → REAP'],
    text: `Rite. Withered for ${K.wither.turns} turns: no healing or shields, and a hit that leaves it at ${pct(REAP_AT)} HP or less Downs it (REAP).` },
  soulbolt: { name: 'Soul Bolt', icon: '👻', target: 'enemy', range: 4, los: true, cd: 2, cls: 'gravecaller', color: '#9fe0b8',
    text: `${K.soulbolt.dmg}, plus ${K.soulbolt.perSoul} for each Soul you hold. Spends none.` },
  soulburst: { name: 'Soul Burst', icon: '💥', target: 'tile', range: 4, cd: 2, aoe: K.soulburst.radius, map: true, cls: 'gravecaller', color: '#c06aff',
    text: `A Soul on the ground bursts: ${K.soulburst.dmg} to every enemy within ${K.soulburst.radius} of it.` },
  siphon: { name: 'Siphon', icon: '🩸', target: 'enemy', range: 3, cd: 2, cls: 'gravecaller', color: '#ff8a8a',
    text: `${K.siphon.dmg}, and the most wounded ally within ${K.siphon.reach} of you (yourself included) heals what it took.` },
  equalize: { name: 'Equalize', icon: '⚖️', target: 'any', range: 3, cd: 3, cls: 'gravecaller',
    text: `Your HP % and its HP % even out, moving at most ${K.equalize.most} HP. Take from an enemy healthier than you, give to an ally hurt worse.` },

  toll: { name: 'Toll', icon: '🔔', target: 'any', range: K.toll.range, cd: 2, free: true, innate: true, cls: 'bellringer', color: '#e0b04a',
    text: `Free. A unit within ${K.toll.range} that hasn’t acted this round: an enemy moves to the end of the round, an ally to right after you. Once per unit per round.` },
  knell: { name: 'Knell', icon: '🔕', target: 'enemy', range: 4, los: true, cd: 2, cls: 'bellringer', color: '#e0b04a', pays: [`Late → ×${K.knell.lateMult}, Rooted`],
    text: `${K.knell.dmg}. Late (it already acted this round): ×${K.knell.lateMult} and Rooted.` },
  hush: { name: 'Hush', icon: '🔇', target: 'enemy', range: 3, cd: 3, cls: 'bellringer', color: '#c8b4ff', sets: ['Hushed'],
    text: 'Hushed for its next turn: it can move and use its basic attack, nothing else. Free innates included.' },
  peal: { name: 'Peal', icon: '📯', target: 'self', aoe: K.peal.radius, cd: 2, cls: 'bellringer', color: '#ffd36b',
    text: `Every enemy within ${K.peal.radius} takes ${K.peal.dmg}, plus ${K.peal.perActed} for each unit that already acted this round.` },
  encore: { name: 'Encore', icon: '🎭', target: 'ally', range: K.encore.range, cd: 4, noSelf: true, cls: 'bellringer', color: '#8fd1ff',
    text: `An ally within ${K.encore.range} that already acted this round takes an extra turn at the end of the round. Cooldowns don’t tick on that turn.` },
  overture: { name: 'Overture', icon: '🎼', target: 'self', cd: 4, free: true, cls: 'bellringer', color: '#8fd1ff',
    text: 'Free. Every ally that hasn’t acted this round moves to right after you, in its current order. Not a Toll.' },
  hourglass: { name: 'Hourglass', icon: '⏳', target: 'any', range: 3, cd: 3, cls: 'bellringer',
    text: 'Its timed statuses run out now. An enemy takes its remaining Burn at once and loses its shield; an ally only loses its debuffs.' },
  bellguard: { name: 'Bell Guard', icon: '🛎️', target: 'self', cd: 3, cls: 'bellringer', color: '#e0b04a',
    text: `A ${K.bellguard.shield} shield. Until your next turn, enemies that hit you are Hushed.` },

  strings: { name: 'Strings', icon: '🧵', target: 'tile', cd: 1, free: true, innate: true, cls: 'marionettist', color: '#d9a066',
    text: `Free, once a turn. Your Doll walks up to ${DOLL.walk} tiles, ending within ${DOLL.leash} of you.` },
  switch: { name: 'Switch', icon: '🔀', target: 'ally', range: K.switch.range, cd: 3, free: true, cls: 'marionettist', color: '#ffd38a',
    text: 'Free. You, or an ally in range, trade places with your Doll.' },
  dance: { name: 'Dance', icon: '💃', target: 'any', range: 4, cd: 3, cls: 'marionettist', color: '#ff9a6a',
    text: `Another unit takes up to ${K.dance.steps} steps toward your Doll, stopping at anything in the way.` },
  tangle: { name: 'Tangle', icon: '🕸️', target: 'self', cd: 3, cls: 'marionettist', color: '#c08a4a', sets: ['Rooted'],
    text: `Every enemy next to your Doll takes ${K.tangle.dmg} and is Rooted.` },
  razorwire: { name: 'Razor Wire', icon: '〰️', target: 'self', cd: 2, cls: 'marionettist', color: '#ff7a5a',
    text: `Every enemy on the line between you and your Doll (up to ${K.razorwire.reach} apart) takes ${K.razorwire.dmg}.` },
  splinter: { name: 'Splinter', icon: '💥', target: 'self', cd: 3, cls: 'marionettist', color: '#ff9a3a',
    text: `Your Doll bursts: ${K.splinter.dmg} to every enemy next to it. It breaks.` },
  standin: { name: 'Stand-In', icon: '🪆', target: 'self', cd: 3, cls: 'marionettist', color: '#d9a066',
    text: 'Until your next turn, hits on allies next to your Doll go to the Doll instead.' },
  rebuild: { name: 'Rebuild', icon: '🔨', target: 'self', cd: 4, cls: 'marionettist', color: '#ffd38a',
    text: `A broken Doll reforms next to you now; a standing one mends to full and gets a ${K.rebuild.shield} shield.` },

  reflect: { name: 'Reflect', icon: '🪞', target: 'ally', range: K.reflect.range, cd: 2, free: true, innate: true, cls: 'mirrormime', color: '#c8d4ff', sets: ['Mirrored'],
    text: `Free. You or an ally is Mirrored until its next turn: ${part(REFLECT)} of the next enemy hit on it goes back to the attacker instead.` },
  glasswall: { name: 'Invisible Wall', icon: '🧱', target: 'tile', range: 3, cd: 3, empty: true, map: true, cls: 'mirrormime', color: '#d8f0ff',
    text: `3 tiles of glass across your line, for ${K.glasswall.turns} rounds. They block moves, not sight, and an enemy’s shot aimed through them hits the shooter.` },
  ricochet: { name: 'Ricochet', icon: '🎱', target: 'enemy', range: 4, los: true, cd: 2, cls: 'mirrormime', color: '#e08aff',
    text: `${K.ricochet.dmg}, then it bounces to the nearest other enemy within ${K.ricochet.reach} for ${K.ricochet.bounce}.` },
  retort: { name: 'Retort', icon: '💬', target: 'enemy', range: 3, los: true, cd: 2, cls: 'mirrormime', color: '#ff8ab0',
    text: `${K.retort.dmg}, plus ${part(K.retort.took)} the HP you lost since your last turn.` },
  mock: { name: 'Mock', icon: '🤡', target: 'enemy', range: 3, cd: 3, cls: 'mirrormime', color: '#ff9ad0', sets: ['Mocked'],
    text: 'Mocked for its next turn: its skills that target a unit can only target you.' },
  mirrorball: { name: 'Mirrorball', icon: '🪩', target: 'self', aoe: K.mirrorball.radius, cd: 4, cls: 'mirrormime', color: '#f0e0ff', sets: ['Mirrored'],
    text: `Every ally within ${K.mirrorball.radius} (you too) is Mirrored, and every enemy within ${K.mirrorball.radius} takes ${K.mirrorball.dmg}.` },
  shatter: { name: 'Shatter', icon: '🔪', target: 'self', cd: 2, cls: 'mirrormime', color: '#d8f0ff',
    text: `All your glass shatters: ${K.shatter.dmg} to every enemy next to it, once each.` },
  reversal: { name: 'Reversal', icon: '🔄', target: 'ally', range: K.reversal.range, cd: 3, cls: 'mirrormime', color: '#9fe8d8',
    text: `An ally’s debuffs go to the nearest enemy within ${K.reversal.reach} of it, with the turns they had left.` },

  helpup: { name: 'Help Up', icon: '🤝', target: 'downed', range: 1, cd: 0, color: '#fff3b0', generic: true,
    text: `Pull a Downed ally next to you back up at ${pct(K.helpup.hp)} HP, paid from your own HP (never your last).` },

  basic_astromancer: basicSkill('astromancer'),
  basic_gravecaller: basicSkill('gravecaller'),
  basic_bellringer: basicSkill('bellringer'),
  basic_marionettist: basicSkill('marionettist'),
  basic_mirrormime: basicSkill('mirrormime'),
} satisfies Record<SkillId, SkillDef>;

export const SKILLS: Readonly<Record<SkillId, SkillDef>> = SKILL_TABLE;

export function isCall(id: SkillId): id is CallSkill { return !!SKILLS[id].call; }

export const COMBO_INFO = {
  SLAM: 'Forced into an obstacle: stunned.', ABYSS: 'Forced into a chasm or pit: Downed at its edge.', FREEZE: 'Frostbolt on a Wet enemy: stunned.',
  CONDUCT: `Thunderhead on a Wet enemy: ×${WET_SHOCK}.`, COMBUST: `Firebolt on a Burning enemy: the whole burn at once, ×${K.firebolt.combustMult}.`,
  EXECUTE: 'Any hit on a Downed enemy finishes it.', IGNITE: 'Fire on a brazier: it bursts into flames.',
  REAP: `A hit leaves a Withered enemy (or a Reaper’s target) at ${pct(REAP_AT)} HP or less: Downed at once.`,
} satisfies Record<ComboName, string>;
