import { CLASSES, CLASS_ORDER, MAPS, aiLock, applyPick, createBattle, mulberry32, newPicks, onClock, roleOf, steps } from '../../engine/index';
import type { ClassId, PickCmd, PickState, Team } from '../../engine/index';
import type { Ctx, Mounted } from '../app';
import { CREST, splash } from '../crest';
import { h } from '../dom';
import { TIMERS, afterPicks, humanTeams, randomMember, recommended, selected } from '../draft';
import type { Draft, Member } from '../draft';
import { ruleLine } from '../rules';
import { isMuted, playLock, setMuted } from '../sound';
import { TEAMS, TEAM_COLOR, TEAM_NAME, TEAM_TEXT } from '../theme';
import { BEAT_SEC } from './beat';
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
  /** The step that just locked, so only its seat flips in. Seats that did not change keep their element, so a later render never replays or cuts the flip. */
  let landed: number | null = null;
  /** While the lock-in beat plays, the view stays on the hero just locked; when it ends the draft moves on. */
  let holding: ReturnType<typeof setTimeout> | null = null;
  /** The class the hero card last showed, so it only plays its entrance on a change. */
  let shown = '';
  for (const cls of CLASS_ORDER) new Image().src = splash(cls);

  const top = h('div', { class: 'su-top' }), mapInfo = h('div', { class: 'su-map', id: 'su-mapinfo' });
  const sheet = h('div', { class: 'sheet' }), cta = h('div', { class: 'pk-cta', id: 'pk-cta' });
  const tabs = h('div', { class: 'su-tabs' }), plates = h('div', { class: 'su-plates' }), bonus = h('div', { class: 'bonuses su-bonus' });
  const canvas = h('canvas', { class: 'su-canvas' }), hero = h('div', { class: 'pk-hero', id: 'pk-hero', 'aria-live': 'polite' });
  const coin = h('div', { class: 'pk-coin', id: 'pk-coin' }), teamsBox = h('div', { class: 'pk-teams' }), track = h('ol', { class: 'pk-track', id: 'pk-track' });
  const root = h('div', { id: 'picks', class: 'screen' }, top, mapInfo,
    h('div', { class: 'pk-body' },
      sheet,
      h('div', { class: 'pk-mid' }, cta, h('div', { class: 'su-stage', id: 'su-teams' }, canvas, hero, tabs, plates), bonus),
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
    if (holding) return;
    const c = onClock(p), hs = humans();
    const t = c !== null && hs.includes(c) ? c : done() ? draft.sel.team : hs[0] ?? c ?? draft.sel.team;
    if (t !== draft.sel.team) draft.sel = { team: t, slot: firstOpen(t) };
  }

  function select(team: Team, slot: number): void {
    release();
    draft.sel = { team, slot };
    render();
    driveAi();
  }

  function act(cmd: PickCmd): void {
    const r = applyPick(p, cmd);
    if (!r.ok) return;
    p = r.state;
    if (cmd.kind === 'lock') {
      landed = p.locks.length - 1;
      playLock(cmd.cls);
      if (cmd.team === draft.sel.team) {
        draft.sel = { team: cmd.team, slot: cmd.member };
        lineup.lockIn(cmd.member);
        holding = setTimeout(() => { holding = null; if (disposed) return; draft.sel = { team: cmd.team, slot: firstOpen(cmd.team) }; follow(); render(); driveAi(); }, BEAT_SEC * 1000);
      }
    }
    follow();
    render();
    driveAi();
  }

  /** Ends a lock-in hold early, when the player moves on before the beat finishes. */
  function release(): void {
    if (!holding) return;
    clearTimeout(holding);
    holding = null;
  }

  function driveAi(): void {
    const c = onClock(p);
    if (c === null || humans().includes(c) || aiTimer || holding) return;
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
    const sig = `${state}:${lock?.cls ?? ''}:${m?.name ?? ''}:${mine}`, old = track.children[k] as HTMLElement | undefined;
    if (old?.dataset.sig === sig) return old;
    return h('li', { class: `pk-seat ${state}${k === landed ? ' fresh' : ''}`, style: { '--tc': TEAM_COLOR[t], ...(lock ? { '--cc': CLASSES[lock.cls].color, '--glow': CREST[lock.cls].glow, '--face': CREST[lock.cls].face } : {}) }, data: { step: String(k), team: String(t), sig } },
      lock ? h('img', { class: 'art', src: splash(lock.cls), alt: '' }) : null,
      h('div', { class: 'pos' }, h('span', { class: 'k' }, s.label), s.note ? h('span', { class: 'mean' }, s.note) : null),
      h('span', { class: 'ic' }, now ? '⏳' : ''),
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
    if (holding) {
      const at = lockedAt(v, draft.sel.slot), K = CLASSES[m.cls];
      cta.className = 'pk-cta sealed';
      cta.style.setProperty('--tc', CREST[m.cls].glow);
      cta.replaceChildren(h('div', { class: 'say' }, h('div', { class: 'ey' }, `Locked in · ${seatMeaning(seats, at).label}`),
        h('h2', null, `${m.name}, the ${K.name}`), h('div', { class: 'sub' }, `“${CREST[m.cls].quote}”`)));
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
      h('button', { class: 'btn primary pk-lockin', id: 'pk-lock', disabled: !open, 'aria-keyshortcuts': 'Enter', onclick: lock },
        h('span', { class: 'big' }, 'Lock in'), h('span', { class: 'who' }, open ? `${m.name} · ${C.name}` : '—'), h('kbd', null, 'Enter')));
  }

  /** Locks the selected hero, when it is the viewed team's pick and that hero is still open. */
  function lock(): void {
    const v = draft.sel.team, m = selected(draft);
    if (holding || onClock(p) !== v || !humans().includes(v) || lockedAt(v, draft.sel.slot) >= 0) return;
    act({ kind: 'lock', team: v, member: draft.sel.slot, cls: m.cls });
  }

  /** The considered class, presented like a champion: order and land, name, line and role chips. */
  function renderHero(): void {
    const m = selected(draft), K = CLASSES[m.cls], R = CREST[m.cls], role = roleOf(m.cls, m.tree), key = `${draft.sel.team}:${draft.sel.slot}:${m.cls}`;
    hero.classList.remove('enter');
    if (key !== shown) {
      void hero.offsetWidth;
      hero.classList.add('enter');
      shown = key;
    }
    hero.style.setProperty('--glow', R.glow);
    hero.replaceChildren(
      h('div', { class: 'ey' }, R.order, h('span', { class: 'dot' }, '·'), R.land),
      h('h2', null, K.name),
      h('p', { class: 'q' }, `“${R.quote}”`),
      h('div', { class: 'chips' },
        h('span', { class: `chip role ${role}` }, roleLabel(role)),
        h('span', { class: 'chip' }, K.basic.range > 1 ? `Ranged ${K.basic.range}` : 'Melee'),
        h('span', { class: 'chip' }, `HP ${K.hp}`),
        h('span', { class: 'chip own' }, R.owns)));
  }

  function soundToggle(): HTMLElement {
    const off = isMuted();
    return h('button', { class: 'btn quiet-btn', id: 'pk-sound', 'aria-pressed': String(!off), title: 'Lock-in sounds (M)', onclick: () => { setMuted(!isMuted()); render(); } }, off ? '🔇 Sound off' : '🔊 Sound on');
  }

  function render(): void {
    const t = draft.sel.team, slot = draft.sel.slot, m = selected(draft), M = MAPS[draft.map], fin = done(), at = lockedAt(t, slot);
    const timer = h('select', { id: 'su-timer', onchange: () => { const v = Number(timer.value); draft.timer = TIMERS.find(x => x === v) ?? 30; } },
      TIMERS.map(v => h('option', { value: v, selected: draft.timer === v }, v ? `${v} s` : 'No timer')));
    top.replaceChildren(
      h('div', null, h('div', { class: 'tag' }, 'Party tactics · 3 v 3'), h('h1', null, 'Draft your parties')),
      h('div', { class: 'su-act' },
        soundToggle(),
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
    lineup.sync(draft, [0, 1, 2].map(i => lockedAt(t, i) >= 0));
    renderHero();

    coin.replaceChildren(
      h('span', { class: 'disc', style: { '--tc': TEAM_COLOR[draft.starter] } }, '🪙'),
      h('div', null,
        h('h2', { style: { color: TEAM_TEXT[draft.starter] } }, `${TEAM_NAME[draft.starter]} opens and closes every round`),
        h('div', { class: 'm' }, 'Draft order is turn order. Each lock sets who takes that turn, in which class.')));
    teamsBox.replaceChildren(...TEAMS.map(teamRow));
    seats.forEach((_, k) => {
      const el = seat(k), old = track.children[k];
      if (el !== old) { if (old) old.replaceWith(el); else track.append(el); }
    });
    landed = null;
  }

  function finish(): void {
    if (!done()) return;
    ctx.go({ kind: 'scout', draft: afterPicks(draft, p) });
  }

  function key(ev: KeyboardEvent): void {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const n = Number(ev.key), { team, slot } = draft.sel, onButton = ev.target instanceof HTMLButtonElement;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') select(team, (slot + (ev.key === 'ArrowRight' ? 1 : 2)) % 3);
    else if ((ev.key === 'ArrowUp' || ev.key === 'ArrowDown') && lockedAt(team, slot) < 0 && !holding) {
      const i = CLASS_ORDER.indexOf(selected(draft).cls), d = ev.key === 'ArrowDown' ? 1 : CLASS_ORDER.length - 1;
      choose(CLASS_ORDER[(i + d) % CLASS_ORDER.length] ?? 'astromancer');
    }
    else if (n >= 1 && n <= 3) select(team, n - 1);
    else if (ev.key === 'Enter' && !onButton) lock();
    else if (ev.key === 'm' || ev.key === 'M') { setMuted(!isMuted()); render(); }
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
    dispose: () => { disposed = true; release(); if (aiTimer) clearTimeout(aiTimer); lineup.dispose(); root.remove(); },
  };
}
