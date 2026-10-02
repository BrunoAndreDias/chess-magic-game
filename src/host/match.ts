import { aiOrder, aiTurn, apply, createBattle, current, getUnit, mulberry32 } from '../engine/index';
import type { ApplyResult, BattleEvent, BattleSetup, BattleState, Command, Rng, Team } from '../engine/index';

export type Seat = { kind: 'player'; player: string } | { kind: 'ai' };
/** Seats by team, then by slot. A slot with no seat is AI-held. */
export type Seats = readonly [readonly Seat[], readonly Seat[]];
export type MatchListener = (events: readonly BattleEvent[], state: BattleState) => void;

const TEAMS: readonly Team[] = [0, 1];

/**
 * The authority over one battle: it holds the real state, checks who may send each command,
 * and plays the AI seats from its own seeded rng. Nothing here knows about transport.
 */
export class Match {
  #state: BattleState;
  readonly #rng: Rng;
  readonly #seats: Seats;
  readonly #listeners = new Set<MatchListener>();

  constructor(setup: BattleSetup, seats: Seats, seed: number) {
    this.#rng = mulberry32(seed);
    this.#seats = seats;
    this.#state = createBattle(setup, this.#rng);
  }

  get state(): BattleState { return this.#state; }

  subscribe(fn: MatchListener): () => void {
    this.#listeners.add(fn);
    return () => { this.#listeners.delete(fn); };
  }

  /** Plays AI seats until a player has to act (or the battle ends). */
  start(): void { this.#drive(); }

  submit(player: string, cmd: Command): ApplyResult {
    const denied = this.#denied(player, cmd);
    if (denied) return { ok: false, error: denied };
    const r = this.#commit(cmd);
    if (r.ok) this.#drive();
    return r;
  }

  #seat(team: Team, slot: number): Seat { return this.#seats[team][slot] ?? { kind: 'ai' }; }
  #aiTeam(team: Team): boolean { return this.#state.units.every(u => u.team !== team || this.#seat(team, u.slot).kind === 'ai'); }

  #denied(player: string, cmd: Command): string | null {
    if (cmd.kind === 'order') {
      const holds = this.#state.units.some(u => u.team === cmd.team && this.#holder(u.team, u.slot) === player);
      return holds ? null : `${player} holds no seat on team ${cmd.team}`;
    }
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
    for (const fn of this.#listeners) fn(r.events, r.state);
    return r;
  }

  #drive(): void {
    for (;;) {
      const s = this.#state, ph = s.phase;
      if (ph.kind === 'over') return;
      if (ph.kind === 'order') {
        const waiting = TEAMS.filter(t => !ph.orders[t] && this.#aiTeam(t));
        if (!waiting.length) return;
        const picks = waiting.map(t => ({ t, order: aiOrder(s, t, this.#rng) }));
        for (const { t, order } of picks) this.#must({ kind: 'order', team: t, order });
        continue;
      }
      const u = current(s);
      if (!u || this.#seat(u.team, u.slot).kind !== 'ai') return;
      for (const cmd of aiTurn(s, this.#rng)) this.#must(cmd);
    }
  }
  #must(cmd: Command): void {
    const r = this.#commit(cmd);
    if (!r.ok) throw new Error(`AI command ${JSON.stringify(cmd)} rejected: ${r.error}`);
  }
}
