import { describe, expect, test } from 'vitest';
import { newMember } from '../engine/index';
import type { BattleSetup, ClassId, MapId, OverReason, Team } from '../engine/index';
import { Match } from './match';
import type { Seat, Seats } from './match';
import { replay, summarize } from './record';
import type { GameRecord, StoredRecord } from './record';

const setup: BattleSetup = {
  map: 'span', starter: 0,
  teams: [[newMember('bellringer', 'Wi'), newMember('astromancer', 'As'), newMember('bellringer', 'We')], [newMember('gravecaller', 'Gr'), newMember('gravecaller', 'Gw'), newMember('astromancer', 'As')]],
};

const ai: Seats = [[{ kind: 'ai' }, { kind: 'ai' }, { kind: 'ai' }], [{ kind: 'ai' }, { kind: 'ai' }, { kind: 'ai' }]];

function played() {
  const match = new Match(setup, ai, 42);
  const before = match.record();
  match.start();
  const record = match.record();

  if (!record) throw new Error('the battle did not finish');

  return { match, before, record } satisfies { match: Match; before: GameRecord | null; record: GameRecord };
}

describe('GameRecord', () => {
  test('a Match gives no record until it is over, then one that replays to its final state', () => {
    const { match, before, record } = played();
    expect(before).toBe(null);
    expect(record.result).toEqual({ winner: 0, reason: 'wipe', rounds: 7, favor: [0, 0], combos: [3, 3], stats: { dmg: [221, 195], heal: [0, 30], downs: [3, 1], revives: [0, 0] } });
    expect(record.commands.length).toBe(103);
    expect(replay(record)).toEqual(match.state);
  });

  test('a record that went through JSON still replays to the same ending', () => {
    const rec = played().record;
    const state = replay(JSON.parse(JSON.stringify(rec)));
    expect(state.phase).toEqual({ kind: 'over', winner: 0, reason: 'wipe' });
  });

  test('a record missing its last command does not reach the end', () => {
    const rec = played().record;
    const short = { ...rec, commands: rec.commands.slice(0, -1) };
    expect(replay(short).phase.kind).toBe('act');
    expect(replay(rec).phase.kind).toBe('over');
  });

  test('a command the engine rejects throws', () => {
    const rec = played().record;
    const [first, ...rest] = rec.commands;
    expect(() => replay({ ...rec, commands: [...rest, ...(first ? [first] : [])] })).toThrow(/command 0 .* rejected/);
  });
});

describe('summarize', () => {
  const human: Seat = { kind: 'player', player: 'me' };
  const team = (cls: ClassId) => [newMember(cls, 'a'), newMember(cls, 'b'), newMember(cls, 'c')];

  function rec(map: MapId, winner: Team | 'draw', reason: OverReason, rounds: number, blue: ClassId, red: ClassId, seats: Seats, commit: string): StoredRecord {
    const base = played().record;

    return { ...base, id: 'x', at: 'now', commit, seats, setup: { ...base.setup, map, teams: [team(blue), team(red)] }, result: { ...base.result, winner, reason, rounds } };
  }

  test('counts wins, reasons and rounds per map, human win rate, class win share and commits', () => {
    const rs = [
      rec('span', 0, 'wipe', 7, 'bellringer', 'gravecaller', [[human, human, human], ai[1]], 'aaa'),
      rec('altar', 1, 'altar', 5, 'astromancer', 'bellringer', ai, 'aaa'),
      rec('span', 'draw', 'rounds', 20, 'bellringer', 'astromancer', [ai[0], [human, { kind: 'ai' }, { kind: 'ai' }]], 'bbb'),
    ];

    expect(summarize(rs)).toEqual({
      games: 3,
      maps: {
        span: { games: 2, blue: 1, red: 0, draws: 1, reasons: { wipe: 1, rounds: 1 }, avgRounds: 13.5 },
        altar: { games: 1, blue: 0, red: 1, draws: 0, reasons: { altar: 1 }, avgRounds: 5 },
      },
      human: { games: 2, wins: 1, rate: 0.5 },
      classes: {
        bellringer: { fielded: 9, wins: 6, share: 6 / 9 },
        gravecaller: { fielded: 3, wins: 0, share: 0 },
        astromancer: { fielded: 6, wins: 0, share: 0 },
      },
      commits: { aaa: 2, bbb: 1 },
    });
  });
});
