import { CLASSES, NODE, SKILLS, STATUS, TERRAIN, actedThisRound, callTiles, getUnit, holders, idx, moveOf, roleOf, soulAt, soulCap, statusKeys, threadCap, undying } from '../engine/index';
import type { BattleState, StatusKey, Unit } from '../engine/index';
import { h } from './dom';
import type { Child } from './dom';
import { doomTip, hazardTip } from './rules';
import { TEAM_TEXT } from './theme';

const COCOON = { name: 'Cocooned', icon: '🥚', text: 'Wrapped in silk: skips its turn, can’t be damaged or moved.' };

/** A status as the player reads it. Encased shows as ice or silk depending on who cast it. */
export function statusLook(u: Unit, k: StatusKey): { name: string; icon: string; color: string; text: string } {
  const S = STATUS[k];

  return k === 'encased' && u.st.encased && !u.st.encased.ice ? { ...S, ...COCOON, color: '#f3e6ff' } : S;
}

/** Small status chips with the remaining turns; each explains itself on hover via `title`. */
export function statusChips(u: Unit): HTMLElement[] {
  return statusKeys(u.st).map(k => {
    const S = statusLook(u, k), v = u.st[k];

    return h('span', { class: 'sti', style: { '--sc': S.color }, title: `${S.name}: ${S.text}` }, S.icon, v ? v.t : null);
  });
}

const rounds = (n: number) => `${n} round${n === 1 ? '' : 's'}`;

/** The class-mechanic lines for a unit: Threads on and from it, pending Calls, held Souls, its place in the round. */
function mechanicLines(s: BattleState, u: Unit): HTMLElement[] {
  const out: HTMLElement[] = [];

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
  const cap = soulCap(s, u);

  if (cap) out.push(h('div', { class: 'souls' }, `👻 Holds ${u.souls} of ${cap} Souls: each Rite spends one.`));

  if (undying(u)) out.push(h('div', { class: 'souls' }, 'Undying: still takes its turns while Downed (move 1, one skill), spending a Soul instead of bleeding.'));

  if (s.phase.kind === 'act' && u.life.kind !== 'dead') out.push(h('div', { class: 'm' }, actedThisRound(s, u.id) ? '🔔 Late: already acted this round.' : '🔔 Early: hasn’t acted yet this round.'));

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
    ...statusKeys(u.st).map(k => {
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
  const soul = soulAt(s, x, z);

  if (soul) out.push(h('div', null, h('b', { class: 'souls' }, '👻 Soul'), ` (${rounds(soul.t)}): a Gravecaller gathers it with Harvest or by ending a move here.`));

  if (f.bone) out.push(h('div', null, h('b', { style: { color: '#e8e2d0' } }, '🦴 Bone Wall'), ` (${rounds(f.bone)}): blocks moves and sight, and breaks Threads.`));

  if (f.web) out.push(h('div', null, h('b', { style: { color: '#f3e6ff' } }, '🕸 Web'), ` (${rounds(f.web)}): stepping on stops you and Roots you. Weavers walk it freely. Fire burns it.`));

  if (f.fire) out.push(h('div', null, h('b', { style: { color: '#ff8a4a' } }, '🔥 Fire'), ` (${rounds(f.fire)}): sets whoever steps or stands here Burning.`));

  if (f.smoke) out.push(h('div', null, h('b', { style: { color: '#b8bcc8' } }, '💨 Smoke'), ` (${rounds(f.smoke)}): blocks line of sight.`));

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
