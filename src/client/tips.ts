import { CLASSES, NODE, SKILLS, STATUS, TERRAIN, callTiles, getUnit, holders, idx, moveOf, roleOf, threadCap } from '../engine/index';
import type { BattleState, StatusKey, Unit } from '../engine/index';
import { h } from './dom';
import type { Child } from './dom';
import { doomTip, hazardTip } from './rules';
import { TEAM_NAME, TEAM_TEXT } from './theme';

function statusKeys(u: Unit): StatusKey[] { return (Object.keys(u.st) as StatusKey[]).filter(k => u.st[k]); }

const COCOON = { name: 'Cocooned', icon: '🥚', text: 'Wrapped in silk: skips its turn, can’t be damaged or moved.' };
/** A status as the player reads it. Encased shows as ice or silk depending on who cast it. */
export function statusLook(u: Unit, k: StatusKey): { name: string; icon: string; color: string; text: string } {
  const S = STATUS[k];
  return k === 'encased' && u.st.encased && !u.st.encased.ice ? { ...S, ...COCOON, color: '#f3e6ff' } : S;
}

/** Small status chips with the remaining turns; each explains itself on hover via `title`. */
export function statusChips(u: Unit): HTMLElement[] {
  return statusKeys(u).map(k => {
    const S = statusLook(u, k), v = u.st[k];
    return h('span', { class: 'sti', style: { '--sc': S.color }, title: `${S.name}: ${S.text}` }, S.icon, v ? v.t : null);
  });
}

const turns = (n: number) => `${n} turn${n === 1 ? '' : 's'}`;
const rounds = (n: number) => `${n} round${n === 1 ? '' : 's'}`;

/** The class-mechanic lines for a unit: underground, Threads on and from it, pending Calls. */
function mechanicLines(s: BattleState, u: Unit): HTMLElement[] {
  const out: HTMLElement[] = [];
  if (u.under) out.push(h('div', { style: { color: '#d8b48a' } }, `⛏ Underground for ${turns(u.under)}: can’t be targeted or hurt, except by an enemy Quake.`));
  for (const t of holders(s, u)) {
    const w = getUnit(s, t.by);
    if (!w) continue;
    out.push(w.team === u.team
      ? h('div', { style: { color: '#f0c8e0' } }, `🧵 Held by ${w.name}’s Thread.`)
      : h('div', { style: { color: '#f0c8e0' } }, `🧵 Leashed by ${w.name}: can’t end a move more than ${t.len} from them.`));
  }
  const held = s.threads.filter(t => t.by === u.id).map(t => getUnit(s, t.to)?.name ?? '?');
  if (held.length) out.push(h('div', { style: { color: '#f0c8e0' } }, `🧵 Holds ${held.join(', ')} (${held.length} of ${threadCap(s, u)}).`));
  for (const c of s.calls) if (c.by === u.id) out.push(h('div', { style: { color: '#c9bfff' } }, `☄ ${SKILLS[c.skill].name} called: lands at the start of its next turn.`));
  return out;
}

export function unitTip(s: BattleState, u: Unit, human: boolean): Child[] {
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
    ...statusKeys(u).map(k => {
      const S = statusLook(u, k), v = u.st[k], by = v ? getUnit(s, v.by) : null;
      return h('div', { style: { color: S.color } }, `${S.icon} ${S.name}`, by && by.id !== u.id ? h('span', { class: 'm' }, ` (from ${by.name})`) : null, ': ', h('span', { class: 'm' }, S.text));
    }),
    keys.length ? h('div', { class: 'm' }, `Keystone: ${keys.map(n => n?.name).join(', ')}`) : null,
    h('div', { class: 'm' }, `Skills: ${kit.map(id => { const c = u.cd[id] || 0; return `${SKILLS[id].icon} ${SKILLS[id].name}${c ? ` (${c})` : ''}`; }).join(', ')}`),
  ];
}

export function terrainTip(s: BattleState, x: number, z: number): HTMLElement[] {
  const t = s.terr[idx(x, z)] ?? '.', T = TERRAIN[t], f = s.fx[idx(x, z)] ?? {};
  const out: HTMLElement[] = [h('div', null, h('b', null, T.name), T.text ? h('span', { class: 'm' }, ` · ${T.text}`) : null)];
  if (f.pit) out.push(h('div', null, h('b', { style: { color: '#c8a0ff' } }, '🕳 Pit'), ` (${rounds(f.pit)}): reads as chasm. Anyone pushed in falls and is Downed.`));
  if (f.sink) out.push(h('div', null, h('b', { style: { color: '#d8a868' } }, '⚠ Undermined'), ': collapses into a pit at the end of this round. Whoever stands here falls.'));
  if (f.web) out.push(h('div', null, h('b', { style: { color: '#f3e6ff' } }, '🕸 Web'), ` (${rounds(f.web)}): stepping on stops you and Roots you. Weavers walk it freely. Fire burns it.`));
  if (f.charge !== undefined) {
    const by = getUnit(s, f.charge);
    out.push(h('div', null, h('b', { style: { color: '#ff9a4a' } }, '💣 Satchel Charge'), `${by ? ` (${by.name})` : ''}: blows when an enemy ends a move next to it, or when its Delver surfaces. 20 to everyone within 1, pushed out.`));
  }
  if (f.fire) out.push(h('div', null, h('b', { style: { color: '#ff8a4a' } }, '🔥 Fire'), ` (${rounds(f.fire)}): sets whoever steps or stands here Burning.`));
  if (f.smoke) out.push(h('div', null, h('b', { style: { color: '#b8bcc8' } }, '💨 Smoke'), ` (${rounds(f.smoke)}): blocks line of sight.`));
  if (f.ice) out.push(h('div', null, h('b', { style: { color: '#cff4ff' } }, '❄ Ice'), ` (${rounds(f.ice)}): walkable, no Wet.`));
  if (t === 'B' && f.spent) out.push(h('div', { class: 'm' }, 'Burnt out.'));
  const m = s.mouths.find(o => o.x === x && o.z === z);
  if (m) {
    const by = getUnit(s, m.net), joined = s.mouths.filter(o => o !== m && o.team === m.team && (o.net === m.net || s.party[m.team].has('warren'))).length;
    out.push(h('div', null, h('b', { style: { color: TEAM_TEXT[m.team] } }, `🕳 Tunnel Mouth`), ` (${TEAM_NAME[m.team]}${by ? `, ${by.name}’s tunnel` : ''}) · ${rounds(m.t)} left. `,
      h('span', { class: 'm' }, `${joined ? `Joined to ${joined} other mouth${joined === 1 ? '' : 's'}: its party walks between them for 1 move. ` : ''}An enemy who ends its turn here caves it in.`)));
  }
  for (const c of s.calls) {
    if (!callTiles(c.skill, c.x, c.z).some(p => p.x === x && p.z === z)) continue;
    const by = getUnit(s, c.by);
    out.push(h('div', { style: { color: TEAM_TEXT[c.team] } }, `☄ ${SKILLS[c.skill].name} lands here at the start of ${by?.name ?? 'its caster'}’s turn.`));
  }
  const hz = hazardTip(s, x, z);
  if (hz) out.push(hz);
  return out;
}
