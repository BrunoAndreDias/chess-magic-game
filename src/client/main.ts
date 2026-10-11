import './style.css';
import { MAP_ORDER, mulberry32 } from '../engine/index';
import type { BattleState } from '../engine/index';
import { createApp } from './app';
import type { Phase } from './app';
import { createBoard } from './board/index';
import type { BoardDebug } from './board/index';
import { mountPerfHud } from './board/perf';
import { loadFigures } from './board/models';
import { byId } from './dom';
import { defaultDraft, drawMap, drawStarter } from './draft';
import { installErrorOverlay } from './overlay';
import { trackMouse } from './tooltip';

declare global {
  interface Window {
    __party: { state(): BattleState | null; tileXY(x: number, z: number): { x: number; y: number }; phase(): Phase; board: BoardDebug };
  }
}

installErrorOverlay();

trackMouse();

const params = new URLSearchParams(location.search);

const seedParam = Number.parseInt(params.get('seed') ?? '', 10);

const seed = Number.isFinite(seedParam) ? seedParam : Math.floor(Math.random() * 2 ** 31);

const board = createBoard(byId('board', HTMLCanvasElement), byId('labels'));

const app = createApp(board, byId('ui'), seed);

const mapParam = params.get('map');

const map = mapParam === null ? drawMap(mulberry32(seed ^ 0x5eed)) : MAP_ORDER.find(id => id === mapParam);

if (!map) throw new Error(`Unknown ?map=${mapParam}: use one of ${MAP_ORDER.join(', ')}`);

const draft = defaultDraft({ allAi: params.has('ai'), map, starter: drawStarter(mulberry32(seed ^ 0xc017)) });

window.__party = {
  state: () => app.mounted()?.state() ?? null,
  tileXY: (x, z) => { const p = board.screenOf({ x, z }); return { x: Math.round(p.x), y: Math.round(p.y) }; },
  phase: () => app.mounted()?.phase() ?? 'map',
  board: board.debug,
};

if (params.has('perf')) mountPerfHud(board.debug);

await loadFigures();

app.go({ kind: params.has('quick') ? 'scout' : 'map', draft });
