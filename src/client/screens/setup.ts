import {
  CLASSES, CLASS_ORDER, MAPS, PAIRS, POINTS, SKILLS, TREES, TRINITY, canDrop, canTake, createBattle, mulberry32, partyBonuses,
} from '../../engine/index';
import type { ClassSkillId, NodeDef, NodeId, Team } from '../../engine/index';
import type { Ctx, Mounted } from '../app';
import { h } from '../dom';
import type { Child } from '../dom';
import { TIMERS, randomMember, recommended, selected, toggleSkill } from '../draft';
import type { Draft, Member } from '../draft';
import { ruleLine } from '../rules';
import { TEAMS, TEAM_COLOR, TEAM_NAME, skillColor } from '../theme';
import { withTip } from '../tooltip';
import { Lineup } from './lineup';

export function bonusChips(members: readonly Member[] | readonly { cls: Member['cls'] }[], all: boolean): HTMLElement[] {
  const on = partyBonuses(members), out: HTMLElement[] = [];
  for (const p of PAIRS) if (on.has(p.id) || all) out.push(h('span', { class: `bchip${on.has(p.id) ? '' : ' off'}`, title: p.text }, `${CLASSES[p.a].icon}${CLASSES[p.b].icon} ${p.name}`));
  if (on.has('trinity') || all) out.push(h('span', { class: `bchip${on.has('trinity') ? '' : ' off'}`, title: TRINITY.text }, `⚖️ ${TRINITY.name}`));
  return out.length ? out : [h('span', { class: 'bchip off' }, 'No party bonus yet')];
}

function skillInfo(id: ClassSkillId): Child[] {
  const sk = SKILLS[id], reach = sk.range ? `Range ${sk.range}` : sk.target === 'self' ? 'Around you' : '';
  return [
    h('div', { class: 'tt' }, `${sk.icon} ${sk.name}`), sk.text,
    sk.sets ? h('div', { class: 'sets' }, 'Sets up: ', h('b', null, sk.sets.join(', '))) : null,
    sk.pays ? h('div', { class: 'pays' }, 'Pays off: ', h('b', null, sk.pays.join(', '))) : null,
    sk.map ? h('div', { class: 'mapc' }, 'Changes the map') : null,
    h('div', { class: 'm' }, [reach, sk.cd ? `cooldown ${sk.cd}` : '', sk.free ? 'free' : ''].filter(Boolean).join(' · ')),
  ];
}

const nodeInfo = (n: NodeDef, branch: string): Child[] => [h('div', { class: 'tt' }, n.name), h('div', { class: 'm' }, n.key ? `${branch} keystone` : branch), n.text];

/** A line under a section that shows whatever the pointer is on, falling back to `rest`. */
function detailLine(rest: () => Child[]): { el: HTMLElement; hover<T extends HTMLElement>(target: T, content: () => Child[]): T } {
  const el = h('div', { class: 'detail' }, rest());
  return {
    el,
    hover: (target, content) => {
      target.addEventListener('pointerenter', () => el.replaceChildren(h('span', null, content())));
      target.addEventListener('pointerleave', () => el.replaceChildren(h('span', null, rest())));
      return withTip(target, content);
    },
  };
}

export function mountSetup(ctx: Ctx, draft: Draft): Mounted {
  ctx.board.load(createBattle({ map: draft.map, starter: 0, teams: [[], []] }, mulberry32(ctx.seed)));
  ctx.board.focus(null, 0);

  const top = h('div', { class: 'su-top' }), mapInfo = h('div', { class: 'su-map', id: 'su-mapinfo' });
  const tabs = h('div', { class: 'su-tabs' }), plates = h('div', { class: 'su-plates' }), bonus = h('div', { class: 'bonuses su-bonus' });
  const canvas = h('canvas', { class: 'su-canvas' }), sheet = h('div', { class: 'sheet' });
  const root = h('div', { id: 'setup', class: 'screen' }, top, mapInfo,
    h('div', { class: 'su-body' }, h('div', { class: 'su-stage', id: 'su-teams' }, canvas, tabs, plates, bonus), sheet));
  ctx.ui.append(root);
  const lineup = new Lineup(canvas, plates, slot => pick(draft.sel.team, slot));

  function pick(team: Team, slot: number): void {
    draft.sel = { team, slot };
    render();
  }

  function update(fn: (m: Member) => Member): void {
    const { team, slot } = draft.sel;
    draft.teams[team][slot] = fn(selected(draft));
    render();
  }

  function plate(m: Member, t: Team, i: number): HTMLElement {
    const C = CLASSES[m.cls], on = draft.sel.slot === i;
    return h('button', { class: `pslot${on ? ' on' : ''}`, style: { '--cc': C.color, '--tc': TEAM_COLOR[t] }, data: { team: String(t), slot: String(i) }, onclick: () => pick(t, i) },
      h('b', { class: 'nm' }, m.name),
      h('span', { class: 'c' }, `${C.icon} ${C.name}`),
      h('span', { class: `who${m.human ? ' h' : ''}` }, m.human ? '👤 Human' : '🤖 AI'));
  }

  function header(m: Member): HTMLElement {
    const name = h('input', { id: 'ed-name', maxlength: 14, value: m.name, 'aria-label': 'Name' });
    name.addEventListener('input', () => {
      selected(draft).name = name.value;
      const label = plates.querySelector('.pslot.on .nm');
      if (label) label.textContent = name.value;
    });
    const ctrl = (human: boolean, text: string) => h('button', { class: m.human === human ? 'on' : '', onclick: () => update(x => ({ ...x, human })) }, text);
    return h('div', { class: 'ed-h' },
      h('div', { class: 'who' }, h('span', { class: 'tag', style: { color: TEAM_COLOR[draft.sel.team] } }, `${TEAM_NAME[draft.sel.team]} · hero ${draft.sel.slot + 1}/3`), name),
      h('div', { class: 'seg', id: 'ed-ctrl' }, ctrl(true, '👤 Human'), ctrl(false, '🤖 AI')),
      h('button', { class: 'quiet', id: 'ed-rec', onclick: () => update(x => recommended(x)) }, 'Reset to recommended'));
  }

  function classSec(m: Member): HTMLElement {
    const C = CLASSES[m.cls];
    return h('section', { class: 'sec' }, h('h3', null, 'Class'),
      h('div', { class: 'ccards' }, CLASS_ORDER.map(cid => {
        const K = CLASSES[cid];
        return withTip(h('button', { class: `ccard${cid === m.cls ? ' on' : ''}`, style: { '--cc': K.color }, data: { cls: cid }, onclick: () => update(x => (x.cls === cid ? x : recommended(x, cid))) },
          h('span', { class: 'ic' }, K.icon), h('span', { class: 'nm' }, K.name), h('span', { class: 'rl' }, K.roleName)),
        () => [h('div', { class: 'tt' }, `${K.icon} ${K.name}`), K.plays, h('div', { class: 'm' }, `HP ${K.hp} · move ${K.move}`)]);
      })),
      h('p', { class: 'cls-line' }, C.plays, ' ', h('span', { class: 'm' }, `HP ${C.hp} · move ${C.move} · ${C.basic.name} (${C.basic.range > 1 ? `range ${C.basic.range}` : 'melee'})`)));
  }

  function skillSec(m: Member): HTMLElement {
    const last = m.skills[m.skills.length - 1];
    const d = detailLine(() => (last ? [h('b', null, `${SKILLS[last].icon} ${SKILLS[last].name}. `), SKILLS[last].text] : ['Pick three skills.']));
    const C = CLASSES[m.cls];
    return h('section', { class: 'sec' },
      h('h3', null, 'Skills', h('small', null, `${m.skills.length} of 3 picked · `, h('span', { class: 'sets' }, 'blue sets up'), ' a combo, ', h('span', { class: 'pays' }, 'orange pays it off'))),
      h('div', { class: 'kit', id: 'ed-skills' }, C.skills.map(id => {
        const sk = SKILLS[id], on = m.skills.includes(id);
        return d.hover(h('button', { class: `skc${on ? ' on' : ''}`, style: { '--kc': skillColor(id) }, data: { skill: id }, onclick: () => update(x => toggleSkill(x, id)) },
          h('span', { class: 'ic' }, sk.icon), h('span', { class: 'nm' }, sk.name),
          h('span', { class: 'bdg' }, sk.sets ? h('i', { class: 'sets' }, 'SET') : null, sk.pays ? h('i', { class: 'pays' }, 'PAY') : null, sk.map ? h('i', { class: 'mapc' }, 'MAP') : null)), () => skillInfo(id));
      })),
      d.el);
  }

  function treeSec(m: Member): HTMLElement {
    const toggle = (id: NodeId) => update(x => {
      if (x.tree.includes(id)) return canDrop(x.cls, x.tree, id) ? { ...x, tree: x.tree.filter(n => n !== id) } : x;
      return canTake(x.cls, x.tree, id) ? { ...x, tree: [...x.tree, id] } : x;
    });
    const left = POINTS - m.tree.length;
    const d = detailLine(() => [left ? 'Click a lit node to spend a point. Each node needs the one above it.' : 'All points spent. Click the lowest taken node in a branch to refund it.']);
    return h('section', { class: 'sec tree' },
      h('h3', null, 'Passive tree', h('span', { class: `pts${left ? '' : ' zero'}` }, h('small', null, 'Points remaining'), h('b', null, String(left)))),
      h('div', { class: 'treewrap' }, TREES[m.cls].map(br => h('div', { class: 'br', style: { '--bc': br.color } },
        h('b', { class: 'bn' }, br.name),
        br.nodes.map((n, tier) => {
          const on = m.tree.includes(n.id), live = on ? canDrop(m.cls, m.tree, n.id) : canTake(m.cls, m.tree, n.id);
          return [
            tier ? h('i', { class: `link${on ? ' on' : ''}${!on && live ? ' ready' : ''}` }) : null,
            d.hover(h('button', { class: `node${n.key ? ' key' : ''}${on ? ' on' : ''}${live ? ' live' : ' locked'}`, data: { node: n.id }, 'aria-label': n.name, onclick: () => toggle(n.id) },
              h('span', { class: 'sq' }, h('span', null, n.key ? '✦' : ['I', 'II'][tier])), h('span', { class: 'nl' }, n.name)), () => nodeInfo(n, br.name)),
          ];
        })))),
      d.el);
  }

  function render(): void {
    const t = draft.sel.team, m = selected(draft), M = MAPS[draft.map];
    const timer = h('select', { id: 'su-timer', onchange: () => { const v = Number(timer.value); draft.timer = TIMERS.find(x => x === v) ?? 30; } },
      TIMERS.map(v => h('option', { value: v, selected: draft.timer === v }, v ? `${v} s` : 'No timer')));
    top.replaceChildren(
      h('div', null, h('div', { class: 'tag' }, 'Party tactics · 3 v 3'), h('h1', null, 'Form your parties')),
      h('div', { class: 'su-act' },
        h('label', { class: 'm' }, 'Deploy timer ', timer),
        h('button', { class: 'btn', id: 'su-random', onclick: () => { const r = Math.random; for (const x of TEAMS) draft.teams[x] = draft.teams[x].map(o => randomMember(o, r)); render(); } }, '🎲 Randomize'),
        h('button', { class: 'btn primary', id: 'su-start', onclick: () => ctx.go({ kind: 'scout', draft }) }, 'Scout the battlefield →')));
    mapInfo.title = M.favors;
    mapInfo.replaceChildren(h('span', { class: 'tag' }, 'Battlefield'), h('b', null, M.name), h('span', { class: 'm' }, M.tagline), h('span', { class: 'rl' }, ruleLine(draft.map)));
    tabs.replaceChildren(...TEAMS.map(x => h('button', { class: `su-tab${x === t ? ' on' : ''}`, style: { '--tc': TEAM_COLOR[x] }, data: { team: String(x) }, onclick: () => pick(x, draft.sel.team === x ? draft.sel.slot : 0) },
      TEAM_NAME[x], h('small', null, draft.teams[x].map(o => CLASSES[o.cls].icon).join(' ')))));
    root.style.setProperty('--tc', TEAM_COLOR[t]);
    plates.replaceChildren(...draft.teams[t].map((o, i) => plate(o, t, i)));
    bonus.replaceChildren(...bonusChips(draft.teams[t], false));
    const scroll = sheet.scrollTop;
    sheet.replaceChildren(header(m), classSec(m), skillSec(m), treeSec(m));
    sheet.scrollTop = scroll;
    lineup.sync(draft);
  }

  function key(ev: KeyboardEvent): void {
    const n = Number(ev.key), { team, slot } = draft.sel;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') pick(team, (slot + (ev.key === 'ArrowRight' ? 1 : 2)) % 3);
    else if (n >= 1 && n <= 3) pick(team, n - 1);
    else return;
    ev.preventDefault();
  }

  render();
  return { phase: () => 'setup', state: () => null, key, dispose: () => { lineup.dispose(); root.remove(); } };
}
