"""The Gravecaller: a hooded bone priest in a long green robe, team scarf at the throat, scythe in the right hand,
a soul lantern in the left, and two ghost skulls circling it. Smooth subdivided forms, painted by lookdev and baked
into one atlas."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bmesh
import bpy
from mathutils import Vector
from common import *
from lookdev import bake, mark, paint

reset()

MAIN = paint('main', '#275f48', '#0a2024', '#5c9a76', rough=0.85, edge=0.8, mottle=0.16, streak=0.6, grime=0.5,
             accent='#a88a4c', keep=True)
TEAM = paint('team', '#d8d8d8', '#6c6c6c', '#ffffff', rough=0.9, streak=0.5, mottle=0.08, accent='#8e8e8e', keep=True)
DARK = paint('robe_dark', '#1a2e25', '#070f0d', '#3a5a48', rough=0.9, streak=0.5, grime=0.5)
VOID = paint('void', '#020403', '#000000', '#04100c', cavity=0, edge=0, mottle=0)
LEATHER = paint('leather', '#5e3b22', '#24130b', '#a8784a', edge=0.8, mottle=0.18)
GOLD = paint('gold', '#c99a3e', '#4a2a0e', '#ffe9a6', metal=True, cavity=0.35, edge=1.0, mottle=0.06)
WOOD = paint('wood', '#6f4426', '#2a160b', '#a87548', streak=1.0, mottle=0.22, edge=0.6)
STEEL = paint('steel', '#7f9a98', '#26363b', '#e4f4f0', metal=True, edge=0.15, mottle=0.05, accent='#f6fffc')
BONE = paint('bone', '#ddd0b0', '#6e5a3e', '#fffbea', mottle=0.1, edge=0.6)
SOUL = paint('soul', '#3fd9a0', '#0a5446', '#c8ffe8', cavity=0.6, edge=0.3, mottle=0.08, accent='#06382f', glow=1.6)
EYES = material('eyes', '#d8fff2', rough=0.5, emit='#a8ffe6', strength=6.0)

GREEN_GLOW = '#5dffc0'
RIGHT_HAND = Vector((-0.34, -0.15, 0.66))
LEFT_HAND = Vector((0.33, -0.13, 0.62))


def build(name, verts, faces, mat, levels=0):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    assign(ob, mat)
    return subsurf(smooth(ob), levels)


def subsurf(ob, levels):
    if levels:
        mod = ob.modifiers.new('sub', 'SUBSURF')
        mod.levels = mod.render_levels = levels
    return ob


def solidify(ob, thickness, offset=-1.0, inner=None):
    """Gives cloth its thickness; `inner` paints the inside shell (a hood's lining, a sleeve's shadowed inside)."""
    mod = ob.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = thickness
    mod.offset = offset
    mod.use_even_offset = True
    if inner:
        ob.data.materials.append(inner)
        mod.material_offset = 1
    # Solidify must run before subdivision so the shell's rim rounds off like a rolled hem.
    ob.modifiers.move(len(ob.modifiers) - 1, 0)
    return ob


def lathe(name, rings, sides, mat, sy=1.0, phase=0.0, close_top=False, close_bottom=False, shape=None, mask=None, levels=0):
    """Rings of (radius, z) swept about z. `shape(i, j, x, y, z)` may move each vertex (ring i, side j);
    `mask(i, j)` writes the accent attribute."""
    verts, faces, marks = [], [], []
    for i, (r, z) in enumerate(rings):
        for j in range(sides):
            a = phase + 2 * math.pi * j / sides
            x, y = r * math.sin(a), -r * math.cos(a) * sy
            verts.append(Vector(shape(i, j, x, y, z) if shape else (x, y, z)))
            marks.append(mask(i, j) if mask else 0.0)
    for i in range(len(rings) - 1):
        for j in range(sides):
            k = (j + 1) % sides
            faces.append((i * sides + j, i * sides + k, (i + 1) * sides + k, (i + 1) * sides + j))
    if close_bottom:
        faces.append(tuple(reversed(range(sides))))
    if close_top:
        n = len(rings) - 1
        faces.append(tuple(n * sides + j for j in range(sides)))
    ob = build(name, verts, faces, mat, levels)
    if mask:
        it = iter(marks)
        mark(ob, lambda co: next(it))
    # A ring of radius 0 leaves degenerate quads that bake to a black dot; welding them makes a clean pole.
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def drop_faces(ob, keep):
    """Deletes the faces whose centre fails `keep(centre)`: cuts openings into a lathed shell."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep(f.calc_center_median())], context='FACES')
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def frames(path):
    """A rotation-minimising frame (side, up) at each point of `path`, so swept tubes never twist."""
    path = [Vector(p) for p in path]
    tangents = [(path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized() for i in range(len(path))]
    ref = Vector((0, 0, 1)) if abs(tangents[0].z) < 0.9 else Vector((1, 0, 0))
    side = tangents[0].cross(ref).normalized()
    out = []
    for t in tangents:
        side = (side - t * side.dot(t)).normalized()
        out.append((side, t.cross(side).normalized()))
    return path, out


def sweep(name, path, radii, sides, mat, caps=True, levels=0, squash=1.0, mask=None):
    """A tube along `path`, radius `radii[i]` at point i. `mask(i)` writes the accent attribute per ring."""
    path, fr = frames(path)
    verts, faces = [], []
    for p, r, (s, u) in zip(path, radii, fr):
        for j in range(sides):
            a = 2 * math.pi * j / sides
            verts.append(p + s * (r * math.cos(a)) + u * (r * math.sin(a) * squash))
    n = len(path)
    for i in range(n - 1):
        for j in range(sides):
            k = (j + 1) % sides
            faces.append((i * sides + j, i * sides + k, (i + 1) * sides + k, (i + 1) * sides + j))
    if caps:
        faces.append(tuple(reversed(range(sides))))
        faces.append(tuple((n - 1) * sides + j for j in range(sides)))
    ob = build(name, verts, faces, mat, levels)
    if mask:
        vals = [mask(i) for i in range(n) for _ in range(sides)]
        mark(ob, lambda co, it=iter(vals): next(it))
    return ob


def limb(name, a, b, r1, r2, mat, sides=8):
    return sweep(name, [a, b], [r1, r2], sides, mat)


def blob(name, loc, radius, mat, scale=(1, 1, 1), subdiv=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=radius, location=loc)
    ob = bpy.context.object
    ob.name = name
    ob.scale = scale
    return assign(smooth(ob), mat)


def box(name, loc, size, mat, rot=(0, 0, 0), bevel=0.0, segments=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    if bevel:
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        mod = ob.modifiers.new('bevel', 'BEVEL')
        mod.width = bevel
        mod.segments = segments
        mod.harden_normals = False
    return assign(smooth(ob), mat)


def ribbon(name, path, widths, side, mat, thickness=0.022, belly=0.012, notch=0.0, mask=None):
    """A cloth strip along `path`, widened by `widths` along `side`, its middle bowed out by `belly` so it reads as
    cloth with body; `notch` cuts a swallowtail into its end."""
    side = Vector(side).normalized()
    path = [Vector(p) for p in path]
    verts, faces = [], []
    n = len(path)
    for i, (p, w) in enumerate(zip(path, widths)):
        t = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        out = side.cross(t).normalized()
        lift = t * notch if i == n - 1 else Vector()
        verts += [p - side * w / 2, p + out * belly - lift, p + side * w / 2]
    for i in range(n - 1):
        a = 3 * i
        faces += [(a, a + 1, a + 4, a + 3), (a + 1, a + 2, a + 5, a + 4)]
    ob = solidify(build(name, verts, faces, mat, 1), thickness, 0)
    if mask:
        vals = [mask(i) for i in range(n) for _ in range(3)]
        mark(ob, lambda co, it=iter(vals): next(it))
    return ob


def bezier(p0, p1, p2, p3, n):
    pts = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        pts.append(Vector(p0) * u ** 3 + Vector(p1) * 3 * u * u * t + Vector(p2) * 3 * u * t * t + Vector(p3) * t ** 3)
    return pts


def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


# A slow breath lifts everything the figure holds, so the hands never leave the scythe and the lantern.
breath = empty('breath')
loop(breath, 'scale', 2, [1.0, 1.018], 84)

# Robe: a long flared cone hanging in deep folds that widen toward a ragged hem, slit up the front onto the under-robe.
ROBE = [(0.45, 0.0), (0.445, 0.025), (0.43, 0.06), (0.39, 0.2), (0.34, 0.38), (0.29, 0.56), (0.255, 0.72), (0.228, 0.88),
        (0.21, 1.03)]
SIDES = 28


def folds(a):
    return 0.55 * math.sin(7 * a + 0.4) + 0.3 * math.sin(12 * a + 1.7) + 0.15 * math.sin(3 * a + 0.9)


def robe_shape(i, j, x, y, z):
    a = 2 * math.pi * j / SIDES
    hang = smoothstep(0.75, 0.0, z)
    f = folds(a)
    k = 1 + 0.17 * hang ** 1.1 * f
    tear = (0.0, 0.05, 0.015, 0.0, 0.07, 0.02, 0.0, 0.035)[j % 8] if i <= 2 else 0.0
    return (x * k, y * k, z + tear - 0.035 * f * hang)


robe = lathe('robe', ROBE, SIDES, MAIN, sy=0.86, shape=robe_shape, mask=lambda i, j: 1.0 if i <= 1 else 0.0, levels=1)
drop_faces(robe, lambda c: not (c.y < -0.2 and abs(c.x) < 0.075 and c.z < 0.5))
solidify(robe, 0.022, inner=DARK)
lathe('underrobe', [(0.3, 0.07), (0.27, 0.3), (0.24, 0.5), (0.2, 0.75)], 16, DARK, sy=0.86, close_bottom=True,
      shape=lambda i, j, x, y, z: (x * (1 + 0.05 * math.sin(5 * j)), y, z))
for sx in (-0.09, 0.09):
    box('boot', (sx, -0.2, 0.05), (0.11, 0.18, 0.1), LEATHER, bevel=0.035, segments=2)
    box('boot_cuff', (sx, -0.18, 0.11), (0.12, 0.15, 0.035), DARK, bevel=0.012)

# Capelet over the shoulders, its lower edge torn into long points like the sheet's tattered mantle.
def tatter(i, j, x, y, z):
    a = 2 * math.pi * j / 26
    flare = 1 + 0.05 * math.sin(5 * a)
    if i == 0:
        drop = (0.09, 0.0, 0.06, 0.02, 0.11, 0.0, 0.04)[j % 7] if j % 2 == 0 else 0.0
        return (x * 1.07 * flare, y * 1.07 * flare, z - drop)
    return (x * flare, y * flare, z)


cape = lathe('capelet', [(0.37, 0.8), (0.35, 0.87), (0.32, 0.94), (0.27, 1.02), (0.21, 1.08)], 26, MAIN, sy=0.88,
             shape=tatter, mask=lambda i, j: 0.55 if i == 0 else 0.0)
solidify(cape, 0.02, inner=DARK)

# Hood: a big rounded cowl with a soft point falling back, its face cut open onto a black void with two eyes.
def cowl(i, j, x, y, z):
    lift = max(0.0, (z - 1.0) / 0.66)
    brow = 0.06 * max(0.0, 1 - abs(z - 1.43) / 0.12) if y < -0.2 else 0.0
    a = 2 * math.pi * j / 22
    neck = 0.03 * smoothstep(1.15, 1.0, z) * math.sin(9 * a)
    drape = 0.06 * smoothstep(1.55, 1.12, z) * math.sin(6 * a + 0.8)
    k = 1 + neck + drape
    return (x * k, y * k + 0.34 * lift ** 3.4 - brow, z)


HOOD = [(0.27, 1.0), (0.32, 1.05), (0.36, 1.11), (0.385, 1.18), (0.395, 1.25), (0.39, 1.32), (0.37, 1.39), (0.33, 1.46),
        (0.27, 1.52), (0.19, 1.6), (0.11, 1.67), (0.045, 1.73), (0.0, 1.76)]
hood = lathe('hood', HOOD, 22, MAIN, sy=0.95, phase=math.pi / 22, shape=cowl, levels=1)
FACE = (0.235, 1.26, 0.18)


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
# The tip is narrower than the cloth is thick, so the lining would poke through it; thin the shell toward the point.
thick = hood.vertex_groups.new(name='thick')
for v in hood.data.vertices:
    thick.add([v.index], 1 - 0.9 * smoothstep(1.5, 1.72, v.co.z), 'REPLACE')
mod = solidify(hood, 0.05, inner=DARK).modifiers['solid']
mod.use_even_offset = False
mod.vertex_group = 'thick'
blob('void', (0, -0.04, 1.25), 0.31, VOID, scale=(0.95, 0.9, 0.85))
for sx in (-0.075, 0.075):
    eye = blob('eye', (sx, -0.3, 1.23), 0.036, EYES, scale=(1.2, 0.5, 0.65))
    eye.rotation_euler.y = -math.copysign(0.35, sx)
glow((0, -0.33, 1.24), '#9dffe0', 0.3, name='glow_eyes')

# Team scarf: a thick twisted wrap at the throat, a knot, a tail down the chest and a tail down the back.
def drape(i, j, x, y, z):
    a = 2 * math.pi * j / 20
    front = max(0.0, -y / 0.3)
    twist = 1 + 0.1 * math.sin(5 * a + i * 1.3)
    return (x * twist, y * twist, z - (0.09 * front ** 3 if i < 2 else 0.03 * front ** 3))


lathe('scarf', [(0.27, 0.92), (0.35, 0.95), (0.375, 1.0), (0.37, 1.05), (0.33, 1.09), (0.25, 1.12)], 20, TEAM, sy=0.9,
      shape=drape, levels=1)
blob('scarf_knot', (-0.13, -0.31, 0.88), 0.065, TEAM, scale=(1.1, 0.8, 0.9))
# Both tails sway together about the neck, so the scarf costs one extra draw call, not two.
tails = empty('scarf_tails', (0, 0, 0.95))
for ob in (
    ribbon('scarf_front', bezier((-0.13, -0.33, 0.87), (-0.17, -0.38, 0.78), (-0.13, -0.38, 0.68), (-0.2, -0.35, 0.55), 6),
           [0.13, 0.14, 0.14, 0.13, 0.12, 0.12, 0.12], (1, 0, 0.2), TEAM, notch=0.04, mask=lambda i: 1.0 if i == 4 else 0.0),
    ribbon('scarf_back', bezier((0.06, 0.3, 1.0), (0.08, 0.36, 0.86), (0.1, 0.38, 0.72), (0.14, 0.4, 0.56), 6),
           [0.15, 0.15, 0.145, 0.14, 0.13, 0.13, 0.12], (1, 0, 0), TEAM, notch=0.045, mask=lambda i: 1.0 if i == 4 else 0.0),
):
    parent(ob, tails)
loop(tails, 'rotation_euler', 2, [0.0, 0.07, 0.0, -0.07], 96)
loop(tails, 'rotation_euler', 0, [0.0, -0.04, 0.0, 0.03], 64)

# Leather shoulder guard, riveted, with bone spikes on the left shoulder.
guard = blob('pauldron', (0.27, 0.0, 0.98), 0.12, LEATHER, scale=(1.0, 1.1, 0.6))
blob('pauldron_rim', (0.27, 0.0, 0.955), 0.125, LEATHER, scale=(1.02, 1.12, 0.32))
for k in range(5):
    a = -0.9 + k * 0.45
    blob('rivet', (0.27 + 0.11 * math.sin(a), -0.12 * math.cos(a), 0.99), 0.012, GOLD, subdiv=1)
for k, (dx, dy, dz, tilt) in enumerate(((0.0, 0.03, 0.05, 0.2), (0.07, 0.0, 0.0, 0.9), (0.04, 0.07, 0.06, 0.5))):
    root = Vector((0.3 + dx, dy, 1.02 + dz))
    tip = root + Vector((math.sin(tilt), 0.03, math.cos(tilt))) * 0.15
    sweep('spike', [root, root.lerp(tip, 0.5), tip], [0.03, 0.017, 0.002], 8, BONE)

# Belt with a gold buckle, rivets, pouches, and brass bells and a bone charm hanging from it.
belt = lathe('belt', [(0.3, 0.6), (0.307, 0.63), (0.307, 0.68), (0.293, 0.71)], 28, LEATHER, sy=0.88)
for x, z, w, h in ((0, 0.69, 0.11, 0.022), (0, 0.62, 0.11, 0.022), (-0.045, 0.655, 0.022, 0.09), (0.045, 0.655, 0.022, 0.09)):
    box('buckle', (x, -0.272, z), (w, 0.025, h), GOLD, bevel=0.007, segments=1)
box('buckle_pin', (0, -0.28, 0.655), (0.012, 0.02, 0.06), GOLD, bevel=0.004)
for k in range(8):
    a = math.pi * (0.25 + k * 0.21)
    blob('belt_stud', (0.31 * math.sin(a), -0.31 * 0.88 * math.cos(a), 0.655), 0.011, GOLD, subdiv=1)
for sx, rot, w, h in ((0.2, 0.6, 0.11, 0.11), (-0.2, -0.6, 0.085, 0.09)):
    box('pouch', (sx, -0.2, 0.57), (w, 0.065, h), LEATHER, rot=(0, 0, rot), bevel=0.02, segments=2)
    box('pouch_flap', (sx * 1.02, -0.2 - 0.03, 0.605), (w * 1.05, 0.02, h * 0.45), LEATHER, rot=(0.15, 0, rot), bevel=0.008)
    blob('pouch_stud', (sx * 1.05, -0.245, 0.585), 0.012, GOLD, subdiv=1)


def bell(name, top, size):
    prof = [(0.0, 0.02), (0.35, 0.0), (0.55, -0.25), (0.65, -0.6), (0.95, -0.95), (1.0, -1.0)]
    return lathe(name, [(r * size, top.z + z * size * 1.3) for r, z in prof], 10, GOLD,
                 shape=lambda i, j, x, y, z: (x + top.x, y + top.y, z), close_top=True)


for tx, ty, drop, size in ((0.09, -0.29, 0.07, 0.045), (-0.1, -0.29, 0.1, 0.035), (0.15, -0.26, 0.05, 0.03)):
    knot = Vector((tx, ty, 0.62))
    limb('bell_cord', knot, knot - Vector((0, 0, drop)), 0.005, 0.005, LEATHER, sides=4)
    bell('bell', knot - Vector((0, 0, drop)), size)
charm = Vector((-0.26, -0.15, 0.62))
limb('charm_cord', charm, charm - Vector((0, 0, 0.08)), 0.005, 0.005, LEATHER, sides=4)
blob('charm_skull', charm - Vector((0, 0, 0.11)), 0.03, BONE, scale=(1, 0.95, 1.1))
for sx in (-0.011, 0.011):
    blob('charm_eye', charm - Vector((-sx, 0.027, 0.11)), 0.008, VOID, subdiv=1)

# Bell sleeves, open at the wrist onto bony hands.
for name, shoulder, wrist in (('sleeve_r', (-0.23, -0.02, 0.99), (-0.335, -0.14, 0.7)), ('sleeve_l', (0.24, -0.02, 0.97), (0.33, -0.12, 0.68))):
    s, w = Vector(shoulder), Vector(wrist)
    path = [s.lerp(w, t) for t in (0, 0.35, 0.7, 1.0, 1.06)]
    sl = sweep(name, path, [0.075, 0.085, 0.1, 0.122, 0.124], 14, MAIN, caps=False, levels=1,
               mask=lambda i: 1.0 if i >= 3 else 0.0)
    solidify(sl, 0.016, inner=DARK)
for hand, r in ((RIGHT_HAND, 0.056), (LEFT_HAND, 0.05)):
    blob('hand', hand, r, BONE, scale=(1, 1, 1.1), subdiv=3)
    for k in range(3):
        blob('knuckle', hand + Vector((-0.03 + 0.03 * k, -0.045, 0.02 - 0.025 * k)), 0.017, BONE, scale=(1, 1, 1.3), subdiv=1)

# Scythe: the weapon pivots at the right-hand grip.
weapon = empty('weapon', RIGHT_HAND)
TOP = 1.8


def part(ob):
    return parent(ob, weapon)


g = RIGHT_HAND
part(sweep('shaft', [(g.x, g.y, 0.06), (g.x + 0.004, g.y, 0.9), (g.x, g.y, TOP + 0.06)], [0.022, 0.025, 0.023], 10, WOOD))
part(sweep('butt', [(g.x, g.y, 0.0), (g.x, g.y, 0.03), (g.x, g.y, 0.08)], [0.006, 0.03, 0.032], 10, GOLD))
for z, h in ((0.08, 0.035), (0.86, 0.03), (TOP - 0.07, 0.09)):
    part(sweep('ferrule', [(g.x, g.y, z), (g.x, g.y, z + h / 2), (g.x, g.y, z + h)], [0.03, 0.034, 0.03], 12, GOLD))
for z0, z1, turns in ((0.5, 0.84, 7), (0.2, 0.36, 3)):
    n = turns * 6
    helix = [Vector((g.x + 0.027 * math.cos(2 * math.pi * t / 6), g.y + 0.027 * math.sin(2 * math.pi * t / 6), z0 + (z1 - z0) * t / n))
             for t in range(n + 1)]
    part(sweep('grip_wrap', helix, [0.009] * (n + 1), 4, LEATHER, squash=0.6))
part(box('collar', (g.x - 0.03, g.y, TOP), (0.13, 0.065, 0.075), GOLD, bevel=0.018, segments=2))
spine = bezier((g.x - 0.04, g.y, TOP + 0.03), (g.x - 0.3, g.y, TOP + 0.17), (g.x - 0.57, g.y, TOP + 0.03),
               (g.x - 0.66, g.y, TOP - 0.28), 14)
widths = [0.14 * (1 - i / 14) ** 0.75 + 0.004 for i in range(15)]
verts, faces, edge = [], [], []
for i, p in enumerate(spine):
    tangent = (spine[min(i + 1, 14)] - spine[max(i - 1, 0)]).normalized()
    inward = Vector((tangent.z, 0, -tangent.x))
    if inward.z > 0:
        inward = -inward
    t = 0.014 * (1 - i / 16)
    verts += [p + Vector((0, -t, 0)), p + inward * widths[i] * 0.45 + Vector((0, -t * 0.6, 0)), p + inward * widths[i],
              p + inward * widths[i] * 0.45 + Vector((0, t * 0.6, 0)), p + Vector((0, t, 0))]
    edge += [0.0, 0.0, 1.0, 0.0, 0.0]
for i in range(14):
    a = 5 * i
    for k in range(4):
        faces.append((a + k, a + 5 + k, a + 6 + k, a + k + 1))
    faces.append((a + 4, a + 9, a + 5, a))
blade = build('blade', verts, faces, STEEL)
mark(blade, lambda co, it=iter(edge): next(it))
part(blade)
for k, (dx, drop) in enumerate(((0.08, 0.26), (0.16, 0.18))):
    top = Vector((g.x - dx, g.y, TOP - 0.03))
    part(limb('cord', top, top - Vector((0, 0, drop)), 0.005, 0.005, LEATHER, sides=4))
    part(blob('charm_bead', top - Vector((0, 0, drop * 0.5)), 0.022, GOLD, subdiv=1))
    part(sweep('charm_drop', [top - Vector((0, 0, drop)), top - Vector((0, 0, drop + 0.04)), top - Vector((0, 0, drop + 0.09))],
               [0.012, 0.03, 0.002], 8, SOUL))

# Soul lantern swinging under the left hand.
swing = empty('lantern_swing', LEFT_HAND)
L = LEFT_HAND - Vector((0, 0, 0.21))
at = lambda i, j, x, y, z: (x + L.x, y + L.y, z)
for ob in (
    limb('lantern_cord', LEFT_HAND, L + Vector((0, 0, 0.13)), 0.006, 0.006, LEATHER, sides=4),
    lathe('lantern_cap', [(0.068, L.z + 0.06), (0.07, L.z + 0.075), (0.045, L.z + 0.1), (0.018, L.z + 0.125), (0.0, L.z + 0.13)],
          12, GOLD, shape=at),
    lathe('lantern_base', [(0.0, L.z - 0.11), (0.05, L.z - 0.105), (0.066, L.z - 0.085), (0.066, L.z - 0.065), (0.0, L.z - 0.065)],
          12, GOLD, shape=at),
    lathe('lantern_core', [(0.0, L.z - 0.07), (0.04, L.z - 0.06), (0.052, L.z), (0.04, L.z + 0.05), (0.0, L.z + 0.062)], 10, SOUL,
          shape=at),
):
    parent(ob, swing)
for k in range(4):
    a = k * math.pi / 2 + math.pi / 4
    c = Vector((0.058 * math.cos(a), 0.058 * math.sin(a), 0))
    parent(limb('lantern_bar', L + c + Vector((0, 0, -0.07)), L + c + Vector((0, 0, 0.065)), 0.008, 0.008, GOLD, sides=6), swing)
glow(L, GREEN_GLOW, 0.4, swing, name='glow_lantern')
loop(swing, 'rotation_euler', 0, [0.0, 0.12, 0.0, -0.12], 64)
loop(swing, 'rotation_euler', 1, [0.0, -0.05, 0.0, 0.05], 96)

# Two ghost skulls circling the Gravecaller, each bobbing on its own beat, trailing a curled wisp of soul fire.
orbit = empty('orbit', (0, 0, 0))
for k, (ang, z, period) in enumerate(((0.35, 0.95, 48), (math.pi + 0.5, 0.55, 64))):
    pos = Vector((0.48 * math.cos(ang), 0.48 * math.sin(ang), z))
    bob = empty('skull_bob', pos, orbit)
    parts = [
        blob('skull', pos, 0.08, SOUL, scale=(1, 0.95, 0.92), subdiv=3),
        blob('skull_cheek', pos + Vector((0, -0.025, -0.045)), 0.06, SOUL, scale=(1.1, 0.9, 0.7)),
        box('skull_jaw', pos + Vector((0, -0.02, -0.08)), (0.075, 0.07, 0.04), SOUL, bevel=0.015),
        sweep('skull_wisp', [pos + Vector((0, 0.03, -0.04)), pos + Vector((0, 0.1, -0.12)), pos + Vector((0, 0.13, -0.22)),
                             pos + Vector((0, 0.08, -0.3)), pos + Vector((0, 0.02, -0.31))],
              [0.07, 0.05, 0.03, 0.014, 0.002], 8, SOUL, mask=lambda i: min(1.0, i / 4) ** 1.5),
    ]
    for sx in (-0.03, 0.03):
        parts.append(blob('skull_eye', pos + Vector((sx, -0.065, 0.0)), 0.024, VOID, scale=(1, 0.5, 1.15)))
    parts.append(blob('skull_nose', pos + Vector((0, -0.078, -0.035)), 0.01, VOID, scale=(1, 0.5, 1.4), subdiv=1))
    for ob in parts:
        parent(ob, bob)
    glow(pos, GREEN_GLOW, 0.5, bob, name='glow_skull')
    loop(bob, 'location', 2, [z, z + 0.06, z, z - 0.04], period)
    loop(bob, 'rotation_euler', 2, [0.0, 0.25, 0.0, -0.25], period * 2)
spin(orbit, period=192)

for ob in list(bpy.data.objects):
    if ob.parent is None and ob not in (breath, orbit):
        parent(ob, breath)

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

bake()
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print(f'gravecaller: {tris} triangles, {len(bpy.data.objects)} objects')
finish()
