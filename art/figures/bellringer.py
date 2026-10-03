"""The Bellringer: a masked monk in an ochre coat carrying a great brass bell in a timber frame on its back."""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from common import *

reset()
rng = random.Random(7)

COAT = material('main', '#ad7a2c', rough=0.9)
TEAM = material('team', '#ffffff', rough=0.7)
BRASS = material('brass', '#f5cc52', rough=0.35, metal=0.1, emit='#6a4a08', strength=0.6)
OAK = material('oak', '#a87a44', rough=0.85)
HOOD = material('hood', '#8a5e36', rough=0.8)
WOOD = material('wood', '#4a2f1c', rough=0.9)
LEATHER = material('leather', '#5c3a20', rough=0.8)
MASK = material('mask', '#f0d6a8', rough=0.7)
DARK = material('dark', '#1c130c', rough=0.9)
EYE = material('eye', '#ffcf6a', emit='#ffb640', strength=3.0)


def mesh_obj(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return flat(assign(ob, mat))


def jitter(bm, amount, keep_bottom=None):
    for v in bm.verts:
        if keep_bottom is not None and v.co.z <= keep_bottom:
            continue
        v.co += Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))) * amount


def lathe(name, profile, mat, segs=12, sy=1.0, loc=(0, 0, 0), closed=True, rough=0.0, phase=0.0):
    """Revolves (radius, z) points about z. A radius of 0 makes a single pole vertex."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        if r == 0:
            rings.append([bm.verts.new((0, 0, z))])
            continue
        ring = []
        for i in range(segs):
            a = 2 * math.pi * i / segs + phase
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a) * sy, z)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(segs):
            j = (i + 1) % segs
            if len(a) == 1:
                bm.faces.new((a[0], b[i], b[j]))
            elif len(b) == 1:
                bm.faces.new((a[i], b[0], a[j]))
            else:
                bm.faces.new((a[i], b[i], b[j], a[j]))
    if closed:
        for ring in (rings[0], rings[-1]):
            if len(ring) > 2:
                bm.faces.new(ring)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if rough:
        jitter(bm, rough)
    ob = mesh_obj(name, bm, mat)
    ob.location = loc
    return ob


def block(name, size, loc, mat, rot=(0, 0, 0), bevel=0.012, rough=0.0, taper=0.0):
    """A bevelled box; `taper` shrinks the top face in x and y."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        s = 1 - taper if v.co.z > 0 else 1
        v.co = Vector((v.co.x * size[0] * s, v.co.y * size[1] * s, v.co.z * size[2]))
    if bevel:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=1, affect='EDGES')
    if rough:
        jitter(bm, rough)
    ob = mesh_obj(name, bm, mat)
    ob.location = loc
    ob.rotation_euler = rot
    return ob


def limb(name, a, b, r1, r2, mat, segs=7, sy=1.0):
    """A tapered tube from point `a` to point `b`."""
    a, b = Vector(a), Vector(b)
    ob = lathe(name, [(r1, 0), (r2, (b - a).length)], mat, segs=segs, sy=sy)
    ob.matrix_world = Matrix.Translation(a) @ (b - a).to_track_quat('Z', 'Y').to_matrix().to_4x4()
    return ob


def ring(name, r, thick, z, mat, segs=12, sy=1.0, loc=(0, 0, 0), height=None):
    """A flat band: a short open tube with a little thickness."""
    h = height or thick
    return lathe(name, [(r - thick * 0.5, z - h / 2), (r + thick * 0.5, z - h / 2), (r + thick * 0.5, z + h / 2), (r - thick * 0.5, z + h / 2), (r - thick * 0.5, z - h / 2)],
                 mat, segs=segs, sy=sy, loc=loc, closed=False)


def strip(name, pts, width, mat, thick=0.012, normal=(0, 1, 0)):
    """A cloth strip along `pts`, `width` wide, lying across `normal`."""
    bm = bmesh.new()
    n = Vector(normal)
    rows = []
    for i, p in enumerate(pts):
        d = (Vector(pts[min(i + 1, len(pts) - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
        side = d.cross(n).normalized() * width / 2
        rows.append((bm.verts.new(Vector(p) - side), bm.verts.new(Vector(p) + side)))
    for (a, b), (c, d) in zip(rows, rows[1:]):
        bm.faces.new((a, b, d, c))
    ob = mesh_obj(name, bm, mat)
    ob.modifiers.new('solid', 'SOLIDIFY').thickness = thick
    return ob


def wrap(name, target, center, tilt, width, mat, n=24, gap=0.014, thick=0.012):
    """A closed band hugging `target`: a ring in a plane through `center` tilted `tilt` about y, each point cast inward onto the surface."""
    dg = bpy.context.evaluated_depsgraph_get()
    tree = BVHTree.FromObject(target, dg)
    inv = target.matrix_world.inverted()
    up = Vector((math.sin(tilt), 0, math.cos(tilt)))
    c = Vector(center)
    bm = bmesh.new()
    rows = []
    for i in range(n):
        a = 2 * math.pi * i / n
        d = Vector((math.cos(a) * math.cos(tilt), math.sin(a), -math.cos(a) * math.sin(tilt)))
        hit, normal, _, _ = tree.ray_cast(inv @ (c + d * 1.0), -d)
        p = target.matrix_world @ hit + d * gap
        rows.append((bm.verts.new(p - up * width / 2), bm.verts.new(p + up * width / 2)))
    for (a, b), (c2, d2) in zip(rows, rows[1:] + rows[:1]):
        bm.faces.new((a, b, d2, c2))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = mesh_obj(name, bm, mat)
    ob.modifiers.new('solid', 'SOLIDIFY').thickness = thick
    return ob


def join(objs, name):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    return ob


BODY_Y = -0.05
FRAME_Y = 0.25

# Coat: a long flared robe, wide at the hem, gathered at the waist, square at the shoulders.
coat = lathe('coat', [(0, 0.05), (0.37, 0.06), (0.36, 0.2), (0.32, 0.42), (0.285, 0.56), (0.3, 0.7), (0.31, 0.82), (0.25, 0.9), (0.13, 0.95), (0, 0.96)],
             COAT, segs=14, sy=0.82, loc=(0, BODY_Y, 0), rough=0.008, phase=math.pi / 14)
collar = lathe('collar', [(0.12, 0.88), (0.19, 0.89), (0.20, 0.95), (0.15, 1.0), (0.11, 0.98)], COAT, segs=12, sy=0.9, loc=(0, BODY_Y, 0), closed=False)
mantle = lathe('mantle', [(0.15, 0.97), (0.26, 0.93), (0.35, 0.82), (0.37, 0.74), (0.33, 0.74)], COAT, segs=14, sy=0.8, loc=(0, BODY_Y, 0), closed=False, rough=0.006, phase=math.pi / 14)
placket = block('placket', (0.03, 0.02, 0.62), (0.02, BODY_Y - 0.275, 0.36), COAT, rot=(math.radians(-6), 0, 0), bevel=0.006)
sleeves = [limb('sleeve', (s * 0.24, BODY_Y, 0.85), (s * 0.33, BODY_Y - 0.12, 0.6), 0.085, 0.105, COAT, segs=8) for s in (-1, 1)]
body = join([coat, collar, mantle, placket, *sleeves], 'body')

# Team colour: cuffs, a shoulder-to-hip sash that crosses the back, and a knotted waist sash with long tails.
cuffs = [limb('cuff', (s * 0.325, BODY_Y - 0.115, 0.615), (s * 0.335, BODY_Y - 0.125, 0.58), 0.112, 0.116, TEAM, segs=8) for s in (-1, 1)]
waist = ring('waist', 0.29, 0.03, 0.56, TEAM, segs=14, sy=0.84, loc=(0, BODY_Y, 0), height=0.08)
sash = wrap('sash', body, (0, BODY_Y, 0.72), math.radians(38), 0.075, TEAM, n=32)
knot = block('knot', (0.09, 0.05, 0.08), (0.06, BODY_Y - 0.27, 0.56), TEAM, bevel=0.015, rough=0.004)
tails = [strip('tail', [(0.04 + dx, BODY_Y - 0.28, 0.53), (0.05 + dx * 1.3, BODY_Y - 0.31, 0.38), (0.06 + dx * 1.6, BODY_Y - 0.335, 0.22)], 0.06, TEAM, normal=(0, 1, 0))
         for dx in (-0.025, 0.035)]
join([*cuffs, waist, sash, knot, *tails], 'cloth')

# Leather: boots, gloves, the belt pouch and the shoulder straps that carry the frame.
boots = [block('boot', (0.11, 0.15, 0.08), (s * 0.12, BODY_Y - 0.17, 0.04), LEATHER, bevel=0.025) for s in (-1, 1)]
gloves = [lathe('glove', [(0, -0.05), (0.045, -0.045), (0.055, 0), (0.045, 0.04), (0, 0.05)], LEATHER, segs=7, loc=(s * 0.34, BODY_Y - 0.13, 0.54)) for s in (-1, 1)]
pouch = block('pouch', (0.1, 0.05, 0.08), (0.2, BODY_Y - 0.24, 0.5), LEATHER, rot=(0, 0, math.radians(-30)), bevel=0.012)
straps = [block('strap', (0.045, 0.34, 0.025), (s * 0.15, BODY_Y + 0.08, 0.9), LEATHER, rot=(math.radians(-10), 0, 0), bevel=0.006) for s in (-1, 1)]
join([*boots, *gloves, pouch, *straps], 'leather')

# Brass: buttons and the belt buckle.
buttons = [block('button', (0.028, 0.02, 0.028), (0.02, BODY_Y - 0.28 + 0.012 * i, 0.42 - 0.1 * i), BRASS, bevel=0.006) for i in range(3)]
buttons += [block('button', (0.028, 0.02, 0.028), (0.025, BODY_Y - 0.245, 0.74 + 0.07 * i), BRASS, bevel=0.006) for i in range(2)]
join(buttons, 'brass')

# Head: a round leather hood, the front of it a pale mask with a brow ridge and two dark eye slits lit from within.
bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=8, radius=1.0, location=(0, BODY_Y - 0.02, 1.17))
head = bpy.context.object
head.name = 'head'
head.scale = (0.215, 0.2, 0.235)
bpy.ops.object.transform_apply(scale=True)
head.data.materials.append(HOOD)
head.data.materials.append(MASK)
for p in head.data.polygons:
    p.material_index = 1 if p.normal.y < 0.05 and p.center.z > 1.0 else 0
    p.use_smooth = False
ridge = block('ridge', (0.03, 0.2, 0.05), (0, BODY_Y - 0.06, 1.39), MASK, rot=(math.radians(-25), 0, 0), bevel=0.01)
brow = block('brow', (0.3, 0.04, 0.035), (0, BODY_Y - 0.2, 1.22), MASK, rot=(math.radians(8), 0, 0), bevel=0.012)
sockets = [block('socket', (0.085, 0.04, 0.042), (s * 0.075, BODY_Y - 0.205, 1.175), DARK, rot=(0, math.radians(s * -12), 0), bevel=0.012) for s in (-1, 1)]
join([head, ridge, brow, *sockets], 'head')
eyes = [block('eye', (0.03, 0.02, 0.018), (s * 0.072, BODY_Y - 0.222, 1.175), EYE, bevel=0.005) for s in (-1, 1)]
join(eyes, 'eyes')
for s in (-1, 1):
    glow((s * 0.072, BODY_Y - 0.24, 1.175), '#ffc060', 0.07, name='glow_eye')

# The frame: two posts, a crossbar behind the shoulders and a heavy top beam whose ends kick up.
posts = [block('post', (0.09, 0.09, 1.86), (s * 0.38, FRAME_Y, 0.95), WOOD, bevel=0.01, rough=0.006, taper=0.08) for s in (-1, 1)]
bar = block('bar', (0.86, 0.06, 0.07), (0, FRAME_Y, 0.98), WOOD, bevel=0.01, rough=0.005)
beam = block('beam', (1.0, 0.11, 0.09), (0, FRAME_Y, 1.9), WOOD, bevel=0.015, rough=0.006)
for v in beam.data.vertices:
    if abs(v.co.x) > 0.4:
        v.co.z += (abs(v.co.x) - 0.4) * 0.35
caps = [block('cap', (0.12, 0.13, 0.05), (s * 0.38, FRAME_Y, 1.84), WOOD, bevel=0.01) for s in (-1, 1)]
pegs = [block('peg', (0.04, 0.14, 0.04), (s * 0.38, FRAME_Y, 1.9), WOOD, bevel=0.008) for s in (-1, 1)]
hanger = block('hanger', (0.08, 0.08, 0.05), (0, FRAME_Y, 1.83), DARK, bevel=0.01)
join([*posts, bar, beam, *caps, *pegs, hanger], 'frame')

# The great bell, hung from the beam on a pivot so it can swing.
pivot = empty('bell_pivot', (0, FRAME_Y, 1.82))
bell = lathe('bell', [(0, 1.77), (0.13, 1.765), (0.2, 1.73), (0.22, 1.64), (0.225, 1.53), (0.245, 1.44), (0.29, 1.37), (0.325, 1.335), (0.32, 1.315),
                      (0.28, 1.325), (0.23, 1.38), (0.2, 1.5), (0.19, 1.62), (0.12, 1.71), (0, 1.72)],
             BRASS, segs=16, loc=(0, FRAME_Y, 0), closed=False, rough=0.003)
lip = ring('lip', 0.262, 0.016, 1.41, TEAM, segs=16, loc=(0, FRAME_Y, 0), height=0.045)
crown = lathe('crown', [(0.05, 1.765), (0.05, 1.795), (0, 1.805)], BRASS, segs=8, loc=(0, FRAME_Y, 0))
bpy.ops.mesh.primitive_torus_add(major_radius=0.04, minor_radius=0.012, major_segments=10, minor_segments=5, location=(0, FRAME_Y, 1.81), rotation=(math.pi / 2, 0, math.pi / 2))
loop_ring = assign(flat(bpy.context.object), BRASS)
clapper = lathe('clapper', [(0, 1.33), (0.04, 1.35), (0.045, 1.39), (0.012, 1.43), (0.012, 1.7), (0, 1.7)], DARK, segs=6, loc=(0, FRAME_Y, 0))
bell = join([bell, crown, loop_ring, clapper], 'bell')
for o in (bell, lip):
    parent(o, pivot)
loop(pivot, 'rotation_euler', 0, [math.radians(a) for a in (0, 5, 0, -5)], 72)
loop(pivot, 'rotation_euler', 1, [math.radians(a) for a in (0, 1.5, 0, -1.5)], 72)

# Team ribbons hanging from both ends of the beam, swaying out of step.
for s, phase in ((-1, 0), (1, 2)):
    top = empty('ribbon_pivot', (s * 0.465, FRAME_Y, 1.9))
    rib = strip('ribbon', [(s * 0.465, FRAME_Y - 0.06, 1.9), (s * 0.475, FRAME_Y - 0.065, 1.72), (s * 0.48, FRAME_Y - 0.06, 1.56), (s * 0.475, FRAME_Y - 0.055, 1.45)],
                0.055, TEAM, normal=(0, 1, 0), thick=0.014)
    tassel = lathe('tassel', [(0, 1.38), (0.03, 1.41), (0.015, 1.46), (0, 1.47)], TEAM, segs=6, loc=(s * 0.475, FRAME_Y - 0.055, 0))
    knot_t = block('rknot', (0.07, 0.04, 0.05), (s * 0.465, FRAME_Y - 0.06, 1.88), TEAM, bevel=0.01)
    r = join([rib, tassel, knot_t], 'ribbon')
    parent(r, top)
    sway = [math.radians(a) for a in (0, 7, 0, -7)]
    loop(top, 'rotation_euler', 0, sway[phase:] + sway[:phase], 72)
    loop(top, 'rotation_euler', 1, [math.radians(a) * s for a in (0, 3, 0, -3)], 72)

# A hand bell in the right hand, and a smaller one on the belt, each swinging.
def handbell(name, loc, scale):
    hb = empty(name, loc)
    x, y, z = loc
    body = lathe(name + '_cup', [(0, -0.02), (0.035, -0.025), (0.045, -0.07), (0.07, -0.12), (0.075, -0.13), (0.06, -0.125), (0.035, -0.08), (0, -0.07)],
                 BRASS, segs=10, loc=(x, y, z), closed=False)
    handle = limb(name + '_handle', (x, y, z - 0.025), (x, y, z + 0.05), 0.012, 0.01, LEATHER, segs=5)
    b = join([body, handle], name + '_mesh')
    b.scale = (scale,) * 3
    b.location = loc
    bpy.ops.object.transform_apply(scale=True)
    parent(b, hb)
    return hb


hand = handbell('handbell', (-0.34, BODY_Y - 0.14, 0.5), 1.25)
loop(hand, 'rotation_euler', 1, [math.radians(a) for a in (0, 12, 0, -12)], 48)
belt = handbell('beltbell', (0.13, BODY_Y - 0.29, 0.5), 0.9)
loop(belt, 'rotation_euler', 1, [math.radians(a) for a in (0, -8, 0, 8)], 48)

# The mallet, held upright in the left hand; its origin is the grip.
GRIP = (0.345, BODY_Y - 0.14, 0.54)
weapon = empty('weapon', GRIP)
gx, gy, gz = GRIP
shaft = limb('shaft', (gx, gy, gz - 0.14), (gx + 0.04, gy + 0.02, gz + 0.62), 0.022, 0.019, WOOD, segs=6)
head_ = lathe('mallet_head', [(0, -0.13), (0.07, -0.13), (0.085, -0.115), (0.085, 0.115), (0.07, 0.13), (0, 0.13)], OAK, segs=8, rough=0.004)
head_.rotation_euler = (0, math.pi / 2, 0)
head_.location = (gx + 0.06, gy + 0.025, gz + 0.68)
bands = [ring('band', 0.087, 0.01, z, TEAM, segs=8, height=0.035) for z in (-0.07,)]
for b in bands:
    b.rotation_euler = head_.rotation_euler
    b.location = head_.location
caps_m = [ring('mcap', 0.087, 0.008, z, BRASS, segs=8, height=0.02) for z in (0.105, -0.105)]
for b in caps_m:
    b.rotation_euler = head_.rotation_euler
    b.location = head_.location
mallet = join([shaft, head_, *caps_m], 'mallet')
for o in (mallet, *bands):
    parent(o, weapon)

finish()

tris = sum(sum(len(p.vertices) - 2 for p in o.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh().polygons) for o in bpy.data.objects if o.type == 'MESH')
print(f'STATS objects={len(bpy.data.objects)} meshes={sum(o.type == "MESH" for o in bpy.data.objects)} tris={tris}')
