import { COMBO_INFO, MAPS, PAIRS, SKILLS, STATUS, TRINITY, getUnit } from '../engine/index';
import type { BattleEvent, BattleState, DamageKind, Team, UnitId } from '../engine/index';
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
  phys: '', fire: ' fire', frost: ' frost', shock: ' shock', holy: ' holy', poison: ' poison', burn: ' burn', dark: '', slam: ' slam', guard: '',
};

export const REASON: Record<'wipe' | 'mutual' | 'rounds', string> = {
  wipe: 'The other party has nobody left standing.',
  mutual: 'Both parties fell.',
  rounds: 'Round limit: the healthier party wins.',
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
      return { tone: toneOf(e.team), text: `${name(s, e.id)} uses ${sk.name}${tgt}${e.empowered ? ', empowered' : ''}.` };
    }
    case 'damage': {
      const who = name(s, e.id);
      if (e.amount <= 0) return e.absorbed > 0 ? { tone: teamOf(s, e.id), text: `${who}'s shield absorbs ${e.absorbed}.` } : null;
      const blocked = e.absorbed > 0 ? ` (${e.absorbed} blocked)` : '';
      if (e.kind === 'dark') return { tone: teamOf(s, e.id), text: `The dark drains ${e.amount} HP from ${who}.` };
      if (e.kind === 'guard') return { tone: teamOf(s, e.id), text: `${who} takes ${e.amount} guarding an ally${blocked}.` };
      return { tone: teamOf(s, e.id), text: `${who} takes ${e.amount}${DAMAGE_WORD[e.kind]} damage${blocked}.` };
    }
    case 'guarded': return { tone: teamOf(s, e.by), text: `${name(s, e.by)} takes half the blow for ${name(s, e.id)}.` };
    case 'heal': return e.amount > 0 ? { tone: teamOf(s, e.id), text: `${name(s, e.id)} heals ${e.amount}.` } : null;
    case 'shield': return { tone: teamOf(s, e.id), text: `${name(s, e.id)} gains a ${e.amount} shield.` };
    case 'status': return { tone: teamOf(s, e.id), text: `${name(s, e.id)} is ${STATUS[e.key].name}.` };
    case 'resist': return { tone: teamOf(s, e.id), text: `${name(s, e.id)} is Unbreakable.` };
    case 'steam': return { tone: teamOf(s, e.id), text: `${name(s, e.id)} is Wet: the flames turn to steam.` };
    case 'cleanse': return { tone: teamOf(s, e.id), text: `${name(s, e.id)} is cleansed of debuffs.` };
    case 'combo': return { tone: 'combo', text: `⚡ ${comboCredit(e, s)}` };
    case 'downed': return { tone: 'sys', text: `${name(s, e.id)} is DOWNED! Help them up within 2 of their turns.` };
    case 'revive': return { tone: 'sys', text: `${name(s, e.id)} is back on their feet${e.by !== null && e.by !== e.id ? ` thanks to ${name(s, e.by)}` : ''}!` };
    case 'death': return { tone: 'sys', text: e.cause === 'bled' ? `${name(s, e.id)} bleeds out.` : `${name(s, e.id)} is finished off.` };
    case 'bleed': return { tone: teamOf(s, e.id), text: `${name(s, e.id)} is bleeding out: ${e.left} turn${e.left === 1 ? '' : 's'} left.` };
    case 'skip': return { tone: teamOf(s, e.id), text: `${name(s, e.id)} is stunned and loses the turn.` };
    case 'dark': return null;
    case 'burst': return { tone: 'sys', text: 'A brazier bursts into flames!' };
    case 'fire': return null;
    case 'terrain': return { tone: 'sys', text: TERRAIN_LINE[e.kind] };
    case 'roundEnd': return e.burnt.length ? { tone: 'sys', text: `The fire burns away ${e.burnt.length} tile${e.burnt.length === 1 ? '' : 's'} of grass.` } : null;
    case 'over': return { tone: 'sys', text: `${winnerTitle(e.winner)}. ${REASON[e.reason]}` };
  }
}

const TERRAIN_LINE = {
  wall: 'A barricade rises.',
  ice: 'The water freezes into ice.',
  flood: 'The ground floods.',
  smoke: 'Smoke fills the air.',
} as const;

function bonusNames(s: BattleState, t: Team): string[] {
  const on = s.party[t], names = PAIRS.filter(p => on.has(p.id)).map(p => p.name);
  if (on.has('trinity')) names.push(TRINITY.name);
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
      default: break;
    }
  }
  return out;
}
