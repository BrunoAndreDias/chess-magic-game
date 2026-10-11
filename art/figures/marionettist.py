"""The Marionettist of the Sworn Heights: a tall masked puppeteer in an ochre tailcoat with squared shoulders, dark
satin lapels and a hem of brass harlequin diamonds, a dark stock and a team jabot at the throat, a team sash knotted at
the hip, a tall stand collar lined in black framing a white porcelain mask (a black diamond over one eye, a glowing
amber tear under the other, a smile that dips on one side) under a small tilted top hat. The left hand is raised on a
wooden cross control whose amber strings drop to a jointed wooden doll at its side: a child-sized copy with the mask
mirrored, a zigzag tunic, a ruff and a team bow. The control, the strings and the doll are one `weapon`, so a jerk of
the control throws the doll. Painted by lookdev and baked from a high-poly twin."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bmesh
import bpy
from mathutils import Matrix, Vector, noise
from common import *
import hands
from hands import fist
from lookdev import bake, hi, mark, paint

reset()


def creases(stretch, depth):
    def relief(co, n, mask):
        v = noise.noise(Vector((co.x * stretch[0], co.y * stretch[1], co.z * stretch[2])))
        return depth * (0.5 - abs(v)) * 2
    return relief


def grain(co, n, mask):
    return 0.0012 * noise.noise(Vector((co.x * 160, co.y * 160, co.z * 12)))


CLOTH = creases((9, 9, 1.6), 0.004)
MAIN = paint('main', '#b07c2c', '#3e2208', '#f2c474', rough=0.85, edge=0.4, mottle=0.1, streak=0.6,
             accent='#2a1828', keep=True, relief=CLOTH)
TEAM = paint('team', '#d8d8d8', '#6c6c6c', '#ffffff', rough=0.9, streak=0.5, mottle=0.06, accent='#9a9a9a', keep=True,
             relief=creases((3, 3, 10), 0.0015))
DARK = paint('dark', '#2e1a30', '#0a0510', '#6a4a70', rough=0.85, edge=0.7, streak=0.4, mottle=0.08, relief=CLOTH)
SATIN = paint('satin', '#3a2040', '#0c0612', '#8a6292', rough=0.5, edge=0.3, streak=0.7, mottle=0.06)
BRASS = paint('brass', '#f5cc52', '#5a360a', '#fff4c0', metal=True, cavity=0.4, edge=1.0, mottle=0.05)
# Piping: a plain painted-metal ramp, no edge or cavity picking, so thin tubes bake smooth instead of beaded.
TRIM = paint('brass_trim', '#f0c24a', '#7a4c10', '#fff0b8', metal=True, cavity=0.0, edge=0.0, mottle=0.0)
PORC = paint('porcelain', '#faf6f0', '#d6cede', '#ffffff', rough=0.3, cavity=0.15, edge=0.15, mottle=0.02, texel=3)
LACE = paint('lace', '#efe8de', '#80768a', '#ffffff', rough=0.9, cavity=0.6, edge=0.4, mottle=0.04,
             relief=creases((30, 30, 30), 0.0015))
GLOVE = paint('glove', '#ece6dc', '#6e6478', '#ffffff', cavity=0.6, edge=0.4, mottle=0.04)
INK = paint('ink', '#1c1224', '#06030a', '#3e2a48', cavity=0.2, edge=0.3, mottle=0.03, texel=3)
HAIR = paint('hair', '#2a1a26', '#08040a', '#6a4a62', rough=0.6, cavity=0.4, edge=0.5, streak=0.8, mottle=0.06)
OAK = paint('oak', '#cf9a5c', '#5a3214', '#f6d49a', rough=0.6, cavity=0.6, edge=0.6, streak=0.9, mottle=0.1,
            relief=grain)
OAKD = paint('oak_dark', '#7c4a22', '#24120a', '#c08a52', rough=0.5, cavity=0.6, edge=0.7, streak=0.7, mottle=0.08)
SPIRIT = paint('spirit', '#ffa82a', '#7a4000', '#ffc860', cavity=0.0, edge=0.0, mottle=0.03, keep=True)
EMBER = paint('ember', '#ffa424', '#b05000', '#ffd070', cavity=0.1, edge=0.2, mottle=0.03, glow=1.2)
HARL = paint('harlequin', '#c8903a', '#7a4a14', '#f2c474', cavity=0.0, edge=0.0, mottle=0.06)
VOID = void()

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


def solidify(ob, thickness, offset=-1.0, inner=None, even=True):
    mod = ob.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = thickness
    mod.offset = offset
    mod.use_even_offset = even
    if inner:
        ob.data.materials.append(inner)
        mod.material_offset = 1
    ob.modifiers.move(len(ob.modifiers) - 1, 0)
    return ob


def grid(name, rows, cols, at, mat, levels=1, mask=None, wrap=False):
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


def weld(ob):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def lathe(name, rings, sides, mat, sy=1.0, phase=0.0, close_top=False, close_bottom=False, shape=None, mask=None,
          levels=0):
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
    return weld(ob)


def drop_faces(ob, keep):
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep(f.calc_center_median())], context='FACES')
    bm.to_mesh(ob.data)
    bm.free()
    return ob


def frames(path):
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


def blob(name, loc, radius, mat, scale=(1, 1, 1), subdiv=2, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=radius, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    ob.scale = scale
    return assign(smooth(ob), mat)


def torus(name, loc, rot, major, minor, mat, segs=32, minor_segs=6):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=segs,
                                     minor_segments=minor_segs, location=loc, rotation=rot)
    ob = bpy.context.object
    ob.name = name
    return assign(smooth(ob), mat)


def ribbon(name, path, widths, side, mat, thickness=0.012, belly=0.008, notch=0.0, mask=None, levels=1):
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
    pts = sorted(table, key=lambda p: p[1])
    if z <= pts[0][1]:
        return pts[0][0]
    for (r0, z0), (r1, z1) in zip(pts, pts[1:]):
        if z <= z1:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return pts[-1][0]


def stud(name, c, n, t, w, h, rise, mat):
    """A raised diamond on a surface at `c` (normal `n`), its long axis `h` across the band and `w` along `t`."""
    n = n.normalized()
    t = (t - n * t.dot(n)).normalized()
    u = n.cross(t)
    base = c + n * 0.001
    vs = [base + t * w, base + u * h, base - t * w, base - u * h, c + n * rise]
    return build(name, vs, [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (3, 2, 1, 0)], mat)


def transform(obs, m):
    for ob in obs:
        ob.matrix_world = m @ ob.matrix_world


def created_since(before):
    return [o for o in bpy.data.objects if o not in before]


# ---------------------------------------------------------------- the tailcoat
# A cutaway tailcoat: the front ends at the waist and the hem sweeps back down to two long tails split at the back.
# The section squares off at the shoulders (the Heights' squared frame) and rounds again at the neck.
COAT_R = [(0.2, 0.06), (0.19, 0.2), (0.17, 0.38), (0.148, 0.54), (0.14, 0.63), (0.15, 0.74), (0.17, 0.86),
          (0.198, 0.96), (0.205, 1.01), (0.19, 1.055), (0.14, 1.095), (0.085, 1.12)]
SY = 0.74
TOP = 1.12


def coat_n(z):
    return 2 + 2.2 * smoothstep(0.82, 0.98, z) * smoothstep(1.11, 1.04, z)


def hem(a):
    c = (1 + math.cos(a)) / 2
    back = abs(((a % (2 * math.pi)) - math.pi))
    split = 0.2 * max(0.0, 1 - back / 0.14)
    return 0.07 + 0.45 * c ** 1.6 + split


def opening(z):
    """Half-angle of the coat's open front at height z: wide at the throat, narrow over the chest, opening again at
    the waist where the cutaway starts."""
    return interp([(0.5, 0.55), (0.42, 0.72), (0.36, 0.86), (0.36, 0.98), (0.52, 1.12)], z)


def coat_at(a, z, out=0.0):
    r = interp(COAT_R, z) + out
    n = coat_n(z)
    e = 2 / n
    s, c = math.sin(a), math.cos(a)
    fold = 1 + 0.06 * smoothstep(0.5, 0.1, z) * math.sin(9 * a + 0.5)
    x = r * fold * math.copysign(abs(s) ** e, s)
    y = -r * fold * SY * math.copysign(abs(c) ** e, c)
    return Vector((x, y, z))


def coat_normal(a, z):
    p = coat_at(a, z)
    da = coat_at(a + 1e-3, z) - p
    dz = coat_at(a, z + 1e-3) - p
    n = da.cross(dz).normalized()
    return n if n.dot(Vector((p.x, p.y, 0))) >= 0 else -n


ROWS = [0.0, 0.04, 0.09, 0.2, 0.36, 0.52, 0.66, 0.78, 0.88, 0.95, 1.0]
COLS = 28


def coat_param(i, j):
    t = ROWS[i]
    s = j / (COLS - 1)
    z = 0.8
    for _ in range(3):
        w = opening(z)
        a = w + (2 * math.pi - 2 * w) * s
        h = hem(a)
        z = h + (TOP - h) * t
    return a, z


def coat_vert(i, j, out=0.0):
    a, z = coat_param(i, j)
    return coat_at(a, z, out)


coat = grid('coat', len(ROWS), COLS, coat_vert, MAIN, levels=1, mask=lambda i, j: float(i <= 1))
solidify(coat, 0.012, inner=DARK)

# Harlequin trim: brass diamonds tip to tip along the dark hem band, over one brass piping.
N_HEM = 64
for k in range(N_HEM):
    s = (k + 0.5) / N_HEM
    a0 = opening(0.6)
    a = a0 + (2 * math.pi - 2 * a0) * s
    z = hem(a) + 0.03
    p = coat_at(a, z, 0.004)
    n = coat_normal(a, z)
    t = coat_at(a + 0.01, z) - coat_at(a - 0.01, z)
    stud('trim', p, n, t, 0.5 * (2 * math.pi - 2 * a0) / N_HEM * interp(COAT_R, z) * 0.95, 0.017, 0.006,
         BRASS)
sweep('hem_piping', [coat_at(a, hem(a) + 0.003, 0.004) for a in
                     [opening(0.6) + (2 * math.pi - 2 * opening(0.6)) * s / 40 for s in range(41)]],
      0.005, 8, TRIM, caps=False)

# Lapels: dark satin strips folded back along the open front, piped in brass, from the throat to the waist.
for sx in (-1, 1):
    edge = []
    lap = []
    zs = [0.63 + (TOP - 0.63) * k / 10 for k in range(11)]
    for z in zs:
        w = opening(z)
        a = w if sx > 0 else 2 * math.pi - w
        edge.append(coat_at(a, z, 0.006))
    width = lambda z: 0.022 + 0.05 * smoothstep(0.66, 0.98, z) * smoothstep(1.13, 1.02, z)

    def lapel_at(i, j, zs=zs, sx=sx):
        z = zs[i]
        w = opening(z)
        a = w if sx > 0 else 2 * math.pi - w
        wa = width(z) / interp(COAT_R, z)
        return coat_at(a + sx * wa * j / 2 - sx * 0.01, z, 0.014 + 0.006 * (1 - j / 2) - 0.004 * (j == 2))

    solidify(grid('lapel', len(zs), 3, lapel_at, SATIN, levels=1), 0.005, offset=1.0)
    sweep('lapel_piping', [lapel_at(i, 0) + coat_normal(opening(z) if sx > 0 else -opening(z), z) * 0.006
                           for i, z in enumerate(zs)], 0.0045, 8, TRIM)
    sweep('lapel_outer', [lapel_at(i, 2) + coat_normal(opening(z) if sx > 0 else -opening(z), z) * 0.004
                          for i, z in enumerate(zs)], 0.003, 8, TRIM)

# Squared shoulder boards in ochre with brass edges.
for sx in (-1, 1):
    p = Vector((sx * 0.172, 0.0, 1.05))
    blob('shoulder', p, 0.06, MAIN, scale=(1.12, 0.85, 0.3), subdiv=2)
    sweep('shoulder_edge', [p + Vector((sx * 0.069 * math.cos(t) * 0.0 + sx * 0.066, 0.055 * math.sin(t), -0.004 * math.cos(t)))
                            for t in [math.pi * (k / 10 - 0.5) for k in range(11)]], 0.006, 6, BRASS)
    for k in range(5):
        y = -0.042 + 0.021 * k
        tip = p + Vector((sx * 0.07, y, -0.012))
        sweep('fringe', [tip, tip + Vector((sx * 0.006, 0, -0.035))], [0.006, 0.0045], 5, BRASS)

# Back: two brass buttons at the waist where the tails part.
for sx in (-1, 1):
    blob('back_button', coat_at(math.pi + sx * 0.18, 0.62, 0.008), 0.011, BRASS, scale=(1, 0.6, 1))

# ---------------------------------------------------------------- waistcoat, trousers, shoes
WC = [(0.0, 0.56), (0.11, 0.565), (0.125, 0.6), (0.13, 0.66), (0.138, 0.74), (0.15, 0.86), (0.166, 0.96),
      (0.17, 1.04), (0.12, 1.1), (0.07, 1.13), (0.0, 1.14)]
lathe('waistcoat', WC, 28, DARK, sy=SY * 0.95, levels=0)
for k, z in enumerate((0.66, 0.73, 0.8, 0.87)):
    r = interp(WC[1:-1], z)
    blob('button', Vector((0, -r * SY * 0.95 - 0.004, z)), 0.012, BRASS, scale=(1, 0.55, 1))
# Harlequin: ochre diamonds checkered over the dark waistcoat front, painted in by the bake.
WSY = SY * 0.95
DW, DH2 = 0.024, 0.04
for jz in range(-1, 8):
    for ix in range(-4, 5):
        x, z = 2 * DW * ix, 0.62 + 2 * DH2 * jz
        r = interp(WC[1:-1], z)
        if not 0.6 < z < 1.06 or abs(x) > r * 0.8:
            continue
        a = math.asin(x / r)
        drdz = (interp(WC[1:-1], z + 0.01) - interp(WC[1:-1], z - 0.01)) / 0.02
        n = Vector((math.sin(a), -math.cos(a) / WSY, 0)).normalized()
        n = (n - Vector((0, 0, drdz))).normalized()
        c = Vector((r * math.sin(a), -r * math.cos(a) * WSY, z)) + n * 0.003
        stud('harlequin', c, n, Vector((math.cos(a), math.sin(a) * WSY, 0)), DW * 0.97, DH2 * 0.97, 0.0015, HARL)
# A watch chain swags across the waistcoat to a little brass bell, the Heights' hour.
chain = bezier((-0.08, -0.1, 0.72), (-0.05, -0.135, 0.66), (0.04, -0.135, 0.66), (0.085, -0.095, 0.71), 12)
sweep('watch_chain', chain, 0.0032, 5, BRASS)
blob('fob', Vector((0.0, -0.125, 0.645)), 0.012, BRASS, scale=(1, 0.8, 1.2))

blob('hips', Vector((0, 0.0, 0.57)), 0.12, DARK, scale=(1.0, 0.72, 0.6), subdiv=2)
for sx in (-1, 1):
    leg = [Vector((sx * 0.066, 0.0, 0.56)), Vector((sx * 0.068, -0.005, 0.38)), Vector((sx * 0.064, 0.0, 0.2)),
           Vector((sx * 0.06, -0.01, 0.035))]
    sweep('leg', leg, [0.058, 0.05, 0.042, 0.036], 12, DARK, levels=1)
    # Pin-stripes, painted in by the bake.
    for k in range(6):
        a = 2 * math.pi * k / 6
        hi(sweep('stripe', [q + Vector((math.cos(a), math.sin(a) * 0.9, 0)) * (r + 0.001) for q, r in
                            zip(leg, [0.058, 0.05, 0.042, 0.036])], 0.0018, 4, SATIN))
    shoe = blob('shoe', Vector((sx * 0.062, -0.035, 0.032)), 0.04, SATIN, scale=(0.9, 1.75, 0.72), subdiv=2)
    sweep('shoe_toe', bezier((sx * 0.062, -0.08, 0.03), (sx * 0.062, -0.11, 0.03), (sx * 0.062, -0.125, 0.04),
                             (sx * 0.06, -0.128, 0.058), 5), [0.02, 0.016, 0.012, 0.009, 0.006, 0.004], 8, SATIN)
    blob('buckle', Vector((sx * 0.062, -0.075, 0.058)), 0.013, BRASS, scale=(1.2, 0.5, 0.8))

# ---------------------------------------------------------------- stock
# A dark satin stock round the throat, under the jabot that is added at the cast's proportions below.
lathe('stock', [(0.05, 1.09), (0.058, 1.11), (0.056, 1.15), (0.05, 1.19), (0.04, 1.215)], 18, SATIN, sy=0.95, levels=1)

# A team sash wound round the waist under the coat, knotted on the right hip, two tails hanging down the trousers.
lathe('sash', [(0.122, 0.575), (0.134, 0.59), (0.138, 0.64), (0.13, 0.655)], 28, TEAM, sy=SY * 0.97, levels=1)
SK = Vector((-0.1, -0.075, 0.615))
blob('sash_knot', SK, 0.03, TEAM, scale=(1.0, 0.75, 1.1), subdiv=3)
for dx, length in ((-0.016, 0.25), (0.018, 0.2)):
    path = [SK + Vector((dx * math.sin(math.pi / 2 * k / 5) - 0.004 * k, -0.012 - 0.002 * k, -length * k / 5)) for k in range(6)]
    ribbon('sash_tail', path, [0.046, 0.048, 0.05, 0.052, 0.054, 0.056], (1, 0, 0.0), TEAM, thickness=0.006,
           belly=0.0, notch=0.022, mask=lambda i: float(i == 5))

# ---------------------------------------------------------------- the tall stand collar
C_LO, C_HI = 1.07, 1.5
C_SPAN = 2.15
C_COLS = 19


def collar_at(i, j, out=0.0):
    t = i / 4
    u = 2 * j / (C_COLS - 1) - 1
    a = math.pi + C_SPAN * u
    r = 0.1 + 0.2 * t ** 1.5 + out
    z = C_LO + (C_HI - C_LO) * t + 0.06 * t * abs(u) ** 4 - 0.01 * t * (1 - abs(u))
    return Vector((r * math.sin(a), 0.01 - r * math.cos(a) * 0.85, z))


solidify(grid('collar', 5, C_COLS, collar_at, MAIN, levels=1), 0.012, offset=1.0, inner=DARK)
sweep('collar_rim', [collar_at(4, j, 0.006) for j in range(C_COLS)], 0.006, 8, TRIM)
for j in (0, C_COLS - 1):
    sweep('collar_edge', [collar_at(i, j, 0.0) for i in range(5)], 0.006, 8, TRIM)
for j in range(2, C_COLS - 2, 2):
    a = collar_at(4, j, 0.008)
    hi(stud('collar_dia', a + Vector((0, 0, -0.03)), Vector((a.x, a.y, 0)), Vector((0, 0, 1)), 0.016, 0.01, 0.003,
            BRASS))

# ---------------------------------------------------------------- chibi proportions
# Everything above was drawn at a tall, thin scale; squash it toward the cast: the legs to 63%, the torso to 92%,
# the collar carried down unchanged. Small hard parts only ride along, so buttons and buckles stay round.


def fz(z):
    if z < 0.6:
        return z * 0.63
    if z < 1.12:
        return 0.378 + (z - 0.6) * 0.92
    return z - 1.12 + 0.8564


RIGID = {'button', 'back_button', 'fob', 'sash_knot', 'fringe', 'trim'}
STILL = {'shoe', 'shoe_toe', 'buckle'}
for ob in [o for o in bpy.data.objects if o.type == 'MESH']:
    key = ob.name.split('.')[0]
    if key in STILL:
        continue
    bpy.context.view_layer.update()
    M = ob.matrix_world.copy()
    if key in RIGID:
        c = sum((M @ v.co for v in ob.data.vertices), Vector()) / len(ob.data.vertices)
        dz = fz(c.z) - c.z
        for v in ob.data.vertices:
            v.co = M.inverted() @ (M @ v.co + Vector((0, 0, dz)))
        continue
    Mi = M.inverted()
    for v in ob.data.vertices:
        w = M @ v.co
        w.z = fz(w.z)
        v.co = Mi @ w

# Spats over the shoes and a brass stripe down each trouser leg break up the dark legs.
for sx in (-1, 1):
    LEG = [(Vector((sx * 0.066, 0.0, 0.56)), 0.058), (Vector((sx * 0.068, -0.005, 0.38)), 0.05),
           (Vector((sx * 0.064, 0.0, 0.2)), 0.042), (Vector((sx * 0.06, -0.01, 0.035)), 0.036)]
    sweep('stripe_trim', [Vector((q.x + sx * (r + 0.002), q.y, fz(q.z))) for q, r in LEG[:-1]] +
          [Vector((sx * 0.06 + sx * 0.04, -0.01, 0.1))], 0.0045, 8, TRIM)
    spat = sweep('spat', [Vector((sx * 0.06, -0.012, 0.035)), Vector((sx * 0.061, -0.01, 0.075)),
                          Vector((sx * 0.062, -0.008, 0.12))], [0.047, 0.043, 0.041], 14, LACE, levels=1)
    for k in range(3):
        blob('spat_button', Vector((sx * 0.104, -0.018, 0.05 + 0.028 * k)), 0.0075, BRASS, subdiv=1)
    sweep('spat_strap', [Vector((sx * 0.06 + sx * 0.035 * math.cos(t), -0.04 + 0.03 * math.sin(t) - 0.02, 0.03))
                         for t in [math.pi * k / 8 for k in range(9)]], 0.005, 6, LACE)

# The jabot: three tiers of ruffled team lace cascading from under the chin over the waistcoat, so the throat reads as
# a cravat and not as a long neck.
for k in range(3):
    z0, r1 = 0.935 - 0.04 * k, 0.05 + 0.008 * k

    def jabot_at(i, j, z0=z0, r1=r1):
        a = -1.35 + 2.7 * j / 15
        t = float(i)
        r = 0.022 + (r1 - 0.022) * t + 0.006 * t * math.sin(5.5 * a)
        return Vector((r * math.sin(a) * 1.1, -0.034 - r * math.cos(a), z0 - 0.045 * t))

    solidify(grid('jabot', 2, 16, jabot_at, TEAM, levels=1, mask=lambda i, j: float(i == 1)), 0.004, offset=0.0)
blob('cravat_knot', Vector((0, -0.058, 0.94)), 0.022, TEAM, scale=(1.25, 0.8, 0.85), subdiv=3)

# ---------------------------------------------------------------- head, mask, hat


def face(H, RX, RY, RZ, s, mirror, before):
    """A porcelain mask moulded over an ellipsoid head at H: almond eye holes, a black harlequin diamond over one eye
    and a glowing tear under the other, a smile that lifts on the diamond side and dips on the tear side, a brass rim.
    `s` scales the features; `mirror` swaps the sides. Returns the head's objects."""
    def jaw(z):
        return 1 - 0.22 * smoothstep(-0.01 * s, -RZ, z)

    def bump(dx, sx, dz, sz):
        return math.exp(-(dx / sx) ** 2 - (dz / sz) ** 2)

    def features(x, z):
        x, z = x / s, z / s
        ax = abs(x)
        brow = 0.007 * math.exp(-((z - 0.04) / 0.014) ** 2) * max(0.0, 1 - (x / 0.07) ** 2)
        t = smoothstep(-0.008, -0.045, z) * smoothstep(-0.062, -0.05, z)
        nose = 0.016 * t * math.exp(-(x / (0.007 + 0.006 * t)) ** 2)
        cheek = 0.008 * bump(ax - 0.048, 0.022, z + 0.03, 0.02)
        chin = 0.008 * bump(x, 0.024, z + 0.1, 0.014)
        return (brow + nose + cheek + chin) * s

    def on_mask(x, z, out=0.0):
        q = max(0.0, 1 - (x / (RX * jaw(z))) ** 2 - (z / RZ) ** 2)
        return Vector((H.x + x, H.y - RY * math.sqrt(q) - features(x, z) - 0.003 * s - out, H.z + z))

    def skull_at(ph, z):
        q = math.sqrt(max(0.0, 1 - (z / RZ) ** 2))
        return Vector((H.x + RX * jaw(z) * q * math.sin(ph), H.y - RY * q * math.cos(ph), H.z + z))

    m_top, m_bot, m_w = 0.11 * s, -0.115 * s, 0.088 * s

    def mask_xz(a, b):
        x, v = a * math.sqrt(1 - b * b / 2), b * math.sqrt(1 - a * a / 2)
        z = (m_top + m_bot) / 2 + v * (m_top - m_bot) / 2
        return x * m_w * jaw(z), z

    def under_mask(c):
        x, z = c.x - H.x, c.z - H.z
        v = (z - (m_top + m_bot) / 2) / ((m_top - m_bot) / 2)
        return c.y < H.y - 0.03 * s and (x / (m_w * jaw(z))) ** 2 + v * v < 0.75

    sk_z = [RZ * math.cos(math.pi * i / 13) for i in range(1, 13)]
    skull = grid('skull', len(sk_z), 22, lambda i, j: skull_at(2 * math.pi * j / 22, sk_z[-1 - i]), HAIR, levels=1 if s > 0.8 else 0,
                 wrap=True)
    drop_faces(skull, lambda c: not under_mask(c))
    N = 13 if s > 0.8 else 9

    def mask_at(i, j):
        a, b = -1 + 2 * j / (N - 1), -1 + 2 * i / (N - 1)
        return on_mask(*mask_xz(a, b), -0.006 * s * smoothstep(0.75, 1.0, max(abs(a), abs(b))))

    grid('mask', N, N, mask_at, PORC, levels=1)
    ring = [mask_xz(math.cos(t), math.sin(t)) for t in [2 * math.pi * k / 28 for k in range(29)]]
    sweep('mask_rim', [on_mask(x * 0.995, z * 0.995, -0.004 * s) for x, z in ring], 0.0035 * s, 6, BRASS, caps=False)

    m = -1 if mirror else 1
    ex, ez = 0.036 * s, 0.016 * s
    # The black diamond over the right eye (left, mirrored): drawn on the porcelain.
    dx = -m * ex
    D = 6

    def dia_at(i, j):
        u, v = -1 + 2 * j / (D - 1), -1 + 2 * i / (D - 1)
        # unit square to diamond
        x = (u - v) / 2 * 0.03 * s
        z = (u + v) / 2
        z = z * (0.055 * s if z > 0 else 0.06 * s)
        return on_mask(dx + x, ez + z, 0.0006)

    grid('diamond', D, D, dia_at, INK, levels=0)
    for sx in (-1, 1):
        cx = sx * ex

        def eye_at(i, j, cx=cx):
            t = 2 * math.pi * j / 16
            w, h = 0.019 * s, 0.009 * s
            k = (1, 0.5, 0.0)[i]
            # almond: pointed at the ends, lifted at the outer corner
            x = cx + w * math.cos(t) * k
            z = ez + h * math.sin(t) * (abs(math.sin(t)) ** 0.3) * k + 0.004 * s * (x - cx) / w * (cx / abs(cx)) * k
            return on_mask(x, z, 0.0012 - 0.002 * (1 - k))

        weld(grid('eye', 3, 16, eye_at, VOID, levels=0, wrap=True))
        blob('pupil', on_mask(cx, ez + 0.001 * s, 0.003), 0.0042 * s, EMBER, scale=(1, 0.5, 1), subdiv=1)
    # The tear under the other eye, amber like the strings.
    tx = m * ex
    blob('tear', on_mask(tx + m * 0.004 * s, ez - 0.036 * s, 0.002), 0.011 * s, EMBER, scale=(0.75, 0.45, 1.3),
         subdiv=2)
    blob('tear2', on_mask(tx + m * 0.002 * s, ez - 0.014 * s, 0.0015), 0.005 * s, EMBER, scale=(0.8, 0.5, 1),
         subdiv=1)
    # The mouth: lifts on the diamond side, dips on the tear side.
    mouth = []
    for k in range(13):
        u = -1 + 2 * k / 12
        x = u * 0.03 * s
        z = -0.075 * s + 0.006 * s * u * u + -m * 0.007 * s * u * abs(u)
        mouth.append(on_mask(x, z, 0.0012))
    hi(sweep('mouth', mouth, [0.0018 * s * (0.4 + 0.6 * math.sin(math.pi * k / 12)) + 0.0005 for k in range(13)], 5, INK))
    # Slicked hair: a few raised locks swept back over the skull, painted in by the bake.
    for k in range(9):
        ph = -1.3 + 2.6 * k / 8
        hi(sweep('lock', [skull_at(ph * (1 + 0.6 * q / 6), RZ * (0.85 - 0.25 * q / 6) * 1.0) + Vector((0, 0.03 * s * q / 6, 0))
                          for q in range(7)], 0.0035 * s, 4, HAIR))
    return created_since(before)


before = set(bpy.data.objects)
H = Vector((0, -0.016, 1.078))
face(H, 0.13, 0.134, 0.16, 1.32, False, before)
# Neck under the collar.


def top_hat(base, r, h, mat=SATIN, sides=36):
    """A small top hat whose brim sits at `base`: a curled brim, a crown flaring slightly to its top, a brass band."""
    lathe('brim', [(r * 0.62, base.z + 0.004), (r * 1.25, base.z + 0.0), (r * 1.62, base.z + 0.008),
                   (r * 1.66, base.z + 0.016), (r * 1.25, base.z + 0.01), (r * 0.62, base.z + 0.012)], sides, mat,
          shape=lambda i, j, x, y, z: (x + base.x, y * 0.92 + base.y, z), levels=0)
    sweep('brim_piping', [Vector((base.x + r * 1.64 * math.sin(t), base.y - r * 1.64 * 0.92 * math.cos(t), base.z + 0.012))
                          for t in [2 * math.pi * k / 24 for k in range(25)]], 0.0035 * r / 0.068, 4, TRIM, caps=False)
    lathe('crown', [(r * 1.0, base.z + 0.006), (r * 0.98, base.z + h * 0.5), (r * 1.06, base.z + h),
                    (r * 0.9, base.z + h + 0.004), (0.0, base.z + h + 0.006)], sides, mat,
          shape=lambda i, j, x, y, z: (x + base.x, y * 0.92 + base.y, z), levels=0)
    lathe('hat_band', [(r * 1.005, base.z + 0.012), (r * 1.01, base.z + 0.02), (r * 1.01, base.z + h * 0.32),
                       (r * 1.0, base.z + h * 0.34)], sides, BRASS,
          shape=lambda i, j, x, y, z: (x + base.x, y * 0.92 + base.y, z), levels=0)


hat_before = set(bpy.data.objects)
HB = Vector((0.0, -0.01, 1.22))
top_hat(HB, 0.068, 0.15)
transform(created_since(hat_before), Matrix.Translation(HB) @ Matrix.Translation((0.024, 0.016, 0.0)) @
          Matrix.Rotation(0.32, 4, 'Y') @ Matrix.Rotation(-0.18, 4, 'X') @ Matrix.Translation(-HB))
# The head turns toward the doll, tips back to meet the board camera and cocks to one side.
NECKP = Vector((0, -0.012, 0.93))
transform(created_since(before), Matrix.Translation(NECKP) @ Matrix.Rotation(0.25, 4, 'Z') @
          Matrix.Rotation(-0.16, 4, 'X') @ Matrix.Rotation(0.12, 4, 'Y') @ Matrix.Translation(-NECKP))

# ---------------------------------------------------------------- arms and hands
ARMS = {
    # shoulder, elbow, wrist, radii, ring where the cuff starts
    'r': (Vector((-0.19, 0.0, 0.775)), Vector((-0.29, 0.02, 0.6)), Vector((-0.34, -0.15, 0.6)),
          (0.056, 0.054, 0.052, 0.05, 0.047, 0.046, 0.05), 5),
    'l': (Vector((0.19, 0.0, 0.775)), Vector((0.33, 0.02, 0.72)), Vector((0.37, -0.05, 0.96)),
          (0.056, 0.054, 0.052, 0.05, 0.047, 0.046, 0.05), 5),
}
# Each arm hangs from a shoulder pivot, so an action can swing it without tearing the hand from the sleeve.
ENDS, ARM_OBS = {}, {}
for side, (s, e, w, radii, cuff) in ARMS.items():
    made = set(bpy.data.objects)
    path = bezier(s, s.lerp(e, 0.8), e.lerp(w, 0.3), w + (w - e) * 0.08, 6)
    sl = sweep(f'sleeve_{side}', path, radii, 10, MAIN, caps=False, levels=1, mask=lambda i, c=cuff: float(i >= c))
    solidify(sl, 0.01, inner=DARK, even=False)
    _, fr = frames(path)
    end = path[-1]
    d = (path[-1] - path[-2]).normalized()
    sweep('cuff_ring', [path[-2].lerp(path[-1], 0.45) + (fr[-2][0] * math.cos(a) + fr[-2][1] * math.sin(a)) * (radii[-2] + 0.003)
                        for a in [2 * math.pi * k / 20 for k in range(21)]], 0.004, 6, TRIM, caps=False)
    # A lace ruffle spills out of the cuff round the wrist.
    sv, uv = fr[-1]

    def ruff_at(i, j, end=end, d=d, sv=sv, uv=uv):
        a = 2 * math.pi * j / 40
        t = i / 2
        r = 0.032 + 0.03 * t + 0.008 * t * math.sin(10 * a)
        return end - d * 0.02 + d * (0.045 * t) + (sv * math.cos(a) + uv * math.sin(a)) * r

    solidify(grid('ruffle', 3, 40, ruff_at, LACE, levels=0, wrap=True), 0.004, offset=0.0)
    ENDS[side] = (end + d * 0.02, w - e)
    ARM_OBS[side] = created_since(made)

# Right hand: lifted palm down, fingers fanned wide and each curled its own way, as if plucking an unseen string:
# the index long, the middle dipping lowest, the little finger lifted. hands.hand() with a curl per finger.
def grace(wrist, forearm, palm, mat, curls, spreads, size, detail):
    a, L, P = hands._frame(forearm, palm=palm, right=True)
    f = forearm.normalized()
    t, pitch, plen = size * 1.1, 2 * size * 0.95, size * 6.0
    heel = wrist + f * size * 1.8
    knuckles = heel + L * plen
    fingers = []
    for fd, curl, spread in zip(hands.FINGERS, curls, spreads):
        rf = size * fd['r']
        lf = (L * math.cos(spread) + a * math.sin(spread)).normalized()
        length = size * 7.8 * fd['reach']
        segs = [(length * 0.45, curl * 0.5), (length * 0.3, curl * 0.9), (length * 0.25, curl * 0.6)]
        base = knuckles + a * (fd['at'] * pitch) - L * size * 0.6
        fingers.append(hands._finger(base, lf, P, rf, [(length * 0.05, 0.25 * curl)] + segs))
    w = 2.1 * pitch
    palm_pts = [knuckles - L * plen * k for k in (-0.1, 0.25, 0.65, 1.0)]
    wp, wr = hands._wrist(wrist, f, heel, w)
    lt = (L * 0.35 + a * 0.9 + P * 0.25).normalized()
    base = heel + L * plen * 0.3 + a * w * 0.5
    thumb = hands._finger(base, lt, P.lerp(-a, 0.3).normalized(), size * 1.18,
                       [(size * 2.6, 0.1), (size * 2.4, 0.35), (size * 2.0, 0.3)])
    hands._build('hand', mat, wp + palm_pts[::-1], wr + [(w * 0.88, t), (w * 0.97, t * 0.95), (w, t * 0.85), (w * 0.94, t * 0.7)],
              a, P, fingers, thumb, 6, detail, None, True)


def pivot(name, side, made):
    p = empty(name, ARMS[side][0])
    for ob in ARM_OBS[side] + [o for o in created_since(made) if o is not p]:
        parent(ob, p)
    return p


made = set(bpy.data.objects)
grace(ENDS['r'][0], ENDS['r'][1] + Vector((0, 0, -0.1)), Vector((0.15, -0.25, -1)), GLOVE,
      curls=(0.3, 0.95, 0.75, 0.12), spreads=(0.28, 0.0, -0.3, -0.62), size=0.0135, detail='glove')
arm_r = pivot('arm_r', 'r', made)
# Left hand: raised, closed from above on the control's main bar, which runs front to back.
BAR = Vector((0.0, 1.0, 0.0))
made = set(bpy.data.objects)
GRIP = fist(ENDS['l'][0], ENDS['l'][1], BAR, 0.014, GLOVE, right=False, size=0.0135, detail='glove')
arm_l = pivot('arm_l', 'l', made)

# ---------------------------------------------------------------- the control
weapon = empty('weapon', GRIP, arm_l)


def part(ob):
    return parent(ob, weapon)


Y = BAR.normalized()
X = Vector((1, 0, 0))
BACK, FRONT = GRIP + Y * 0.15, GRIP - Y * 0.18
part(sweep('main_bar', [BACK, GRIP, FRONT], 0.014, 10, OAK, levels=0))
for p, d in ((BACK, Y), (FRONT, -Y)):
    part(sweep('bar_cap', [p - d * 0.012, p, p + d * 0.01], [0.016, 0.018, 0.01], 10, BRASS))
CROSS = GRIP - Y * 0.13
CL, CR = CROSS - X * 0.17, CROSS + X * 0.17
part(sweep('cross_bar', [CL, CROSS + Vector((0, 0, -0.016)), CR], 0.013, 10, OAK))
part(blob('cross_pin', CROSS + Vector((0, 0, 0.006)), 0.022, BRASS, scale=(1, 1, 0.7)))
for p, d in ((CL, -X), (CR, X)):
    part(sweep('cross_cap', [p - d * 0.01, p, p + d * 0.012], [0.015, 0.017, 0.009], 10, BRASS))
    part(torus('eyelet', p + Vector((0, 0, -0.02)), (0, math.pi / 2, 0), 0.008, 0.0026, BRASS, segs=12, minor_segs=4))
# A little brass bell hangs from the back of the bar: the Heights still keep the hour.
bell = part(empty('bell_swing', BACK + Vector((0, 0, -0.01))))
parent(sweep('bell_cord', [BACK + Vector((0, 0, -0.01)), BACK + Vector((0, 0, -0.04))], 0.002, 4, BRASS), bell)
parent(lathe('bell', [(0.004, BACK.z - 0.04), (0.012, BACK.z - 0.046), (0.016, BACK.z - 0.064), (0.02, BACK.z - 0.072),
                    (0.0, BACK.z - 0.072)], 14, BRASS, shape=lambda i, j, x, y, z: (x + BACK.x, y + BACK.y, z)), bell)
loop(bell, 'rotation_euler', 0, [0.0, 0.12, 0.0, -0.12], 60)

# ---------------------------------------------------------------- the doll
DOLL = Vector((GRIP.x + 0.005, GRIP.y - 0.05, 0.0))
DOLL_YAW = -0.35
DM = Matrix.Translation(DOLL) @ Matrix.Rotation(DOLL_YAW, 4, 'Z')
doll_before = set(bpy.data.objects)
for sx in (-1, 1):
    blob('doll_foot', Vector((sx * 0.04, -0.014, 0.018)), 0.022, OAKD, scale=(0.9, 1.5, 0.75))
    knee = Vector((sx * 0.044, -0.012, 0.148))
    sweep('doll_shin', [Vector((sx * 0.04, 0.0, 0.03)), knee], [0.016, 0.019], 10, OAK)
    blob('doll_knee', knee, 0.022, OAKD)
    sweep('doll_thigh', [knee, Vector((sx * 0.042, 0.0, 0.27))], [0.02, 0.025], 10, OAK)
    blob('doll_hip', Vector((sx * 0.042, 0.0, 0.272)), 0.025, OAKD)
blob('doll_pelvis', Vector((0, 0, 0.29)), 0.058, OAK, scale=(1, 0.8, 0.6))
lathe('doll_torso', [(0.0, 0.28), (0.05, 0.29), (0.062, 0.34), (0.066, 0.4), (0.058, 0.445), (0.03, 0.47),
                     (0.0, 0.475)], 16, OAK, sy=0.8, levels=1)
# A zigzag harlequin tunic: ochre, its pointed hem in the dark accent.
TUN = [(0.088, 0.255), (0.082, 0.29), (0.072, 0.34), (0.072, 0.4), (0.064, 0.445), (0.044, 0.468)]
lathe('doll_tunic', TUN, 24, MAIN, sy=0.82, levels=1, mask=lambda i, j: float(i == 0 or (i == 1 and j % 4 == 0)),
      shape=lambda i, j, x, y, z: (x, y, z + (0.022 * (1 - abs((j % 4) / 2 - 1)) if i == 0 else 0.0)))
for k, z in enumerate((0.33, 0.38, 0.43)):
    blob('doll_button', Vector((0, -0.072 * 0.82 - 0.004 + 0.004 * k, z)), 0.007, BRASS, scale=(1, 0.6, 1), subdiv=1)


def ruff_shape(i, j, x, y, z):
    a = 2 * math.pi * j / 24
    k = 1 + 0.18 * math.sin(12 * a) * (i == 1)
    return (x * k, y * k, z)


solidify(lathe('doll_ruff', [(0.03, 0.47), (0.078, 0.462)], 24, LACE, shape=ruff_shape, levels=1), 0.006, offset=0)
sweep('doll_neck', [Vector((0, 0, 0.46)), Vector((0, 0, 0.5))], 0.017, 10, OAKD)
# The team bow at the throat.
BOW = Vector((0, -0.052, 0.468))
for sx in (-1, 1):
    blob('bow_loop', BOW + Vector((sx * 0.022, -0.004, 0.006)), 0.016, TEAM, scale=(1.3, 0.55, 0.8))
    ribbon('bow_tail', [BOW + Vector((sx * 0.006, -0.008, -0.004)), BOW + Vector((sx * 0.014, -0.014, -0.03)),
                        BOW + Vector((sx * 0.02, -0.014, -0.058))], [0.014, 0.016, 0.018], (1, 0, 0), TEAM,
           thickness=0.005, belly=0.002, notch=0.008)
blob('bow_knot', BOW + Vector((0, -0.009, 0.004)), 0.01, TEAM, scale=(1, 0.8, 1))
# Arms: lifted on their strings, elbows out.
DHAND = {}
for sx in (-1, 1):
    sh = Vector((sx * 0.078, 0.0, 0.438))
    el = Vector((sx * 0.13, -0.02, 0.37))
    wr = Vector((sx * 0.135, -0.06, 0.445))
    blob('doll_shoulder', sh, 0.023, OAKD)
    sweep('doll_upper', [sh, el], [0.018, 0.016], 10, OAK)
    blob('doll_elbow', el, 0.018, OAKD)
    sweep('doll_fore', [el, wr], [0.015, 0.013], 10, OAK)
    blob('doll_wrist', wr, 0.012, OAKD)
    hpos = wr + (wr - el).normalized() * 0.022
    blob('doll_hand', hpos, 0.019, OAK, scale=(0.8, 0.55, 1.15), rot=(0.4, 0, sx * 0.3))
    DHAND[sx] = hpos + Vector((0, 0, 0.02))
DH = Vector((0, 0, 0.575))
head_before = set(bpy.data.objects)
face(DH, 0.074, 0.077, 0.088, 0.74, True, head_before)
hb = set(bpy.data.objects)
DHB = DH + Vector((0, 0, 0.08))
top_hat(DHB, 0.037, 0.08, sides=24)
transform(created_since(hb), Matrix.Translation(DHB) @ Matrix.Translation((-0.012, 0.006, 0)) @
          Matrix.Rotation(-0.3, 4, 'Y') @ Matrix.Translation(-DHB))
# The puppet's head lolls to the side, the way a doll's head hangs between its strings.
transform(created_since(head_before), Matrix.Translation(Vector((0, 0, 0.49))) @ Matrix.Rotation(-0.24, 4, 'Y') @
          Matrix.Rotation(-0.12, 4, 'X') @ Matrix.Translation(-Vector((0, 0, 0.49))))
HEAD_TOP = Matrix.Translation(Vector((0, 0, 0.49))) @ Matrix.Rotation(-0.24, 4, 'Y') @ Matrix.Rotation(-0.12, 4, 'X') @ \
    Matrix.Translation(-Vector((0, 0, 0.49)))
transform(created_since(doll_before), DM)

# ---------------------------------------------------------------- strings
# The doll and its strings dangle together from a pivot under the cross, so the doll can sway on them while the string
# tops stay at the control.
made = set(bpy.data.objects)
for p, q in ((CL, DM @ DHAND[-1]), (CR, DM @ DHAND[1]),
             (FRONT + Vector((0, 0, -0.016)), DM @ (HEAD_TOP @ Vector((-0.055, -0.01, 0.62)))),
             (BACK + Vector((0, 0, -0.016)), DM @ (HEAD_TOP @ Vector((0.06, 0.02, 0.62))))):
    p = Vector(p)
    sweep('string', [p.lerp(q, k / 6) for k in range(7)], 0.0028, 5, SPIRIT, caps=False)
    glow(q, AMBER, 0.06, name='glow_knot')
glow(DM @ Vector((0, 0, 0.4)), AMBER, 0.22, name='glow_doll')
doll = part(empty('doll', CROSS))
for ob in created_since(doll_before) + created_since(made):
    if ob is not doll:
        parent(ob, doll)
part(glow(CROSS, AMBER, 0.16, name='glow_control'))
loop(doll, 'rotation_euler', 0, [0.0, 0.03, 0.0, -0.03], 88)
loop(doll, 'rotation_euler', 1, [0.0, -0.035, 0.0, 0.035], 136)

breath = loop(empty('breath'), 'scale', 2, [1.0, 1.01], 96)
for ob in list(bpy.data.objects):
    if ob.parent is None and ob is not breath:
        parent(ob, breath)

# Actions, keyed as offsets from rest. The figure faces -Y. -x on an arm swings its hand forward and up; -y lifts the left
# arm out to the side, +y the right. -x on `weapon` flings the doll forward off the ground, +x draws it back; the doll
# sways on its strings about the cross. +x on `breath` leans the body forward.
R, S = 'rotation_euler', 'scale'
# Cast: the control hoisted and twisted, the doll lifted and spun round under it, the right hand flourishing at the top.
act('cast', 10, {
    (arm_l, R, 0): [(0, 0), (6, -0.3), (10, -0.38), (14, -0.3), (22, 0)],
    (arm_l, R, 1): [(0, 0), (6, -0.18), (10, -0.22), (22, 0)],
    (weapon, R, 0): [(0, 0), (6, 0.12), (10, -0.32), (14, -0.2), (22, 0)],
    (doll, R, 1): [(0, 0), (6, 0.18), (10, -0.28), (14, 0.16), (18, -0.06), (22, 0)],
    (weapon, R, 2): [(0, 0), (6, -0.5), (10, 0.7), (14, -0.25), (22, 0)],
    (arm_r, R, 1): [(0, 0), (6, 0.3), (10, 0.42), (14, 0.36), (22, 0)],
    (arm_r, R, 0): [(0, 0), (6, -0.25), (10, -0.32), (22, 0)],
    (breath, R, 0): [(0, 0), (6, -0.05), (10, 0.04), (22, 0)],
    (bell, R, 0): [(0, 0), (6, 0.4), (10, -0.6), (13, 0.4), (16, -0.2), (22, 0)],
})
# Attack: the control drawn back, then jerked forward so the doll swings out and kicks.
act('attack', 8, {
    (arm_l, R, 0): [(0, 0), (4, 0.15), (8, -0.22), (11, -0.14), (16, 0)],
    (weapon, R, 0): [(0, 0), (4, 0.22), (8, -0.48), (11, -0.3), (16, 0)],
    (doll, R, 0): [(0, 0), (4, 0.12), (8, -0.14), (10, 0.1), (13, -0.04), (16, 0)],
    (breath, R, 0): [(0, 0), (4, -0.06), (8, 0.1), (16, 0)],
    (arm_r, R, 1): [(0, 0), (4, 0.12), (8, -0.1), (16, 0)],
    (bell, R, 0): [(0, 0), (4, -0.4), (8, 0.7), (11, -0.4), (16, 0)],
})
act('hit', 2, {
    (breath, R, 0): [(0, 0), (2, -0.12), (6, 0.03), (12, 0)],
    (arm_l, R, 0): [(0, 0), (2, 0.15), (7, -0.03), (12, 0)],
    (arm_r, R, 1): [(0, 0), (2, -0.2), (7, 0.05), (12, 0)],
    (doll, R, 0): [(0, 0), (2, 0.3), (5, -0.22), (8, 0.12), (12, 0)],
    (doll, R, 1): [(0, 0), (3, -0.2), (6, 0.15), (9, -0.06), (12, 0)],
    (bell, R, 0): [(0, 0), (2, 0.6), (5, -0.4), (8, 0.2), (12, 0)],
})
# Move loops while the unit travels: a stalking sway, the doll hopping along on its strings.
act('move', 0, {
    (breath, R, 0): [(0, 0.04), (6, 0.06), (12, 0.04)],
    (breath, R, 1): [(0, 0), (3, 0.05), (6, 0), (9, -0.05), (12, 0)],
    (weapon, R, 0): [(0, 0), (3, -0.1), (6, 0), (9, -0.1), (12, 0)],
    (doll, R, 1): [(0, 0), (3, 0.12), (6, 0), (9, -0.12), (12, 0)],
    (bell, R, 0): [(0, 0.2), (6, -0.2), (12, 0.2)],
})
# Down holds its last frame while the unit is downed; rise starts from that frame. The control sags and the doll slumps
# against it, still on its feet.
DOWNED = {(breath, S, 2): -0.2, (breath, R, 0): -0.15, (arm_l, R, 0): 0.1, (arm_l, R, 1): 0.06, (arm_r, R, 1): -0.2,
          (doll, R, 1): -0.22}
act('down', 10, {
    (breath, S, 2): [(0, 0), (5, -0.12), (14, DOWNED[breath, S, 2])],
    (breath, R, 0): [(0, 0), (5, 0.08), (14, DOWNED[breath, R, 0])],
    (arm_l, R, 0): [(0, 0), (5, -0.15), (14, DOWNED[arm_l, R, 0])],
    (arm_l, R, 1): [(0, 0), (14, DOWNED[arm_l, R, 1])],
    (arm_r, R, 1): [(0, 0), (14, DOWNED[arm_r, R, 1])],
    (doll, R, 1): [(0, 0), (6, 0.12), (10, -0.3), (14, DOWNED[doll, R, 1])],
    (bell, R, 0): [(0, 0), (6, -0.4), (10, 0.3), (14, 0)],
})
act('rise', 8, {
    (breath, S, 2): [(0, DOWNED[breath, S, 2]), (8, 0.04), (14, 0)],
    (breath, R, 0): [(0, DOWNED[breath, R, 0]), (8, 0.05), (14, 0)],
    (arm_l, R, 0): [(0, DOWNED[arm_l, R, 0]), (8, -0.15), (14, 0)],
    (arm_l, R, 1): [(0, DOWNED[arm_l, R, 1]), (8, 0), (14, 0)],
    (arm_r, R, 1): [(0, DOWNED[arm_r, R, 1]), (8, 0.05), (14, 0)],
    (doll, R, 1): [(0, DOWNED[doll, R, 1]), (8, 0.12), (11, -0.05), (14, 0)],
    (bell, R, 0): [(0, 0), (6, 0.5), (10, -0.3), (14, 0)],
})

meshes = bake(fill='#6a4418', margin=12, cage=0.008, reach=0.025)
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
print(f'marionettist: {tris} triangles, {len(meshes)} meshes')
finish()
