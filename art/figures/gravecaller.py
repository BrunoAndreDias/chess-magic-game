"""The Gravecaller: a hooded bone priest in a long green robe, team scarf at the throat, scythe in the right hand,
a soul lantern in the left, and two ghost skulls circling it."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bmesh
import bpy
from mathutils import Matrix, Vector
from common import *

reset()

MAIN = material('main', '#2f6e52', rough=0.85)
TEAM = material('team', '#ffffff', rough=0.9)
DARK = material('robe_dark', '#13241c', rough=0.9)
VOID = material('void', '#030605', rough=1.0)
LEATHER = material('leather', '#5b3a22', rough=0.8)
GOLD = material('gold', '#d0a64c', rough=0.35, metal=0.9)
WOOD = material('wood', '#7a4f2c', rough=0.8)
STEEL = material('steel', '#dfe9e4', rough=0.35, metal=0.15)
BONE = material('bone', '#e6dcc4', rough=0.7)
SOUL = material('soul', '#6dffc8', rough=0.5, emit='#5dffc0', strength=3.0)
EYES = material('eyes', '#d8fff2', rough=0.5, emit='#a8ffe6', strength=6.0)

GREEN_GLOW = '#5dffc0'
RIGHT_HAND = Vector((-0.34, -0.15, 0.66))
LEFT_HAND = Vector((0.33, -0.13, 0.62))


def build(name, verts, faces, mat, faceted=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    assign(ob, mat)
    return flat(ob) if faceted else smooth(ob)



def solidify(ob, thickness, offset=-1.0):
    mod = ob.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = thickness
    mod.offset = offset
    mod.use_even_offset = True
    return ob


def lathe(name, rings, sides, mat, sy=1.0, phase=0.0, close_top=False, close_bottom=False, shape=None):
    """Rings of (radius, z) swept about z. `shape(i, j, x, y, z)` may move each vertex (ring i, side j)."""
    verts, faces = [], []
    for i, (r, z) in enumerate(rings):
        for j in range(sides):
            a = phase + 2 * math.pi * j / sides
            x, y = r * math.sin(a), -r * math.cos(a) * sy
            verts.append(Vector(shape(i, j, x, y, z) if shape else (x, y, z)))
    for i in range(len(rings) - 1):
        for j in range(sides):
            k = (j + 1) % sides
            faces.append((i * sides + j, i * sides + k, (i + 1) * sides + k, (i + 1) * sides + j))
    if close_bottom:
        faces.append(tuple(reversed(range(sides))))
    if close_top:
        n = len(rings) - 1
        faces.append(tuple(n * sides + j for j in range(sides)))
    return build(name, verts, faces, mat)


def drop_faces(ob, keep):
    """Deletes the faces whose centre fails `keep(centre)`: cuts openings into a lathed shell."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep(f.calc_center_median())], context='FACES')
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def limb(name, a, b, r1, r2, mat, sides=6):
    """A tapered tube from point a (radius r1) to point b (radius r2)."""
    a, b = Vector(a), Vector(b)
    bpy.ops.mesh.primitive_cone_add(vertices=sides, radius1=r1, radius2=r2, depth=(b - a).length, location=(a + b) / 2)
    ob = bpy.context.object
    ob.name = name
    ob.rotation_euler = (b - a).to_track_quat('Z', 'Y').to_euler()
    return assign(flat(ob), mat)


def ico(name, loc, radius, mat, scale=(1, 1, 1), subdiv=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=radius, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = scale
    return assign(flat(ob), mat)


def box(name, loc, size, mat, rot=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    if bevel:
        mod = ob.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = 1
    return assign(flat(ob), mat)


def ribbon(name, path, widths, side, mat, thickness=0.025):
    """A cloth strip along `path`, each point widened by its width along `side`, given thickness."""
    side = Vector(side).normalized()
    verts, faces = [], []
    for p, w in zip(path, widths):
        p = Vector(p)
        verts += [p - side * w / 2, p + side * w / 2]
    for i in range(len(path) - 1):
        faces.append((2 * i, 2 * i + 1, 2 * i + 3, 2 * i + 2))
    return solidify(build(name, verts, faces, mat), thickness, 0)


def bezier(p0, p1, p2, p3, n):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append(Vector(p0) * u ** 3 + Vector(p1) * 3 * u * u * t + Vector(p2) * 3 * u * t * t + Vector(p3) * t ** 3)
    return pts


# Robe: a long flared cone with a ragged hem and a slit up the front showing the dark under-robe.
ROBE = [(0.43, 0.02), (0.385, 0.2), (0.32, 0.45), (0.265, 0.7), (0.235, 0.88), (0.21, 1.02)]


def hem(i, j, x, y, z):
    if i == 0:
        drop = (0.0, 0.07, 0.025, 0.06, 0.0, 0.05)[j % 6]
        return (x * (1 + drop * 0.6), y * (1 + drop * 0.6), z + drop)
    return (x, y, z)


robe = lathe('robe', ROBE, 14, MAIN, sy=0.86, phase=math.pi / 14, shape=hem)
drop_faces(robe, lambda c: not (c.y < -0.2 and abs(c.x) < 0.07 and c.z < 0.5))
solidify(robe, 0.025)
lathe('underrobe', [(0.3, 0.06), (0.25, 0.45), (0.2, 0.75)], 8, DARK, sy=0.86, close_bottom=True)
for sx in (-0.09, 0.09):
    box('boot', (sx, -0.2, 0.05), (0.1, 0.17, 0.09), DARK, bevel=0.02)

# Capelet over the shoulders, its lower edge cut into points like the sheet's tattered mantle.
def tatter(i, j, x, y, z):
    if i == 0:
        return (x * 1.06, y * 1.06, z - (0.07 if j % 2 else 0.0))
    return (x, y, z)


cape = lathe('capelet', [(0.37, 0.76), (0.34, 0.9), (0.27, 1.02), (0.2, 1.08)], 12, MAIN, sy=0.88, shape=tatter)
solidify(cape, 0.022)

# Hood: a big rounded cowl with a soft point falling back, its face cut open onto a black void with two eyes.
def cowl(i, j, x, y, z):
    lift = max(0.0, (z - 1.0) / 0.66)
    brow = 0.05 * max(0.0, 1 - abs(z - 1.42) / 0.1) if y < -0.2 else 0.0
    return (x, y + 0.2 * lift ** 2.6 - brow, z)


HOOD = [(0.27, 1.0), (0.32, 1.05), (0.36, 1.11), (0.385, 1.18), (0.395, 1.25), (0.39, 1.32), (0.37, 1.39), (0.33, 1.46),
        (0.27, 1.52), (0.18, 1.59), (0.09, 1.65), (0.0, 1.71)]
hood = lathe('hood', HOOD, 20, MAIN, sy=0.95, phase=math.pi / 20, shape=cowl)
FACE = (0.24, 1.26, 0.18)


def in_face(c, grow=1.0):
    return c.y < -0.1 and (c.x / (FACE[0] * grow)) ** 2 + ((c.z - FACE[1]) / (FACE[2] * grow)) ** 2 < 1


drop_faces(hood, lambda c: not in_face(c))
bm = bmesh.new()
bm.from_mesh(hood.data)
for v in bm.verts:
    if v.is_boundary and in_face(v.co, 1.6):
        k = 1 / math.hypot(v.co.x / FACE[0], (v.co.z - FACE[1]) / FACE[2])
        v.co.x *= k
        v.co.z = FACE[1] + (v.co.z - FACE[1]) * k
bm.to_mesh(hood.data)
bm.free()
solidify(hood, 0.045)
ico('void', (0, -0.04, 1.25), 0.31, VOID, scale=(0.95, 0.9, 0.85))
for sx in (-0.075, 0.075):
    eye = ico('eye', (sx, -0.3, 1.23), 0.034, EYES, scale=(1.15, 0.5, 0.7))
    eye.rotation_euler.y = -math.copysign(0.3, sx)
glow((0, -0.33, 1.24), '#9dffe0', 0.3, name='glow_eyes')

# Team scarf: a thick wrap at the throat, a tail down the chest and a tail down the back.
def drape(i, j, x, y, z):
    front = max(0.0, -y / 0.3)
    return (x, y, z - (0.09 * front ** 3 if i < 2 else 0.03 * front ** 3))


lathe('scarf', [(0.27, 0.92), (0.36, 0.97), (0.37, 1.04), (0.33, 1.09), (0.24, 1.12)], 14, TEAM, sy=0.9, shape=drape)
ribbon('scarf_front', bezier((-0.1, -0.33, 0.9), (-0.15, -0.37, 0.8), (-0.12, -0.37, 0.7), (-0.19, -0.34, 0.58), 4),
       [0.15, 0.15, 0.13, 0.12, 0.11], (1, 0, 0), TEAM)
back_pivot = empty('scarf_back_pivot', (0.06, 0.3, 1.0))
tail = ribbon('scarf_back', bezier((0.06, 0.3, 1.0), (0.08, 0.36, 0.86), (0.1, 0.38, 0.72), (0.14, 0.4, 0.56), 4),
              [0.15, 0.15, 0.14, 0.13, 0.12], (1, 0, 0), TEAM)
parent(tail, back_pivot)
loop(back_pivot, 'rotation_euler', 1, [0.0, 0.08, 0.0, -0.08], 96)

# Leather shoulder guard with spikes on the left shoulder.
guard = ico('pauldron', (0.27, 0.0, 0.98), 0.12, LEATHER, scale=(1.0, 1.1, 0.6))
for k, (dx, dz, tilt) in enumerate(((0.0, 0.05, 0.2), (0.07, 0.0, 0.9), (0.04, 0.07, 0.5))):
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.035, depth=0.14, location=(0.3 + dx, 0.02 + 0.02 * k, 1.02 + dz),
                                    rotation=(0, tilt, 0))
    assign(flat(bpy.context.object), LEATHER).name = 'spike'

# Belt, gold buckle, pouches and a small brass bell.
lathe('belt', [(0.3, 0.6), (0.305, 0.66), (0.29, 0.71)], 14, LEATHER, sy=0.88)
box('buckle', (0, -0.27, 0.655), (0.09, 0.03, 0.08), GOLD, bevel=0.01)
box('buckle_hole', (0, -0.286, 0.655), (0.045, 0.01, 0.04), LEATHER)
box('pouch', (0.2, -0.2, 0.57), (0.1, 0.06, 0.11), LEATHER, rot=(0, 0, 0.6), bevel=0.015)
box('pouch', (-0.2, -0.2, 0.57), (0.08, 0.06, 0.09), LEATHER, rot=(0, 0, -0.6), bevel=0.015)
bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.04, radius2=0.012, depth=0.06, location=(0.09, -0.27, 0.53))
assign(flat(bpy.context.object), GOLD).name = 'bell'

# Sleeves and bony hands.
limb('sleeve_r', (-0.24, -0.02, 0.98), (-0.33, -0.13, 0.71), 0.075, 0.11, MAIN)
limb('sleeve_l', (0.25, -0.02, 0.96), (0.33, -0.11, 0.69), 0.075, 0.11, MAIN)
ico('hand_r', RIGHT_HAND, 0.055, BONE, scale=(1, 1, 1.1))
ico('hand_l', LEFT_HAND, 0.05, BONE, scale=(1, 1, 1.1))

# Scythe: the weapon pivots at the right-hand grip.
weapon = empty('weapon', RIGHT_HAND)
TOP = 1.8


def part(ob):
    return parent(ob, weapon)


g = RIGHT_HAND
part(limb('shaft', (g.x, g.y, 0.03), (g.x, g.y, TOP + 0.06), 0.024, 0.024, WOOD))
for z, h in ((0.05, 0.05), (TOP - 0.06, 0.08)):
    part(limb('ferrule', (g.x, g.y, z), (g.x, g.y, z + h), 0.034, 0.034, GOLD))
part(box('collar', (g.x - 0.03, g.y, TOP), (0.12, 0.06, 0.07), GOLD, bevel=0.012))
spine = bezier((g.x - 0.02, g.y, TOP + 0.03), (g.x - 0.28, g.y, TOP + 0.16), (g.x - 0.55, g.y, TOP + 0.03),
               (g.x - 0.64, g.y, TOP - 0.26), 8)
widths = [0.13 * (1 - i / 8) ** 0.7 + 0.004 for i in range(9)]
verts, faces = [], []
for i, p in enumerate(spine):
    tangent = (spine[min(i + 1, 8)] - spine[max(i - 1, 0)]).normalized()
    inward = Vector((tangent.z, 0, -tangent.x))
    if inward.z > 0:
        inward = -inward
    verts += [p, p + inward * widths[i]]
for i in range(8):
    faces.append((2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1))
part(solidify(build('blade', verts, faces, STEEL), 0.022, 0))
charm_top = Vector((g.x - 0.08, g.y, TOP - 0.02))
part(limb('cord', charm_top, charm_top - Vector((0, 0, 0.26)), 0.006, 0.006, LEATHER, sides=4))
part(ico('charm_bead', charm_top - Vector((0, 0, 0.14)), 0.025, GOLD))
bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.035, radius2=0.0, depth=0.08, location=charm_top - Vector((0, 0, 0.3)),
                                rotation=(math.pi, 0, 0))
part(assign(flat(bpy.context.object), SOUL)).name = 'charm_drop'

# Soul lantern swinging under the left hand.
swing = empty('lantern_swing', LEFT_HAND)
L = LEFT_HAND - Vector((0, 0, 0.2))
for ob in (
    limb('lantern_cord', LEFT_HAND, L + Vector((0, 0, 0.1)), 0.006, 0.006, LEATHER, sides=4),
    limb('lantern_cap', L + Vector((0, 0, 0.06)), L + Vector((0, 0, 0.11)), 0.06, 0.02, GOLD),
    limb('lantern_base', L - Vector((0, 0, 0.1)), L - Vector((0, 0, 0.07)), 0.055, 0.06, GOLD),
    lathe('lantern_core', [(0.035, L.z - 0.07), (0.05, L.z), (0.035, L.z + 0.06)], 6, SOUL,
          shape=lambda i, j, x, y, z: (x + L.x, y + L.y, z), close_top=True, close_bottom=True),
):
    parent(ob, swing)
for k in range(3):
    a = k * 2 * math.pi / 3
    parent(limb('lantern_bar', L + Vector((0.05 * math.cos(a), 0.05 * math.sin(a), -0.07)),
                L + Vector((0.05 * math.cos(a), 0.05 * math.sin(a), 0.06)), 0.008, 0.008, GOLD, sides=4), swing)
glow(L, GREEN_GLOW, 0.4, swing, name='glow_lantern')
loop(swing, 'rotation_euler', 0, [0.0, 0.12, 0.0, -0.12], 64)

# Two ghost skulls circling the Gravecaller, each bobbing on its own beat.
orbit = empty('orbit', (0, 0, 0))
for k, (ang, z, period) in enumerate(((0.35, 0.95, 48), (math.pi + 0.5, 0.55, 64))):
    pos = Vector((0.48 * math.cos(ang), 0.48 * math.sin(ang), z))
    bob = empty('skull_bob', pos, orbit)
    head = ico('skull', pos, 0.08, SOUL, scale=(1, 0.95, 0.92), subdiv=2)
    jaw = box('skull_jaw', pos + Vector((0, -0.015, -0.07)), (0.075, 0.07, 0.045), SOUL, bevel=0.012)
    bpy.ops.mesh.primitive_cone_add(vertices=6, radius1=0.065, radius2=0.0, depth=0.2, location=pos - Vector((0, -0.04, 0.15)),
                                    rotation=(math.pi - 0.45, 0, 0))
    wisp = assign(flat(bpy.context.object), SOUL)
    wisp.name = 'skull_wisp'
    for sx in (-0.028, 0.028):
        parent(ico('skull_eye', pos + Vector((sx, -0.06, 0.005)), 0.022, VOID, scale=(1, 0.5, 1.1)), bob)
    for ob in (head, jaw, wisp):
        parent(ob, bob)
    glow(pos, GREEN_GLOW, 0.5, bob, name='glow_skull')
    loop(bob, 'location', 2, [z, z + 0.06, z, z - 0.04], period)
spin(orbit, period=192)

# One mesh per moving part keeps the draw calls down: bake modifiers, then join the meshes that share a parent.
bpy.ops.object.select_all(action='DESELECT')
for ob in bpy.data.objects:
    if ob.type == 'MESH':
        ob.select_set(True)
bpy.context.view_layer.objects.active = next(o for o in bpy.data.objects if o.type == 'MESH')
bpy.ops.object.convert(target='MESH')
groups = {}
for ob in bpy.data.objects:
    if ob.type == 'MESH':
        groups.setdefault(ob.parent, []).append(ob)
for par, obs in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for ob in obs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join()
    obs[0].name = f'{par.name}_mesh' if par else 'body'

deps = bpy.context.evaluated_depsgraph_get()
tris = sum(sum(len(p.vertices) - 2 for p in o.evaluated_get(deps).to_mesh().polygons) for o in bpy.data.objects if o.type == 'MESH')
print(f'gravecaller: {tris} triangles, {len(bpy.data.objects)} objects')
finish()
