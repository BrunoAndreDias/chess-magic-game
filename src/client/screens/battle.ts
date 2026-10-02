import {
  CLASSES, DARK_ROUND, MAPS, SKILLS, actionsOf, aiOrder, aoeTiles, buildQueue, canUse, castTargets, current, getUnit, idx, moveOf, mulberry32, predict,
  reachable, standing, unitAt,
} from '../../engine/index';
import type { BattleEvent, BattleState, Command, Pos, SkillId, Target, Team, Unit, UnitId } from '../../engine/index';
import type { Match } from '../../host/match';
import type { Ctx, Mounted } from '../app';
import type { Highlight, TileInput } from '../board';
import { h } from '../dom';
import { LOCAL } from '../draft';
import type { Draft } from '../draft';
import { comboCredit, comboInfo, describe, openingLines, previewLines } from '../format';
import type { Line } from '../format';
import { banner, clearBanners, comboBanner, reportError } from '../overlay';
import { TEAM_COLOR, TEAM_NAME, TEAM_TEXT, other, skillColor } from '../theme';
import { statusChips, terrainTip, unitTip } from '../tips';
import { hideTip, showTip, withTip } from '../tooltip';
import { bonusChips } from './setup';

interface Batch { events: readonly BattleEvent[]; state: BattleState }
interface Aim { skill: SkillId; targets: Target[] }

/** Who may act right now. Everything the HUD offers is derived from this and the shown state. */
type Input =
  | { kind: 'locked'; why: 'playing' | 'ai' | 'over' }
  | { kind: 'order'; team: Team; picks: UnitId[] }
  | { kind: 'turn'; unit: UnitId; aim: Aim | null };

const same = (a: Pos, b: Pos) => a.x === b.x && a.z === b.z;
const alive = (s: BattleState, t: Team) => s.units.filter(u => u.team === t && u.life.kind !== 'dead');

export function mountBattle(ctx: Ctx, draft: Draft, match: Match): Mounted {
  const { board } = ctx;
  const human = (u: Unit) => draft.teams[u.team][u.slot]?.human ?? false;
  const teamHuman = (t: Team) => draft.teams[t].some(m => m.human);
  const suggestRng = mulberry32(ctx.seed ^ 0x0de4);

  let shown = match.state;
  const pending: Batch[] = [];
  let playing = false, disposed = false, follow = true;
  let input: Input = { kind: 'locked', why: 'playing' };
  let hover: Pos | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, fn: () => void) => { const t = setTimeout(() => { timers.delete(t); if (!disposed) fn(); }, ms); timers.add(t); };

  const initbar = h('div', { id: 'initbar' });
  const followBtn = h('button', { class: 'btn', id: 'btn-cam', onclick: toggleFollow });
  const menu = h('div', { id: 'menu' }, followBtn, h('button', { class: 'btn', id: 'btn-setup', onclick: () => ctx.go({ kind: 'setup', draft }) }, '⟲ Party'));
  const rosters = [h('div', { class: 'roster', id: 'roster0' }), h('div', { class: 'roster', id: 'roster1' })] as const;
  const selinfo = h('div', { id: 'selinfo' }), actions = h('div', { id: 'actions' });
  const endBtn = h('button', { id: 'endturn', onclick: endTurn }, 'End turn', h('small', null, 'Space'));
  const actionbar = h('div', { id: 'actionbar' }, selinfo, actions, endBtn);
  const log = h('div', { id: 'log' });
  const hud = h('div', { id: 'hud' }, initbar, menu, rosters[0], rosters[1], actionbar, log);
  const hint = h('div', { id: 'hintbar' }), orderPanel = h('div', { id: 'orderpanel', class: 'hidden' });
  ctx.ui.append(hud, hint, orderPanel);

  const unsubscribe = match.subscribe((events, state) => { pending.push({ events, state }); void pump(); });

  // ---------- playback ----------
  async function pump(): Promise<void> {
    if (playing) return;
    playing = true;
    refresh();
    try {
      for (let b = pending.shift(); b && !disposed; b = pending.shift()) await play(b);
    } finally {
      playing = false;
    }
    if (disposed) return;
    refresh();
    afterDrain();
  }

  async function play(b: Batch): Promise<void> {
    const before = shown;
    for (const e of b.events) {
      const line = describe(e, b.state);
      if (line) addLog(line);
      if (e.type === 'round') await roundBanner(e.round, e.starter);
      if (e.type === 'combo') comboBanner(e.name, comboCredit(e, b.state), comboInfo(e));
    }
    try {
      await board.play(b.events, before, b.state);
    } catch (err) {
      reportError(`board.play failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
      board.load(b.state);
    }
    shown = b.state;
    renderHud();
  }

  async function roundBanner(round: number, starter: Team): Promise<void> {
    if (round === DARK_ROUND) await banner('The torches gutter', '#c8a0ff', 'From now on everyone loses HP at the start of their turn, and healing is halved.', 1600);
    await banner(`Round ${round}`, TEAM_TEXT[starter], `${TEAM_NAME[starter]} opens and closes the round`, 800);
  }

  function afterDrain(): void {
    if (shown.phase.kind === 'over') { later(1200, () => ctx.go({ kind: 'result', draft, final: shown })); return; }
    if (input.kind === 'order') board.focus(null, input.team);
    if (input.kind === 'turn') {
      const u = getUnit(shown, input.unit), id = input.unit;
      if (u && !hasMoves(u)) later(450, () => { if (input.kind === 'turn' && input.unit === id && !playing) submit({ kind: 'endTurn', unit: id }); });
    }
  }

  function hasMoves(u: Unit): boolean {
    return !u.moved || actionsOf(u).some(id => canUse(u, id) && castTargets(shown, u, id).length > 0);
  }

  // ---------- input ----------
  function deriveInput(): Input {
    if (playing || pending.length) return { kind: 'locked', why: 'playing' };
    const s = shown, ph = s.phase;
    if (ph.kind === 'over') return { kind: 'locked', why: 'over' };
    if (ph.kind === 'order') {
      for (const t of [s.starter, other(s.starter)]) {
        if (ph.orders[t] || !teamHuman(t)) continue;
        return { kind: 'order', team: t, picks: input.kind === 'order' && input.team === t ? input.picks : [] };
      }
      return { kind: 'locked', why: 'ai' };
    }
    const u = current(s);
    if (!u || !human(u)) return { kind: 'locked', why: 'ai' };
    const aim = input.kind === 'turn' && input.unit === u.id ? input.aim : null;
    return { kind: 'turn', unit: u.id, aim: aim && canUse(u, aim.skill) ? { skill: aim.skill, targets: castTargets(s, u, aim.skill) } : null };
  }

  function refresh(): void {
    input = deriveInput();
    renderHud();
  }

  function submit(cmd: Command): void {
    if (input.kind === 'turn' || input.kind === 'order') input = { kind: 'locked', why: 'playing' };
    hideTip();
    const r = match.submit(LOCAL, cmd);
    if (!r.ok) { addLog({ tone: 'sys', text: `Rejected: ${r.error}` }); refresh(); }
  }

  function aimAt(id: SkillId): void {
    if (input.kind !== 'turn') return;
    const u = getUnit(shown, input.unit);
    if (!u || !canUse(u, id)) return;
    if (input.aim?.skill === id) {
      if (SKILLS[id].target === 'self') submit({ kind: 'cast', unit: u.id, skill: id, at: { x: u.x, z: u.z } });
      else setAim(null);
      return;
    }
    const targets = castTargets(shown, u, id);
    if (targets.length) setAim({ skill: id, targets });
  }

  function setAim(aim: Aim | null): void {
    if (input.kind !== 'turn') return;
    input = { ...input, aim };
    hideTip();
    renderHud();
    if (hover) hoverTip(hover);
  }

  function endTurn(): void {
    if (input.kind === 'turn') submit({ kind: 'endTurn', unit: input.unit });
  }

  function toggleFollow(): void {
    follow = !follow;
    board.setFollow(follow);
    const u = current(shown);
    if (u) board.focus(u.id, u.team);
    renderMenu();
  }

  function tile(ev: TileInput): void {
    if (ev.kind === 'hover') {
      hover = ev.tile;
      highlight();
      if (hover) hoverTip(hover); else hideTip();
      return;
    }
    if (ev.button === 'right') { setAim(null); return; }
    if (input.kind !== 'turn') return;
    const u = getUnit(shown, input.unit);
    if (!u) return;
    if (input.aim) {
      const { skill, targets } = input.aim;
      if (targets.some(t => same(t, ev.tile))) submit({ kind: 'cast', unit: u.id, skill, at: { x: ev.tile.x, z: ev.tile.z } });
      return;
    }
    if (reachable(shown, u).has(idx(ev.tile.x, ev.tile.z))) submit({ kind: 'move', unit: u.id, to: { x: ev.tile.x, z: ev.tile.z } });
  }

  function key(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') { setAim(null); return; }
    if (ev.key === ' ') { ev.preventDefault(); endTurn(); return; }
    if (ev.key === 'c' || ev.key === 'C') { toggleFollow(); return; }
    const n = Number.parseInt(ev.key, 10);
    if (input.kind !== 'turn' || !(n >= 1)) return;
    const u = getUnit(shown, input.unit), id = u && actionsOf(u)[n - 1];
    if (id) aimAt(id);
  }

  // ---------- board feedback ----------
  function highlight(): void {
    const layers: Highlight[] = [];
    const u = input.kind === 'turn' ? getUnit(shown, input.unit) : null;
    if (u && input.kind === 'turn') {
      if (input.aim) {
        const { skill, targets } = input.aim;
        layers.push({ tiles: targets, tone: 'target' });
        if (hover && targets.some(t => same(t, hover ?? t))) layers.push({ tiles: aoeTiles(shown, u, skill, hover.x, hover.z), tone: 'aoe' });
      } else {
        const reach = reachable(shown, u);
        layers.push({ tiles: [...reach.values()].map(p => p[p.length - 1] ?? u), tone: 'move' });
        const path = hover && reach.get(idx(hover.x, hover.z));
        if (path) layers.push({ tiles: path.slice(1), tone: 'path' });
      }
    }
    if (hover) layers.push({ tiles: [hover], tone: 'selected' });
    board.highlight(layers);
  }

  function hoverTip(t: Pos): void {
    if (input.kind === 'turn' && input.aim && input.aim.targets.some(x => same(x, t))) {
      const { skill } = input.aim, sk = SKILLS[skill], res = predict(shown, skill, t.x, t.z);
      const lines = res ? previewLines(res, shown) : [];
      showTip(h('div', { class: 'tt', style: { color: skillColor(skill) } }, `${sk.icon} ${sk.name}`),
        lines.length ? lines.map(l => h('div', { class: l.tone }, l.text)) : h('div', { class: 'm' }, sk.text));
      return;
    }
    const u = unitAt(shown, t.x, t.z);
    if (u) showTip(unitTip(shown, u, human(u)), h('div', { style: { 'margin-top': '4px' } }, terrainTip(shown, t.x, t.z)));
    else showTip(terrainTip(shown, t.x, t.z));
  }

  // ---------- HUD ----------
  function addLog(l: Line): void {
    log.append(h('div', { class: l.tone }, l.text));
    log.scrollTop = log.scrollHeight;
  }

  function renderHud(): void {
    renderInitbar();
    rosters.forEach((el, t) => renderRoster(el, t === 0 ? 0 : 1));
    renderActions();
    renderHint();
    renderOrder();
    renderMenu();
    highlight();
  }

  function renderMenu(): void { followBtn.textContent = `🎥 Follow: ${follow ? 'on' : 'off'}`; }

  function chip(team: Team, k: number, closes: boolean, extra: string, ...body: (Node | string)[]): HTMLElement {
    return h('div', { class: `ichip t${team}${closes ? ' close' : ''}${extra}` }, h('span', { class: 'k' }, k + 1), ...body);
  }

  /** The order slots for this round as teams, before anyone has picked: A1 B1 A2 B2 B3 A3. */
  function slotTeams(s: BattleState): Team[] {
    const st = s.starter, ids = buildQueue(alive(s, st).map(u => u.id), alive(s, other(st)).map(u => u.id));
    return ids.map(id => getUnit(s, id)?.team ?? st);
  }

  function renderInitbar(): void {
    const s = shown, st = s.starter, ph = s.phase;
    const head = h('div', { class: 'rd' }, `Round ${s.round}`, h('small', { style: { color: TEAM_TEXT[st] } }, `${TEAM_NAME[st]} starts`));
    let chips: HTMLElement[];
    if (ph.kind === 'act') {
      chips = ph.queue.map((id, k) => {
        const u = getUnit(s, id);
        if (!u) return h('div');
        const C = CLASSES[u.cls], closes = k === ph.queue.length - 1 && u.team === st && ph.queue.length > 2;
        const state = k < ph.qi ? ' done' : k === ph.qi ? ' now' : '';
        return chip(u.team, k, closes, state, h('span', { class: 'ic' }, u.life.kind === 'dead' ? '💀' : C.icon), h('span', { class: 'nm' }, u.name));
      });
    } else {
      const teams = slotTeams(s);
      chips = teams.map((t, k) => chip(t, k, k === teams.length - 1 && t === st && teams.length > 2, '', h('span', { class: 'ic' }, '?'), h('span', { class: 'nm' }, '…')));
    }
    initbar.replaceChildren(head, ...chips, ...(s.round >= DARK_ROUND ? [h('div', { class: 'rd dark' }, '🕯', h('small', null, 'dark'))] : []));
  }

  function renderRoster(el: HTMLElement, t: Team): void {
    const cur = current(shown), units = shown.units.filter(u => u.team === t);
    el.replaceChildren(
      h('div', { class: 'rbon' }, bonusChips(units, false)),
      ...units.map(u => {
        const C = CLASSES[u.cls], hp = Math.round((u.hp / u.maxHp) * 100), sh = Math.min(100, Math.round((u.shield / u.maxHp) * 100));
        const life = u.life.kind === 'dead' ? ' dead' : u.life.kind === 'downed' ? ' downed' : '';
        const status = u.life.kind === 'dead' ? h('span', null, 'fallen')
          : u.life.kind === 'downed' ? h('span', { class: 'dn' }, `DOWNED · ${u.life.bleed} turn${u.life.bleed > 1 ? 's' : ''}`)
          : h('span', null, `${u.hp}/${u.maxHp}${u.shield ? ` +${u.shield}🛡` : ''}`);
        return withTip(h('div', { class: `rcard t${t}${cur?.id === u.id ? ' now' : ''}${life}`, data: { unit: String(u.id) } },
          h('div', { class: 'rtop' }, h('b', null, u.name, human(u) ? null : h('span', { style: { 'font-size': '11px' } }, ' 🤖')), h('span', null, `${C.icon} ${C.name}`)),
          h('div', { class: 'rbar' }, h('i', { style: { width: `${hp}%` } }), h('s', { style: { width: `${sh}%` } })),
          h('div', { class: 'rsub' }, status, statusChips(u))), () => unitTip(shown, u, human(u)));
      }));
  }

  function renderActions(): void {
    const s = shown, u = current(s);
    if (!u || s.phase.kind !== 'act') {
      selinfo.replaceChildren(h('b', null, '…'));
      actions.replaceChildren(h('div', { class: 'wait' }, s.phase.kind === 'over' ? 'The battle is over.' : 'Choosing the order…'));
      endBtn.disabled = true;
      return;
    }
    const C = CLASSES[u.cls], mine = input.kind === 'turn' && input.unit === u.id;
    selinfo.replaceChildren(
      h('b', { style: { color: TEAM_TEXT[u.team] } }, u.name),
      h('div', null, `${C.icon} ${C.name}${human(u) ? '' : ' · 🤖'}`),
      h('div', { class: 'mv' }, `${u.hp}/${u.maxHp}${u.shield ? ` +${u.shield}🛡` : ''}`),
      h('div', { class: 'mv' }, `${u.st.root ? '🌿 Rooted' : u.moved ? 'Move used' : `Move ${moveOf(u)}${u.moveCap ? ' (Hit & Run)' : ''}`} · ${u.acted ? 'action used' : 'action ready'}`));
    endBtn.disabled = !mine;
    if (!human(u)) {
      actions.replaceChildren(h('div', { class: 'wait' }, `${TEAM_NAME[u.team]} (AI) is acting…`));
      return;
    }
    const aim = input.kind === 'turn' ? input.aim : null;
    actions.replaceChildren(...actionsOf(u).map((id, i) => {
      const sk = SKILLS[id], cd = u.cd[id] || 0, hasT = castTargets(s, u, id).length > 0, ok = mine && canUse(u, id) && hasT;
      const why = u.acted && !sk.free ? 'Action used' : cd ? `Ready in ${cd}` : !hasT ? (id === 'helpup' ? 'No downed ally next to you' : 'No target')
        : `${sk.free ? 'Free · ' : ''}${sk.range ? `Range ${sk.range}` : sk.target === 'self' ? 'Around you' : ''}`;
      const combo = sk.pays?.[0] ? h('span', { class: 'cb pays' }, sk.pays[0]) : sk.sets?.[0] ? h('span', { class: 'cb sets' }, sk.sets[0]) : null;
      return h('button', { class: `spbtn${aim?.skill === id ? ' on' : ''}`, data: { skill: id }, disabled: !ok, style: { '--el': skillColor(id) }, title: sk.text, onclick: () => aimAt(id) },
        h('span', { class: 'key' }, i + 1), h('span', { class: 'nm' }, `${sk.icon} ${sk.name}`), h('span', { class: 'st' }, why), combo, cd ? h('span', { class: 'cdb' }, cd) : null);
    }));
  }

  function renderHint(): void {
    const set = (...parts: (Node | string)[]) => { hint.replaceChildren(...parts); hint.classList.toggle('hidden', parts.length === 0); };
    const s = shown, u = current(s);
    hint.style.bottom = `${actionbar.offsetHeight + 22}px`;
    if (input.kind === 'order' || s.phase.kind !== 'act' || !u) { set(); return; }
    if (!human(u)) { set(h('b', null, u.name), ` (${TEAM_NAME[u.team]}, AI) is acting…`); return; }
    if (input.kind !== 'turn') { set(); return; }
    if (input.aim) { set('Click a highlighted tile to use ', h('b', null, SKILLS[input.aim.skill].name), '. Hover to preview. ', h('b', null, 'Esc'), ' or right-click cancels.'); return; }
    const by = u.st.taunt ? getUnit(s, u.st.taunt.by) : null;
    if (by && standing(by)) { set(h('b', null, u.name), ' is taunted: attacks can only target ', h('b', null, by.name), '.'); return; }
    set(h('b', null, u.name), ', your turn: ', u.moved ? '' : 'blue tiles = move, ', ...(u.acted ? [] : [h('b', null, `1–${actionsOf(u).length}`), ' = skills, ']), h('b', null, 'Space'), ' = end turn.');
  }

  function renderOrder(): void {
    if (input.kind !== 'order') { orderPanel.classList.add('hidden'); return; }
    const o = input, s = shown, t = o.team, st = s.starter, isStarter = t === st, mine = alive(s, t);
    const ph = s.phase, theirs = ph.kind === 'order' && other(t) === st ? ph.orders[other(t)] : null;
    const seen: [number, number] = [0, 0], teams = slotTeams(s);
    const seq = teams.map((team, k) => {
      const n = seen[team]++, closes = k === teams.length - 1 && team === st && teams.length > 2;
      const id = team === t ? o.picks[n] : theirs?.[n], u = id !== undefined ? getUnit(s, id) : null;
      if (u) return chip(team, k, closes, '', h('span', { class: 'ic' }, CLASSES[u.cls].icon), h('span', { class: 'nm' }, u.name));
      return chip(team, k, closes, '', h('span', { class: 'ic' }, team === t ? '?' : '🂠'), h('span', { class: 'nm' }, team === t ? 'you' : 'hidden'));
    });
    const pickBtn = (u: Unit) => {
      const used = o.picks.indexOf(u.id), C = CLASSES[u.cls];
      const cond = u.life.kind === 'downed' ? 'Downed: bleeds on its turn' : u.st.stun ? 'Stunned: will lose its turn' : `${u.hp}/${u.maxHp} HP`;
      return h('button', { data: { unit: String(u.id) }, disabled: used >= 0, style: { '--cc': C.color }, onclick: () => pick(u.id) },
        h('b', null, `${C.icon} ${u.name}`), human(u) ? null : ' 🤖', h('small', null, cond, used >= 0 ? ` · #${used + 1}` : ''));
    };
    orderPanel.classList.remove('hidden');
    orderPanel.replaceChildren(
      h('div', { class: 'tag', style: { color: TEAM_COLOR[t] } }, `Round ${s.round} · ${TEAM_NAME[st]} starts`),
      h('h2', null, `${TEAM_NAME[t]}: who acts first?`),
      h('div', { class: 'seq' }, seq),
      h('div', { class: 'pick' }, mine.map(pickBtn)),
      h('div', { class: 'note' },
        h('span', null, ...(isStarter
          ? ['You act ', h('b', null, 'first and last'), ': your last pick closes the round, after the enemy’s last move.']
          : ['The enemy acts first and last; your 2nd and 3rd go back to back.'])),
        h('button', { class: 'btn', id: 'op-undo', disabled: o.picks.length === 0, onclick: () => setPicks(o.picks.slice(0, -1)) }, '↶ Undo'),
        h('button', { class: 'btn', id: 'op-ai', onclick: () => setPicks(aiOrder(s, t, suggestRng)) }, '✨ Suggest')));
  }

  function pick(id: UnitId): void {
    if (input.kind === 'order' && !input.picks.includes(id)) setPicks([...input.picks, id]);
  }

  function setPicks(picks: UnitId[]): void {
    if (input.kind !== 'order') return;
    const team = input.team, mine = alive(shown, team);
    const rest = mine.filter(u => !picks.includes(u.id));
    const full = rest.length === 1 && rest[0] ? [...picks, rest[0].id] : picks;
    input = { kind: 'order', team, picks: full };
    renderHud();
    if (full.length >= mine.length) later(350, () => { if (input.kind === 'order' && input.team === team) submit({ kind: 'order', team, order: full }); });
  }

  // ---------- start ----------
  board.load(shown);
  board.setFollow(follow);
  for (const l of openingLines(shown)) addLog(l);
  renderHud();
  playing = true;
  void banner('To battle!', '#e8b65a', MAPS[shown.map].name, 900).then(() => {
    if (disposed) return;
    playing = false;
    match.start();
    void pump();
  });

  return {
    phase: () => (input.kind === 'order' ? 'order' : 'battle'),
    state: () => shown,
    tile,
    key,
    dispose: () => {
      disposed = true;
      unsubscribe();
      for (const t of timers) clearTimeout(t);
      clearBanners();
      hideTip();
      hud.remove(); hint.remove(); orderPanel.remove();
    },
  };
}
