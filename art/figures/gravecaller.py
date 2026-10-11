"""The Gravecaller: a hooded bone priest whose face is a black void with two glowing eyes. A long green coat open down
the front over a dark under-robe and boots, a team scarf wrapped at the throat with a long tail streaming out, a wide
belt with a pale buckle and hanging charms, a tall scythe in the right hand, a soul bell in the left, and two ghost
skulls burning around it. Smooth subdivided forms, painted by lookdev and baked from a high-poly twin."""
import math
import os
import sys
from functools import partial

sys.path.insert(0, os.path.dirname(__file__))
import bmesh
import bpy
from mathutils import Vector, noise
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


CLOTH = creases((9, 9, 1.6), 0.004)
MAIN = paint('main', '#275f48', '#0a2024', '#5c9a76', rough=0.85, edge=0.8, mottle=0.12, streak=0.6, grime=0.45,
             accent='#b8954e', keep=True, relief=CLOTH)
TEAM = paint('team', '#d8d8d8', '#6c6c6c', '#ffffff', rough=0.9, streak=0.5, mottle=0.06, accent='#9a9a9a', keep=True,
             relief=creases((3, 3, 26), 0.004))
DARK = paint('robe_dark', '#1a2a24', '#060c0b', '#34514a', rough=0.9, streak=0.5, grime=0.4, relief=CLOTH)
LEATHER = paint('leather', '#5e3b22', '#24130b', '#a8784a', edge=0.9, mottle=0.14, relief=grain(45, 0.0012))
GOLD = paint('gold', '#c99a3e', '#4a2a0e', '#ffe9a6', metal=True, cavity=0.35, edge=1.0, mottle=0.06)
SILVER = paint('silver', '#cfc9b4', '#4a4a44', '#fffdf0', metal=True, cavity=0.4, edge=1.0, mottle=0.05)
WOOD = paint('wood', '#6f4426', '#2a160b', '#a87548', streak=1.0, mottle=0.2, edge=0.6,
             relief=creases((70, 70, 5), 0.0015))
WRAP = paint('wrap', '#b49a6a', '#4e3c22', '#e8d6a8', edge=0.7, mottle=0.1, relief=creases((3, 3, 90), 0.0015))
STEEL = paint('steel', '#7f9a98', '#26363b', '#e4f4f0', metal=True, edge=0.15, mottle=0.05, accent='#f6fffc')
BONE = paint('bone', '#ddd0b0', '#6e5a3e', '#fffbea', mottle=0.08, edge=0.6, relief=grain(70, 0.0006))
TASSEL = paint('tassel', '#2c7a70', '#0b2a28', '#7cd4c0', edge=0.4, mottle=0.08)
SPIRIT = paint('spirit', '#1e9a6c', '#020d0a', '#86ecc2', cavity=0.6, edge=0.7, mottle=0.1, accent='#000000', keep=True)
SOCKET = paint('socket', '#061411', '#000000', '#0c241e', cavity=0, edge=0, mottle=0)
SOUL = paint('soul', '#3fd9a0', '#0a5446', '#c8ffe8', cavity=0.25, edge=0.3, mottle=0.06, accent='#06382f', glow=1.6)
VOID = void()
EYES = material('eyes', '#d8fff2', rough=0.5, emit='#a8ffe6', strength=6.0)

GREEN_GLOW = '#5dffc0'


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


# A slow breath lifts everything the figure holds, so the hands never leave the scythe and the bell.
breath = loop(empty('breath'), 'scale', 2, [1.0, 1.018], 84)

# Coat: long, flaring to a frayed hem, open down the front below the belt onto the dark under-robe.
COAT = [(0.165, 1.04), (0.195, 0.99), (0.212, 0.9), (0.205, 0.8), (0.208, 0.72), (0.232, 0.62), (0.275, 0.45),
        (0.325, 0.27), (0.37, 0.1), (0.385, 0.035)]
SY = 0.82
ROWS, COLS = 15, 34


def gap(z):
    return 0.06 + 0.52 * smoothstep(0.7, 0.05, z)


def folds(a):
    return 0.55 * math.sin(7 * a + 0.4) + 0.3 * math.sin(12 * a + 1.7) + 0.15 * math.sin(3 * a + 0.9)


def coat_at(u, z, out=0.0):
    th = gap(z)
    a = th + (2 * math.pi - 2 * th) * u
    hang = smoothstep(0.62, 0.0, z)
    lapel = 0.018 * hang * max(smoothstep(0.08, 0.0, u), smoothstep(0.92, 1.0, u))
    r = interp(COAT, z) * (1 + 0.15 * hang * folds(a)) + lapel + out
    return Vector((r * math.sin(a), -r * math.cos(a) * SY, z - 0.025 * folds(a) * hang))


def coat_normal(p):
    return Vector((p.x, p.y / SY ** 2, 0)).normalized()


# Rows climb from the hem, so the faces point outward like every lathe's.
COAT_Z = [1.04 - (1.04 - 0.035) * ((ROWS - 1 - i) / (ROWS - 1)) ** 0.9 for i in range(ROWS)]
TEAR = (0.0, 0.03, 0.008, 0.0, 0.045, 0.012, 0.0, 0.022, 0.035, 0.0)


def coat_vert(i, j):
    p = coat_at(j / (COLS - 1), COAT_Z[i])
    if i == 0:
        p.z += TEAR[j % len(TEAR)]
    return p


def coat_mask(i, j):
    z = COAT_Z[i]
    edge = (j == 0 or j == COLS - 1) and z < 0.72
    return 1.0 if i <= 1 or edge else 0.0


# The coat is cut at a row under the belt: the skirt stays rigid and only the top is skinned to turn with the chest,
# which keeps skin weights off most of the coat.
WAIST = 10
skirt = solidify(grid('coat_skirt', WAIST + 1, COLS, coat_vert, MAIN, levels=1, mask=coat_mask), 0.02, inner=DARK)
coat = solidify(grid('coat', ROWS - WAIST, COLS, lambda i, j: coat_vert(i + WAIST, j), MAIN, levels=1,
                     mask=lambda i, j: coat_mask(i + WAIST, j)), 0.02, inner=DARK)
# Gold embroidery climbing the open front edges and running round the hem: a scroll between two lines of piping,
# a bead in each curl, and stitched seams beside it.
zs = [0.06 + 0.64 * k / 80 for k in range(81)]
for side in (0.03, 0.97):
    inward = 1 if side < 0.5 else -1
    hi(sweep('embroidery', [coat_at(side + 0.012 * math.sin(z * 70), z, 0.004) for z in zs], 0.0045, 6, GOLD))
    for du in (-0.024, 0.026):
        hi(sweep('piping', [coat_at(side + du * inward, z, 0.003) for z in zs], 0.003, 6, GOLD))
    for k in range(1, 22):
        z = (math.pi / 2 + math.pi * k) / 70
        if z < 0.7:
            hi(blob('embroidery_bead', coat_at(side - 0.012 * math.sin(z * 70), z, 0.004), 0.005, GOLD, subdiv=1))
    stitches([coat_at(side + 0.045 * inward, z, 0.002) for z in zs], coat_normal)
hem = [k / 160 for k in range(161)]
hi(sweep('hem_scroll', [coat_at(u, 0.105 + 0.014 * math.sin(u * 2 * math.pi * 26), 0.004) for u in hem], 0.0045, 6, GOLD))
for z in (0.083, 0.13):
    hi(sweep('hem_piping', [coat_at(u, z, 0.003) for u in hem], 0.003, 6, GOLD))
for k in range(52):
    u = (k + 0.5) / 52
    hi(blob('hem_bead', coat_at(u, 0.105 - 0.014 * math.sin(u * 2 * math.pi * 26), 0.004), 0.005, GOLD, subdiv=1))
stitches([coat_at(u, 0.15, 0.002) for u in hem], coat_normal)
for u in (0.25, 0.5, 0.75):
    stitches([coat_at(u, z, 0.002) for z in [0.12 + 0.6 * k / 30 for k in range(31)]], coat_normal, mat=DARK)

lathe('underrobe', [(0.27, 0.2), (0.25, 0.32), (0.22, 0.5), (0.2, 0.75)], 20, DARK, sy=0.82, levels=1,
      shape=lambda i, j, x, y, z: (x * (1 + 0.06 * math.sin(6 * j)), y * (1 + 0.06 * math.sin(6 * j)), z))
for sx in (-0.085, 0.085):
    sweep('leg', [(sx, -0.02, 0.08), (sx, -0.02, 0.4)], [0.06, 0.07], 10, DARK)
    box('boot', (sx, -0.08, 0.05), (0.11, 0.2, 0.1), LEATHER, bevel=0.035, segments=2)
    box('boot_cuff', (sx, -0.04, 0.13), (0.125, 0.13, 0.04), LEATHER, bevel=0.012)
    blob('boot_strap', (sx, -0.115, 0.1), 0.012, SILVER, subdiv=1)

# Hood: fitted to the head with a soft peak, gathered creases, a thick rolled rim and a wide opening onto the void.
HOOD = [(0.19, 0.99), (0.192, 1.05), (0.2, 1.11), (0.212, 1.17), (0.219, 1.23), (0.218, 1.29), (0.206, 1.35),
        (0.182, 1.4), (0.146, 1.445), (0.104, 1.483), (0.062, 1.515), (0.026, 1.54), (0.0, 1.555)]
HSY = 1.08
FACE = (0.158, 1.255, 0.142)


HOOD_SIDES = 32
# Creases fall from the peak down the crown and sides: (angle from the front, depth), each a valley in the cloth.
CREASES = ((1.0, 0.12), (2.0, 0.1), (2.75, 0.14), (3.55, 0.11), (4.3, 0.14), (5.3, 0.12))


def cowl(i, j, x, y, z):
    a = 2 * math.pi * (j + 0.5) / HOOD_SIDES
    lift = smoothstep(1.2, 1.555, z)
    gather = 0.035 * smoothstep(1.12, 1.0, z) * math.sin(9 * a)
    band = smoothstep(1.12, 1.25, z) * smoothstep(1.56, 1.42, z)
    dent = sum(d * math.exp(-abs(math.remainder(a - c - 0.5 * (z - 1.3), 2 * math.pi)) / 0.12) for c, d in CREASES)
    k = 1 + gather - band * dent
    return (x * k + 0.02 * lift ** 2, y * k + 0.1 * lift ** 2.4, z)


hood = lathe('hood', HOOD, HOOD_SIDES, MAIN, sy=HSY, phase=math.pi / HOOD_SIDES, shape=cowl, levels=1)


def in_face(c, grow=1.0):
    return c.y < -0.05 and (c.x / (FACE[0] * grow)) ** 2 + ((c.z - FACE[1]) / (FACE[2] * grow)) ** 2 < 1


drop_faces(hood, lambda c: not in_face(c))
bm = bmesh.new()
bm.from_mesh(hood.data)
for v in bm.verts:
    if v.is_boundary and in_face(v.co, 1.7):
        k = 1 / math.hypot(v.co.x / FACE[0], (v.co.z - FACE[1]) / FACE[2])
        v.co.x *= k
        v.co.z = FACE[1] + (v.co.z - FACE[1]) * k
bm.to_mesh(hood.data)
bm.free()
# The tip is narrower than the cloth is thick, so the lining would poke through it; thin the shell toward the point.
thick = hood.vertex_groups.new(name='thick')
for v in hood.data.vertices:
    thick.add([v.index], 1 - 0.9 * smoothstep(1.42, 1.52, v.co.z), 'REPLACE')
# Its inside is the void too: any lit lining shows through the opening as a shape where the face should be.
mod = solidify(hood, 0.04, inner=VOID).modifiers['solid']
mod.use_even_offset = False
mod.vertex_group = 'thick'


def hood_front(x, z, out=0.0):
    r = interp(HOOD, z)
    return Vector((x, -math.sqrt(max(r * r - x * x, 0.0)) * HSY - out, z))


# The rim rolls back over the opening's edge, thick and uneven like folded wool; its seam hides under the scarf.
RIM = [-math.pi / 2 + (2 * math.pi + 0.3) * k / 42 for k in range(43)]
rim_path = [hood_front(FACE[0] * 1.06 * math.cos(t), FACE[1] + FACE[2] * 1.06 * math.sin(t), 0.008) for t in RIM]
sweep('hood_rim', rim_path, [0.03 * (1 + 0.22 * math.sin(5 * t + 0.6) + 0.1 * math.sin(11 * t)) for t in RIM], 8, MAIN,
      caps=False, levels=1)
stitches([hood_front(FACE[0] * 1.42 * math.cos(t), FACE[1] + FACE[2] * 1.38 * math.sin(t), 0.004) for t in RIM[3:-3]],
         lambda p: Vector((p.x, p.y, 0)).normalized())
# Behind the opening: a void the lights cannot touch, and a plug of it across the neck so a camera looking down
# through the opening never sees into the coat and the sleeves below.
blob('void', (0, 0.025, 1.25), 0.17, VOID, scale=(0.95, 0.9, 0.95))
blob('void', (0, 0.0, 1.05), 0.19, VOID, scale=(1, 1.05, 0.45))
# One halo per eye: a single halo between them lights a spot in the void that reads as a nose.
for sx in (-0.052, 0.052):
    eye = blob('eye', (sx, -0.13, 1.238), 0.022, EYES, scale=(1.15, 0.45, 0.8))
    eye.rotation_euler.y = -math.copysign(0.3, sx)
    glow((sx, -0.15, 1.238), '#9dffe0', 0.05, name='glow_eye')

# Team scarf: a fat wrap at the throat, a knot, and a long tail streaming out under the scythe arm.
def wrap_shape(i, j, x, y, z):
    a = 2 * math.pi * j / 24
    front = max(0.0, -y / 0.25)
    puff = 1 + 0.1 * math.sin(4 * a + i * 1.4) + 0.05 * math.sin(9 * a)
    return (x * puff, y * puff, z - 0.035 * front ** 2)


lathe('scarf', [(0.2, 0.975), (0.245, 0.99), (0.262, 1.03), (0.255, 1.075), (0.228, 1.11), (0.2, 1.13)], 24, TEAM,
      sy=0.95, shape=wrap_shape, levels=1)
blob('scarf_knot', (-0.12, -0.235, 0.99), 0.06, TEAM, scale=(1.15, 0.85, 0.95))
tails = empty('scarf_tails', (-0.12, -0.24, 0.99))
TAIL = bezier((-0.13, -0.24, 0.98), (-0.13, -0.3, 0.78), (-0.2, -0.3, 0.58), (-0.5, -0.1, 0.46), 9)
TAIL_SIDE = (TAIL[-1] - TAIL[0]).cross(Vector((0, 1, 0))).normalized()
for ob in (
    ribbon('scarf_tail', TAIL, [0.12, 0.14, 0.15, 0.16, 0.17, 0.18, 0.19, 0.2, 0.21, 0.21], TAIL_SIDE, TEAM,
           notch=0.05, mask=lambda i: 1.0 if i == 8 else 0.0),
    ribbon('scarf_drop', bezier((-0.1, -0.25, 0.97), (-0.08, -0.28, 0.9), (-0.12, -0.27, 0.83), (-0.1, -0.25, 0.76), 6),
           [0.1, 0.105, 0.11, 0.11, 0.11, 0.11, 0.11], (1, 0, 0.1), TEAM, notch=0.035, mask=lambda i: 1.0 if i == 5 else 0.0),
):
    parent(ob, tails)
for edge in (-1, 1):
    stitches([p + TAIL_SIDE * (0.075 * edge) for p in TAIL[1:-1]],
             lambda p: Vector((0, -1, 0.2)).normalized(), mat=TEAM)
loop(tails, 'rotation_euler', 1, [0.0, 0.06, 0.0, -0.05], 72)
loop(tails, 'rotation_euler', 2, [0.0, 0.05, 0.0, -0.05], 96)

# Layered leather pauldron on the left shoulder, gold-rimmed and riveted, with short bone spikes.
for k, (dx, dz, r, sz) in enumerate(((0.0, 0.0, 0.105, 0.55), (0.035, -0.045, 0.1, 0.45), (0.065, -0.085, 0.09, 0.4))):
    c = Vector((0.2 + dx, 0.0, 1.0 + dz))
    plate = blob('pauldron', c, r, LEATHER, scale=(1.0, 1.15, sz), subdiv=3)
    plate.rotation_euler.y = 0.35 + 0.15 * k
    rim = blob('pauldron_rim', c - Vector((0, 0, 0.012)), r * 1.04, GOLD, scale=(1.0, 1.15, sz * 0.4), subdiv=3)
    rim.rotation_euler.y = plate.rotation_euler.y
    for m in range(5):
        a = -1.0 + m * 0.5
        hi(blob('rivet', c + Vector((0.09 * math.sin(a) * r / 0.1, -0.11 * math.cos(a) * r / 0.1, 0.035)), 0.006, GOLD, subdiv=1))
for dx, dy, tilt in ((0.03, -0.03, 0.35), (0.09, 0.02, 0.75)):
    root = Vector((0.2 + dx, dy, 1.04))
    tip = root + Vector((math.sin(tilt), 0.02, math.cos(tilt))) * 0.09
    sweep('spike', [root, root.lerp(tip, 0.5), tip], [0.02, 0.012, 0.002], 8, BONE)

# Silver frog clasps close the coat between the scarf and the belt.
for z in (0.8, 0.88):
    for sx in (-1, 1):
        box('clasp', (sx * 0.022, -0.212 * SY - 0.006 + 0.004 * (z - 0.8), z), (0.03, 0.012, 0.016), SILVER, bevel=0.005)
    blob('clasp_knot', (0.0, -0.212 * SY - 0.01, z), 0.011, SILVER, subdiv=1)

# Wide leather belt: stitched edges, a big pale buckle, studs, a pouch, and chains of charms.
BELT_R = 0.224
lathe('belt', [(BELT_R - 0.004, 0.665), (BELT_R, 0.672), (BELT_R, 0.758), (BELT_R - 0.004, 0.765)], 32, LEATHER, sy=SY)
for z in (0.674, 0.756):
    ring = [Vector((BELT_R * 1.01 * math.sin(a), -BELT_R * 1.01 * SY * math.cos(a), z))
            for a in [2 * math.pi * k / 120 for k in range(121)]]
    stitches(ring, lambda p: Vector((p.x, p.y, 0)).normalized(), mat=GOLD, length=0.009, gap=0.006, radius=0.0018)
FRONT = -BELT_R * SY - 0.012
for x, z, w, h in ((0, 0.765, 0.13, 0.026), (0, 0.665, 0.13, 0.026), (-0.052, 0.715, 0.026, 0.12), (0.052, 0.715, 0.026, 0.12)):
    box('buckle', (x, FRONT, z), (w, 0.022, h), SILVER, bevel=0.008, segments=2)
box('buckle_pin', (-0.01, FRONT - 0.004, 0.715), (0.075, 0.014, 0.014), SILVER, bevel=0.005)
box('buckle_tongue', (0.0, FRONT + 0.004, 0.715), (0.08, 0.008, 0.06), LEATHER, bevel=0.004)
for k in range(10):
    a = math.pi * (0.28 + k * 0.16)
    blob('belt_stud', (BELT_R * math.sin(a), -BELT_R * SY * math.cos(a), 0.715), 0.01, SILVER, subdiv=1)
box('pouch', (0.17, -0.15, 0.62), (0.1, 0.06, 0.1), LEATHER, rot=(0, 0, 0.75), bevel=0.02)
box('pouch_flap', (0.175, -0.175, 0.65), (0.105, 0.02, 0.05), LEATHER, rot=(0.15, 0, 0.75), bevel=0.008)
blob('pouch_stud', (0.18, -0.19, 0.635), 0.01, SILVER, subdiv=1)


def chain(top, drop, sway, count):
    """Links hanging from `top` along a shallow curve; returns the point under the last link."""
    pts = bezier(top, top + Vector((sway * 0.3, -0.01, -drop * 0.4)), top + Vector((sway, -0.01, -drop * 0.75)),
                 top + Vector((sway, 0, -drop)), count)
    for k, p in enumerate(pts[:-1]):
        d = (pts[k + 1] - p).normalized()
        yaw = 0.0 if k % 2 else math.pi / 2
        ob = link('chain_link', p.lerp(pts[k + 1], 0.5), (0, 0, yaw), SILVER)
        ob.rotation_euler = d.to_track_quat('Y', 'Z').to_euler()
        ob.rotation_euler.rotate_axis('Y', yaw)
    return pts[-1]


def crystal(name, tip, size, mat=SOUL):
    return lathe(name, [(0.0, tip.z), (size * 0.5, tip.z - size * 0.9), (size * 0.32, tip.z - size * 1.8), (0.0, tip.z - size * 2.4)],
                 6, mat, shape=lambda i, j, x, y, z: (x + tip.x, y + tip.y, z))


def skull_charm(at, size):
    blob('charm_skull', at, size, BONE, scale=(1, 0.95, 1.1))
    for sx in (-0.4, 0.4):
        blob('charm_eye', at + Vector((sx * size, -0.85 * size, 0)), size * 0.28, SOCKET, subdiv=1)


def bell(name, top, size, mat=GOLD):
    prof = [(0.0, 0.02), (0.35, 0.0), (0.55, -0.25), (0.65, -0.6), (0.95, -0.95), (1.0, -1.0)]
    return lathe(name, [(r * size, top.z + z * size * 1.3) for r, z in prof], 12, mat,
                 shape=lambda i, j, x, y, z: (x + top.x, y + top.y, z), close_top=True)


end = chain(Vector((-0.04, FRONT, 0.655)), 0.12, -0.02, 6)
skull_charm(end - Vector((0, 0, 0.022)), 0.022)
end = chain(Vector((0.03, FRONT, 0.655)), 0.16, 0.015, 8)
crystal('charm_crystal', end, 0.018)
end = chain(Vector((-0.12, -0.17, 0.66)), 0.09, -0.01, 5)
bell('charm_bell', end, 0.022)
end = chain(Vector((0.1, -0.17, 0.66)), 0.07, 0.01, 4)
blob('charm_bead', end - Vector((0, 0, 0.012)), 0.013, GOLD, subdiv=1)

ARMS = {
    'r': (Vector((-0.175, 0.0, 0.975)), Vector((-0.29, -0.03, 0.75)), Vector((-0.315, -0.215, 0.83)),
          (0.068, 0.072, 0.078, 0.082, 0.08, 0.068, 0.05), 0.95),
    'l': (Vector((0.175, 0.0, 0.975)), Vector((0.27, 0.02, 0.75)), Vector((0.285, -0.05, 0.565)),
          (0.068, 0.072, 0.078, 0.088, 0.1, 0.115, 0.122), 0.8),
}
POLE = Vector((0.09, 0.0, 1.0)).normalized()


def sleeve_end(side):
    """Where a sleeve's opening is, and the way its forearm points."""
    s, e, w, _, _ = ARMS[side]
    return w + (w - e) * 0.08, w - e


RIGHT_HAND = fist(*sleeve_end('r'), POLE, 0.03, BONE, detail='bone', name='fist_r')
# The left arm hangs, and its fist closes on the crossbar of the soul bell's bail, thumb forward.
BAIL = Vector((0, -1, 0))
LEFT_HAND = fist(*sleeve_end('l'), BAIL, 0.005, BONE, right=False, detail='bone', name='fist_l')
GRIPS = {'r': RIGHT_HAND, 'l': LEFT_HAND}

RIG = armature('rig', [('hips', (0, 0, 0.3), (0, 0, 0.74), None, (1, 0, 0)), ('chest', (0, 0, 0.74), (0, 0, 1.0), 'hips', (1, 0, 0))] + [
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
drape(RIG, 'drape_l', slide=0.5, droop=1.2)
for side, grip in GRIPS.items():
    bone_parent(bpy.data.objects[f'fist_{side}'], RIG, f'hand_{side}')
    bone_parent(empty(f'grip_{side}', grip), RIG, f'hand_{side}')
s, e, w, _, _ = ARMS['l']
for dx in (-0.012, 0.012):
    bone_parent(limb('forearm_bone', w + Vector((dx, 0, 0)), e.lerp(w, 0.25) + Vector((dx, 0, 0)), 0.011, 0.009, BONE),
                RIG, 'forearm_l')
UPPER = ('hood', 'hood_rim', 'void', 'eye', 'glow_eye', 'scarf', 'scarf_knot', 'scarf_tails', 'pauldron', 'pauldron_rim',
         'spike')
for ob in list(bpy.data.objects):
    if ob.parent is None and (ob.name.split('.')[0] in UPPER or ob.name.startswith('clasp') and ob.location.z > 0.85):
        bone_parent(ob, RIG, 'chest')
skin(coat, RIG, lambda v: waist(v.co.z, 0.77, 0.95))

for side, (s, e, w, radii, hem) in ARMS.items():
    path, along, elbow = sleeve_path(s, e, sleeve_end(side)[0])
    rs = [interp([(r, k / (len(radii) - 1)) for k, r in enumerate(radii)], t) for t in along]
    sl = sweep(f'sleeve_{side}', path, rs, 14, MAIN, caps=False, levels=1, mask=lambda i, a=along, h=hem: float(a[i] >= h))
    solidify(sl, 0.014, inner=DARK)
    # Even thickness spikes where the arm folds sharply at the elbow.
    sl.modifiers['solid'].use_even_offset = side == 'l'
    # Only the wide bell sleeve falls down a raised forearm.
    skin(sl, RIG, lambda v: sleeve(side, along[v.index // 14], elbow, falls=side == 'l'))
    _, fr = frames(path)
    cuff = [path[-2].lerp(path[-1], 0.2) + (fr[-1][0] * math.cos(a) + fr[-1][1] * math.sin(a)) * (rs[-1] - 0.006)
            for a in [2 * math.pi * k / 48 for k in range(49)]]
    hi(sweep('cuff_braid', cuff, 0.004, 6, GOLD))

# Scythe: the weapon pivots at the right-hand grip; the pole leans in so the great crescent hangs over the hood.
weapon = bone_parent(empty('weapon', RIGHT_HAND), RIG, 'hand_r')
empty('hold_r', RIGHT_HAND, weapon)


def part(ob):
    return parent(ob, weapon)


def pole_at(z):
    return RIGHT_HAND + POLE * ((z - RIGHT_HAND.z) / POLE.z)


TOP_Z = 1.86
T = pole_at(TOP_Z)
part(sweep('shaft', [pole_at(0.05), pole_at(0.9), pole_at(TOP_Z + 0.05)], [0.021, 0.024, 0.022], 10, WOOD))
part(sweep('butt', [pole_at(0.0), pole_at(0.03), pole_at(0.07)], [0.008, 0.03, 0.03], 10, GOLD))
for z, h in ((0.07, 0.03), (0.37, 0.025), (TOP_Z - 0.05, 0.07)):
    part(sweep('ferrule', [pole_at(z), pole_at(z + h / 2), pole_at(z + h)], [0.029, 0.033, 0.029], 12, GOLD))
for z0, z1, turns in ((0.12, 0.36, 13), (TOP_Z - 0.3, TOP_Z - 0.06, 13), (0.87, 1.09, 12)):
    n = turns * 8
    side = POLE.cross(Vector((0, 1, 0))).normalized()
    up = POLE.cross(side)
    helix = [pole_at(z0 + (z1 - z0) * t / n) + (side * math.cos(2 * math.pi * t / 8) + up * math.sin(2 * math.pi * t / 8)) * 0.026
             for t in range(n + 1)]
    part(sweep('grip_wrap', [pole_at(z0), pole_at(z1)], 0.03, 10, WRAP))
    part(hi(sweep('grip_turn', helix, 0.0085, 6, WRAP, squash=0.6)))
part(box('collar', T + Vector((-0.025, 0, 0.0)), (0.12, 0.062, 0.08), GOLD, bevel=0.018, segments=2))
part(blob('finial', T + Vector((0.0, 0, 0.09)), 0.03, GOLD, scale=(1, 1, 1.3)))
spine = bezier(T + Vector((-0.04, 0, 0.035)), T + Vector((-0.32, 0, 0.17)), T + Vector((-0.64, 0, 0.06)),
               T + Vector((-0.68, 0, -0.52)), 18)
N = len(spine) - 1
widths = [0.24 * (1 - i / N) ** 0.75 + 0.004 for i in range(N + 1)]
verts, faces, edge = [], [], []
for i, p in enumerate(spine):
    tangent = (spine[min(i + 1, N)] - spine[max(i - 1, 0)]).normalized()
    inward = Vector((tangent.z, 0, -tangent.x))
    if inward.dot(Vector((1, 0, -1))) < 0:
        inward = -inward
    t = 0.014 * (1 - i / (N + 2))
    verts += [p + Vector((0, -t, 0)), p + inward * widths[i] * 0.45 + Vector((0, -t * 0.6, 0)), p + inward * widths[i],
              p + inward * widths[i] * 0.45 + Vector((0, t * 0.6, 0)), p + Vector((0, t, 0))]
    edge += [0.0, 0.0, 1.0, 0.0, 0.0]
for i in range(N):
    a = 5 * i
    for k in range(4):
        faces.append((a + k, a + 5 + k, a + 6 + k, a + k + 1))
    faces.append((a + 4, a + 9, a + 5, a))
blade = build('blade', verts, faces, STEEL)
mark(blade, lambda co, it=iter(edge): next(it))
part(blade)
part(sweep('blade_spine', spine[:12], [0.016 * (1 - i / 14) for i in range(12)], 6, STEEL))
# Tassels hang from the collar: cords, beads, a green crystal each, and a fringe of strands.
for k, (dx, drop, mat) in enumerate(((-0.05, 0.2, TASSEL), (-0.12, 0.3, TASSEL), (0.03, 0.16, GOLD))):
    top = T + Vector((dx, -0.005, -0.04))
    knot = top - Vector((0, 0, drop))
    part(limb('cord', top, knot, 0.004, 0.004, LEATHER, sides=4))
    part(blob('tassel_bead', top - Vector((0, 0, drop * 0.45)), 0.017, GOLD, subdiv=1))
    part(crystal('tassel_crystal', top - Vector((0, 0, drop * 0.55)), 0.016))
    part(blob('tassel_knot', knot, 0.016, mat, scale=(1, 1, 1.2), subdiv=1))
    for s in range(7):
        a = 2 * math.pi * s / 7
        spread = Vector((math.cos(a), math.sin(a), 0)) * 0.012
        part(sweep('tassel_strand', [knot, knot + spread - Vector((0, 0, 0.04)), knot + spread * 1.6 - Vector((0, 0, 0.085))],
                   [0.005, 0.004, 0.002], 4, mat))

# The soul bell hangs below the left fist: a gold bail whose crossbar the fist holds, its arms passing outside the
# fist down to a short chain, the bell swinging under it.
swing = bone_parent(empty('bell_swing', LEFT_HAND), RIG, 'hand_l')
empty('hold_l', LEFT_HAND, swing)
B = LEFT_HAND - Vector((0, 0, 0.12))
APEX = LEFT_HAND - Vector((0, 0, 0.065))
BAIL_PATH = [APEX + BAIL * 0.004, LEFT_HAND + BAIL * 0.05 - Vector((0, 0, 0.03)), LEFT_HAND + BAIL * 0.056,
             LEFT_HAND - BAIL * 0.056, LEFT_HAND - BAIL * 0.05 - Vector((0, 0, 0.03)), APEX - BAIL * 0.004]
for ob in (
    sweep('bell_bail', BAIL_PATH, 0.004, 6, GOLD),
    limb('bell_chain', APEX, B + Vector((0, 0, 0.01)), 0.004, 0.004, SILVER, sides=4),
    lathe('bell_cap', [(0.0, B.z + 0.02), (0.022, B.z + 0.012), (0.034, B.z - 0.004), (0.036, B.z - 0.012)], 12, GOLD,
          shape=lambda i, j, x, y, z: (x + B.x, y + B.y, z)),
    lathe('bell_body', [(0.0, B.z - 0.002), (0.034, B.z - 0.008), (0.042, B.z - 0.045), (0.052, B.z - 0.09), (0.072, B.z - 0.125),
                        (0.075, B.z - 0.138), (0.035, B.z - 0.134), (0.0, B.z - 0.13)], 14, SOUL,
          shape=lambda i, j, x, y, z: (x + B.x, y + B.y, z)),
    lathe('bell_band', [(0.077, B.z - 0.114), (0.08, B.z - 0.125), (0.077, B.z - 0.14)], 14, GOLD,
          shape=lambda i, j, x, y, z: (x + B.x, y + B.y, z)),
    blob('bell_clapper', B - Vector((0, 0, 0.142)), 0.016, GOLD, subdiv=1),
):
    parent(ob, swing)
glow(B - Vector((0, 0, 0.07)), GREEN_GLOW, 0.4, swing, name='glow_bell')
loop(swing, 'rotation_euler', 0, [0.0, 0.12, 0.0, -0.12], 64)
loop(swing, 'rotation_euler', 1, [0.0, -0.05, 0.0, 0.05], 96)

def skull(pos, s, mat):
    parts = [
        blob('skull', pos + Vector((0, -0.02 * s, 0.01 * s)), 0.08 * s, mat, scale=(1, 0.95, 0.95), subdiv=3),
        blob('skull_cheek', pos + Vector((0, -0.05 * s, -0.045 * s)), 0.055 * s, mat, scale=(1.1, 0.9, 0.7)),
        box('skull_jaw', pos + Vector((0, -0.045 * s, -0.08 * s)), (0.07 * s, 0.06 * s, 0.035 * s), mat, bevel=0.012 * s),
    ]
    for sx in (-0.03, 0.03):
        parts.append(blob('skull_eye', pos + Vector((sx * s, -0.088 * s, 0.002 * s)), 0.024 * s, SOCKET, scale=(1, 0.5, 1.15)))
    parts.append(blob('skull_nose', pos + Vector((0, -0.1 * s, -0.035 * s)), 0.01 * s, SOCKET, scale=(1, 0.5, 1.4), subdiv=1))
    return parts


def wisps(pos, s, n, radius, rise, turn, width, phase=0.0):
    """`n` tongues of spirit light spiralling up around `pos`, each fading to nothing at its tail."""
    parts = []
    for w in range(n):
        pts = []
        for i in range(12):
            t = i / 11
            a = phase + 2 * math.pi * w / n + turn * t
            r = (radius[0] + (radius[1] - radius[0]) * t) * s
            pts.append(pos + Vector((r * math.sin(a), -r * math.cos(a), (rise[0] + (rise[1] - rise[0]) * t) * s)))
        parts.append(sweep('wisp', pts, [width * s * (1 - 0.85 * (i / 11) ** 0.8) for i in range(12)], 6, SPIRIT,
                           squash=0.45, mask=lambda i: (i / 11) ** 1.2))
    return parts


def flame(pos, s, sides=18):
    """A soft shell of soul fire around `pos`, its tongues fading out toward the tips."""
    def lick(i, j, x, y, z):
        t = (z - pos.z + 0.1 * s) / (0.4 * s)
        a = 2 * math.pi * j / sides + 1.2 * t
        crown = abs(math.sin(1.5 * a)) - 0.5
        r = math.hypot(x, y) * (1 + 1.1 * smoothstep(0.3, 1.0, t) * crown)
        return (pos.x + r * math.sin(a) + 0.05 * s * t * t, pos.y - r * math.cos(a) + 0.07 * s * t * t + 0.02 * s,
                z + 0.16 * s * t * t * crown)

    prof = [(0.0, -0.1), (0.08, -0.085), (0.112, -0.03), (0.11, 0.04), (0.09, 0.11), (0.064, 0.18), (0.036, 0.25),
            (0.014, 0.31), (0.0, 0.35)]
    return [lathe('flame', [(r * s, pos.z + h * s) for r, h in prof], sides, SPIRIT, shape=lick, levels=1,
                  mask=lambda i, j: smoothstep(0, 6, i) ** 0.6)]


# Two spirits drift around the Gravecaller: a round ghost skull wreathed in wisps, and a soul flame with a small skull
# in its heart. They are `spirit` light, added to whatever is behind them, so they glow without hiding the figure.
orbit = empty('orbit', (0, 0, 0))
for k, (ang, z, period, s) in enumerate(((0.3, 1.2, 48, 1.0), (math.pi + 0.45, 0.42, 64, 0.85))):
    pos = Vector((0.52 * math.cos(ang), 0.52 * math.sin(ang), z))
    bob = empty('skull_bob', pos, orbit)
    # Turning back against the orbit keeps the skull's face toward the front, as in the concept.
    face = spin(empty('skull_face', pos, bob), period=192, turns=-1)
    if k == 0:
        parts = skull(pos, s * 1.2, SPIRIT) + wisps(pos, s, 3, (0.15, 0.11), (-0.12, 0.06), 2.5, 0.035, 2.2)
    else:
        parts = skull(pos + Vector((0, -0.01, -0.03)), s * 0.7, SOUL) + flame(pos, s * 0.85)
    for ob in parts:
        parent(ob, face)
    glow(pos, GREEN_GLOW, 0.45 * s, bob, name='glow_skull')
    loop(bob, 'location', 2, [z, z + 0.06, z, z - 0.04], period)
    loop(bob, 'rotation_euler', 2, [0.0, 0.25, 0.0, -0.25], period * 2)
spin(orbit, period=192)

for ob in list(bpy.data.objects):
    if ob.parent is None and ob not in (breath, orbit):
        parent(ob, breath)

for b, axis, peak in (('clavicle_r', 0, 0.03), ('clavicle_l', 0, 0.03), ('upperarm_r', 2, 0.02), ('upperarm_l', 2, -0.03),
                      ('upperarm_l', 0, 0.02), ('forearm_l', 0, 0.04), ('hand_l', 0, -0.05)):
    loop(RIG, f'pose.bones["{b}"].rotation_euler', axis, [0.0, peak], 84)


arm = partial(bone_key, RIG)


def wields(keys, lean):
    """`keys` with the scythe held at `lean` and the soul bell hanging plumb from the other fist."""
    return hang(wield(keys, RIG, 'hand_r', lean, 'chest'), RIG, ((swing, 'hand_l'),))


R, S = 'rotation_euler', 'scale'
CHEST = arm('chest', X), arm('chest', Y), arm('chest', Z)
act('cast', 11, wields({
    CHEST[0]: [(0, 0), (5, 0.15), (11, -0.14), (15, -0.08), (22, 0)],
    CHEST[1]: [(0, 0), (5, -0.15), (11, 0.15), (15, 0.1), (22, 0)],
    CHEST[2]: [(0, 0), (5, -0.04), (11, -0.08), (22, 0)],
    arm('clavicle_l', X): [(0, 0), (5, -0.05), (11, 0.15), (15, 0.1), (22, 0)],
    arm('upperarm_l', X): [(0, 0), (5, 0.4), (11, -2.0), (15, -1.85), (22, 0)],
    arm('upperarm_l', Y): [(0, 0), (5, 0.1), (11, -1.05), (15, -0.9), (22, 0)],
    arm('forearm_l', X): [(0, 0), (5, -0.6), (11, -0.2), (15, -0.35), (22, 0)],
    arm('hand_l', X): [(0, 0), (5, 0.45), (11, -0.3), (15, 0.1), (22, 0)],
    arm('hand_l', Y): [(0, 0), (5, -0.2), (11, 0.45), (15, 0.25), (22, 0)],
    arm('clavicle_r', X): [(0, 0), (11, 0.06), (22, 0)],
    arm('upperarm_r', X): [(0, 0), (5, -0.15), (11, -0.55), (15, -0.45), (22, 0)],
    arm('upperarm_r', Z): [(0, 0), (11, 0.2), (22, 0)],
    arm('forearm_r', X): [(0, 0), (5, -0.3), (11, -0.5), (15, -0.4), (22, 0)],
    (breath, R, 0): [(0, 0), (5, 0.04), (11, -0.03), (22, 0)],
    (swing, R, 0): [(0, 0), (5, 0.6), (11, -0.9), (13, 0.5), (16, -0.3), (19, 0.12), (22, 0)],
}, [(0, 0), (5, 0.0), (11, 0.25), (15, 0.15), (22, 0)]))
act('attack', 9, wields({
    CHEST[0]: [(0, 0), (6, -0.1), (9, 0.22), (13, 0.28), (22, 0)],
    CHEST[1]: [(0, 0), (6, -0.5), (9, 0.35), (13, 0.5), (22, 0)],
    CHEST[2]: [(0, 0), (6, 0.1), (9, -0.08), (22, 0)],
    (breath, R, 2): [(0, 0), (6, -0.12), (9, 0.1), (13, 0.15), (22, 0)],
    arm('clavicle_r', X): [(0, 0), (6, 0.1), (9, -0.05), (22, 0)],
    arm('upperarm_r', X): [(0, 0), (6, 0.45), (9, -0.95), (13, -1.15), (22, 0)],
    arm('upperarm_r', Z): [(0, 0), (6, 0.55), (9, 0.05), (13, -0.2), (22, 0)],
    arm('forearm_r', X): [(0, 0), (6, -1.0), (9, -0.2), (13, -0.15), (22, 0)],
    arm('upperarm_l', X): [(0, 0), (6, -0.6), (9, 0.55), (13, 0.6), (22, 0)],
    arm('upperarm_l', Z): [(0, 0), (6, -0.1), (9, -0.35), (13, -0.4), (22, 0)],
    arm('forearm_l', X): [(0, 0), (6, -0.5), (9, -0.15), (22, 0)],
    (swing, R, 0): [(0, 0), (6, -0.5), (9, 0.6), (13, 0.5), (17, -0.2), (22, 0)],
}, [(0, 0), (6, -0.75), (9, 0.95), (13, 1.2), (22, 0)]))
act('hit', 2, wields({
    CHEST[0]: [(0, 0), (2, -0.3), (6, 0.06), (14, 0)],
    CHEST[1]: [(0, 0), (2, 0.12), (6, -0.03), (14, 0)],
    (breath, R, 0): [(0, 0), (2, -0.08), (7, 0.02), (14, 0)],
    arm('clavicle_l', X): [(0, 0), (2, 0.18), (7, 0.03), (14, 0)],
    arm('clavicle_r', X): [(0, 0), (2, 0.18), (7, 0.03), (14, 0)],
    arm('upperarm_l', X): [(0, 0), (2, -0.4), (7, -0.1), (14, 0)],
    arm('upperarm_l', Z): [(0, 0), (2, 0.2), (6, -0.04), (14, 0)],
    arm('forearm_l', X): [(0, 0), (2, -0.75), (7, -0.2), (14, 0)],
    arm('upperarm_r', X): [(0, 0), (2, -0.2), (14, 0)],
    arm('upperarm_r', Z): [(0, 0), (2, -0.2), (14, 0)],
    arm('forearm_r', X): [(0, 0), (2, -0.4), (7, -0.2), (11, -0.1), (14, 0)],
    (swing, R, 0): [(0, 0), (2, 0.7), (5, -0.5), (8, 0.15), (11, -0.05), (14, 0)],
}, [(0, 0), (2, -0.2), (6, 0.06), (14, 0)]))
act('move', 0, wields({
    (breath, R, 0): [(0, 0.08), (8, 0.08)],
    (breath, R, 1): [(0, 0), (2, 0.06), (4, 0), (6, -0.06), (8, 0)],
    CHEST[1]: [(0, -0.15), (4, 0.15), (8, -0.15)],
    arm('upperarm_l', X): [(0, -0.6), (4, 0.45), (8, -0.6)],
    arm('upperarm_l', Z): [(0, -0.1), (4, -0.15), (8, -0.1)],
    arm('forearm_l', X): [(0, -0.5), (4, -0.1), (8, -0.5)],
    arm('upperarm_r', X): [(0, 0.2), (4, -0.2), (8, 0.2)],
    arm('forearm_r', X): [(0, -0.35), (4, -0.45), (8, -0.35)],
    (swing, R, 0): [(0, 0.45), (2, 0.1), (4, -0.4), (6, -0.1), (8, 0.45)],
}, [(0, 0.15), (4, -0.05), (8, 0.15)]))
DOWNED = {CHEST[0]: 0.3, (breath, S, 2): -0.1, arm('clavicle_l', X): 0.12, arm('clavicle_r', X): 0.12,
          arm('upperarm_l', X): 0.8, arm('upperarm_l', Z): -0.75, arm('forearm_l', X): -0.35, arm('hand_l', X): 0.5,
          arm('upperarm_r', X): 0.7, arm('upperarm_r', Z): 0.6, arm('forearm_r', X): -0.4}
FLUNG = {arm('upperarm_l', X): -0.7, arm('upperarm_l', Z): -0.5, arm('upperarm_r', X): -0.5, arm('upperarm_r', Z): 0.4}
act('down', 10, wields({k: [(0, 0), (4, FLUNG.get(k, v * 0.4)), (12, v)] for k, v in DOWNED.items()},
                       [(0, 0), (4, -0.2), (12, -0.45)]))
PUSH = {CHEST[0]: 0.45, arm('upperarm_l', X): 1.0, arm('upperarm_r', X): 0.85, arm('forearm_l', X): 0.0}
# The scythe hand lifts as the chest curls up, so the butt clears the floor.
LIFT = {arm('forearm_r', X): [(0, -0.4), (6, -0.1), (11, -0.2), (16, 0)]}
act('rise', 8, wields({k: [(0, v), (6, PUSH.get(k, v)), (11, -0.1 * v if k == CHEST[0] else 0), (16, 0)] for k, v in DOWNED.items()}
                      | LIFT,
                      [(0, -0.45), (6, -0.3), (16, 0)]))

# The skin weights cost what the atlases give back, keeping the figure under 3 MB.
meshes = bake(quality=(82, 74))
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
print(f'gravecaller: {tris} triangles, {len(meshes)} meshes')
finish()
