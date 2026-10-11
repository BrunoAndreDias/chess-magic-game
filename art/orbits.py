"""Measures how close a built figure's arms come to what orbits it, in its glb, over every frame of every clip.

An orbit is an empty with the custom prop `clear` that its idle clip spins about its own z (the Astromancer's flock of
shards). Whatever it carries sweeps a solid of revolution about that axis over the idle loop, whatever phase a clip
catches it in. The arms are the skin weighted mostly to arm bones and every mesh that rides an arm bone (fists,
forearms, held props). Per clip this prints, for each orbit, the smallest distance from the arms to its solid (to
2 mm, capped at 0.1), and exits non-zero if any is under 0.005 (5 mm): a shard passing through a sleeve or a sceptre.

The gate is proven by breaking it: drop the Astromancer's flare() so its shards keep their resting orbits while the
arms reach out, and the cast reports the flock at 0 and the run exits 1.

usage: blender --background --factory-startup --python art/orbits.py -- public/models/<class>.glb
"""
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from grips import clips, play

LIMIT = 0.005
SPINE = ('hips', 'chest')


def world(ob):
    me = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    m = np.array(ob.matrix_world)
    return co.reshape(-1, 3) @ m[:3, :3].T + m[:3, 3]


def bone(ob, rig):
    """The rig bone `ob` rides, if any."""
    while ob.parent and not (ob.parent is rig and ob.parent_type == 'BONE'):
        ob = ob.parent
    return ob.parent_bone if ob.parent else None


def arms(rig):
    """The arm meshes as (mesh, which of its vertices to take): the skin mostly weighted to arm bones, and all of
    every mesh that rides an arm bone."""
    out = []
    for ob in bpy.data.objects:
        if ob.type != 'MESH':
            continue
        if any(m.type == 'ARMATURE' for m in ob.modifiers):
            arm = {g.index for g in ob.vertex_groups if g.name not in SPINE}
            share = np.array([sum(g.weight for g in v.groups if g.group in arm) for v in ob.data.vertices])
            out.append((ob, share > 0.5))
        elif bone(ob, rig) not in (None, *SPINE):
            out.append((ob, slice(None)))
    return out


CELL, REACH = 0.002, 0.1


class Solid:
    """What an orbit `ob` carries, swept about its own z over `frames`, as the distance from it on a grid in the plane
    of (distance from that axis, height along it), out to REACH. Distances are in the orbit's own space, so one a clip
    widens (see the Astromancer's flare()) reads a little tighter than it stands."""

    def __init__(self, ob, frames):
        self.ob = ob
        pts = []
        for f in frames:
            bpy.context.scene.frame_set(f)
            pts += [self.plane(world(m)) for m in ob.children_recursive if m.type == 'MESH']
        pts = np.concatenate(pts)
        self.lo = pts.min(axis=0) - REACH
        cells = np.floor((pts - self.lo) / CELL).astype(int)
        d = np.full(cells.max(axis=0) + int(REACH / CELL) + 2, REACH)
        d[tuple(cells.T)] = 0.0
        steps = [(dx, dy, CELL * np.hypot(dx, dy)) for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy]
        for _ in range(int(REACH / CELL)):
            pad = np.pad(d, 1, constant_values=REACH)
            d = np.minimum.reduce([d] + [pad[1 + dx:pad.shape[0] - 1 + dx, 1 + dy:pad.shape[1] - 1 + dy] + c
                                        for dx, dy, c in steps])
        self.d = d

    def plane(self, pts):
        inv = np.array(self.ob.matrix_world.inverted())
        p = pts @ inv[:3, :3].T + inv[:3, 3]
        return np.c_[np.hypot(p[:, 0], p[:, 1]), p[:, 2]]

    def gap(self, pts):
        """The smallest distance from `pts` to the solid where it stands now, to within a cell."""
        cells = np.floor((self.plane(pts) - self.lo) / CELL).astype(int)
        inside = ((cells >= 0) & (cells < self.d.shape)).all(axis=1)
        return float(self.d[tuple(cells[inside].T)].min(initial=REACH))


def main():
    path = sys.argv[sys.argv.index('--') + 1]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    obs = bpy.data.objects
    rig = next(o for o in obs if o.type == 'ARMATURE')
    still = {ob: ob.matrix_basis.copy() for ob in obs}
    every = clips()
    _, idle, span = every[0]
    frames = play(idle, span, still)
    orbits = [ob for ob in obs if ob.get('clear')]
    if not orbits:
        raise SystemExit(f'{path}: no orbit marked `clear` to measure')
    solids = [Solid(ob, frames[::2]) for ob in orbits]
    movers = arms(rig)
    worst = REACH
    print(f'{"clip":10s} ' + ' '.join(f'{ob.name:>12s}' for ob in orbits))
    for name, binds, span in every:
        low = [REACH] * len(solids)
        for f in play(binds, span, still):
            bpy.context.scene.frame_set(f)
            pts = np.concatenate([world(ob)[take] for ob, take in movers])
            low = [min(v, sw.gap(pts)) for v, sw in zip(low, solids)]
        worst = min([worst, *low])
        print(f'{name:10s} ' + ' '.join(f'{v:12.4f}' for v in low))
    print(f'closest {worst:.4f} (limit {LIMIT})')
    if worst < LIMIT:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
