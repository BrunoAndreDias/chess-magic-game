"""The Bellringer: a monk of the Unslept Hour whose great helm is a brass bell. A team band rings the bell's waist, the
hanging loop crowns it, and an arch cut into its front opens onto shadow, where a bronze mask with eyes etched wide open
burns amber. A squared ochre mantle with brass piping over a dark umber robe, two team stoles down the front pinned by
a clock-face clasp, a hem embroidered with hourglasses, an hourglass at the hip and prayer beads with a little bell in
the left hand. The right hand holds a shepherd's crook whose hook hangs a lantern-bell. Smooth subdivided forms,
painted by lookdev and baked from a high-poly twin."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bmesh
import bpy
from mathutils import Vector, noise
from common import *
from lookdev import bake, hi, mark, paint

reset()


def creases(stretch, depth):
    """Ridged noise stretched by `stretch`: long folds and creases that read as cloth, not as felt."""
    def relief(co, n, mask):
        v = noise.noise(Vector((co.x * stretch[0], co.y * stretch[1], co.z * stretch[2])))
        return depth * (0.5 - abs(v)) * 2
    return relief


def grain(scale, depth):
    def relief(co, n, mask):
        return depth * noise.noise(co * scale)
    return relief


def hammered(co, n, mask):
    return 0.0012 * noise.noise(co * 38) + 0.0006 * noise.noise(co * 110)


# Three values keep the warm palette apart: bright brass on top, ochre mantle in the middle, a dark umber robe below.
CLOTH = creases((9, 9, 1.6), 0.004)
MAIN = paint('main', '#ad7a2c', '#3a1f06', '#e8b45a', rough=0.85, edge=0.8, mottle=0.12, streak=0.6, grime=0.2,
             accent='#f5cc52', keep=True, relief=CLOTH)
TEAM = paint('team', '#d8d8d8', '#6c6c6c', '#ffffff', rough=0.9, streak=0.5, mottle=0.06, accent='#9a9a9a', keep=True,
             relief=creases((3, 3, 26), 0.004))
ROBE = paint('robe', '#4a2c14', '#120a04', '#7c5432', rough=0.9, edge=0.7, streak=0.6, mottle=0.12, grime=0.4,
             relief=CLOTH)
DARK = paint('robe_dark', '#2a1a0c', '#0a0603', '#4a3020', rough=0.9, streak=0.5, grime=0.4, relief=CLOTH)
LEATHER = paint('leather', '#5e3b22', '#24130b', '#a8784a', edge=0.9, mottle=0.14, relief=grain(45, 0.0012))
GLOVE = paint('glove', '#4a2e1a', '#1a0d06', '#8a6040', edge=0.9, mottle=0.1, relief=grain(60, 0.0008))
BRASS = paint('brass', '#e0a830', '#2a1402', '#fff0a8', metal=True, cavity=0.5, edge=1.0, mottle=0.06, relief=hammered)
GOLD = paint('trim', '#f0c050', '#5a340c', '#fff6c8', metal=True, cavity=0.35, edge=1.0, mottle=0.06)
DULL = paint('dull_brass', '#9a6a1c', '#2a1404', '#e8c070', metal=True, cavity=0.4, edge=1.0, mottle=0.05)
# Blackened bronze, so the amber eyes carry the face and the honed brass rim outlines it against the void.
MASK = paint('mask', '#5a3414', '#160a02', '#c08a48', metal=True, cavity=0.6, edge=0.6, mottle=0.05,
             relief=grain(90, 0.0004))
WOOD = paint('oak', '#8a5a2e', '#2e180a', '#c8925a', streak=1.0, mottle=0.2, edge=0.6, relief=creases((70, 70, 5), 0.0015))
BEAD = paint('bead', '#5a2a14', '#1c0a04', '#b06a3a', edge=0.8, mottle=0.08)
# Glass and sand glow with their own colour: kept saturated and dim, so they read amber, not as a pale white blot.
GLASS = paint('lantern_glass', '#c85a06', '#5a1c02', '#ff9a20', cavity=0.1, edge=0.0, mottle=0.06, glow=0.9)
SAND = paint('sand', '#d87818', '#6a2c06', '#ffb040', cavity=0.2, edge=0.3, mottle=0.08, glow=0.9)
VOID = void()
# Emission at 1 is exactly amber; the game has no tone mapping, so anything stronger clips toward white.
EYES = material('eyes', '#3a1800', rough=0.5, emit='#ff9a18', strength=1.0)

AMBER = '#ffb640'

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


def link(name, loc, rot, mat, size=0.011):
    bpy.ops.mesh.primitive_torus_add(major_radius=size, minor_radius=size * 0.28, major_segments=8, minor_segments=4,
                                     location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
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


def stitches(path, normal, mat=LEATHER, length=0.012, gap=0.008, radius=0.0022):
    """Bake-only running stitches along `path`, raised along `normal(p)`."""
    pts, marks, d = [Vector(p) for p in path], [], 0.0
    for a, b in zip(pts, pts[1:]):
        seg = (b - a).length
        while d < seg:
            p = a.lerp(b, d / seg)
            q = a.lerp(b, min(1.0, (d + length) / seg))
            n = normal(p) * 0.002
            marks.append(hi(sweep('stitch', [p + n, q + n], radius, 4, mat, squash=0.6)))
            d += length + gap
        d -= seg
    return marks



def chain(top, drop, sway, count):
    """Links hanging from `top` along a shallow curve; returns the point under the last link."""
    pts = bezier(top, top + Vector((sway * 0.3, -0.01, -drop * 0.4)), top + Vector((sway, -0.01, -drop * 0.75)),
                 top + Vector((sway, 0, -drop)), count)
    for k, p in enumerate(pts[:-1]):
        d = (pts[k + 1] - p).normalized()
        yaw = 0.0 if k % 2 else math.pi / 2
        ob = link('chain_link', p.lerp(pts[k + 1], 0.5), (0, 0, yaw), DULL)
        ob.rotation_euler = d.to_track_quat('Y', 'Z').to_euler()
        ob.rotation_euler.rotate_axis('Y', yaw)
    return pts[-1]


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


def fist(center, around, wrap, back):
    """A gloved fist closed on a pole along `around` of radius `wrap`: the back of the hand on the `back` side, four
    knuckled fingers wrapping the far side and coming round to meet the thumb."""
    back = (back - around * back.dot(around)).normalized()
    q = back.cross(around)
    blob('palm', center + back * (wrap + 0.018), 0.03, GLOVE, scale=(1.0, 0.7, 1.25), subdiv=3)
    for k in range(4):
        h = (0.75 - 0.5 * k) * 0.038
        arc = [center + around * h + (back * math.cos(a) + q * math.sin(a)) * (wrap + 0.011)
               for a in [math.radians(d) for d in (20, 75, 135, 200, 265, 300)]]
        sweep('finger', arc, [0.013, 0.0125, 0.012, 0.0115, 0.0105, 0.008], 6, GLOVE)
        blob('knuckle', arc[1], 0.0135, GLOVE, subdiv=1)
    thumb = [center + back * (wrap + 0.02) + around * 0.045,
             center + (back * math.cos(-0.9) + q * math.sin(-0.9)) * (wrap + 0.012) + around * 0.05,
             center + (back * math.cos(-1.6) + q * math.sin(-1.6)) * (wrap + 0.01) + around * 0.04]
    sweep('thumb', thumb, [0.013, 0.011, 0.008], 6, GLOVE)


breath = loop(empty('breath'), 'scale', 2, [1.0, 1.015], 96)

# Robe: long and closed, narrow at the waist, falling straight to a heavy hem that pools a little at the feet.
ROBE_R = [(0.325, 0.03), (0.31, 0.1), (0.275, 0.26), (0.235, 0.44), (0.198, 0.6), (0.182, 0.7), (0.186, 0.8),
          (0.196, 0.9), (0.198, 0.98), (0.17, 1.06), (0.12, 1.11)]
SY = 0.84
RSIDES = 36
TEAR = (0.0, 0.02, 0.006, 0.0, 0.03, 0.01, 0.0, 0.016, 0.024)


def robe_fold(a, z):
    return 1 + 0.12 * smoothstep(0.62, 0.0, z) * (0.6 * math.sin(8 * a + 0.4) + 0.4 * math.sin(13 * a + 1.3))


def robe_at(u, z, out=0.0):
    a = 2 * math.pi * u
    r = (interp(ROBE_R, z) + out) * robe_fold(a, z)
    return Vector((r * math.sin(a), -r * SY * math.cos(a), z))


def robe_front(x, z, out=0.0):
    r = interp(ROBE_R, z) + out
    return Vector((x, -math.sqrt(max(r * r - x * x, 0.0)) * SY, z))


def robe_shape(i, j, x, y, z):
    k = robe_fold(2 * math.pi * j / RSIDES, z)
    return (x * k, y * k, z + (TEAR[j % len(TEAR)] if i == 0 else 0.0))


lathe('robe', ROBE_R, RSIDES, ROBE, sy=SY, shape=robe_shape, levels=1)
for u in (0.25, 0.5, 0.75):
    stitches([robe_at(u, z, 0.002) for z in [0.2 + 0.64 * k / 30 for k in range(31)]],
             lambda p: Vector((p.x, p.y, 0)).normalized(), mat=DARK)

# The hem: two lines of brass piping and between them a row of hourglasses, the hours the order has kept. Each glyph is
# drawn in the hem's own surface frame (along the hem, and up), so all of them come out the same upright shape.
HEM = [k / 200 for k in range(201)]
for z in (0.085, 0.18):
    hi(sweep('hem_piping', [robe_at(u, z, 0.004) for u in HEM], 0.0035, 6, GOLD))
GLYPHS = 26
for k in range(GLYPHS):
    u = (k + 0.5) / GLYPHS
    c = robe_at(u, 0.1325, 0.005)
    along = (robe_at(u + 0.002, 0.1325, 0.005) - robe_at(u - 0.002, 0.1325, 0.005)).normalized() * 0.016
    up = Vector((0, 0, 0.026))
    tl, tr, bl, br = c - along + up, c + along + up, c - along - up, c + along - up
    for a, b in ((tl, tr), (bl, br), (tl, br), (tr, bl)):
        hi(sweep('hem_glass', [a, b], 0.0026, 4, GOLD))
    hi(blob('hem_sand', c - up * 0.55, 0.0045, GOLD, scale=(1.6, 1, 0.8), subdiv=1))
for sx in (-0.09, 0.09):
    box('boot', (sx, -0.25, 0.035), (0.1, 0.12, 0.07), LEATHER, bevel=0.03, segments=2)

# Squared mantle: a stiff short cape whose cross-section is a rounded square, so the shoulders read flat and wide and
# stand out under the bell's lip.
MANT = [(0.285, 0.8), (0.3, 0.87), (0.305, 0.95), (0.29, 0.99), (0.22, 1.02), (0.13, 1.05)]


def drop(a, z):
    """How far the mantle hangs below its profile: a little at the front, a cape panel at the back that carries the
    sigil clear of the bell's lip."""
    return (0.035 * abs(math.cos(a)) ** 6 + 0.09 * max(0.0, -math.cos(a)) ** 3) * smoothstep(0.95, 0.8, z)


def square(i, j, x, y, z):
    a = math.atan2(x, -y)
    k = (abs(math.cos(a)) ** 8 + abs(math.sin(a)) ** 8) ** -0.125
    wide = 1 + 0.12 * smoothstep(0.8, 0.96, z) * abs(math.sin(a))
    return (x * k * wide, y * min(k, 1.15), z - drop(a, z))


mantle = lathe('mantle', MANT, 32, MAIN, sy=0.68, shape=square, levels=1, mask=lambda i, j: float(i == 0))
solidify(mantle, 0.018, inner=DARK)


def mantle_at(a, z, out=0.0):
    r = interp(MANT, z) + out
    return Vector(square(1, 0, r * math.sin(a), -r * math.cos(a) * 0.68, z))


RING = [2 * math.pi * k / 160 for k in range(161)]
for z in (0.815, 0.84):
    hi(sweep('mantle_piping', [mantle_at(a, z, 0.006) for a in RING], 0.004, 6, GOLD))
hi(sweep('mantle_scroll', [mantle_at(a, 0.8275 + 0.008 * math.sin(a * 30), 0.008) for a in RING], 0.003, 6, GOLD))
# On the back of the mantle, below the bell's lip, the order's sigil: an hourglass inside a ring, embroidered in brass.
SIG = mantle_at(math.pi, 0.9, 0.008)
hi(sweep('sigil_ring', [SIG + Vector((0.055 * math.cos(t), 0, 0.055 * math.sin(t)))
                        for t in [2 * math.pi * k / 48 for k in range(49)]], 0.005, 6, GOLD))
for a, b in (((-0.027, 0.038), (0.027, -0.038)), ((0.027, 0.038), (-0.027, -0.038)), ((-0.027, 0.038), (0.027, 0.038)),
             ((-0.027, -0.038), (0.027, -0.038))):
    hi(sweep('sigil', [SIG + Vector((a[0], 0, a[1])), SIG + Vector((b[0], 0, b[1]))], 0.005, 6, GOLD))

# The great helm is the bell: hammered brass, a thick flared lip resting over the mantle, raised bands at the sound bow
# and the waist, and the bell's mouth cut open at the front as an arch onto shadow.
# Its profile is (radius, height above the lip), so the whole helm sits wherever LIP puts it.
LIP = 1.0
BELL = [(r, LIP + h) for r, h in (
    (0.29, -0.015), (0.305, 0.0), (0.307, 0.02), (0.298, 0.045), (0.278, 0.075), (0.255, 0.11), (0.232, 0.155),
    (0.213, 0.205), (0.199, 0.255), (0.189, 0.305), (0.182, 0.355), (0.178, 0.405), (0.175, 0.445), (0.171, 0.485),
    (0.162, 0.525), (0.145, 0.56), (0.115, 0.587), (0.07, 0.603), (0.0, 0.609))]
W, ZC, ZTOP = 0.14, LIP + 0.14, LIP + 0.34


def bell_r(z):
    return interp(BELL[:-1], z)


def opening(x, z):
    if abs(x) >= W:
        return False
    return z < ZC or (x / W) ** 2 + ((z - ZC) / (ZTOP - ZC)) ** 2 < 1


helm = drop_faces(lathe('helm', BELL, 32, BRASS, phase=math.pi / 32, levels=1), lambda c: c.y >= 0 or not opening(c.x, c.z))
bm = bmesh.new()
bm.from_mesh(helm.data)
# Snap the cut's ragged edge onto the arch, so the rim below sits flush all the way round.
for v in bm.verts:
    if v.is_boundary and v.co.y < -0.05 and v.co.z > LIP - 0.005 and abs(v.co.x) < W * 1.7:
        x, z = v.co.x, v.co.z
        if z < ZC:
            x = math.copysign(W, x)
        else:
            k = 1 / math.hypot(x / W, (z - ZC) / (ZTOP - ZC))
            x, z = x * k, ZC + (z - ZC) * k
        r = bell_r(z)
        v.co = Vector((x, -math.sqrt(max(r * r - x * x, 0.0)), z))
bm.to_mesh(helm.data)
bm.free()
# Its inside is the void: a lit lining would show through the arch as a shape around the mask.
solidify(helm, 0.03, inner=VOID)


def on_bell(a, z, out=0.0):
    r = bell_r(z) + out
    return Vector((r * math.sin(a), -r * math.cos(a), z))


def arch(t, out):
    """The opening's edge: straight sides from the lip up to ZC, then an elliptic arch."""
    if t < 1:
        x, z = -W, LIP + (ZC - LIP) * t
    elif t < 2:
        u = math.pi * (t - 1)
        x, z = -W * math.cos(u), ZC + (ZTOP - ZC) * math.sin(u)
    else:
        x, z = W, ZC - (ZC - LIP) * (t - 2)
    r = bell_r(z) + out
    return Vector((x, -math.sqrt(max(r * r - x * x, 0)), z))


sweep('helm_rim', [arch(3 * k / 40, 0.002) for k in range(41)], 0.012, 8, BRASS)
A0 = math.asin(W / bell_r(LIP + 0.015)) + 0.06
sweep('helm_lip', [on_bell(a, LIP + 0.01, 0.004) for a in [A0 + (2 * math.pi - 2 * A0) * k / 48 for k in range(49)]],
      0.02, 8, BRASS)
A1 = math.asin(W / bell_r(LIP + 0.115)) + 0.08
sweep('helm_bow', [on_bell(a, LIP + 0.095, 0.003) for a in [A1 + (2 * math.pi - 2 * A1) * k / 48 for k in range(49)]],
      0.009, 6, DULL)
for k in range(24):
    a = 2 * math.pi * (k + 0.5) / 24
    if abs(math.remainder(a, 2 * math.pi)) > A1:
        hi(blob('lip_rivet', on_bell(a, LIP + 0.06, 0.003), 0.007, DULL, subdiv=1))

# Team band round the bell's waist, the part of the figure read first at battle zoom, between two brass bands and
# studded with the twelve hours.
WAIST = (LIP + 0.395, LIP + 0.46)
lathe('helm_team', [(bell_r(WAIST[0]) - 0.002, WAIST[0] - 0.004), (bell_r(WAIST[0]) + 0.008, WAIST[0]),
                    (bell_r(WAIST[1]) + 0.008, WAIST[1]), (bell_r(WAIST[1]) - 0.002, WAIST[1] + 0.004)], 32, TEAM)
for z in (WAIST[0] - 0.006, WAIST[1] + 0.006):
    sweep('helm_band', [on_bell(a, z, 0.006) for a in [2 * math.pi * k / 48 for k in range(49)]], 0.008, 6, DULL,
          caps=False)
for k in range(12):
    blob('hour', on_bell(2 * math.pi * k / 12, sum(WAIST) / 2, 0.01), 0.009, GOLD, subdiv=1)

# The crown: the cast canons and the hanging loop, a team cord through it with two tails down the back.
lathe('canon', [(0.07, LIP + 0.59), (0.075, LIP + 0.61), (0.06, LIP + 0.63), (0.0, LIP + 0.635)], 16, DULL, levels=1)
bpy.ops.mesh.primitive_torus_add(major_radius=0.07, minor_radius=0.024, major_segments=20, minor_segments=8,
                                 location=(0, 0, LIP + 0.7), rotation=(math.pi / 2, 0, 0))
assign(smooth(bpy.context.object), BRASS).name = 'loop'
cords = empty('helm_cords', (0, 0.03, LIP + 0.64))
parent(sweep('cord_wrap', [Vector((0.07 * math.cos(t), 0.0, LIP + 0.7 + 0.07 * math.sin(t)))
                           for t in [-math.pi / 2 - 0.5 + 1.0 * k / 6 for k in range(7)]], 0.03, 8, TEAM, levels=1), cords)
for sx, drop in ((-1, 0.0), (1, 0.05)):
    zs = [LIP + 0.615 - (0.4 + drop) * k / 7 for k in range(8)]
    path = [on_bell(math.pi + sx * (0.12 + 0.25 * k / 7), z, 0.02 + 0.015 * k / 7) for k, z in enumerate(zs)]
    path[0] = Vector((sx * 0.02, 0.045, LIP + 0.655))
    parent(ribbon('cord_tail', path, [0.05, 0.055, 0.06, 0.065, 0.07, 0.075, 0.08, 0.08], (1, 0, 0), TEAM,
                  notch=0.03, mask=lambda i: 1.0 if i == 6 else 0.0), cords)
loop(cords, 'rotation_euler', 0, [0.0, 0.04, 0.0, -0.03], 72)
loop(cords, 'rotation_euler', 1, [0.0, 0.03, 0.0, -0.03], 96)

# Behind the arch: a void the lights cannot touch, and a plug of it filling the bell's mouth so a camera looking
# through the arch never sees the mantle's top below.
blob('void', (0, 0.045, LIP + 0.21), 0.17, VOID, scale=(1.0, 0.95, 1.15))
blob('void', (0, 0.0, LIP + 0.02), 0.2, VOID, scale=(1.35, 1.15, 0.35))

# The mask, set back in the dark: bronze, its eyes etched wide open and burning, a stitched mouth, and the hour hands
# engraved on its brow. A honed brass rim round its edge cuts it out of the shadow even at battle zoom.
M = Vector((0, -0.152, LIP + 0.19))
MW, MH = 0.078, 0.098
blob('mask', M, 0.1, MASK, scale=(MW / 0.1, 0.4, MH / 0.1), subdiv=3)
blob('mask_brow', M + Vector((0, -0.02, 0.03)), 0.078, MASK, scale=(1.0, 0.3, 0.3), subdiv=2)
sweep('mask_rim', [M + Vector((MW * 1.03 * math.sin(t), -0.014, MH * 1.03 * math.cos(t)))
                   for t in [2 * math.pi * k / 40 for k in range(41)]], 0.01, 6, GOLD, caps=False)
for sx in (-0.038, 0.038):
    e = M + Vector((sx, -0.04, 0.012))
    bpy.ops.mesh.primitive_torus_add(major_radius=0.029, minor_radius=0.005, major_segments=16, minor_segments=6,
                                     location=e, rotation=(math.pi / 2, 0, 0))
    assign(smooth(bpy.context.object), DULL).name = 'eye_ring'
    blob('eye', e + Vector((0, 0.002, 0)), 0.028, EYES, scale=(1, 0.4, 1), subdiv=2)
    for k in range(10):
        a = 2 * math.pi * k / 10
        d = Vector((math.cos(a), 0, math.sin(a)))
        hi(sweep('lash', [e + d * 0.036 + Vector((0, 0.002, 0)), e + d * 0.043 + Vector((0, 0.006, 0))],
                 [0.0045, 0.0022], 4, DULL))
    glow(e + Vector((0, -0.03, 0)), AMBER, 0.08, name='glow_eye')
hi(sweep('mouth', [M + Vector((-0.026, -0.036, -0.066)), M + Vector((0, -0.039, -0.07)), M + Vector((0.026, -0.036, -0.066))],
         0.003, 4, DULL))
for k in range(5):
    x = -0.02 + 0.01 * k
    hi(sweep('mouth_stitch', [M + Vector((x, -0.038, -0.06)), M + Vector((x, -0.04, -0.079))], 0.0022, 4, DULL))
hi(sweep('hour_hand', [M + Vector((0, -0.038, 0.045)), M + Vector((0, -0.034, 0.085))], 0.003, 4, DULL))
hi(sweep('minute_hand', [M + Vector((0, -0.038, 0.045)), M + Vector((0.03, -0.032, 0.075))], 0.0025, 4, DULL))

# Team stoles: two broad bands from under the bell, over the mantle and down the front of the robe.
for sx in (-1, 1):
    x = 0.075 * sx
    top = [Vector((x, -0.19, 1.0)), Vector((x * 1.05, -0.222, 0.95)), Vector((x * 1.05, -0.236, 0.86))]
    low = [robe_front(x * 1.08, z, 0.035) for z in (0.76, 0.62, 0.48, 0.36, 0.24, 0.14)]
    path = top + low
    ribbon('stole', path, [0.09] * len(path), (1, 0, 0), TEAM, thickness=0.016, belly=0.006, notch=0.03,
           mask=lambda i, n=len(path): 1.0 if i >= n - 2 else 0.0)
    for edge in (-1, 1):
        stitches([p + Vector((0.038 * edge, -0.011, 0)) for p in path[1:-1]], lambda p: Vector((0, -1, 0)), mat=TEAM)
    for z in (0.17, 0.2):
        hi(sweep('stole_band', [robe_front(x * 1.08 - 0.045, z, 0.05), robe_front(x * 1.08 + 0.045, z, 0.05)], 0.004, 4,
                 GOLD))
    blob('stole_fringe', robe_front(x * 1.08, 0.115, 0.045), 0.013, GOLD, subdiv=1)

# A brass clock-face clasp pins the stoles together on the chest, just under the bell's lip.
CL = Vector((0, -0.245, 0.925))
lathe('clasp', [(0.0, 0.012), (0.046, 0.01), (0.05, 0.0), (0.04, -0.008), (0.0, -0.01)], 20, GOLD,
      shape=lambda i, j, x, y, z: (CL.x + x, CL.y + z, CL.z + y))
for k in range(12):
    a = 2 * math.pi * k / 12
    hi(blob('clasp_tick', CL + Vector((0.036 * math.cos(a), -0.013, 0.036 * math.sin(a))), 0.004, DULL, subdiv=1))
hi(sweep('clasp_hand', [CL + Vector((0, -0.013, 0)), CL + Vector((0, -0.015, 0.028))], 0.0025, 4, DULL))
hi(sweep('clasp_hand', [CL + Vector((0, -0.013, 0)), CL + Vector((0.02, -0.015, -0.004))], 0.0025, 4, DULL))

# Belt: a plain leather strap, an hourglass hung on the right hip.
BELT_R = 0.19
lathe('belt', [(BELT_R - 0.003, 0.645), (BELT_R + 0.004, 0.652), (BELT_R + 0.004, 0.692), (BELT_R - 0.003, 0.699)], 32,
      LEATHER, sy=SY)
FRONT = -(BELT_R + 0.004) * SY - 0.012
for x in (-0.03, 0.03):
    box('buckle', (x, FRONT, 0.672), (0.012, 0.016, 0.06), GOLD, bevel=0.004)
for dz in (-0.025, 0.025):
    box('buckle_bar', (0, FRONT, 0.672 + dz), (0.07, 0.016, 0.012), GOLD, bevel=0.004)
end = chain(Vector((-0.135, -0.15, 0.645)), 0.05, -0.005, 3)
H = end - Vector((0, 0, 0.012))
hg = empty('hourglass', H)
for dz in (0.0, -0.13):
    parent(lathe('hourglass_plate', [(0.0, H.z + dz + 0.006), (0.04, H.z + dz + 0.006), (0.042, H.z + dz),
                                     (0.04, H.z + dz - 0.006), (0.0, H.z + dz - 0.006)], 12, GOLD,
                 shape=lambda i, j, x, y, z: (x + H.x, y + H.y, z)), hg)
for k in range(3):
    a = 2 * math.pi * k / 3 + 0.3
    p = Vector((H.x + 0.032 * math.sin(a), H.y - 0.032 * math.cos(a), 0))
    parent(sweep('hourglass_post', [Vector((p.x, p.y, H.z - 0.004)), Vector((p.x, p.y, H.z - 0.126))], 0.005, 6, WOOD), hg)
parent(lathe('hourglass_glass', [(0.0, H.z - 0.006), (0.026, H.z - 0.012), (0.024, H.z - 0.04), (0.006, H.z - 0.065),
                                 (0.024, H.z - 0.09), (0.026, H.z - 0.118), (0.0, H.z - 0.124)], 12, SAND,
             shape=lambda i, j, x, y, z: (x + H.x, y + H.y, z), levels=1), hg)
glow(H - Vector((0, 0, 0.09)), AMBER, 0.08, hg, name='glow_sand')
loop(hg, 'rotation_euler', 0, [0.0, 0.06, 0.0, -0.06], 72)

# Sleeves: wide and stiff, hemmed in brass. The right hand is raised to the crook; the left hangs with the prayer beads.
ARMS = {
    'r': (Vector((-0.2, 0.0, 0.99)), Vector((-0.36, -0.05, 0.77)), Vector((-0.335, -0.19, 0.93)),
          (0.07, 0.074, 0.078, 0.082, 0.08, 0.068, 0.05), 6),
    'l': (Vector((0.2, 0.0, 0.99)), Vector((0.262, 0.0, 0.8)), Vector((0.285, -0.06, 0.65)),
          (0.07, 0.074, 0.08, 0.09, 0.1, 0.112, 0.118), 5),
}
for side, (s, e, w, radii, hem) in ARMS.items():
    path = bezier(s, s.lerp(e, 0.8), e.lerp(w, 0.3), w + (w - e) * 0.08, 6)
    sl = sweep(f'sleeve_{side}', path, radii, 14, MAIN, caps=False, levels=1, mask=lambda i, hem=hem: float(i >= hem))
    solidify(sl, 0.014, inner=DARK)
    # Even thickness spikes where the raised arm folds sharply at the elbow.
    sl.modifiers['solid'].use_even_offset = side == 'l'
    _, fr = frames(path)
    cuff = [path[-2].lerp(path[-1], 0.2) + (fr[-1][0] * math.cos(a) + fr[-1][1] * math.sin(a)) * (radii[-1] - 0.006)
            for a in [2 * math.pi * k / 48 for k in range(49)]]
    hi(sweep('cuff_braid', cuff, 0.004, 6, DULL))

RIGHT_HAND = Vector((-0.325, -0.21, 0.97))
LEFT_HAND = Vector((0.295, -0.08, 0.6))
POLE = Vector((0.05, 0.0, 1.0)).normalized()
fist(RIGHT_HAND, POLE, 0.022, Vector((0.1, -1, 0)))
hand(LEFT_HAND, Vector((0, 0, 1)), 0.012)

# Prayer beads drop from the left hand in a long loop, with a small brass bell where the loop closes.
beads = empty('beads', LEFT_HAND)
loop_pts = bezier(LEFT_HAND + Vector((-0.012, -0.01, -0.02)), LEFT_HAND + Vector((-0.04, -0.02, -0.2)),
                  LEFT_HAND + Vector((0.05, -0.02, -0.22)), LEFT_HAND + Vector((0.014, -0.01, -0.02)), 22)
for k, p in enumerate(loop_pts[1:-1]):
    parent(blob('bead', p, 0.0115 if k % 6 else 0.016, GOLD if k % 6 == 0 else BEAD, subdiv=1), beads)
low = loop_pts[11]
for p in (low - Vector((0, 0, 0.03)), low - Vector((0, 0, 0.06))):
    parent(blob('bead', p, 0.0115, BEAD, subdiv=1), beads)
B = low - Vector((0, 0, 0.074))
parent(lathe('bead_bell', [(0.0, B.z + 0.004), (0.012, B.z), (0.016, B.z - 0.02), (0.024, B.z - 0.036), (0.0, B.z - 0.034)],
             10, GOLD, shape=lambda i, j, x, y, z: (x + B.x, y + B.y, z)), beads)
loop(beads, 'rotation_euler', 0, [0.0, 0.07, 0.0, -0.07], 80)
loop(beads, 'rotation_euler', 1, [0.0, -0.04, 0.0, 0.04], 120)

# The crook: the weapon pivots at the right-hand grip. Its hook curls out past the bell and hangs a lantern-bell.
weapon = empty('weapon', RIGHT_HAND)


def part(ob):
    return parent(ob, weapon)


def pole_at(z):
    return RIGHT_HAND + POLE * ((z - RIGHT_HAND.z) / POLE.z)


TOP_Z = 1.74
T = pole_at(TOP_Z)
part(sweep('shaft', [pole_at(0.03), pole_at(0.9), pole_at(TOP_Z)], [0.019, 0.022, 0.021], 10, WOOD))
part(sweep('butt', [pole_at(0.0), pole_at(0.02), pole_at(0.06)], [0.008, 0.026, 0.026], 10, GOLD))
for z, h in ((0.06, 0.03), (0.86, 0.025), (1.1, 0.025), (TOP_Z - 0.04, 0.05)):
    part(sweep('ferrule', [pole_at(z), pole_at(z + h / 2), pole_at(z + h)], [0.026, 0.03, 0.026], 12, GOLD))
side = POLE.cross(Vector((0, 1, 0))).normalized()
up = POLE.cross(side)
n = 12 * 8
helix = [pole_at(0.89 + 0.2 * t / n) + (side * math.cos(2 * math.pi * t / 8) + up * math.sin(2 * math.pi * t / 8)) * 0.024
         for t in range(n + 1)]
part(sweep('grip_wrap', [pole_at(0.89), pole_at(1.09)], 0.027, 10, LEATHER))
part(hi(sweep('grip_turn', helix, 0.0075, 6, LEATHER, squash=0.6)))
HOOK = bezier(T, T + Vector((0.0, 0, 0.2)), T + Vector((-0.27, 0, 0.24)), T + Vector((-0.27, 0, 0.04)), 16)
part(sweep('hook', HOOK, [0.021 - 0.006 * (i / 16) for i in range(17)], 10, WOOD))
for i in (5, 11):
    part(sweep('hook_band', [HOOK[i].lerp(HOOK[i + 1], 0.3), HOOK[i].lerp(HOOK[i + 1], 0.7)], 0.025, 12, GOLD))
part(blob('hook_tip', HOOK[-1], 0.02, GOLD, subdiv=2))
TIP = HOOK[-1]
swing = part(empty('lantern_swing', TIP))
L = TIP - Vector((0, 0, 0.1))
for ob in (
    link('lantern_ring', TIP - Vector((0, 0, 0.022)), (math.pi / 2, 0, 0), GOLD, size=0.014),
    limb('lantern_chain', TIP - Vector((0, 0, 0.03)), L + Vector((0, 0, 0.01)), 0.004, 0.004, DULL, sides=4),
    lathe('lantern_cap', [(0.0, L.z + 0.02), (0.022, L.z + 0.014), (0.04, L.z - 0.004), (0.046, L.z - 0.02),
                          (0.05, L.z - 0.03), (0.0, L.z - 0.03)], 14, GOLD,
          shape=lambda i, j, x, y, z: (x + L.x, y + L.y, z)),
    lathe('lantern_glass', [(0.0, L.z - 0.025), (0.048, L.z - 0.03), (0.056, L.z - 0.07), (0.068, L.z - 0.11),
                            (0.086, L.z - 0.15), (0.0, L.z - 0.15)], 14, GLASS,
          shape=lambda i, j, x, y, z: (x + L.x, y + L.y, z), levels=1),
    lathe('lantern_lip', [(0.085, L.z - 0.135), (0.094, L.z - 0.148), (0.09, L.z - 0.162), (0.078, L.z - 0.158)], 16, GOLD,
          shape=lambda i, j, x, y, z: (x + L.x, y + L.y, z)),
    blob('lantern_clapper', L - Vector((0, 0, 0.175)), 0.017, GOLD, subdiv=1),
):
    parent(ob, swing)
for k in range(6):
    a = 2 * math.pi * k / 6
    rib = [Vector((L.x + r * math.sin(a), L.y - r * math.cos(a), L.z + dz)) for r, dz in
           ((0.05, -0.028), (0.058, -0.07), (0.07, -0.11), (0.088, -0.142))]
    parent(sweep('lantern_rib', rib, 0.0075, 6, GOLD), swing)
glow(L - Vector((0, 0, 0.09)), AMBER, 0.5, swing, name='glow_lantern')
loop(swing, 'rotation_euler', 0, [0.0, 0.1, 0.0, -0.1], 72)
loop(swing, 'rotation_euler', 1, [0.0, -0.06, 0.0, 0.06], 108)

for ob in list(bpy.data.objects):
    if ob.parent is None and ob is not breath:
        parent(ob, breath)

meshes = bake(fill='#4a2c14')
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
print(f'bellringer: {tris} triangles, {len(meshes)} meshes')
finish()
