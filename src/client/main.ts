import './style.css';
import { MAP_ORDER, mulberry32 } from '../engine/index';
import type { BattleState, MapId } from '../engine/index';
import { createApp } from './app';
import type { Phase } from './app';
import { createBoard } from './board/index';
import { byId } from './dom';
import { defaultDraft, resolveMap } from './draft';
import { installErrorOverlay } from './overlay';
import { trackMouse } from './tooltip';

declare global {
  interface Window {
    __party: { state(): BattleState | null; tileXY(x: number, z: number): { x: number; y: number }; phase(): Phase };
  }
}

function mapParam(v: string | null): MapId | 'random' {
  return MAP_ORDER.find(id => id === v) ?? 'random';
}

installErrorOverlay();
trackMouse();
const params = new URLSearchParams(location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isFinite(seedParam) ? seedParam : Math.floor(Math.random() * 2 ** 31);
const board = createBoard(byId<HTMLCanvasElement>('board'), byId('labels'));
const app = createApp(board, byId('ui'), seed);
const draft = defaultDraft({ allAi: params.has('ai'), map: mapParam(params.get('map')) });

window.__party = {
  state: () => app.mounted()?.state() ?? null,
  tileXY: (x, z) => { const p = board.screenOf({ x, z }); return { x: Math.round(p.x), y: Math.round(p.y) }; },
  phase: () => app.mounted()?.phase() ?? 'setup',
};

if (params.has('quick')) {
  app.go({ kind: 'scout', draft, map: resolveMap(draft, mulberry32(seed ^ 0x5eed)) });
} else {
  app.go({ kind: 'setup', draft });
}
