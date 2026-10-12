import type { GameRecord } from '../host/record';

/** Dev only: hands a finished battle to the dev server, which appends it to games/games.jsonl. Never blocks or fails the game. */
export function saveRecord(r: GameRecord): void {
  if (!import.meta.env.DEV) return;
  fetch('/api/games', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r) })
    .then(res => { if (!res.ok) console.warn(`game record not saved: ${res.status}`); })
    .catch((e: Error) => { console.warn(`game record not saved: ${e.message}`); });
}
