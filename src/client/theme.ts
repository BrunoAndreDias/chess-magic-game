import { CLASSES, SKILLS } from '../engine/index';
import type { SkillId, Team } from '../engine/index';

export const TEAM_COLOR: readonly [string, string] = ['#5b8cff', '#ff6b5b'];
/** Lighter tints for text on dark panels. */
export const TEAM_TEXT: readonly [string, string] = ['#a9c3ff', '#ffb0a6'];
export const TEAM_NAME: readonly [string, string] = ['Blue party', 'Red party'];
export const TEAMS: readonly Team[] = [0, 1];

export function other(t: Team): Team { return t === 0 ? 1 : 0; }

export function skillColor(id: SkillId): string {
  const sk = SKILLS[id];
  return sk.color ?? (sk.cls ? CLASSES[sk.cls].color : '#e8e2d0');
}
