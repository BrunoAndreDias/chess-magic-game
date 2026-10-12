import { expect, test } from 'vitest';
import { NODE, SKILLS, POINTS, mulberry32, treeValid } from '../engine/index';
import type { PickState } from '../engine/index';
import { afterPicks, defaultDraft, randomMember } from './draft';

test('a random member keeps its class and has 3 of its skills, one keystone and the rest of its points in one other path', () => {
  const base = defaultDraft({ allAi: true, map: 'span', starter: 0 }).teams[0][0]!, rnd = mulberry32(5);

  for (let i = 0; i < 40; i++) {
    const m = randomMember(base, rnd), nodes = m.tree.map(id => NODE[id]!);
    expect(m.cls).toBe('gravecaller');
    expect(new Set(m.skills).size).toBe(3);
    expect(m.skills.every(id => SKILLS[id].cls === m.cls)).toBe(true);
    expect(m.tree.length).toBe(POINTS);
    expect(treeValid(m.cls, m.tree)).toBe(true);
    expect(nodes.filter(n => n.key).length).toBe(1);
    expect(new Set(nodes.map(n => n.branch)).size).toBe(2);
  }
});

test('the picks put each team in lineup order; a member keeps its build only if its class stayed', () => {
  const d = defaultDraft({ allAi: false, map: 'span', starter: 0 });
  d.teams[0][1] = { ...d.teams[0][1]!, skills: ['prison', 'recall', 'meteor'], tree: ['a_frost'] };

  const p: PickState = {
    starter: 1, hover: [[null, null, null], [null, null, null]],
    locks: [
      { team: 1, member: 2, cls: 'gravecaller' }, { team: 0, member: 1, cls: 'astromancer' }, { team: 1, member: 0, cls: 'astromancer' },
      { team: 0, member: 0, cls: 'bellringer' }, { team: 0, member: 2, cls: 'bellringer' }, { team: 1, member: 1, cls: 'astromancer' },
    ],
  };

  const out = afterPicks(d, p);
  expect(out.teams.map(t => t.map(m => [m.name, m.cls, m.human]))).toEqual([
    [['Seren', 'astromancer', true], ['Aldric', 'bellringer', true], ['Kip', 'bellringer', true]],
    [['Grix', 'gravecaller', false], ['Morvath', 'astromancer', false], ['Ysolde', 'astromancer', false]],
  ]);
  expect([out.starter, out.teams[0][0]!.skills, out.teams[0][0]!.tree]).toEqual([1, ['prison', 'recall', 'meteor'], ['a_frost']]);
  const changed = out.teams[0][1]!;
  expect([changed.skills.every(id => SKILLS[id].cls === 'bellringer'), treeValid('bellringer', changed.tree)]).toEqual([true, true]);
});
