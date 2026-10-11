"""The Astromancer, an Eclipse Seer of the Last Almanac. A snug indigo hood frames silver hair and a gold mask
moulded to her face, engraved with one closed eye and strapped on at the temples; behind it a tall stiff fan collar
lined in the team colour, and round the head an armillary of three tilted gold rings turning about a small eclipsed sun (a black disc in a lilac corona). A violet robe
flares to the ground over a dark hem embroidered with a gold star chart; a team sash at the waist. The right hand holds
an astrolabe sceptre, a flat engraved disc on a slender rod; the left hand is held out palm up with a planet hovering over it,
and star shards drift round the body. Painted by lookdev and baked from a high-poly twin."""
import math
import os
import sys
from functools import partial

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
# Pearl gloves: lighter than the violet sleeves and cooler than the gold, so the hands read as two pale points.
GLOVE = paint('glove', '#e4dcee', '#6a5a8a', '#ffffff', cavity=0.6, edge=0.4, mottle=0.05)
LINING = paint('lining', '#9a7ae0', '#5a3eb0', '#d0c0ff', rough=0.9, cavity=0.3, edge=0.3, streak=0.4)
MASKM = paint('mask', '#e8b648', '#7a4c14', '#fff0b0', metal=True, cavity=0.6, edge=1.0, mottle=0.04, texel=3)
INLAY = paint('mask_inlay', '#3a2008', '#120800', '#8a5a20', metal=True, cavity=0.3, edge=0.8, mottle=0.04, texel=3)
# Silver hair: pale and cool, so it fills the hood round the warm gold mask instead of leaving a dark ring.
HAIR = paint('hair', '#b4a4e4', '#4a3a80', '#f0e8ff', rough=0.8, cavity=0.35, edge=0.3, streak=0.5, mottle=0.04)
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


def interp(table, z):
    """Linear lookup in a list of (value, z) pairs ordered by z, either way."""
    pts = sorted(table, key=lambda p: p[1])
    if z <= pts[0][1]:
        return pts[0][0]
    for (r0, z0), (r1, z1) in zip(pts, pts[1:]):
        if z <= z1:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return pts[-1][0]


def oriented(ob, x, y, z):
    """Turns `ob` so its local x, y and z axes lie along the given directions."""
    ob.rotation_euler = Matrix((x, y, z)).transposed().to_euler()
    return ob


def chain(base, d, bend, lengths, curls):
    """Joint points from `base` along `d`, each segment turned from the one before by its curl about `bend`."""
    pts = [base]
    for length, curl in zip(lengths, curls):
        d = Matrix.Rotation(curl, 3, bend) @ d
        pts.append(pts[-1] + d * length)
    return pts


def digit(joints, r):
    """A gloved finger through its joints, knuckle to tip: it swells at each knuckle, thins along each phalanx and
    ends in a rounded tip."""
    path, radii = [], []
    for k, (a, b) in enumerate(zip(joints, joints[1:])):
        taper = 1 - 0.1 * k
        path += [a, a.lerp(b, 0.5)]
        radii += [r * taper * 1.1, r * taper * 0.86]
    tip = joints[-1] + (joints[-1] - joints[-2]).normalized() * r * 0.45
    return sweep('finger', path + [joints[-1], tip], radii + [r * 0.72, r * 0.42], 8, GLOVE)


def forearm(start, band, wrist, r):
    """The gloved forearm from inside the sleeve to the wrist, with a gold band at `band` where the glove's cuff ends."""
    sweep('forearm', [start, start.lerp(wrist, 0.5), wrist], [r * 1.2, r * 1.1, r * 0.92], 10, GLOVE)
    d = (wrist - start).normalized()
    side = d.cross(Vector((0, 0, 1))).normalized()
    up = side.cross(d)
    sweep('glove_band', [band + (side * math.cos(a) + up * math.sin(a)) * r * 1.16
                         for a in [2 * math.pi * k / 16 for k in range(17)]], 0.004, 4, GOLD, caps=False)


def fist(center, around, back, wrap, r):
    """A gloved fist closed on a rod along `around` of radius `wrap`: the back of the hand toward `back`, four fingers
    wrapping round the rod's front, and the thumb coming round the other way to lie over the index finger.
    Returns the wrist."""
    back = (back - around * back.dot(around)).normalized()
    front = around.cross(back)
    reach = wrap + r

    def at(deg, h, out=0.0):
        a = math.radians(deg)
        return center + around * h + (back * math.cos(a) + front * math.sin(a)) * (reach + out)

    oriented(blob('palm', at(-30, 0.0, 0.002), 0.034, GLOVE, scale=(0.55, 1.0, 1.15), subdiv=2), back, -front, around)
    for h, k in ((0.027, 1.0), (0.009, 1.04), (-0.009, 1.0), (-0.026, 0.86)):
        digit([at(deg, h * k) for deg in (12, 78, 136, 190)], r * k)
    blob('thumb_pad', at(-55, 0.016, 0.004), 0.017, GLOVE, scale=(1, 1, 1.2), subdiv=2)
    digit([at(-60, 0.022, 0.004), at(-125, 0.034, 0.008), at(-185, 0.034, 0.013), at(-228, 0.028, 0.014)], r * 1.1)
    return at(-30, -0.004) - front * 0.032


def open_hand(wrist, fwd, up, r):
    """A gloved hand held out palm up from `wrist` along `fwd`: four fingers fanned and curled gently up, as if
    cradling something, the thumb turned out to the side. Returns the centre of the palm."""
    side = fwd.cross(up).normalized()
    up = side.cross(fwd).normalized()
    palm = wrist + fwd * 0.03
    oriented(blob('palm', palm, 0.034, GLOVE, scale=(1.15, 1.0, 0.4), subdiv=2), side, fwd, up)
    for h, spread, k in ((-0.027, -24, 1.0), (-0.009, -8, 1.06), (0.009, 8, 1.0), (0.026, 24, 0.86)):
        d = Matrix.Rotation(math.radians(spread), 3, up) @ fwd
        digit(chain(wrist + fwd * 0.058 + side * h + up * 0.003, d, side, [0.026 * k, 0.019 * k, 0.015 * k],
                    [0.2, 0.42, 0.38]), r * k)
    blob('thumb_pad', wrist + fwd * 0.018 - side * 0.03 + up * 0.002, 0.016, GLOVE, scale=(1, 1.3, 0.8), subdiv=2)
    d = (-side * 0.7 + fwd * 0.65 + up * 0.15).normalized()
    digit(chain(wrist + fwd * 0.02 - side * 0.036, d, (fwd - up).normalized(), [0.022, 0.017], [0.3, 0.4]), r * 1.15)
    return palm


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


WAIST = next(i for i, (_, z) in enumerate(ROBE_R) if z > 0.65)
lathe('robe', ROBE_R[:WAIST + 1], RSIDES, MAIN, sy=SY, shape=robe_shape, levels=1,
      mask=lambda i, j: float(ROBE_R[i][1] < HEM_TOP))
robe_top = lathe('robe_top', ROBE_R[WAIST:], RSIDES, MAIN, sy=SY, shape=robe_shape, levels=1)
HEM = [k / 240 for k in range(241)]
RIM = [2 * math.pi * k / 48 for k in range(49)]
sweep('hem_lip', [robe_at(u, 0.02, 0.006) for u in HEM[::3]], 0.014, 8, GOLD, caps=False)
sweep('hem_band', [robe_at(u, HEM_TOP + 0.004, 0.004) for u in HEM[::3]], 0.008, 6, GOLD, caps=False)

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


before_upper = set(bpy.data.objects)
collar = grid('collar', 5, C_COLS, collar_at, HOODC, levels=1)
solidify(collar, 0.012, offset=1.0, inner=TEAM)
sweep('collar_rim', [collar_at(4, j, 0.004) for j in range(C_COLS)], 0.007, 6, GOLD)
for j in (0, C_COLS - 1):
    sweep('collar_edge', [collar_at(i, j, 0.0) for i in range(5)], 0.007, 6, GOLD)
for j in range(3, C_COLS - 3, 3):
    hi(sweep('collar_rib', [collar_at(i, j, 0.003) for i in range(5)], 0.003, 4, GOLD))

# The head: an indigo hood with an oval opening, filled by a head of silver hair and a gold mask moulded to the
# face, engraved with one closed eye: she sees the future, not the present. The hood rises to a soft peak that
# leans back, gathers in folds round the throat, and a gold seam runs over its crown from the brow to the nape.
before_head = set(bpy.data.objects)
HC = Vector((0, -0.02, 1.2))
HOOD = [(0.09, 1.0), (0.11, 1.05), (0.132, 1.1), (0.143, 1.16), (0.146, 1.22), (0.14, 1.28), (0.124, 1.33),
        (0.098, 1.37), (0.062, 1.405), (0.028, 1.435), (0.0, 1.45)]
HSY = 0.96
HSIDES = 24
OW, OZ, OH = 0.112, 1.185, 0.132


def hood_at(a, z, out=0.0):
    """The hood's surface at angle `a` round it (0 = front) and height z, pushed `out` along it."""
    r = (interp(HOOD, z) + out) * (1 + 0.07 * smoothstep(1.12, 1.0, z) * math.sin(6 * a))
    return Vector((r * math.sin(a), HC.y - r * HSY * math.cos(a) + 0.05 * smoothstep(1.3, 1.45, z), z))


def hood_front(x, z, out=0.0):
    return hood_at(math.asin(max(-1.0, min(1.0, x / (interp(HOOD, z) + out)))), z, out)


def in_face(c):
    return c.y < HC.y - 0.06 and (c.x / OW) ** 2 + ((c.z - OZ) / OH) ** 2 < 1


hood = lathe('hood', HOOD, HSIDES, HOODC, levels=1,
             shape=lambda i, j, x, y, z: hood_at(math.pi / HSIDES + 2 * math.pi * j / HSIDES, z))
drop_faces(hood, lambda c: not in_face(c))
solidify(hood, 0.02, inner=VOID)
rim = [hood_front(OW * 1.04 * math.cos(t), OZ + OH * 1.04 * math.sin(t), 0.004) for t in RIM]
sweep('hood_rim', rim, 0.014, 8, HOODC, caps=False)
sweep('hood_piping', [hood_front(OW * 1.16 * math.cos(t), OZ + OH * 1.13 * math.sin(t), 0.006) for t in RIM],
      0.0045, 6, GOLD, caps=False)
CROWN = [1.345, 1.37, 1.395, 1.415, 1.432, 1.444]
sweep('hood_seam', [hood_at(0, z, 0.006) for z in CROWN] + [hood_at(0, 1.45, 0.006) + Vector((0, 0.01, 0.002))] +
      [hood_at(math.pi, z, 0.006) for z in reversed(CROWN + [1.3, 1.24, 1.17, 1.1, 1.04])], 0.0045, 6, GOLD)
for sx in (-1, 1):
    hi(sweep('hood_welt', [hood_at(sx * math.pi / 2, z, 0.002) for z in (1.04, 1.12, 1.2, 1.28, 1.34, 1.39, 1.425)],
             0.004, 6, HOODC))

# The head fills the hood: a skull narrowing to the jaw, with a brow, a short nose, cheekbones, lips and a chin. The
# mask is moulded over that face and its rim curls down into it, so it sits on the head instead of floating in the dark.
M = Vector((0, -0.045, 1.185))
RX, RY, RZ = 0.11, 0.112, 0.142


def jaw(z):
    return 1 - 0.24 * smoothstep(-0.01, -RZ, z)


def bump(dx, sx, dz, sz):
    return math.exp(-(dx / sx) ** 2 - (dz / sz) ** 2)


def features(x, z):
    """How far the face stands out of the skull at (x, z) about M."""
    ax = abs(x)
    brow = 0.006 * math.exp(-((z - 0.042) / 0.013) ** 2) * max(0.0, 1 - (x / 0.07) ** 2)
    t = smoothstep(-0.012, -0.05, z) * smoothstep(-0.066, -0.053, z)
    nose = 0.014 * t * math.exp(-(x / (0.007 + 0.006 * t)) ** 2)
    cheek = 0.007 * bump(ax - 0.05, 0.02, z + 0.03, 0.018)
    hollow = -0.004 * bump(ax - 0.045, 0.018, z + 0.066, 0.016)
    lips = 0.004 * bump(x, 0.02, z + 0.077, 0.007) - 0.002 * bump(x, 0.017, z + 0.078, 0.0022)
    chin = 0.008 * bump(x, 0.022, z + 0.104, 0.013)
    return brow + nose + cheek + hollow + lips + chin


def skull_at(ph, z, out=0.0):
    """The skull at azimuth `ph` (0 = front) and height z about M, pushed `out` along its normal."""
    def at(ph, z):
        s = math.sqrt(max(0.0, 1 - (z / RZ) ** 2))
        return Vector((M.x + RX * jaw(z) * s * math.sin(ph), M.y - RY * s * math.cos(ph), M.z + z))
    c = at(ph, z)
    n = (at(ph + 1e-3, z) - c).cross(at(ph, z + 1e-3) - c).normalized()
    return c + n * out


def skull_ph(x, z):
    return math.asin(max(-1.0, min(1.0, x / (RX * jaw(z) * math.sqrt(max(1e-6, 1 - (z / RZ) ** 2))))))


def on_mask(x, z, out=0.0):
    """A point on the mask, moulded over the face 4 mm out, `out` further forward."""
    s = max(0.0, 1 - (x / (RX * jaw(z))) ** 2 - (z / RZ) ** 2)
    return Vector((M.x + x, M.y - RY * math.sqrt(s) - features(x, z) - 0.004 - out, M.z + z))


M_TOP, M_BOT, M_W = 0.107, -0.117, 0.084
N = 13


def mask_xz(a, b):
    """(a, b) in the unit square to (x, z) on the face: an oval that narrows to the chin."""
    x, v = a * math.sqrt(1 - b * b / 2), b * math.sqrt(1 - a * a / 2)
    z = (M_TOP + M_BOT) / 2 + v * (M_TOP - M_BOT) / 2
    return x * M_W * jaw(z), z


def under_mask(c):
    """Whether a skull face lies hidden under the mask."""
    x, z = c.x - M.x, c.z - M.z
    v = (z - (M_TOP + M_BOT) / 2) / ((M_TOP - M_BOT) / 2)
    return c.y < M.y - 0.04 and (x / (M_W * jaw(z))) ** 2 + v * v < 0.7


SK_Z = [RZ * math.cos(math.pi * i / 13) for i in range(1, 13)]
skull = grid('skull', len(SK_Z), 22, lambda i, j: skull_at(2 * math.pi * j / 22, SK_Z[-1 - i]), HAIR, levels=0,
             wrap=True)
drop_faces(skull, lambda c: c.y < M.y + 0.05 and not under_mask(c))


def mask_at(i, j):
    a, b = -1 + 2 * j / (N - 1), -1 + 2 * i / (N - 1)
    return on_mask(*mask_xz(a, b), -0.007 * smoothstep(0.75, 1.0, max(abs(a), abs(b))))


grid('mask', N, N, mask_at, MASKM, levels=1)

# The closed eye: a heavy lid inlaid in indigo enamel, bowed down like a sleeper's, lashes hanging from its gold-dark
# edge and rays fanning over the brow. Dark on gold, so the eye still reads at battle zoom.
EYE_Z, EYE_W = 0.014, 0.044


def lid_z(x, lift):
    return EYE_Z + lift * (1 - (x / EYE_W) ** 2)


EYE_X = [EYE_W * (2 * k / 14 - 1) for k in range(15)]
grid('eye_lid_fill', 4, 15, lambda i, j: on_mask(EYE_X[j], lid_z(EYE_X[j], 0.008 - 0.025 * i / 3), 0.0012), ENAMEL,
     levels=0)
sweep('eye_lid', [on_mask(x, lid_z(x, -0.017), 0.0018) for x in EYE_X],
      [0.0028 + 0.0028 * math.sin(math.pi * k / 14) for k in range(15)], 6, INLAY)
for k in range(1, 14, 2):
    x = EYE_X[k]
    z = lid_z(x, -0.017)
    sweep('lash', [on_mask(x, z, 0.002), on_mask(x * 1.18, z - 0.017, 0.0014)], [0.0028, 0.001], 4, INLAY)
for t in [math.radians(d) for d in (20, 55, 90, 125, 160)]:
    hi(sweep('brow_ray', [on_mask(0.05 * math.cos(t), EYE_Z + 0.014 + 0.03 * math.sin(t), 0.0012),
                          on_mask(0.066 * math.cos(t), EYE_Z + 0.014 + 0.05 * math.sin(t), 0.0008)],
             [0.0022, 0.0008], 4, INLAY))

# Silver hair parted under the hood's brow falls past the mask's temples to below the jaw, filling the hood round the
# face. Fine strands are painted into the skull; five locks a side give it body.
for sx in (-1, 1):
    for k in range(10):
        hi(sweep('strand', [skull_at(sx * (0.1 + 0.09 * k + (0.85 - 0.03 * k) * smoothstep(0, 0.35, m / 8)),
                                     0.125 - 0.24 * m / 8, 0.001) for m in range(9)], 0.003, 4, HAIR))
    for k, (ph0, ph1, w) in enumerate(((0.1, 1.0, 0.016), (0.32, 1.12, 0.018), (0.56, 1.25, 0.018),
                                       (0.8, 1.4, 0.018), (1.05, 1.6, 0.016))):
        ts = [m / 6 for m in range(7)]
        sweep('lock', [skull_at(sx * (ph0 + (ph1 - ph0) * smoothstep(0, 0.35, t)), 0.125 - 0.255 * t,
                                0.004 + 0.0025 * k + 0.006 * math.sin(math.pi * t)) for t in ts],
              [w * (1 - 0.55 * t ** 2) for t in ts], 6, HAIR, squash=0.55)

# The mask is pinned at temple and jaw with gold studs; a gold strap runs from each temple stud over the hair and back
# into the hood.
for sx in (-1, 1):
    for b in (0.35, -0.6):
        x, z = mask_xz(sx, b)
        blob('mask_stud', on_mask(x, z, 0.001), 0.0075, GOLD, subdiv=2)
    x, z = mask_xz(sx, 0.35)
    ph0 = skull_ph(abs(x), z)
    sweep('mask_strap', [skull_at(sx * (ph0 + (2.2 - ph0) * k / 8), z, 0.03) for k in range(9)], 0.0026, 6, GOLD,
          squash=3.2)

# The head tips back a little, proud, and so the mask turns up to a camera looking down on the board.
NECKP = Vector((0, -0.02, 1.02))
tip = Matrix.Translation(NECKP) @ Matrix.Rotation(-0.2, 4, 'X') @ Matrix.Translation(-NECKP)
for ob in set(bpy.data.objects) - before_head:
    ob.matrix_world = tip @ ob.matrix_world
UPPER = [ob for ob in bpy.data.objects if ob not in before_upper and ob.parent is None]

ARMS = {
    'r': (Vector((-0.16, 0.0, 0.93)), Vector((-0.262, -0.02, 0.72)), None, (0.058, 0.061, 0.065, 0.069, 0.073, 0.078, 0.084)),
    'l': (Vector((0.16, 0.0, 0.93)), Vector((0.278, 0.0, 0.745)), Vector((0.302, -0.205, 0.77)),
          (0.058, 0.061, 0.065, 0.069, 0.073, 0.078, 0.084)),
}
SLEEVE = 0.56
HEM = 0.8
RIGHT_HAND = Vector((-0.282, -0.25, 0.745))
POLE = Vector((-0.04, 0.0, 1.0)).normalized()
GRIP = 0.017


def made(build):
    """What `build()` returns, and the objects it made."""
    before = set(bpy.data.objects)
    out = build()
    return out, [o for o in bpy.data.objects if o not in before]


R_WRIST, R_FIST = made(lambda: fist(RIGHT_HAND, POLE, Vector((-1, 0.25, 0)), GRIP, 0.0115))
s, e, _, radii = ARMS['r']
ARMS['r'] = (s, e, R_WRIST, radii)
L_FWD = Vector((0.45, -0.9, 0.0)).normalized()
LEFT_HAND, L_OPEN = made(lambda: open_hand(ARMS['l'][2], L_FWD, Vector((0.05, -0.2, 1)), 0.0095))
HANDS = {'r': (RIGHT_HAND, R_FIST), 'l': (ARMS['l'][2] + L_FWD * 0.07, L_OPEN)}


def opening(side):
    s, e, w, _ = ARMS[side]
    return e.lerp(w, SLEEVE)


RIG = armature('rig', [('hips', (0, 0, 0.3), (0, 0, 0.68), None, (1, 0, 0)), ('chest', (0, 0, 0.68), (0, 0, 1.0), 'hips', (1, 0, 0))] + [
    bone for side, (s, e, w, _) in ARMS.items() for bone in (
        (f'clavicle_{side}', (0, 0.0, 0.95), s, 'chest', (0, 1 if side == 'r' else -1, 0)),
        (f'upperarm_{side}', s, e, f'clavicle_{side}', (1, 0, 0)),
        (f'shoulder_{side}', s, e, f'clavicle_{side}', (1, 0, 0)),
        (f'forearm_{side}', e, w, f'upperarm_{side}', (1, 0, 0)),
        (f'elbow_{side}', e, w, f'upperarm_{side}', (1, 0, 0)),
        (f'hand_{side}', w, HANDS[side][0], f'forearm_{side}', (1, 0, 0)),
        (f'drape_{side}', e, opening(side), f'forearm_{side}', (1, 0, 0)),
    )
])
for side in ARMS:
    halfway(RIG, f'shoulder_{side}', f'upperarm_{side}', bulge=0.06)
    halfway(RIG, f'elbow_{side}', f'forearm_{side}', bulge=0.1)
    drape(RIG, f'drape_{side}', slide=0.4, droop=0.9)
    for ob in HANDS[side][1]:
        bone_parent(ob, RIG, f'hand_{side}')
bone_parent(empty('grip_r', RIGHT_HAND), RIG, 'hand_r')

for side, (s, e, w, radii) in ARMS.items():
    end = opening(side)
    path, along, elbow = sleeve_path(s, e, end, bend=0.05)
    rs = [interp([(r, k / (len(radii) - 1)) for k, r in enumerate(radii)], t) for t in along]
    sl = sweep(f'sleeve_{side}', path, rs, 14, MAIN, caps=False, levels=1, mask=lambda i, a=along: float(a[i] >= HEM))
    solidify(sl, 0.012, inner=LINING)
    sl.modifiers['solid'].use_even_offset = False
    skin(sl, RIG, lambda v: sleeve(side, along[v.index // 14], elbow))
    _, fr = frames(path)
    f = (end - e).normalized()
    cuff = [end + (fr[-1][0] * math.cos(a) + fr[-1][1] * math.sin(a)) * (rs[-1] + 0.002)
            for a in [2 * math.pi * k / 40 for k in range(41)]]
    rim = sleeve(side, 1.0, elbow)
    skin(sweep('cuff', cuff, 0.006, 6, GOLD, caps=False), RIG, lambda v: rim)
    # An undersleeve funnels from the cuff down to the forearm, so the open sleeve shows lit lining, not a dark hole.
    skin(sweep('undersleeve', [end - f * 0.006, end - f * 0.04], [rs[-1] - 0.012, 0.03], 14, LINING, caps=False),
         RIG, lambda v: rim)
    _, obs = made(lambda: forearm(e + f * 0.03, end.lerp(w, 0.3), w, 0.022))
    for ob in obs:
        bone_parent(ob, RIG, f'forearm_{side}')

P = LEFT_HAND + Vector((0, 0, 0.12))
planet = bone_parent(empty('planet', P), RIG, 'hand_l')
parent(blob('planet_body', P, 0.035, GEM, subdiv=3), planet)
parent(torus('planet_ring', P, (math.radians(70), math.radians(20), 0), 0.056, 0.004, GOLD, segs=32, minor_segs=4),
       planet)
glow(P, LILAC, 0.14, planet, name='glow_planet')
loop(planet, 'location', 2, [P.z, P.z + 0.025], 72)
spin(planet, axis=2, period=144)

# The armillary: an eclipsed sun floats over the head, a black disc in a lilac corona, and three gold rings tilted at
# different angles turn about it, each carrying a bead so the turning shows. The whole sphere wheels slowly.
AC = Vector((0, -0.02, 1.63))
armill = empty('armillary', AC)
spin(armill, axis=2, period=240)
loop(armill, 'location', 2, [AC.z, AC.z + 0.02], 96)


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


ring(0, AC, 0.165, (math.radians(70), 0, 0), 0.0065, 120, 1, owner=armill)
ring(1, AC, 0.15, (math.radians(62), 0, math.radians(90)), 0.0055, 96, -1, owner=armill)
ring(2, AC, 0.19, (math.radians(23), math.radians(8), 0), 0.0, 168, 1, band=True, owner=armill)
# A wide halo ring rides round the crown of the hood, tying the floating sphere to the head.
HALO = Vector((0, -0.02, 1.39))
halo = ring(3, HALO, 0.21, (math.radians(9), math.radians(6), 0), 0.0075, 200, -1)

sun = parent(empty('sun', AC), armill)
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
weapon = bone_parent(empty('weapon', RIGHT_HAND), RIG, 'hand_r')
empty('hold_r', RIGHT_HAND, weapon)


def part(ob):
    return parent(ob, weapon)


def pole_at(z):
    return RIGHT_HAND + POLE * ((z - RIGHT_HAND.z) / POLE.z)


TOP = 1.36
part(sweep('rod', [pole_at(0.06), pole_at(0.8), pole_at(TOP)], [0.011, 0.013, 0.012], 8, ENAMEL))
part(sweep('butt', [pole_at(0.02), pole_at(0.06)], [0.006, 0.016], 8, GOLD))
for z, h in ((0.06, 0.02), (0.74, 0.025), (0.86, 0.025), (TOP - 0.03, 0.04)):
    part(sweep('ferrule', [pole_at(z), pole_at(z + h / 2), pole_at(z + h)], [0.015, 0.019, 0.015], 10, GOLD))
part(sweep('grip', [pole_at(0.765), pole_at(0.8), pole_at(0.86)], [GRIP, GRIP + 0.001, GRIP], 10, ENAMEL))
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
flock['clear'] = True
spin(flock, axis=2, period=288, turns=-1)
# Each orbit (angle, height, radius, bob) keeps out of the band the resting arms, hands and planet fill (0.62 to 1.18
# high), under the sceptre's astrolabe and wide enough to pass its rod. The clips flare the flock wider while the arms
# and the sceptre reach out (see flare()), so a shard never passes through them whatever its phase.
DRIFT = ((0.6, 0.5, 0.47, 0.035, 'shard'), (1.9, 1.22, 0.47, 0.025, 'shard'), (2.9, 0.34, 0.46, 0.035, 'planet'),
         (3.7, 0.54, 0.47, 0.03, 'shard'), (4.6, 1.225, 0.47, 0.025, 'shard'), (5.5, 0.26, 0.46, 0.04, 'planet'))
for k, (a, z, r, rise, kind) in enumerate(DRIFT):
    p = Vector((r * math.sin(a), -r * math.cos(a), z))
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
    loop(bob, 'location', 2, [z, z + rise], 60 + 12 * k)

for ob in UPPER + [bpy.data.objects[n] for n in ('brooch', 'brooch_disc')] + [armill, halo]:
    bone_parent(ob, RIG, 'chest')
for ob in [robe_top] + [o for o in bpy.data.objects if o.name.split('.')[0] in ('panel', 'panel_piping')]:
    skin(ob, RIG, lambda v: waist(v.co.z, 0.66, 0.84))

for ob in list(bpy.data.objects):
    if ob.parent is None and ob not in (breath, flock):
        parent(ob, breath)

for b, axis, peak in (('clavicle_r', 0, 0.03), ('clavicle_l', 0, 0.03), ('upperarm_r', 2, 0.02), ('upperarm_l', 2, -0.025),
                      ('upperarm_l', 0, -0.03), ('forearm_l', 0, -0.03), ('hand_l', 0, 0.06)):
    loop(RIG, f'pose.bones["{b}"].rotation_euler', axis, [0.0, peak], 96)


key = partial(bone_key, RIG)


def wields(keys, sceptre, palm):
    """`keys` with the sceptre hand keeping the rod's lean at `sceptre` and the open hand keeping its palm's at `palm`,
    so the rod stays upright and the planet stays over the palm whatever the arms do."""
    return wield(wield(keys, RIG, 'hand_r', sceptre, 'chest'), RIG, 'hand_l', palm, 'chest')


R, L = 'rotation_euler', 'location'
CHEST = key('chest', X), key('chest', Y), key('chest', Z)


def flare(frames):
    """Widens the flock's orbits by `frames` [(frame, share)]: the shards flare out from her as she moves, wide of the
    arms and the sceptre."""
    return {(flock, 'scale', 0): frames, (flock, 'scale', 1): frames}


act('cast', 12, wields({
    CHEST[0]: [(0, 0), (5, 0.12), (12, -0.12), (16, -0.08), (24, 0)],
    CHEST[1]: [(0, 0), (5, 0.08), (12, -0.2), (16, -0.15), (24, 0)],
    CHEST[2]: [(0, 0), (5, 0.03), (12, 0.06), (24, 0)],
    (breath, R, 0): [(0, 0), (5, 0.03), (12, -0.03), (24, 0)],
    key('clavicle_l', X): [(0, 0), (5, -0.04), (12, 0.12), (16, 0.08), (24, 0)],
    key('upperarm_l', X): [(0, 0), (5, 0.3), (12, -0.65), (16, -0.6), (24, 0)],
    key('upperarm_l', Y): [(0, 0), (5, 0.0), (12, -1.0), (16, -0.95), (24, 0)],
    key('upperarm_l', Z): [(0, 0), (5, 0.05), (12, -0.6), (16, -0.55), (24, 0)],
    key('forearm_l', X): [(0, 0), (5, -0.35), (12, 0.8), (16, 0.7), (24, 0)],
    key('clavicle_r', X): [(0, 0), (12, 0.06), (24, 0)],
    key('upperarm_r', X): [(0, 0), (5, 0.05), (12, -0.45), (16, -0.4), (24, 0)],
    key('upperarm_r', Z): [(0, 0), (5, 0.12), (12, 0.15), (24, 0)],
    key('forearm_r', X): [(0, 0), (5, -0.2), (12, -0.35), (16, -0.3), (24, 0)],
    (planet, L, 2): [(0, 0), (5, -0.02), (12, 0.1), (16, 0.08), (24, 0)],
} | flare([(0, 0), (4, 0.12), (9, 0.38), (17, 0.35), (24, 0)]), [(0, 0), (5, -0.05), (12, 0.15), (16, 0.1), (24, 0)],
   [(0, 0), (5, -0.25), (12, 0.35), (16, 0.25), (24, 0)]))
act('attack', 9, wields({
    CHEST[0]: [(0, 0), (5, -0.08), (9, 0.2), (13, 0.24), (22, 0)],
    CHEST[1]: [(0, 0), (5, 0.3), (9, -0.35), (13, -0.45), (22, 0)],
    CHEST[2]: [(0, 0), (5, -0.06), (9, 0.06), (22, 0)],
    (breath, R, 2): [(0, 0), (5, 0.1), (9, -0.08), (13, -0.12), (22, 0)],
    key('clavicle_r', X): [(0, 0), (5, 0.1), (9, -0.04), (22, 0)],
    key('upperarm_r', X): [(0, 0), (5, 0.25), (9, -1.0), (13, -1.1), (22, 0)],
    key('upperarm_r', Z): [(0, 0), (5, 0.45), (9, 0.05), (13, -0.1), (22, 0)],
    key('forearm_r', X): [(0, 0), (5, -0.7), (9, -0.1), (13, -0.05), (22, 0)],
    key('upperarm_l', X): [(0, 0), (5, -0.45), (9, 0.4), (13, 0.45), (22, 0)],
    key('upperarm_l', Z): [(0, 0), (5, -0.05), (9, -0.25), (13, -0.3), (22, 0)],
    key('forearm_l', X): [(0, 0), (5, -0.3), (9, 0.2), (22, 0)],
} | flare([(0, 0), (4, 0.3), (13, 0.3), (22, 0)]), [(0, 0), (5, -0.35), (9, 0.85), (13, 1.0), (22, 0)],
   [(0, 0), (5, 0.1), (9, -0.1), (22, 0)]))
act('hit', 2, wields({
    CHEST[0]: [(0, 0), (2, -0.3), (6, 0.06), (14, 0)],
    CHEST[1]: [(0, 0), (2, -0.12), (6, 0.03), (14, 0)],
    (breath, R, 0): [(0, 0), (2, -0.08), (7, 0.02), (14, 0)],
    key('clavicle_l', X): [(0, 0), (2, 0.18), (7, 0.03), (14, 0)],
    key('clavicle_r', X): [(0, 0), (2, 0.18), (7, 0.03), (14, 0)],
    key('upperarm_l', X): [(0, 0), (2, -0.25), (7, -0.08), (14, 0)],
    key('upperarm_l', Z): [(0, 0), (2, 0.2), (6, -0.04), (14, 0)],
    key('forearm_l', X): [(0, 0), (2, -0.6), (7, -0.15), (14, 0)],
    key('upperarm_r', X): [(0, 0), (2, -0.15), (14, 0)],
    key('upperarm_r', Z): [(0, 0), (2, -0.2), (14, 0)],
    key('forearm_r', X): [(0, 0), (2, -0.35), (7, -0.15), (11, -0.05), (14, 0)],
    (planet, L, 2): [(0, 0), (2, 0.05), (6, -0.02), (14, 0)],
} | flare([(0, 0), (2, 0.3), (8, 0.25), (14, 0)]), [(0, 0), (2, -0.2), (6, 0.06), (14, 0)],
   [(0, 0), (2, -0.3), (7, 0.05), (14, 0)]))
act('move', 0, wields({
    (breath, R, 0): [(0, 0.06), (8, 0.06)],
    (breath, R, 1): [(0, 0), (2, 0.05), (4, 0), (6, -0.05), (8, 0)],
    CHEST[1]: [(0, 0.14), (4, -0.14), (8, 0.14)],
    key('upperarm_l', X): [(0, -0.45), (4, 0.4), (8, -0.45)],
    key('upperarm_l', Z): [(0, -0.08), (4, -0.12), (8, -0.08)],
    key('forearm_l', X): [(0, -0.25), (4, 0.15), (8, -0.25)],
    key('upperarm_r', X): [(0, 0.2), (4, -0.2), (8, 0.2)],
    key('forearm_r', X): [(0, -0.3), (4, -0.2), (8, -0.3)],
} | flare([(0, 0.3), (8, 0.3)]), [(0, 0.12), (4, -0.05), (8, 0.12)],
   [(0, 0), (8, 0)]))
DOWNED = {CHEST[0]: 0.3, (breath, 'scale', 2): -0.1, key('clavicle_l', X): 0.12, key('clavicle_r', X): 0.12,
          key('upperarm_l', X): 0.8, key('upperarm_l', Z): -0.75, key('forearm_l', X): 0.4,
          key('upperarm_r', X): 0.7, key('upperarm_r', Z): 0.6, key('forearm_r', X): 0.3}
FLUNG = {key('upperarm_l', X): -0.7, key('upperarm_l', Z): -0.5, key('upperarm_r', X): -0.2, key('upperarm_r', Z): 0.4}
act('down', 10, wields({k: [(0, 0), (4, FLUNG.get(k, v * 0.4)), (12, v)] for k, v in DOWNED.items()}
                       | flare([(0, 0), (4, 0.4), (12, 0.4)]),
                       [(0, 0), (4, -0.05), (12, -0.3)], [(0, 0), (4, -0.4), (12, -0.9)]))
PUSH = {CHEST[0]: 0.45, key('upperarm_l', X): 1.0, key('upperarm_r', X): 0.85, key('forearm_l', X): 0.2}
act('rise', 8, wields({k: [(0, v), (6, PUSH.get(k, v)), (11, -0.1 * v if k == CHEST[0] else 0), (16, 0)]
                       for k, v in DOWNED.items()} | flare([(0, 0.4), (8, 0.4), (16, 0)]),
                      [(0, -0.3), (6, -0.2), (16, 0)], [(0, -0.9), (6, -0.6), (16, 0)]))


# A 12px margin still covers the 6px half-gap between islands, and keeps the atlases inside the 3 MB budget.
meshes = bake(fill='#3a1e8a', margin=12, quality=(82, 74))
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
print(f'astromancer: {tris} triangles, {len(meshes)} meshes')
finish()
