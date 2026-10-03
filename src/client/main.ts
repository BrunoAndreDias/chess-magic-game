import './style.css';
import { MAP_ORDER, mulberry32 } from '../engine/index';
import type { BattleState } from '../engine/index';
import { createApp } from './app';
import type { Phase } from './app';
import { createBoard } from './board/index';
import { byId } from './dom';
import { defaultDraft, drawMap } from './draft';
import { installErrorOverlay } from './overlay';
import { trackMouse } from './tooltip';

declare global {
  interface Window {
    __party: { state(): BattleState | null; tileXY(x: number, z: number): { x: number; y: number }; phase(): Phase };
  }
}

installErrorOverlay();
trackMouse();
const params = new URLSearchParams(location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isFinite(seedParam) ? seedParam : Math.floor(Math.random() * 2 ** 31);
const board = createBoard(byId<HTMLCanvasElement>('board'), byId('labels'));
const app = createApp(board, byId('ui'), seed);
const map = MAP_ORDER.find(id => id === params.get('map')) ?? drawMap(mulberry32(seed ^ 0x5eed));
const draft = defaultDraft({ allAi: params.has('ai'), map });

window.__party = {
  state: () => app.mounted()?.state() ?? null,
  tileXY: (x, z) => { const p = board.screenOf({ x, z }); return { x: Math.round(p.x), y: Math.round(p.y) }; },
  phase: () => app.mounted()?.phase() ?? 'map',
};

app.go({ kind: params.has('quick') ? 'scout' : 'map', draft });
