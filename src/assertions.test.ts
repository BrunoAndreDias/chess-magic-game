import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from 'vitest';

const WEAK = /\.(toBeDefined|toBeTruthy|toBeFalsy|toBeInstanceOf|toMatchSnapshot|toMatchInlineSnapshot)\(|\.not\.toThrow\(|\.toHaveBeenCalled\(\)|\.toBeGreaterThan\(0\)/;

test('no test uses a matcher that passes without the behavior (the bar is in CLAUDE.md)', () => {
  const src = new URL('.', import.meta.url);
  const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter(f => f.endsWith('.test.ts'));
  const weak = files.flatMap(f => readFileSync(new URL(f, src), 'utf8').split('\n').flatMap((l, i) => (WEAK.test(l) ? [`src/${f}:${i + 1}: ${l.trim()}`] : [])));
  expect(weak).toEqual([]);
});
