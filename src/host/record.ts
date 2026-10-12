import { MAP_ORDER, MAX_ROUNDS, apply, createBattle, mulberry32 } from '../engine/index';
import type { BattleSetup, BattleState, BattleStats, ClassId, Command, MapId, OverReason, Team } from '../engine/index';
import type { Seats } from './match';

/** Everything needed to replay one finished battle, plus its outcome so a report never has to replay. */
export interface GameRecord {
  v: 1;
  seed: number;
  setup: BattleSetup;
  seats: Seats;
  /** Every committed command, human and AI, in order. */
  commands: Command[];
  result: {
    winner: Team | 'draw';
    reason: OverReason;
    rounds: number;
    favor: [number, number];
    combos: [number, number];
    stats: BattleStats;
  };
}

/** What the sink stores: the record plus what only the writer knows. */
export interface StoredRecord extends GameRecord { id: string; at: string; commit: string }

/** Plays the record's commands on a fresh battle. Throws when one is rejected. */
export function replay(r: GameRecord): BattleState {
  const rng = mulberry32(r.seed);
  let state = createBattle(r.setup, rng);

  r.commands.forEach((cmd, i) => {
    const res = apply(state, cmd);

    if (!res.ok) throw new Error(`command ${i} ${JSON.stringify(cmd)} rejected: ${res.error}`);
    state = res.state;
  });

  return state;
}

export function resultOf(final: BattleState): GameRecord['result'] | null {
  if (final.phase.kind !== 'over') return null;

  return {
    winner: final.phase.winner,
    reason: final.phase.reason,
    rounds: Math.min(final.round, MAX_ROUNDS),
    favor: [final.favor[0], final.favor[1]],
    combos: [final.combos[0], final.combos[1]],
    stats: structuredClone(final.stats),
  };
}

export interface MapSummary {
  games: number;
  blue: number;
  red: number;
  draws: number;
  reasons: Partial<Record<OverReason, number>>;
  avgRounds: number;
}

export interface ClassSummary {
  /** Characters of this class across all games. */
  fielded: number;
  /** Of those, the ones on the winning team. */
  wins: number;
  /** wins / fielded */
  share: number;
}

export interface Summary {
  games: number;
  maps: Partial<Record<MapId, MapSummary>>;
  /** Games where exactly one team has a player seat: how often that team won. Hot-seat games (both teams human) are left out. */
  human: { games: number; wins: number; rate: number };
  classes: Partial<Record<ClassId, ClassSummary>>;
  commits: Record<string, number>;
}

const isHuman = (team: Seats[Team]) => team.some(s => s.kind === 'player');

export function summarize(rs: readonly StoredRecord[]): Summary {
  const out: Summary = { games: rs.length, maps: {}, human: { games: 0, wins: 0, rate: 0 }, classes: {}, commits: {} };
  const rounds: Partial<Record<MapId, number>> = {};

  for (const r of rs) {
    const { winner, reason } = r.result;
    const m = out.maps[r.setup.map] ??= { games: 0, blue: 0, red: 0, draws: 0, reasons: {}, avgRounds: 0 };
    m.games++;

    if (winner === 'draw') m.draws++; else if (winner === 0) m.blue++; else m.red++;
    m.reasons[reason] = (m.reasons[reason] ?? 0) + 1;
    rounds[r.setup.map] = (rounds[r.setup.map] ?? 0) + r.result.rounds;

    const humans = ([0, 1] as const).filter(t => isHuman(r.seats[t]));

    if (humans.length === 1) {
      out.human.games++;

      if (humans[0] === winner) out.human.wins++;
    }

    for (const t of [0, 1] as const) {
      for (const member of r.setup.teams[t]) {
        const c = out.classes[member.cls] ??= { fielded: 0, wins: 0, share: 0 };
        c.fielded++;

        if (t === winner) c.wins++;
      }
    }

    out.commits[r.commit] = (out.commits[r.commit] ?? 0) + 1;
  }

  for (const id of MAP_ORDER) {
    const m = out.maps[id];

    if (m) m.avgRounds = (rounds[id] ?? 0) / m.games;
  }

  if (out.human.games) out.human.rate = out.human.wins / out.human.games;

  for (const c of Object.values(out.classes)) c.share = c.wins / c.fielded;

  return out;
}
