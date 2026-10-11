"""Measures how far each hand slips off what it holds, in a built figure's glb, over every frame of every clip.

A figure marks each closed fist with an empty `grip_<side>` that rides the hand and the point the fist closes on with
an empty `hold_<side>` that rides the held prop. Per clip and hand this prints the largest distance between the two,
and, when the fist is its own mesh `hand_<side>_mesh`, how much the distance from the fist's centre to that point
changes (a prop may turn in the fist, as a bell swings on its bail, but must not pull away from it).
Exits non-zero if any exceeds 0.01 (1 cm).

usage: blender --background --factory-startup --python art/grips.py -- public/models/<class>.glb
"""
import sys

import bpy

LIMIT = 0.01


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


def play(binds, span):
    for ob in bpy.data.objects:
        ad = ob.animation_data or ob.animation_data_create()
        ad.action = None
    for ob, (a, slot) in binds.items():
        ob.animation_data.action, ob.animation_data.action_slot = a, slot
    starts, ends = zip(*(a.frame_range for a, _ in span.values()))
    return range(int(min(starts)), int(max(ends)) + 1)


def centre(ob):
    me = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    c = sum((v.co for v in me.vertices), me.vertices[0].co * 0) / len(me.vertices)
    return ob.matrix_world @ c


def main():
    path = sys.argv[sys.argv.index('--') + 1]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    obs = bpy.data.objects
    sides = [s for s in ('r', 'l') if f'grip_{s}' in obs and f'hold_{s}' in obs]
    if not sides:
        raise SystemExit(f'{path}: no grip_<side>/hold_<side> markers to measure')
    scn = bpy.context.scene
    worst = 0.0
    print(f'{"clip":10s} ' + ' '.join(f'{"grip_" + s:>9s} {"fist_" + s:>9s}' for s in sides))
    for name, binds, span in clips():
        frames = play(binds, span)
        scn.frame_set(frames.start)
        fists = {s: obs.get(f'hand_{s}_mesh') for s in sides}
        rest = {s: fist and (centre(fist) - obs[f'hold_{s}'].matrix_world.translation).length for s, fist in fists.items()}
        drift = {s: [0.0, 0.0] for s in sides}
        for f in frames:
            scn.frame_set(f)
            for s in sides:
                hold = obs[f'hold_{s}'].matrix_world.translation
                d = drift[s]
                d[0] = max(d[0], (obs[f'grip_{s}'].matrix_world.translation - hold).length)
                if fists[s]:
                    d[1] = max(d[1], abs((centre(fists[s]) - hold).length - rest[s]))
        worst = max([worst] + [v for d in drift.values() for v in d])
        print(f'{name:10s} ' + ' '.join(f'{d[0]:9.5f} {d[1]:9.5f}' for d in drift.values()) + f'   ({len(frames)} frames)')
    print(f'worst {worst:.5f} (limit {LIMIT})')
    if worst > LIMIT:
        raise SystemExit(1)


main()
