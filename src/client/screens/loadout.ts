import { CLASSES, CLASS_ORDER, COVERAGE, PAIRS, POINTS, SKILLS, TREES, canDrop, canTake, partyBonuses, roleOf } from '../../engine/index';
import type { ClassId, NodeDef, NodeId, PairDef, Role, SkillId, Team } from '../../engine/index';
import { h } from '../dom';
import type { Child } from '../dom';
import { recommended, toggleSkill } from '../draft';
import type { Member } from '../draft';
import { TEAM_COLOR, TEAM_NAME, skillColor } from '../theme';
import { withTip } from '../tooltip';

const ROLE_ICON: Readonly<Record<Role, string>> = { tank: '🛡️', damage: '⚔️', support: '✨' };

export const roleLabel = (r: Role): string => `${ROLE_ICON[r]} ${r}`;

const pairNeeds = (p: PairDef): string => (p.a === p.b ? `Two ${CLASSES[p.a].name}s` : `${CLASSES[p.a].name} + ${CLASSES[p.b].name}`);

/** Every pair resonance and Role Coverage; `all` also lists the ones not yet earned, dimmed. */
export function bonusChips(members: readonly { cls: ClassId; tree: readonly NodeId[] }[], all: boolean): HTMLElement[] {
  const on = partyBonuses(members), out: HTMLElement[] = [];
  const chip = (lit: boolean, label: string, tip: () => Child[]) => withTip(h('span', { class: `bchip${lit ? '' : ' off'}` }, label), tip);

  for (const p of PAIRS) {
    if (!on.has(p.id) && !all) continue;
    out.push(chip(on.has(p.id), `${CLASSES[p.a].icon}${CLASSES[p.b].icon} ${p.name}`, () => [h('div', { class: 'tt' }, p.name), h('div', { class: 'm' }, pairNeeds(p)), p.text]));
  }

  if (on.has('coverage') || all) {
    const roles = members.map(m => roleOf(m.cls, m.tree));
    out.push(chip(on.has('coverage'), `${ROLE_ICON.tank}${ROLE_ICON.damage}${ROLE_ICON.support} ${COVERAGE.name}`,
      () => [h('div', { class: 'tt' }, COVERAGE.name), COVERAGE.text, h('div', { class: 'm' }, `This party: ${roles.join(', ') || 'nobody'}`)]));
  }

  return out.length ? out : [h('span', { class: 'bchip off' }, 'No party bonus yet')];
}

export function skillInfo(id: SkillId): Child[] {
  const sk = SKILLS[id], reach = sk.range ? `Range ${sk.range}` : sk.target === 'self' ? 'Around you' : '';

  return [
    h('div', { class: 'tt' }, `${sk.icon} ${sk.name}`), sk.text,
    sk.innate ? h('div', { class: 'innate' }, 'Innate: every build has it, always on.') : null,
    sk.call ? h('div', { class: 'call' }, 'Call: marks its area now and lands at the start of your next turn. Hits allies too.') : null,
    sk.rite ? h('div', { class: 'souls' }, 'Rite: costs one held Soul, and can’t be cast without one.') : null,
    sk.free ? h('div', { class: 'free' }, 'Free: doesn’t use your action.') : null,
    sk.sets ? h('div', { class: 'sets' }, 'Sets up: ', h('b', null, sk.sets.join(', '))) : null,
    sk.pays ? h('div', { class: 'pays' }, 'Pays off: ', h('b', null, sk.pays.join(', '))) : null,
    sk.map ? h('div', { class: 'mapc' }, 'Changes the map') : null,
    h('div', { class: 'm' }, [reach, sk.cd ? `cooldown ${sk.cd}` : ''].filter(Boolean).join(' · ')),
  ];
}

/** The small tags on a skill card. */
function badges(id: SkillId): HTMLElement {
  const sk = SKILLS[id];

  return h('span', { class: 'bdg' },
    sk.call ? h('i', { class: 'call' }, 'CALL') : null, sk.rite ? h('i', { class: 'souls' }, 'RITE') : null, sk.free ? h('i', { class: 'free' }, 'FREE') : null,
    sk.sets ? h('i', { class: 'sets' }, 'SET') : null, sk.pays ? h('i', { class: 'pays' }, 'PAY') : null, sk.map ? h('i', { class: 'mapc' }, 'MAP') : null);
}

const nodeInfo = (n: NodeDef, branch: string, role: Role): Child[] => [h('div', { class: 'tt' }, n.name), h('div', { class: 'm' }, `${n.key ? `${branch} keystone` : branch} · ${role} path`), n.text];

/** The class mechanic's one-line rule, split into its name and what it does. */
function mechanic(cls: ClassId): [string, string] {
  const line = CLASSES[cls].mechanic, at = line.indexOf(':');
  const rest = line.slice(at + 1).trim();

  return [line.slice(0, at), rest.charAt(0).toUpperCase() + rest.slice(1)];
}

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

/** One member's loadout as the sheet edits it. `choose` is null once the member's class is locked. */
export interface Loadout {
  member: Member;
  team: Team;
  slot: number;
  /** Where the member stands in the turn order once locked, e.g. "Opener". */
  seat: string | null;
  choose: ((cls: ClassId) => void) | null;
  update(fn: (m: Member) => Member): void;
  rename(name: string): void;
}

function header(l: Loadout): HTMLElement {
  const m = l.member, name = h('input', { id: 'ed-name', maxlength: 14, value: m.name, 'aria-label': 'Name' });
  name.addEventListener('input', () => l.rename(name.value));
  const ctrl = (human: boolean, text: string) => h('button', { class: m.human === human ? 'on' : '', onclick: () => l.update(x => ({ ...x, human })) }, text);

  return h('div', { class: 'ed-h' },
    h('div', { class: 'who' }, h('span', { class: 'tag', style: { color: TEAM_COLOR[l.team] } }, `${TEAM_NAME[l.team]} · ${l.slot + 1} of 3`), name),
    h('div', { class: 'seg', id: 'ed-ctrl' }, ctrl(true, '👤 Human'), ctrl(false, '🤖 AI')));
}

function classSec(l: Loadout): HTMLElement {
  const m = l.member, C = CLASSES[m.cls], choose = l.choose;
  const stats = h('span', { class: 'm' }, `HP ${C.hp} · move ${C.move} · ${C.basic.name} (${C.basic.range > 1 ? `range ${C.basic.range}` : 'melee'})`);
  const rule = h('p', { class: 'cls-line' }, h('b', null, `${mechanic(m.cls)[0]}. `), mechanic(m.cls)[1], ' ', stats);

  if (!choose) {
    return h('section', { class: 'sec' }, h('h3', null, 'Class', h('small', null, 'locked in the draft')),
      withTip(h('div', { class: 'ccard on su-cls', id: 'ed-cls', style: { '--cc': C.color }, data: { cls: m.cls } },
        h('span', { class: 'ic' }, C.icon), h('span', { class: 'nm' }, C.name), h('span', { class: 'rl' }, mechanic(m.cls)[0]), l.seat ? h('span', { class: 'seat' }, `🔒 ${l.seat}`) : null),
      () => [h('div', { class: 'tt' }, `${C.icon} ${C.name}`), C.plays]),
      rule);
  }

  return h('section', { class: 'sec' }, h('h3', null, 'Class', h('small', null, 'open until you lock this hero')),
    h('div', { class: 'ccards' }, CLASS_ORDER.map(cid => {
      const K = CLASSES[cid];

      return withTip(h('button', { class: `ccard${cid === m.cls ? ' on' : ''}`, style: { '--cc': K.color }, data: { cls: cid }, onclick: () => choose(cid) },
        h('span', { class: 'ic' }, K.icon), h('span', { class: 'nm' }, K.name), h('span', { class: 'rl' }, mechanic(cid)[0])),
      () => [h('div', { class: 'tt' }, `${K.icon} ${K.name}`), K.plays, h('div', { class: 'm' }, `HP ${K.hp} · move ${K.move}`)]);
    })),
    rule);
}

function skillSec(l: Loadout): HTMLElement {
  const m = l.member, last = m.skills[m.skills.length - 1];
  const d = detailLine(() => (last ? [h('b', null, `${SKILLS[last].icon} ${SKILLS[last].name}. `), SKILLS[last].text] : ['Pick three skills.']));
  const C = CLASSES[m.cls], innate = SKILLS[C.innate];

  return h('section', { class: 'sec' },
    h('h3', null, 'Skills', h('small', null, `${m.skills.length} of 3 picked · `, h('span', { class: 'sets' }, 'blue sets up'), ', ', h('span', { class: 'pays' }, 'orange pays off'))),
    h('div', { class: 'kit', id: 'ed-skills' },
      d.hover(h('div', { class: 'skc on innate', style: { '--kc': skillColor(C.innate) }, data: { skill: C.innate } },
        h('span', { class: 'ic' }, innate.icon), h('span', { class: 'nm' }, innate.name), h('span', { class: 'bdg' }, h('i', { class: 'innate' }, 'INNATE'))), () => skillInfo(C.innate)),
      C.skills.map(id => {
        const sk = SKILLS[id], on = m.skills.includes(id);

        return d.hover(h('button', { class: `skc${on ? ' on' : ''}`, style: { '--kc': skillColor(id) }, data: { skill: id }, onclick: () => l.update(x => toggleSkill(x, id)) },
          h('span', { class: 'ic' }, sk.icon), h('span', { class: 'nm' }, sk.name), badges(id)), () => skillInfo(id));
      })),
    d.el);
}

function treeSec(l: Loadout): HTMLElement {
  const m = l.member;

  const toggle = (id: NodeId) => l.update(x => {
    if (x.tree.includes(id)) return canDrop(x.cls, x.tree, id) ? { ...x, tree: x.tree.filter(n => n !== id) } : x;

    return canTake(x.cls, x.tree, id) ? { ...x, tree: [...x.tree, id] } : x;
  });

  const left = POINTS - m.tree.length;
  const hint = left ? 'Click a lit node to spend a point. Each node needs the one above it.' : 'All points spent. Click the lowest taken node in a branch to refund it.';

  return h('section', { class: 'sec tree' },
    h('h3', null, 'Passive tree', h('button', { class: 'quiet', id: 'ed-rec', onclick: () => l.update(x => recommended(x)) }, 'Reset build'),
      h('span', { class: `pts${left ? '' : ' zero'}`, title: hint }, h('small', null, 'Points left'), h('b', null, String(left)))),
    h('div', { class: 'treewrap' }, TREES[m.cls].map(br => h('div', { class: 'br', style: { '--bc': br.color } },
      h('b', { class: 'bn' }, br.name, h('small', { class: 'role' }, roleLabel(br.role))),
      br.nodes.map((n, tier) => {
        const on = m.tree.includes(n.id), live = on ? canDrop(m.cls, m.tree, n.id) : canTake(m.cls, m.tree, n.id);

        return [
          tier ? h('i', { class: `link${on ? ' on' : ''}${!on && live ? ' ready' : ''}` }) : null,
          withTip(h('button', { class: `node${n.key ? ' key' : ''}${on ? ' on' : ''}${live ? ' live' : ' locked'}`, data: { node: n.id }, 'aria-label': n.name, onclick: () => toggle(n.id) },
            h('span', { class: 'sq' }, h('span', null, n.key ? '✦' : ['I', 'II', 'III'][tier])), h('span', { class: 'nl' }, n.name)), () => nodeInfo(n, br.name, br.role)),
        ];
      })))));
}

/** The editor for one member: who plays it, its class, its skills and its passive tree. */
export function loadout(l: Loadout): HTMLElement[] {
  return [header(l), classSec(l), skillSec(l), treeSec(l)];
}
