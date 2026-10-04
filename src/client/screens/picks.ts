import { CLASSES, CLASS_ORDER, aiLock, applyPick, createBattle, mulberry32, newPicks, onClock, steps } from '../../engine/index';
import type { ClassId, PickCmd, PickState, Team } from '../../engine/index';
import type { Ctx, Mounted } from '../app';
import { h } from '../dom';
import { afterPicks, humanTeams } from '../draft';
import type { Draft } from '../draft';
import { TEAM_COLOR, TEAM_NAME, TEAM_TEXT } from '../theme';
import { withTip } from '../tooltip';

const AI_MS = 500;

/** What a turn-order seat means for the team that holds it. */
function seatMeaning(seats: readonly Team[], k: number): [string, string] {
  if (k === 0) return ['Opener', 'acts first every round'];
  if (k === seats.length - 1) return ['Closer', 'acts last every round'];
  const t = seats[k];
  return [`Turn ${k + 1}`, seats[k - 1] === t || seats[k + 1] === t ? 'back to back' : ''];
}

/**
 * The pick phase: the starter was drawn before this screen, and the six steps follow the round's queue.
 * Each lock commits a member to a turn and a class for the battle. Teams with no human are locked by the AI.
 */
export function mountPicks(ctx: Ctx, draft: Draft): Mounted {
  ctx.board.load(createBattle({ map: draft.map, starter: draft.starter, teams: [[], []] }, mulberry32(ctx.seed)));
  ctx.board.focus(null, draft.starter);

  const humans = humanTeams(draft), seats = steps(draft.starter), rnd = mulberry32(ctx.seed ^ 0x91c5);
  let p: PickState = newPicks(draft.starter);
  for (const t of humans) draft.teams[t].forEach((m, i) => { p = must(p, { kind: 'hover', team: t, member: i, cls: m.cls }); });
  const chosen: [number, number] = [0, 0];
  let disposed = false, aiTimer: ReturnType<typeof setTimeout> | null = null;

  const top = h('div', { class: 'su-top' }), coin = h('div', { class: 'pk-coin', id: 'pk-coin' });
  const track = h('div', { class: 'pk-track', id: 'pk-track' }), panel = h('div', { class: 'pk-team', id: 'pk-team' });
  const root = h('div', { id: 'picks', class: 'screen' }, top, coin, track, panel);
  ctx.ui.append(root);

  function must(s: PickState, cmd: PickCmd): PickState {
    const r = applyPick(s, cmd);
    if (!r.ok) throw new Error(`${JSON.stringify(cmd)} rejected: ${r.error}`);
    return r.state;
  }
  const lockedAt = (t: Team, i: number) => p.locks.findIndex(l => l.team === t && l.member === i);
  const firstOpen = (t: Team) => [0, 1, 2].find(i => lockedAt(t, i) < 0) ?? 0;
  /** The human team whose pre-selects show: in hot seat, whoever is on the clock. */
  const viewer = (): Team | null => { const c = onClock(p); return c !== null && humans.includes(c) ? c : humans[0] ?? null; };

  function act(cmd: PickCmd): void {
    const r = applyPick(p, cmd);
    if (!r.ok) return;
    p = r.state;
    if (cmd.kind === 'lock') chosen[cmd.team] = firstOpen(cmd.team);
    render();
    driveAi();
  }

  function driveAi(): void {
    const c = onClock(p);
    if (c === null || humans.includes(c) || aiTimer) return;
    aiTimer = setTimeout(() => { aiTimer = null; if (!disposed) act(aiLock(p, c, rnd)); }, AI_MS);
  }

  function seat(k: number): HTMLElement {
    const t = seats[k] ?? draft.starter, lock = p.locks[k], now = k === p.locks.length, [label, meaning] = seatMeaning(seats, k);
    const m = lock ? draft.teams[t][lock.member] : null, C = lock ? CLASSES[lock.cls] : null;
    return h('div', { class: `pk-seat${now ? ' now' : ''}${lock ? ' locked' : ''}`, style: { '--tc': TEAM_COLOR[t], ...(C ? { '--cc': C.color } : {}) }, data: { step: String(k), team: String(t) } },
      h('span', { class: 'k' }, label), h('span', { class: 'mean' }, meaning || ' '),
      h('span', { class: 'ic' }, C ? C.icon : now ? '⏳' : '·'),
      h('b', { class: 'nm' }, m ? m.name : now ? 'Picking…' : TEAM_NAME[t]),
      h('span', { class: 'cl' }, C ? C.name : ' '));
  }

  function classChip(t: Team, i: number, cid: ClassId, on: boolean, open: boolean): HTMLElement {
    const K = CLASSES[cid];
    return withTip(h('button', { class: `ccard${on ? ' on' : ''}`, style: { '--cc': K.color }, data: { cls: cid }, disabled: !open,
      onclick: (ev: Event) => { ev.stopPropagation(); chosen[t] = i; act({ kind: 'hover', team: t, member: i, cls: cid }); } },
    h('span', { class: 'ic' }, K.icon), h('span', { class: 'nm' }, K.name)),
    () => [h('div', { class: 'tt' }, `${K.icon} ${K.name}`), K.plays, h('div', { class: 'm' }, `HP ${K.hp} · move ${K.move}`)]);
  }

  function memberCard(t: Team, i: number): HTMLElement {
    const m = draft.teams[t][i], at = lockedAt(t, i), lock = p.locks[at], pre = p.hover[t][i] ?? null;
    if (!m) return h('div');
    const status = lock ? `Locked · ${seatMeaning(seats, at)[0]} · ${CLASSES[lock.cls].name}` : pre ? `Considering ${CLASSES[pre].name}` : 'Pick a class';
    return h('div', { class: `pk-member${chosen[t] === i && !lock ? ' on' : ''}${lock ? ' locked' : ''}`, style: { '--tc': TEAM_COLOR[t] }, data: { member: String(i) },
      onclick: () => { if (!lock) { chosen[t] = i; render(); } } },
    h('div', { class: 'pk-mh' }, h('b', { class: 'nm' }, m.name), h('span', { class: 'm' }, status)),
    h('div', { class: 'ccards' }, CLASS_ORDER.map(cid => classChip(t, i, cid, (lock?.cls ?? pre) === cid, !lock))));
  }

  function render(): void {
    const c = onClock(p), v = viewer(), done = c === null;
    top.replaceChildren(
      h('div', null, h('div', { class: 'tag' }, 'Party tactics · pick phase'), h('h1', null, 'Draft the turn order')),
      h('div', { class: 'su-act' }, h('button', { class: 'btn primary', id: 'pk-go', disabled: !done, onclick: finish }, 'Build your party →')));
    coin.replaceChildren(
      h('span', { class: 'disc', style: { '--tc': TEAM_COLOR[draft.starter] } }, '🪙'),
      h('div', null,
        h('h2', { style: { color: TEAM_TEXT[draft.starter] } }, `${TEAM_NAME[draft.starter]} opens and closes every round`),
        h('div', { class: 'm' }, 'Draft order is turn order. Each lock sets who takes that turn for the whole battle, and their class.')));
    track.replaceChildren(...seats.map((_, k) => seat(k)));

    if (v === null) { panel.replaceChildren(h('div', { class: 'm' }, done ? 'Every turn is locked.' : `${TEAM_NAME[c ?? 0]} (AI) is picking…`)); return; }
    const mine = c === v, member = chosen[v], pre = p.hover[v][member] ?? null, m = draft.teams[v][member];
    const head = done ? 'Every turn is locked. Skills and passives are next.'
      : mine ? `Your step: who takes the ${seatMeaning(seats, p.locks.length)[0].toLowerCase()} spot?`
      : `${TEAM_NAME[c]}${humans.includes(c) ? '' : ' (AI)'} is picking. Pre-select your classes meanwhile.`;
    const canLock = mine && !!pre && !!m && lockedAt(v, member) < 0;
    panel.replaceChildren(
      h('div', { class: 'pk-th' }, h('b', { style: { color: TEAM_TEXT[v] } }, TEAM_NAME[v]), h('span', null, head)),
      h('div', { class: 'pk-members' }, [0, 1, 2].map(i => memberCard(v, i))),
      ...(done ? [] : [h('div', { class: 'pk-lock' },
        h('button', { class: 'btn primary', id: 'pk-lock', disabled: !canLock, onclick: () => { if (canLock && pre) act({ kind: 'lock', team: v, member, cls: pre }); } },
          m && pre ? `Lock ${m.name} as ${CLASSES[pre].name}` : 'Lock'))]));
  }

  function finish(): void {
    if (onClock(p) !== null) return;
    ctx.go({ kind: 'setup', draft: afterPicks(draft, p) });
  }

  for (const t of humans) chosen[t] = firstOpen(t);
  render();
  driveAi();
  return {
    phase: () => 'picks',
    state: () => null,
    dispose: () => { disposed = true; if (aiTimer) clearTimeout(aiTimer); root.remove(); },
  };
}
