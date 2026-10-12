export type Team = 0 | 1;

export type UnitId = number & { readonly __brand: 'UnitId' };

export interface Pos { x: number; z: number }

export type TerrainChar = '.' | '#' | 'o' | '~' | 'G' | '^' | 'B' | '+' | 'I' | 'A';

export type MapId = 'span' | 'storm' | 'altar';

export type ClassId = 'astromancer' | 'gravecaller' | 'bellringer' | 'marionettist' | 'mirrormime';

export type Role = 'tank' | 'damage' | 'support';

/** A class's pool: a build picks SKILL_PICKS of its four. */
export type ClassSkillId =
  | 'thunderhead' | 'frostbolt' | 'firebolt' | 'recall'
  | 'siphon' | 'wither' | 'soulbolt' | 'bonewall'
  | 'knell' | 'bellguard' | 'hush' | 'peal'
  | 'razorwire' | 'dance' | 'switch' | 'standin'
  | 'ricochet' | 'glasswall' | 'retort' | 'reversal';

/** Each class's ultimate: the same for every build, on the public timer ULT_TURNS sets. */
export type UltId = 'fallingstar' | 'crossing' | 'encore' | 'command' | 'showstopper';

/** Every build has its class's innate: the class mechanic, always on. */
export type InnateSkillId = 'snap' | 'harvest' | 'toll' | 'strings' | 'reflect';

export type BasicSkillId = `basic_${ClassId}`;

export type SkillId = ClassSkillId | InnateSkillId | UltId | BasicSkillId | 'helpup';

/** Skills that mark an area now and land at the start of the caster's next activation. */
export type CallSkill = 'thunderhead' | 'recall' | 'fallingstar';

/** `any`: any other unit. `friend`: an ally, standing or Downed. `foe`: a standing enemy character, never a Doll. `line`: one of the four tiles next to the caster, naming a direction. */
export type SkillTarget = 'enemy' | 'ally' | 'downed' | 'friend' | 'any' | 'foe' | 'tile' | 'line' | 'self';

export type NodeId =
  | 'a_frost' | 'a_reach' | 'a_wet' | 'a_zero'
  | 'a_fire' | 'a_range' | 'a_burn' | 'a_twin'
  | 'a_recall' | 'a_hp' | 'a_cleanse' | 'a_benev'
  | 'g_hp' | 'g_cap' | 'g_ward' | 'g_undying'
  | 'g_bolt' | 'g_reach' | 'g_siphon' | 'g_reap'
  | 'g_line' | 'g_hp2' | 'g_shield' | 'g_ferry'
  | 'b_hp' | 'b_clapper' | 'b_guard' | 'b_thee'
  | 'b_knell' | 'b_last' | 'b_peal' | 'b_final'
  | 'b_reach' | 'b_encore' | 'b_hp2' | 'b_accel'
  | 'p_doll' | 'p_hp' | 'p_reform' | 'p_tangled'
  | 'p_lash' | 'p_wire' | 'p_waltz' | 'p_ventriloquist'
  | 'p_switch' | 'p_hp2' | 'p_wide' | 'p_understudy'
  | 'm_hp' | 'm_reach' | 'm_shield' | 'm_quick'
  | 'm_rico' | 'm_retort' | 'm_edge' | 'm_hall'
  | 'm_reversal' | 'm_hp2' | 'm_spot' | 'm_smoke';

/** Summed numeric effects of a character's passive-tree picks. */
export type Mods = Partial<Record<
  | 'hp'
  | 'ultCd'
  | 'fireDmg' | 'callRange' | 'burnDmg' | 'twinStars' | 'frostDmg' | 'frostRange' | 'callWet' | 'absZero'
  | 'recallRange' | 'recallCleanse' | 'benevolent' | 'basicDmg'
  | 'soulCap' | 'soulShield' | 'undying' | 'soulBoltDmg' | 'harvestRange' | 'siphonDmg' | 'reap' | 'crossingLen' | 'riteShield' | 'ferryman'
  | 'guardShield' | 'tollHush' | 'knellDmg' | 'lastDmg' | 'pealDmg' | 'finalHour' | 'tollRange' | 'accel'
  | 'dollHp' | 'dollReform' | 'tangled' | 'wireDmg' | 'danceSteps' | 'ventriloquist' | 'switchRange' | 'standinReach' | 'understudy'
  | 'reflectRange' | 'mirrorShield' | 'quicksilver' | 'ricochetDmg' | 'retortDmg' | 'glassDmg' | 'hallMirrors' | 'reversalRange' | 'smokeMirrors' | 'reflectCd',
  number>>;

/** A pair of classes in a party; `a === b` means that class twice. */
export type PairId =
  | 'seconddawn' | 'appointedhour' | 'deathknell'
  | 'fatedstrings' | 'bonepuppet' | 'clockwork' | 'commedia'
  | 'prism' | 'blackmirror' | 'echochamber'
  | 'conjunction' | 'charnel' | 'pealofbells' | 'troupe' | 'infinitymirror';

export type PartyBonusId = PairId | 'coverage';

export type PartyBonuses = ReadonlySet<PartyBonusId>;

export type ComboName = 'SLAM' | 'ABYSS' | 'FREEZE' | 'CONDUCT' | 'COMBUST' | 'EXECUTE' | 'IGNITE' | 'REAP';

/** `t` counts the owner's remaining turns. `by` is the unit that applied it (null for terrain), shown as the combo's setup. */
export interface Timed { t: number; by: UnitId | null }

export interface Statuses {
  stun?: Timed;
  root?: Timed;
  wet?: Timed;
  expose?: Timed;
  burn?: Timed & { dmg: number };
  /** Can't be healed or shielded; a hit that leaves it at 20% HP or less Downs it (REAP). */
  wither?: Timed;
  /** Can move and use its basic attack, nothing else. */
  hush?: Timed;
  /** Bell Guard until the next turn of the Bellringer that rang it (`by`): enemies that hit it are Hushed. */
  guard?: Timed;
  /** +2 move on its next turn (Accelerando). */
  haste?: Timed;
  /** Reflect until its next turn: half the next enemy hit on it goes back to the attacker. `all` turns back every hit, not just the first (Showstopper). `spent` once that hit came, kept only while it still turns back debuffs (Smoke and Mirrors). */
  mirror?: Timed & { spent?: true; all?: true };
  /** Its skills that target a unit can only target the Mirrormime that Mocked it. */
  mock?: Timed;
  /** Stand-In until the Marionettist's next turn: hits on allies next to its Doll go to the Doll. */
  standin?: Timed;
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
  /** Souls a Gravecaller holds; 0 for everyone else. */
  souls: number;
  /** HP lost since the end of its last turn (Retort). */
  took: number;
  /** Set on a Marionettist's Doll only: the Marionettist that works it. A Doll never takes a turn and isn't a character. */
  owner?: UnitId;
  /** A broken Doll reforms at the start of its owner's first turn in this round or later. */
  reform?: number;
}

/** Overlays on a tile. Each number is the rounds left. */
export interface TileFx {
  fire?: number;
  smoke?: number;
  ice?: number;
  /** A Bone Wall: blocks moves and sight like a wall. */
  bone?: number;
  /** An Invisible Wall: blocks moves, not sight; `glassBy` is the party it belongs to, whose enemies' shots through it bounce. */
  glass?: number;
  glassBy?: Team;
  spent?: true;
}

/** A Soul on the ground, one per tile. `t` is rounds left. */
export interface Soul { x: number; z: number; t: number }

/** A pending Call. `recall` is Recall's snapshot of the ally, taken at cast. */
export interface Call {
  by: UnitId; team: Team; skill: CallSkill; x: number; z: number;
  recall: { id: UnitId; x: number; z: number; hp: number } | null;
}

/** One turn in the round's queue. `extra`: a turn beyond the unit's own (Encore) or its own put off to the end (Final Hour); cooldowns don't tick on it. */
export interface Turn { id: UnitId; extra: boolean }

export type Phase =
  /** Before round 1: the battle waits for its `begin`, so the opening round's events reach whoever applies it. */
  | { kind: 'ready' }
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

/** Command Performance's orders for the enemy it takes: the tile it walks to (its own to stay), then the unit its basic attack hits, or null for none. */
export interface Puppet { to: Pos; hit: Pos | null }

/** Every change to a battle goes through one of these. `unit` names the acting unit so a stale or replayed command is rejected. `puppet` carries Command Performance's orders and is read by no other skill. */
export type Command =
  | { kind: 'begin' }
  | { kind: 'move'; unit: UnitId; to: Pos }
  | { kind: 'cast'; unit: UnitId; skill: SkillId; at: Pos; puppet?: Puppet }
  | { kind: 'endTurn'; unit: UnitId };

export type DamageKind = 'phys' | 'fire' | 'frost' | 'shock' | 'burn' | 'dark' | 'slam' | 'storm' | 'drain' | 'mirror';

export type TerrainChange = 'ice' | 'smoke' | 'bone' | 'glass';

export type BattleEvent =
  | { type: 'round'; round: number; starter: Team; queue: Turn[] }
  /** A Toll or an Encore changed this round's queue. */
  | { type: 'queue'; queue: Turn[] }
  | { type: 'activate'; id: UnitId; team: Team; qi: number }
  | { type: 'move'; id: UnitId; path: Pos[]; slide?: true }
  | { type: 'teleport'; id: UnitId; x: number; z: number }
  | { type: 'fall'; id: UnitId; x: number; z: number }
  | { type: 'cast'; id: UnitId; team: Team; skill: SkillId; tx: number; tz: number; fx: number; fz: number; target: UnitId | null }
  | { type: 'damage'; id: UnitId; amount: number; absorbed: number; kind: DamageKind }
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
  /** A Soul drops on a tile. */
  | { type: 'soul'; x: number; z: number }
  /** A Gravecaller takes the Souls from these tiles into its hand. */
  | { type: 'gather'; id: UnitId; from: Pos[] }
  /** A Gravecaller spends `n` held Souls: what a Rite costs, or one for an Undying turn instead of bleeding. */
  | { type: 'spend'; id: UnitId; n: number }
  /** A hit (amount > 0) or a debuff (amount 0) on `id` turns back on `to`. */
  | { type: 'reflect'; id: UnitId; to: UnitId; amount: number }
  /** A shot aimed through glass at (x, z) bounces back on the caster `id`. */
  | { type: 'bounce'; id: UnitId; x: number; z: number }
  /** A hit on `from` goes to its party's Doll `to` instead (Stand-In, Understudy). */
  | { type: 'standin'; from: UnitId; to: UnitId }
  /** A Doll at 0 HP breaks; it reforms at the start of its owner's turn in round `reform`. */
  | { type: 'break'; id: UnitId; reform: number }
  | { type: 'reform'; id: UnitId; x: number; z: number }
  | { type: 'roundEnd'; round: number; burnt: number[] }
  | { type: 'over'; winner: Team | 'draw'; reason: OverReason };

export type ApplyResult =
  | { ok: true; state: BattleState; events: BattleEvent[] }
  | { ok: false; error: string };
