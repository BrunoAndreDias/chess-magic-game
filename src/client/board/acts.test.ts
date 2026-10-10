import * as THREE from 'three';
import { expect, test } from 'vitest';
import { clipFor, isAct, rig, weightAt } from './acts';

test('an act plays its own clip, a skill without one plays cast, a basic attack plays attack, and no clip leaves it procedural', () => {
  const bellringer = new Set(['cast', 'attack', 'toll', 'hit']);
  expect(['toll', 'peal', 'basic_bellringer', 'hit', 'move'].map(a => clipFor(bellringer, a as never))).toEqual(['toll', 'cast', 'attack', 'hit', null]);
  expect(clipFor(new Set(['cast']), 'basic_bellringer')).toBe('cast');
  expect(['toll', 'basic_weaver', 'cast'].map(a => clipFor(new Set(['orbitAction']), a as never))).toEqual([null, null, null]);
});

test('clips named after a motion or a skill are actions, every other clip is idle', () => {
  const names = ['cast', 'toll', 'basic_weaver', 'rise', 'breathAction', 'bell_swingAction', 'idle_toll', 'constructor'];
  expect(names.filter(isAct)).toEqual(['cast', 'toll', 'basic_weaver', 'rise']);
});

test('a clip fades in and out over idle, unless it cuts in over another clip or holds its last frame', () => {
  expect([0, 0.05, 0.4, 0.75, 0.8].map(t => +weightAt(t, 0.8, false, false).toFixed(6))).toEqual([0, 0.5, 1, 0.5, 0]);
  expect([weightAt(0, 0.8, true, false), weightAt(0.8, 0.8, false, true)]).toEqual([1, 1]);
});

function figure() {
  const body = new THREE.Group(), bell = new THREE.Object3D(), bead = new THREE.Object3D();
  bell.name = 'bell';
  bead.name = 'bead';
  body.add(bell, bead);
  const clip = (name: string, node: string, times: number[], values: number[]): THREE.AnimationClip =>
    new THREE.AnimationClip(name, -1, [new THREE.VectorKeyframeTrack(`${node}.position`, times, values)]);
  const cast = clip('cast', 'bell', [0, 1], [0, 0, 0, 0, 0, 2]);
  cast.userData.strike = 0.25;
  const clips = [clip('swayAction', 'bell', [0, 1], [0, 1, 0, 0, 1, 0]), clip('beadAction', 'bead', [0, 1], [0, 3, 0, 0, 3, 0]),
    cast, clip('hit', 'bell', [0, 0.5], [5, 0, 0, 5, 0, 0])];
  const at = (o: THREE.Object3D): number[] => o.position.toArray().map(x => +x.toFixed(3) + 0);
  return { r: rig(body, clips), bell: () => at(bell), bead: () => at(bead) };
}

test('an action clip reads its strike from userData, else strikes at its midpoint', () => {
  expect([...figure().r.acts].map(([name, a]) => [name, a.length, a.strike])).toEqual([['cast', 1, 0.25], ['hit', 0.5, 0.25]]);
});

test('a posed clip blends over only the idle clips that move the same node, and a newer clip silences the older pose', () => {
  const { r, bell, bead } = figure();
  r.tick(0);
  expect(bell()).toEqual([0, 1, 0]);
  const cast = r.start('cast');
  cast.pose(0.5, 1);
  r.tick(0.1);
  expect([cast.cut, bell(), bead()]).toEqual([false, [0, 0, 1], [0, 3, 0]]);
  cast.pose(0.5, 0.5);
  r.tick(0.2);
  expect(bell()).toEqual([0, 0.5, 0.5]);
  const hit = r.start('hit');
  hit.pose(0, 1);
  cast.pose(1, 1);
  r.tick(0.3);
  expect([hit.cut, bell()]).toEqual([true, [5, 0, 0]]);
});
