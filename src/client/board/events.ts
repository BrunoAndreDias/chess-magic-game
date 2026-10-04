import * as THREE from 'three';
import { CLASSES, N, SKILLS, STATUS, getUnit } from '../../engine/index';
import type { BattleEvent, BattleState, CallSkill, DamageKind, Pos, SkillId, StatusKey, Team, TerrainChange, UnitId } from '../../engine/index';
import { TEAM_CSS, TEAM_HEX, hex } from './art';
import type { Fx } from './fx';
import type { Marks } from './marks';
import type { Overlay } from './overlay';
import type { Stage } from './stage';
import type { Terrain } from './terrain';
import { easeInOut } from './tween';
import type { Tweens } from './tween';
import { face, setPose } from './units';
import type { UnitView } from './units';

/** What an event handler may touch. `before`/`after` resolve names and final values; the scene is mid-flight. */
export interface PlayCtx {
  before: BattleState;
  after: BattleState;
  views: ReadonlyMap<UnitId, UnitView>;
  terrain: Terrain;
  marks: Marks;
  fx: Fx;
  tweens: Tweens;
  overlay: Overlay;
  stage: Stage;
  /** Camera tracks the acting unit (the HUD's Follow toggle). */
  follow(): boolean;
  setActive(id: UnitId | null): void;
  active(): UnitId | null;
}

type Handler<K extends BattleEvent['type']> = (e: Extract<BattleEvent, { type: K }>, c: PlayCtx) => Promise<void> | void;

type Handlers = { [K in BattleEvent['type']]: Handler<K> };

const above = (v: UnitView, y: number): THREE.Vector3 => v.group.position.clone().add(new THREE.Vector3(0, y, 0));

function track(c: PlayCtx, v: UnitView, team: Team): void {
  if (c.follow()) c.stage.follow(v.group.position, team);
}

const DAMAGE_COLOR: Readonly<Record<DamageKind, string>> = {
  phys: '#ff6b5b', fire: '#ff8a4a', burn: '#ff8a4a', poison: '#8fe36b', frost: '#9ad8ff', shock: '#d6b8ff',
  dark: '#c8a0ff', slam: '#ffb08a', share: '#f0a0d0', storm: '#bfe0ff', drain: '#ff8a8a',
};

const STATUS_TEXT: Readonly<Record<StatusKey, string>> = {
  stun: 'Stunned!', root: 'Rooted!', wet: 'Wet', burn: 'Burning!', poison: 'Poisoned', expose: 'Exposed!', encased: 'Encased', share: 'Shared Pain', wither: 'Withered!', hush: 'Hushed!', guard: 'Bell Guard', haste: 'Quickened',
};

const TERRAIN_COLOR: Readonly<Record<TerrainChange, number>> = { ice: 0xcff4ff, smoke: 0x9aa0b0, web: 0xf4eefa, bone: 0xe8e2d0 };

const DUST = 0x9a7a5a;

type CastKind = 'proj' | 'lob' | 'call' | 'heal' | 'nova' | 'link' | 'raise' | 'melee' | 'none';

/** How a cast looks from the caster. What it does to the board (a Call's marker, a Thread) is its own event. */
const CAST_KIND: Readonly<Record<SkillId, CastKind>> = {
  snap: 'nova', meteor: 'call', thunderhead: 'call', gravitywell: 'call', frostbolt: 'proj', firebolt: 'proj', prison: 'link', recall: 'call',
  tether: 'none', reel: 'nova', web: 'lob', cocoon: 'link', venombite: 'melee', puppet: 'link', sharedpain: 'nova', skitter: 'none',
  toll: 'link', knell: 'proj', hush: 'link', peal: 'nova', encore: 'heal', overture: 'nova', hourglass: 'link', bellguard: 'nova',
  harvest: 'nova', lastrites: 'heal', bonewall: 'raise', wither: 'link', soulbolt: 'proj', soulburst: 'raise', siphon: 'link', equalize: 'link',
  helpup: 'heal',
  basic_astromancer: 'proj', basic_weaver: 'melee', basic_gravecaller: 'proj', basic_bellringer: 'melee',
};

interface Shot { e: Extract<BattleEvent, { type: 'cast' }>; c: PlayCtx; v: UnitView; from: THREE.Vector3; to: THREE.Vector3; color: number; basic: boolean }

const CAST_FX: Readonly<Record<CastKind, (s: Shot) => Promise<void> | void>> = {
  proj: s => s.c.fx.projectile(s.from, s.to, s.color, s.basic ? 0.2 : 0.32, 0.32, 0.5),
  lob: async s => {
    const ground = s.c.terrain.at(s.e.tx, s.e.tz, 0.3);
    await s.c.fx.projectile(s.from, ground, s.color, 0.3, 0.42, 1.4);
    void s.c.fx.ring(s.c.terrain.at(s.e.tx, s.e.tz, 0.08), s.color, 1.8, 0.5);
  },
  call: async s => {
    await s.c.fx.projectile(s.from, s.from.clone().add(new THREE.Vector3(0, 3.2, 0)), s.color, 0.28, 0.3, 0);
    void s.c.fx.burst(s.from.clone().add(new THREE.Vector3(0, 3.2, 0)), s.color, 2.4, 0.4);
  },
  heal: s => {
    s.c.fx.sparkles(s.c.terrain.at(s.e.tx, s.e.tz), s.color, 12);
    void s.c.fx.burst(s.to, s.color, 2, 0.4);
  },
  nova: async s => {
    void s.c.fx.burst(above(s.v, 0.5), s.color, 2.4, 0.4);
    await s.c.fx.ring(above(s.v, 0.1), s.color, 2.6, 0.5);
  },
  link: s => { s.c.fx.bolt(s.from, s.to, s.color, 0.05); void s.c.fx.burst(s.to, s.color, 2, 0.4); },
  raise: s => { void s.c.fx.burst(s.to, s.color, 2, 0.4); s.c.stage.shake(0.2); },
  melee: async s => {
    const home = s.v.group.position.clone(), dir = s.to.clone().sub(home).setY(0).normalize().multiplyScalar(0.38);
    await s.c.tweens.run(0.12, p => { s.v.group.position.copy(home).addScaledVector(dir, Math.sin(p * Math.PI)); });
    void s.c.fx.burst(s.to, s.color, 2, 0.3);
  },
  none: () => {},
};

function skillColor(id: SkillId): number {
  const sk = SKILLS[id];

  return hex(sk.color ?? (sk.cls ? CLASSES[sk.cls].color : '#e8e2d0'));
}

/** The middle tile of a Call's square area. */
const centerOf = (tiles: readonly Pos[]): Pos => tiles[Math.floor(tiles.length / 2)] ?? { x: 0, z: 0 };

type Land = Extract<BattleEvent, { type: 'land' }>;

const LAND_FX: Readonly<Record<CallSkill, (e: Land, c: PlayCtx, sigil: THREE.Vector3 | null) => Promise<void>>> = {
  meteor: async (e, c, sigil) => {
    const at = c.terrain.at(e.x, e.z, 0.3, false), k = e.power;
    const from = (sigil ?? at.clone().add(new THREE.Vector3(0, 2, 0))).clone().add(new THREE.Vector3(1.6, 6, -1.6));
    await c.fx.projectile(from, at, 0xff6a2b, 0.75 * k + 0.25, 0.5, 0);
    void c.fx.burst(at, 0xff6a2b, 7 * k, 0.6);
    void c.fx.burst(at, 0xffe0a0, 3.5 * k, 0.35);
    void c.fx.ring(at.clone().setY(at.y - 0.2), 0xff8a3a, 2.4 * k, 0.6);

    for (const t of e.tiles) c.fx.sparkles(c.terrain.at(t.x, t.z, 0, false), 0xff8a3a, 3);
    c.stage.shake(0.45 * k);
    await c.tweens.wait(0.3);
  },
  thunderhead: async (e, c) => {
    const at = c.terrain.at(e.x, e.z, 0, false);
    const sky = at.clone().add(new THREE.Vector3(0, 3.4, 0)), gather = c.fx.cloud(sky, 2.6, 1.2);
    await c.tweens.wait(0.4);

    for (const t of e.tiles) {
      const g = c.terrain.at(t.x, t.z, 0.05, false);
      c.fx.bolt(sky.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5)), g, 0xe8dcff, 0.45);
      void c.fx.ring(g, 0xc9a7ff, 0.6, 0.4);
    }

    c.stage.shake(0.3);
    await gather;
  },
  gravitywell: async (e, c) => {
    const at = c.terrain.at(e.x, e.z, 0.1, false);

    for (let i = 0; i < 3; i++) { void c.fx.implode(at, i % 2 ? 0x9a8cff : 0x7a6aff, 2.8, 0.55); await c.tweens.wait(0.12); }

    void c.fx.burst(at.clone().add(new THREE.Vector3(0, 0.5, 0)), 0x7a6aff, 2.6, 0.5);
    await c.tweens.wait(0.35);
  },
  recall: async (e, c) => {
    const at = c.terrain.at(e.x, e.z, 0.1, false);
    c.fx.sparkles(at, 0xffe08a, 14);
    void c.fx.implode(at, 0xffe08a, 1.4, 0.5);
    await c.fx.implode(at, 0xfff3c0, 0.9, 0.5);
  },
};

async function castPose(c: PlayCtx, v: UnitView): Promise<void> {
  const w = v.weapon, y0 = w.position.y;
  await c.tweens.run(0.22, p => { w.rotation.x = -Math.sin(p * Math.PI) * 0.7; w.position.y = y0 + Math.sin(p * Math.PI) * 0.12; });
}

/** One entry per event type: adding an event type to the engine fails compilation here until it has an animation. */
export const PLAY: Handlers = {
  round: () => {},
  queue: (_e, c) => {
    const id = c.active(), v = id !== null ? c.views.get(id) : undefined;

    if (!v) return;
    void c.fx.ring(above(v, 0.1), 0xe0b04a, 3.2, 0.6);
    c.overlay.float('🔔 the order changes', '#e0b04a', above(v, 2.6));
  },
  storm: async (e, c) => {
    for (const t of e.tiles) {
      const ground = c.terrain.at(t.x, t.z, 0.1);
      c.fx.bolt(ground.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 7, (Math.random() - 0.5) * 0.6)), ground, 0xdff4ff, 0.5);
      void c.fx.ring(ground, 0x9ad8ff, 0.7, 0.5);
    }

    c.stage.shake(0.3);
    await c.tweens.wait(0.25);

    for (const t of e.tiles) void c.fx.burst(c.terrain.at(t.x, t.z, 0.4), 0xbfe8ff, 1.6, 0.45);
    await c.tweens.wait(0.35);
  },
  crumble: async (e, c) => {
    const views = e.tiles.flatMap(t => c.terrain.tile(t.x, t.z) ?? []);

    for (const t of views) {
      void c.fx.burst(c.terrain.at(t.x, t.z, 0.2), 0x8a7a6a, 1.8, 0.6);
      c.fx.sparkles(c.terrain.at(t.x, t.z), 0x6a5a4a, 3);
    }

    c.stage.shake(0.4);
    await c.tweens.run(0.6, p => { for (const t of views) t.group.position.y = -1.6 * p * p; });
    c.terrain.rebase(c.after, e.tiles);
  },
  favor: async (e, c) => {
    const tiles = c.after.terr.flatMap((ch, k) => (ch === 'A' ? [c.terrain.at(k % N, Math.floor(k / N))] : []));

    if (e.team === null || !tiles.length) return;
    const mid = tiles.reduce((a, b) => a.add(b), new THREE.Vector3()).divideScalar(tiles.length);

    for (const p of tiles) c.fx.sparkles(p, TEAM_HEX[e.team], 5);
    void c.fx.ring(mid.clone().setY(mid.y + 0.08), TEAM_HEX[e.team], 1.8, 0.6);
    c.overlay.float('+1 favor', TEAM_CSS[e.team], mid.add(new THREE.Vector3(0, 1.8, 0)), true);
    await c.tweens.wait(0.5);
  },
  activate: async (e, c) => {
    c.setActive(e.id);
    const v = c.views.get(e.id);

    if (!v) return;
    track(c, v, e.team);

    if (v.shown.life.kind === 'up') await c.tweens.wait(0.25);
  },
  move: async (e, c) => {
    const v = c.views.get(e.id);

    if (!v) return;
    const step = e.slide ? 0.09 : 0.14, hop = e.slide ? 0.04 : 0.12;

    for (let i = 1; i < e.path.length; i++) {
      const a = e.path[i - 1]!, b = e.path[i]!;
      const pa = c.terrain.at(a.x, a.z, 0, false), pb = c.terrain.at(b.x, b.z, 0, false);

      if (!e.slide) face(v, pb.x, pb.z);
      await c.tweens.run(step, p => { v.group.position.lerpVectors(pa, pb, p); v.group.position.y += Math.sin(p * Math.PI) * hop; });
    }

    if (c.active() === e.id) track(c, v, v.team);
  },
  teleport: async (e, c) => {
    const v = c.views.get(e.id);

    if (!v) return;
    const col = 0xb07cff;
    void c.fx.burst(above(v, 0.7), col, 2.2, 0.4);
    c.fx.sparkles(v.group.position.clone(), col, 6);
    await c.tweens.run(0.12, p => { v.group.scale.setScalar(1 - p * 0.95); });
    v.group.position.copy(c.terrain.at(e.x, e.z));
    void c.fx.burst(c.terrain.at(e.x, e.z, 0.7), col, 2.2, 0.4);
    await c.tweens.run(0.15, p => { v.group.scale.setScalar(0.05 + p * 0.95); });

    if (c.active() === e.id) track(c, v, v.team);
  },
  fall: async (e, c) => {
    const v = c.views.get(e.id);

    if (!v) return;
    const a = v.group.position.clone(), b = c.terrain.at(e.x, e.z, 0, true);
    c.overlay.float('INTO THE ABYSS', '#c8a0ff', above(v, 2), true);
    await c.tweens.run(0.5, p => { v.group.position.lerpVectors(a, b, p * p); v.group.rotation.z = p * 1.2; });
    v.group.rotation.z = 0;
  },
  cast: async (e, c) => {
    const v = c.views.get(e.id);

    if (!v) return;
    const sk = SKILLS[e.skill], to = c.terrain.at(e.tx, e.tz, 0.8);

    if (sk.target !== 'self') face(v, to.x, to.z);
    await castPose(c, v);
    const shot: Shot = { e, c, v, from: above(v, v.height * 0.85), to, color: skillColor(e.skill), basic: !!sk.basic };
    await CAST_FX[CAST_KIND[e.skill]](shot);
  },
  damage: async (e, c) => {
    const v = c.views.get(e.id);

    if (!v) return;
    v.shown.hp = Math.max(0, v.shown.hp - e.amount);
    v.shown.shield = Math.max(0, v.shown.shield - e.absorbed);

    if (e.amount > 0) {
      c.overlay.float(`−${e.amount}`, DAMAGE_COLOR[e.kind], above(v, 1.6), e.amount >= 30);
      c.fx.flash(v.main, 0xff2a1a);

      if (e.amount >= 30) c.stage.shake(0.18);
    }

    if (e.absorbed > 0) c.overlay.float(`(${e.absorbed} blocked)`, '#e0c477', above(v, 2.1));
    await c.tweens.wait(0.06);
  },
  shared: (e, c) => {
    const v = c.views.get(e.id), w = c.views.get(e.by);

    if (!v || !w) return;
    c.fx.bolt(above(v, 0.8), above(w, 0.8), 0xf0a0d0, 0.08);
    c.overlay.float('💞 shared', '#f0a0d0', above(w, 2.2));
  },
  heal: (e, c) => {
    const v = c.views.get(e.id);

    if (!v || e.amount <= 0) return;
    v.shown.hp = Math.min(v.shown.maxHp, v.shown.hp + e.amount);
    c.fx.sparkles(above(v, 0.4), 0x7ee081, 8);
    c.overlay.float(`+${e.amount}`, '#7ee081', above(v, 1.7));
  },
  shield: (e, c) => {
    const v = c.views.get(e.id);

    if (!v) return;
    v.shown.shield += e.amount;
    c.overlay.float(`+${e.amount} 🛡`, '#e0c477', above(v, 1.7));
    void c.fx.burst(above(v, 0.7), 0xe0c477, 2, 0.4);
  },
  status: (e, c) => {
    const v = c.views.get(e.id);

    if (!v) return;
    v.shown.st.add(e.key);
    const S = STATUS[e.key];
    c.overlay.float(`${S.icon} ${STATUS_TEXT[e.key]}`, S.color, above(v, 2.1));
  },
  resist: (e, c) => {
    const v = c.views.get(e.id);

    if (v) c.overlay.float('Resists', '#e0b877', above(v, 2.1));
  },
  steam: (e, c) => {
    const v = c.views.get(e.id);

    if (!v) return;
    c.overlay.float('Steam: no burn', '#9ad0ff', above(v, 2.1));
    void c.fx.burst(above(v, 0.9), 0xcfe8ff, 2, 0.4);
  },
  cleanse: (e, c) => {
    const v = c.views.get(e.id);

    if (!v) return;

    for (const k of [...v.shown.st]) if (STATUS[k].bad) v.shown.st.delete(k);
    c.fx.sparkles(above(v, 0.4), 0xffe08a, 8);
  },
  combo: async (e, c) => {
    const v = (e.id !== null ? c.views.get(e.id) : undefined) ?? c.views.get(e.by);

    if (v) {
      c.overlay.float(`${e.name}!`, '#ffd36b', above(v, 2.6), true);
      void c.fx.ring(above(v, 0.1), 0xffd36b, 2.4, 0.55);
      void c.fx.burst(above(v, 1), 0xffd36b, 3.4, 0.5);
    }

    c.stage.shake(0.25);
    await c.tweens.wait(0.38);
  },
  downed: async (e, c) => {
    const v = c.views.get(e.id);

    if (!v) return;
    const u = getUnit(c.after, e.id);
    v.shown.hp = 0;
    v.shown.life = { kind: 'downed', bleed: u?.life.kind === 'downed' ? u.life.bleed : 2 };
    c.overlay.float('DOWNED', '#ff5a4a', above(v, 2.2), true);
    await c.tweens.run(0.4, p => setPose(v, easeInOut(p)));
    await c.tweens.wait(0.2);
  },
  revive: async (e, c) => {
    const v = c.views.get(e.id);

    if (!v) return;
    const u = getUnit(c.after, e.id);
    v.shown.life = { kind: 'up' };
    v.shown.hp = u && u.life.kind === 'up' ? u.hp : Math.round(v.shown.maxHp * 0.3);
    c.fx.sparkles(above(v, 0.2), 0xfff3b0, 16);
    void c.fx.burst(above(v, 0.8), 0xfff3b0, 3, 0.5);
    c.overlay.float('BACK UP!', '#fff3b0', above(v, 2.2), true);
    await c.tweens.run(0.45, p => setPose(v, 1 - easeInOut(p)));
  },
  death: async (e, c) => {
    const v = c.views.get(e.id);

    if (!v) return;
    v.shown.life = { kind: 'dead' };
    v.ring.visible = false;
    void c.fx.burst(above(v, 0.5), 0x6a2a2a, 2.6, 0.6);
    const y0 = v.group.position.y;
    await c.tweens.run(0.6, p => { v.group.scale.setScalar(1 - p * 0.99); v.group.position.y = y0 - p * 0.3; });
    v.group.visible = false;
  },
  bleed: async (e, c) => {
    const v = c.views.get(e.id);

    if (!v) return;
    v.shown.life = { kind: 'downed', bleed: e.left };
    c.overlay.float(`🩸 bleeding · ${e.left} left`, '#ff7a6a', above(v, 1.4));
    await c.tweens.wait(0.45);
  },
  skip: async (e, c) => {
    const v = c.views.get(e.id);

    if (!v) return;
    const held = v.shown.st.has('encased') && !v.shown.st.has('stun');
    v.shown.st.delete('stun');
    c.overlay.float(held ? `${v.shown.ice ? '🧊' : '🥚'} held fast` : '💫 loses the turn', held ? '#b8e8ff' : '#ffd36b', above(v, 2.2));
    await c.tweens.wait(0.5);
  },
  dark: (e, c) => {
    const v = c.views.get(e.id);

    if (v) c.overlay.float(`🕯 −${e.amount}`, '#c8a0ff', above(v, 2.4));
  },
  burst: (e, c) => {
    c.terrain.setSpent(e.x, e.z, true);
    const p = c.terrain.at(e.x, e.z, 1);
    void c.fx.burst(p, 0xff7a2a, 5, 0.6);
    void c.fx.burst(p, 0xffe0a0, 2.5, 0.35);
    c.stage.shake(0.35);
  },
  fire: (e, c) => {
    c.terrain.setFx(e.x, e.z, 'fire', true);
    void c.fx.burst(c.terrain.at(e.x, e.z, 0.4), 0xff6a2b, 1.4, 0.35);
  },
  terrain: async (e, c) => {
    for (const t of e.tiles) {
      c.terrain.setFx(t.x, t.z, e.kind, true);
      void c.fx.burst(c.terrain.at(t.x, t.z, 0.4, false), TERRAIN_COLOR[e.kind], e.kind === 'web' ? 1.1 : 1.6, 0.35);

      if (e.kind !== 'web') c.fx.sparkles(c.terrain.at(t.x, t.z, 0, false), DUST, 4);
    }

    await c.tweens.wait(0.2);
  },
  roundEnd: async (e, c) => {
    for (const k of e.burnt) {
      const x = k % N, z = Math.floor(k / N);
      void c.fx.burst(c.terrain.at(x, z, 0.3), 0xff8a3a, 1.8, 0.5);
      c.fx.sparkles(c.terrain.at(x, z), 0x5a4a44, 4);
    }

    c.terrain.sync(c.after);

    if (e.burnt.length) await c.tweens.wait(0.3);
  },
  call: async (e, c) => {
    const at = centerOf(e.tiles);
    await c.marks.placeCall({ by: e.id, team: e.team, skill: e.skill, x: at.x, z: at.z, recall: null }, c.after);
  },
  land: async (e, c) => {
    const sigil = c.marks.takeCall(e.id, e);
    const v = c.views.get(e.id);

    if (v && c.follow()) c.stage.follow(c.terrain.at(e.x, e.z), v.team);
    await LAND_FX[e.skill](e, c, sigil);
  },
  fizzle: async (e, c) => {
    for (let at = c.marks.takeCall(e.id, null); at; at = c.marks.takeCall(e.id, null)) {
      c.fx.sparkles(at, 0x9a8cff, 8);
      void c.fx.burst(at, 0x6a6a8a, 1.6, 0.5);
      c.overlay.float('fizzles', '#9a8cff', at);
    }

    await c.tweens.wait(0.2);
  },
  thread: async (e, c) => {
    const t = c.after.threads.find(x => x.by === e.by && x.to === e.to) ?? { by: e.by, to: e.to, len: 1 };
    const v = c.views.get(e.to);

    if (v) void c.fx.burst(above(v, 0.8), 0xf4eefa, 1.4, 0.35);
    await c.marks.tie(t, c.after);
  },
  snap: (e, c) => c.marks.snap(e),
  encased: (e, c) => {
    const v = c.views.get(e.id);

    if (!v) return;
    const ice = !!getUnit(c.after, e.id)?.st.encased?.ice;
    v.shown.st.add('encased');
    v.shown.ice = ice;
    void c.fx.burst(above(v, v.height * 0.5), ice ? 0xbfeaff : 0xf4eefa, 2.4, 0.45);
    c.fx.sparkles(above(v, 0.2), ice ? 0xcff4ff : 0xffffff, 8);
    c.overlay.float(ice ? '🧊 Encased' : '🥚 Cocooned', ice ? '#b8e8ff' : '#f3e6ff', above(v, 2.1));
  },
  soul: (e, c) => c.marks.dropSoul(e),
  gather: (e, c) => c.marks.gather(e, c.views.get(e.id)),
  spend: (e, c) => {
    const v = c.views.get(e.id);

    if (!v) return;
    c.fx.sparkles(above(v, 1), 0x9fe0b8, 8);
    c.overlay.float('−1 Soul', '#9fe0b8', above(v, 2.2));
  },
  over: () => {},
};

export async function playEvent(e: BattleEvent, c: PlayCtx): Promise<void> {
  // The mapped type guarantees PLAY[e.type] accepts this exact variant; TS cannot correlate the two through a union index.
  await (PLAY[e.type] as Handler<typeof e.type>)(e as never, c);
}
