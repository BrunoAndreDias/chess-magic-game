import { aiTurn, apply, createBattle, current, getUnit, mulberry32 } from '../engine/index';
import type { ApplyResult, BattleEvent, BattleSetup, BattleState, Command, Rng, Team } from '../engine/index';
import { resultOf } from './record';
import type { GameRecord } from './record';

export type Seat = { kind: 'player'; player: string } | { kind: 'ai' };

/** Seats by team, then by slot. A slot with no seat is AI-held. */
export type Seats = readonly [readonly Seat[], readonly Seat[]];

export type MatchListener = (events: readonly BattleEvent[], state: BattleState) => void;

/**
 * The authority over one battle: it holds the real state, checks who may send each command,
 * and plays the AI seats from its own seeded rng. Nothing here knows about transport.
 */
export class Match {
  #state: BattleState;
  readonly #rng: Rng;
  readonly #seats: Seats;
  readonly #setup: BattleSetup;
  readonly #seed: number;
  readonly #commands: Command[] = [];
  readonly #listeners = new Set<MatchListener>();
  readonly #pace: ((next: () => void) => void) | null;

  /** With `pace`, each AI turn after the first runs when `pace` calls it back, so a browser can play a run of AI turns without freezing a frame; without it they run back to back. */
  constructor(setup: BattleSetup, seats: Seats, seed: number, pace?: (next: () => void) => void) {
    this.#pace = pace ?? null;
    this.#rng = mulberry32(seed);
    this.#seats = seats;
    this.#setup = setup;
    this.#seed = seed;
    this.#state = createBattle(setup, this.#rng);
  }

  get state(): BattleState { return this.#state; }

  /** The finished battle as a replayable record, or null while it is still going. */
  record(): GameRecord | null {
    const result = resultOf(this.#state);

    return result && { v: 1, seed: this.#seed, setup: this.#setup, seats: this.#seats, commands: structuredClone(this.#commands), result };
  }

  subscribe(fn: MatchListener): () => void {
    this.#listeners.add(fn);

    return () => { this.#listeners.delete(fn); };
  }

  /** Opens round 1, then plays AI seats until a player has to act (or the battle ends). */
  start(): void {
    if (this.#state.phase.kind === 'ready') this.#must({ kind: 'begin' });
    this.#drive();
  }

  submit(player: string, cmd: Command): ApplyResult {
    const denied = this.#denied(player, cmd);

    if (denied) return { ok: false, error: denied };
    const r = this.#commit(cmd);

    if (r.ok) this.#drive();

    return r;
  }

  #seat(team: Team, slot: number): Seat { return this.#seats[team][slot] ?? { kind: 'ai' }; }

  #denied(player: string, cmd: Command): string | null {
    if (cmd.kind === 'begin') return 'the match begins itself';
    const u = getUnit(this.#state, cmd.unit);

    return u && this.#holder(u.team, u.slot) === player ? null : `${player} does not hold unit ${cmd.unit}`;
  }
  #holder(team: Team, slot: number): string | null {
    const seat = this.#seat(team, slot);

    return seat.kind === 'player' ? seat.player : null;
  }

  #commit(cmd: Command): ApplyResult {
    const r = apply(this.#state, cmd);

    if (!r.ok) return r;
    this.#state = r.state;
    this.#commands.push(cmd);

    for (const fn of this.#listeners) fn(r.events, r.state);

    return r;
  }

  #drive(): void {
    for (;;) {
      const s = this.#state;

      if (s.phase.kind === 'over') return;
      const u = current(s);

      if (!u || this.#seat(u.team, u.slot).kind !== 'ai') return;

      for (const cmd of aiTurn(s, this.#rng)) this.#must(cmd);

      if (this.#pace) { this.#pace(() => this.#drive()); return; }
    }
  }
  #must(cmd: Command): void {
    const r = this.#commit(cmd);

    if (!r.ok) throw new Error(`AI command ${JSON.stringify(cmd)} rejected: ${r.error}`);
  }
}
