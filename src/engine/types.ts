export type Team = 0 | 1;
export type UnitId = number & { readonly __brand: 'UnitId' };

export interface Pos { x: number; z: number }

export type TerrainChar = '.' | '#' | 'o' | '~' | 'G' | '^' | 'B' | '+' | 'I' | 'A';
export type MapId = 'span' | 'storm' | 'altar';
export type ClassId = 'astromancer' | 'weaver' | 'gravecaller' | 'bellringer';
export type Role = 'tank' | 'damage' | 'support';

export type ClassSkillId =
  | 'meteor' | 'thunderhead' | 'gravitywell' | 'frostbolt' | 'firebolt' | 'prison' | 'recall'
  | 'reel' | 'web' | 'cocoon' | 'venombite' | 'puppet' | 'sharedpain' | 'skitter'
  | 'lastrites' | 'bonewall' | 'wither' | 'soulbolt' | 'soulburst' | 'siphon' | 'equalize'
  | 'knell' | 'hush' | 'peal' | 'encore' | 'overture' | 'hourglass' | 'bellguard';
/** Every build has its class's innate: the class mechanic, always on. */
export type InnateSkillId = 'snap' | 'tether' | 'harvest' | 'toll';
export type BasicSkillId = `basic_${ClassId}`;
export type SkillId = ClassSkillId | InnateSkillId | BasicSkillId | 'helpup';
/** Skills that mark an area now and land at the start of the caster's next activation. */
export type CallSkill = 'meteor' | 'thunderhead' | 'gravitywell' | 'recall';
/** `any`: any other unit. `friend`: an ally, standing or Downed. */
export type SkillTarget = 'enemy' | 'ally' | 'downed' | 'friend' | 'any' | 'tile' | 'self';

export type NodeId =
  | 'a_frost' | 'a_prison' | 'a_wet' | 'a_zero'
  | 'a_fire' | 'a_range' | 'a_burn' | 'a_twin'
  | 'a_recall' | 'a_hp' | 'a_cleanse' | 'a_benev'
  | 'w_hp' | 'w_leash' | 'w_thread' | 'w_fate'
  | 'w_poison' | 'w_fang' | 'w_bite' | 'w_feast'
  | 'w_cocoon' | 'w_reach' | 'w_silk' | 'w_spare'
  | 'g_hp' | 'g_cap' | 'g_ward' | 'g_undying'
  | 'g_bolt' | 'g_reach' | 'g_burst' | 'g_reap'
  | 'g_rites' | 'g_hp2' | 'g_shield' | 'g_ferry'
  | 'b_hp' | 'b_clapper' | 'b_guard' | 'b_thee'
  | 'b_knell' | 'b_last' | 'b_peal' | 'b_final'
  | 'b_reach' | 'b_encore' | 'b_hp2' | 'b_accel';

/** Summed numeric effects of a character's passive-tree picks. */
export type Mods = Partial<Record<
  | 'hp'
  | 'fireDmg' | 'callRange' | 'burnDmg' | 'twinStars' | 'frostDmg' | 'prisonCd' | 'callWet' | 'absZero'
  | 'recallRange' | 'recallCleanse' | 'benevolent'
  | 'leashDmg' | 'threads' | 'webOfFate' | 'poisonDmg' | 'basicDmg' | 'biteHeal' | 'feast'
  | 'cocoonCd' | 'threadRange' | 'webTurns' | 'fateWeaver'
  | 'soulCap' | 'soulShield' | 'undying' | 'soulBoltDmg' | 'harvestRange' | 'burstDmg' | 'reap' | 'riteRange' | 'riteShield' | 'ferryman'
  | 'guardShield' | 'tollHush' | 'tollCd' | 'knellDmg' | 'lastDmg' | 'pealDmg' | 'finalHour' | 'tollRange' | 'encoreCd' | 'accel',
  number>>;

/** A pair of classes in a party; `a === b` means that class twice. */
export type PairId = 'startether' | 'conjunction' | 'greatweb';
export type PartyBonusId = PairId | 'coverage';
export type PartyBonuses = ReadonlySet<PartyBonusId>;

export type ComboName = 'SLAM' | 'ABYSS' | 'FREEZE' | 'CONDUCT' | 'COMBUST' | 'SHATTER' | 'EXECUTE' | 'IGNITE' | 'REAP';

/** `t` counts the owner's remaining turns. `by` is the unit that applied it (null for terrain), shown as the combo's setup. */
export interface Timed { t: number; by: UnitId | null }
export interface Statuses {
  stun?: Timed;
  root?: Timed;
  wet?: Timed;
  expose?: Timed;
  burn?: Timed & { dmg: number };
  poison?: Timed & { dmg: number };
  /** Skips its turns, takes no damage, can't be moved. `ice`: a Glacial Prison, which leaves it Wet. */
  encased?: Timed & { ice: boolean };
  /** Shared Pain on the Weaver: half the damage to the allies it holds comes to it. */
  share?: Timed;
  /** Can't be healed or shielded; a hit that leaves it at 20% HP or less Downs it (REAP). */
  wither?: Timed;
  /** Can move and use its basic attack, nothing else. */
  hush?: Timed;
  /** Bell Guard until the Bellringer's next turn: enemies that hit it are Hushed. */
  guard?: Timed;
  /** +2 move on its next turn (Accelerando). */
  haste?: Timed;
}
export type StatusKey = keyof Statuses;

export type Life =
  | { kind: 'up' }
  | { kind: 'downed'; bleed: number }
  | { kind: 'dead' };

export interface Unit {
  id: UnitId;
  team: Team;
  slot: number;
  name: string;
  cls: ClassId;
  skills: readonly ClassSkillId[];
  tree: readonly NodeId[];
  mods: Mods;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  shield: number;
  life: Life;
  st: Statuses;
  cd: Partial<Record<SkillId, number>>;
  moved: boolean;
  acted: boolean;
  /** Fate Weaver already saved it once. */
  spared: boolean;
  /** Souls a Gravecaller holds; 0 for everyone else. */
  souls: number;
}

/** Overlays on a tile. Each number is the rounds left. */
export interface TileFx {
  fire?: number;
  smoke?: number;
  ice?: number;
  web?: number;
  /** A Bone Wall: blocks moves, sight and Threads like a wall. */
  bone?: number;
  spent?: true;
}

/** A Soul on the ground, one per tile. `t` is rounds left. */
export interface Soul { x: number; z: number; t: number }

/** A pending Call. `recall` is Recall's snapshot of the ally, taken at cast. */
export interface Call {
  by: UnitId; team: Team; skill: CallSkill; x: number; z: number;
  recall: { id: UnitId; x: number; z: number; hp: number } | null;
}
/** A Weaver's Thread. `len` is the leash: how far the held enemy may end a move from the Weaver. */
export interface Thread { by: UnitId; to: UnitId; len: number }

/** One turn in the round's queue. `extra`: a turn beyond the unit's own (Encore) or its own put off to the end (Final Hour); cooldowns don't tick on it. */
export interface Turn { id: UnitId; extra: boolean }

export type Phase =
  | { kind: 'order'; orders: [UnitId[] | null, UnitId[] | null] }
  /** `tolled`: the units Tolled this round; a second Toll on one is refused. */
  | { kind: 'act'; queue: Turn[]; qi: number; tolled: UnitId[] }
  | { kind: 'over'; winner: Team | 'draw'; reason: OverReason };
export type OverReason = 'wipe' | 'mutual' | 'rounds' | 'altar';

export interface BattleStats {
  dmg: [number, number];
  heal: [number, number];
  downs: [number, number];
  revives: [number, number];
}

export interface BattleState {
  map: MapId;
  /** Base terrain, row-major, `z * N + x`. Burnt grass becomes floor. */
  terr: TerrainChar[];
  /** Same indexing as `terr`. */
  fx: (TileFx | undefined)[];
  units: Unit[];
  round: number;
  starter: Team;
  phase: Phase;
  party: [PartyBonuses, PartyBonuses];
  combos: [number, number];
  /** Sun Altar points; [0, 0] on every other map. */
  favor: [number, number];
  stats: BattleStats;
  souls: Soul[];
  /** Oldest first. */
  calls: Call[];
  /** Oldest first: a Weaver past its cap drops its oldest. */
  threads: Thread[];
  /** The round each team's Call last landed (Conjunction). */
  callRound: [number, number];
}

export interface MemberBuild {
  name: string;
  cls: ClassId;
  skills: readonly ClassSkillId[];
  tree: readonly NodeId[];
}

export interface BattleSetup {
  map: MapId;
  starter: Team;
  teams: [readonly MemberBuild[], readonly MemberBuild[]];
  /** Omitted or invalid deployments are placed by the AI. */
  deploy?: [readonly Pos[] | null, readonly Pos[] | null];
}

/** Every change to a battle goes through one of these. `unit` names the acting unit so a stale or replayed command is rejected. */
export type Command =
  | { kind: 'order'; team: Team; order: UnitId[] }
  | { kind: 'move'; unit: UnitId; to: Pos }
  | { kind: 'cast'; unit: UnitId; skill: SkillId; at: Pos }
  | { kind: 'endTurn'; unit: UnitId };

export type DamageKind = 'phys' | 'fire' | 'frost' | 'shock' | 'poison' | 'burn' | 'dark' | 'slam' | 'share' | 'storm' | 'drain';
export type TerrainChange = 'ice' | 'smoke' | 'web' | 'bone';

export type BattleEvent =
  | { type: 'round'; round: number; starter: Team; queue: Turn[] }
  /** A Toll, Overture or Encore changed this round's queue. */
  | { type: 'queue'; queue: Turn[] }
  | { type: 'activate'; id: UnitId; team: Team; qi: number }
  | { type: 'move'; id: UnitId; path: Pos[]; slide?: true }
  | { type: 'teleport'; id: UnitId; x: number; z: number }
  | { type: 'fall'; id: UnitId; x: number; z: number }
  | { type: 'cast'; id: UnitId; team: Team; skill: SkillId; tx: number; tz: number; fx: number; fz: number; target: UnitId | null }
  | { type: 'damage'; id: UnitId; amount: number; absorbed: number; kind: DamageKind }
  | { type: 'shared'; id: UnitId; by: UnitId }
  | { type: 'heal'; id: UnitId; amount: number }
  | { type: 'shield'; id: UnitId; amount: number }
  | { type: 'status'; id: UnitId; key: StatusKey }
  | { type: 'resist'; id: UnitId }
  | { type: 'steam'; id: UnitId }
  | { type: 'cleanse'; id: UnitId }
  | { type: 'combo'; name: ComboName; id: UnitId | null; by: UnitId; team: Team; setup: UnitId | null }
  | { type: 'downed'; id: UnitId; team: Team }
  | { type: 'revive'; id: UnitId; by: UnitId | null }
  | { type: 'death'; id: UnitId; team: Team; cause: 'finished' | 'bled' | 'fell' }
  | { type: 'bleed'; id: UnitId; left: number }
  | { type: 'skip'; id: UnitId }
  | { type: 'dark'; id: UnitId; amount: number }
  | { type: 'burst'; x: number; z: number }
  | { type: 'fire'; x: number; z: number }
  | { type: 'terrain'; tiles: Pos[]; kind: TerrainChange }
  | { type: 'storm'; line: string; tiles: Pos[] }
  | { type: 'crumble'; tiles: Pos[] }
  | { type: 'favor'; team: Team | null; favor: [number, number] }
  | { type: 'call'; id: UnitId; team: Team; skill: CallSkill; tiles: Pos[] }
  | { type: 'land'; id: UnitId; skill: CallSkill; x: number; z: number; tiles: Pos[]; power: number }
  | { type: 'fizzle'; id: UnitId }
  | { type: 'thread'; by: UnitId; to: UnitId }
  /** A Thread broke. */
  | { type: 'snap'; by: UnitId; to: UnitId }
  | { type: 'encased'; id: UnitId }
  /** A Soul drops on a tile. */
  | { type: 'soul'; x: number; z: number }
  /** A Gravecaller takes the Souls from these tiles into its hand. */
  | { type: 'gather'; id: UnitId; from: Pos[] }
  /** A Gravecaller spends a held Soul: a Rite, or an Undying turn instead of bleeding. */
  | { type: 'spend'; id: UnitId }
  | { type: 'roundEnd'; round: number; burnt: number[] }
  | { type: 'over'; winner: Team | 'draw'; reason: OverReason };

export type ApplyResult =
  | { ok: true; state: BattleState; events: BattleEvent[] }
  | { ok: false; error: string };
