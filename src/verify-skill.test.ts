import { readFileSync, readdirSync } from 'node:fs';
import { expect, test } from 'vitest';

// The verify-party-tactics skill drives the client by its ids and data attributes; this keeps its docs from naming ones the client dropped.
const skill = new URL('../.claude/skills/verify-party-tactics/', import.meta.url);

const client = new URL('client/', import.meta.url);

const read = (base: URL, f: string) => readFileSync(new URL(f, base), 'utf8');

const docs = ['SKILL.md', ...readdirSync(new URL('features/', skill)).filter(f => f.endsWith('.md')).map(f => `features/${f}`)].map(f => read(skill, f));

const source = readdirSync(client, { recursive: true, encoding: 'utf8' }).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')).map(f => read(client, f)).join('\n');

/** Every `#id` and `[data-key` inside a markdown code span. */
function handles(md: string): string[] {
  const spans = [...md.matchAll(/`([^`\n]+)`/g)].map(m => m[1] ?? '');

  return spans.flatMap(s => [...[...s.matchAll(/#([A-Za-z][\w-]*)/g)].map(m => `#${m[1]}`), ...[...s.matchAll(/\[data-([\w-]+)/g)].map(m => `[data-${m[1]}]`)]);
}

/** An id is set or looked up as a quoted string (`id: 'x'`, `byId('x')`) or in a selector; a data key is set through `h`'s `data` prop or read from `dataset`. */
function inClient(handle: string): boolean {
  const data = /^\[data-(.+)\]$/.exec(handle);

  if (data) return new RegExp(`data: \\{[^}]*\\b${data[1]}:|dataset\\.${data[1]}\\b`).test(source);
  const id = handle.slice(1);

  return new RegExp(`['"\`]${id}['"\`]|['"\`\\s]#${id}\\b`).test(source);
}

test('every handle the verify skill names exists in the client', () => {
  const named = [...new Set(docs.flatMap(handles))];
  expect(named).toContain('#pk-lock');
  expect(named.filter(h => !inClient(h))).toEqual([]);
});

test('the verify skill lists the client phases', () => {
  const row = /^\| `phase\(\)` \|(.*)$/m.exec(docs[0] ?? '')?.[1] ?? '';
  const union = /export type Phase = ([^;]+);/.exec(read(client, 'app.ts'))?.[1] ?? '';
  const names = (s: string) => [...s.matchAll(/'(\w+)'/g)].map(m => m[1]);
  expect(names(row)).toEqual(names(union));
  expect(names(row)).toEqual(['map', 'picks', 'scout', 'battle', 'result']);
});
