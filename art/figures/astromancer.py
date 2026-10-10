import math
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))
import bmesh
import bpy
from mathutils import Vector
from common import *
from hands import fist, hand

FRONT = Vector((0, -1, 0))



def mesh_obj(name, bm, mat, par=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    assign(flat(ob), mat)
    if par:
        parent(ob, par)
    return ob


def ring_basis(d):
    d = d.normalized()
    ref = FRONT if abs(d.dot(FRONT)) < 0.9 else Vector((0, 0, 1))
    u = (ref - d * ref.dot(d)).normalized()
    return u, d.cross(u)


def tube(name, pts, mat, segs=8, axis=None, wob=0.0, cap0=True, cap1=True, twist=0.0, par=None):
    """Rings of (center, radius[, wobble]) swept along their centres; a zero radius closes to a point."""
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(pts):
        c, r = Vector(p[0]), p[1]
        w = p[2] if len(p) > 2 else wob
        if axis is not None:
            d = Vector(axis)
        else:
            a, b = Vector(pts[max(i - 1, 0)][0]), Vector(pts[min(i + 1, len(pts) - 1)][0])
            d = b - a
        u, v = ring_basis(d)
        if r == 0:
            rings.append([bm.verts.new(c)])
            continue
        ring = []
        for k in range(segs):
            ang = 2 * math.pi * k / segs + twist
            rr = r * (1 + (w if k % 2 else -w))
            ring.append(bm.verts.new(c + rr * (math.cos(ang) * u + math.sin(ang) * v)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 or len(b) == 1:
            tip, ring = (a[0], b) if len(a) == 1 else (b[0], a)
            for k in range(segs):
                bm.faces.new((ring[k], ring[(k + 1) % segs], tip))
            continue
        for k in range(segs):
            bm.faces.new((a[k], a[(k + 1) % segs], b[(k + 1) % segs], b[k]))
    if cap0 and len(rings[0]) > 1:
        bm.faces.new(list(reversed(rings[0])))
    if cap1 and len(rings[-1]) > 1:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, mat, par)


def ribbon(name, pts, normals, width, thick, mat, closed=False, par=None):
    """A flat band along `pts`, facing `normals`, given depth by a solidify modifier."""
    bm = bmesh.new()
    n = len(pts)
    left, right = [], []
    for i in range(n):
        p, nr = Vector(pts[i]), Vector(normals[i]).normalized()
        a = Vector(pts[(i - 1) % n] if closed else pts[max(i - 1, 0)])
        b = Vector(pts[(i + 1) % n] if closed else pts[min(i + 1, n - 1)])
        side = (b - a).cross(nr).normalized()
        w = width[i] if isinstance(width, (list, tuple)) else width
        left.append(bm.verts.new(p + side * w / 2))
        right.append(bm.verts.new(p - side * w / 2))
    for i in range(n if closed else n - 1):
        j = (i + 1) % n
        bm.faces.new((left[i], left[j], right[j], right[i]))
    ob = mesh_obj(name, bm, mat, par)
    mod = ob.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = thick
    mod.offset = 1
    return ob


def star(bm, center, normal, size, points=5, depth=0.012, spin=0.0):
    u, v = ring_basis(Vector(normal))
    n = Vector(normal).normalized()
    outline = []
    for k in range(points * 2):
        ang = math.pi * k / points + spin
        r = size if k % 2 == 0 else size * 0.42
        outline.append(Vector(center) + r * (math.cos(ang) * v + math.sin(ang) * u))
    front = [bm.verts.new(p + n * depth) for p in outline]
    back = [bm.verts.new(p) for p in outline]
    mid = bm.verts.new(Vector(center) + n * depth * 1.6)
    m = len(outline)
    for k in range(m):
        bm.faces.new((front[k], front[(k + 1) % m], mid))
        bm.faces.new((back[k], back[(k + 1) % m], front[(k + 1) % m], front[k]))


def at_angle(r, z, ang, out=0.0):
    rr = r + out
    return Vector((rr * math.sin(ang), -rr * math.cos(ang), z))


reset()
robe = material('main', '#5a30c4', rough=0.8)
team = material('team', '#ffffff', rough=0.6)
gold = material('gold', '#e8b648', rough=0.35, metal=0.7)
skin = material('skin', '#ece9f4', rough=0.7, emit='#ece9f4', strength=0.25)
shade = material('shade', '#17132b', rough=0.9)
leather = material('leather', '#4a2c1c', rough=0.8)
wood = material('wood', '#3e2618', rough=0.85)
eyes = material('eyes', '#4cc8ff', emit='#4cc8ff', strength=3.5)
orbm = material('orb', '#fff2c0', emit='#ffd77a', strength=5)
spark = material('spark', '#d9e8ff', emit='#8fb4ff', strength=6)

# Robe: a faceted bell whose hem folds in and out, flaring wide like the panel.
HEM = 12
PROFILE = [(0.0, 0.41, 0.06), (0.07, 0.385, 0.05), (0.3, 0.29, 0.03), (0.5, 0.215, 0.01), (0.66, 0.2, 0), (0.74, 0.19, 0), (0.8, 0.15, 0), (0.86, 0.09, 0)]
tube('robe', [((0, 0, z), r, w) for z, r, w in PROFILE], robe, segs=HEM, axis=(0, 0, 1), cap0=True, cap1=True)


def robe_r(z):
    for (z0, r0, _), (z1, r1, _) in zip(PROFILE, PROFILE[1:]):
        if z0 <= z <= z1:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return PROFILE[-1][1]


# Team panel down the open front of the robe, between two gold edges.
zs = [0.52, 0.4, 0.28, 0.16, 0.05, 0.015]
front_pts = [Vector((0, -robe_r(z) - 0.012, z)) for z in zs]
front_n = [Vector((0, -1, 0.25)) for _ in zs]
ribbon('panel', front_pts, front_n, [0.07, 0.11, 0.15, 0.2, 0.25, 0.26], 0.01, team)
for s in (-1, 1):
    edge = [Vector((s * w / 2, -robe_r(z) - 0.016, z)) for z, w in zip(zs, [0.07, 0.11, 0.15, 0.2, 0.25, 0.26])]
    ribbon(f'edge{s}', edge, front_n, 0.03, 0.014, gold)

# Gold hem following the folds.
tube('hem', [((0, 0, -0.002), 0.41 + 0.01), ((0, 0, 0.065), 0.388 + 0.01)], gold, segs=HEM, axis=(0, 0, 1), wob=0.055, cap0=False, cap1=False)

# Belt with a gold buckle.
belt = [at_angle(robe_r(0.53) + 0.012, 0.53, 2 * math.pi * k / 16) for k in range(16)]
ribbon('belt', belt, [Vector((p.x, p.y, 0)) for p in belt], 0.055, 0.015, leather, closed=True)
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1)
bmesh.ops.scale(bm, vec=(0.075, 0.03, 0.07), verts=bm.verts)
bmesh.ops.translate(bm, vec=(0, -robe_r(0.53) - 0.03, 0.53), verts=bm.verts)
# Stars scattered on the robe, front and back, in the same gold.
for ang, z, size in ((0.9, 0.16, 0.05), (-0.85, 0.12, 0.042), (2.4, 0.18, 0.055), (3.5, 0.12, 0.05), (4.3, 0.3, 0.04), (2.9, 0.42, 0.035), (-1.6, 0.36, 0.035), (1.7, 0.33, 0.04)):
    r = robe_r(z)
    star(bm, at_angle(r + 0.004, z, ang), Vector((math.sin(ang), -math.cos(ang), 0.35)), size, spin=ang)
mesh_obj('trim', bm, gold)

# Collar: a stiff gold-edged cone around the neck.
tube('collar', [((0, 0.01, 0.78), 0.15), ((0, 0.02, 0.88), 0.18)], robe, segs=10, cap0=False, cap1=False)
col = [Vector((0, 0.02, 0.88)) + 0.18 * Vector((math.sin(a), -math.cos(a), 0)) for a in (2 * math.pi * k / 10 for k in range(10))]
ribbon('collartrim', col, [Vector((p.x, p.y - 0.02, 0)) for p in col], 0.025, 0.01, gold, closed=True)

# Capelet over the shoulders with a gold edge, broadening the silhouette like the panel's mantle.
tube('capelet', [((0, 0.01, 0.84), 0.15), ((0, 0.015, 0.74), 0.24, 0.03), ((0, 0.02, 0.64), 0.27, 0.05)], robe, segs=10, cap0=False, cap1=False)
tube('capetrim', [((0, 0.02, 0.635), 0.278), ((0, 0.02, 0.665), 0.268)], gold, segs=10, axis=(0, 0, 1), wob=0.05, cap0=False, cap1=False)

# Boots peeking under the hem.
for s in (-1, 1):
    tube(f'boot{s}', [((s * 0.1, -0.2, 0.0), 0.065), ((s * 0.1, -0.2, 0.06), 0.06), ((s * 0.1, -0.13, 0.06), 0.06)], shade, segs=6)

# Head: pale face with a shadowed mask and glowing eyes, white tufts under the brim.
HEAD = 0.98
head = empty('head', (0, 0, HEAD))
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.165, location=(0, -0.025, HEAD))
h = bpy.context.object
h.scale = (1.05, 0.95, 0.92)
parent(assign(flat(h), skin), head)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.07, location=(0, -0.13, HEAD + 0.005))
mask = bpy.context.object
mask.scale = (1.7, 0.6, 0.6)
parent(assign(flat(mask), shade), head)
for s in (-1, 1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.034, location=(s * 0.058, -0.178, HEAD + 0.005))
    e = bpy.context.object
    e.scale = (1.0, 0.5, 1.25)
    parent(assign(flat(e), eyes), head)
    for k, (dz, dx, ln) in enumerate(((0.0, 0.14, 0.08), (-0.05, 0.13, 0.07), (0.03, 0.12, 0.05))):
        tube(f'tuft{s}{k}', [((s * dx, 0.0 + k * 0.03, HEAD + 0.05 + dz), 0.035), ((s * (dx + ln), 0.03 + k * 0.03, HEAD - 0.02 + dz - 0.04), 0)], skin, segs=4, par=head)
glow((0, -0.17, HEAD), '#7fdcff', 0.28, head, 'glow-eyes')

# Hat: wide wavy brim, tall faceted cone whose tip flops back and to one side, team band, star jewel.
hat = empty('hat', (0, 0, 1.08))
tube('brim', [((0, 0.0, 1.17), 0.21), ((0, 0.0, 1.12), 0.45, 0.025), ((0, 0.0, 1.095), 0.45, 0.025), ((0, 0.0, 1.13), 0.21)], robe, segs=20, axis=(0, 0, 1), cap0=False, cap1=False, par=hat)
cone = []
for i in range(9):
    t = i / 8
    z = 1.14 + 0.62 * t
    bend = t ** 2.4
    c = (0.1 * bend, 0.3 * bend - 0.02 * t, z - 0.12 * t ** 5)
    r = 0.235 * (1 - t) ** 0.9 + 0.012 * (1 - t)
    cone.append((c, 0 if i == 8 else r))
tube('cone', cone, robe, segs=9, cap0=True, cap1=False, twist=0.25, par=hat)
tube('band', [((0, 0.0, 1.14), 0.248), ((0.002, 0.01, 1.24), 0.218)], team, segs=9, cap0=False, cap1=False, twist=0.25, par=hat)
bm = bmesh.new()
star(bm, (0, -0.245, 1.19), (0, -1, 0.12), 0.06, points=4, depth=0.02, spin=math.pi / 4)
parent(mesh_obj('jewel', bm, gold), hat)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.026, location=(0, -0.265, 1.19))
parent(assign(flat(bpy.context.object), spark), hat)
# Two team ribbons trail from the back of the band over the brim, so the team reads from behind.
for s in (-1, 1):
    tail = [Vector(p) for p in ((s * 0.05, 0.23, 1.2), (s * 0.07, 0.36, 1.15), (s * 0.085, 0.455, 1.11), (s * 0.1, 0.47, 1.0), (s * 0.115, 0.46, 0.88))]
    ribbon(f'tail{s}', tail, [Vector((0, 1, 0.6)), Vector((0, 0.5, 1)), Vector((0, 1, 0.4)), Vector((0, 1, 0)), Vector((0, 1, -0.1))], [0.075, 0.08, 0.08, 0.085, 0.09], 0.012, team, par=hat)
loop(hat, 'rotation_euler', 0, [0.0, 0.035, 0.0, -0.025], 120)

# Arms: flared sleeves with gold cuffs and white gloves. The right hand is held out palm up with a spell; the left
# holds the staff.
HOLD = Vector((0.34, -0.1, 0.6))
OPEN = Vector((-0.36, -0.2, 0.6))
cuffs = {}
for s, hand_at in ((1, HOLD), (-1, OPEN)):
    sh = Vector((s * 0.17, 0.0, 0.73))
    wrist = hand_at - (hand_at - sh).normalized() * 0.05
    mid = sh.lerp(wrist, 0.5) + Vector((0, 0, -0.02))
    tube(f'sleeve{s}', [(sh, 0.08), (mid, 0.09), (wrist, 0.13)], robe, segs=7, cap0=True, cap1=False)
    tube(f'cuff{s}', [(wrist - (hand_at - sh).normalized() * 0.012, 0.133), (wrist + (hand_at - sh).normalized() * 0.012, 0.136)], gold, segs=7, cap0=False, cap1=False)
    cuffs[s] = (wrist, hand_at - sh)
GRIP = fist(*cuffs[1], Vector((0, 0, 1)), 0.026, skin, right=False, size=0.014, sides=5, smooth=False)
CAST = hand(*cuffs[-1], Vector((0, 0, 1)), skin, right=True, curl=0.45, size=0.014, sides=5, smooth=False) + Vector((0, 0, 0.04))

# Spell sparks circling above the open palm.
orbit = empty('orbit', CAST + Vector((0, 0, 0.02)))
bm = bmesh.new()
for k in range(3):
    a = 2 * math.pi * k / 3
    star(bm, CAST + Vector((0.085 * math.cos(a), 0.085 * math.sin(a), 0.02 + 0.03 * math.sin(2 * a))), (0, 0, 1), 0.03, points=4, depth=0.01)
parent(mesh_obj('sparks', bm, spark), orbit)
spin(orbit, 2, 60)
glow(CAST + Vector((0, 0, 0.02)), '#8fb4ff', 0.3, None, 'glow-hand')

# Staff: the weapon, held at the grip, crowned by a glowing orb inside spinning armillary rings.
weapon = empty('weapon', GRIP)
tube('shaft', [((GRIP.x, GRIP.y, 0.02), 0.022), ((GRIP.x, GRIP.y, 0.62), 0.026), ((GRIP.x, GRIP.y, 1.38), 0.028), ((GRIP.x, GRIP.y, 1.47), 0.04)], wood, segs=6, par=weapon)
TOP = Vector((GRIP.x, GRIP.y, 1.6))
tube('cradle', [((GRIP.x, GRIP.y, 1.45), 0.045), ((GRIP.x, GRIP.y, 1.5), 0.03)], gold, segs=6, par=weapon)
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.075, location=TOP)
parent(assign(flat(bpy.context.object), orbm), weapon)
arm = empty('armillary', TOP, weapon)
for k, (rx, rz) in enumerate(((math.pi / 2, 0.0), (math.pi / 2, math.pi / 2), (0.35, 0.0))):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.12 - k * 0.012, minor_radius=0.011, major_segments=14, minor_segments=4, location=TOP, rotation=(rx, 0, rz))
    parent(assign(flat(bpy.context.object), gold), arm)
spin(arm, 2, 96)
glow(TOP, '#ffd77a', 0.55, weapon, 'glow-orb')


def merge():
    """Joins meshes that share a parent and a material, applying modifiers first, to keep the draw count low."""
    deps = bpy.context.evaluated_depsgraph_get()
    groups = {}
    for ob in [o for o in bpy.data.objects if o.type == 'MESH']:
        if ob.modifiers:
            me = bpy.data.meshes.new_from_object(ob.evaluated_get(deps))
            ob.modifiers.clear()
            ob.data = me
        groups.setdefault((ob.parent, ob.active_material.name), []).append(ob)
    for (_, mat), obs in groups.items():
        if len(obs) > 1:
            with bpy.context.temp_override(active_object=obs[0], selected_editable_objects=obs):
                bpy.ops.object.join()
        obs[0].name = mat if obs[0].parent is None else f'{obs[0].parent.name}-{mat}'


merge()
finish()
