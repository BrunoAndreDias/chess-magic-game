"""The Bellringer: a monk of the Unslept Hour in a squared oxblood coif crowned by a belfry cap (a team band, a louvred
stage and a pyramid roof ribbed in brass under a finial), its face a carved brass mask buckled on at the temples that
stares out with amber eyes held open for ever, a sunburst of lashes round each. A short oxblood cape of hard pleats,
piped in brass, over a squared ochre mantle and a dark umber robe, two team stoles down the front pinned by a
clock-face clasp, a hem embroidered with hourglasses, an hourglass at the hip and prayer beads with a little bell in the
left hand. The right hand holds a shepherd's crook whose hook hangs a great brass bell, team ribbons knotted above it.
Smooth subdivided forms, painted by lookdev and baked from a high-poly twin."""
import math
import os
import sys
from functools import partial

sys.path.insert(0, os.path.dirname(__file__))
import bmesh
import bpy
from mathutils import Matrix, Vector, noise
from common import *
from hands import fist
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
COIFC = paint('coif', '#5a2216', '#160604', '#8e4a32', rough=0.9, edge=0.8, streak=0.4, mottle=0.12, grime=0.2,
              relief=creases((5, 5, 5), 0.003))
DARK = paint('robe_dark', '#2a1a0c', '#0a0603', '#4a3020', rough=0.9, streak=0.5, grime=0.4, relief=CLOTH)
LEATHER = paint('leather', '#5e3b22', '#24130b', '#a8784a', edge=0.9, mottle=0.14, relief=grain(45, 0.0012))
GLOVE = paint('glove', '#4a2e1a', '#1a0d06', '#8a6040', edge=0.9, mottle=0.1, relief=grain(60, 0.0008), texel=2)
BRASS = paint('brass', '#e0a830', '#2a1402', '#fff0a8', metal=True, cavity=0.5, edge=1.0, mottle=0.06, relief=hammered)
GOLD = paint('trim', '#f0c050', '#5a340c', '#fff6c8', metal=True, cavity=0.35, edge=1.0, mottle=0.06)
DULL = paint('dull_brass', '#9a6a1c', '#2a1404', '#e8c070', metal=True, cavity=0.4, edge=1.0, mottle=0.05)
WOOD = paint('oak', '#8a5a2e', '#2e180a', '#c8925a', streak=1.0, mottle=0.2, edge=0.6, relief=creases((70, 70, 5), 0.0015))
BEAD = paint('bead', '#5a2a14', '#1c0a04', '#b06a3a', edge=0.8, mottle=0.08)
# The throat and the sand glow with their own colour: kept saturated and dim, so they read amber, not as a pale white blot.
# The bell's throat glows with the hour it holds.
THROAT = paint('bell_throat', '#c85a06', '#5a1c02', '#ff9a20', cavity=0.3, edge=0.0, mottle=0.06, glow=0.9)
SAND = paint('sand', '#d87818', '#6a2c06', '#ffb040', cavity=0.2, edge=0.3, mottle=0.08, glow=0.9)

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


breath = loop(empty('breath'), 'scale', 2, [1.0, 1.015], 96)

# Robe: long and closed, narrow at the waist, falling straight to a heavy hem that pools a little at the feet. Its
# neck runs up under the cape.
ROBE_R = [(0.325, 0.03), (0.31, 0.1), (0.275, 0.26), (0.235, 0.44), (0.198, 0.6), (0.182, 0.7), (0.186, 0.8),
          (0.196, 0.9), (0.198, 0.98), (0.17, 1.06), (0.12, 1.08)]
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
# stand out under the cape.
MANT = [(0.285, 0.8), (0.3, 0.87), (0.305, 0.95), (0.29, 0.99), (0.22, 1.02), (0.13, 1.05)]


def drop(a, z):
    """How far the mantle hangs below its profile: a little at the front, a cape panel at the back that carries the
    sigil clear of the cape."""
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
# On the back of the mantle, below the cape, the order's sigil: an hourglass inside a ring, embroidered in brass.
SIG = mantle_at(math.pi, 0.9, 0.008)
hi(sweep('sigil_ring', [SIG + Vector((0.055 * math.cos(t), 0, 0.055 * math.sin(t)))
                        for t in [2 * math.pi * k / 48 for k in range(49)]], 0.005, 6, GOLD))
for a, b in (((-0.027, 0.038), (0.027, -0.038)), ((0.027, 0.038), (-0.027, -0.038)), ((-0.027, 0.038), (0.027, 0.038)),
             ((-0.027, -0.038), (0.027, -0.038))):
    hi(sweep('sigil', [SIG + Vector((a[0], 0, a[1])), SIG + Vector((b[0], 0, b[1]))], 0.005, 6, GOLD))

# The head is drawn at the mask's size and scaled up about the neck, mask and all, to balance the mantle.
HEAD_SCALE = 1.13
HY = -0.045
PIVOT = Vector((0, HY, 0.96))
before_head = set(bpy.data.objects)


def head_space(p):
    """Where a point drawn at the head's drawn size lands once the head is scaled."""
    return PIVOT + (Vector(p) - PIVOT) * HEAD_SCALE


# The mask: carved brass whose eyes are held open for ever. Each eye sits deep in a socket
# behind a dark brass rim, its amber iris lit from within round a pupil, and a sunburst of lashes radiates round it. The
# hour hands are inlaid on the brow and the mouth is a seam sewn shut. The mask's planes (brow, nose, cheeks, lips) are
# in its low-poly surface; the bake gives it three times the body's texel density, so it holds up close.
M = Vector((0, -0.152, 1.19))
MW, MH = 0.08, 0.098
EX, EZ, SOCKET = 0.038, 0.01, 0.028


def bump(t):
    return math.exp(-t * t)


def plane(x, z):
    """Height of the mask's carved planes above its back, before the sockets are cut."""
    u, v = x / MW, z / MH
    dome = 0.024 * max(0.0, 1 - u * u) ** 0.6 + 0.008 * max(0.0, 1 - v * v)
    brow = 0.005 * bump((z - EZ - 0.026) / 0.011) * smoothstep(MW * 0.95, MW * 0.6, abs(x))
    nose = (0.005 + 0.012 * smoothstep(EZ + 0.01, -0.03, z)) * bump(x / (0.008 + 0.004 * smoothstep(0, -0.03, z))) \
        * smoothstep(EZ + 0.025, EZ, z) * smoothstep(-0.045, -0.03, z)
    cheeks = 0.006 * bump(math.hypot((abs(x) - 0.045) / 0.018, (z + 0.026) / 0.014))
    lips = 0.004 * bump(x / 0.03) * bump((z + 0.064) / 0.014)
    return dome + brow + nose + cheeks + lips


def chin(z):
    return 1 - 0.16 * smoothstep(0.0, -MH, z)


def height(x, z):
    rr = (x / (MW * chin(z))) ** 2 + (z / MH) ** 2
    socket = math.hypot(abs(x) - EX, z - EZ)
    # The edge rolls back into the dark, so no camera sees behind the mask.
    return plane(x, z) - 0.014 * smoothstep(SOCKET + 0.004, SOCKET - 0.008, socket) - 0.02 * smoothstep(0.7, 1.0, rr)


def on_mask(x, z, out=0.0):
    return Vector((M.x + x, M.y - height(x, z) - out, M.z + z))


def mask_at(i, j, n=18):
    """The unit square mapped onto the mask's oval, so a quad grid covers it with no pole at the centre."""
    a, b = -1 + 2 * j / (n - 1), -1 + 2 * i / (n - 1)
    x, z = a * math.sqrt(1 - b * b / 2) * MW, b * math.sqrt(1 - a * a / 2) * MH
    return on_mask(x * chin(z), z)


def mouth_line(x):
    return -0.064 - 0.005 * (x / 0.028) ** 2


def seam(co, n, mask):
    """The high-poly twin's mouth, a seam cut into the brass, and a little hammering."""
    x, z = co.x - M.x, co.z - M.z
    return -0.006 * bump((z - mouth_line(x)) / 0.0022) * smoothstep(0.03, 0.024, abs(x)) + 0.0004 * noise.noise(co * 90)


MASK = paint('mask', '#b07a2c', '#6a4214', '#f6d07a', metal=True, cavity=0.6, edge=1.0, mottle=0.05, relief=seam,
             texel=3)
INLAY = paint('mask_inlay', '#6a4418', '#1e0e02', '#d8a858', metal=True, cavity=0.4, edge=1.0, mottle=0.05, texel=3)
# The iris emits its own baked colour at 0.9: the game has no tone mapping, so anything past 1 clips toward white.
EYES = paint('eyes', '#ffa41c', '#b84a04', '#ffd06a', cavity=0.7, edge=0.0, mottle=0.04, glow=0.9, texel=3)
PUPIL = paint('pupil', '#1a0800', '#080200', '#3a1404', cavity=0.0, edge=0.0, mottle=0.0)

grid('mask', 18, 18, mask_at, MASK, levels=1)
for sx in (-EX, EX):
    rim = Vector((M.x + sx, M.y - plane(sx, EZ), M.z + EZ))
    blob('eye', rim + Vector((0, 0.012, 0)), SOCKET * 0.95, EYES, scale=(1, 0.5, 1), subdiv=3)
    front = rim + Vector((0, 0.012 - SOCKET * 0.95 * 0.5, 0))

    def iris(r, t):
        return front + Vector((SOCKET * r * math.cos(t), 0.0006 + 0.0054 * r * r, SOCKET * r * math.sin(t)))
    # A dark pupil, limbal ring and fine streaks, so the iris reads as an eye, not a lamp.
    hi(blob('pupil', front - Vector((0, 0.0008, 0)), SOCKET * 0.24, PUPIL, scale=(1, 0.2, 1), subdiv=2))
    hi(sweep('limbus', [iris(0.86, 2 * math.pi * k / 40) for k in range(41)], 0.0018, 4, PUPIL, caps=False))
    for k in range(18):
        t = 2 * math.pi * k / 18
        hi(sweep('iris_streak', [iris(0.34, t), iris(0.7, t + 0.08)], [0.0007, 0.0004], 4, PUPIL))
    bpy.ops.mesh.primitive_torus_add(major_radius=SOCKET + 0.002, minor_radius=0.0055, major_segments=16, minor_segments=6,
                                     location=rim - Vector((0, 0.001, 0)), rotation=(math.pi / 2, 0, 0))
    assign(smooth(bpy.context.object), INLAY).name = 'eye_rim'
    r0, r1 = SOCKET + 0.008, SOCKET + 0.03
    for k in range(10):
        a = 2 * math.pi * (k + 0.5) / 10
        pts = [on_mask(sx + math.cos(a) * r, EZ + math.sin(a) * r, 0.0025 + 0.002 * (r1 - r) / (r1 - r0))
               for r in (r0, (r0 + r1) / 2, r1)]
        hi(sweep('lash', pts, [0.0052, 0.0034, 0.001], 4, INLAY, squash=0.7))
    glow(rim + Vector((0, -0.03, 0)), AMBER, 0.08, name='glow_eye')

for k in range(5):
    x = -0.022 + 0.011 * k
    z = mouth_line(x)
    hi(sweep('mouth_stitch', [on_mask(x, z + 0.008, 0.0004), on_mask(x, z, 0.0016), on_mask(x, z - 0.008, 0.0004)],
             0.0015, 4, INLAY))

HZ = EZ + 0.036
for dx, dz, r in ((0.0, 0.044, 0.0038), (0.014, 0.03, 0.003)):
    hi(sweep('clock_hand', [on_mask(dx * t, HZ + dz * t, 0.0016) for t in (0.0, 0.5, 1.0)], [r, r * 0.9, r * 0.35], 4,
             INLAY))
    hi(blob('hand_tip', on_mask(dx * 0.78, HZ + dz * 0.78, 0.0018), r * 1.4, INLAY, scale=(1, 0.5, 1), subdiv=1))
hi(blob('arbor', on_mask(0, HZ, 0.001), 0.0055, INLAY, scale=(1, 0.5, 1), subdiv=2))

# The head: a padded oxblood coif, squared like the Heights' helms, flat-topped and square in plan, that wraps the
# skull, the chin and the neck. Its face is cut nearly square for the mask, its edge a rolled hem, and the mask is
# buckled on by a leather strap at each temple. Its base runs down under the cape.
COIF = [(0.126, 1.03), (0.128, 1.065), (0.126, 1.09), (0.134, 1.12), (0.142, 1.15), (0.147, 1.18), (0.149, 1.21),
        (0.148, 1.24), (0.146, 1.27), (0.143, 1.3), (0.14, 1.33), (0.137, 1.36), (0.133, 1.385), (0.118, 1.4),
        (0.0, 1.405)]
CSY = 0.92
OW, OZ, OH = 0.096, 1.19, 0.108


def squircle(a, p):
    """How far a superellipse of exponent p reaches at angle a, against a circle: 1 at the axes, more at the corners."""
    return (abs(math.cos(a)) ** p + abs(math.sin(a)) ** p) ** (-1 / p)


def coif_at(a, z, out=0.0):
    """The coif's surface at angle `a` round the head (0 is the front) and height z: a rounded square in plan."""
    r = interp(COIF[:-1], z) + out
    k = squircle(a, 8)
    return Vector((r * k * math.sin(a), HY - r * k * CSY * math.cos(a), z))


def coif_front(x, z, out=0.0):
    """The point on the coif's front face at sideways offset x: the angle found by bisection."""
    lo, hi_ = -math.pi / 2, math.pi / 2
    for _ in range(40):
        mid = (lo + hi_) / 2
        if coif_at(mid, z, out).x < x:
            lo = mid
        else:
            hi_ = mid
    return coif_at((lo + hi_) / 2, z, out)


def face_hole(x, z):
    return abs(x / OW) ** 4 + abs((z - OZ) / OH) ** 4 < 1


def face_edge(t, out=0.0):
    """The face opening's edge at angle t, on the coif's surface."""
    k = squircle(t, 4)
    return coif_front(OW * math.cos(t) * k, OZ + OH * math.sin(t) * k, out)


def coif_shape(i, j, x, y, z):
    """Lathe rings onto the coif's rounded square, each ring's radius read as its height off the coif's profile."""
    return tuple(coif_at(math.atan2(x, -y), z, math.hypot(x, y) - interp(COIF[:-1], z)))


coif = drop_faces(lathe('coif', COIF, 32, COIFC, phase=math.pi / 32, shape=coif_shape, levels=1),
                  lambda c: c.y > HY - 0.05 or not face_hole(c.x, c.z))
bm = bmesh.new()
bm.from_mesh(coif.data)
# Snap the cut's ragged edge onto the square, so the rim sits flush all the way round.
for v in bm.verts:
    if v.is_boundary and v.co.y < HY - 0.05 and v.co.z > 1.05:
        t = math.atan2((v.co.z - OZ) / OH, v.co.x / OW)
        v.co = face_edge(t)
bm.to_mesh(coif.data)
bm.free()
# The skull under the coif, wrapped in the same padding, so the gap round the mask shows a head, not a hole.
blob('skull', (0, HY + 0.005, OZ), 0.1, COIFC, scale=(1.08, 0.98, 1.2), subdiv=3)
blob('underface', (0, -0.125, OZ), 0.1, COIFC, scale=(1.0, 0.25, 1.15), subdiv=2)

EDGE = [face_edge(2 * math.pi * k / 64, 0.004) for k in range(65)]
# The cut edge is a rolled hem of the padding, piped in brass on its outer side.
sweep('face_rim', EDGE, 0.013, 8, COIFC, caps=False)
hi(sweep('face_piping', [p + (p - Vector((0, p.y, OZ))).normalized() * 0.012 + Vector((0, -0.004, 0)) for p in EDGE],
         0.0035, 6, GOLD, caps=False))
# Quilting: the padding stitched in squares, the squared Heights look in cloth.
hi(sweep('quilt', [coif_at(a, 1.36, 0.002) for a in RING], 0.0018, 4, DARK))
for k in range(16):
    a = 2 * math.pi * (k + 0.5) / 16
    if abs(math.remainder(a, 2 * math.pi)) > 0.9:
        hi(sweep('quilt', [coif_at(a, z, 0.002) for z in (1.06, 1.12, 1.18, 1.24, 1.3, 1.37)], 0.0018, 4, DARK))

# The mask's straps: leather from the mask's edge round each temple to a brass buckle on the side of the coif.
for sx in (-1, 1):
    path = [Vector((M.x + sx * MW * 0.96, M.y + 0.012, M.z + 0.01))]
    path += [coif_at(sx * a, M.z + 0.01, 0.006) for a in (0.75, 1.0, 1.25, 1.5, 1.75)]
    sweep('strap', path, 0.011, 6, LEATHER, squash=0.35)
    bk = coif_at(sx * 1.2, M.z + 0.01, 0.01)
    box('strap_buckle', bk, (0.01, 0.034, 0.036), GOLD, rot=(0, 0, sx * 1.2 - math.pi / 2), bevel=0.004)


def box_ring(hx, hy, z):
    """A squared ring about the head's axis, half `hx` wide and half `hy` deep: a function from angle to point."""
    return lambda a: Vector((hx * squircle(a, 16) * math.sin(a), HY - hy * squircle(a, 16) * math.cos(a), z))


def rings(name, rows, sides, mat):
    """A shell through `rows`, bottom to top, each a function from the angle round the head to a point. A row that
    shrinks to one point closes the shell in a pole."""
    return lathe(name, [(1.0, 0.0)] * len(rows), sides, mat,
                 shape=lambda i, j, x, y, z: tuple(rows[i](2 * math.pi * j / sides)))


def ring_path(row, n=64):
    return [row(2 * math.pi * k / n) for k in range(n + 1)]


# The belfry cap: a tall, flat-sided cap like the tower that hangs the order's bells. A team band at its base, a louvred
# belfry stage, flared eaves and a pyramid roof ribbed in brass under a finial.
W0, D0, EAVE, APEX = 0.156, 0.146, 1.415, 1.565
rings('belfry', [box_ring(0.14, 0.13, 1.3), box_ring(W0, D0, 1.306), box_ring(W0, D0, EAVE),
                 box_ring(0.184, 0.174, EAVE + 0.002), box_ring(0.184, 0.174, EAVE + 0.018),
                 box_ring(0.168, 0.158, EAVE + 0.02), box_ring(0.07, 0.066, APEX - 0.06),
                 lambda a: Vector((0, HY, APEX))], 48, COIFC)
TEAM_LO, TEAM_HI = 1.306, 1.352
rings('belfry_team', [box_ring(W0 - 0.004, D0 - 0.004, TEAM_LO - 0.004), box_ring(W0 + 0.007, D0 + 0.007, TEAM_LO),
                      box_ring(W0 + 0.007, D0 + 0.007, TEAM_HI), box_ring(W0 - 0.004, D0 - 0.004, TEAM_HI + 0.004)],
      48, TEAM)
for z in (TEAM_LO - 0.002, TEAM_HI + 0.002):
    sweep('belfry_band', ring_path(box_ring(W0 + 0.009, D0 + 0.009, z)), 0.006, 6, DULL, caps=False)
sweep('belfry_eave', ring_path(box_ring(0.186, 0.176, EAVE + 0.01)), 0.008, 6, DULL, caps=False)
for k in range(4):
    a = math.pi / 4 + k * math.pi / 2
    sweep('belfry_post', [box_ring(W0 + 0.004, D0 + 0.004, z)(a) for z in (TEAM_HI, EAVE)], 0.007, 6, DULL)
    sweep('belfry_rib', [box_ring(0.172, 0.162, EAVE + 0.022)(a), box_ring(0.074, 0.07, APEX - 0.058)(a),
                         Vector((0, HY, APEX))], 0.0075, 6, GOLD)
# A louvred opening on each face of the belfry stage, its slats in brass.
zc = (TEAM_HI + EAVE) / 2
for x, y, yaw in ((0, HY - D0 - 0.001, 0), (0, HY + D0 + 0.001, 0), (W0 + 0.001, HY, math.pi / 2),
                  (-W0 - 0.001, HY, math.pi / 2)):
    hi(box('louvre', (x, y, zc), (0.07, 0.006, 0.042), DARK, rot=(0, 0, yaw)))
    for dz in (-0.012, 0.0, 0.012):
        hi(box('louvre_slat', (x, y, zc + dz), (0.068, 0.01, 0.005), DULL, rot=(0.5, 0, yaw)))
blob('finial', (0, HY, APEX + 0.006), 0.016, GOLD, subdiv=2)
sweep('finial_spike', [Vector((0, HY, APEX + 0.015)), Vector((0, HY, APEX + 0.06))], [0.007, 0.0015], 6, GOLD)

grow = Matrix.Translation(PIVOT) @ Matrix.Scale(HEAD_SCALE, 4) @ Matrix.Translation(-PIVOT)
HEAD = set(bpy.data.objects) - before_head
for ob in HEAD:
    if ob.type == 'MESH':
        ob.matrix_world = grow @ ob.matrix_world
    else:
        ob.location = head_space(ob.location)

# The cape: hard triangular pleats lying on the mantle, piped in brass round their pointed hem. It follows the mantle,
# not the scaled head, and rises to the coif's neck, where it tucks in under the coif.
NECK = 1.065


def pleat(a, count=14):
    t = (a * count / (2 * math.pi)) % 1
    return 1 - 4 * abs(t - 0.5)


def cape(f, out=0.0):
    """A ring of the cape, f of the way from its hem (0) up to the coif (1)."""
    def at(a):
        low = mantle_at(a, 0.98 + 0.025 * math.cos(a) ** 2, 0.022 + out + 0.012 * pleat(a))
        p = low.lerp(head_space(coif_at(a, NECK, out - 0.006)), f)
        p.z += 0.03 * math.sin(math.pi * f)
        return p
    return at


solidify(rings('cape', [cape(f) for f in (0.0, 0.25, 0.5, 0.75, 1.0)], 56, COIFC), 0.012, inner=DARK)
hi(sweep('cape_piping', ring_path(cape(0.04, 0.004), 112), 0.004, 6, GOLD))


# Team stoles: two broad bands from under the cape, over the mantle and down the front of the robe.
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

# A brass clock-face clasp pins the stoles together on the chest, just under the cape.
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

# The arms are an armature: hips and chest, then per side a clavicle, upper arm, forearm and hand. Each sleeve, wide and
# stiff and hemmed in brass, is one tube skinned to its arm, so the elbow bends without a seam; each fist and what it
# holds ride its hand bone. Per arm: shoulder, elbow, wrist, the sleeve's radius from shoulder to cuff, and where along
# it the brass hem starts. The crook hand holds the pole at the waist with the elbow at the side and the forearm
# forward; the bead hand hangs with the elbow soft, the beads in front of the hip.
ARMS = {
    'r': (Vector((-0.2, 0.0, 0.99)), Vector((-0.31, 0.0, 0.76)), Vector((-0.325, -0.19, 0.84)),
          (0.07, 0.074, 0.078, 0.082, 0.08, 0.068, 0.05), 0.9),
    'l': (Vector((0.2, 0.0, 0.99)), Vector((0.285, 0.03, 0.75)), Vector((0.275, -0.125, 0.615)),
          (0.07, 0.074, 0.08, 0.088, 0.096, 0.104, 0.108), 0.82),
}


def sleeve_end(side):
    """Where a sleeve's opening is, and the way its forearm points."""
    s, e, w, _, _ = ARMS[side]
    return w + (w - e) * 0.08, w - e


POLE = Vector((0.05, 0.0, 1.0)).normalized()
RIGHT_HAND = fist(*sleeve_end('r'), POLE, 0.027, GLOVE, detail='glove', seam=LEATHER, name='fist_r')
# The left fist closes on the top of the bead loop, which drops from under the knuckles.
LEFT_HAND = fist(*sleeve_end('l'), Vector((-1, 0, 0)), 0.006, GLOVE, right=False, detail='glove', seam=LEATHER,
                 name='fist_l')
GRIPS = {'r': RIGHT_HAND, 'l': LEFT_HAND}

# The torso turns at the waist: the robe and the stoles are skinned from the hips, under the belt, to the chest under
# the mantle, and the mantle, cape, clasp and head ride the chest. Every arm bone's x axis runs to the figure's left,
# so -x on it swings the arm forward or bends the joint. `shoulder_*` and `elbow_*` turn halfway with the upper arm
# and forearm, and `drape_l` lets the wide bead sleeve fall down a raised forearm (see halfway() and drape()).
RIG = armature('rig', [('hips', (0, 0, 0.3), (0, 0, 0.7), None, (1, 0, 0)), ('chest', (0, 0, 0.7), (0, 0, 1.0), 'hips', (1, 0, 0))] + [
    bone for side, (s, e, w, _, _) in ARMS.items() for bone in (
        (f'clavicle_{side}', (0, 0.0, 0.99), s, 'chest', (0, 1 if side == 'r' else -1, 0)),
        (f'upperarm_{side}', s, e, f'clavicle_{side}', (1, 0, 0)),
        (f'shoulder_{side}', s, e, f'clavicle_{side}', (1, 0, 0)),
        (f'forearm_{side}', e, w, f'upperarm_{side}', (1, 0, 0)),
        (f'elbow_{side}', e, w, f'upperarm_{side}', (1, 0, 0)),
        (f'hand_{side}', sleeve_end(side)[0] - (w - e).normalized() * 0.03, GRIPS[side], f'forearm_{side}', (1, 0, 0)),
    )
] + [('drape_l', ARMS['l'][1], sleeve_end('l')[0], 'forearm_l', (1, 0, 0))])
for side in ARMS:
    halfway(RIG, f'shoulder_{side}', f'upperarm_{side}', bulge=0.06)
    halfway(RIG, f'elbow_{side}', f'forearm_{side}', bulge=0.12)
drape(RIG, 'drape_l', slide=0.45, droop=1.1)
for side, grip in GRIPS.items():
    bone_parent(bpy.data.objects[f'fist_{side}'], RIG, f'hand_{side}')
    bone_parent(empty(f'grip_{side}', grip), RIG, f'hand_{side}')
# The forearm under the wide bead sleeve shows when it falls back: a glove's long cuff.
s, e, w, _, _ = ARMS['l']
bone_parent(limb('forearm_glove', w, e.lerp(w, 0.2), 0.03, 0.036, GLOVE, sides=10), RIG, 'forearm_l')

CHEST_PARTS = {'mantle_piping', 'mantle_scroll', 'sigil', 'sigil_ring', 'cape', 'cape_piping', 'clasp',
               'clasp_tick', 'clasp_hand'}
for ob in list(bpy.data.objects):
    if ob.parent is None and (ob in HEAD or ob.name.split('.')[0] in CHEST_PARTS):
        bone_parent(ob, RIG, 'chest')
for ob in [o for o in bpy.data.objects if o.parent is None and o.name.split('.')[0] in ('robe', 'stole')]:
    skin(ob, RIG, lambda v: waist((ob.matrix_world @ v.co).z, 0.72, 0.84))
# The stiff mantle rides the chest, but over each shoulder it lifts with the arm, so a raised sleeve slides out from
# under it instead of bulging through it.


def lifted(v):
    lift = 0.7 * smoothstep(0.1, 0.26, abs(v.co.x)) * smoothstep(1.03, 0.92, v.co.z)
    return {'chest': 1 - lift, 'shoulder_r' if v.co.x < 0 else 'shoulder_l': lift}


skin(mantle, RIG, lifted)

for side, (s, e, w, radii, hem) in ARMS.items():
    path, along, elbow = sleeve_path(s, e, sleeve_end(side)[0])
    rs = [interp([(r, k / (len(radii) - 1)) for k, r in enumerate(radii)], t) for t in along]
    sl = sweep(f'sleeve_{side}', path, rs, 14, MAIN, caps=False, levels=1, mask=lambda i, a=along, h=hem: float(a[i] >= h))
    solidify(sl, 0.014, inner=DARK)
    # Even thickness spikes where the arm folds sharply at the elbow.
    sl.modifiers['solid'].use_even_offset = side == 'l'
    # Only the wide bead sleeve falls down a raised forearm.
    skin(sl, RIG, lambda v: sleeve(side, along[v.index // 14], elbow, falls=side == 'l'))
    _, fr = frames(path)
    cuff = [path[-2].lerp(path[-1], 0.2) + (fr[-1][0] * math.cos(a) + fr[-1][1] * math.sin(a)) * (rs[-1] - 0.006)
            for a in [2 * math.pi * k / 48 for k in range(49)]]
    hi(sweep('cuff_braid', cuff, 0.004, 6, DULL))

# Prayer beads drop from the left hand in a long loop, with a small brass bell where the loop closes; the loop swings
# on the knuckles.
beads = bone_parent(empty('beads', LEFT_HAND), RIG, 'hand_l')
empty('hold_l', LEFT_HAND, beads)
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

# The crook: the weapon pivots at the right-hand grip. Its hook curls out past the head and hangs the bell.
weapon = bone_parent(empty('weapon', RIGHT_HAND), RIG, 'hand_r')
empty('hold_r', RIGHT_HAND, weapon)


def part(ob):
    return parent(ob, weapon)


def pole_at(z):
    return RIGHT_HAND + POLE * ((z - RIGHT_HAND.z) / POLE.z)


TOP_Z = 1.74
GRIP_Z = RIGHT_HAND.z - 0.1
T = pole_at(TOP_Z)
part(sweep('shaft', [pole_at(0.03), pole_at(0.9), pole_at(TOP_Z)], [0.019, 0.022, 0.021], 10, WOOD))
part(sweep('butt', [pole_at(0.0), pole_at(0.02), pole_at(0.06)], [0.008, 0.026, 0.026], 10, GOLD))
for z, h in ((0.06, 0.03), (GRIP_Z - 0.03, 0.025), (GRIP_Z + 0.205, 0.025), (TOP_Z - 0.04, 0.05)):
    part(sweep('ferrule', [pole_at(z), pole_at(z + h / 2), pole_at(z + h)], [0.026, 0.03, 0.026], 12, GOLD))
side = POLE.cross(Vector((0, 1, 0))).normalized()
up = POLE.cross(side)
n = 12 * 8
helix = [pole_at(GRIP_Z + 0.2 * t / n) + (side * math.cos(2 * math.pi * t / 8) + up * math.sin(2 * math.pi * t / 8)) * 0.024
         for t in range(n + 1)]
part(sweep('grip_wrap', [pole_at(GRIP_Z), pole_at(GRIP_Z + 0.2)], 0.027, 10, LEATHER))
part(hi(sweep('grip_turn', helix, 0.0075, 6, LEATHER, squash=0.6)))
HOOK = bezier(T, T + Vector((0.0, 0, 0.2)), T + Vector((-0.27, 0, 0.24)), T + Vector((-0.27, 0, 0.04)), 16)
part(sweep('hook', HOOK, [0.021 - 0.006 * (i / 16) for i in range(17)], 10, WOOD))
for i in (5, 11):
    part(sweep('hook_band', [HOOK[i].lerp(HOOK[i + 1], 0.3), HOOK[i].lerp(HOOK[i + 1], 0.7)], 0.025, 12, GOLD))
part(blob('hook_tip', HOOK[-1], 0.02, GOLD, subdiv=2))
TIP = HOOK[-1]

# The bell hangs from the hook by its crown loop: hammered brass with a thick flared lip, raised bands at the shoulder
# and the sound bow, the twelve hours studded round its waist, and a clapper swinging in its glowing throat.
swing = part(empty('bell_swing', TIP))
BH, BR = 0.32, 0.162
B0 = TIP - Vector((0, 0, 0.075 + BH))
PROFILE = [(0.94, 0.0), (1.0, 0.018), (0.99, 0.055), (0.92, 0.1), (0.83, 0.17), (0.75, 0.26), (0.685, 0.36),
           (0.64, 0.47), (0.61, 0.58), (0.595, 0.69), (0.585, 0.79), (0.56, 0.87), (0.48, 0.94), (0.33, 0.985),
           (0.0, 1.0)]


WAIST = (BH * 0.47, BH * 0.68)


def bell_r(h):
    return BR * interp(PROFILE[:-1], h / BH)


def at_bell(i, j, x, y, z):
    return (x + B0.x, y + B0.y, z)


def bell_ring(name, h, out, radius, mat, sides=6):
    pts = [Vector((B0.x + (bell_r(h) + out) * math.sin(a), B0.y - (bell_r(h) + out) * math.cos(a), B0.z + h))
           for a in [2 * math.pi * k / 32 for k in range(33)]]
    return sweep(name, pts, radius, sides, mat, caps=False)


# The throat is its own shallow cone inside the lip, so the bell's shell needs no second skin.
for ob in (
    lathe('bell', [(r * BR, B0.z + h * BH) for r, h in PROFILE], 24, BRASS, shape=at_bell, levels=1),
    lathe('bell_throat', [(BR * 0.9, B0.z + 0.004), (BR * 0.72, B0.z + BH * 0.2), (BR * 0.5, B0.z + BH * 0.5),
                          (0.0, B0.z + BH * 0.62)], 24, THROAT, shape=at_bell),
    bell_ring('bell_lip', 0.022, 0.0, 0.016, BRASS, sides=8),
    bell_ring('bell_bow', BH * 0.31, 0.002, 0.007, DULL),
    bell_ring('bell_shoulder', BH * 0.87, 0.002, 0.006, DULL),
    bell_ring('bell_band', WAIST[0], 0.002, 0.006, DULL),
    bell_ring('bell_band', WAIST[1], 0.002, 0.006, DULL),
    lathe('bell_canon', [(0.045, B0.z + BH - 0.004), (0.05, B0.z + BH + 0.012), (0.036, B0.z + BH + 0.028),
                         (0.0, B0.z + BH + 0.03)], 12, DULL, shape=at_bell, levels=1),
    link('bell_ring', TIP - Vector((0, 0, 0.022)), (math.pi / 2, 0, 0), GOLD, size=0.016),
):
    parent(ob, swing)
bpy.ops.mesh.primitive_torus_add(major_radius=0.026, minor_radius=0.009, major_segments=14, minor_segments=6,
                                 location=TIP - Vector((0, 0, 0.055)), rotation=(math.pi / 2, 0, math.pi / 2))
parent(assign(smooth(bpy.context.object), BRASS), swing).name = 'bell_loop'
for k in range(12):
    a = 2 * math.pi * k / 12
    h = sum(WAIST) / 2
    parent(blob('bell_hour', Vector((B0.x + (bell_r(h) + 0.005) * math.sin(a), B0.y - (bell_r(h) + 0.005) * math.cos(a),
                                     B0.z + h)), 0.008, GOLD, subdiv=1), swing)
clapper = parent(empty('clapper', B0 + Vector((0, 0, BH - 0.02))), swing)
parent(limb('clapper_rod', B0 + Vector((0, 0, BH - 0.02)), B0 + Vector((0, 0, 0.0)), 0.006, 0.006, DULL, sides=6),
       clapper)
parent(blob('clapper_ball', B0 - Vector((0, 0, 0.01)), 0.03, DULL, scale=(1, 1, 1.15), subdiv=2), clapper)
glow(B0 + Vector((0, 0, 0.03)), AMBER, 0.45, swing, name='glow_bell')
loop(swing, 'rotation_euler', 0, [0.0, 0.08, 0.0, -0.08], 72)
loop(swing, 'rotation_euler', 1, [0.0, -0.05, 0.0, 0.05], 108)
loop(clapper, 'rotation_euler', 0, [0.0, -0.1, 0.0, 0.1], 72)

# Two team ribbons knotted over the top of the hook, their tails falling between the shaft and the bell.
ribbons = part(empty('ribbons', HOOK[9]))
for dx, length in ((0.035, 0.3), (-0.03, 0.24)):
    top = HOOK[9] + Vector((0, -0.012, -0.012))
    path = [top + Vector((dx * k / 5 + 0.01 * math.sin(k), -0.01 * (k % 2), -length * k / 5)) for k in range(6)]
    parent(ribbon('ribbon', path, [0.032, 0.036, 0.04, 0.042, 0.044, 0.046], (1, 0, 0), TEAM, thickness=0.012,
                  belly=0.004, notch=0.025), ribbons)
parent(blob('ribbon_knot', HOOK[9] + Vector((0, -0.016, -0.008)), 0.022, TEAM, scale=(1.2, 0.8, 1), subdiv=2), ribbons)
loop(ribbons, 'rotation_euler', 1, [0.0, 0.07, 0.0, -0.05], 84)

for ob in list(bpy.data.objects):
    if ob.parent is None and ob is not breath:
        parent(ob, breath)

# The arms breathe with the body: the collarbones rise on the in-breath, the arms ease out from the sides and the
# bead elbow opens a little.
for b, axis, peak in (('clavicle_r', 0, 0.03), ('clavicle_l', 0, 0.03), ('upperarm_r', 2, 0.02), ('upperarm_l', 2, -0.03),
                      ('upperarm_l', 0, 0.02), ('forearm_l', 0, 0.04), ('hand_l', 0, -0.05)):
    loop(RIG, f'pose.bones["{b}"].rotation_euler', axis, [0.0, peak], 96)


arm = partial(bone_key, RIG)


def carry(keys, lean, tilt=((0, 0),)):
    return wield(keys, RIG, 'hand_r', lean, 'chest', tilt)


def steady(keys, span, z):
    """`keys` with the bead fist closing on the crook's shaft where it crosses height `z` at rest, over `span`."""
    # The fist's centre sits beside the shaft, on the figure's side of it, not on its axis.
    return reach(keys, RIG, 'hand_l', pole_at(z) + Vector((0.03, -0.012, 0)), weapon, span)


def dangle(keys):
    return hang(keys, RIG, ((swing, 'hand_r'), (ribbons, 'hand_r'), (beads, 'hand_l')))


R, S = 'rotation_euler', 'scale'
# Clip axes. The chest turns at the waist: +x leans it forward, +y turns its front toward the figure's left (the bead
# side). On an arm bone -x swings the arm forward and up, or bends the elbow; z on a hanging upper arm swings it out,
# +z for the right arm and -z for the left. `carry()` holds the crook upright unless a clip leans it (+ forward) or
# tilts it (- out to the crook side). Every clip reads from behind and above, as the battle camera sees it: the torso
# turns and leans, and the arms leave the silhouette.
CHEST = arm('chest', X), arm('chest', Y), arm('chest', Z)
# Cast: the beads drawn to the heart and the crook gathered in, then the crook thrust up and forward so the bell rings
# out over the target while the bead hand is flung open toward it; everything settles.
act('cast', 10, dangle(carry({
    CHEST[0]: [(0, 0), (5, -0.1), (10, 0.1), (13, 0.07), (18, 0)],
    CHEST[1]: [(0, 0), (5, -0.18), (10, 0.12), (13, 0.08), (18, 0)],
    (breath, R, 0): [(0, 0), (5, -0.04), (10, 0.04), (18, 0)],
    arm('clavicle_r', X): [(0, 0), (5, 0.04), (10, -0.12), (18, 0)],
    arm('upperarm_r', X): [(0, 0), (5, 0.1), (10, -1.4), (13, -1.3), (18, 0)],
    arm('upperarm_r', Z): [(0, 0), (5, -0.1), (10, 0.2), (18, 0)],
    arm('forearm_r', X): [(0, 0), (5, -0.35), (10, -0.6), (13, -0.55), (18, 0)],
    arm('clavicle_l', X): [(0, 0), (5, 0.05), (10, -0.15), (18, 0)],
    arm('upperarm_l', X): [(0, 0), (5, -0.35), (10, -1.45), (13, -1.35), (18, 0)],
    arm('upperarm_l', Z): [(0, 0), (5, 0.1), (10, 0.0), (18, 0)],
    arm('upperarm_l', Y): [(0, 0), (5, 0.0), (10, -0.7), (13, -0.65), (18, 0)],
    arm('forearm_l', X): [(0, 0), (5, -1.2), (10, -0.5), (13, -0.55), (18, 0)],
    arm('hand_l', X): [(0, 0), (5, 0.2), (10, -0.2), (13, -0.15), (18, 0)],
    (beads, R, 0): [(0, 0), (5, 0.3), (10, -0.6), (13, 0.35), (16, -0.15), (18, 0)],
    (swing, R, 0): [(0, 0), (5, 0.5), (10, -0.75), (13, 0.45), (15, -0.25), (18, 0)],
    (swing, R, 1): [(0, 0), (5, -0.4), (10, 0.7), (13, -0.35), (15, 0.15), (18, 0)],
    (clapper, R, 0): [(0, 0), (6, 0.3), (9, 0.6), (10, -0.7), (12, 0.5), (14, -0.3), (18, 0)],
    (ribbons, R, 0): [(0, 0), (8, -0.4), (11, 0.5), (18, 0)],
    (ribbons, R, 1): [(0, 0), (6, 0.3), (10, -0.6), (13, 0.4), (18, 0)],
}, [(0, 0), (5, -0.1), (10, 0.3), (13, 0.22), (18, 0)])))
# Attack: the chest winds back toward the crook as it tips back over the shoulder, then snaps round as the arm swings
# the bell down onto the target like a mace, follows through and recovers. The bead arm swings against it.
act('attack', 7, dangle(carry({
    CHEST[0]: [(0, 0), (4, -0.08), (7, 0.2), (10, 0.22), (14, 0)],
    CHEST[1]: [(0, 0), (4, -0.4), (7, 0.3), (10, 0.38), (14, 0)],
    (breath, R, 0): [(0, 0), (4, -0.05), (7, 0.08), (14, 0)],
    (breath, R, 2): [(0, 0), (4, -0.08), (7, 0.08), (14, 0)],
    arm('clavicle_r', X): [(0, 0), (4, 0.06), (7, -0.06), (14, 0)],
    arm('upperarm_r', X): [(0, 0), (4, 0.2), (7, -0.9), (10, -0.95), (14, 0)],
    arm('upperarm_r', Z): [(0, 0), (4, 0.35), (7, 0.0), (10, -0.15), (14, 0)],
    arm('forearm_r', X): [(0, 0), (4, -0.9), (7, -0.3), (10, -0.25), (14, 0)],
    arm('upperarm_l', X): [(0, 0), (4, -0.55), (7, 0.45), (10, 0.5), (14, 0)],
    arm('upperarm_l', Z): [(0, 0), (4, -0.05), (7, -0.3), (14, 0)],
    arm('forearm_l', X): [(0, 0), (4, -0.6), (7, -0.1), (14, 0)],
    (beads, R, 0): [(0, 0), (4, -0.4), (7, 0.5), (10, 0.3), (14, 0)],
    (swing, R, 0): [(0, 0), (4, 0.4), (7, -0.2), (8, -0.9), (11, 0.3), (14, 0)],
    (clapper, R, 0): [(0, 0), (5, 0.4), (8, -0.8), (10, 0.4), (14, 0)],
    (ribbons, R, 1): [(0, 0), (4, 0.3), (8, -0.5), (14, 0)],
}, [(0, 0), (4, -0.45), (7, 0.95), (10, 1.05), (14, 0)])))
# Toll: the crook hoisted high before the chest, the bead hand coming up to steady the shaft, the bell drawn in for a
# held beat at the top; then both hands heave it out and forward in one great swing, and the bead hand lets go.
act('toll', 21, dangle(steady(carry({
    CHEST[0]: [(0, 0), (10, -0.12), (18, -0.14), (21, 0.2), (24, 0.18), (32, 0)],
    CHEST[1]: [(0, 0), (10, -0.42), (18, -0.45), (21, 0.05), (24, 0.08), (32, 0)],
    (breath, R, 0): [(0, 0), (10, -0.06), (18, -0.07), (21, 0.06), (32, 0)],
    (breath, S, 2): [(0, 0), (10, 0.03), (18, 0.035), (22, -0.02), (32, 0)],
    arm('clavicle_r', X): [(0, 0), (10, -0.15), (18, -0.15), (21, -0.05), (32, 0)],
    arm('upperarm_r', X): [(0, 0), (10, -1.0), (18, -1.05), (21, -1.25), (24, -1.2), (32, 0)],
    arm('upperarm_r', Z): [(0, 0), (10, 0.25), (18, 0.25), (21, 0.05), (32, 0)],
    arm('forearm_r', X): [(0, 0), (10, -1.35), (18, -1.4), (21, -0.35), (24, -0.4), (32, 0)],
    arm('upperarm_l', X): [(0, 0), (5, -0.6), (25, -0.8), (29, 0.15), (32, 0)],
    arm('forearm_l', X): [(0, 0), (5, -1.0), (25, -0.6), (29, -0.2), (32, 0)],
    (beads, R, 0): [(0, 0), (8, 0.3), (21, -0.6), (25, 0.4), (29, -0.2), (32, 0)],
    (swing, R, 0): [(0, 0), (10, 0.3), (17, 0.4), (21, -0.7), (25, 0.35), (28, -0.15), (32, 0)],
    (swing, R, 1): [(0, 0), (10, -0.2), (17, -0.3), (21, 1.1), (25, -0.45), (28, 0.2), (32, 0)],
    (clapper, R, 1): [(0, 0), (12, -0.3), (18, -0.5), (20, -0.7), (21, 0.9), (24, -0.5), (27, 0.2), (32, 0)],
    (ribbons, R, 1): [(0, 0), (12, 0.2), (21, -0.7), (25, 0.4), (32, 0)],
}, [(0, 0), (10, -0.15), (18, -0.2), (21, 0.8), (24, 0.7), (32, 0)], [(0, 0), (10, 0.12), (18, 0.14), (21, -0.1), (32, 0)]),
    range(8, 25), RIGHT_HAND.z - 0.26)))
# Peal: the crook lifted before the chest and rattled side to side, while the bead hand holds the beads up by the
# shoulder and shakes their little bell with it.
RATTLE = [(0, 0), (3, 0.18), (6, -0.18), (9, 0.18), (12, -0.18), (15, 0.18), (18, -0.1), (22, 0)]
act('peal', 5, dangle(carry({
    CHEST[0]: [(0, 0), (4, 0.06), (18, 0.06), (22, 0)],
    CHEST[1]: [(0, 0)] + [(f, -v * 0.3) for f, v in RATTLE[1:]],
    arm('upperarm_r', X): [(0, 0), (4, -0.75), (18, -0.75), (22, 0)],
    arm('forearm_r', X): [(0, 0), (4, -0.6), (18, -0.6), (22, 0)],
    arm('upperarm_l', X): [(0, 0), (4, -0.9), (18, -0.9), (22, 0)],
    arm('upperarm_l', Y): [(0, 0), (4, -0.6), (18, -0.6), (22, 0)],
    arm('forearm_l', X): [(0, 0), (4, -1.2), (18, -1.2), (22, 0)],
    arm('hand_l', X): [(0, 0)] + [(f, v * 1.5) for f, v in RATTLE[1:]],
    (beads, R, 1): [(0, 0)] + [(f, -v * 2.5) for f, v in RATTLE[1:]],
    (swing, R, 0): [(0, 0), (5, -0.3), (11, 0.3), (17, -0.2), (22, 0)],
    (swing, R, 1): [(0, 0), (4, -0.5), (7, 0.5), (10, -0.5), (13, 0.5), (16, -0.5), (19, 0.3), (22, 0)],
    (clapper, R, 1): [(0, 0), (5, 0.6), (8, -0.6), (11, 0.6), (14, -0.6), (17, 0.6), (20, -0.3), (22, 0)],
    (ribbons, R, 1): [(0, 0), (5, 0.4), (8, -0.4), (11, 0.4), (14, -0.4), (17, 0.3), (22, 0)],
}, [(0, 0), (4, 0.15), (18, 0.15), (22, 0)], RATTLE)))
# Knell: the crook taken in both hands and raised back over the shoulder, then brought down hard before the chest.
act('knell', 11, dangle(steady(carry({
    CHEST[0]: [(0, 0), (7, -0.15), (11, 0.3), (14, 0.27), (20, 0)],
    CHEST[1]: [(0, 0), (7, -0.35), (11, 0.12), (14, 0.1), (20, 0)],
    (breath, R, 0): [(0, 0), (7, -0.06), (11, 0.1), (14, 0.09), (20, 0)],
    (breath, S, 2): [(0, 0), (7, 0.03), (11, -0.06), (14, -0.05), (20, 0)],
    arm('clavicle_r', X): [(0, 0), (7, -0.15), (11, 0.0), (20, 0)],
    arm('upperarm_r', X): [(0, 0), (7, -1.6), (11, -0.75), (14, -0.7), (20, 0)],
    arm('upperarm_r', Z): [(0, 0), (7, -0.15), (11, -0.3), (20, 0)],
    arm('forearm_r', X): [(0, 0), (7, -1.1), (11, -0.25), (14, -0.25), (20, 0)],
    arm('upperarm_l', X): [(0, 0), (3, -0.6), (16, -0.5), (20, 0)],
    arm('forearm_l', X): [(0, 0), (3, -1.0), (16, -0.6), (20, 0)],
    (beads, R, 0): [(0, 0), (7, 0.4), (11, -0.7), (14, 0.4), (17, -0.15), (20, 0)],
    (swing, R, 0): [(0, 0), (7, 0.5), (10, 0.3), (12, -0.6), (15, 0.3), (20, 0)],
    (clapper, R, 0): [(0, 0), (8, 0.4), (11, -0.8), (14, 0.4), (20, 0)],
}, [(0, 0), (7, -0.7), (11, 1.1), (14, 1.0), (20, 0)]), range(4, 16), RIGHT_HAND.z - 0.3)))
# Hit: the chest snaps back and the shoulders shrug as both arms pull in to the body, the crook drawn in close, then it
# recovers through a small lean forward.
act('hit', 2, dangle(carry({
    CHEST[0]: [(0, 0), (2, -0.3), (6, 0.06), (12, 0)],
    CHEST[1]: [(0, 0), (2, 0.12), (6, -0.03), (12, 0)],
    (breath, R, 0): [(0, 0), (2, -0.08), (6, 0.02), (12, 0)],
    arm('clavicle_l', X): [(0, 0), (2, 0.18), (7, 0.03), (12, 0)],
    arm('clavicle_r', X): [(0, 0), (2, 0.18), (7, 0.03), (12, 0)],
    arm('upperarm_l', X): [(0, 0), (2, -0.35), (7, -0.1), (12, 0)],
    arm('upperarm_l', Z): [(0, 0), (2, 0.2), (6, -0.04), (12, 0)],
    arm('forearm_l', X): [(0, 0), (2, -0.8), (7, -0.2), (12, 0)],
    arm('upperarm_r', X): [(0, 0), (2, -0.2), (12, 0)],
    arm('upperarm_r', Z): [(0, 0), (2, -0.2), (12, 0)],
    arm('forearm_r', X): [(0, 0), (2, -0.5), (7, -0.2), (12, 0)],
    (swing, R, 0): [(0, 0), (2, 0.6), (5, -0.45), (8, 0.3), (10, -0.12), (12, 0)],
    (swing, R, 1): [(0, 0), (3, -0.3), (6, 0.25), (9, -0.1), (12, 0)],
    (clapper, R, 0): [(0, 0), (2, -0.6), (4, 0.6), (6, -0.5), (8, 0.3), (12, 0)],
    (beads, R, 0): [(0, 0), (2, 0.4), (5, -0.3), (9, 0.1), (12, 0)],
}, [(0, 0), (2, -0.2), (6, 0.06), (12, 0)])))
# Move loops two steps every 12 frames while the unit travels: the chest counter-turns against a full bead-arm swing
# and the body rolls from foot to foot; the crook arm plants and lifts the crook, the bell trailing.
act('move', 0, dangle(carry({
    (breath, R, 0): [(0, 0.05), (6, 0.07), (12, 0.05)],
    (breath, R, 1): [(0, 0), (3, 0.06), (6, 0), (9, -0.06), (12, 0)],
    CHEST[1]: [(0, -0.14), (6, 0.14), (12, -0.14)],
    arm('upperarm_l', X): [(0, -0.55), (6, 0.4), (12, -0.55)],
    arm('upperarm_l', Z): [(0, -0.08), (6, -0.14), (12, -0.08)],
    arm('forearm_l', X): [(0, -0.55), (6, -0.15), (12, -0.55)],
    arm('upperarm_r', X): [(0, 0.15), (6, -0.25), (12, 0.15)],
    arm('forearm_r', X): [(0, -0.3), (6, -0.45), (12, -0.3)],
    (beads, R, 0): [(0, 0.3), (6, -0.3), (12, 0.3)],
    (swing, R, 0): [(0, 0.2), (6, -0.1), (12, 0.2)],
    (swing, R, 1): [(0, 0), (3, -0.15), (6, 0), (9, 0.15), (12, 0)],
    (clapper, R, 0): [(0, -0.2), (6, 0.2), (12, -0.2)],
    (ribbons, R, 0): [(0, 0.3), (6, 0.2), (12, 0.3)],
    (ribbons, R, 1): [(0, 0), (3, 0.15), (9, -0.15), (12, 0)],
}, [(0, 0.12), (6, -0.04), (12, 0.12)])))
# Down plays while the board tips the body onto its back: the arms fly up, then reach back and out to break the fall,
# the chest curling forward against it and the crook falling out to its side. It holds its last frame while the unit
# is downed, and rise starts from that frame, pushing off the ground behind and curling up before it settles.
DOWNED = {CHEST[0]: 0.3, (breath, S, 2): -0.12, arm('clavicle_l', X): 0.12, arm('clavicle_r', X): 0.12,
          arm('upperarm_l', X): 0.8, arm('upperarm_l', Z): -0.75, arm('forearm_l', X): -0.35, arm('hand_l', X): 0.5,
          arm('upperarm_r', X): 0.6, arm('upperarm_r', Z): 0.6, arm('forearm_r', X): -0.5}
FLUNG = {arm('upperarm_l', X): -0.7, arm('upperarm_l', Z): -0.5, arm('upperarm_r', X): -0.5, arm('upperarm_r', Z): 0.4}
TOPPLE = [(0, 0), (4, -0.2), (14, -0.45)]
FALL = [(0, 0), (6, -0.2), (14, -0.6)]
act('down', 10, dangle(carry({k: [(0, 0), (4, FLUNG.get(k, v * 0.4)), (14, v)] for k, v in DOWNED.items()} | {
    (swing, R, 0): [(0, 0), (6, -0.4), (10, 0.3), (14, 0)],
    (clapper, R, 0): [(0, 0), (7, 0.5), (10, -0.4), (14, 0)],
    (beads, R, 0): [(0, 0), (4, -0.5), (9, 0.4), (14, 0.2)],
}, TOPPLE, FALL)))
PUSH = {CHEST[0]: 0.45, arm('upperarm_l', X): 1.0, arm('upperarm_r', X): 0.8, arm('forearm_l', X): 0.0}
act('rise', 8, dangle(carry({k: [(0, v), (6, PUSH.get(k, v)), (10, -0.1 * v if k == CHEST[0] else 0), (14, 0)]
                      for k, v in DOWNED.items()} | {
    (swing, R, 0): [(0, 0), (6, 0.5), (10, -0.3), (14, 0)],
    (clapper, R, 0): [(0, 0), (8, 0.5), (11, -0.3), (14, 0)],
    (beads, R, 0): [(0, 0.2), (6, 0.3), (10, -0.25), (14, 0)],
}, [(0, -0.45), (6, -0.3), (14, 0)], [(0, -0.6), (6, -0.4), (14, 0)])))

# The skin weights cost what the atlases give back, keeping the figure near 3 MB.
meshes = bake(fill='#4a2c14', quality=(82, 74))
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
print(f'bellringer: {tris} triangles, {len(meshes)} meshes')
finish()
