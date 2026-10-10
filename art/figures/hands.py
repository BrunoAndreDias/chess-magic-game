"""Hands for the class figures: `fist()` closes a hand on a pole or a cord, `hand()` opens one. Both build the hand out of
the sleeve: a wrist from inside the cuff, a palm slab, four fingers and a thumb, joined into one mesh.

A hand lives in a frame of three directions: `a` runs along the knuckles toward the thumb, `L` along the palm from the
wrist to the knuckles, and `P` is the way the palm faces. Fingers curl from `L` toward `P`. A right hand has
P = a x L, a left hand P = L x a.

`detail` names the bake-only marks (lookdev `hi()`) that the high-poly twin paints into the normal map: 'bone' raises
joint collars and the ridges of the hand's bones, 'glove' runs stitched seams down the fingers and the back and a welt
round the cuff. Without it the hand is plain geometry, for a figure that is not baked.
"""
import math

import bmesh
import bpy
from mathutils import Vector

from lookdev import hi

# Per finger, index to little: its share of the hand's width, its radius as a share of the index's, and how far it
# curls round a pole (in radians) or reaches flat (as a share of the middle finger's length).
FINGERS = (
    dict(at=1.5, r=1.0, wrap=3.3, reach=0.93, spread=0.13),
    dict(at=0.5, r=1.04, wrap=3.45, reach=1.0, spread=0.03),
    dict(at=-0.5, r=0.96, wrap=3.35, reach=0.95, spread=-0.07),
    dict(at=-1.45, r=0.84, wrap=3.1, reach=0.78, spread=-0.17),
)
# Where along a finger its two inner joints fall, as shares of its length.
JOINTS = (0.45, 0.75)


def _d(ang, L, P):
    return L * math.cos(ang) + P * math.sin(ang)


def _ring(c, u, v, ru, rv, sides):
    return [c + u * (ru * math.cos(t)) + v * (rv * math.sin(t))
            for t in [2 * math.pi * k / sides for k in range(sides)]]


def _tube(path, radii, up, sides):
    """Rings along `path`: radius `radii[i]` (or (across, deep) pairs), their `across` axis kept as near `up` as the
    path allows, so a palm stays flat and a finger stays upright."""
    rings = []
    n = len(path)
    for i, c in enumerate(path):
        t = (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()
        u = (up - t * up.dot(t)).normalized()
        v = t.cross(u)
        r = radii[i]
        ru, rv = r if isinstance(r, tuple) else (r, r)
        rings.append(_ring(c, u, v, ru, rv, sides))
    return rings


def _mesh(name, tubes, mat, smooth):
    """One object from tubes of rings; each tube is closed at both ends by a fan to a point just past its end ring."""
    bm = bmesh.new()
    for rings in tubes:
        vs = [[bm.verts.new(p) for p in ring] for ring in rings]
        sides = len(vs[0])
        for a, b in zip(vs, vs[1:]):
            for k in range(sides):
                bm.faces.new((a[k], a[(k + 1) % sides], b[(k + 1) % sides], b[k]))
        for ring, nxt in ((vs[0], vs[1]), (vs[-1], vs[-2])):
            mid = sum((v.co for v in ring), Vector()) / sides
            back = sum((v.co for v in nxt), Vector()) / sides
            tip = bm.verts.new(mid + (mid - back).normalized() * 0.35 * (ring[0].co - mid).length)
            for k in range(sides):
                bm.faces.new((ring[k], ring[(k + 1) % sides], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.data.materials.append(mat)
    if smooth:
        # Level 0 leaves the game mesh as built; lookdev's twin adds its levels to it, so the bake sees a smooth hand.
        mod = ob.modifiers.new('sub', 'SUBSURF')
        mod.levels = mod.render_levels = 0
    return ob


def _finger(base, L, P, rf, segs):
    """A finger as (point, radius) samples: from `base` heading along `L`, each segment (length, turn) turning toward
    `P` evenly over its length, a knuckle swelling at each joint between segments."""
    pts, ang, p = [(base, rf * 1.08)], 0.0, Vector(base)
    total = sum(s[0] for s in segs)
    done = 0.0
    for si, (length, turn) in enumerate(segs):
        steps = 3
        for k in range(steps):
            ang += turn / steps / 2
            p = p + _d(ang, L, P) * (length / steps)
            ang += turn / steps / 2
            done += length / steps
            joint = k == steps - 1 and si < len(segs) - 1
            taper = 1 - 0.28 * (done / total) ** 2
            pts.append((p, rf * taper * (1.1 if joint else 0.97)))
    end = pts[-1][0] + _d(ang, L, P) * rf * 0.45
    pts.append((end, rf * 0.62))
    return pts


def _frame(forearm, a=None, palm=None, right=True):
    f = forearm.normalized()
    if a is not None:
        a = a.normalized()
        L = (f - a * f.dot(a)).normalized()
        P = a.cross(L) if right else L.cross(a)
    else:
        P = palm.normalized()
        L = (f - P * f.dot(P)).normalized()
        a = L.cross(P) if right else P.cross(L)
    return a, L, P


def _wrist(wrist, f, heel, w):
    """The wrist from inside the sleeve out to the palm's heel, bending from the forearm into the palm."""
    start = wrist - f * 0.045
    path = [start + (heel - start) * t + f * (0.02 * math.sin(math.pi * t)) for t in (0.0, 0.3, 0.6, 0.85)]
    radii = [(w * 0.62, w * 0.55), (w * 0.62, w * 0.52), (w * 0.7, w * 0.48), (w * 0.8, w * 0.42)]
    return path, radii


def _build(name, mat, palm_path, palm_radii, a, P, fingers, thumb, sides, detail, seam, smooth):
    tubes = [_tube(palm_path, palm_radii, a, sides + 4)]
    for pts in fingers + [thumb]:
        tubes.append(_tube([p for p, _ in pts], [(r * 0.94, r) for _, r in pts], a, sides))
    ob = _mesh(name, tubes, mat, smooth)
    if detail:
        DETAILS[detail](palm_path, palm_radii, a, P, fingers, thumb, seam or mat)
    return ob


def fist(wrist, forearm, axis, radius, mat, right=True, size=0.011, detail=None, seam=None, sides=6, smooth=True,
         lean=0.8, name='hand'):
    """A hand closed on a pole of `radius` running along `axis` (the thumb's side), its wrist coming out of the sleeve
    opening at `wrist` along `forearm`. Returns the grip: the point on the pole's axis the fist closes round, so the
    caller hangs the pole there and it always passes through the fist. `size` is a finger's radius. The palm carries
    on in the forearm's direction, leaning along the pole by at most `lean` (a slope), since the knuckles must stay
    in line with the pole."""
    a, L, P = _frame(forearm, a=axis, right=right)
    f = forearm.normalized()
    R = radius + size * 0.8
    t = size * 1.35
    pitch = 2 * size * 0.93
    plen = size * 5.4
    along = f.dot(a) / max((f - a * f.dot(a)).length, 1e-6)
    lp = (L + a * max(-lean, min(lean, along))).normalized()
    # Solve the grip from the wrist: the heel sits just out of the cuff, the palm runs along `lp` to the knuckles,
    # and the pole lies against the palm.
    heel = wrist + f * size * 1.8
    knuckles = heel + lp * plen
    C = knuckles + P * (radius + t * 0.85) - L * (R * 0.2)

    def on(ang, h, r=R):
        return C + a * h + _d(ang, L, P) * r

    phi0 = math.radians(-80)
    fingers = []
    for fd in FINGERS:
        rf = size * fd['r']
        h = fd['at'] * pitch
        wrap = fd['wrap']
        # An arc round the pole, with the knuckles swelling at the joints.
        pts = [(on(phi0 - 0.25, h, R * 1.02), rf * 1.12)]
        n = 8
        for k in range(1, n + 1):
            s = k / n
            joint = min(abs(s - j) for j in JOINTS) < 0.5 / n
            pts.append((on(phi0 + wrap * s, h), rf * (1 - 0.25 * s * s) * (1.1 if joint else 0.97)))
        pts.append((on(phi0 + wrap + rf / R * 0.5, h, R * 0.98), rf * 0.6))
        fingers.append(pts)
    w = 2.1 * pitch
    palm = [knuckles - lp * plen * s + P * (-t * 0.1) for s in (-0.2, 0.2, 0.62, 1.0)]
    wp, wr = _wrist(wrist, f, heel, w)
    palm_path = wp + palm[::-1]
    palm_radii = wr + [(w * 0.9, t * 1.0), (w * 0.98, t * 0.98), (w, t * 0.95), (w * 0.8, t * 0.7)]
    # The thumb leaves the palm's thumb side near the heel and closes round the far side of the pole over the index.
    th = FINGERS[0]['at'] * pitch + size * 1.25
    base = heel + lp * plen * 0.35 + a * (w * 0.55) - P * (t * 0.2)
    rt = size * 1.18
    arc = [(on(math.radians(-150) - 2.0 * s, th, R + size * 0.55), rt * (1 - 0.3 * s * s)) for s in (0.0, 0.3, 0.55, 0.8, 1.0)]
    tip = arc[-1][0] + (arc[-1][0] - arc[-2][0]).normalized() * size * 0.5
    thumb = [(base, rt * 1.3), (base.lerp(arc[0][0], 0.5), rt * 1.15)] + arc + [(tip, rt * 0.6)]
    _build(name, mat, palm_path, palm_radii, a, P, fingers, thumb, sides, detail, seam, smooth)
    return C


def hand(wrist, forearm, palm, mat, right=True, curl=0.6, size=0.011, detail=None, seam=None, sides=6, smooth=True,
         name='hand'):
    """An open hand out of the sleeve at `wrist`, its palm facing `palm`, the fingers fanned and curled by `curl`
    (0 flat, 1 a loose fist). Returns the centre of the palm."""
    a, L, P = _frame(forearm, palm=palm, right=right)
    f = forearm.normalized()
    t = size * 1.1
    pitch = 2 * size * 0.95
    plen = size * 6.0
    heel = wrist + f * size * 1.8
    knuckles = heel + L * plen
    fingers = []
    for fd in FINGERS:
        rf = size * fd['r']
        lf = (L * math.cos(fd['spread']) + a * math.sin(fd['spread'])).normalized()
        length = size * 7.6 * fd['reach']
        segs = [(length * 0.45, curl * 0.5), (length * 0.3, curl * 0.9), (length * 0.25, curl * 0.6)]
        base = knuckles + a * (fd['at'] * pitch) - L * size * 0.6
        pts = _finger(base, lf, P, rf, [(length * 0.05, 0.25 * curl)] + segs)
        fingers.append(pts)
    w = 2.1 * pitch
    palm_pts = [knuckles - L * plen * s for s in (-0.1, 0.25, 0.65, 1.0)]
    wp, wr = _wrist(wrist, f, heel, w)
    palm_path = wp + palm_pts[::-1]
    palm_radii = wr + [(w * 0.88, t), (w * 0.97, t * 0.95), (w, t * 0.85), (w * 0.94, t * 0.7)]
    # The thumb splays from the heel toward the index side and curls in over the palm.
    lt = (L * 0.55 + a * 0.8 + P * 0.25).normalized()
    base = heel + L * plen * 0.3 + a * w * 0.5
    pts = _finger(base, lt, P.lerp(-a, 0.3).normalized(), size * 1.18,
                     [(size * 2.6, 0.2 * curl), (size * 2.4, 0.6 * curl), (size * 2.0, 0.5 * curl)])
    _build(name, mat, palm_path, palm_radii, a, P, fingers, pts, sides, detail, seam, smooth)
    return knuckles - L * plen * 0.5


def _strand(name, pts, r, mat, sides=6):
    path = [Vector(p) for p in pts]
    up = (path[-1] - path[0]).orthogonal().normalized()
    return hi(_mesh(name, [_tube(path, [r] * len(path), up, sides)], mat, False))


def _bone(palm_path, palm_radii, a, P, fingers, thumb, mat):
    """Raised collars at every joint and the ridges of the hand's bones down its back to each knuckle."""
    for pts in fingers + [thumb]:
        for i in range(1, len(pts) - 1):
            p, r = pts[i]
            if r > pts[i - 1][1] and r > pts[i + 1][1]:
                t = (pts[i + 1][0] - pts[i - 1][0]).normalized()
                u = (a - t * a.dot(t)).normalized()
                ring = _ring(p, u, t.cross(u), r * 1.03, r * 1.03, 12)
                hi(_mesh('joint', [[[q - t * r * 0.14 for q in ring], [q + t * r * 0.14 for q in ring]]], mat, False))
    heel, (w, t) = palm_path[-4], palm_radii[-4]
    for k, pts in enumerate(fingers):
        top, r = pts[1]
        root = heel + a * ((1.5 - k) * w * 0.3) - P * t * 0.85
        _strand('ridge', [root, root.lerp(top - P * r, 0.5) - P * t * 0.12, top - P * r * 0.9], 0.003, mat)


def _glove(palm_path, palm_radii, a, P, fingers, thumb, mat):
    """Seams down each finger's sides, three stitched points down the back, and a welt round the cuff."""
    for pts in fingers + [thumb]:
        for side in (-1, 1):
            line = []
            for i in range(1, len(pts) - 1):
                p, r = pts[i]
                t = (pts[i + 1][0] - pts[i - 1][0]).normalized()
                u = (a - t * a.dot(t)).normalized()
                line.append(p + u * side * r * 0.97)
            _strand('seam', line, 0.0016, mat, 4)
    heel, knuckles = palm_path[-4], palm_path[-2]
    w, t = palm_radii[-3]
    for k in (-1, 0, 1):
        off = a * (k * w * 0.42) - P * t * 0.95
        _strand('point', [heel + off, knuckles + off], 0.0018, mat, 4)
    c, nxt = palm_path[3], palm_path[4]
    td = (nxt - c).normalized()
    u = (a - td * a.dot(td)).normalized()
    ru, rv = palm_radii[3]
    ring = _ring(c, u, td.cross(u), ru * 1.04, rv * 1.06, 16)
    _strand('welt', ring + [ring[0]], 0.003, mat)


DETAILS = {'bone': _bone, 'glove': _glove}
