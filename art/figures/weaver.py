"""The Weaver: a small hooded rider on a great faceted spider, silk sparking between its hands."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bmesh
import bpy
from mathutils import Matrix, Vector
from common import *
from hands import hand

reset()

GOLD = material('gold', '#e8b65a', rough=0.35, metal=0.8)
TEAM = material('team', '#ffffff', rough=0.8)
ROBE = material('robe', '#33204a', rough=0.85)
DARK = material('dark', '#120a18', rough=0.9)
CLAW = material('claw', '#1c1224', rough=0.5)
RUNE = material('rune', '#ff6ae0', emit='#ff5ad8', strength=4.0)
HAND = material('hand', '#c9a7d8', rough=0.7)


def mesh_obj(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return assign(flat(ob), mat)


def tube(bm, pts, radii, sides=5, twist=0.0):
    """A faceted tube through `pts`, radius per point, capped; the polygon keeps a stable roll so facets line up."""
    rings = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
        a = d.cross(up).normalized()
        b = d.cross(a).normalized()
        ring = []
        for k in range(sides):
            t = 2 * math.pi * k / sides + twist
            ring.append(bm.verts.new(p + (a * math.cos(t) + b * math.sin(t)) * radii[i]))
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(sides):
            bm.faces.new((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])


def pivot(ob, p):
    """Moves `ob`'s origin to `p` without moving its mesh, so it rotates and scales about `p`."""
    p = Vector(p)
    ob.data.transform(Matrix.Translation(-p))
    ob.location = p
    return ob


def ellipsoid(name, center, radii, mat, subdiv=2):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2])) + Vector(center)
    return mesh_obj(name, bm, mat)


# The spider. `main` covers the shell and legs; vertex colours split it into dark plum shell and pink legs.
SHELL_C, LEG_C, PLATE_C = '#3b1e52', '#f47cb6', '#b8487f'
MAIN = material('main', '#ffffff', rough=0.5)
nodes, links = MAIN.node_tree.nodes, MAIN.node_tree.links
tint = nodes.new('ShaderNodeVertexColor')
tint.layer_name = 'tint'
links.new(tint.outputs['Color'], nodes['Principled BSDF'].inputs['Base Color'])


def paint(bm, color, verts=None):
    """Writes `color` into the `tint` loop colour layer for every face whose verts are all in `verts` (default all)."""
    layer = bm.loops.layers.color.get('tint') or bm.loops.layers.color.new('tint')
    h = color.lstrip('#')
    rgba = (*(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)), 1.0)  # byte colour layers store sRGB
    for f in bm.faces:
        if verts is None or all(v in verts for v in f.verts):
            for loop_ in f.loops:
                loop_[layer] = rgba


def blob(bm, center, radii, subdiv=2):
    before = set(bm.verts)
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    made = [v for v in bm.verts if v not in before]
    for v in made:
        v.co = Vector((v.co.x * radii[0], v.co.y * radii[1], v.co.z * radii[2])) + Vector(center)
    return set(made)


def tube_verts(bm, *args, **kw):
    before = set(bm.verts)
    tube(bm, *args, **kw)
    return {v for v in bm.verts if v not in before}


rig = empty('spider')
ABD_C, ABD_R = Vector((0, 0.2, 0.44)), Vector((0.4, 0.42, 0.36))
CEPH_C = Vector((0, -0.2, 0.36))

# The abdomen: a huge faceted bulb behind and under the rider, tapering to spinnerets at the back.
bm = bmesh.new()
abd = blob(bm, ABD_C, ABD_R)
for v in abd:
    d = v.co - ABD_C
    if d.y > 0.25 and d.z < 0.05:
        v.co.y += 0.06 * (d.y / ABD_R.y)
paint(bm, SHELL_C)
abdomen = parent(pivot(mesh_obj('abdomen', bm, MAIN), ABD_C), rig)
loop(abdomen, 'scale', 0, [1.0, 1.03], 36)
loop(abdomen, 'scale', 2, [1.0, 1.03], 36)


def on_abd(az, el, lift=1.02):
    """A point on the abdomen's surface; az 0 faces -Y, az 180 the back, el 0 the equator."""
    d = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    return ABD_C + Vector((d.x * ABD_R.x, d.y * ABD_R.y, d.z * ABD_R.z)) * lift


# Veins: a forked crack glyph across the back and crown, and cracks down the flanks that show from the front.
r = math.radians
bm = bmesh.new()
tube(bm, [on_abd(r(180), r(e)) for e in (-30, -5, 20, 45, 68)], [0.01, 0.026, 0.032, 0.026, 0.012], 4)
for side in (-1, 1):
    tube(bm, [on_abd(r(180), r(10)), on_abd(r(180 + side * 28), r(28)), on_abd(r(180 + side * 52), r(52))], [0.024, 0.018, 0.006], 4)
    tube(bm, [on_abd(r(180), r(-12)), on_abd(r(180 + side * 30), r(-8)), on_abd(r(180 + side * 58), r(8))], [0.022, 0.016, 0.006], 4)
    tube(bm, [on_abd(r(180), r(40)), on_abd(r(180 + side * 18), r(58)), on_abd(r(180 + side * 40), r(72))], [0.018, 0.012, 0.004], 4)
    tube(bm, [on_abd(r(side * 62), r(40)), on_abd(r(side * 70), r(15)), on_abd(r(side * 58), r(-10)), on_abd(r(side * 66), r(-32))], [0.006, 0.02, 0.016, 0.004], 4)
    tube(bm, [on_abd(r(side * 70), r(15)), on_abd(r(side * 90), r(22)), on_abd(r(side * 110), r(8))], [0.016, 0.012, 0.004], 4)
    tube(bm, [on_abd(r(side * 58), r(-10)), on_abd(r(side * 42), r(-22))], [0.014, 0.004], 4)
    tube(bm, [on_abd(r(side * 30), r(62)), on_abd(r(side * 42), r(44)), on_abd(r(side * 36), r(26)), on_abd(r(side * 46), r(8))], [0.006, 0.018, 0.014, 0.004], 4)
    tube(bm, [on_abd(r(side * 42), r(44)), on_abd(r(side * 60), r(52))], [0.012, 0.004], 4)
parent(mesh_obj('veins', bm, RUNE), abdomen)
for name, at in (('glowBack', on_abd(r(180), r(20), 1.12)), ('glowFlankL', on_abd(r(-66), r(5), 1.1)), ('glowFlankR', on_abd(r(66), r(5), 1.1))):
    halo = parent(glow(at, '#ff5ad8', 0.34, name=name), abdomen)
    for axis in range(3):
        loop(halo, 'scale', axis, [1.0, 1.4], 36)

# The cephalothorax under the rider, with four pink eyes and dark fangs at the front.
bm = bmesh.new()
paint(bm, SHELL_C, blob(bm, CEPH_C, (0.21, 0.2, 0.16)))
parent(mesh_obj('cephalothorax', bm, MAIN), rig)
bm = bmesh.new()
for x, z, s in ((-0.05, 0.42, 0.024), (0.05, 0.42, 0.024), (-0.1, 0.39, 0.016), (0.1, 0.39, 0.016)):
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=s, matrix=Matrix.Translation((x, -0.385, z)))
for side in (-1, 1):
    tube(bm, [Vector((0, -0.3, 0.52)), Vector((side * 0.06, -0.36, 0.47)), Vector((side * 0.13, -0.35, 0.44))], [0.014, 0.012, 0.004], 4)
tube(bm, [Vector((0, -0.24, 0.53)), Vector((0, -0.31, 0.515))], [0.012, 0.014], 4)
parent(mesh_obj('spiderEyes', bm, RUNE), rig)
bm = bmesh.new()
for side in (-1, 1):
    tube(bm, [Vector((side * 0.05, -0.36, 0.3)), Vector((side * 0.05, -0.42, 0.22)), Vector((side * 0.02, -0.4, 0.15))], [0.026, 0.017, 0.003], 4)
parent(mesh_obj('fangs', bm, CLAW), rig)

# Eight legs: up and out to a sharp knee above the abdomen, then down and far out to the ground.
# Each leg is faceted with darker plates at the hip, knee and shin.
FEET = ((0.5, -0.58), (0.76, -0.24), (0.78, 0.2), (0.6, 0.66))
KNEE_Z = (0.9, 1.0, 1.0, 0.92)
bm, claws = bmesh.new(), bmesh.new()
for side in (-1, 1):
    for i, ((fx, fy), kz) in enumerate(zip(FEET, KNEE_Z)):
        root = Vector((side * 0.17, -0.3 + 0.1 * i, 0.38))
        foot = Vector((side * fx, fy, 0.06))
        out = Vector((foot.x - root.x, foot.y - root.y, 0)).normalized()
        knee = root.lerp(foot, 0.42)
        knee.z = kz
        paint(bm, LEG_C, tube_verts(bm, [root, root.lerp(knee, 0.5) + Vector((0, 0, 0.04)), knee], [0.066, 0.062, 0.042], 4, math.pi / 4))
        paint(bm, LEG_C, tube_verts(bm, [knee, knee.lerp(foot, 0.35) + out * 0.04, foot], [0.05, 0.04, 0.018], 4, math.pi / 4))
        for at, rad in ((root.lerp(knee, 0.3), 0.084), (knee - (knee - foot).normalized() * 0.01, 0.062), (knee.lerp(foot, 0.4) + out * 0.03, 0.054)):
            d = (knee - root).normalized() if rad == 0.084 else (foot - knee).normalized()
            paint(bm, PLATE_C, tube_verts(bm, [at - d * 0.035, at + d * 0.035], [rad, rad * 0.85], 4, math.pi / 4))
        tube(claws, [knee + Vector((0, 0, -0.01)), knee + out * 0.04 + Vector((0, 0, 0.08))], [0.04, 0.002], 4)
        tube(claws, [foot + Vector((0, 0, 0.05)) - out * 0.01, foot + out * 0.02 - Vector((0, 0, 0.06))], [0.022, 0.002], 4)
parent(mesh_obj('legs', bm, MAIN), rig)
parent(mesh_obj('claws', claws, CLAW), rig)

# The rider sits on top of the shell. `rider` sits at the origin so its bob keys are plain offsets.
RC = Vector((0, -0.12, 0.6))
rider = parent(empty('rider'), rig)
parent(ellipsoid('torso', RC + Vector((0, 0, 0.1)), (0.1, 0.085, 0.13), ROBE, 1), rider)
parent(ellipsoid('face', RC + Vector((0, -0.01, 0.34)), (0.115, 0.105, 0.11), DARK, 2), rider)

# Hood: a pointed cowl, open at the front around the dark face, its tip bending back.
bm = bmesh.new()
n, rings = 12, []
profile = [(0.21, 0.175, 0.0), (0.31, 0.195, 0.0), (0.41, 0.185, 0.01), (0.49, 0.145, 0.035), (0.55, 0.095, 0.07), (0.6, 0.05, 0.12)]
for z, rad, back in profile:
    rings.append([bm.verts.new(RC + Vector((math.cos(t) * rad, math.sin(t) * rad + back, z)))
                  for t in (2 * math.pi * k / n - math.pi / 2 for k in range(n))])
tipv = bm.verts.new(RC + Vector((0, 0.24, 0.67)))
opening = {n - 2, n - 1, 0, 1}
for band, (r0, r1) in enumerate(zip(rings, rings[1:])):
    for k in range(n):
        if band < 2 and k in opening:
            continue
        bm.faces.new((r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k]))
for k in range(n):
    bm.faces.new((rings[-1][k], rings[-1][(k + 1) % n], tipv))
# The cowl's rim juts forward past the face, like the panel's deep hood.
for v in rings[1] + rings[2]:
    if v.co.y < RC.y - 0.08:
        v.co.y -= 0.035
bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.02)
hood = parent(pivot(mesh_obj('hood', bm, TEAM), RC + Vector((0, 0, 0.4))), rider)
loop(hood, 'rotation_euler', 1, [0.0, 0.05, 0.0, -0.05], 64)

# Capelet: a wide, ragged mantle over the shoulders, longer behind so the team reads from the back.
bm = bmesh.new()
n, top, bot = 14, [], []
for k in range(n):
    t = 2 * math.pi * k / n - math.pi / 2
    back = max(0.0, math.sin(t))
    point = k % 2 == 0
    top.append(bm.verts.new(RC + Vector((math.cos(t) * 0.15, math.sin(t) * 0.14, 0.27))))
    rad = (0.34 if point else 0.24) + 0.02 * back
    drop = (0.16 if point else 0.07) + 0.06 * back
    bot.append(bm.verts.new(RC + Vector((math.cos(t) * rad, math.sin(t) * rad, 0.27 - drop))))
for k in range(n):
    bm.faces.new((top[k], top[(k + 1) % n], bot[(k + 1) % n], bot[k]))
bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.018)
cape = parent(pivot(mesh_obj('cape', bm, TEAM), RC + Vector((0, 0, 0.27))), rider)
bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.03, matrix=Matrix.Translation(RC + Vector((0, -0.165, 0.25))))
parent(mesh_obj('brooch', bm, GOLD), cape)
loop(cape, 'rotation_euler', 0, [0.0, 0.05, 0.0, -0.03], 48)

# Eyes: two pink slits in the dark face.
bm = bmesh.new()
for side in (-1, 1):
    tube(bm, [RC + Vector((side * 0.065, -0.1, 0.36)), RC + Vector((side * 0.025, -0.115, 0.34))], [0.02, 0.014], 4)
parent(mesh_obj('eyes', bm, RUNE), rider)
parent(glow(RC + Vector((0, -0.16, 0.35)), '#ff8ae6', 0.3, name='glowEyes'), rider)

# Weapon: the casting hands, silk crackling between them. Its origin is the grip, in front of the chest.
GRIP = RC + Vector((0, -0.2, 0.12))
weapon = parent(empty('weapon', GRIP), rider)
bm = bmesh.new()
for side in (-1, 1):
    tube(bm, [RC + Vector((side * 0.09, -0.01, 0.2)), RC + Vector((side * 0.17, -0.1, 0.13)), GRIP + Vector((side * 0.14, 0.02, 0))], [0.035, 0.032, 0.026], 5)
parent(mesh_obj('sleeves', bm, ROBE), weapon)
# Open hands out of the sleeves, palms turned to each other across the silk.
before = set(bpy.data.objects)
for side in (-1, 1):
    elbow, wrist = RC + Vector((side * 0.17, -0.1, 0.13)), GRIP + Vector((side * 0.14, 0.02, 0))
    hand(wrist, wrist - elbow, Vector((-side, 0, 0)), HAND, right=side < 0, curl=0.4, size=0.008, sides=4, smooth=False)
for ob in [o for o in bpy.data.objects if o not in before]:
    parent(ob, weapon)
silk = parent(empty('silk', GRIP), weapon)
bm = bmesh.new()
for strand, (dz, dy) in enumerate(((0.0, 0.0), (0.03, -0.015), (-0.025, 0.01))):
    pts = [Vector((-0.14 + 0.28 * j / 6, dy + (0.012 if j % 2 else -0.012), dz + (0.022 if (j + strand) % 2 else -0.022))) for j in range(7)]
    tube(bm, [GRIP + p for p in pts], [0.007] * len(pts), 3)
for side in (-1, 1):
    tube(bm, [GRIP + Vector((side * 0.15, 0, 0)), GRIP + Vector((side * 0.22, -0.05, 0.06)), GRIP + Vector((side * 0.3, -0.03, 0.02)), GRIP + Vector((side * 0.37, -0.07, 0.07))], [0.008, 0.007, 0.005, 0.002], 3)
    tube(bm, [GRIP + Vector((side * 0.15, 0, 0)), GRIP + Vector((side * 0.23, -0.02, -0.04)), GRIP + Vector((side * 0.31, -0.06, -0.02))], [0.007, 0.005, 0.002], 3)
parent(mesh_obj('threads', bm, RUNE), silk)
parent(glow(GRIP + Vector((0, -0.02, 0)), '#ff5ad8', 0.5, name='glowSilk'), silk)
loop(silk, 'rotation_euler', 0, [0.0, 0.4, -0.3], 18)

loop(rider, 'location', 2, [0.0, 0.018], 48)

finish()
