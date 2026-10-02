import { CLASSES, NODE, SKILLS, STATUS, TERRAIN, getUnit, idx, moveOf, terrAt } from '../engine/index';
import type { BattleState, StatusKey, Unit } from '../engine/index';
import { h } from './dom';
import type { Child } from './dom';
import { TEAM_TEXT } from './theme';

function statusKeys(u: Unit): StatusKey[] { return (Object.keys(u.st) as StatusKey[]).filter(k => u.st[k]); }

/** Small status chips with the remaining turns; each explains itself on hover via `title`. */
export function statusChips(u: Unit): HTMLElement[] {
  return statusKeys(u).map(k => {
    const S = STATUS[k], v = u.st[k], t = v && 't' in v && k !== 'empower' ? v.t : null;
    return h('span', { class: 'sti', style: { '--sc': S.color }, title: `${S.name}: ${S.text}` }, S.icon, t);
  });
}

export function unitTip(s: BattleState, u: Unit, human: boolean): Child[] {
  const C = CLASSES[u.cls], keys = u.tree.map(id => NODE[id]).filter(n => n?.key);
  const life = u.life.kind === 'downed'
    ? h('div', { style: { color: '#ff7a6a' } }, `DOWNED: bleeds out in ${u.life.bleed} of its turns. An adjacent ally can Help Up; any enemy hit finishes it.`)
    : u.life.kind === 'dead' ? h('div', { class: 'm' }, 'Fallen.')
    : h('div', null, `HP ${u.hp}/${u.maxHp}${u.shield ? ` · ${u.shield} shield` : ''} · move ${moveOf(u)}`);
  return [
    h('div', { class: 'tt', style: { color: TEAM_TEXT[u.team] } }, u.name, h('span', { class: 'm' }, ` · ${C.icon} ${C.name}${human ? '' : ' · AI'}`)),
    life,
    ...statusKeys(u).map(k => {
      const S = STATUS[k], v = u.st[k], by = v && 'by' in v ? getUnit(s, v.by) : null;
      return h('div', { style: { color: S.color } }, `${S.icon} ${S.name}`, by && by.id !== u.id ? h('span', { class: 'm' }, ` (from ${by.name})`) : null, ': ', h('span', { class: 'm' }, S.text));
    }),
    keys.length ? h('div', { class: 'm' }, `Keystone: ${keys.map(n => n?.name).join(', ')}`) : null,
    h('div', { class: 'm' }, `Skills: ${u.skills.map(id => { const c = u.cd[id] || 0; return `${SKILLS[id].icon} ${SKILLS[id].name}${c ? ` (${c})` : ''}`; }).join(', ')}`),
  ];
}

export function terrainTip(s: BattleState, x: number, z: number): HTMLElement[] {
  const t = terrAt(s, x, z), T = TERRAIN[t], f = s.fx[idx(x, z)] ?? {};
  const rounds = (n: number) => `${n} round${n > 1 ? 's' : ''}`;
  const out = [h('div', null, h('b', null, T.name), T.text ? h('span', { class: 'm' }, ` · ${T.text}`) : null)];
  if (f.fire) out.push(h('div', null, h('b', { style: { color: '#ff8a4a' } }, '🔥 Fire'), ` (${rounds(f.fire)}): sets whoever steps or stands here Burning.`));
  if (f.smoke) out.push(h('div', null, h('b', { style: { color: '#b8bcc8' } }, '💨 Smoke'), ` (${rounds(f.smoke)}): blocks line of sight.`));
  if (f.ice) out.push(h('div', null, h('b', { style: { color: '#cff4ff' } }, '❄ Ice'), ` (${rounds(f.ice)}): walkable, no Wet.`));
  if (f.flood) out.push(h('div', null, h('b', { style: { color: '#4fb3ff' } }, '🌊 Flooded'), ` (${rounds(f.flood)}).`));
  if (f.wall) out.push(h('div', null, h('b', { style: { color: '#c8a064' } }, '🧱 Barricade'), ` (${rounds(f.wall)}${f.whp ? `, ${f.whp} HP` : ''}).`));
  if (t === 'B' && f.spent) out.push(h('div', { class: 'm' }, 'Burnt out.'));
  return out;
}
