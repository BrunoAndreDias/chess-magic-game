import {
  CLASSES, DOLL, NODE, SKILLS, STATUS, TERRAIN, UNDYING_MOVE, actedThisRound, callTiles, dollOf, getUnit, idx, moveOf, roleOf, soulAt, soulCap, statusKeys, undying,
} from '../engine/index';
import type { BattleState, Unit } from '../engine/index';
import { h } from './dom';
import type { Child } from './dom';
import { doomTip, hazardTip } from './rules';
import { TEAM_NAME, TEAM_TEXT, other } from './theme';

/** Small status chips with the remaining turns; each explains itself on hover via `title`. */
export function statusChips(u: Unit): HTMLElement[] {
  return statusKeys(u.st).map(k => {
    const S = STATUS[k], v = u.st[k];

    return h('span', { class: 'sti', style: { '--sc': S.color }, title: `${S.name}: ${S.text}` }, S.icon, v ? v.t : null);
  });
}

const rounds = (n: number) => `${n} round${n === 1 ? '' : 's'}`;

/** The class-mechanic lines for a unit: pending Calls, held Souls, its place in the round. */
function mechanicLines(s: BattleState, u: Unit): HTMLElement[] {
  const out: HTMLElement[] = [];

  for (const c of s.calls) if (c.by === u.id) out.push(h('div', { style: { color: '#c9bfff' } }, `☄ ${SKILLS[c.skill].name} called: lands at the start of its next turn.`));
  const cap = soulCap(s, u);

  if (cap) out.push(h('div', { class: 'souls' }, `👻 Holds ${u.souls} of ${cap} Souls: each Rite spends one.`));

  const doll = dollOf(s, u);

  if (doll) {
    out.push(h('div', { style: { color: '#d9a066' } }, doll.life.kind === 'up'
      ? `🪆 Its Doll: ${doll.hp}/${doll.maxHp} HP${doll.shield ? ` · ${doll.shield} shield` : ''}.`
      : `🪆 Its Doll is broken${doll.reform !== undefined ? `: it reforms at the start of ${u.name}’s turn in round ${doll.reform}` : ''}.`));
  }

  if (undying(u)) out.push(h('div', { class: 'souls' }, `Undying: still takes its turns while Downed (move ${UNDYING_MOVE}, one skill), spending a Soul instead of bleeding.`));

  if (s.phase.kind === 'act' && u.life.kind !== 'dead') out.push(h('div', { class: 'm' }, actedThisRound(s, u.id) ? '🔔 Late: already acted this round.' : '🔔 Early: hasn’t acted yet this round.'));

  return out;
}

/** A Doll: its HP, whose it is and what it does; it has no class, path or skills of its own. */
function dollTip(s: BattleState, u: Unit): Child[] {
  const owner = getUnit(s, u.owner);

  return [
    h('div', { class: 'tt', style: { color: TEAM_TEXT[u.team] } }, u.name, h('span', { class: 'm' }, ' · 🪆 Doll')),
    u.life.kind === 'up' ? h('div', null, `HP ${u.hp}/${u.maxHp}${u.shield ? ` · ${u.shield} shield` : ''}`) : h('div', { class: 'm' }, 'Broken.'),
    h('div', { class: 'm' }, `${owner?.name ?? 'Its Marionettist'} walks it ${DOLL.walk} tiles a turn with Strings. It blocks the way, takes hits and no statuses, and never acts. Broken, it reforms ${DOLL.reform} rounds later.`),
    owner?.st.standin ? h('div', { style: { color: STATUS.standin.color } }, `${STATUS.standin.icon} Stand-In: hits on allies next to it come here.`) : null,
  ];
}

export function unitTip(s: BattleState, u: Unit, human: boolean): Child[] {
  if (u.owner !== undefined) return dollTip(s, u);
  const C = CLASSES[u.cls], keys = u.tree.map(id => NODE[id]).filter(n => n?.key);

  const life = u.life.kind === 'downed'
    ? h('div', { style: { color: '#ff7a6a' } }, `DOWNED: bleeds out in ${u.life.bleed} of its turns. An adjacent ally can Help Up; any enemy hit finishes it.`)
    : u.life.kind === 'dead' ? h('div', { class: 'm' }, 'Fallen.')
    : h('div', null, `HP ${u.hp}/${u.maxHp}${u.shield ? ` · ${u.shield} shield` : ''} · move ${moveOf(u)}`);

  const kit = [C.innate, ...u.skills];

  return [
    h('div', { class: 'tt', style: { color: TEAM_TEXT[u.team] } }, u.name, h('span', { class: 'm' }, ` · ${C.icon} ${C.name} · ${roleOf(u.cls, u.tree)}${human ? '' : ' · AI'}`)),
    life,
    doomTip(s, u),
    ...mechanicLines(s, u),
    ...statusKeys(u.st).map(k => {
      const S = STATUS[k], v = u.st[k], by = v ? getUnit(s, v.by) : null;

      return h('div', { style: { color: S.color } }, `${S.icon} ${S.name}`, by && by.id !== u.id ? h('span', { class: 'm' }, ` (from ${by.name})`) : null, ': ', h('span', { class: 'm' }, S.text));
    }),
    keys.length ? h('div', { class: 'm' }, `Keystone: ${keys.map(n => n?.name).join(', ')}`) : null,
    h('div', { class: 'm' }, `Skills: ${kit.map(id => { const c = u.cd[id] || 0; return `${SKILLS[id].icon} ${SKILLS[id].name}${c ? ` (${c})` : ''}`; }).join(', ')}`),
  ];
}

export function terrainTip(s: BattleState, x: number, z: number): HTMLElement[] {
  const t = s.terr[idx(x, z)] ?? '.', T = TERRAIN[t], f = s.fx[idx(x, z)] ?? {};
  const out: HTMLElement[] = [h('div', null, h('b', null, T.name), T.text ? h('span', { class: 'm' }, ` · ${T.text}`) : null)];
  const soul = soulAt(s, x, z);

  if (soul) out.push(h('div', null, h('b', { class: 'souls' }, '👻 Soul'), ` (${rounds(soul.t)}): a Gravecaller gathers it with Harvest or by ending a move here.`));

  if (f.bone) out.push(h('div', null, h('b', { style: { color: '#e8e2d0' } }, '🦴 Bone Wall'), ` (${rounds(f.bone)}): blocks moves and sight.`));

  if (f.fire) out.push(h('div', null, h('b', { style: { color: '#ff8a4a' } }, '🔥 Fire'), ` (${rounds(f.fire)}): sets whoever steps or stands here Burning.`));

  if (f.smoke) out.push(h('div', null, h('b', { style: { color: '#b8bcc8' } }, '💨 Smoke'), ` (${rounds(f.smoke)}): blocks line of sight.`));

  if (f.glass) out.push(h('div', null, h('b', { style: { color: '#d8f0ff' } }, '🧱 Invisible Wall'), ` (${rounds(f.glass)}): blocks moves, not sight. ${f.glassBy === undefined ? '' : `A shot by the ${TEAM_NAME[other(f.glassBy)]} aimed through it hits the shooter.`}`));

  if (f.ice) out.push(h('div', null, h('b', { style: { color: '#cff4ff' } }, '❄ Ice'), ` (${rounds(f.ice)}): walkable, no Wet.`));

  if (t === 'B' && f.spent) out.push(h('div', { class: 'm' }, 'Burnt out.'));

  for (const c of s.calls) {
    if (!callTiles(c.skill, c.x, c.z).some(p => p.x === x && p.z === z)) continue;
    const by = getUnit(s, c.by);
    out.push(h('div', { style: { color: TEAM_TEXT[c.team] } }, `☄ ${SKILLS[c.skill].name} lands here at the start of ${by?.name ?? 'its caster'}’s turn.`));
  }

  const hz = hazardTip(s, x, z);

  if (hz) out.push(hz);

  return out;
}
