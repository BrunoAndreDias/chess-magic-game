import {
  CLASSES, CLASS_ORDER, MAPS, MAP_ORDER, PAIRS, POINTS, SKILLS, TREES, TRINITY, canDrop, canTake, createBattle, mulberry32, partyBonuses,
} from '../../engine/index';
import type { ClassSkillId, MapId, NodeId, Team } from '../../engine/index';
import type { Ctx, Mounted } from '../app';
import { h, svg } from '../dom';
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
    h('div', { class: 't' }, `${sk.icon} ${sk.name}`, h('em', null, on ? '✓ chosen' : 'pick')),
    h('div', { class: 'd' }, sk.text),
    sk.sets ? h('div', { class: 'cb sets' }, 'Sets up: ', h('b', null, sk.sets.join(', '))) : null,
    sk.pays ? h('div', { class: 'cb pays' }, 'Pays off: ', h('b', null, sk.pays.join(', '))) : null,
    sk.map ? h('div', { class: 'cb map' }, 'Changes the map') : null,
    h('div', { class: 'cd' }, [reach, sk.cd ? `cooldown ${sk.cd}` : '', sk.free ? 'free' : ''].filter(Boolean).join(' · ')));
}

const ANGLES = [-90, 30, 150], RADII = [50, 90, 130], CX = 165, CY = 150;
function nodePos(branch: number, tier: number): [number, number] {
  const a = (ANGLES[branch] ?? 0) * Math.PI / 180, r = RADII[tier] ?? 0;
  return [CX + Math.cos(a) * r, CY + Math.sin(a) * r];
}

function treeSvg(m: Member, toggle: (id: NodeId) => void): SVGSVGElement {
  const T = TREES[m.cls], lines: SVGElement[] = [], nodes: SVGElement[] = [], labels: SVGElement[] = [];
  T.forEach((br, b) => {
    let prev: [number, number] = [CX, CY];
    br.nodes.forEach((n, i) => {
      const p = nodePos(b, i), on = m.tree.includes(n.id);
      lines.push(svg('line', { x1: prev[0], y1: prev[1], x2: p[0], y2: p[1], stroke: on ? br.color : '#3a3242', 'stroke-width': on ? 4 : 2 }));
      prev = p;
      const can = canTake(m.cls, m.tree, n.id), r = n.key ? 15 : 10;
      const fill = on ? br.color : '#16121b', stroke = on ? '#fff' : can ? br.color : '#3a3242';
      const shape = n.key
        ? svg('rect', { x: p[0] - r, y: p[1] - r, width: 2 * r, height: 2 * r, transform: `rotate(45 ${p[0]} ${p[1]})`, fill, stroke, 'stroke-width': 2.5 })
        : svg('circle', { cx: p[0], cy: p[1], r, fill, stroke, 'stroke-width': 2.5 });
      const live = on ? canDrop(m.cls, m.tree, n.id) : can;
      nodes.push(svg('g', { class: `node${live ? '' : ' locked'}`, data: { node: n.id }, onclick: () => toggle(n.id) },
        svg('title', null, `${n.name}${n.key ? ' (keystone)' : ''}: ${n.text}`), shape));
    });
    const p = nodePos(b, 2), a = ANGLES[b];
    labels.push(svg('text', { x: p[0] + (a === -90 ? 52 : a === 30 ? -8 : 8), y: p[1] + (a === -90 ? 5 : 28), 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: br.color }, br.name));
  });
  const C = CLASSES[m.cls];
  return svg('svg', { class: 'tree', viewBox: '0 0 330 300' }, lines,
    svg('circle', { cx: CX, cy: CY, r: 16, fill: C.color }), svg('text', { x: CX, y: CY + 5, 'text-anchor': 'middle', 'font-size': 15 }, C.icon), nodes, labels);
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
      h('div', { class: 'hd' }, h('b', null, TEAM_NAME[t]), h('span', { class: 'm', style: { 'font-size': '12px' } }, t === 0 ? 'deploys first, starts round 1' : 'deploys second')),
      h('div', { class: 'pslots' }, draft.teams[t].map((m, i) => {
        const C = CLASSES[m.cls], on = draft.sel.team === t && draft.sel.slot === i;
        return h('button', { class: `pslot${on ? ' on' : ''}`, style: { '--cc': C.color }, data: { team: String(t), slot: String(i) }, onclick: () => { draft.sel = { team: t, slot: i }; render(); } },
          h('div', { class: 'n' }, h('b', { class: 'nm' }, m.name), h('span', { class: m.human ? 'h' : '' }, m.human ? '👤 HUMAN' : '🤖 AI')),
          h('div', { class: 'c' }, `${C.icon} ${C.name} · ${m.skills.map(s => SKILLS[s].icon).join(' ')} · ${m.tree.length}/${POINTS} pts`));
      })),
      h('div', { class: 'bonuses' }, bonusChips(draft.teams[t], false)));
  }

  function editor(): HTMLElement {
    const t = draft.sel.team, m = selected(draft), C = CLASSES[m.cls], bon = partyBonuses(draft.teams[t]);
    const name = h('input', { id: 'ed-name', maxlength: 14, value: m.name });
    name.addEventListener('input', () => {
      selected(draft).name = name.value;
      const label = root.querySelector('.pslot.on .nm');
      if (label) label.textContent = name.value;
    });
    const ctrl = (human: boolean, text: string) => h('button', { class: m.human === human ? 'on' : '', onclick: () => update(x => ({ ...x, human })) }, text);
    return h('div', { class: 'ed' },
      h('div', { class: 'ed-h' },
        h('span', { class: 'tag', style: { color: TEAM_COLOR[t] } }, `${TEAM_NAME[t]} · player ${draft.sel.slot + 1}`), name,
        h('div', { class: 'seg', id: 'ed-ctrl' }, ctrl(true, '👤 Human'), ctrl(false, '🤖 AI')),
        h('button', { class: 'btn', id: 'ed-rec', onclick: () => update(x => recommended(x)) }, '✨ Recommended build')),
      h('div', { class: 'sec' }, h('h3', null, 'Class'), h('div', { class: 'ccards' }, CLASS_ORDER.map(cid => {
        const K = CLASSES[cid];
        return h('button', { class: `ccard${cid === m.cls ? ' on' : ''}`, style: { '--cc': K.color }, data: { cls: cid }, onclick: () => update(x => (x.cls === cid ? x : recommended(x, cid))) },
          h('div', { class: 'ic' }, K.icon), h('div', { class: 'nm' }, K.name), h('div', { class: 'rl' }, K.roleName), h('div', { class: 'pl' }, K.plays),
          h('div', { class: 'st' }, `HP ${K.hp} · move ${K.move} · ${K.basic.name} (${K.basic.range > 1 ? `range ${K.basic.range}` : 'melee'})`));
      }))),
      h('div', { class: 'sec' },
        h('h3', null, 'Skills', h('small', null, 'pick 3 of 5 · ', h('span', { class: 'sets' }, 'blue sets up'), ' a combo, ', h('span', { class: 'pays' }, 'orange pays it off'))),
        h('div', { class: 'kit', id: 'ed-skills' }, C.skills.map(id => skillCard(id, m.skills.includes(id), () => update(x => toggleSkill(x, id)))))),
      h('div', { class: 'sec' },
        h('h3', null, 'Passive tree', h('small', null, `${m.tree.length} of ${POINTS} points · click a lit node to take it, a taken outer node to refund it · diamonds are keystones`)),
        h('div', { class: 'treewrap' },
          treeSvg(m, id => update(x => {
            if (x.tree.includes(id)) return canDrop(x.cls, x.tree, id) ? { ...x, tree: x.tree.filter(n => n !== id) } : x;
            return canTake(x.cls, x.tree, id) ? { ...x, tree: [...x.tree, id] } : x;
          })),
          h('div', { class: 'treeinfo' }, TREES[m.cls].map(br => h('div', { class: 'br', style: { '--bc': br.color } }, h('b', null, br.name),
            br.nodes.map(n => { const on = m.tree.includes(n.id); return h('div', { class: `nd${on ? ' on' : ''}` }, h('i', null, on ? '●' : n.key ? '◇' : '○'), h('span', null, h('b', null, n.name), `: ${n.text}`)); })))))),
      h('div', { class: 'sec' },
        h('h3', null, `${TEAM_NAME[t]} bonuses`, h('small', null, 'every pair of classes in the party has one')),
        h('div', { class: 'bonuses', style: { margin: '0' } }, bonusChips(draft.teams[t], true)),
        h('div', { class: 'mapdesc' },
          PAIRS.filter(p => bon.has(p.id)).map(p => h('div', null, h('b', null, p.name), `: ${p.text}`)),
          bon.has('trinity') ? h('div', null, h('b', null, TRINITY.name), `: ${TRINITY.text}`) : null)));
  }

  function side(): HTMLElement {
    const M = draft.map === 'random' ? null : MAPS[draft.map];
    const mapBtn = (id: MapId | 'random') => h('button', { class: draft.map === id ? 'on' : '', data: { map: id }, onclick: () => { draft.map = id; render(); } },
      h('b', null, id === 'random' ? '🎲 Random' : MAPS[id].name), id === 'random' ? 'a surprise each battle' : null);
    const timer = h('select', { id: 'su-timer', onchange: () => { const v = Number(timer.value); draft.timer = TIMERS.find(x => x === v) ?? 30; } },
      TIMERS.map(v => h('option', { value: v, selected: draft.timer === v }, v ? `${v} s` : 'No timer')));
    return h('div', { class: 'side' },
      h('div', { class: 'box' }, h('div', { class: 'tag' }, 'Battlefield'), h('div', { class: 'mapc', id: 'su-maps' }, mapBtn('random'), MAP_ORDER.map(mapBtn)),
        h('div', { class: 'mapdesc' }, M ? [h('b', null, 'Favors: '), M.favors] : 'The battlefield is drawn at random: scout it before you deploy.')),
      h('div', { class: 'box' }, h('div', { class: 'tag' }, 'Rules'),
        h('label', { class: 'row' }, 'Scout & deploy timer', timer),
        h('div', { class: 'mapdesc' }, h('b', null, 'Turn order.'), ' Each round both parties choose who acts 1st, 2nd and 3rd. The starting party acts first ', h('b', null, 'and last'), ': A1 → B1 → A2 → B2 → B3 → A3. The start passes to the other party every round.'),
        h('div', { class: 'mapdesc' }, h('b', null, 'Downed.'), ' At 0 HP a character falls. An adjacent ally can ', h('b', null, 'Help Up'), ' (30% HP), or a Cleric can Resurrect from range. Bleeds out after 2 of its turns; any enemy hit finishes it.')),
      h('button', { class: 'btn primary', id: 'su-start', style: { width: '100%' }, onclick: start }, 'Scout the battlefield →'));
  }

  function start(): void {
    ctx.go({ kind: 'scout', draft, map: resolveMap(draft, mulberry32(ctx.seed ^ 0x5eed)) });
  }

  function render(): void {
    showMap();
    const scroll = root.scrollTop;
    root.replaceChildren(h('div', { class: 'wrap' },
      h('div', { class: 'su-top' },
        h('div', null,
          h('div', { class: 'tag' }, 'Party tactics · 3 v 3'),
          h('h1', null, 'Form your parties'),
          h('p', null, 'Every character is one player: pick a class, ', h('b', null, '3 skills'), ' and ', h('b', null, `${POINTS} passive points`), '. Pairs of classes give ', h('b', null, 'party bonuses'),
            '. Skills set each other up: stun, root, wet, burning, marked and exposed are ', h('b', { class: 'sets' }, 'setups'), ' that allies ', h('b', { class: 'pays' }, 'pay off'),
            ' for big combos. Each slot can be you (Human) or the AI.')),
        h('button', { class: 'btn', id: 'su-random', onclick: () => { const r = Math.random; for (const t of TEAMS) draft.teams[t] = draft.teams[t].map(m => randomMember(m, r)); render(); } }, '🎲 Randomize all')),
      h('div', { class: 'ptabs', id: 'su-teams' }, TEAMS.map(teamPanel)),
      h('div', { class: 'su-grid' }, editor(), side())));
    root.scrollTop = scroll;
  }

  render();
  return { phase: () => 'setup', state: () => null, dispose: () => root.remove() };
}
