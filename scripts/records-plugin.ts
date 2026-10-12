import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';
import type { GameRecord } from '../src/host/record';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();

/** Short HEAD, with +dirty when tracked files differ. 'unknown' outside a git checkout. */
function commitId(): string {
  try {
    return git('rev-parse', '--short', 'HEAD') + (git('status', '--porcelain', '--untracked-files=no') ? '+dirty' : '');
  } catch {
    return 'unknown';
  }
}

/** The boundary check: a v1 record with a command list, else null. */
function parseRecord(text: string): Partial<GameRecord> | null {
  try {
    const body: Partial<GameRecord> | null = JSON.parse(text);

    return body?.v === 1 && Array.isArray(body.commands) ? body : null;
  } catch {
    return null;
  }
}

/** Dev server only: POST /api/games appends a finished battle's record to a JSON-lines file. */
export function gameRecords(): Plugin {
  return {
    name: 'game-records',
    apply: 'serve',
    configureServer(server) {
      const commit = commitId();
      const file = resolve(server.config.root, process.env.GAMES_FILE ?? 'games/games.jsonl');

      server.middlewares.use('/api/games', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();

          return;
        }

        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const r = parseRecord(Buffer.concat(chunks).toString('utf8'));

          if (!r) {
            res.statusCode = 400;
            res.end();

            return;
          }

          mkdirSync(dirname(file), { recursive: true });
          appendFileSync(file, `${JSON.stringify({ ...r, id: randomUUID(), at: new Date().toISOString(), commit })}\n`);
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}
