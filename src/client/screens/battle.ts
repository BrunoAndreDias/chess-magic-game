import {
  CLASSES, DARK_ROUND, MAPS, SKILLS, SKILL_N, actionsOf, aoeTiles, callsOf, canUse, castTargets, current, getUnit, idx, isCall,
  dollOf, moveOf, predict, puppetHits, puppetWalks, reachable, roundQueue, soulCap, soulsInReach, standingDoll, ultIn, unitAt,
} from '../../engine/index';
import type { BattleEvent, BattleState, Command, Pos, SkillId, Target, Team, Turn, Unit, UnitId } from '../../engine/index';
import type { Match } from '../../host/match';
import type { Ctx, Mounted } from '../app';
import type { Highlight, TileInput } from '../board';
import { h } from '../dom';
import { LOCAL } from '../draft';
import type { Draft } from '../draft';
import { callLines, comboCredit, comboInfo, describe, openingLines, previewLines, ultLine } from '../format';
import type { Line } from '../format';
import { banner, clearBanners, comboBanner, reportError } from '../overlay';
import { endChip, hazardLayer, roundHazard } from '../rules';
import { TEAM_NAME, TEAM_TEXT, skillColor } from '../theme';
import { statusChips, terrainTip, unitTip } from '../tips';
import { hideTip, showTip, withTip } from '../tooltip';
import { bonusChips, skillInfo } from './loadout';

interface Batch { events: readonly BattleEvent[]; state: BattleState }

/**
 * What the player is aiming, one click per step. A skill takes one click on a target. Command Performance takes three: the enemy,
 * the tile it walks to, then whom its basic hits (its own new tile for nobody).
 */
type Aim =
  | { step: 'target'; skill: SkillId; targets: Target[] }
  | { step: 'walk'; skill: 'command'; foe: Unit; walks: Map<number, Pos[]> }
  | { step: 'hit'; skill: 'command'; foe: Unit; walks: Map<number, Pos[]>; to: Pos; path: Pos[]; hits: Target[] };

/** The tiles a click takes at this step. */
function picks(aim: Aim): Pos[] {
  switch (aim.step) {
    case 'target': return aim.targets;
    case 'walk': return [...aim.walks.values()].map(p => p[p.length - 1] ?? aim.foe);
    case 'hit': return [...aim.hits, aim.to];
  }
}

/** Who may act right now. Everything the HUD offers is derived from this and the shown state. */
type Input =
  | { kind: 'locked'; why: 'playing' | 'ai' | 'over' }
  | { kind: 'turn'; unit: UnitId; aim: Aim | null };

const same = (a: Pos, b: Pos) => a.x === b.x && a.z === b.z;

export function mountBattle(ctx: Ctx, draft: Draft, match: Match): Mounted {
  const { board } = ctx;
  const human = (u: Unit) => draft.teams[u.team][u.slot]?.human ?? false;

  let shown = match.state;
  const pending: Batch[] = [];
  let playing = false, disposed = false, follow = true;
  let input: Input = { kind: 'locked', why: 'playing' };
  let hover: Pos | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (ms: number, fn: () => void) => { const t = setTimeout(() => { timers.delete(t); if (!disposed) fn(); }, ms); timers.add(t); };

  const initbar = h('div', { id: 'initbar' });
  const followBtn = h('button', { class: 'btn', id: 'btn-cam', onclick: toggleFollow });
  const menu = h('div', { id: 'menu' }, followBtn, h('button', { class: 'btn', id: 'btn-setup', onclick: () => ctx.go({ kind: 'picks', draft }) }, '⟲ Party'));
  const rosters = [h('div', { class: 'roster', id: 'roster0' }), h('div', { class: 'roster', id: 'roster1' })] as const;
  const selinfo = h('div', { id: 'selinfo' }), actions = h('div', { id: 'actions' });
  const endBtn = h('button', { id: 'endturn', onclick: endTurn }, 'End turn', h('small', null, 'Space'));
  const actionbar = h('div', { id: 'actionbar' }, selinfo, actions, endBtn);
  const log = h('div', { id: 'log' });
  const hud = h('div', { id: 'hud' }, initbar, menu, rosters[0], rosters[1], actionbar, log);
  const hint = h('div', { id: 'hintbar' });
  ctx.ui.append(hud, hint);

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

    const announce = async (e: BattleEvent) => {
      const line = describe(e, b.state);

      if (line) addLog(line);

      if (e.type === 'queue' || e.type === 'activate' || e.type === 'round') livePhase(e);

      if (e.type === 'round') await roundBanner(e.round, e.starter, b.state);

      if (e.type === 'combo') comboBanner(e.name, comboCredit(e, b.state), comboInfo(e));
    };

    try {
      await board.play(b.events, before, b.state, announce);
    } catch (err) {
      reportError(`board.play failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
      board.load(b.state);
    }

    shown = b.state;
    renderHud();
  }

  /** The initiative bar follows a batch as it plays: whose turn it is, and the order a Toll, Overture or Encore just made. */
  function livePhase(e: Extract<BattleEvent, { type: 'queue' | 'activate' | 'round' }>): void {
    const ph = shown.phase;

    if (e.type === 'round') { shown = { ...shown, round: e.round, starter: e.starter, phase: { kind: 'act', queue: e.queue, qi: 0, tolled: [] } }; renderInitbar(); return; }

    if (ph.kind !== 'act') return;
    shown = { ...shown, phase: e.type === 'queue' ? { ...ph, queue: e.queue } : { ...ph, qi: e.qi } };
    renderInitbar();
  }

  async function roundBanner(round: number, starter: Team, s: BattleState): Promise<void> {
    if (round === DARK_ROUND) await banner('The torches gutter', '#c8a0ff', 'From now on everyone loses HP at the start of their turn, and healing is halved.', 1600);
    await banner(`Round ${round}`, TEAM_TEXT[starter], [`${TEAM_NAME[starter]} opens and closes the round`, roundHazard(s, round)], 800);
  }

  function afterDrain(): void {
    if (shown.phase.kind === 'over') { later(1200, () => ctx.go({ kind: 'result', draft, final: shown })); return; }

    if (input.kind === 'turn') {
      const u = getUnit(shown, input.unit), id = input.unit;

      if (u && !hasMoves(u)) later(450, () => { if (input.kind === 'turn' && input.unit === id && !playing) submit({ kind: 'endTurn', unit: id }); });
    }
  }

  function hasMoves(u: Unit): boolean {
    return !u.moved || actionsOf(u).some(id => canUse(shown, u, id) && castTargets(shown, u, id).length > 0);
  }

  // ---------- input ----------
  function deriveInput(): Input {
    if (playing || pending.length) return { kind: 'locked', why: 'playing' };
    const s = shown, ph = s.phase;

    if (ph.kind === 'over') return { kind: 'locked', why: 'over' };
    const u = current(s);

    if (!u || !human(u)) return { kind: 'locked', why: 'ai' };
    const aim = input.kind === 'turn' && input.unit === u.id ? input.aim : null;

    if (!aim || !canUse(s, u, aim.skill)) return { kind: 'turn', unit: u.id, aim: null };

    return { kind: 'turn', unit: u.id, aim: aim.step === 'target' ? { ...aim, targets: castTargets(s, u, aim.skill) } : aim };
  }

  function refresh(): void {
    input = deriveInput();
    renderHud();
  }

  function submit(cmd: Command): void {
    if (input.kind === 'turn') input = { kind: 'locked', why: 'playing' };
    hideTip();
    const r = match.submit(LOCAL, cmd);

    if (!r.ok) { addLog({ tone: 'sys', text: `Rejected: ${r.error}` }); refresh(); }
  }

  function aimAt(id: SkillId): void {
    if (input.kind !== 'turn') return;
    const u = getUnit(shown, input.unit);

    if (!u || !canUse(shown, u, id)) return;

    if (input.aim?.skill === id) {
      if (SKILLS[id].target === 'self') submit({ kind: 'cast', unit: u.id, skill: id, at: { x: u.x, z: u.z } });
      else setAim(null);

      return;
    }

    const targets = castTargets(shown, u, id);

    if (targets.length) setAim({ step: 'target', skill: id, targets });
  }

  /** A click on one of the step's tiles: cast, or go on to Command Performance's next step. */
  function advance(u: Unit, aim: Aim, at: Pos): void {
    if (aim.step === 'walk') {
      setAim({ ...aim, step: 'hit', to: at, path: aim.walks.get(idx(at.x, at.z)) ?? [at], hits: puppetHits(shown, aim.foe, at.x, at.z) });

      return;
    }

    if (aim.step === 'hit') {
      submit({ kind: 'cast', unit: u.id, skill: aim.skill, at: { x: aim.foe.x, z: aim.foe.z }, puppet: { to: aim.to, hit: same(at, aim.to) ? null : at } });

      return;
    }

    const foe = aim.skill === 'command' ? unitAt(shown, at.x, at.z) : null;

    if (foe) setAim({ step: 'walk', skill: 'command', foe, walks: puppetWalks(shown, foe) });
    else submit({ kind: 'cast', unit: u.id, skill: aim.skill, at });
  }

  /** Esc or right-click: one step back, out of aiming from the first. */
  function back(): void {
    if (input.kind !== 'turn' || !input.aim) return;
    const aim = input.aim, u = getUnit(shown, input.unit);

    if (aim.step === 'hit') setAim({ step: 'walk', skill: aim.skill, foe: aim.foe, walks: aim.walks });
    else if (aim.step === 'walk' && u) setAim({ step: 'target', skill: aim.skill, targets: castTargets(shown, u, aim.skill) });
    else setAim(null);
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

    if (ev.button === 'right') { back(); return; }

    if (input.kind !== 'turn') return;
    const u = getUnit(shown, input.unit);

    if (!u) return;

    if (input.aim) {
      const at = { x: ev.tile.x, z: ev.tile.z };

      if (picks(input.aim).some(t => same(t, at))) advance(u, input.aim, at);

      return;
    }

    if (reachable(shown, u).has(idx(ev.tile.x, ev.tile.z))) submit({ kind: 'move', unit: u.id, to: { x: ev.tile.x, z: ev.tile.z } });
  }

  function key(ev: KeyboardEvent): void {
    if (ev.key === 'Escape') { back(); return; }

    if (ev.key === ' ') { ev.preventDefault(); endTurn(); return; }

    if (ev.key === 'c' || ev.key === 'C') { toggleFollow(); return; }

    const n = Number.parseInt(ev.key, 10);

    if (input.kind !== 'turn' || !(n >= 1)) return;
    const u = getUnit(shown, input.unit), id = u && actionsOf(u)[n - 1];

    if (id) aimAt(id);
  }

  // ---------- board feedback ----------
  function highlight(): void {
    const layers: Highlight[] = [hazardLayer(shown)];
    const u = input.kind === 'turn' ? getUnit(shown, input.unit) : null;

    if (u && input.kind === 'turn') {
      if (input.aim) layers.push(...aimLayers(u, input.aim, hover && picks(input.aim).some(t => same(t, hover ?? t)) ? hover : null));
      else {
        const reach = reachable(shown, u);
        layers.push({ tiles: [...reach.values()].map(p => p[p.length - 1] ?? u), tone: 'move' });
        const path = hover && reach.get(idx(hover.x, hover.z));

        if (path) layers.push({ tiles: path.slice(1), tone: 'path' });
      }
    }

    if (hover) layers.push({ tiles: [hover], tone: 'selected' });
    board.highlight(layers);
  }

  /** The board while aiming: the step's tiles, and what a click on the hovered one (`at`, null when off them) would do. */
  function aimLayers(u: Unit, aim: Aim, at: Pos | null): Highlight[] {
    if (aim.step === 'walk') {
      const path = at && aim.walks.get(idx(at.x, at.z));

      return [{ tiles: picks(aim), tone: 'move' }, { tiles: [aim.foe], tone: 'pull' },
        ...(at && path ? [{ tiles: path.slice(1), tone: 'path' as const }, { tiles: puppetHits(shown, aim.foe, at.x, at.z), tone: 'target' as const, opacity: 0.35 }] : [])];
    }

    if (aim.step === 'hit') return [{ tiles: aim.path, tone: 'path' }, { tiles: [aim.to], tone: 'move' }, { tiles: aim.hits, tone: 'target' }];

    const { skill, targets } = aim, out: Highlight[] = [{ tiles: targets, tone: 'target' }];

    if (!at) return out;
    const area = aoeTiles(shown, u, skill, at.x, at.z);
    out.push({ tiles: area, tone: 'aoe' });

    if (skill === 'command') {
      const foe = unitAt(shown, at.x, at.z);

      if (foe) out.push({ tiles: picks({ step: 'walk', skill, foe, walks: puppetWalks(shown, foe) }), tone: 'move', opacity: 0.35 });
    }

    if (skill === 'fallingstar') out.push({ tiles: (predict(shown, skill, at.x, at.z) ?? []).flatMap(e => (e.type === 'move' ? e.path : [])), tone: 'pull' });

    if (isCall(skill) && skill !== 'recall' && !u.mods.benevolent) {
      const hit = shown.units.filter(o => o.team === u.team && o.life.kind !== 'dead' && area.some(t => same(t, o)));

      if (hit.length) out.push({ tiles: hit, tone: 'friendly' });
    }

    return out;
  }

  /** The preview for a click at `t` at this step of the aim. */
  function aimLines(me: Unit, aim: Aim, t: Pos): Line[] {
    const say = (text: string): Line => ({ tone: 'sys', text });

    if (aim.step === 'walk') {
      const foe = aim.foe, reach = puppetHits(shown, foe, t.x, t.z).flatMap(o => getUnit(shown, o.id)?.name ?? []);

      return [say(same(t, foe) ? `${foe.name} stays where it is.` : `${foe.name} walks here.`),
        say(reach.length ? `From here its ${SKILLS[`basic_${foe.cls}`].name} reaches ${reach.join(', ')}.` : `From here its ${SKILLS[`basic_${foe.cls}`].name} reaches nobody.`)];
    }

    if (aim.step === 'hit') {
      const hit = same(t, aim.to) ? null : t, lines = previewLines(predict(shown, aim.skill, aim.foe.x, aim.foe.z, { to: aim.to, hit }) ?? [], shown);

      return hit ? lines : [say(`${aim.foe.name} walks there and attacks nobody.`), ...lines];
    }

    const { skill } = aim;

    if (isCall(skill)) return callLines(shown, me, skill, t.x, t.z, skill === 'fallingstar' ? predict(shown, skill, t.x, t.z) ?? [] : []);

    if (skill === 'command') {
      const foe = unitAt(shown, t.x, t.z);

      return foe ? [say(`Take ${foe.name}.`), say(`Next: pick where it walks, up to ${SKILL_N.command.walk} tiles, then whom its ${SKILLS[`basic_${foe.cls}`].name} hits.`)] : [];
    }

    return previewLines(predict(shown, skill, t.x, t.z) ?? [], shown);
  }

  function hoverTip(t: Pos): void {
    const me = input.kind === 'turn' ? getUnit(shown, input.unit) : null;

    if (me && input.kind === 'turn' && input.aim && picks(input.aim).some(x => same(x, t))) {
      const { skill } = input.aim, sk = SKILLS[skill], lines = aimLines(me, input.aim, t);
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
    renderMenu();
    highlight();
  }

  function renderMenu(): void { followBtn.textContent = `🎥 Follow: ${follow ? 'on' : 'off'}`; }

  function chip(team: Team, k: number, closes: boolean, extra: string, ...body: (Node | string)[]): HTMLElement {
    return h('div', { class: `ichip t${team}${closes ? ' close' : ''}${extra}` }, h('span', { class: 'k' }, k + 1), ...body);
  }

  /** The order last drawn, so a chip whose turn moved can flash. */
  let drawn: string[] = [];

  function renderInitbar(): void {
    const s = shown, st = s.starter, ph = s.phase;
    const head = h('div', { class: 'rd' }, `Round ${s.round}`, h('small', { style: { color: TEAM_TEXT[st] } }, `${TEAM_NAME[st]} starts`));
    const queue: Turn[] = ph.kind === 'act' ? ph.queue : roundQueue(s).map(id => ({ id, extra: false })), qi = ph.kind === 'act' ? ph.qi : -1;
    const order = queue.map(t => `${t.id}${t.extra ? '+' : ''}`), was = drawn;
    drawn = order;
    const moved = (k: number) => was.length > 0 && was.length <= order.length && was.includes(order[k] ?? '') && was.indexOf(order[k] ?? '') !== k;

    const chips = queue.map(({ id, extra }, k) => {
      const u = getUnit(s, id);

      if (!u) return h('div');
      const C = CLASSES[u.cls], closes = k === queue.length - 1 && u.team === st && queue.length > 2;
      const state = (k < qi ? ' done' : k === qi ? ' now' : '') + (extra ? ' extra' : '') + (moved(k) || (extra && !was.includes(order[k] ?? '') && was.length > 0) ? ' moved' : '');
      const calls = s.calls.filter(c => c.by === u.id);
      const star = calls.length ? withTip(h('span', { class: 'cstar' }, '☄'), () => calls.map(c => h('div', null, `${SKILLS[c.skill].icon} ${SKILLS[c.skill].name} lands at the start of ${u.name}'s turn.`))) : null;
      const xtra = extra ? withTip(h('span', { class: 'xtra' }, '+1'), () => [h('div', null, `An extra turn for ${u.name}: cooldowns don't tick on it.`)]) : null;

      return chip(u.team, k, closes, state, h('span', { class: 'ic' }, u.life.kind === 'dead' ? '💀' : C.icon), h('span', { class: 'nm' }, u.name), ...(star ? [star] : []), ...(xtra ? [xtra] : []),
        u.life.kind === 'dead' ? h('span', { class: 'ub gone' }, '·') : ultBadge(u));
    });

    const end = endChip(s);
    initbar.replaceChildren(head, ...chips,
      ...(s.round >= DARK_ROUND ? [h('div', { class: 'rd dark' }, '🕯', h('small', null, 'dark'))] : []),
      ...(end ? [withTip(h('div', { class: 'rd hz', id: 'ib-hazard' }, end.icon, h('small', null, end.text)), () => [h('div', { class: 'tt' }, 'At the end of this round'), MAPS[s.map].ruleText])] : []));
  }

  function renderRoster(el: HTMLElement, t: Team): void {
    const cur = current(shown), units = shown.units.filter(u => u.team === t && u.owner === undefined);
    el.replaceChildren(
      h('div', { class: 'rbon' }, bonusChips(units, false)),
      ...units.map(u => {
        const C = CLASSES[u.cls], hp = Math.round((u.hp / u.maxHp) * 100), sh = Math.min(100, Math.round((u.shield / u.maxHp) * 100));
        const life = u.life.kind === 'dead' ? ' dead' : u.life.kind === 'downed' ? ' downed' : '';

        const status = u.life.kind === 'dead' ? h('span', null, 'fallen')
          : u.life.kind === 'downed' ? h('span', { class: 'dn' }, `DOWNED · ${u.life.bleed} turn${u.life.bleed > 1 ? 's' : ''}`)
          : h('span', null, `${u.hp}/${u.maxHp}${u.shield ? ` +${u.shield}🛡` : ''}`);

        const cap = soulCap(shown, u), souls = cap ? h('span', { class: 'souls', title: `Holds ${u.souls} of ${cap} Souls` }, ` 👻${u.souls}/${cap}`) : dollChip(u);

        return withTip(h('div', { class: `rcard t${t}${cur?.id === u.id ? ' now' : ''}${life}`, data: { unit: String(u.id) } },
          h('div', { class: 'rtop' }, h('b', null, u.name, human(u) ? null : h('span', { style: { 'font-size': '11px' } }, ' 🤖')), h('span', null, `${C.icon} ${C.name}`)),
          h('div', { class: 'rbar' }, h('i', { style: { width: `${hp}%` } }), h('s', { style: { width: `${sh}%` } })),
          h('div', { class: 'rsub' }, status, souls, statusChips(u), u.life.kind === 'dead' ? null : ultBadge(u))), () => unitTip(shown, u, human(u)));
      }));
  }

  function renderActions(): void {
    const s = shown, u = current(s);

    if (!u || s.phase.kind !== 'act') {
      selinfo.replaceChildren(h('b', null, '…'));
      actions.replaceChildren(h('div', { class: 'wait' }, s.phase.kind === 'over' ? 'The battle is over.' : 'To battle…'));
      endBtn.disabled = true;

      return;
    }

    const C = CLASSES[u.cls], mine = input.kind === 'turn' && input.unit === u.id;
    selinfo.replaceChildren(
      h('b', { style: { color: TEAM_TEXT[u.team] } }, u.name),
      h('div', null, `${C.icon} ${C.name}${human(u) ? '' : ' · 🤖'}`),
      h('div', { class: 'mv' }, `${u.hp}/${u.maxHp}${u.shield ? ` +${u.shield}🛡` : ''}`, soulCap(s, u) ? h('span', { class: 'souls' }, ` · 👻 ${u.souls}/${soulCap(s, u)}`) : dollChip(u)),
      h('div', { class: 'mv' }, `${u.st.root ? '🌿 Rooted' : u.moved ? 'Move used' : `Move ${moveOf(u)}`} · ${u.acted ? 'action used' : 'action ready'}`));
    endBtn.disabled = !mine;

    if (!human(u)) {
      actions.replaceChildren(h('div', { class: 'wait' }, `${TEAM_NAME[u.team]} (AI) is acting…`));

      return;
    }

    const aim = input.kind === 'turn' ? input.aim : null;
    actions.replaceChildren(...actionsOf(u).map((id, i) => {
      const sk = SKILLS[id], cd = u.cd[id] || 0, hasT = castTargets(s, u, id).length > 0, ok = mine && canUse(s, u, id) && hasT;

      const why = u.acted && !sk.free ? 'Action used' : cd ? `Ready in ${cd} turn${cd === 1 ? '' : 's'}` : blocked(s, u, id) ?? (!hasT ? (id === 'helpup' ? 'No downed ally next to you' : 'No target')
        : `${sk.free ? 'Free · ' : ''}${sk.call ? 'Call · ' : ''}${sk.range ? `Range ${sk.range}` : sk.target === 'self' ? 'Around you' : ''}`);

      const combo = sk.pays?.[0] ? h('span', { class: 'cb pays' }, sk.pays[0]) : sk.sets?.[0] ? h('span', { class: 'cb sets' }, sk.sets[0]) : null;

      const kind = sk.innate ? ' innate' : sk.ult ? ` ultimate${cd ? '' : ' ready'}` : '';

      return withTip(h('button', { class: `spbtn${aim?.skill === id ? ' on' : ''}${kind}`, data: { skill: id }, disabled: !ok, style: { '--el': skillColor(id) }, onclick: () => aimAt(id) },
        h('span', { class: 'key' }, i + 1), h('span', { class: 'nm' }, `${sk.icon} ${sk.name}`), h('span', { class: 'st' }, why), combo,
        sk.innate ? h('span', { class: 'inn' }, 'innate') : sk.ult ? h('span', { class: 'inn' }, 'ultimate') : null, cd ? h('span', { class: 'cdb' }, cd) : null),
      () => (sk.ult ? [...skillInfo(id), h('div', { class: 'ult' }, ultLine(u))] : skillInfo(id)));
    }));
  }

  /** A unit's ultimate countdown, public to both parties: the ultimate's icon over its turns left, lit once it is ready. */
  function ultBadge(u: Unit): HTMLElement {
    const sk = SKILLS[CLASSES[u.cls].ult], n = ultIn(u);

    return withTip(h('span', { class: `ub${n ? '' : ' ready'}`, data: { ult: String(n) }, style: { '--el': skillColor(CLASSES[u.cls].ult) } }, sk.icon, h('b', null, n ? String(n) : 'ready')),
      () => [h('div', { class: 'tt', style: { color: skillColor(CLASSES[u.cls].ult) } }, `${sk.icon} ${sk.name} · ${u.name}'s ultimate`), h('div', { class: 'ult' }, ultLine(u)), h('div', { class: 'm' }, sk.text)]);
  }

  /** A Marionettist's Doll on its roster card: its HP, or that it's broken. */
  function dollChip(u: Unit): HTMLElement | null {
    const d = dollOf(shown, u);

    if (!d) return null;

    return h('span', { class: 'doll', title: d.life.kind === 'up' ? `Its Doll: ${d.hp}/${d.maxHp} HP` : `Its Doll is broken${d.reform ? `: reforms in round ${d.reform}` : ''}` },
      d.life.kind === 'up' ? ` 🪆${d.hp}` : ' 🪆✖');
  }

  /** Why a ready skill can't be used right now, for the class mechanics that gate it. */
  function blocked(s: BattleState, u: Unit, id: SkillId): string | null {
    if (u.st.hush && !SKILLS[id].basic) return 'Hushed';

    if (['strings', 'switch', 'standin', 'razorwire'].includes(id) && !standingDoll(s, u)) return 'Doll broken';

    if (id === 'razorwire' && !canUse(s, u, id)) return 'Doll too far';

    if (SKILLS[id].rite && u.souls < 1) return 'Needs a Soul';

    if (id === 'harvest') return u.souls >= soulCap(s, u) ? 'Hands full' : soulsInReach(s, u).length ? null : 'No Souls in reach';

    if (id === 'snap' && !callsOf(s, u)) return 'No pending Call';

    if (isCall(id) && !canUse(s, u, id) && callsOf(s, u)) return 'Already holding a Call';

    return null;
  }

  function renderHint(): void {
    const set = (...parts: (Node | string)[]) => { hint.replaceChildren(...parts); hint.classList.toggle('hidden', parts.length === 0); };

    const s = shown, u = current(s);
    hint.style.bottom = `${actionbar.offsetHeight + 22}px`;

    if (s.phase.kind !== 'act' || !u) { set(); return; }

    if (!human(u)) { set(h('b', null, u.name), ` (${TEAM_NAME[u.team]}, AI) is acting…`); return; }

    if (input.kind !== 'turn') { set(); return; }

    if (input.aim) { set(...aimHint(input.aim)); return; }

    set(h('b', null, u.name), ', your turn: ', u.moved ? '' : 'blue tiles = move, ', ...(u.acted ? [] : [h('b', null, `1–${actionsOf(u).length}`), ' = skills, ']), h('b', null, 'Space'), ' = end turn.');
  }

  function aimHint(aim: Aim): (Node | string)[] {
    const esc = h('b', null, 'Esc'), name = h('b', null, SKILLS[aim.skill].name);

    if (aim.step === 'walk') return ['Pick where ', h('b', null, aim.foe.name), ' walks: blue tiles, its own to stay. Hover to see whom it reaches from there. ', esc, ' goes back.'];

    if (aim.step === 'hit') return ['Pick whom ', h('b', null, aim.foe.name), ' hits, or click its new tile (blue) to attack nobody. ', esc, ' goes back.'];

    if (aim.skill === 'command') return ['Pick the enemy to take with ', name, '. ', esc, ' or right-click cancels.'];

    return ['Click a highlighted tile to use ', name, '. Hover to preview. ', esc, ' or right-click cancels.'];
  }

  /** A broken entrance must not hold the battle back. */
  async function enter(): Promise<void> {
    try {
      await board.enter();
    } catch (err) {
      reportError(`board.enter failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    }
  }

  // ---------- start ----------
  board.load(shown);
  board.setFollow(follow);

  for (const l of openingLines(shown)) addLog(l);
  renderHud();
  playing = true;
  void Promise.all([banner('To battle!', '#e8b65a', MAPS[shown.map].name, 900), enter()]).then(() => {
    if (disposed) return;
    playing = false;
    match.start();
    void pump();
  });

  return {
    phase: () => 'battle',
    state: () => shown,
    tile,
    key,
    dispose: () => {
      disposed = true;
      unsubscribe();

      for (const t of timers) clearTimeout(t);
      clearBanners();
      hideTip();
      hud.remove(); hint.remove();
    },
  };
}
