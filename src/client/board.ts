import type { BattleEvent, BattleState, Pos, Team, UnitId } from '../engine/types';

export type HighlightTone = 'move' | 'target' | 'aoe' | 'deploy' | 'path' | 'selected' | 'hazard' | 'friendly' | 'altar';

/** `hazard` and `friendly` (allies a Call would hit) draw on their own striped layer, so they still show under a move or target tile. `opacity` overrides the tone's. */
export interface Highlight { tiles: readonly Pos[]; tone: HighlightTone; opacity?: number }

export type TileInput = { kind: 'hover'; tile: Pos | null } | { kind: 'click'; tile: Pos; button: 'left' | 'right' };

/**
 * The 3D board. It only draws: it never holds game rules or decides anything.
 * The HUD drives it with state snapshots and engine events, and hears tile input back.
 */
export interface Board {
  /** Rebuild terrain and units from scratch (new battle or a jump to an unrelated state). */
  load(state: BattleState): void;
  /** Animate the events that turned `before` into `after`, then leave the scene matching `after`. `onEvent` runs (and is awaited) as each event starts. */
  play(events: readonly BattleEvent[], before: BattleState, after: BattleState, onEvent?: (e: BattleEvent) => Promise<void> | void): Promise<void>;
  /** Replace every highlight layer at once. */
  highlight(layers: readonly Highlight[]): void;
  /** Ease the camera to a unit, seen from its party's side. Null returns to the overview of `team`'s side. */
  focus(unit: UnitId | null, team: Team): void;
  setFollow(on: boolean): void;
  onInput(listener: (input: TileInput) => void): void;
  /** Viewport pixel position of a tile's centre, for the HUD's floating labels and the browser playtest. */
  screenOf(tile: Pos): { x: number; y: number };
  dispose(): void;
}
