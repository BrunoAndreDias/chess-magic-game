"""The Astromancer, an Eclipse Seer of the Last Almanac. A snug indigo hood frames a smooth gold mask
engraved with one closed eye, behind it a tall stiff fan collar lined in the team colour, and round the head an
armillary of three tilted gold rings turning about a small eclipsed sun (a black disc in a lilac corona). A violet robe
flares to the ground over a dark hem embroidered with a gold star chart; a team sash at the waist. The right hand holds
an astrolabe sceptre, a flat engraved disc on a slender rod; the left hand is raised with a planet hovering over it,
and star shards drift round the body. Painted by lookdev and baked from a high-poly twin."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bmesh
import bpy
from mathutils import Matrix, Vector, noise
from common import *
from lookdev import bake, hi, mark, paint

reset()


def creases(stretch, depth):
    def relief(co, n, mask):
        v = noise.noise(Vector((co.x * stretch[0], co.y * stretch[1], co.z * stretch[2])))
        return depth * (0.5 - abs(v)) * 2
    return relief


def hammered(co, n, mask):
    return 0.0008 * noise.noise(co * 60)


CLOTH = creases((9, 9, 1.6), 0.004)
MAIN = paint('main', '#5a30c4', '#1a0a4a', '#9a7aee', rough=0.85, edge=0.6, mottle=0.1, streak=0.6, grime=0.0,
             accent='#1c1240', keep=True, relief=CLOTH)
TEAM = paint('team', '#d8d8d8', '#6c6c6c', '#ffffff', rough=0.9, streak=0.5, mottle=0.06, accent='#9a9a9a', keep=True,
             relief=creases((3, 3, 26), 0.004))
HOODC = paint('hood', '#2a1a5c', '#08041a', '#5a46a0', rough=0.9, edge=0.7, streak=0.4, mottle=0.1,
              relief=creases((6, 6, 6), 0.003))
DARK = paint('robe_dark', '#1c1240', '#06040e', '#3a2a70', rough=0.9, streak=0.5, relief=CLOTH)
GOLD = paint('gold', '#e8b648', '#5a340c', '#fff4c0', metal=True, cavity=0.4, edge=1.0, mottle=0.06, relief=hammered)
DULL = paint('dull_gold', '#a07a28', '#2a1404', '#e8c870', metal=True, cavity=0.4, edge=1.0, mottle=0.05)
ENAMEL = paint('enamel', '#241650', '#0a0620', '#4a3a8a', cavity=0.5, edge=0.6, mottle=0.06)
SKIN = paint('skin', '#e6cbb8', '#8a5e58', '#fff0e4', cavity=0.6, edge=0.3, mottle=0.05)
GLOVE = SKIN
MASKM = paint('mask', '#e8b648', '#7a4c14', '#fff0b0', metal=True, cavity=0.6, edge=1.0, mottle=0.04, texel=3)
INLAY = paint('mask_inlay', '#3a2008', '#120800', '#8a5a20', metal=True, cavity=0.3, edge=0.8, mottle=0.04, texel=3)
SPIRIT = paint('spirit', '#a888f0', '#2a1a60', '#e6d8ff', cavity=0.2, edge=0.0, mottle=0.06, accent='#000000', keep=True)
GEM = paint('gem', '#b08cff', '#4a2a9a', '#efe4ff', cavity=0.2, edge=0.4, mottle=0.04, glow=0.9)
VOID = void()

LILAC = '#c9a8ff'


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


def grid(name, rows, cols, at, mat, levels=1, mask=None, wrap=False):
    """A sheet of `rows` x `cols` vertices placed by `at(i, j)`; `wrap` closes it into a tube."""
    verts, faces, marks = [], [], []
    for i in range(rows):
        for j in range(cols):
            verts.append(at(i, j))
            marks.append(mask(i, j) if mask else 0.0)
    span = cols if wrap else cols - 1
    for i in range(rows - 1):
        for j in range(span):
            k = (j + 1) % cols
            faces.append((i * cols + j, i * cols + k, (i + 1) * cols + k, (i + 1) * cols + j))
    ob = build(name, verts, faces, mat, levels)
    if mask:
        mark(ob, lambda co, it=iter(marks): next(it))
    return ob


def lathe(name, rings, sides, mat, sy=1.0, phase=0.0, close_top=False, close_bottom=False, shape=None, mask=None, levels=0):
    """Rings of (radius, z) swept about z. `shape(i, j, x, y, z)` may move each vertex (ring i, side j);
    `mask(i, j)` writes the accent attribute."""
    def at(i, j):
        r, z = rings[i]
        a = phase + 2 * math.pi * j / sides
        x, y = r * math.sin(a), -r * math.cos(a) * sy
        return Vector(shape(i, j, x, y, z) if shape else (x, y, z))
    ob = grid(name, len(rings), sides, at, mat, levels, mask, wrap=True)
    n = len(rings) - 1
    if close_bottom or close_top:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bm.verts.ensure_lookup_table()
        if close_bottom:
            bm.faces.new([bm.verts[j] for j in reversed(range(sides))])
        if close_top:
            bm.faces.new([bm.verts[n * sides + j] for j in range(sides)])
        bm.to_mesh(ob.data)
        bm.free()
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
    if not hasattr(radii, '__len__'):
        radii = [radii] * len(path)
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


def ribbon(name, path, widths, side, mat, thickness=0.022, belly=0.012, notch=0.0, mask=None, levels=1):
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
    ob = solidify(build(name, verts, faces, mat, levels), thickness, 0)
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


def interp(table, z):
    """Linear lookup in a list of (value, z) pairs ordered by z, either way."""
    pts = sorted(table, key=lambda p: p[1])
    if z <= pts[0][1]:
        return pts[0][0]
    for (r0, z0), (r1, z1) in zip(pts, pts[1:]):
        if z <= z1:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return pts[-1][0]


def hand(center, around, wrap):
    """A gloved hand: a palm and four knuckled fingers curling about `around` (a direction), closing on a grip of
    radius `wrap`."""
    side = around.cross(Vector((0, -1, 0))).normalized()
    blob('palm', center + side * (wrap + 0.016), 0.027, GLOVE, scale=(0.7, 1.0, 1.15), subdiv=3)
    for k in range(4):
        h = (k - 1.5) * 0.017
        arc = [center + around * h + (side * math.cos(a) + around.cross(side) * math.sin(a)) * (wrap + 0.008)
               for a in [math.radians(d) for d in (10, 70, 130, 185)]]
        sweep('finger', arc, [0.0105, 0.0095, 0.009, 0.007], 6, GLOVE)
        blob('knuckle', arc[1], 0.011, GLOVE, subdiv=1)
    thumb = [center + side * (wrap + 0.012) + Vector((0, -0.02, 0.02)), center + Vector((0, -wrap - 0.012, 0.022))]
    sweep('thumb', thumb, [0.011, 0.008], 6, GLOVE)


def torus(name, loc, rot, major, minor, mat, segs=48, minor_segs=6):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=segs,
                                     minor_segments=minor_segs, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    return assign(smooth(ob), mat)


def facing(c):
    """Maps a lathe's (x, y, z) onto a disc centred at `c` whose axis points along -Y, so its face looks forward."""
    return lambda i, j, x, y, z: (c.x + x, c.y - z, c.z + y)


breath = loop(empty('breath'), 'scale', 2, [1.0, 1.012], 96)

# Robe: a narrow waist that flares to a wide hem lying on the ground, so the figure stands like a bell of cloth. The
# hem is a dark band (the accent) between two gold lips, embroidered with a star chart.
ROBE_R = [(0.37, 0.012), (0.36, 0.06), (0.34, 0.12), (0.325, 0.165), (0.31, 0.2), (0.27, 0.32), (0.225, 0.46),
          (0.185, 0.58), (0.165, 0.66), (0.17, 0.76), (0.182, 0.85), (0.178, 0.92), (0.15, 0.98), (0.1, 1.02),
          (0.075, 1.04)]
SY = 0.86
RSIDES = 36
HEM_TOP = 0.18


def robe_fold(a, z):
    return 1 + 0.1 * smoothstep(0.6, 0.0, z) * (0.6 * math.sin(7 * a + 0.4) + 0.4 * math.sin(12 * a + 1.3))


def robe_at(u, z, out=0.0):
    a = 2 * math.pi * u
    r = (interp(ROBE_R, z) + out) * robe_fold(a, z)
    return Vector((r * math.sin(a), -r * SY * math.cos(a), z))


def robe_front(x, z, out=0.0):
    r = interp(ROBE_R, z) + out
    return Vector((x, -math.sqrt(max(r * r - x * x, 0.0)) * SY, z))


def robe_shape(i, j, x, y, z):
    k = robe_fold(2 * math.pi * j / RSIDES, z)
    return (x * k, y * k, z)


lathe('robe', ROBE_R, RSIDES, MAIN, sy=SY, shape=robe_shape, levels=1,
      mask=lambda i, j: float(ROBE_R[i][1] < HEM_TOP))
HEM = [k / 240 for k in range(241)]
RIM = [2 * math.pi * k / 48 for k in range(49)]
sweep('hem_lip', [robe_at(u, 0.02, 0.006) for u in HEM[::2]], 0.014, 8, GOLD, caps=False)
sweep('hem_band', [robe_at(u, HEM_TOP + 0.004, 0.004) for u in HEM[::2]], 0.008, 6, GOLD, caps=False)

# The star chart: constellations of gold stars joined by fine threads, drawn on the hem band. Positions come from a
# fixed hash, so every build embroiders the same sky.


def hashf(k, s):
    return (math.sin(k * 12.9898 + s * 78.233) * 43758.5453) % 1.0


for c in range(9):
    u0 = c / 9 + 0.02
    stars = [(u0 + 0.075 * hashf(c * 7 + k, 1), 0.055 + 0.1 * hashf(c * 7 + k, 2)) for k in range(4 + c % 3)]
    stars.sort()
    pts = [robe_at(u, z, 0.006) for u, z in stars]
    for k, p in enumerate(pts):
        big = hashf(c * 7 + k, 3) > 0.6
        hi(blob('chart_star', p, 0.009 if big else 0.0055, GOLD, scale=(1, 1, 1), subdiv=1))
        if big:
            for a in range(4):
                t = a * math.pi / 2
                d = Vector((math.cos(t) * 0.02, 0, math.sin(t) * 0.02))
                hi(sweep('chart_ray', [p, p + d], [0.004, 0.001], 4, GOLD))
    for a, b in zip(pts, pts[1:]):
        hi(sweep('chart_thread', [a.lerp(b, t / 6) for t in range(7)], 0.0018, 4, GOLD))

# A dark front panel runs from the throat to the hem band, piped in gold and sown with a few stars, so the robe has a
# spine of value under the bright mask. An eclipse brooch pins it at the throat.
PANEL = [0.2 + 0.73 * k / 14 for k in range(15)]


def panel_w(z):
    return 0.05 + 0.09 * smoothstep(0.95, 0.2, z)


def on_robe(x, z, out):
    """The robe's surface, folds and all, at sideways offset x across its front."""
    u = math.asin(max(-1.0, min(1.0, x / interp(ROBE_R, z)))) / (2 * math.pi)
    return robe_at(u, z, out)


solidify(grid('panel', 15, 7, lambda i, j: on_robe(panel_w(PANEL[i]) * (j / 3 - 1), PANEL[i], 0.005), DARK, levels=1),
         0.005, offset=-1.0)
for sx in (-1, 1):
    sweep('panel_piping', [on_robe(sx * panel_w(z), z, 0.008) for z in PANEL], 0.0045, 6, GOLD)
for k, (x, z) in enumerate(((0.02, 0.86), (-0.03, 0.78), (0.035, 0.52), (-0.05, 0.42), (0.01, 0.34), (0.06, 0.27),
                            (-0.07, 0.25))):
    hi(blob('panel_star', on_robe(x, z, 0.012), 0.008 if k % 2 else 0.006, GOLD, subdiv=1))
BR = robe_front(0, 0.925, 0.03)
torus('brooch', BR, (math.pi / 2, 0, 0), 0.03, 0.009, GOLD, segs=24, minor_segs=6)
blob('brooch_disc', BR + Vector((0, 0.002, 0)), 0.026, VOID, scale=(1, 0.35, 1), subdiv=2)
# On the back, the order's sigil: an eclipse in a ring of rays, embroidered in gold.
SIG = Vector((0, 0, 0.74))
SIGP = lambda x, z: Vector((x, math.sqrt(max(interp(ROBE_R, z) ** 2 - x * x, 0.0)) * SY + 0.005, z))
hi(sweep('sigil_ring', [SIGP(0.05 * math.cos(t), SIG.z + 0.05 * math.sin(t)) for t in RIM], 0.004, 6, GOLD))
for k in range(12):
    t = 2 * math.pi * k / 12
    L = 0.09 if k % 3 == 0 else 0.07
    hi(sweep('sigil_ray', [SIGP(0.058 * math.cos(t), SIG.z + 0.058 * math.sin(t)),
                           SIGP(L * math.cos(t), SIG.z + L * math.sin(t))], [0.004, 0.0012], 4, GOLD))

# The team sash: a broad band round the waist knotted on the left hip, two tails falling down the robe.
lathe('sash', [(0.163, 0.6), (0.176, 0.61), (0.178, 0.68), (0.168, 0.69)], 32, TEAM, sy=SY)
knot = robe_front(0.1, 0.645, 0.02)
blob('sash_knot', knot, 0.032, TEAM, scale=(1.1, 0.8, 1.0), subdiv=2)
for dx, length in ((0.02, 0.38), (0.065, 0.3)):
    path = [robe_front(0.1 + dx * k / 5, 0.62 - length * k / 5, 0.022 + 0.004 * k) for k in range(6)]
    ribbon('sash_tail', path, [0.05, 0.052, 0.054, 0.056, 0.058, 0.06], (1, 0, 0), TEAM, thickness=0.012,
           belly=0.004, notch=0.03, mask=lambda i: float(i == 5))

# The high stiff collar: a fan rising behind the head and flaring out, deep indigo outside, team-lined, piped in gold
# along its pointed rim.
C_LO, C_HI = 0.95, 1.29
C_SPAN = 1.85
C_COLS = 25


def collar_at(i, j, out=0.0):
    t = i / 4
    a = math.pi + C_SPAN * (2 * j / (C_COLS - 1) - 1)
    r = 0.105 + 0.14 * t ** 1.4 + out
    tip = 0.035 * (1 - abs(((j / 3) % 2) - 1)) * t
    z = C_LO + (C_HI - C_LO) * t + tip + 0.03 * t * math.cos(a - math.pi) - 0.04 * t * (1 - math.cos(a - math.pi))
    return Vector((r * math.sin(a), -0.02 - r * math.cos(a) * 0.9, z))


collar = grid('collar', 5, C_COLS, collar_at, HOODC, levels=1)
solidify(collar, 0.012, offset=1.0, inner=TEAM)
sweep('collar_rim', [collar_at(4, j, 0.004) for j in range(C_COLS)], 0.007, 6, GOLD)
for j in (0, C_COLS - 1):
    sweep('collar_edge', [collar_at(i, j, 0.0) for i in range(5)], 0.007, 6, GOLD)
for j in range(3, C_COLS - 3, 3):
    hi(sweep('collar_rib', [collar_at(i, j, 0.003) for i in range(5)], 0.003, 4, GOLD))

# The head: a snug indigo hood with an oval opening onto the void, and in it a smooth gold mask engraved with one
# closed eye: she sees the future, not the present.
before_head = set(bpy.data.objects)
HC = Vector((0, -0.02, 1.2))
HOOD = [(0.09, 1.0), (0.11, 1.05), (0.132, 1.1), (0.143, 1.16), (0.146, 1.22), (0.14, 1.28), (0.124, 1.33),
        (0.096, 1.37), (0.052, 1.395), (0.0, 1.402)]
HSY = 0.96
OW, OZ, OH = 0.1, 1.19, 0.12


def in_face(c):
    return c.y < HC.y - 0.06 and (c.x / OW) ** 2 + ((c.z - OZ) / OH) ** 2 < 1


hood = lathe('hood', HOOD, 32, HOODC, sy=HSY, phase=math.pi / 32, levels=1,
             shape=lambda i, j, x, y, z: (x, y + HC.y, z))
drop_faces(hood, lambda c: not in_face(c))
solidify(hood, 0.02, inner=VOID)
blob('void', (0, HC.y + 0.02, 1.2), 0.12, VOID, scale=(1.0, 0.9, 1.05))


def hood_front(x, z, out=0.0):
    r = interp(HOOD, z) + out
    return Vector((x, HC.y - math.sqrt(max(r * r - x * x, 0.0)) * HSY, z))


rim = [hood_front(OW * 1.05 * math.cos(t), OZ + OH * 1.05 * math.sin(t), 0.004) for t in RIM]
sweep('hood_rim', rim, 0.014, 8, HOODC, caps=False)
hi(sweep('hood_piping', [hood_front(OW * 1.28 * math.cos(t), OZ + OH * 1.22 * math.sin(t), 0.006) for t in RIM],
         0.0035, 6, GOLD, caps=False))

M = Vector((0, -0.124, 1.185))
MW, MH = 0.084, 0.104


def mheight(x, z):
    u, v = x / MW, z / MH
    rr = u * u + v * v
    dome = 0.03 * max(0.0, 1 - u * u) ** 0.7 + 0.01 * max(0.0, 1 - v * v)
    nose = 0.008 * math.exp(-(x / 0.009) ** 2) * smoothstep(0.03, 0.0, z) * smoothstep(-0.05, -0.03, z)
    brow = 0.004 * math.exp(-((z - 0.03) / 0.012) ** 2)
    return dome + nose + brow - 0.02 * smoothstep(0.75, 1.0, rr)


def on_mask(x, z, out=0.0):
    return Vector((M.x + x, M.y - mheight(x, z) - out, M.z + z))


def mask_at(i, j, n=16):
    a, b = -1 + 2 * j / (n - 1), -1 + 2 * i / (n - 1)
    x, z = a * math.sqrt(1 - b * b / 2) * MW, b * math.sqrt(1 - a * a / 2) * MH
    return on_mask(x * (1 - 0.15 * smoothstep(0.0, -MH, z)), z)


grid('mask', 16, 16, mask_at, MASKM, levels=1)
# The closed eye: a lid line bowed down like a sleeper's, lashes hanging from it, a lilac tear beneath.
EYE_Z = 0.012
lid = [on_mask(x, EYE_Z - 0.012 * (1 - (x / 0.034) ** 2), 0.001) for x in [-0.034 + 0.068 * k / 12 for k in range(13)]]
sweep('eye_lid', lid, [0.0026 + 0.0018 * math.sin(math.pi * k / 12) for k in range(13)], 6, INLAY)
for k in range(1, 12, 2):
    x = -0.034 + 0.068 * k / 12
    z = EYE_Z - 0.012 * (1 - (x / 0.034) ** 2)
    hi(sweep('lash', [on_mask(x, z, 0.0015), on_mask(x * 1.15, z - 0.013, 0.001)], [0.0022, 0.0008], 4, INLAY))
for t in [math.radians(d) for d in (20, 55, 90, 125, 160)]:
    hi(sweep('brow_ray', [on_mask(0.045 * math.cos(t), EYE_Z + 0.012 + 0.03 * math.sin(t), 0.0012),
                          on_mask(0.06 * math.cos(t), EYE_Z + 0.012 + 0.05 * math.sin(t), 0.0008)],
             [0.0018, 0.0008], 4, INLAY))
TEAR = on_mask(0.0, -0.03, 0.004)
blob('tear', TEAR, 0.009, GEM, scale=(0.8, 0.5, 1.2), subdiv=2)
glow(TEAR + Vector((0, -0.02, 0)), LILAC, 0.06, name='glow_tear')

# The head tips back a little, proud, and so the mask turns up to a camera looking down on the board.
NECKP = Vector((0, -0.02, 1.02))
tip = Matrix.Translation(NECKP) @ Matrix.Rotation(-0.2, 4, 'X') @ Matrix.Translation(-NECKP)
for ob in set(bpy.data.objects) - before_head:
    ob.matrix_world = tip @ ob.matrix_world

# Sleeves: wide bell sleeves, their dark hems piped in gold. The right hand holds the sceptre; the left is raised,
# palm up, with a small planet hovering over it.
ARMS = {
    'r': (Vector((-0.16, 0.0, 0.93)), Vector((-0.27, -0.02, 0.72)), Vector((-0.29, -0.14, 0.78)),
          (0.058, 0.06, 0.064, 0.07, 0.076, 0.084, 0.09), 5),
    'l': (Vector((0.16, 0.0, 0.93)), Vector((0.29, 0.0, 0.76)), Vector((0.29, -0.13, 0.9)),
          (0.058, 0.06, 0.064, 0.07, 0.076, 0.084, 0.09), 5),
}
for sd, (s, e, w, radii, hem) in ARMS.items():
    path = bezier(s, s.lerp(e, 0.8), e.lerp(w, 0.3), w + (w - e) * 0.08, 6)
    sl = sweep(f'sleeve_{sd}', path, radii, 14, MAIN, caps=False, levels=1, mask=lambda i, hem=hem: float(i >= hem))
    solidify(sl, 0.012, inner=DARK)
    sl.modifiers['solid'].use_even_offset = False
    _, fr = frames(path)
    cuff = [path[-1] + (fr[-1][0] * math.cos(a) + fr[-1][1] * math.sin(a)) * (radii[-1] + 0.002)
            for a in [2 * math.pi * k / 40 for k in range(41)]]
    sweep('cuff', cuff, 0.006, 6, GOLD, caps=False)

RIGHT_HAND = Vector((-0.3, -0.225, 0.8))
LEFT_HAND = Vector((0.29, -0.215, 0.97))
POLE = Vector((-0.04, 0.0, 1.0)).normalized()
hand(RIGHT_HAND, POLE, 0.013)
blob('wrist', RIGHT_HAND + Vector((0.01, 0.04, -0.01)), 0.03, SKIN, subdiv=2)
blob('palm_l', LEFT_HAND, 0.03, SKIN, scale=(1.1, 1.2, 0.55), subdiv=2)
for k in range(4):
    a = math.radians(-50 + 33 * k)
    base = LEFT_HAND + Vector((0.026 * math.sin(a), -0.026 * math.cos(a), 0.004))
    sweep('finger_l', [base, base + Vector((0.026 * math.sin(a), -0.026 * math.cos(a), 0.016))], [0.009, 0.006], 6,
          SKIN)
sweep('thumb_l', [LEFT_HAND + Vector((-0.024, -0.004, 0.0)), LEFT_HAND + Vector((-0.042, -0.02, 0.018))],
      [0.009, 0.006], 6, SKIN)

planet = empty('planet', LEFT_HAND + Vector((0, 0, 0.12)))
P = planet.location.copy()
parent(blob('planet_body', P, 0.035, GEM, subdiv=3), planet)
parent(torus('planet_ring', P, (math.radians(70), math.radians(20), 0), 0.056, 0.004, GOLD, segs=32, minor_segs=4),
       planet)
glow(P, LILAC, 0.14, planet, name='glow_planet')
loop(planet, 'location', 2, [P.z, P.z + 0.025], 72)
spin(planet, axis=2, period=144)

# The armillary: an eclipsed sun floats over the head, a black disc in a lilac corona, and three gold rings tilted at
# different angles turn about it, each carrying a bead so the turning shows. The whole sphere wheels slowly.
AC = Vector((0, -0.02, 1.63))
arm = empty('armillary', AC)
spin(arm, axis=2, period=240)
loop(arm, 'location', 2, [AC.z, AC.z + 0.02], 96)


def ring(k, centre, r, rot, thick, period, turns, band=False, owner=None):
    """A gold ring about `centre` tilted by `rot`, turning in its own plane and carrying a bead so the turn shows.
    The tilt is set after its children are parented, so their parent inverse does not cancel it."""
    tilt = empty(f'ring_tilt{k}', centre, owner)
    turn = parent(empty(f'ring_turn{k}', centre), tilt)
    if band:
        parent(lathe('ecliptic', [(r - 0.005, centre.z - 0.013), (r + 0.005, centre.z - 0.013),
                                  (r + 0.005, centre.z + 0.013), (r - 0.005, centre.z + 0.013)], 64, GOLD,
                     shape=lambda i, j, x, y, z: (x + centre.x, y + centre.y, z)), turn)
        for m in range(12):
            a = 2 * math.pi * m / 12
            parent(hi(box('ecliptic_tick', (centre.x + (r + 0.006) * math.sin(a), centre.y - (r + 0.006) * math.cos(a),
                                            centre.z), (0.004, 0.004, 0.022), DULL, rot=(0, 0, a))), turn)
    else:
        parent(torus(f'ring{k}', centre, (0, 0, 0), r, thick, GOLD, segs=40), turn)
    parent(blob('ring_bead', centre + Vector((r, 0, 0)), 0.018 + 0.006 * band, GEM if k % 2 else GOLD, subdiv=2), turn)
    spin(turn, axis=2, period=period, turns=turns)
    tilt.rotation_euler = rot
    return tilt


ring(0, AC, 0.165, (math.radians(70), 0, 0), 0.0065, 120, 1, owner=arm)
ring(1, AC, 0.15, (math.radians(62), 0, math.radians(90)), 0.0055, 96, -1, owner=arm)
ring(2, AC, 0.19, (math.radians(23), math.radians(8), 0), 0.0, 168, 1, band=True, owner=arm)
# A wide halo ring rides round the crown of the hood, tying the floating sphere to the head.
HALO = Vector((0, -0.02, 1.39))
halo = ring(3, HALO, 0.21, (math.radians(9), math.radians(6), 0), 0.0075, 200, -1)

sun = parent(empty('sun', AC), arm)
parent(blob('sun_disc', AC, 0.052, VOID, subdiv=3), sun)
parent(torus('sun_rim', AC + Vector((0, 0.004, 0)), (math.pi / 2 - 0.5, 0, 0), 0.058, 0.004, DULL, segs=32,
             minor_segs=4), sun)
# The corona: a flat burst of rays behind the disc, tilted back to meet a camera looking down on the board. It is
# spirit light, so it adds lilac to whatever is behind it and fades to clear at the ray tips.
RAYS = 16
CORONA_COLS = RAYS * 2


def corona_at(i, j):
    a = 2 * math.pi * j / CORONA_COLS
    reach = (0.105 if (j // 2) % 2 else 0.085) if j % 2 == 0 else 0.07
    r = (0.05, 0.068, reach)[i]
    v = Vector((r * math.cos(a), 0.012, r * math.sin(a)))
    v.rotate(Matrix.Rotation(-0.5, 3, 'X'))
    return AC + v


corona = grid('corona', 3, CORONA_COLS, corona_at, SPIRIT, levels=0, mask=lambda i, j: (0.0, 0.25, 1.0)[i], wrap=True)
parent(corona, sun)
glow(AC + Vector((0, 0.03, 0)), LILAC, 0.34, sun, name='glow_corona')

# The astrolabe sceptre: the weapon pivots at the right-hand grip. A slender enamel rod in gold ferrules, and on top a
# flat gold astrolabe facing forward: an engraved enamel plate, a cut-out rete that turns over it, and a crescent crown.
weapon = empty('weapon', RIGHT_HAND)


def part(ob):
    return parent(ob, weapon)


def pole_at(z):
    return RIGHT_HAND + POLE * ((z - RIGHT_HAND.z) / POLE.z)


TOP = 1.36
part(sweep('rod', [pole_at(0.06), pole_at(0.8), pole_at(TOP)], [0.011, 0.013, 0.012], 8, ENAMEL))
part(sweep('butt', [pole_at(0.02), pole_at(0.06)], [0.006, 0.016], 8, GOLD))
for z, h in ((0.06, 0.02), (0.74, 0.025), (0.86, 0.025), (TOP - 0.03, 0.04)):
    part(sweep('ferrule', [pole_at(z), pole_at(z + h / 2), pole_at(z + h)], [0.015, 0.019, 0.015], 10, GOLD))
part(blob('knop', pole_at(TOP + 0.015), 0.024, GOLD, scale=(1, 1, 0.8), subdiv=2))
DR = 0.12
DC = pole_at(TOP + 0.03 + DR)
mater = part(lathe('mater', [(0.0, 0.012), (DR - 0.012, 0.012), (DR, 0.008), (DR + 0.006, 0.0), (DR, -0.01), (0.0, -0.012)], 40,
           GOLD, shape=facing(DC), levels=1))
bm = bmesh.new()
bm.from_mesh(mater.data)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
bm.to_mesh(mater.data)
bm.free()
part(lathe('plate', [(DR - 0.016, 0.01), (DR - 0.02, 0.017), (0.0, 0.017)], 40, ENAMEL, shape=facing(DC)))
for k in range(36):
    a = 2 * math.pi * k / 36
    L = 0.016 if k % 3 == 0 else 0.008
    part(hi(sweep('limb_tick', [DC + Vector(((DR - 0.004) * math.cos(a), -0.019, (DR - 0.004) * math.sin(a))),
                                DC + Vector(((DR - 0.004 - L) * math.cos(a), -0.019, (DR - 0.004 - L) * math.sin(a)))],
                  0.0018, 4, DULL)))
for r, dz in ((0.03, 0.02), (0.05, 0.012), (0.07, 0.004)):
    part(hi(sweep('almucantar', [DC + Vector((r * math.cos(t), -0.0185, dz + r * math.sin(t)))
                                 for t in [2 * math.pi * k / 40 for k in range(41)]], 0.0016, 4, DULL)))
rete = part(empty('rete', DC))
RET = DC + Vector((0, -0.026, 0))
parent(torus('rete_ring', RET + Vector((0, 0, 0.022)), (math.pi / 2, 0, 0), 0.07, 0.0045, GOLD, segs=36, minor_segs=4),
       rete)
parent(torus('rete_hub', RET, (math.pi / 2, 0, 0), 0.016, 0.0045, GOLD, segs=16, minor_segs=4), rete)
for k in range(6):
    a = 2 * math.pi * k / 6 + 0.3
    tip = RET + Vector((0.088 * math.cos(a), 0, 0.088 * math.sin(a)))
    parent(sweep('rete_pointer', [RET + Vector((0.018 * math.cos(a), 0, 0.018 * math.sin(a))), tip],
                 [0.0045, 0.002], 6, GOLD), rete)
    parent(blob('rete_star', tip, 0.007, GEM, subdiv=1), rete)
spin(rete, axis=1, period=192)
part(sweep('rule', [DC + Vector((-DR * 0.95, -0.028, 0)), DC + Vector((DR * 0.95, -0.028, 0))], 0.005, 6, GOLD))
part(torus('shackle', DC + Vector((0, 0, DR + 0.018)), (math.pi / 2, 0, 0), 0.018, 0.005, GOLD, segs=16, minor_segs=4))
CR = DC + Vector((0, 0, DR + 0.06))
part(sweep('crescent', [CR + Vector((0.05 * math.cos(t), 0, 0.05 * math.sin(t) - 0.01))
                        for t in [math.radians(d) for d in range(200, 341, 10)]],
           [0.003 + 0.009 * math.sin(math.pi * k / 14) for k in range(15)], 6, GOLD))
part(glow(DC + Vector((0, -0.04, 0)), LILAC, 0.16, name='glow_astrolabe'))

# Star shards and two small planets drift round the body, each on its own bob, the whole flock wheeling slowly.
flock = empty('flock')
spin(flock, axis=2, period=288, turns=-1)
DRIFT = ((0.6, 0.5, 0.42, 'shard'), (1.9, 0.82, 0.44, 'shard'), (2.9, 0.36, 0.46, 'planet'), (3.7, 1.02, 0.4, 'shard'),
         (4.6, 0.6, 0.45, 'shard'), (5.5, 0.28, 0.44, 'planet'))
for k, (a, z, r, kind) in enumerate(DRIFT):
    p = Vector((r * math.sin(a), -r * math.cos(a) * 0.9, z))
    bob = parent(empty(f'drift{k}', p), flock)
    if kind == 'shard':
        ob = blob('shard', p, 0.042, SPIRIT, scale=(0.45, 0.45, 1.6), subdiv=1)
        flat(ob)
        ob.rotation_euler = (0.3 * k, 0.2 * k, 0.5 * k)
        parent(ob, bob)
        spin(bob, axis=2, period=72 + 12 * k)
    else:
        parent(blob('planet_small', p, 0.026, GOLD if k == 2 else ENAMEL, subdiv=2), bob)
        parent(torus('planet_small_ring', p, (1.2, 0.3, 0), 0.042, 0.003, GOLD, segs=24, minor_segs=4), bob)
    loop(bob, 'location', 2, [z, z + 0.035 * (1 + k % 2)], 60 + 12 * k)

for ob in list(bpy.data.objects):
    if ob.parent is None and ob not in (breath, flock):
        parent(ob, breath)

meshes = bake(fill='#3a1e8a')
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
print(f'astromancer: {tris} triangles, {len(meshes)} meshes')
finish()
