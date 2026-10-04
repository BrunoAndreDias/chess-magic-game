import { CLASSES, MAPS, aiLock, applyPick, createBattle, mulberry32, newPicks, onClock, roleOf, steps } from '../../engine/index';
import type { ClassId, PickCmd, PickState, Team } from '../../engine/index';
import type { Ctx, Mounted } from '../app';
import { h } from '../dom';
import { TIMERS, afterPicks, humanTeams, randomMember, recommended, selected } from '../draft';
import type { Draft, Member } from '../draft';
import { ruleLine } from '../rules';
import { TEAMS, TEAM_COLOR, TEAM_NAME, TEAM_TEXT } from '../theme';
import { Lineup } from './lineup';
import { bonusChips, loadout, roleLabel } from './loadout';

const AI_MS = 500;

/** What a turn-order seat means for the team that holds it: its label, a note, and the question its pick answers. */
function seatMeaning(seats: readonly Team[], k: number): { label: string; note: string; ask: string } {
  if (k === 0) return { label: 'Opener', note: 'first each round', ask: 'Who acts first every round?' };

  if (k === seats.length - 1) return { label: 'Closer', note: 'last each round', ask: 'Who acts last every round?' };
  const t = seats[k], twice = seats[k - 1] === t || seats[k + 1] === t;

  return { label: `Turn ${k + 1}`, note: twice ? 'back to back' : '', ask: twice ? `Who takes turn ${k + 1}? It runs back to back with your other turn.` : `Who takes turn ${k + 1}?` };
}

/**
 * The draft: the starter was drawn before this screen, and the six steps follow the round's queue.
 * Each lock commits a member to a turn and a class for the battle; skills and the passive tree stay editable throughout.
 * Teams with no human are locked by the AI. In hot seat the view follows the human team on the clock.
 */
export function mountPicks(ctx: Ctx, draft: Draft): Mounted {
  ctx.board.load(createBattle({ map: draft.map, starter: draft.starter, teams: [[], []] }, mulberry32(ctx.seed)));
  ctx.board.focus(null, draft.starter);

  const seats = steps(draft.starter), rnd = mulberry32(ctx.seed ^ 0x91c5);
  let p: PickState = newPicks(draft.starter);

  for (const t of humanTeams(draft)) draft.teams[t].forEach((m, i) => { p = must(p, { kind: 'hover', team: t, member: i, cls: m.cls }); });
  let disposed = false, aiTimer: ReturnType<typeof setTimeout> | null = null;
  /** The step that just locked, so only its seat plays the landing pulse. */
  let landed: number | null = null;

  const top = h('div', { class: 'su-top' }), mapInfo = h('div', { class: 'su-map', id: 'su-mapinfo' });
  const sheet = h('div', { class: 'sheet' }), cta = h('div', { class: 'pk-cta', id: 'pk-cta' });
  const tabs = h('div', { class: 'su-tabs' }), plates = h('div', { class: 'su-plates' }), bonus = h('div', { class: 'bonuses su-bonus' });
  const canvas = h('canvas', { class: 'su-canvas' });
  const coin = h('div', { class: 'pk-coin', id: 'pk-coin' }), teamsBox = h('div', { class: 'pk-teams' }), track = h('ol', { class: 'pk-track', id: 'pk-track' });

  const root = h('div', { id: 'picks', class: 'screen' }, top, mapInfo,
    h('div', { class: 'pk-body' },
      sheet,
      h('div', { class: 'pk-mid' }, cta, h('div', { class: 'su-stage', id: 'su-teams' }, canvas, tabs, plates), bonus),
      h('aside', { class: 'pk-side' }, coin, teamsBox, track)));

  ctx.ui.append(root);
  const lineup = new Lineup(canvas, plates, slot => select(draft.sel.team, slot));

  function must(s: PickState, cmd: PickCmd): PickState {
    const r = applyPick(s, cmd);

    if (!r.ok) throw new Error(`${JSON.stringify(cmd)} rejected: ${r.error}`);

    return r.state;
  }

  const humans = () => humanTeams(draft);
  const lockedAt = (t: Team, i: number) => p.locks.findIndex(l => l.team === t && l.member === i);
  const firstOpen = (t: Team) => [0, 1, 2].find(i => lockedAt(t, i) < 0) ?? 0;
  const done = () => onClock(p) === null;

  /** Pre-selects are private, so during the draft the view is a human team: the one on the clock, else the first. */
  function follow(): void {
    const c = onClock(p), hs = humans();
    const t = c !== null && hs.includes(c) ? c : done() ? draft.sel.team : hs[0] ?? c ?? draft.sel.team;

    if (t !== draft.sel.team) draft.sel = { team: t, slot: firstOpen(t) };
  }

  function select(team: Team, slot: number): void {
    draft.sel = { team, slot };
    render();
  }

  function act(cmd: PickCmd): void {
    const r = applyPick(p, cmd);

    if (!r.ok) return;
    p = r.state;

    if (cmd.kind === 'lock') landed = p.locks.length - 1;

    if (cmd.kind === 'lock' && cmd.team === draft.sel.team) draft.sel = { team: cmd.team, slot: firstOpen(cmd.team) };
    follow();
    render();
    driveAi();
  }

  function driveAi(): void {
    const c = onClock(p);

    if (c === null || humans().includes(c) || aiTimer) return;
    aiTimer = setTimeout(() => { aiTimer = null; if (!disposed) act(aiLock(p, c, rnd)); }, AI_MS);
  }

  function update(fn: (m: Member) => Member): void {
    const { team, slot } = draft.sel;
    draft.teams[team][slot] = fn(selected(draft));
    follow();
    render();
    driveAi();
  }

  /** A class change starts the member from that class's recommended build and tells the draft it is considering it. */
  function choose(cls: ClassId): void {
    const { team, slot } = draft.sel;

    if (selected(draft).cls !== cls) draft.teams[team][slot] = recommended(selected(draft), cls);
    act({ kind: 'hover', team, member: slot, cls });
  }

  function setTeamHuman(t: Team, human: boolean): void {
    if (p.locks.some(l => l.team === t)) return;
    draft.teams[t] = draft.teams[t].map(m => ({ ...m, human }));

    if (human) for (const [i, m] of draft.teams[t].entries()) p = must(p, { kind: 'hover', team: t, member: i, cls: m.cls });
    follow();
    render();
    driveAi();
  }

  function seat(k: number): HTMLElement {
    const t = seats[k] ?? draft.starter, lock = p.locks[k], now = k === p.locks.length, s = seatMeaning(seats, k);
    const m = lock ? draft.teams[t][lock.member] : null, C = lock ? CLASSES[lock.cls] : null, mine = now && humans().includes(t);
    const state = lock ? 'locked' : now ? 'now' : 'wait';

    return h('li', { class: `pk-seat ${state}${k === landed ? ' fresh' : ''}`, style: { '--tc': TEAM_COLOR[t], ...(C ? { '--cc': C.color } : {}) }, data: { step: String(k), team: String(t) } },
      h('div', { class: 'pos' }, h('span', { class: 'k' }, s.label), s.note ? h('span', { class: 'mean' }, s.note) : null),
      h('span', { class: 'ic' }, C ? C.icon : now ? '⏳' : ''),
      h('div', { class: 'who' },
        h('b', { class: 'nm' }, m ? m.name : now ? (mine ? 'Your pick' : 'Picking…') : TEAM_NAME[t]),
        h('span', { class: 'cl' }, C ? C.name : now ? TEAM_NAME[t] : 'waiting')));
  }

  function teamRow(t: Team): HTMLElement {
    const isHuman = humans().includes(t), locked = p.locks.some(l => l.team === t);
    const ctrl = (human: boolean, text: string) => h('button', { class: isHuman === human ? 'on' : '', disabled: locked, onclick: () => setTeamHuman(t, human) }, text);

    return h('div', { class: 'pk-tr', style: { '--tc': TEAM_COLOR[t] }, data: { team: String(t) } },
      h('b', { style: { color: TEAM_TEXT[t] } }, TEAM_NAME[t]),
      h('div', { class: 'seg pk-ctrl', data: { team: String(t) }, title: locked ? 'Set before the team’s first lock' : '' }, ctrl(true, '👤 Human'), ctrl(false, '🤖 AI')));
  }

  function plate(m: Member, t: Team, i: number): HTMLElement {
    const C = CLASSES[m.cls], at = lockedAt(t, i);

    return h('button', { class: `pslot${draft.sel.slot === i ? ' on' : ''}${at >= 0 ? ' locked' : ''}`, style: { '--cc': C.color, '--tc': TEAM_COLOR[t] }, data: { team: String(t), slot: String(i) }, onclick: () => select(t, i) },
      h('b', { class: 'nm' }, m.name),
      h('span', { class: 'c' }, `${C.icon} ${C.name} · ${roleLabel(roleOf(m.cls, m.tree))}`),
      h('span', { class: `st${at >= 0 ? ' on' : ''}` }, at >= 0 ? `🔒 ${seatMeaning(seats, at).label}` : 'Open'));
  }

  function renderCta(): void {
    const c = onClock(p), v = draft.sel.team, m = selected(draft), C = CLASSES[m.cls];

    if (c === null) {
      cta.className = 'pk-cta done';
      cta.replaceChildren(h('div', { class: 'say' }, h('div', { class: 'ey' }, 'Draft complete'), h('h2', null, 'Every turn is locked.'),
        h('div', { class: 'sub' }, 'Tune skills and passives, then scout the battlefield.')));

      return;
    }

    const s = seatMeaning(seats, p.locks.length);

    if (c !== v || !humans().includes(c)) {
      cta.className = 'pk-cta wait';
      cta.style.setProperty('--tc', TEAM_COLOR[c]);
      cta.replaceChildren(h('div', { class: 'say' }, h('div', { class: 'ey' }, `${s.label} pick`),
        h('h2', null, h('span', { style: { color: TEAM_TEXT[c] } }, TEAM_NAME[c]), humans().includes(c) ? ' is picking…' : ' (AI) is picking…'),
        h('div', { class: 'sub' }, 'Pre-select classes and tune builds meanwhile.')));

      return;
    }

    const open = lockedAt(v, draft.sel.slot) < 0;
    cta.className = 'pk-cta mine';
    cta.style.setProperty('--tc', TEAM_COLOR[v]);
    cta.replaceChildren(
      h('div', { class: 'say' }, h('div', { class: 'ey' }, `Your pick · ${s.label}`), h('h2', null, s.ask),
        h('div', { class: 'sub' }, open ? 'Choose a hero and a class, then lock it in.' : `${m.name} is already locked. Select an open hero.`)),
      h('button', { class: 'btn primary', id: 'pk-lock', disabled: !open, onclick: () => { if (open) act({ kind: 'lock', team: v, member: draft.sel.slot, cls: m.cls }); } },
        open ? `Lock ${m.name} · ${C.name}` : 'Lock'));
  }

  function render(): void {
    const t = draft.sel.team, slot = draft.sel.slot, m = selected(draft), M = MAPS[draft.map], fin = done(), at = lockedAt(t, slot);

    const timer = h('select', { id: 'su-timer', onchange: () => { const v = Number(timer.value); draft.timer = TIMERS.find(x => x === v) ?? 30; } },
      TIMERS.map(v => h('option', { value: v, selected: draft.timer === v }, v ? `${v} s` : 'No timer')));

    top.replaceChildren(
      h('div', null, h('div', { class: 'tag' }, 'Party tactics · 3 v 3'), h('h1', null, 'Draft your parties')),
      h('div', { class: 'su-act' },
        h('label', { class: 'm' }, 'Deploy timer ', timer),
        h('button', { class: 'btn', id: 'su-random', title: `Reroll the skills and passives of ${TEAM_NAME[t]}`, onclick: () => { draft.teams[t] = draft.teams[t].map(o => randomMember(o, Math.random)); render(); } }, '🎲 Randomize'),
        h('button', { class: `btn${fin ? ' primary' : ''}`, id: 'pk-go', disabled: !fin, onclick: finish }, 'Scout the battlefield →')));
    mapInfo.title = M.favors;
    mapInfo.replaceChildren(h('span', { class: 'tag' }, 'Battlefield'), h('b', null, M.name), h('span', { class: 'm' }, M.tagline), h('span', { class: 'rl' }, ruleLine(draft.map)));

    root.style.setProperty('--tc', TEAM_COLOR[t]);
    const scroll = sheet.scrollTop;
    sheet.replaceChildren(...loadout({
      member: m, team: t, slot, seat: at >= 0 ? seatMeaning(seats, at).label : null,
      choose: at < 0 ? choose : null,
      update,
      rename: name => {
        selected(draft).name = name;
        const label = plates.querySelector('.pslot.on .nm');

        if (label) label.textContent = name;
      },
    }));
    sheet.scrollTop = scroll;

    renderCta();
    tabs.replaceChildren(...(fin ? TEAMS.map(x => h('button', { class: `su-tab${x === t ? ' on' : ''}`, style: { '--tc': TEAM_COLOR[x] }, data: { team: String(x) }, onclick: () => select(x, x === t ? slot : 0) },
      TEAM_NAME[x], h('small', null, draft.teams[x].map(o => CLASSES[o.cls].icon).join(' ')))) : []));
    plates.replaceChildren(...draft.teams[t].map((o, i) => plate(o, t, i)));
    bonus.replaceChildren(...bonusChips(draft.teams[t], true));
    lineup.sync(draft);

    coin.replaceChildren(
      h('span', { class: 'disc', style: { '--tc': TEAM_COLOR[draft.starter] } }, '🪙'),
      h('div', null,
        h('h2', { style: { color: TEAM_TEXT[draft.starter] } }, `${TEAM_NAME[draft.starter]} opens and closes every round`),
        h('div', { class: 'm' }, 'Draft order is turn order. Each lock sets who takes that turn, in which class.')));
    teamsBox.replaceChildren(...TEAMS.map(teamRow));
    track.replaceChildren(...seats.map((_, k) => seat(k)));
    landed = null;
  }

  function finish(): void {
    if (!done()) return;
    ctx.go({ kind: 'scout', draft: afterPicks(draft, p) });
  }

  function key(ev: KeyboardEvent): void {
    const n = Number(ev.key), { team, slot } = draft.sel;

    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') select(team, (slot + (ev.key === 'ArrowRight' ? 1 : 2)) % 3);
    else if (n >= 1 && n <= 3) select(team, n - 1);
    else return;
    ev.preventDefault();
  }

  follow();
  draft.sel = { team: draft.sel.team, slot: 0 };
  render();
  driveAi();

  return {
    phase: () => 'picks',
    state: () => null,
    key,
    dispose: () => { disposed = true; if (aiTimer) clearTimeout(aiTimer); lineup.dispose(); root.remove(); },
  };
}
