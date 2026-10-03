"""Opens every built figure side by side in Blender, blue team in front and red behind, to look at them.

Usage: /Applications/Blender.app/Contents/MacOS/Blender --factory-startup --python art/showcase.py
"""
import os

import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLASSES = ['astromancer', 'weaver', 'gravecaller', 'bellringer']
TEAMS = (('blue', (0.105, 0.26, 1.0, 1)), ('red', (1.0, 0.147, 0.105, 1)))

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
for row, (team, rgb) in enumerate(TEAMS):
    for col, cls in enumerate(CLASSES):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'public', 'models', f'{cls}.glb'))
        new = set(bpy.data.objects) - before
        for o in new:
            if o.parent is None:
                o.location = ((col - 1.5) * 1.8, row * 1.8, 0)
            for slot in getattr(o, 'material_slots', []):
                m = slot.material
                if m and m.name.split('.')[0] == 'team':
                    m = m.copy()
                    m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = rgb
                    slot.material = m

bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0.9, 0))
floor = bpy.data.materials.new('floor')
floor.use_nodes = True
floor.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.05, 0.06, 0.08, 1)
bpy.context.object.data.materials.append(floor)
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 3.5
sun.rotation_euler = (0.9, 0, 0.5)
bpy.context.collection.objects.link(sun)
scn = bpy.context.scene
scn.frame_end = 192
scn.render.fps = 24

for area in (bpy.context.screen.areas if bpy.context.screen else []):
    if area.type != 'VIEW_3D':
        continue
    space = area.spaces.active
    space.shading.type = 'MATERIAL'
    space.overlay.show_floor = False
    r3d = space.region_3d
    r3d.view_location = (0, 0.9, 0.9)
    r3d.view_distance = 9
    r3d.view_rotation = (0.82, 0.57, 0.0, 0.0)
if bpy.context.screen:
    bpy.ops.screen.animation_play()
