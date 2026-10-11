"""Measures how far each hand slips off what it holds, in a built figure's glb, over every frame of every clip.

A figure marks each closed fist with an empty `grip_<side>` that rides the hand and the point the fist closes on with
an empty `hold_<side>` that rides the held prop. Per clip and hand this prints the largest distance between the two,
and, when the fist is its own mesh `hand_<side>_mesh`, how much the distance from the fist's centre to that point
changes (a prop may turn in the fist, as a bell swings on its bail, but must not pull away from it), and the lowest
point of each held prop (every mesh under the object that carries `hold_<side>`), which must stay on or above the
floor at z = 0. Exits non-zero if a hand slips more than 0.01 (1 cm) or a prop sinks more than 0.005 into the floor.

The gate is proven by breaking it: reparent `hold_r` to `breath` after the import (keeping its world transform), and
on the Gravecaller every action clip reports a slip of 0.13 to 0.45 and the run exits 1.

usage: blender --background --factory-startup --python art/grips.py -- public/models/<class>.glb
"""
import sys

import bpy
import numpy as np
from mathutils import Matrix

LIMIT = 0.01
FLOOR = -0.005


def clips():
    """Each clip as (name, {object: (action, slot)}, the part whose frames it spans): the idle loops together, then
    every action clip on top of them."""
    idle, acts = {}, {}
    for a in bpy.data.actions:
        for slot in a.slots:
            ob = next((o for o in bpy.data.objects if 'OB' + o.name == slot.identifier), None)
            if ob is None:
                continue
            if a.name.endswith('Action'):
                idle[ob] = (a, slot)
            else:
                acts.setdefault(a.name, {})[ob] = (a, slot)
    return [('idle', idle, idle)] + [(name, {**idle, **binds}, binds) for name, binds in sorted(acts.items())]


def play(binds, span, still):
    """Binds a clip on the rest pose: a channel no bound clip keys rests, as in the game, rather than keeping
    whatever the last clip left there. A bone rests at its bind pose; the importer leaves it posed by a clip."""
    for ob in bpy.data.objects:
        ad = ob.animation_data or ob.animation_data_create()
        ad.action = None
        ob.matrix_basis = still[ob]
        for pb in ob.pose.bones if ob.pose else ():
            pb.matrix_basis = Matrix()
    for ob, (a, slot) in binds.items():
        ob.animation_data.action, ob.animation_data.action_slot = a, slot
    starts, ends = zip(*(a.frame_range for a, _ in span.values()))
    return range(int(min(starts)), int(max(ends)) + 1)


def centre(ob):
    me = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    c = sum((v.co for v in me.vertices), me.vertices[0].co * 0) / len(me.vertices)
    return ob.matrix_world @ c


def points(prop):
    """Every vertex of the meshes `prop` carries, in its own space, and that space's offset to each mesh."""
    out = []
    for ob in [prop, *prop.children_recursive]:
        if ob.type == 'MESH':
            co = np.empty(len(ob.data.vertices) * 3)
            ob.data.vertices.foreach_get('co', co)
            out.append((ob, np.c_[co.reshape(-1, 3), np.ones(len(co) // 3)]))
    return out


def lowest(meshes):
    return min(float((np.array(ob.matrix_world)[2] @ co.T).min()) for ob, co in meshes)


def main():
    path = sys.argv[sys.argv.index('--') + 1]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    obs = bpy.data.objects
    sides = [s for s in ('r', 'l') if f'grip_{s}' in obs and f'hold_{s}' in obs]
    if not sides:
        raise SystemExit(f'{path}: no grip_<side>/hold_<side> markers to measure')
    scn = bpy.context.scene
    props = {s: points(obs[f'hold_{s}'].parent) for s in sides}
    still = {ob: ob.matrix_basis.copy() for ob in obs}
    worst, floor = 0.0, 0.0
    print(f'{"clip":10s} ' + ' '.join(f'{"grip_" + s:>9s} {"fist_" + s:>9s} {"low_" + s:>8s}' for s in sides))
    for name, binds, span in clips():
        frames = play(binds, span, still)
        scn.frame_set(frames.start)
        fists = {s: obs.get(f'hand_{s}_mesh') for s in sides}
        rest = {s: fist and (centre(fist) - obs[f'hold_{s}'].matrix_world.translation).length for s, fist in fists.items()}
        drift = {s: [0.0, 0.0, float('inf')] for s in sides}
        for f in frames:
            scn.frame_set(f)
            for s in sides:
                hold = obs[f'hold_{s}'].matrix_world.translation
                d = drift[s]
                d[0] = max(d[0], (obs[f'grip_{s}'].matrix_world.translation - hold).length)
                if fists[s]:
                    d[1] = max(d[1], abs((centre(fists[s]) - hold).length - rest[s]))
                d[2] = min(d[2], lowest(props[s]))
        worst = max([worst] + [v for d in drift.values() for v in d[:2]])
        floor = min([floor] + [d[2] for d in drift.values()])
        print(f'{name:10s} ' + ' '.join(f'{d[0]:9.5f} {d[1]:9.5f} {d[2]:8.4f}' for d in drift.values()) + f'   ({len(frames)} frames)')
    print(f'worst slip {worst:.5f} (limit {LIMIT}), lowest prop point {floor:.4f} (limit {FLOOR})')
    if worst > LIMIT or floor < FLOOR:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
