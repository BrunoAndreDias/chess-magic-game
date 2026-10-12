import { existsSync, readFileSync } from 'node:fs';
import { MAP_ORDER, MAPS } from '../src/engine/index';
import { summarize } from '../src/host/record';
import type { StoredRecord, Summary } from '../src/host/record';

// Reads the battles the dev server recorded and prints win rates by map, end reasons, human win rate and class win share.
//
//   npm run games [-- <file>]     default games/games.jsonl

const file = process.argv[2] ?? 'games/games.jsonl';

if (!existsSync(file)) {
  console.error(`no records at ${file}; finish a battle in \`npm run dev\` first`);
  process.exit(1);
}

const records: StoredRecord[] = [];

let malformed = 0;

for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (!line.trim()) continue;

  try {
    const r: StoredRecord | null = JSON.parse(line);

    if (r?.v === 1 && r.result && r.setup && r.seats && Array.isArray(r.commands)) records.push({ ...r, commit: r.commit ?? 'unknown' });
    else malformed++;
  } catch {
    malformed++;
  }
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

const games = (n: number) => `${n} game${n === 1 ? '' : 's'}`;

function report(s: Summary): string {
  const out = [`${games(s.games)}${malformed ? `, ${malformed} malformed line${malformed === 1 ? '' : 's'} skipped` : ''}`, ''];

  for (const id of MAP_ORDER) {
    const m = s.maps[id];

    if (!m) continue;
    const reasons = Object.entries(m.reasons).map(([k, n]) => `${k} ${n}`).join(', ');
    out.push(`${MAPS[id].name}: ${games(m.games)}, Blue ${m.blue} / Red ${m.red} / draw ${m.draws}, ${reasons}, avg ${m.avgRounds.toFixed(1)} rounds`);
  }

  out.push('', s.human.games ? `Player's side vs AI: ${s.human.wins}/${s.human.games} won (${pct(s.human.rate)})` : 'Player vs AI games: none', '', 'Class: characters fielded, win share');

  for (const [cls, c] of Object.entries(s.classes).sort((a, b) => b[1].share - a[1].share)) out.push(`  ${cls.padEnd(12)} ${String(c.fielded).padStart(4)}  ${pct(c.share)}`);
  out.push('', `Games per commit: ${Object.entries(s.commits).map(([k, n]) => `${k} ${n}`).join(', ')}`);

  return out.join('\n');
}

console.log(report(summarize(records)));
