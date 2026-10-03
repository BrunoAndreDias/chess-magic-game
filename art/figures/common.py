"""Shared kit for the class figures. Each `<class>.py` builds one figure with these helpers and calls `finish()`.

What the game reads from a figure (src/client/board/models.ts):
- a material named `team`, recoloured blue or red per unit; author it in any colour;
- a material named `main`, the class body; a hit flashes its emission, so give it none;
- an object named `weapon`, tilted on its local x and lifted when the unit casts; put its origin at the grip and keep its own x rotation 0 (the cast overwrites it), rotating its children instead;
- every animation clip loops as idle motion;
- an Empty named `glow...` with custom props `color` ("#rrggbb") and `size` (metres) becomes a soft additive halo.

Units: 1 Blender unit = 1 tile. The figure stands on z = 0, centred on the origin, faces -Y (Blender's front view).
"""
import math
import sys

import bpy
from mathutils import Vector

FPS = 24


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


def hexrgb(h):
    h = h.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


def material(name, color, rough=0.75, metal=0.0, emit=None, strength=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*hexrgb(color), 1)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metal
    if emit:
        p.inputs['Emission Color'].default_value = (*hexrgb(emit), 1)
        p.inputs['Emission Strength'].default_value = strength
    return m


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def flat(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = False
    return obj


def smooth(obj):
    for poly in obj.data.polygons:
        poly.use_smooth = True
    return obj


def parent(child, par):
    # A just-created or just-moved parent has a stale matrix_world until the view layer updates.
    bpy.context.view_layer.update()
    child.parent = par
    child.matrix_parent_inverse = par.matrix_world.inverted()
    return child


def empty(name, loc=(0, 0, 0), par=None):
    e = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(e)
    e.location = loc
    if par:
        parent(e, par)
    return e


def glow(loc, color, size, par=None, name='glow'):
    e = empty(name, loc, par)
    e['color'] = color
    e['size'] = size
    return e


def loop(obj, path, index, values, period):
    """Keys `values` evenly over `period` frames and back to the first, so the clip loops seamlessly."""
    vals = list(values) + [values[0]]
    for i, v in enumerate(vals):
        frame = 1 + period * i / (len(vals) - 1)
        prop = getattr(obj, path)
        prop[index] = v
        obj.keyframe_insert(path, index=index, frame=frame)
    return obj


def spin(obj, axis=2, period=96):
    """A full turn about `axis` every `period` frames, at constant speed."""
    start = obj.rotation_euler[axis]
    for frame, v in ((1, start), (1 + period, start + 2 * math.pi)):
        obj.rotation_euler[axis] = v
        obj.keyframe_insert('rotation_euler', index=axis, frame=frame)
    for fc in _fcurves(obj.animation_data.action):
        for k in fc.keyframe_points:
            k.interpolation = 'LINEAR'
    obj.rotation_euler[axis] = start
    return obj


def _fcurves(act):
    if hasattr(act, 'fcurves'):
        return act.fcurves
    return [fc for layer in act.layers for strip in layer.strips for bag in strip.channelbags for fc in bag.fcurves]


def finish():
    """Export to the .glb path given after `--`, and optionally a preview render (`--preview <png>`)."""
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    if not argv:
        raise SystemExit('usage: blender --background --python <class>.py -- <out.glb> [--preview <out.png>]')
    out = argv[0]
    scn = bpy.context.scene
    scn.frame_start = 1
    scn.frame_end = max([int(fc.keyframe_points[-1].co[0]) for a in bpy.data.actions for fc in _fcurves(a) if fc.keyframe_points] or [1])
    bpy.ops.export_scene.gltf(
        filepath=out, export_format='GLB', export_apply=True, export_extras=True, export_animations=True,
        export_yup=True, export_cameras=False, export_lights=False,
    )
    if '--preview' in argv:
        preview(argv[argv.index('--preview') + 1])


def preview(path):
    """Quick look from Blender: `<path>` is the front three-quarter, `<path>` with -back the back three-quarter."""
    scn = bpy.context.scene
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    scn.render.engine = next(e for e in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'BLENDER_WORKBENCH') if e in engines)
    scn.render.resolution_x, scn.render.resolution_y = 700, 800
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (*hexrgb('#141824'), 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
    scn.world = world
    for name, energy, rot in (('key', 3.5, (50, 0, 30)), ('fill', 1.2, (60, 0, 200))):
        light = bpy.data.objects.new(name, bpy.data.lights.new(name, 'SUN'))
        light.data.energy = energy
        light.rotation_euler = [math.radians(r) for r in rot]
        scn.collection.objects.link(light)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 50
    scn.collection.objects.link(cam)
    scn.camera = cam
    target = Vector((0, 0, 0.85))
    for suffix, offset in (('', Vector((1.1, -2.7, 0.9))), ('-back', Vector((-1.1, 2.7, 0.9)))):
        cam.location = target + offset
        cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
        scn.render.filepath = path.replace('.png', f'{suffix}.png')
        bpy.ops.render.render(write_still=True)
