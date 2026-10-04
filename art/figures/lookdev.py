"""Hand-painted look: each `paint()` material computes its colour in Cycles nodes (a soft top-down light, cavity
darkening from ambient occlusion, convex edges picked out, painterly mottle and brush streaks), then `bake()` flattens
every painted surface into one atlas and swaps the bake graphs for plain textured materials the game can read.

A float vertex attribute named `mask` (see `mark()`) paints a material's accent: a hem trim, a blade's honed edge,
a wisp's fading tail. It is dropped after the bake, so it never reaches the glb as a vertex colour.
"""
import math
import os
import tempfile

import bpy
from common import hexrgb

SPECS = {}
MERGED = 'paint'


class Graph:
    def __init__(self, nt):
        self.nt = nt

    def node(self, kind, inputs=(), **props):
        n = self.nt.nodes.new(kind)
        for k, v in props.items():
            setattr(n, k, v)
        for i, v in inputs:
            self.feed(n.inputs[i], v)
        return n

    def feed(self, sock, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.nt.links.new(v, sock)
        else:
            sock.default_value = v

    def math(self, op, a, b=0.0, c=0.0, clamp=False):
        return self.node('ShaderNodeMath', [(0, a), (1, b), (2, c)], operation=op, use_clamp=clamp).outputs[0]

    def mix(self, fac, a, b, blend='MIX'):
        n = self.node('ShaderNodeMix', [(0, fac), (6, a), (7, b)], data_type='RGBA', blend_type=blend, clamp_factor=True)
        return n.outputs[2]

    def ramp(self, fac, stops):
        n = self.node('ShaderNodeValToRGB', [(0, fac)])
        els = n.color_ramp.elements
        while len(els) < len(stops):
            els.new(0.5)
        for el, (pos, col) in zip(els, stops):
            el.position = pos
            el.color = (*col, 1)
        return n.outputs[0]


def rgb(h):
    return hexrgb(h) if isinstance(h, str) else h


def scaled(col, k):
    return tuple(c * k for c in col)


def paint(name, base, shade, light, rough=0.8, cavity=0.75, edge=0.5, mottle=0.12, streak=0.0, grime=0.0,
          accent=None, metal=False, glow=0.0, keep=False):
    """A material whose colour is painted by nodes and baked. `keep` keeps it as its own material in the glb (the game
    reads `main` and `team` by name; `glow` materials emit their atlas colour); every other one merges into `paint`."""
    base, shade, light = rgb(base), rgb(shade), rgb(light)
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    g = Graph(nt)
    geo = g.node('ShaderNodeNewGeometry')
    n = g.node('ShaderNodeSeparateXYZ', [(0, geo.outputs['Normal'])])
    p = g.node('ShaderNodeSeparateXYZ', [(0, geo.outputs['Position'])])
    up = g.math('MULTIPLY_ADD', n.outputs[2], 0.5, 0.5)
    if metal:
        # Painted metal: a bright sky above a dark horizon band, the way stylised gold and steel fake reflections.
        col = g.ramp(up, [(0.0, shade), (0.36, scaled(base, 0.8)), (0.48, shade), (0.6, base), (0.82, light),
                          (1.0, scaled(light, 1.15))])
    else:
        height = g.math('DIVIDE', p.outputs[2], 1.6, clamp=True)
        lit = g.math('MULTIPLY_ADD', up, 0.7, g.math('MULTIPLY', height, 0.3), clamp=True)
        col = g.ramp(lit, [(0.15, shade), (0.55, base), (0.92, light)])

    stretch = g.node('ShaderNodeVectorMath', [(0, geo.outputs['Position']), (1, (1.0, 1.0, 1 - 0.85 * streak))],
                     operation='MULTIPLY').outputs[0]
    blotch = g.node('ShaderNodeTexNoise', [(0, stretch), (2, 3.5 + 10 * streak), (3, 4.0), (4, 0.65)]).outputs[0]
    tint = g.node('ShaderNodeTexNoise', [(0, geo.outputs['Position']), (2, 2.2), (3, 2.0)]).outputs[0]
    value = g.math('MULTIPLY_ADD', g.math('SUBTRACT', blotch, 0.5), 2 * mottle * 2, 1.0)
    hue = g.math('MULTIPLY_ADD', g.math('SUBTRACT', tint, 0.5), 0.06 * (mottle > 0), 0.5)
    col = g.node('ShaderNodeHueSaturation', [(0, hue), (1, 1.0), (2, value), (3, 1.0), (4, col)]).outputs[0]

    ao = g.node('ShaderNodeAmbientOcclusion', [(1, 0.14)], samples=16).outputs['AO']
    cav = g.math('MULTIPLY', g.math('SUBTRACT', 1.0, ao), cavity * 1.6, clamp=True)
    col = g.mix(cav, col, (*scaled(shade, 0.3), 1))
    # Pointiness flags every thin part as an edge; the bevel normal only bends where the surface turns sharply.
    bevel = g.node('ShaderNodeBevel', [(0, 0.012)], samples=8).outputs[0]
    bend = g.math('SUBTRACT', 1.0, g.node('ShaderNodeVectorMath', [(0, bevel), (1, geo.outputs['Normal'])], operation='DOT_PRODUCT').outputs['Value'])
    rim = g.math('MULTIPLY', bend, 30 * edge, clamp=True)
    col = g.mix(g.math('MULTIPLY', rim, ao), col, (*scaled(light, 1.1), 1))
    if grime:
        dirt = g.math('MULTIPLY', g.math('SUBTRACT', 1.0, g.math('DIVIDE', p.outputs[2], 0.32)), grime, clamp=True)
        col = g.mix(dirt, col, (*rgb('#2a2318'), 1))
    if accent:
        mask = g.node('ShaderNodeAttribute', attribute_name='mask', attribute_type='GEOMETRY').outputs['Fac']
        col = g.mix(mask, col, (*rgb(accent), 1))
    emit = g.node('ShaderNodeEmission', [(0, col), (1, 1.0)])
    out = g.node('ShaderNodeOutputMaterial')
    nt.links.new(emit.outputs[0], out.inputs['Surface'])
    SPECS[name] = dict(rough=rough, glow=glow, keep=keep or glow > 0)
    return m


def mark(ob, value):
    """Writes the `mask` attribute: `value(co)` per vertex, in the object's local space."""
    me = ob.data
    attr = me.attributes.get('mask') or me.attributes.new('mask', 'FLOAT', 'POINT')
    for v, d in zip(me.vertices, attr.data):
        d.value = value(v.co)
    return ob


def bake(size=1024, margin=16, samples=64, fill='#1c3229'):
    """`fill` paints the gaps between islands: distant mipmaps blend them into the seams, so they should match the body."""
    scn = bpy.context.scene
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    for o in meshes:
        me = o.data
        if not me.uv_layers:
            me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            poly.select = bool(me.materials) and me.materials[poly.material_index].name in SPECS
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=0.01)
    bpy.ops.object.mode_set(mode='OBJECT')

    img = bpy.data.images.new('atlas', size, size, alpha=False)
    img.generated_color = (*hexrgb(fill), 1)
    for name in SPECS:
        nt = bpy.data.materials[name].node_tree
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = img
        nt.nodes.active = tex
    scn.render.engine = 'CYCLES'
    scn.cycles.samples = samples
    scn.render.bake.margin = margin
    bpy.ops.object.bake(type='EMIT', use_clear=False)

    # AUTO image format keeps a JPEG source a JPEG in the glb, which is what keeps the file small.
    path = os.path.join(tempfile.mkdtemp(), 'atlas.jpg')
    img.file_format = 'JPEG'
    img.save(filepath=path, quality=90)
    atlas = bpy.data.images.load(path)
    atlas.pack()
    swap(meshes, atlas)


def textured(name, atlas, rough, glow):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = atlas
    nt.links.new(tex.outputs['Color'], p.inputs['Base Color'])
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = 0.0
    if glow:
        nt.links.new(tex.outputs['Color'], p.inputs['Emission Color'])
        p.inputs['Emission Strength'].default_value = glow
    return m


def swap(meshes, atlas):
    """Replaces the bake graphs with textured materials, merging the unkept ones, then drops duplicate slots."""
    final = {}
    for name, spec in SPECS.items():
        old = bpy.data.materials[name]
        old.name = f'{name}_bake'
        key = name if spec['keep'] else MERGED
        if key not in final:
            final[key] = textured(key, atlas, 0.8 if key == MERGED else spec['rough'], spec['glow'])
        final[name] = final[key]
    for o in meshes:
        me = o.data
        mats = [final.get(m.name.removesuffix('_bake'), m) for m in me.materials]
        first = {}
        for i, m in enumerate(mats):
            first.setdefault(m.name, i)
        idx = [first[m.name] for m in mats]
        for poly in me.polygons:
            poly.material_index = idx[poly.material_index]
        for i, m in enumerate(mats):
            me.materials[i] = m
        if 'mask' in me.attributes:
            me.attributes.remove(me.attributes['mask'])
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.material_slot_remove_unused()
