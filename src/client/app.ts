import type { BattleState } from '../engine/index';
import type { Match } from '../host/match';
import type { Board, TileInput } from './board';
import type { Draft } from './draft';
import { mountBattle } from './screens/battle';
import { mountMap } from './screens/map';
import { mountPicks } from './screens/picks';
import { mountResult } from './screens/result';
import { mountScout } from './screens/scout';

export type Phase = 'map' | 'picks' | 'scout' | 'battle' | 'result';

/** The client state machine. The draft rides along every screen so Rematch and Change parties can rebuild from it. */
export type Screen =
  | { kind: 'map'; draft: Draft }
  | { kind: 'picks'; draft: Draft }
  | { kind: 'scout'; draft: Draft }
  | { kind: 'battle'; draft: Draft; match: Match }
  | { kind: 'result'; draft: Draft; final: BattleState };

/** What a mounted screen exposes back to the app. */
export interface Mounted {
  phase(): Phase;
  state(): BattleState | null;
  tile?(input: TileInput): void;
  key?(ev: KeyboardEvent): void;
  dispose(): void;
}

export interface Ctx {
  board: Board;
  /** Screens render into this element; it is emptied between screens. */
  ui: HTMLElement;
  seed: number;
  go(next: Screen): void;
}

export function createApp(board: Board, ui: HTMLElement, seed: number): { go(next: Screen): void; mounted(): Mounted | null } {
  let mounted: Mounted | null = null;
  const ctx: Ctx = { board, ui, seed, go };
  function go(next: Screen): void {
    mounted?.dispose();
    ui.replaceChildren();
    board.highlight([]);
    mounted = mount(ctx, next);
  }
  board.onInput(input => mounted?.tile?.(input));
  addEventListener('keydown', ev => {
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
    mounted?.key?.(ev);
  });
  return { go, mounted: () => mounted };
}

function mount(ctx: Ctx, s: Screen): Mounted {
  switch (s.kind) {
    case 'map': return mountMap(ctx, s.draft);
    case 'picks': return mountPicks(ctx, s.draft);
    case 'scout': return mountScout(ctx, s.draft);
    case 'battle': return mountBattle(ctx, s.draft, s.match);
    case 'result': return mountResult(ctx, s.draft, s.final);
  }
}
