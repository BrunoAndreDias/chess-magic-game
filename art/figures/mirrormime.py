"""The Mirrormime, a mirrorball harlequin of the Gilded Rift. A violet bodysuit set in a big harlequin lattice, every
other diamond a faceted mirror tile, under a pleated team ruff; puffed short sleeves over long white gloves, a ring of
pointed hip flaps, curled pointed slippers. A white-painted face with a mirrored star round the right eye and a wide
grin, under a soft two-pointed cap whose points flop down to two little mirror balls, team-lined at the brim. The left
hand balances a big faceted mirror orb on its fingertips, its seams glowing rift lilac, motes circling it; the right
palm presses flat on an invisible wall that ripples out from where it touches. Painted by lookdev and baked from a
high-poly twin."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import bmesh
import bpy
from mathutils import Matrix, Vector, noise
from common import *
from hands import hand
from lookdev import bake, hi, mark, paint

reset()


def creases(stretch, depth):
    def relief(co, n, mask):
        v = noise.noise(Vector((co.x * stretch[0], co.y * stretch[1], co.z * stretch[2])))
        return depth * (0.5 - abs(v)) * 2
    return relief


def grain(scale, depth):
    def relief(co, n, mask):
        return depth * noise.noise(co * scale)
    return relief


CLOTH = creases((9, 9, 1.6), 0.0025)
MAIN = paint('main', '#5a30c4', '#1c0c52', '#9c7cf0', rough=0.8, edge=0.6, mottle=0.08, streak=0.4,
             accent='#2a1868', keep=True, relief=CLOTH)
TEAM = paint('team', '#d8d8d8', '#6c6c6c', '#ffffff', rough=0.9, streak=0.5, mottle=0.06, accent='#9a9a9a', keep=True,
             relief=creases((3, 3, 26), 0.003))
DARK = paint('dark', '#24164a', '#07040f', '#4e3c86', rough=0.85, edge=0.7, streak=0.4, mottle=0.08, relief=CLOTH)
GOLD = paint('gold', '#e8b648', '#5a340c', '#fff4c0', metal=True, cavity=0.4, edge=1.0, mottle=0.06)
GLOVE = paint('glove', '#f2eefa', '#7a6ca0', '#ffffff', cavity=0.6, edge=0.5, mottle=0.04, texel=2)
SEAM = paint('seam', '#b0a4d4', '#5a4a8a', '#e0d8fa', cavity=0.3)
FACE = paint('face', '#f4f0fa', '#8a7cae', '#ffffff', cavity=0.5, edge=0.3, mottle=0.03, accent='#e4a8dc', texel=3)
LIPS = paint('lips', '#4a1850', '#14041a', '#8a3a8e', cavity=0.4, edge=0.6, mottle=0.03, texel=3)
INK = paint('ink', '#1c1030', '#06030c', '#3a2a5a', cavity=0.2, edge=0.2, mottle=0.0, texel=3)
# Painted chrome: the metal ramp is a bright sky over a dark horizon band, so a facet tipped up shines and one tipped
# down goes dark; flat facets at different tilts make the sparkle. The mask darkens some tiles further.
MIRROR = paint('mirror', '#b4aaf0', '#120c30', '#ffffff', metal=True, cavity=0.1, edge=0.35, mottle=0.03, texel=1.5,
               accent='#0c0822', rough=0.22, keep=True)
SPARK = paint('sparkle', '#e8e0ff', '#9a86e8', '#ffffff', cavity=0.0, edge=0.2, mottle=0.02, glow=0.7)
SEAMGLOW = paint('seam_glow', '#a070ff', '#6a34e0', '#c9a8ff', cavity=0.0, edge=0.0, mottle=0.02, glow=1.0)
SPIRIT = paint('spirit', '#7a5ad0', '#24145a', '#c8b0ff', cavity=0.0, edge=0.0, mottle=0.04, accent='#000000', keep=True,
               texel=2.5)
RIPPLE = paint('ripple', '#a68af0', '#6a4ac0', '#d0bcff', cavity=0.0, edge=0.0, mottle=0.0)
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
    mod = ob.modifiers.new('solid', 'SOLIDIFY')
    mod.thickness = thickness
    mod.offset = offset
    mod.use_even_offset = True
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


def lathe(name, rings, sides, mat, sy=1.0, close_top=False, shape=None, mask=None, levels=0):
    def at(i, j):
        r, z = rings[i]
        a = 2 * math.pi * j / sides
        x, y = r * math.sin(a), -r * math.cos(a) * sy
        return Vector(shape(i, j, x, y, z) if shape else (x, y, z))
    ob = grid(name, len(rings), sides, at, mat, levels, mask, wrap=True)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    if close_top:
        n = len(rings) - 1
        bm.faces.new([bm.verts[n * sides + j] for j in range(sides)])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(ob.data)
    bm.free()
    return ob


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


def blob(name, loc, radius, mat, scale=(1, 1, 1), subdiv=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=radius, location=loc)
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


def ribbon(name, path, widths, side, mat, thickness=0.014, belly=0.006, notch=0.0, mask=None, levels=1):
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


def hull(name, pts, mat):
    bm = bmesh.new()
    vs = [bm.verts.new(Vector(p)) for p in pts]
    res = bmesh.ops.convex_hull(bm, input=vs)
    bmesh.ops.delete(bm, geom=[g for g in res['geom_interior'] + res['geom_unused'] if isinstance(g, bmesh.types.BMVert)],
                     context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return flat(assign(ob, mat))


def oriented(ob, x, y, z):
    ob.rotation_euler = Matrix((x, y, z)).transposed().to_euler()
    return ob


def hashf(k, s):
    return (math.sin(k * 12.9898 + s * 78.233) * 43758.5453) % 1.0


class Tiles:
    """Mirror tiles collected into one flat-shaded mesh: each a low diamond pyramid, so its four facets tilt four ways
    and catch four different patches of the painted sky. `shade` per tile darkens it (the mask). Open underneath,
    where the body hides it."""

    def __init__(self):
        self.verts, self.faces, self.marks = [], [], []

    def diamond(self, c, n, u, v, w, h, raise_=0.006, shade=0.0, inset=0.86):
        n = n.normalized()
        b = len(self.verts)
        rim = [c + u * (w / 2 * inset), c + v * (h / 2 * inset), c - u * (w / 2 * inset), c - v * (h / 2 * inset)]
        self.verts += [p + n * 0.0015 for p in rim] + [c + n * (0.0015 + raise_)] + [p - n * 0.003 for p in rim]
        self.marks += [shade] * 9
        for k in range(4):
            m = (k + 1) % 4
            self.faces.append((b + k, b + m, b + 4))
            self.faces.append((b + 5 + k, b + 5 + m, b + m, b + k))

    def build(self, name, mat):
        ob = build(name, self.verts, self.faces, mat)
        flat(ob)
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(ob.data)
        bm.free()
        mark(ob, lambda co, it=iter(self.marks): next(it))
        return ob


TILES = Tiles()
SPARKS = Tiles()


def tile_kind(k):
    h = hashf(k, 7)
    if h > 0.88:
        return SPARKS, 0.0
    return TILES, (0.0, 0.0, 0.0, 0.35, 0.65)[int(hashf(k, 3) * 5)]


def lattice(surface, us, vs, du, dv, seed, raise_=0.006):
    """A harlequin lattice over `surface(u, v, out)`: mirror diamonds centred at (i du, j dv), the violet ones between
    them left bare, and gold threads (bake-only) along the diagonals."""
    k = seed
    for v in vs:
        for u in us:
            c = surface(u, v, 0.0)
            du_ = surface(u + du / 2, v, 0.0) - c
            dv_ = surface(u, v + dv / 2, 0.0) - c
            n = du_.cross(dv_)
            if n.dot(surface(u, v, 0.01) - c) < 0:
                n = -n
            kind, shade = tile_kind(k)
            kind.diamond(c, n, du_, dv_, 2.0, 2.0, raise_=raise_, shade=shade)
            k += 1
    return k


breath = loop(empty('breath'), 'scale', 2, [1.0, 1.012], 84)

# --- Legs: straight and slim, a little apart, the feet turned out like a dancer's. ----------------------------------
LEG_R = [(0.06, 0.0), (0.056, 0.2), (0.047, 0.42), (0.042, 0.52), (0.043, 0.64), (0.036, 0.85), (0.03, 1.0)]
LEGS = {'r': (Vector((-0.062, 0.0, 0.47)), Vector((-0.082, -0.005, 0.08)), -0.45),
        'l': (Vector((0.062, 0.0, 0.47)), Vector((0.082, -0.005, 0.08)), 0.45)}


def leg_surface(hip, ankle):
    axis = ankle - hip
    side = Vector((1, 0, 0))
    side = (side - axis.normalized() * side.dot(axis.normalized())).normalized()
    fwd = axis.normalized().cross(side)
    if fwd.y > 0:
        fwd = -fwd

    def at(a, t, out=0.0):
        r = interp(LEG_R, t) + out
        return hip + axis * t - side * (r * math.sin(a)) + fwd * (r * math.cos(a))
    return at


seed = 0
for sd, (hip, ankle, turn) in LEGS.items():
    at = leg_surface(hip, ankle)
    ts = [k / 10 for k in range(11)]
    sweep('leg', [hip + (ankle - hip) * t for t in ts],
          [interp(LEG_R, t) for t in ts], 12, MAIN, levels=1, caps=True)
    du, dv = 2 * math.pi / 5, 0.19
    seed = lattice(at, [du * i + (0.5 * du if sd == 'r' else 0) for i in range(5)],
                   [0.2 + dv * j for j in range(4)], du, dv, seed)
    for i in range(5):
        u0 = du * i + du / 2 + (0.5 * du if sd == 'r' else 0)
        for sgn in (-1, 1):
            pts = [at(u0 + sgn * (du / 2) * ((t - 0.2) / (dv / 2)), t, 0.002) for t in [0.07 + 0.88 * s / 30 for s in range(31)]]
            hi(sweep('thread', pts, 0.0022, 4, GOLD, caps=False))
    # A pointed slipper whose toe curls up into a little mirror bead.
    td = Vector((math.sin(turn) * 0.6, -1.0, 0.0)).normalized()
    heel = Vector((ankle.x, ankle.y + 0.03, 0.04))
    toe = [heel, heel + td * 0.05 + Vector((0, 0, 0.004)), heel + td * 0.1, heel + td * 0.15 - Vector((0, 0, 0.005)),
           heel + td * 0.2 + Vector((0, 0, 0.0)), heel + td * 0.235 + Vector((0, 0, 0.03)),
           heel + td * 0.225 + Vector((0, 0, 0.055))]
    sweep('slipper', toe, [0.042, 0.046, 0.04, 0.03, 0.019, 0.011, 0.007], 12, DARK, levels=1, squash=0.7)
    sweep('slipper_sole', [p - Vector((0, 0, 0.022)) for p in toe[:4]] + [toe[4] - Vector((0, 0, 0.014))],
          [0.034, 0.036, 0.03, 0.022, 0.012], 8, GOLD, squash=0.3)
    sweep('slipper_cuff', [Vector((ankle.x, ankle.y, 0.05)), Vector((ankle.x, ankle.y, 0.1))], [0.042, 0.038], 14, GOLD,
          levels=1)
    hull('toe_bead', [toe[-1] + Vector(d) * 0.016 for d in
                      ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1),
                       (0.6, 0.6, 0.6), (-0.6, -0.6, 0.6), (0.6, -0.6, -0.6), (-0.6, 0.6, -0.6))], MIRROR)

# --- Torso: a slim leotard, narrow at the waist, the chest a little puffed out. -------------------------------------
SY = 0.8
TORSO = [(0.02, 0.37), (0.075, 0.385), (0.105, 0.42), (0.115, 0.47), (0.108, 0.53), (0.097, 0.6), (0.1, 0.67),
         (0.115, 0.75), (0.124, 0.82), (0.118, 0.88), (0.09, 0.925), (0.05, 0.95)]
lathe('torso', TORSO, 20, MAIN, sy=SY, close_top=True, levels=1)


def torso_at(a, z, out=0.0):
    r = interp(TORSO, z) + out
    return Vector((r * math.sin(a), -r * SY * math.cos(a), z))


TC = 10
du, dv = 2 * math.pi / TC, 0.1
# The chest tiles are broader than the leg ones, so they are pitched steeper: flatter facets all baked to the dark
# horizon band of the painted chrome and the chest sparkled less than the legs.
seed = lattice(torso_at, [du * i for i in range(TC)], [0.6 + dv * j for j in range(4)], du, dv, seed, raise_=0.013)
for i in range(TC):
    u0 = du * i + du / 2
    for sgn in (-1, 1):
        pts = [torso_at(u0 + sgn * (du / 2) * ((z - 0.6) / (dv / 2)), z, 0.002) for z in [0.5 + 0.43 * s / 30 for s in range(31)]]
        hi(sweep('thread', pts, 0.0022, 4, GOLD, caps=False))

# Hip flaps: a ring of pointed indigo flaps over the hips, piped in gold, each tip hung with a mirror bead.
FLAPS = 8
FC = FLAPS * 4


def flap_at(i, j, out=0.0):
    a = 2 * math.pi * j / FC
    t = i / 3
    tri = 1 - abs(((j % 4) / 2) - 1)
    z = 0.57 - t * (0.08 + 0.07 * tri)
    r = interp(TORSO, 0.57) + 0.012 + 0.06 * t ** 1.3 + out
    return Vector((r * math.sin(a), -r * 0.86 * math.cos(a), z))


flaps = grid('flaps', 4, FC, flap_at, DARK, levels=1, wrap=True)
solidify(flaps, 0.008, offset=1.0)
sweep('flap_hem', [flap_at(3, j, 0.004) for j in range(FC)] + [flap_at(3, 0, 0.004)], 0.005, 6, GOLD, caps=False)
sweep('belt', [flap_at(0, j, 0.006) for j in range(FC)] + [flap_at(0, 0, 0.006)], 0.011, 8, GOLD, caps=False)
for j in range(2, FC, 4):
    p = flap_at(3, j, 0.0) - Vector((0, 0, 0.016))
    hull('flap_bead', [p + Vector(d) * 0.014 for d in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1.3),
                                                         (0, 0, -1.3), (0.6, 0.6, 0), (-0.6, -0.6, 0))], MIRROR)

sweep('neck', [Vector((0, -0.01, 0.92)), Vector((0, -0.01, 1.04))], 0.042, 12, FACE)

# Buttons: three gold pompoms down the chest in the violet diamonds.
for z in (0.65, 0.75, 0.85):
    blob('pom', torso_at(0, z, 0.012), 0.014, GOLD, subdiv=2)

# --- Ruff: two layers of hard accordion pleats in the team colour, the lower one wider. -----------------------------


def ruff(name, z0, r0, r1, cols, amp, sy=0.9):
    def at(i, j):
        t = i / 3
        a = 2 * math.pi * j / cols
        r = r0 + (r1 - r0) * t + (0.008 * t if j % 2 else 0.0)
        z = z0 + amp * t * (1 if j % 2 else -1) - 0.03 * t * t
        return Vector((r * math.sin(a), -0.01 - r * sy * math.cos(a), z))
    ob = grid(name, 4, cols, at, TEAM, levels=1, wrap=True, mask=lambda i, j: float(i == 3) * 0.6)
    return solidify(ob, 0.006, offset=0.0)


ruff('ruff', 0.935, 0.05, 0.215, 46, 0.018)
ruff('ruff_top', 0.965, 0.05, 0.165, 36, 0.014)

# --- Arms: puffed violet sleeves at the shoulders, long white gloves below. The right palm presses on a wall; the
# left hand balances the orb on its fingertips. ---------------------------------------------------------------------
ARMS = {
    'r': (Vector((-0.13, 0.0, 0.86)), Vector((-0.25, -0.05, 0.74)), Vector((-0.235, -0.2, 0.83)), Vector((0, -1, 0)),
          0.06),
    'l': (Vector((0.13, 0.0, 0.86)), Vector((0.27, 0.01, 0.78)), Vector((0.345, -0.07, 0.9)), Vector((0, 0, 1)), 0.4),
}
PALMS = {}
PUFF = [(0.03, -0.06), (0.058, -0.042), (0.074, -0.012), (0.076, 0.012), (0.066, 0.04), (0.046, 0.058),
        (0.036, 0.064)]
# Each arm, puff and glove hangs from a shoulder pivot, so an action can swing it whole.
PIVOTS = {}
for sd, (s, e, w, palm, curl) in ARMS.items():
    made = set(bpy.data.objects)
    path = bezier(s, s.lerp(e, 0.8), e.lerp(w, 0.2), w, 8)
    sweep(f'sleeve_{sd}', path, [0.036, 0.035, 0.033, 0.031, 0.03, 0.029, 0.028, 0.027, 0.026], 12, GLOVE, levels=1)
    d = (e - s).normalized()
    up = Vector((0, 0, 1))
    x = d.cross(up).normalized()
    puff = lathe('puff', PUFF, 20, MAIN, levels=1,
                 shape=lambda i, j, x_, y_, z_: (x_ * (1 + 0.1 * math.sin(math.pi * i / 6) * math.cos(10 * 2 * math.pi * j / 20)),
                                                 y_ * (1 + 0.1 * math.sin(math.pi * i / 6) * math.cos(10 * 2 * math.pi * j / 20)), z_),
                 mask=lambda i, j: float((j // 2) % 2))
    oriented(puff, x, d.cross(x), d)
    puff.location = s + d * 0.035
    c = s + d * 0.035
    band = [c + d * 0.062 + (x * math.cos(t) + d.cross(x) * math.sin(t)) * 0.038 for t in [2 * math.pi * k / 24 for k in range(25)]]
    sweep('puff_band', band, 0.006, 6, GOLD, caps=False)
    # The glove's top: a gold ring just under the puff.
    g = path[2]
    gd = (path[3] - path[1]).normalized()
    gx = gd.cross(up).normalized()
    sweep('glove_ring', [g + (gx * math.cos(t) + gd.cross(gx) * math.sin(t)) * 0.037 for t in [2 * math.pi * k / 20 for k in range(21)]],
          0.004, 6, GOLD, caps=False)
    PALMS[sd] = hand(w, (w - path[-2]), palm, GLOVE, right=(sd == 'r'), curl=curl, size=0.013, detail='glove',
                     seam=SEAM, name=f'hand_{sd}')
    PIVOTS[sd] = empty(f'arm_{sd}', s)
    for ob in set(bpy.data.objects) - made - {PIVOTS[sd]}:
        parent(ob, PIVOTS[sd])
arm_r, arm_l = PIVOTS['r'], PIVOTS['l']

# --- Head: big and round, painted white: a mirrored star over the right eye, a wide grin, rosy cheeks. --------------
before_head = set(bpy.data.objects)
H = Vector((0, -0.012, 1.095))
RX, RY, RZ = 0.15, 0.14, 0.15


def jaw(dz):
    return 1 - 0.16 * smoothstep(-0.03, -RZ, dz)


def bump(dx, sx, dz, sz):
    return math.exp(-(dx / sx) ** 2 - (dz / sz) ** 2)


def features(x, dz):
    nose = 0.012 * bump(x, 0.012, dz + 0.022, 0.014)
    cheek = 0.006 * bump(abs(x) - 0.065, 0.025, dz + 0.035, 0.022)
    chin = 0.004 * bump(x, 0.03, dz + 0.11, 0.02)
    return nose + cheek + chin


def on_face(x, dz, out=0.0):
    s = max(0.0, 1 - (x / (RX * jaw(dz))) ** 2 - (dz / RZ) ** 2)
    return Vector((H.x + x, H.y - RY * math.sqrt(s) - features(x, dz) - out, H.z + dz))


HZ = [RZ * math.cos(math.pi * i / 16) for i in range(17)]


def head_shape(i, j, x, y, z):
    dz = z - H.z
    xx = x * jaw(dz)
    if y < 0:
        y -= features(xx, dz) * min(1.0, -y / (RY * 0.5))
    return (xx, y + H.y, z)


head = lathe('head', [(RX * math.sqrt(max(0.0, 1 - (dz / RZ) ** 2)), H.z + dz) for dz in HZ], 28, FACE, sy=RY / RX,
             shape=head_shape, levels=1)
mark(head, lambda co: max(bump(abs(co.x) - 0.075, 0.03, co.z - H.z + 0.04, 0.025) * (co.y < H.y), 0.0) * 0.8)

EYES = {'r': Vector((-0.054, 0.0, 0.006)), 'l': Vector((0.054, 0.0, 0.006))}
for sd, e in EYES.items():
    p = on_face(e.x, e.z, 0.004 if sd == 'r' else 0.0)
    eye = blob('eye', p, 0.021, VOID, scale=(0.72, 0.3, 1.2), subdiv=2)
    eye.rotation_euler = (0, 0, math.asin(e.x / RX))
    blob('glint', on_face(e.x - 0.006, e.z + 0.011, 0.008), 0.0045, SPARK, subdiv=1)

# The mirrored star round the right eye: four points, each two facets meeting at a ridge, set in gold.
E = EYES['r']
TIPS = [(0.0, 0.068), (-0.058, 0.0), (0.0, -0.075), (0.045, 0.0)]
INNER = [(-0.018, 0.017), (-0.018, -0.018), (0.016, -0.018), (0.016, 0.017)]
rim_pts = []
for (tx, tz), (ix, iz) in zip(TIPS, INNER):
    rim_pts.append(on_face(E.x + tx, E.z + tz, 0.0025))
    rim_pts.append(on_face(E.x + ix, E.z + iz, 0.004))
sv, sf, shades = [], [], []
for k in range(8):
    # Each facet its own triangle, alternately bright and dark, so the star reads as cut chrome on the white face.
    sv += [on_face(E.x, E.z, 0.009), rim_pts[k], rim_pts[(k + 1) % 8]]
    sf.append((3 * k, 3 * k + 1, 3 * k + 2))
    shades += [0.75 * (k % 2)] * 3
star = flat(build('star', sv, sf, MIRROR))
mark(star, lambda co, it=iter(shades): next(it))
outline = [on_face(E.x + x, E.z + z, 0.0035) for (tx, tz), (ix, iz) in zip(TIPS, INNER) for x, z in ((tx, tz), (ix, iz))]
sweep('star_rim', outline + [outline[0]], 0.0022, 5, GOLD, caps=False)
# A small lilac halo on the star, so the mirrored eye still reads at board distance.
glow(on_face(E.x, E.z, 0.014), LILAC, 0.07, name='glow_eye')
# The other eye gets a high painted arch of a brow, for the mime's surprise.
sweep('brow', [on_face(0.026 + 0.056 * t, 0.03 + 0.03 * math.sin(math.pi * (0.2 + 0.8 * t)) - 0.01 * t, 0.002)
               for t in [k / 8 for k in range(9)]], [0.0025, 0.0035, 0.004, 0.0042, 0.004, 0.0037, 0.0032, 0.0026, 0.0018],
      5, INK, caps=True)

# The grin: a wide crescent in dark plum, its corners hooked up.
W = 0.062


def grin_at(i, j):
    x = W * (2 * j / 14 - 1)
    up = -0.058 + 0.026 * (x / W) ** 2
    low = up - 0.03 * (1 - (x / W) ** 2)
    return on_face(x, up + (low - up) * i / 3, 0.002)


grid('grin', 4, 15, lambda i, j: grin_at(i, 14 - j), LIPS, levels=0)
for sx in (-1, 1):
    sweep('dimple', [on_face(sx * (W - 0.002), -0.034, 0.002), on_face(sx * (W + 0.008), -0.026, 0.002)], [0.0028, 0.0016],
          5, INK)

# The cap: a soft violet cap over the crown, its brim rolled back to show the team lining, and two long points that
# flop out and down to the sides, each ending in a small mirror ball.
CAPZ = [0.072, 0.1, 0.125, 0.145, 0.16, 0.17, 0.176]
CRX, CRZ = RX + 0.016, RZ + 0.028


def rh(dz):
    return RX * math.sqrt(max(0.0, 1 - (min(dz, RZ * 0.995) / RZ) ** 2))


def cap_shape(i, j, x, y, z):
    a = 2 * math.pi * j / 22
    t = 1 - i / (len(CAPZ) - 1)
    return (x, y + H.y, z - 0.05 * t * (1 - math.cos(a)) / 2)


CAP_R = [(CRX * math.sqrt(max(0.0, 1 - (dz / CRZ) ** 2)) if k < len(CAPZ) - 1 else 0.0, H.z + dz)
         for k, dz in enumerate(CAPZ)]
cap = lathe('cap', CAP_R, 22, MAIN, sy=RY / RX, shape=cap_shape, levels=1)
solidify(cap, 0.008, inner=TEAM)
brim = [Vector(cap_shape(0, j, CAP_R[0][0] * math.sin(2 * math.pi * j / 22) * 1.07,
                         -CAP_R[0][0] * 1.07 * RY / RX * math.cos(2 * math.pi * j / 22), CAP_R[0][1] + 0.004))
        for j in range(22)]
BC = sum(brim, Vector()) / len(brim)
bv, bf = [], []
for i, p in enumerate(brim):
    tg = (brim[(i + 1) % len(brim)] - brim[i - 1]).normalized()
    out = (p - BC)
    out = (out - tg * out.dot(tg)).normalized()
    up = tg.cross(out).normalized()
    for k in range(8):
        a = 2 * math.pi * k / 8
        bv.append(p + (out * math.cos(a) + up * math.sin(a)) * 0.02)
for i in range(len(brim)):
    for k in range(8):
        i2, k2 = (i + 1) % len(brim), (k + 1) % 8
        bf.append((i * 8 + k, i * 8 + k2, i2 * 8 + k2, i2 * 8 + k))
build('brim', bv, bf, TEAM, levels=1)
for sx, mat in ((-1, DARK), (1, MAIN)):
    pts = bezier(H + Vector((sx * 0.06, 0.01, 0.125)), H + Vector((sx * 0.17, 0.02, 0.25)),
                 H + Vector((sx * 0.31, 0.03, 0.23)), H + Vector((sx * 0.33, 0.035, 0.085)), 10)
    sweep('cap_point', pts, [0.075 * (1 - 0.84 * (k / 10) ** 0.8) for k in range(11)], 12, mat, levels=1)
    tip = pts[-1] + (pts[-1] - pts[-2]).normalized() * 0.026
    sweep('point_band', [pts[-2].lerp(pts[-1], 0.6), pts[-1] + (pts[-1] - pts[-2]).normalized() * 0.004], 0.016, 10, GOLD)
    ball = bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=7, radius=0.03, location=tip)
    flat(assign(bpy.context.object, MIRROR)).name = 'cap_ball'
    mark(bpy.context.object, lambda co: 0.0)

NECKP = Vector((0, -0.01, 0.95))
tip = (Matrix.Translation(NECKP) @ Matrix.Scale(1.12, 4) @ Matrix.Rotation(0.07, 4, 'Y') @ Matrix.Rotation(-0.12, 4, 'X') @
       Matrix.Translation(-NECKP))
for ob in set(bpy.data.objects) - before_head:
    ob.matrix_world = tip @ ob.matrix_world

# --- The orb: the weapon pivots at the left palm. A big mirrorball, every facet a tile, its seams glowing lilac, with
# mirror motes circling it. ------------------------------------------------------------------------------------------
GRIP = PALMS['l']
OR = 0.12
OC = GRIP + Vector((0.01, 0, 0.03 + OR))
weapon = empty('weapon', GRIP, arm_l)
spinner = parent(empty('orb_spin', OC), weapon)
bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=11, radius=OR, location=(0, 0, 0))
orb = bpy.context.object
orb.name = 'orb'
orb.data.materials.append(MIRROR)
orb.data.materials.append(SEAMGLOW)
orb.data.materials.append(SPARK)
bm = bmesh.new()
bm.from_mesh(orb.data)
old = list(bm.faces)
res = bmesh.ops.inset_individual(bm, faces=old, thickness=0.004, depth=0.004)
for f in bm.faces:
    f.material_index = 1
shade = {}
for k, f in enumerate(old):
    h = hashf(k, 11)
    f.material_index = 2 if h > 0.9 else 0
    s = (0.0, 0.0, 0.0, 0.3, 0.6)[int(hashf(k, 5) * 5)]
    for v in f.verts:
        shade[v] = s
bm.verts.index_update()
marks = [shade.get(v, 0.0) for v in bm.verts]
bm.to_mesh(orb.data)
bm.free()
flat(orb)
mark(orb, lambda co, it=iter(marks): next(it))
orb.location = OC
parent(orb, spinner)
spin(spinner, axis=2, period=192)
glow(OC, LILAC, 0.34, weapon, name='glow_orb')
motes = parent(empty('motes', OC), weapon)
for k in range(3):
    a = 2 * math.pi * k / 3
    p = OC + Vector((math.cos(a) * (OR + 0.07), math.sin(a) * (OR + 0.07), 0.04 * math.sin(2 * a)))
    m = parent(hull('mote', [p + Vector(d) * (0.018 if k else 0.022) for d in
                              ((1, 0, 0), (-1, 0, 0), (0, 0.7, 0), (0, -0.7, 0), (0, 0, 1.5), (0, 0, -1.5))],
                    SPARK if k == 0 else MIRROR), motes)
    if k:
        mark(m, lambda co: 0.0)
motes.rotation_euler = (0.35, 0.2, 0)
spin(motes, axis=2, period=120, turns=-1)
loop(weapon, 'location', 2, [GRIP.z, GRIP.z + 0.012], 72)

# --- The invisible wall: where the right palm presses, rings of spirit light ripple out through the air and fade. The
# pane has no lit edge (a frame round it read as a picture) and stays clear over the hand, so the glove shows through.
WC = PALMS['r']
WY = WC.y - 0.022
WX, WZ = 0.15, 0.17
wall = parent(empty('wall', Vector((WC.x, WY, WC.z + 0.02))), arm_r)


def wall_at(i, j):
    return Vector((WC.x + WX * (2 * j / 16 - 1), WY, WC.z + 0.02 + WZ * (2 * i / 16 - 1)))


def wall_fade(i, j):
    # 1 paints the clear accent (black adds nothing); a soft haze rises between the hand and the rim and dies before it.
    r = math.hypot(2 * j / 16 - 1, 2 * i / 16 - 1)
    return 1 - 0.18 * smoothstep(0.5, 0.7, r) * (1 - smoothstep(0.75, 0.95, r))


parent(grid('wall', 17, 17, wall_at, SPIRIT, levels=0, mask=wall_fade), wall)
for r in (0.075, 0.106, 0.134):
    ring_pts = [Vector((WC.x + r * math.cos(t), WY - 0.002, WC.z + 0.02 + r * math.sin(t)))
                for t in [2 * math.pi * k / 40 for k in range(41)]]
    parent(hi(sweep('ripple', ring_pts, 0.0045 - r * 0.015, 6, RIPPLE, caps=False)), wall)
loop(wall, 'scale', 0, [1.0, 1.05], 60)
loop(wall, 'scale', 2, [1.0, 1.05], 60)

TILES.build('tiles', MIRROR)
SPARKS.build('sparks', SPARK)

for ob in list(bpy.data.objects):
    if ob.parent is None and ob is not breath:
        parent(ob, breath)


# Actions, keyed as offsets from rest. The figure faces -Y. -x on an arm swings its hand forward and up; -y lifts the left
# arm out to the side, +y the right. `weapon` (the orb) moves in its arm's space: -y throws it forward, +z tosses it up.
# +x on `breath` leans the body forward.
R, S, L = 'rotation_euler', 'scale', 'location'
# Cast: the orb tossed high and set spinning, the right palm pressing the wall forward as it rises.
act('cast', 10, {
    (arm_l, R, 1): [(0, 0), (5, 0.12), (9, -0.3), (14, -0.2), (22, 0)],
    (weapon, L, 2): [(0, 0), (5, -0.03), (10, 0.26), (14, 0.2), (19, 0.02), (22, 0)],
    (spinner, R, 2): [(0, 0), (10, math.pi), (22, 2 * math.pi)],
    (arm_r, R, 0): [(0, 0), (6, -0.22), (10, -0.32), (16, -0.2), (22, 0)],
    (wall, S, 0): [(0, 0), (8, 0.2), (12, 0.35), (22, 0)],
    (wall, S, 2): [(0, 0), (8, 0.2), (12, 0.35), (22, 0)],
    (breath, R, 0): [(0, 0), (5, 0.04), (10, -0.06), (22, 0)],
})
# Attack: a wind-up, then the orb bowled forward off the fingertips and caught again.
act('attack', 8, {
    (arm_l, R, 0): [(0, 0), (4, 0.3), (8, -0.45), (12, -0.25), (18, 0)],
    (weapon, L, 1): [(0, 0), (4, 0.05), (8, -0.34), (11, -0.26), (18, 0)],
    (weapon, L, 2): [(0, 0), (4, -0.02), (8, -0.07), (11, -0.04), (18, 0)],
    (spinner, R, 2): [(0, 0), (8, 1.4), (18, 2 * math.pi)],
    (breath, R, 0): [(0, 0), (4, -0.06), (8, 0.1), (18, 0)],
    (breath, R, 2): [(0, 0), (4, 0.12), (8, -0.1), (18, 0)],
    (arm_r, R, 1): [(0, 0), (4, -0.1), (8, 0.15), (18, 0)],
})
act('hit', 2, {
    (breath, R, 0): [(0, 0), (2, -0.14), (6, 0.03), (12, 0)],
    (arm_l, R, 1): [(0, 0), (2, 0.18), (6, -0.05), (12, 0)],
    (weapon, L, 2): [(0, 0), (2, 0.06), (5, -0.02), (12, 0)],
    (arm_r, R, 0): [(0, 0), (2, 0.2), (7, -0.04), (12, 0)],
    (wall, S, 0): [(0, 0), (2, -0.25), (5, 0.15), (12, 0)],
    (wall, S, 2): [(0, 0), (2, -0.25), (5, 0.15), (12, 0)],
})
# Move loops while the unit travels: a skipping sway, the orb bobbing on the fingertips, the wall carried along.
act('move', 0, {
    (breath, R, 0): [(0, 0.04), (3, 0.07), (6, 0.04), (9, 0.07), (12, 0.04)],
    (breath, R, 1): [(0, 0), (3, 0.07), (6, 0), (9, -0.07), (12, 0)],
    (breath, S, 2): [(0, 0), (3, 0.03), (6, 0), (9, 0.03), (12, 0)],
    (weapon, L, 2): [(0, 0), (3, 0.04), (6, 0), (9, 0.04), (12, 0)],
})
# Down holds its last frame while the unit is downed; rise starts from that frame. The orb rolls off the hand to the
# ground in front and the wall gives way.
DOWNED = {(breath, S, 2): -0.2, (breath, R, 0): -0.15, (arm_l, R, 1): 0.45, (arm_r, R, 1): -0.4, (weapon, L, 1): -0.12,
          (weapon, L, 2): -0.62, (wall, S, 0): -0.9, (wall, S, 2): -0.9}
act('down', 10, {
    (breath, S, 2): [(0, 0), (5, -0.12), (14, DOWNED[breath, S, 2])],
    (breath, R, 0): [(0, 0), (5, 0.08), (14, DOWNED[breath, R, 0])],
    (arm_l, R, 1): [(0, 0), (6, 0.15), (14, DOWNED[arm_l, R, 1])],
    (arm_r, R, 1): [(0, 0), (6, -0.1), (14, DOWNED[arm_r, R, 1])],
    (weapon, L, 1): [(0, 0), (8, -0.08), (14, DOWNED[weapon, L, 1])],
    (weapon, L, 2): [(0, 0), (4, 0.06), (11, DOWNED[weapon, L, 2]), (12, DOWNED[weapon, L, 2] + 0.04),
                     (14, DOWNED[weapon, L, 2])],
    (wall, S, 0): [(0, 0), (6, 0.2), (14, DOWNED[wall, S, 0])],
    (wall, S, 2): [(0, 0), (6, 0.2), (14, DOWNED[wall, S, 2])],
})
act('rise', 8, {
    (breath, S, 2): [(0, DOWNED[breath, S, 2]), (8, 0.04), (14, 0)],
    (breath, R, 0): [(0, DOWNED[breath, R, 0]), (8, 0.05), (14, 0)],
    (arm_l, R, 1): [(0, DOWNED[arm_l, R, 1]), (8, -0.1), (14, 0)],
    (arm_r, R, 1): [(0, DOWNED[arm_r, R, 1]), (8, 0.05), (14, 0)],
    (weapon, L, 1): [(0, DOWNED[weapon, L, 1]), (8, -0.02), (14, 0)],
    (weapon, L, 2): [(0, DOWNED[weapon, L, 2]), (6, 0.08), (10, 0.02), (14, 0)],
    (wall, S, 0): [(0, DOWNED[wall, S, 0]), (8, 0.1), (14, 0)],
    (wall, S, 2): [(0, DOWNED[wall, S, 2]), (8, 0.1), (14, 0)],
})

meshes = bake(fill='#2a1c5e', margin=12)
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
print(f'mirrormime: {tris} triangles, {len(meshes)} meshes')
finish()
