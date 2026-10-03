import { expect, test } from 'vitest';
import { NODE, SKILLS, POINTS, mulberry32, treeValid } from '../engine/index';
import { defaultDraft, randomMember } from './draft';

test('a random member has 3 of its class skills, one keystone and the rest of its points in one other path', () => {
  const base = defaultDraft({ allAi: true, map: 'span' }).teams[0][0]!, rnd = mulberry32(5);
  for (let i = 0; i < 40; i++) {
    const m = randomMember(base, rnd), nodes = m.tree.map(id => NODE[id]!);
    expect(new Set(m.skills).size).toBe(3);
    expect(m.skills.every(id => SKILLS[id].cls === m.cls)).toBe(true);
    expect(m.tree.length).toBe(POINTS);
    expect(treeValid(m.cls, m.tree)).toBe(true);
    expect(nodes.filter(n => n.key).length).toBe(1);
    expect(new Set(nodes.map(n => n.branch)).size).toBe(2);
  }
});
