import { COMBO_INFO, COVERAGE, MAPS, PAIRS, SKILLS, STATUS, callTiles, getUnit, unitAt } from '../engine/index';
import type { BattleEvent, BattleState, CallSkill, DamageKind, OverReason, Team, TerrainChange, Unit, UnitId } from '../engine/index';
import { TEAMS, TEAM_NAME } from './theme';

type Tone = 't0' | 't1' | 'sys' | 'combo';
export interface Line { text: string; tone: Tone }

function name(s: BattleState, id: UnitId | null | undefined): string { return getUnit(s, id)?.name ?? 'someone'; }
function teamOf(s: BattleState, id: UnitId): Tone {
  const u = getUnit(s, id);
  return u ? (u.team === 0 ? 't0' : 't1') : 'sys';
}
function toneOf(t: Team): Tone { return t === 0 ? 't0' : 't1'; }

const DAMAGE_WORD: Record<DamageKind, string> = {
  phys: '', fire: ' fire', frost: ' frost', shock: ' shock', poison: ' poison', burn: ' burn', dark: '', slam: ' slam', share: '', storm: ' lightning',
};

export const REASON: Record<OverReason, string> = {
  wipe: 'The other party has nobody left standing.',
  mutual: 'Both parties fell.',
  rounds: 'Round limit: the healthier party wins.',
  altar: 'The Sun Altar grants them victory.',
};

export function winnerTitle(w: Team | 'draw'): string { return w === 'draw' ? 'Draw' : `${TEAM_NAME[w]} wins`; }

/** Who set the combo up and who paid it off, for the banner and the log. */
export function comboCredit(e: Extract<BattleEvent, { type: 'combo' }>, s: BattleState): string {
  const by = name(s, e.by);
  if (e.setup === null) return `${by} pays off: ${e.name}!`;
  if (e.setup === e.by) return `${by} sets it up and pays off: ${e.name}!`;
  return `${name(s, e.setup)} set it up → ${by} pays off: ${e.name}!`;
}
export function comboInfo(e: Extract<BattleEvent, { type: 'combo' }>): string { return COMBO_INFO[e.name]; }

/** One readable log line for an event, or null when the board's animation says it all. `s` is any state of the same battle (names never change). */
export function describe(e: BattleEvent, s: BattleState): Line | null {
  switch (e.type) {
    case 'round': return { tone: 'sys', text: `Round ${e.round}: ${e.queue.map(id => name(s, id)).join(' → ')}` };
    case 'activate': return null;
    case 'move': return e.slide && e.path.length > 1 ? { tone: teamOf(s, e.id), text: `${name(s, e.id)} is pushed back ${e.path.length - 1} tile${e.path.length > 2 ? 's' : ''}.` } : null;
    case 'teleport': return null;
    case 'fall': return { tone: 'sys', text: `${name(s, e.id)} falls into the chasm!` };
    case 'cast': {
      const sk = SKILLS[e.skill], tgt = e.target !== null && e.target !== e.id ? ` on ${name(s, e.target)}` : '';
      return { tone: toneOf(e.team), text: `${name(s, e.id)} uses ${sk.name}${tgt}.` };
    }
    case 'damage': {
      const who = name(s, e.id);
      if (e.amount <= 0) return e.absorbed > 0 ? { tone: teamOf(s, e.id), text: `${who}'s shield absorbs ${e.absorbed}.` } : null;
      const blocked = e.absorbed > 0 ? ` (${e.absorbed} blocked)` : '';
      if (e.kind === 'dark') return { tone: teamOf(s, e.id), text: `The dark drains ${e.amount} HP from ${who}.` };
      if (e.kind === 'share') return { tone: teamOf(s, e.id), text: `${who} takes ${e.amount} through Shared Pain${blocked}.` };
      return { tone: teamOf(s, e.id), text: `${who} takes ${e.amount}${DAMAGE_WORD[e.kind]} damage${blocked}.` };
    }
    case 'shared': return { tone: teamOf(s, e.by), text: `${name(s, e.by)} takes half the blow for ${name(s, e.id)}.` };
    case 'heal': return e.amount > 0 ? { tone: teamOf(s, e.id), text: `${name(s, e.id)} heals ${e.amount}.` } : null;
    case 'shield': return { tone: teamOf(s, e.id), text: `${name(s, e.id)} gains a ${e.amount} shield.` };
    case 'status': return { tone: teamOf(s, e.id), text: `${name(s, e.id)} is ${STATUS[e.key].name}.` };
    case 'resist': return { tone: teamOf(s, e.id), text: `${name(s, e.id)} resists.` };
    case 'steam': return { tone: teamOf(s, e.id), text: `${name(s, e.id)} is Wet: the flames turn to steam.` };
    case 'cleanse': return { tone: teamOf(s, e.id), text: `${name(s, e.id)} is cleansed of debuffs.` };
    case 'combo': return { tone: 'combo', text: `⚡ ${comboCredit(e, s)}` };
    case 'downed': return { tone: 'sys', text: `${name(s, e.id)} is DOWNED! Help them up within 2 of their turns.` };
    case 'revive': return { tone: 'sys', text: `${name(s, e.id)} is back on their feet${e.by !== null && e.by !== e.id ? ` thanks to ${name(s, e.by)}` : ''}!` };
    case 'death': return { tone: 'sys', text: `${name(s, e.id)} ${DEATH_WORD[e.cause]}.` };
    case 'bleed': return { tone: teamOf(s, e.id), text: `${name(s, e.id)} is bleeding out: ${e.left} turn${e.left === 1 ? '' : 's'} left.` };
    case 'skip': return { tone: teamOf(s, e.id), text: `${name(s, e.id)} can't act and loses the turn.` };
    case 'dark': return null;
    case 'burst': return { tone: 'sys', text: 'A brazier bursts into flames!' };
    case 'fire': return null;
    case 'terrain': return { tone: 'sys', text: TERRAIN_LINE[e.kind] };
    case 'storm': return { tone: 'sys', text: `Lightning strikes ${e.line.toLowerCase()}!` };
    case 'crumble': return { tone: 'sys', text: `The ground gives way: ${e.tiles.length} tiles fall into the abyss.` };
    case 'favor': return e.team === null ? null : { tone: toneOf(e.team), text: `${TEAM_NAME[e.team]} holds the altar: favor ${e.favor[0]}–${e.favor[1]}.` };
    case 'roundEnd': return e.burnt.length ? { tone: 'sys', text: `The fire burns away ${e.burnt.length} tile${e.burnt.length === 1 ? '' : 's'} of grass.` } : null;
    case 'burrow': return { tone: teamOf(s, e.id), text: `${name(s, e.id)} burrows underground.` };
    case 'surface': return { tone: teamOf(s, e.id), text: `${name(s, e.id)} surfaces.` };
    case 'mouth': return null;
    case 'cavein': return { tone: 'sys', text: 'A Tunnel Mouth caves in.' };
    case 'call': return { tone: toneOf(e.team), text: `${SKILLS[e.skill].name} is called: it lands at the start of ${name(s, e.id)}'s next turn.` };
    case 'land': return { tone: teamOf(s, e.id), text: `${name(s, e.id)}'s ${SKILLS[e.skill].name} lands${e.power < 1 ? ' at half power' : ''}!` };
    case 'fizzle': return { tone: teamOf(s, e.id), text: `${name(s, e.id)}'s Call fizzles.` };
    case 'thread': return { tone: teamOf(s, e.by), text: `${name(s, e.by)} ties a Thread to ${name(s, e.to)}.` };
    case 'snap': return { tone: teamOf(s, e.by), text: `${name(s, e.by)}'s Thread to ${name(s, e.to)} breaks.` };
    case 'charge': return { tone: 'sys', text: 'A Satchel Charge is planted.' };
    case 'blast': return { tone: 'sys', text: 'A Satchel Charge blows!' };
    case 'encased': return { tone: teamOf(s, e.id), text: `${name(s, e.id)} is Encased.` };
    case 'over': return { tone: 'sys', text: `${winnerTitle(e.winner)}. ${REASON[e.reason]}` };
  }
}

const DEATH_WORD = { bled: 'bleeds out', finished: 'is finished off', fell: 'is lost to the abyss' } as const;

const TERRAIN_LINE: Readonly<Record<TerrainChange, string>> = {
  ice: 'The water freezes into ice.',
  smoke: 'Smoke fills the air.',
  web: 'Webs cover the ground.',
  sink: 'The ground is undermined: it collapses at the end of the round.',
  pit: 'The ground collapses into a pit.',
};

function bonusNames(s: BattleState, t: Team): string[] {
  const on = s.party[t], names = PAIRS.filter(p => on.has(p.id)).map(p => p.name);
  if (on.has('coverage')) names.push(COVERAGE.name);
  return names;
}

export function openingLines(s: BattleState): Line[] {
  return [
    { tone: 'sys', text: `${MAPS[s.map].name}. Order rule: the starting party acts first and last.` },
    ...TEAMS.map((t): Line => ({ tone: toneOf(t), text: `${TEAM_NAME[t]} bonuses: ${bonusNames(s, t).join(', ') || 'none'}` })),
  ];
}

/** The target preview: what a cast would do, one short line per consequence. */
export function previewLines(events: readonly BattleEvent[], s: BattleState): Line[] {
  const out: Line[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'damage':
        if (e.amount > 0 || e.absorbed > 0) out.push({ tone: teamOf(s, e.id), text: `${name(s, e.id)}: −${e.amount}${e.absorbed ? ` (${e.absorbed} blocked)` : ''}` });
        break;
      case 'heal': if (e.amount > 0) out.push({ tone: teamOf(s, e.id), text: `${name(s, e.id)}: +${e.amount}` }); break;
      case 'shield': out.push({ tone: teamOf(s, e.id), text: `${name(s, e.id)}: +${e.amount} shield` }); break;
      case 'status': out.push({ tone: teamOf(s, e.id), text: `${name(s, e.id)}: ${STATUS[e.key].icon} ${STATUS[e.key].name}` }); break;
      case 'combo': out.push({ tone: 'combo', text: `⚡ COMBO: ${e.name}` }); break;
      case 'downed': out.push({ tone: 'sys', text: `✖ ${name(s, e.id)} goes down` }); break;
      case 'death': out.push({ tone: 'sys', text: `☠ ${name(s, e.id)} is finished` }); break;
      case 'revive': out.push({ tone: 'sys', text: `${name(s, e.id)} gets back up` }); break;
      case 'fall': out.push({ tone: 'sys', text: `${name(s, e.id)} falls into the chasm` }); break;
      case 'encased': out.push({ tone: teamOf(s, e.id), text: `${name(s, e.id)}: Encased` }); break;
      case 'thread': out.push({ tone: teamOf(s, e.to), text: `${name(s, e.to)}: tied by a Thread` }); break;
      case 'snap': out.push({ tone: teamOf(s, e.by), text: `Thread to ${name(s, e.to)} breaks` }); break;
      case 'surface': out.push({ tone: teamOf(s, e.id), text: `${name(s, e.id)} surfaces` }); break;
      case 'blast': out.push({ tone: 'sys', text: 'The Satchel Charge blows' }); break;
      default: break;
    }
  }
  return out;
}

/** The target preview for a Call: when it lands and who stands in its area right now. */
export function callLines(s: BattleState, u: Unit, skill: CallSkill, x: number, z: number): Line[] {
  const out: Line[] = [{ tone: 'sys', text: `Lands at the start of ${u.name}'s next turn.` }];
  if (skill === 'recall') {
    const o = unitAt(s, x, z);
    if (o) out.push({ tone: teamOf(s, o.id), text: `${o.name} snaps back to this tile and regains the HP it lost.` });
    return out;
  }
  const tiles = callTiles(skill, x, z), quake = !!SKILLS[skill].quake;
  const inside = s.units.filter(o => o.life.kind !== 'dead' && o !== u && tiles.some(t => t.x === o.x && t.z === o.z));
  if (tiles.some(t => t.x === u.x && t.z === u.z)) inside.unshift(u);
  for (const o of inside) {
    const tone = teamOf(s, o.id);
    if (o.under) out.push({ tone, text: o.team !== u.team && quake ? `${o.name}: underground, forced up and Stunned (Quake)` : `${o.name}: underground, spared` });
    else if (o.team !== u.team) out.push({ tone, text: `${o.name}: in the area now` });
    else if (u.mods.benevolent && skill !== 'gravitywell') out.push({ tone, text: `${o.name}: ally, healed instead (Benevolent Heavens)` });
    else out.push({ tone: 'combo', text: `⚠ ${o.name}: ally in the area, friendly fire` });
  }
  if (inside.length === 0) out.push({ tone: 'sys', text: 'Nobody stands there yet.' });
  return out;
}
