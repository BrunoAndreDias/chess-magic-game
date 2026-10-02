export type Team = 0 | 1;
export type UnitId = number & { readonly __brand: 'UnitId' };

export interface Pos { x: number; z: number }

export type TerrainChar = '.' | '#' | 'o' | '~' | 'G' | '^' | 'B' | '+' | 'I';
export type MapId = 'crypt' | 'chasm' | 'ruins' | 'library';
export type ClassId = 'warden' | 'wizard' | 'ranger' | 'cleric' | 'rogue';
export type Role = 'tank' | 'damage' | 'support';

export type ClassSkillId =
  | 'shieldbash' | 'guard' | 'taunt' | 'barricade' | 'sunder'
  | 'fireball' | 'frostbolt' | 'lightning' | 'flood' | 'combust'
  | 'mark' | 'pinshot' | 'snipe' | 'volley' | 'smokearrow'
  | 'heal' | 'resurrect' | 'bless' | 'sanctuary' | 'judgment'
  | 'backstab' | 'shadowstep' | 'poison' | 'kidney' | 'smokebomb';
export type BasicSkillId = `basic_${ClassId}`;
export type SkillId = ClassSkillId | BasicSkillId | 'helpup';
export type SkillTarget = 'enemy' | 'ally' | 'downed' | 'tile' | 'self';

export type NodeId =
  | 'w_hp' | 'w_gs' | 'w_unb' | 'w_mv' | 'w_hb' | 'w_jug' | 'w_cmd' | 'w_int' | 'w_rally'
  | 'z_kin' | 'z_fs' | 'z_wild' | 'z_hoar' | 'z_gla' | 'z_deep' | 'z_foc' | 'z_arc' | 'z_ovr'
  | 'r_trk' | 'r_pred' | 'r_hm' | 'r_ste' | 'r_per' | 'r_dead' | 'r_ls' | 'r_qd' | 'r_hr'
  | 'c_gh' | 'c_sw' | 'c_life' | 'c_fer' | 'c_swj' | 'c_cru' | 'c_aeg' | 'c_vig' | 'c_mar'
  | 'g_ke' | 'g_opp' | 'g_exe' | 'g_fl' | 'g_gw' | 'g_van' | 'g_vir' | 'g_lin' | 'g_ven';

/** Summed numeric effects of a character's passive-tree picks. */
export type Mods = Partial<Record<
  | 'hp' | 'guardShield' | 'stunImmune' | 'move' | 'pushDist' | 'juggernaut' | 'dmg' | 'exposeOnTaunt' | 'rally'
  | 'burnDmg' | 'fireDmg' | 'wildfire' | 'rootTurns' | 'frostDmg' | 'deepFreeze' | 'range' | 'chain' | 'overcharge'
  | 'markTurns' | 'predator' | 'markAmt' | 'highDmg' | 'deadeye' | 'basicDmg' | 'hitrun'
  | 'heal' | 'reviveHp' | 'lifeline' | 'judgCd' | 'crusade' | 'sanctShield' | 'martyr'
  | 'opportunist' | 'executioner' | 'grasswalk' | 'vanish' | 'poisonDmg' | 'poisonTurns' | 'venom',
  number>>;

export type PairId =
  | 'bastion' | 'holdblast' | 'anvilarrow' | 'hammer' | 'blessed'
  | 'crossfire' | 'smokefire' | 'guiding' | 'pack' | 'shadowmend';
export type PartyBonusId = PairId | 'trinity';
export type PartyBonuses = ReadonlySet<PartyBonusId>;

export type ComboName =
  | 'SLAM' | 'ABYSS' | 'FREEZE' | 'CONDUCT' | 'COMBUST' | 'PINNED' | 'JUDGMENT' | 'SHATTER' | 'EXECUTE' | 'IGNITE';

/** `t` counts the owner's remaining turns. `by` is the unit that applied it (null for terrain), shown as the combo's setup. */
interface Timed { t: number; by: UnitId | null }
export interface Statuses {
  stun?: Timed;
  root?: Timed;
  wet?: Timed;
  expose?: Timed;
  haste?: Timed;
  burn?: Timed & { dmg: number };
  poison?: Timed & { dmg: number; venom: boolean };
  mark?: Timed & { amt: number; pred: boolean };
  empower?: Timed & { amt: number };
  taunt?: Timed;
  guard?: { by: UnitId };
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
  /** Nonzero only after Hit & Run grants a second, shorter move. */
  moveCap: number;
}

/** Overlays on a tile. Each number is the rounds left, except `whp` (barricade HP). */
export interface TileFx {
  fire?: number;
  smoke?: number;
  ice?: number;
  flood?: number;
  wall?: number;
  whp?: number;
  spent?: true;
}

export type Phase =
  | { kind: 'order'; orders: [UnitId[] | null, UnitId[] | null] }
  | { kind: 'act'; queue: UnitId[]; qi: number }
  | { kind: 'over'; winner: Team | 'draw'; reason: 'wipe' | 'mutual' | 'rounds' };

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
  stats: BattleStats;
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

export type DamageKind = 'phys' | 'fire' | 'frost' | 'shock' | 'holy' | 'poison' | 'burn' | 'dark' | 'slam' | 'guard';
export type TerrainChange = 'wall' | 'ice' | 'flood' | 'smoke';

export type BattleEvent =
  | { type: 'round'; round: number; starter: Team; queue: UnitId[] }
  | { type: 'activate'; id: UnitId; team: Team; qi: number }
  | { type: 'move'; id: UnitId; path: Pos[]; slide?: true }
  | { type: 'teleport'; id: UnitId; x: number; z: number }
  | { type: 'fall'; id: UnitId; x: number; z: number }
  | { type: 'cast'; id: UnitId; team: Team; skill: SkillId; tx: number; tz: number; fx: number; fz: number; target: UnitId | null; empowered: boolean; chain?: UnitId[] }
  | { type: 'damage'; id: UnitId; amount: number; absorbed: number; kind: DamageKind }
  | { type: 'guarded'; id: UnitId; by: UnitId }
  | { type: 'heal'; id: UnitId; amount: number }
  | { type: 'shield'; id: UnitId; amount: number }
  | { type: 'status'; id: UnitId; key: StatusKey }
  | { type: 'resist'; id: UnitId }
  | { type: 'steam'; id: UnitId }
  | { type: 'cleanse'; id: UnitId }
  | { type: 'combo'; name: ComboName; id: UnitId | null; by: UnitId; team: Team; setup: UnitId | null }
  | { type: 'downed'; id: UnitId; team: Team }
  | { type: 'revive'; id: UnitId; by: UnitId | null }
  | { type: 'death'; id: UnitId; team: Team; cause: 'finished' | 'bled' }
  | { type: 'bleed'; id: UnitId; left: number }
  | { type: 'skip'; id: UnitId }
  | { type: 'dark'; id: UnitId; amount: number }
  | { type: 'burst'; x: number; z: number }
  | { type: 'fire'; x: number; z: number }
  | { type: 'terrain'; tiles: Pos[]; kind: TerrainChange }
  | { type: 'roundEnd'; round: number; burnt: number[] }
  | { type: 'over'; winner: Team | 'draw'; reason: 'wipe' | 'mutual' | 'rounds' };

export type ApplyResult =
  | { ok: true; state: BattleState; events: BattleEvent[] }
  | { ok: false; error: string };
