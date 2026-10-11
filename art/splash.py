"""Renders a class's champion-select splash: its built figure lit against a painted backdrop of its land.

Usage: Blender --background --factory-startup --python art/splash.py -- <class> <out.png>   (art/splash.sh wraps it)
Reads public/models/<class>.glb and never writes it.
"""
import math
import os
import random
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W, H = 1024, 1280

# Land palette from docs/world.md. `team` is the colour the team material takes here, since a splash shows the class, not a side.
# `head` is where the anchor (the eyes) lands, as a fraction of the frame from the top; `frame` is the idle frame posed;
# `turn` swings the camera round the figure in degrees, positive towards its left side. `key`, `rim` and `halo` balance
# each figure: a pale body drowns in a rim a violet robe needs.
LANDS = {
    'astromancer': dict(main='#5a30c4', accent='#e8b648', glow='#c9a8ff', team='#e8b648', sky='#120a2e', frame=1, head=0.26, turn=24, key=110, rim=1.0, halo=1.6),
    'gravecaller': dict(main='#275f48', accent='#ddd0b0', glow='#5dffc0', team='#ddd0b0', sky='#06140f', frame=1, head=0.27, turn=-22, key=110, rim=1.0, halo=1.2),
    'bellringer': dict(main='#ad7a2c', accent='#f5cc52', glow='#ffb640', team='#b08a3a', sky='#1c1006', frame=1, head=0.27, turn=26, key=260, rim=0.8, halo=0.8),
    'marionettist': dict(main='#ad7a2c', accent='#f5cc52', glow='#ffb640', team='#e2cf9c', sky='#1c1006', frame=1, head=0.27, turn=20, key=280, rim=0.6, halo=0.9),
    'mirrormime': dict(main='#5a30c4', accent='#e8b648', glow='#c9a8ff', team='#e8b648', sky='#120a2e', frame=1, head=0.28, turn=18, key=220, rim=0.75, halo=1.4),
}


def lin(h):
    h = h.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb) + (1.0,)


def scale(c, k):
    return tuple(x * k for x in c[:3]) + (1.0,)


def node(nt, kind, **inputs):
    n = nt.nodes.new(kind)
    for k, v in inputs.items():
        n.inputs[k].default_value = v
    return n


def unlit(name, build):
    """A material whose surface is whatever `build(nt)` returns, with no lighting: painted backdrop, halos, motes."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(build(nt), out.inputs['Surface'])
    m.surface_render_method = 'BLENDED' if name.startswith(('halo', 'mote', 'spirit')) else 'DITHERED'
    return m


def additive(nt, color_socket, strength):
    """Emission added onto what is behind: a transparent surface plus light, so black adds nothing."""
    e = node(nt, 'ShaderNodeEmission', Strength=strength)
    nt.links.new(color_socket, e.inputs['Color'])
    add = nt.nodes.new('ShaderNodeAddShader')
    nt.links.new(nt.nodes.new('ShaderNodeBsdfTransparent').outputs[0], add.inputs[0])
    nt.links.new(e.outputs[0], add.inputs[1])
    return add.outputs[0]


def radial(nt, color, power):
    """`color` fading from the centre of a unit plane's UVs to nothing at its rim, sharpened by `power`."""
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Location'].default_value = (-1, -1, 0)
    mp.inputs['Scale'].default_value = (2, 2, 1)
    nt.links.new(tc.outputs['UV'], mp.inputs['Vector'])
    grad = nt.nodes.new('ShaderNodeTexGradient')
    grad.gradient_type = 'SPHERICAL'
    nt.links.new(mp.outputs[0], grad.inputs['Vector'])
    pw = node(nt, 'ShaderNodeMath')
    pw.operation = 'POWER'
    nt.links.new(grad.outputs['Fac'], pw.inputs[0])
    pw.inputs[1].default_value = power
    mix = node(nt, 'ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = (0, 0, 0, 1)
    mix.inputs['B'].default_value = color
    nt.links.new(pw.outputs[0], mix.inputs['Factor'])
    return mix.outputs['Result']


def billboard(name, loc, size, color, strength, power, cam):
    bpy.ops.mesh.primitive_plane_add(size=size, location=loc)
    o = bpy.context.object
    o.name = name
    o.data.materials.append(unlit(name, lambda nt: additive(nt, radial(nt, color, power), strength)))
    c = o.constraints.new('TRACK_TO')
    c.target, c.track_axis, c.up_axis = cam, 'TRACK_Z', 'UP_Y'
    o.visible_shadow = False
    return o


def import_figure(cls, land):
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'public', 'models', f'{cls}.glb'))
    team = lin(land['team'])
    for m in bpy.data.materials:
        base = m.name.split('.')[0]
        nt = m.node_tree
        if not nt:
            continue
        p = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if base == 'void':
            nt.nodes.clear()
            e = node(nt, 'ShaderNodeEmission', Color=(0, 0, 0, 1))
            nt.links.new(e.outputs[0], nt.nodes.new('ShaderNodeOutputMaterial').inputs['Surface'])
        elif base == 'spirit' and p:
            src = p.inputs['Base Color'].links[0].from_socket if p.inputs['Base Color'].is_linked else None
            out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
            col = src or node(nt, 'ShaderNodeRGB').outputs[0]
            if not src:
                col.node.outputs[0].default_value = p.inputs['Base Color'].default_value
            nt.links.new(additive(nt, col, 3.0), out.inputs['Surface'])
            m.surface_render_method = 'BLENDED'
            m.use_transparency_overlap = True
        elif base == 'team' and p:
            # The game multiplies the team colour into the atlas, so do the same with the land's neutral.
            sock = p.inputs['Base Color']
            if sock.is_linked:
                src = sock.links[0].from_socket
                mul = node(nt, 'ShaderNodeMix')
                mul.data_type, mul.blend_type = 'RGBA', 'MULTIPLY'
                mul.inputs['Factor'].default_value = 1.0
                mul.inputs['B'].default_value = team
                nt.links.new(src, mul.inputs['A'])
                nt.links.new(mul.outputs['Result'], sock)
            else:
                sock.default_value = team
            if p.inputs['Emission Strength'].default_value > 0 and tuple(p.inputs['Emission Color'].default_value)[:3] != (0, 0, 0):
                p.inputs['Emission Color'].default_value = team
    # The importer draws an armature's bones with a metre-wide sphere; it is not part of the figure.
    shapes = {pb.custom_shape for o in bpy.data.objects if o.pose for pb in o.pose.bones}
    return [o for o in bpy.data.objects if o.type == 'MESH' and o not in shapes]


def bounds(meshes):
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo, hi = Vector(map(min, lo, w)), Vector(map(max, hi, w))
    return lo, hi


def place_camera(scn, anchor, top, corners, head, turn, lens):
    """Puts the camera low in front, looking slightly up, then solves distance and shift so the feet sit at 88% and
    `anchor` at `head` from the top of the frame, pulling back further when `top` (the hat, the staff) or a side of the
    bounding box (`corners`, trailing limbs) would be cut."""
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scn.collection.objects.link(cam)
    scn.camera = cam
    cam.data.lens = lens
    cam.data.sensor_fit = 'VERTICAL'
    a = math.radians(turn)
    aim = Vector((0, 0, anchor.z * 0.62))
    feet = Vector((anchor.x * 0.3, anchor.y * 0.3, 0))
    d = 4.0
    for _ in range(16):
        cam.location = aim + Vector((-math.sin(a) * d, -math.cos(a) * d, -anchor.z * 0.3))
        cam.rotation_euler = (aim - cam.location).to_track_quat('-Z', 'Y').to_euler()
        cam.data.shift_y = 0
        bpy.context.view_layer.update()
        v = lambda p: world_to_camera_view(scn, cam, p).y
        wide = max(abs(world_to_camera_view(scn, cam, c).x - 0.5) for c in corners) / 0.52
        d *= max((v(anchor) - v(feet)) / (0.88 - head), (v(top) - v(feet)) / (0.88 - 0.035), wide)
    bpy.context.view_layer.update()
    cam.data.shift_y = world_to_camera_view(scn, cam, feet).y - 0.12
    return cam


def ramp_node(nt, stops):
    r = nt.nodes.new('ShaderNodeValToRGB')
    els = r.color_ramp.elements
    els[0].position, els[0].color = stops[0]
    els[1].position, els[1].color = stops[-1]
    for pos, col in stops[1:-1]:
        els.new(pos).color = col
    return r


def horizon(land):
    """The haze where floor meets sky: lighter than both, so distance reads as air."""
    m, g = lin(land['main']), lin(land['glow'])
    return tuple(0.2 * a + 0.06 * b for a, b in zip(m[:3], g[:3])) + (1.0,)


def backdrop(land, cam, anchor):
    """A curved cyclorama painted with emission only, so no light in the scene can flatten it into a studio wall."""
    main, accent, glow, sky = (lin(land[k]) for k in ('main', 'accent', 'glow', 'sky'))
    radius = 9.0
    bpy.ops.mesh.primitive_cylinder_add(vertices=128, radius=radius, depth=16, location=(0, 0, 7.5), end_fill_type='NOTHING')
    cyc = bpy.context.object
    cyc.visible_shadow = False
    # The wall surrounds the figure; as indirect light it would flatten it into an even wash of its colour.
    cyc.visible_diffuse = cyc.visible_glossy = False
    for poly in cyc.data.polygons:
        poly.use_smooth = True
    # Where the sight line through the figure's head meets the wall: the halo sits there, straight behind the head.
    o, dirn = cam.location, (anchor - cam.location).normalized()
    bq = o.x * dirn.x + o.y * dirn.y
    aq = dirn.x ** 2 + dirn.y ** 2
    t = (-bq + math.sqrt(bq * bq - aq * (o.x ** 2 + o.y ** 2 - radius ** 2))) / aq
    behind = o + dirn * t
    # The figure's own height as it would measure on the wall, so the halo and sky scale with the frame.
    tall = anchor.z * (behind - o).length / (anchor - o).length

    def paint(nt):
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        sep = nt.nodes.new('ShaderNodeSeparateXYZ')
        nt.links.new(geo.outputs['Position'], sep.inputs[0])
        hz = node(nt, 'ShaderNodeMapRange', **{'From Min': 0.0, 'From Max': behind.z + tall})
        nt.links.new(sep.outputs['Z'], hz.inputs['Value'])
        sky_ramp = ramp_node(nt, [(0.0, horizon(land)), (0.16, scale(main, 0.09)), (0.5, scale(main, 0.045)), (1.0, scale(sky, 0.2))])
        nt.links.new(hz.outputs[0], sky_ramp.inputs['Fac'])
        # Big soft cloud banks streaked sideways, like loose brushwork, lit in the land's accent.
        mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (0.32, 0.32, 0.9)
        nt.links.new(geo.outputs['Position'], mp.inputs['Vector'])
        noise = node(nt, 'ShaderNodeTexNoise', Scale=1.0, Detail=5.0, Roughness=0.58, Distortion=0.35)
        nt.links.new(mp.outputs[0], noise.inputs['Vector'])
        band = ramp_node(nt, [(0.48, (0, 0, 0, 1)), (0.72, (1, 1, 1, 1))])
        nt.links.new(noise.outputs['Fac'], band.inputs['Fac'])
        clouds = node(nt, 'ShaderNodeMix')
        clouds.data_type, clouds.blend_type = 'RGBA', 'SCREEN'
        nt.links.new(band.outputs['Color'], clouds.inputs['Factor'])
        nt.links.new(sky_ramp.outputs['Color'], clouds.inputs['A'])
        clouds.inputs['B'].default_value = scale(accent, 0.1)
        # The sky lit by the champion: glow colour falling off from straight behind its head.
        dist = node(nt, 'ShaderNodeVectorMath')
        dist.operation = 'DISTANCE'
        nt.links.new(geo.outputs['Position'], dist.inputs[0])
        dist.inputs[1].default_value = behind
        fall = node(nt, 'ShaderNodeMapRange', **{'From Min': 0.0, 'From Max': tall * 1.15, 'To Min': 1.0, 'To Max': 0.0})
        nt.links.new(dist.outputs['Value'], fall.inputs['Value'])
        pw = node(nt, 'ShaderNodeMath')
        pw.operation = 'POWER'
        nt.links.new(fall.outputs[0], pw.inputs[0])
        pw.inputs[1].default_value = 2.4
        # The clouds catch the halo more than the clear sky does, so the light reads as broken by them.
        lift = node(nt, 'ShaderNodeMath')
        lift.operation = 'MULTIPLY_ADD'
        nt.links.new(band.outputs['Color'], lift.inputs[0])
        lift.inputs[1].default_value = 0.6
        lift.inputs[2].default_value = 0.55
        k = node(nt, 'ShaderNodeMath')
        k.operation = 'MULTIPLY'
        nt.links.new(pw.outputs[0], k.inputs[0])
        nt.links.new(lift.outputs[0], k.inputs[1])
        halo = node(nt, 'ShaderNodeMix')
        halo.data_type, halo.blend_type = 'RGBA', 'ADD'
        nt.links.new(k.outputs[0], halo.inputs['Factor'])
        nt.links.new(clouds.outputs['Result'], halo.inputs['A'])
        halo.inputs['B'].default_value = scale(glow, land['halo'])
        e = node(nt, 'ShaderNodeEmission', Strength=1.0)
        nt.links.new(halo.outputs['Result'], e.inputs['Color'])
        return e.outputs[0]

    cyc.data.materials.append(unlit('backdrop', paint))


def ground(land):
    """Lit stone near the figure that dissolves into the wall's horizon colour, so floor and sky never meet at a seam."""
    main = lin(land['main'])
    bpy.ops.mesh.primitive_circle_add(vertices=128, radius=9, fill_type='NGON', location=(0, 0, 0))
    g = bpy.context.object
    m = bpy.data.materials.new('ground')
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Roughness'].default_value = 0.9
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    noise = node(nt, 'ShaderNodeTexNoise', Scale=2.2, Detail=5.0, Distortion=0.4)
    nt.links.new(geo.outputs['Position'], noise.inputs['Vector'])
    stone = ramp_node(nt, [(0.35, scale(main, 0.1)), (0.7, scale(main, 0.26))])
    nt.links.new(noise.outputs['Fac'], stone.inputs['Fac'])
    nt.links.new(stone.outputs['Color'], p.inputs['Base Color'])
    r = node(nt, 'ShaderNodeVectorMath')
    r.operation = 'LENGTH'
    nt.links.new(geo.outputs['Position'], r.inputs[0])
    fade = node(nt, 'ShaderNodeMapRange', **{'From Min': 1.6, 'From Max': 6.5})
    nt.links.new(r.outputs['Value'], fade.inputs['Value'])
    far = node(nt, 'ShaderNodeEmission', Color=horizon(land), Strength=1.0)
    mix = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(fade.outputs[0], mix.inputs[0])
    nt.links.new(p.outputs[0], mix.inputs[1])
    nt.links.new(far.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    g.data.materials.append(m)


def light(name, kind, loc, target, color, energy, size=1.0, spot=None):
    data = bpy.data.lights.new(name, kind)
    data.color = color[:3]
    data.energy = energy
    if kind == 'AREA':
        data.shape, data.size = 'DISK', size
    if kind == 'SPOT':
        data.spot_size, data.spot_blend = spot, 0.9
        data.shadow_soft_size = size
    o = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o


def lights(land, turn, chest, figure):
    glow = lin(land['glow'])
    a = math.radians(turn)
    front, side = Vector((-math.sin(a), -math.cos(a), 0)), Vector((math.cos(a), -math.sin(a), 0))
    s = 1 if turn >= 0 else -1
    target = (0, 0, chest)
    # Key high on the camera's side, warm; fill low and land-tinted from the other side.
    light('key', 'AREA', front * 1.6 - side * 2.6 * s + Vector((0, 0, 3.4)), target, lin('#ffe7c8'), land['key'], size=1.2)
    light('fill', 'AREA', front * 2.4 + side * 2.8 * s + Vector((0, 0, 1.0)), target, lin(land['main']), 30, size=3.0)
    # Two glow rims from behind cut the silhouette. They light the figure only: on the floor they would flood the
    # foreground the camera sees.
    for name, k, energy in (('rimL', -1, 3600 * land['rim']), ('rimR', 1, 3000 * land['rim'])):
        rim = light(name, 'AREA', -front * 2.4 + side * 1.7 * k + Vector((0, 0, chest + 1.3)), target, glow, energy, size=0.7)
        rim.light_linking.receiver_collection = figure
    light('pool', 'SPOT', front * 0.5 + Vector((0, 0, 5.0)), (0, 0, 0), lin('#fff2dc'), 160, size=0.6, spot=math.radians(26))
    light('backpool', 'SPOT', -front * 1.6 + Vector((0, 0, 3.0)), (0, 0, 0), glow, 260, size=0.8, spot=math.radians(40))


def glows(cam):
    for e in [o for o in bpy.data.objects if o.name.startswith('glow') and 'color' in o]:
        col, size = lin(e['color']), float(e['size'])
        loc = e.matrix_world.translation.copy()
        billboard(f'halo-{e.name}', loc, size * 1.6, col, 1.3, 2.6, cam)
        pl = bpy.data.lights.new(f'pt-{e.name}', 'POINT')
        pl.color, pl.energy, pl.use_shadow = col[:3], 10 * size, False
        o = bpy.data.objects.new(f'pt-{e.name}', pl)
        bpy.context.collection.objects.link(o)
        o.location = loc


def motes(land, cam, chest):
    rnd = random.Random(7)
    glow = lin(land['glow'])
    m = unlit('mote', lambda nt: additive(nt, radial(nt, glow, 3.0), 4.0))
    for i in range(46):
        x, y, z = rnd.uniform(-1.8, 1.8), rnd.uniform(-0.6, 2.4), rnd.uniform(0.1, chest * 2.4)
        bpy.ops.mesh.primitive_plane_add(size=rnd.uniform(0.02, 0.06), location=(x, y, z))
        o = bpy.context.object
        o.name = f'mote{i}'
        o.data.materials.append(m)
        c = o.constraints.new('TRACK_TO')
        c.target, c.track_axis, c.up_axis = cam, 'TRACK_Z', 'UP_Y'
        o.visible_shadow = False


def world(land):
    w = bpy.data.worlds.new('w')
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = scale(lin(land['main']), 0.05)
    w.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    bpy.context.scene.world = w


def composite(scn):
    """Bloom on the highlights so rims, eyes and halos bleed light like a painted glow."""
    ng = bpy.data.node_groups.new('splash', 'CompositorNodeTree')
    rl = ng.nodes.new('CompositorNodeRLayers')
    gl = ng.nodes.new('CompositorNodeGlare')
    gl.inputs['Type'].default_value = 'Bloom'
    gl.inputs['Threshold'].default_value = 0.85
    gl.inputs['Strength'].default_value = 0.55
    gl.inputs['Size'].default_value = 0.8
    ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    out = ng.nodes.new('NodeGroupOutput')
    ng.links.new(rl.outputs['Image'], gl.inputs['Image'])
    ng.links.new(gl.outputs['Image'], out.inputs[0])
    scn.compositing_node_group = ng
    scn.render.use_compositing = True


def main():
    argv = sys.argv[sys.argv.index('--') + 1:]
    cls, out = argv[0], argv[1]
    land = LANDS[cls]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scn = bpy.context.scene
    # The camera solve below reads the frame's aspect, so the resolution is set first.
    scn.render.resolution_x, scn.render.resolution_y = W * 2, H * 2
    meshes = import_figure(cls, land)
    scn.frame_set(land['frame'])
    lo, hi = bounds(meshes)
    eyes = [o.matrix_world.translation for o in bpy.data.objects if o.name.lower().startswith('glow') and 'eye' in o.name.lower()]
    anchor = sum(eyes, Vector()) / len(eyes) if eyes else Vector((0, 0, hi.z * 0.85))
    corners = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    cam = place_camera(scn, anchor, Vector((anchor.x, anchor.y, hi.z)), corners, land['head'], land['turn'], 40)
    chest = anchor.z * 0.72
    # The UI crops by object-position; a tall hat or trailing limbs push the eyes below the `head` target, so say where they landed.
    print(f'splash: eyes at {1 - world_to_camera_view(scn, cam, anchor).y:.0%} from the top')
    world(land)
    backdrop(land, cam, anchor)
    ground(land)
    figure = bpy.data.collections.new('figure')
    for o in meshes:
        figure.objects.link(o)
    lights(land, land['turn'], chest, figure)
    glows(cam)
    motes(land, cam, chest)

    scn.render.engine = 'BLENDER_EEVEE'
    scn.eevee.taa_render_samples = 64
    scn.eevee.use_shadows = True
    scn.eevee.shadow_pool_size = '1024'
    scn.eevee.use_raytracing = True
    scn.render.film_transparent = False
    scn.view_settings.view_transform = 'AgX'
    scn.view_settings.look = 'AgX - Medium High Contrast'
    cam.data.dof.use_dof = True
    cam.data.dof.focus_distance = (cam.location - Vector((0, 0, chest))).length
    cam.data.dof.aperture_fstop = 2.8
    composite(scn)
    scn.render.image_settings.file_format = 'PNG'
    scn.render.filepath = out
    bpy.ops.render.render(write_still=True)


main()
