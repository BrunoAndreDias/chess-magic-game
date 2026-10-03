import {
  CLASSES, CLASS_ORDER, MAPS, MAP_ORDER, PAIRS, POINTS, SKILLS, TREES, TRINITY, canDrop, canTake, createBattle, mulberry32, partyBonuses,
} from '../../engine/index';
import type { ClassSkillId, MapId, NodeId, Team } from '../../engine/index';
import type { Ctx, Mounted } from '../app';
import { h } from '../dom';
import { TIMERS, randomMember, recommended, resolveMap, selected, toggleSkill } from '../draft';
import type { Draft, Member } from '../draft';
import { TEAMS, TEAM_COLOR, TEAM_NAME, skillColor } from '../theme';

export function bonusChips(members: readonly Member[] | readonly { cls: Member['cls'] }[], all: boolean): HTMLElement[] {
  const on = partyBonuses(members), out: HTMLElement[] = [];
  for (const p of PAIRS) if (on.has(p.id) || all) out.push(h('span', { class: `bchip${on.has(p.id) ? '' : ' off'}`, title: p.text }, `${CLASSES[p.a].icon}${CLASSES[p.b].icon} ${p.name}`));
  if (on.has('trinity') || all) out.push(h('span', { class: `bchip${on.has('trinity') ? '' : ' off'}`, title: TRINITY.text }, `⚖️ ${TRINITY.name}`));
  return out.length ? out : [h('span', { class: 'bchip off' }, 'No party bonus yet')];
}

function skillCard(id: ClassSkillId, on: boolean, pick: () => void): HTMLElement {
  const sk = SKILLS[id];
  const reach = sk.range ? `Range ${sk.range}` : sk.target === 'self' ? 'Around you' : '';
  return h('button', { class: `skc${on ? ' on' : ''}`, style: { '--kc': skillColor(id) }, data: { skill: id }, onclick: pick },
    h('div', { class: 't' }, `${sk.icon} ${sk.name}`, on ? h('em', null, '✓') : null),
    h('div', { class: 'd' }, sk.text),
    sk.sets ? h('div', { class: 'cb sets' }, 'Sets up: ', h('b', null, sk.sets.join(', '))) : null,
    sk.pays ? h('div', { class: 'cb pays' }, 'Pays off: ', h('b', null, sk.pays.join(', '))) : null,
    sk.map ? h('div', { class: 'cb map' }, 'Changes the map') : null,
    h('div', { class: 'cd' }, [reach, sk.cd ? `cooldown ${sk.cd}` : '', sk.free ? 'free' : ''].filter(Boolean).join(' · ')));
}

export function mountSetup(ctx: Ctx, draft: Draft): Mounted {
  const root = h('div', { id: 'setup', class: 'screen' });
  ctx.ui.append(root);
  let shownMap: MapId | null = null;

  function update(fn: (m: Member) => Member): void {
    const { team, slot } = draft.sel;
    draft.teams[team][slot] = fn(selected(draft));
    render();
  }

  function showMap(): void {
    const id = draft.map === 'random' ? 'crypt' : draft.map;
    if (id === shownMap) return;
    shownMap = id;
    ctx.board.load(createBattle({ map: id, starter: 0, teams: [[], []] }, mulberry32(ctx.seed)));
    ctx.board.focus(null, 0);
  }

  function teamPanel(t: Team): HTMLElement {
    return h('div', { class: 'pteam', style: { '--tc': TEAM_COLOR[t] } },
      h('div', { class: 'hd' }, h('b', null, TEAM_NAME[t])),
      h('div', { class: 'pslots' }, draft.teams[t].map((m, i) => {
        const C = CLASSES[m.cls], on = draft.sel.team === t && draft.sel.slot === i;
        return h('button', { class: `pslot${on ? ' on' : ''}`, style: { '--cc': C.color }, data: { team: String(t), slot: String(i) }, onclick: () => { draft.sel = { team: t, slot: i }; render(); } },
          h('div', { class: 'n' }, h('b', { class: 'nm' }, m.name), h('span', { class: m.human ? 'h' : '' }, m.human ? '👤 HUMAN' : '🤖 AI')),
          h('div', { class: 'c' }, `${C.icon} ${C.name} · ${m.skills.map(s => SKILLS[s].icon).join(' ')} · ${m.tree.length}/${POINTS} pts`));
      })),
      h('div', { class: 'bonuses' }, bonusChips(draft.teams[t], false)));
  }

  function editor(): HTMLElement {
    const t = draft.sel.team, m = selected(draft), C = CLASSES[m.cls];
    const name = h('input', { id: 'ed-name', maxlength: 14, value: m.name });
    name.addEventListener('input', () => {
      selected(draft).name = name.value;
      const label = root.querySelector('.pslot.on .nm');
      if (label) label.textContent = name.value;
    });
    const ctrl = (human: boolean, text: string) => h('button', { class: m.human === human ? 'on' : '', onclick: () => update(x => ({ ...x, human })) }, text);
    const toggleNode = (id: NodeId) => update(x => {
      if (x.tree.includes(id)) return canDrop(x.cls, x.tree, id) ? { ...x, tree: x.tree.filter(n => n !== id) } : x;
      return canTake(x.cls, x.tree, id) ? { ...x, tree: [...x.tree, id] } : x;
    });
    return h('div', { class: 'ed' },
      h('div', { class: 'ed-h' },
        h('span', { class: 'tag', style: { color: TEAM_COLOR[t] } }, `${TEAM_NAME[t]} · player ${draft.sel.slot + 1}`), name,
        h('div', { class: 'seg', id: 'ed-ctrl' }, ctrl(true, '👤 Human'), ctrl(false, '🤖 AI')),
        h('button', { class: 'quiet', id: 'ed-rec', onclick: () => update(x => recommended(x)) }, 'Reset to recommended')),
      h('div', { class: 'sec' }, h('h3', null, 'Class'), h('div', { class: 'ccards' }, CLASS_ORDER.map(cid => {
        const K = CLASSES[cid];
        return h('button', { class: `ccard${cid === m.cls ? ' on' : ''}`, style: { '--cc': K.color }, title: K.plays, data: { cls: cid }, onclick: () => update(x => (x.cls === cid ? x : recommended(x, cid))) },
          h('span', { class: 'ic' }, K.icon), h('span', null, h('span', { class: 'nm' }, K.name), h('span', { class: 'rl' }, K.roleName)));
      })),
      h('p', { class: 'cls-line' }, C.plays, ' ', h('span', { class: 'm' }, `HP ${C.hp} · move ${C.move} · ${C.basic.name} (${C.basic.range > 1 ? `range ${C.basic.range}` : 'melee'})`))),
      h('div', { class: 'sec' },
        h('h3', null, 'Skills', h('small', null, 'pick 3 of 5 · ', h('span', { class: 'sets' }, 'blue sets up'), ' a combo, ', h('span', { class: 'pays' }, 'orange pays it off'))),
        h('div', { class: 'kit', id: 'ed-skills' }, C.skills.map(id => skillCard(id, m.skills.includes(id), () => update(x => toggleSkill(x, id)))))),
      h('div', { class: 'sec' },
        h('h3', null, 'Passive tree', h('small', null, `${m.tree.length} of ${POINTS} points · click to take, click a taken outer node to refund`)),
        h('div', { class: 'treewrap' }, TREES[m.cls].map(br => h('div', { class: 'br', style: { '--bc': br.color } },
          h('b', null, br.name),
          br.nodes.map(n => {
            const on = m.tree.includes(n.id), live = on ? canDrop(m.cls, m.tree, n.id) : canTake(m.cls, m.tree, n.id);
            return h('button', { class: `node${on ? ' on' : ''}${live ? '' : ' locked'}`, data: { node: n.id }, title: n.key ? 'Keystone' : '', onclick: () => toggleNode(n.id) },
              h('i', null, on ? '●' : n.key ? '◇' : '○'), h('span', null, h('b', null, n.name), ' ', h('span', { class: 'm' }, n.text)));
          }))))));
  }

  function mapPicker(): HTMLElement {
    const M = draft.map === 'random' ? null : MAPS[draft.map];
    const mapBtn = (id: MapId | 'random') => h('button', { class: draft.map === id ? 'on' : '', data: { map: id }, title: id === 'random' ? 'Drawn at random at start.' : MAPS[id].favors, onclick: () => { draft.map = id; render(); } },
      id === 'random' ? 'Random' : MAPS[id].name);
    return h('div', { class: 'su-map' }, h('span', { class: 'tag' }, 'Battlefield'),
      h('div', { class: 'seg', id: 'su-maps' }, mapBtn('random'), MAP_ORDER.map(mapBtn)),
      h('span', { class: 'm' }, M ? M.favors : 'Drawn at random at start.'));
  }

  function start(): void {
    ctx.go({ kind: 'scout', draft, map: resolveMap(draft, mulberry32(ctx.seed ^ 0x5eed)) });
  }

  function render(): void {
    showMap();
    const scroll = root.scrollTop;
    const timer = h('select', { id: 'su-timer', onchange: () => { const v = Number(timer.value); draft.timer = TIMERS.find(x => x === v) ?? 30; } },
      TIMERS.map(v => h('option', { value: v, selected: draft.timer === v }, v ? `${v} s` : 'No timer')));
    root.replaceChildren(h('div', { class: 'wrap' },
      h('div', { class: 'su-top' },
        h('div', null, h('div', { class: 'tag' }, 'Party tactics · 3 v 3'), h('h1', null, 'Form your parties')),
        h('div', { class: 'su-act' },
          h('label', { class: 'm' }, 'Deploy timer ', timer),
          h('button', { class: 'btn', id: 'su-random', onclick: () => { const r = Math.random; for (const t of TEAMS) draft.teams[t] = draft.teams[t].map(m => randomMember(m, r)); render(); } }, '🎲 Randomize'),
          h('button', { class: 'btn primary', id: 'su-start', onclick: start }, 'Scout the battlefield →'))),
      mapPicker(),
      h('div', { class: 'su-body' }, h('div', { class: 'ptabs', id: 'su-teams' }, TEAMS.map(teamPanel)), editor())));
    root.scrollTop = scroll;
  }

  render();
  return { phase: () => 'setup', state: () => null, dispose: () => root.remove() };
}
