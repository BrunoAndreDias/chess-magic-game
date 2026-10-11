"""Shared kit for the class figures. Each `<class>.py` builds one figure with these helpers and calls `finish()`.

What the game reads from a figure (src/client/board/models.ts):
- a material named `team`, recoloured blue or red per unit; author it in any colour;
- a material named `main`, the class body; a hit flashes its emission, so give it none;
- a material named `void` (see `void()`), drawn unlit pure black whatever the lights: a face lost in shadow;
- an object named `weapon`, its origin at the grip. A figure without a `cast` clip tilts it on its local x and lifts it
  when the unit casts, so keep its own rotation identity (that bob overwrites its x) and rotate its children instead;
- a material named `spirit`, drawn unlit and additive with no depth write or fog: spirit light that glows and never hides
  what is behind it. Its (baked) colour is the light it adds, so black is fully clear; fade a part out by painting it toward black;
- a clip named after an action (`cast`, `attack`, `hit`, `move`, `down`, `rise`) or a skill id (`toll`, `knell`, ...) is a
  one-shot the board plays on that event (see `act()` and src/client/board/acts.ts); its `strike` is the second its blow
  lands, where the board fires the skill's effect. A skill without its own clip plays `cast` (a basic attack, `attack`
  then `cast`), and a figure without either keeps the board's procedural motion. Every other clip loops as idle motion;
- an Empty named `glow...` with custom props `color` ("#rrggbb") and `size` (metres) becomes a soft additive halo;
- an armature (`armature()`) may skin meshes and carry objects on its bones (`bone_parent()`); its bones key like any
  object in a clip, and each unit gets its own skeleton;
- Empties `grip_<side>` at the centre of each closed fist, riding the hand, and `hold_<side>` on the held prop where
  that fist closes, riding the prop. art/grips.py fails a figure whose pairs part, or whose held prop dips under the
  floor, in any frame of any clip.

Units: 1 Blender unit = 1 tile. The figure stands on z = 0, centred on the origin, faces -Y (Blender's front view).

Arms on an armature (the Gravecaller is the reference):
- Bones. `hips` > `chest` > per side `clavicle_<s>` > `upperarm_<s>` > `forearm_<s>` > `hand_<s>`. Roll every arm
  bone's local x toward the figure's left (+X), so -x on any of them swings the arm forward and up or bends the joint,
  on both sides alike; give the spine bones x = +X too, so +x on the chest leans it forward and +y turns its front
  toward the figure's left. On a hanging upper arm z swings it out (+z right arm, -z left); once the arm is raised,
  z twists it and y swings it out instead.
- What rides what. A sleeve is one tube skinned along its arm, so the elbow bends without a seam. A cloak or coat
  that should turn with the torso is skinned from `hips` to `chest` across a band something rigid covers (a belt);
  cut the mesh under that band so only the top carries skin weights. Rigid parts ride their bone with `bone_parent()`:
  the head, hood and shoulder pieces on `chest`; each fist, its `grip_<side>` and what it holds (`weapon`, a bell's
  swing pivot) on `hand_<side>`, with the prop's `hold_<side>` under the prop. Everything else rides the root empty
  that breathes. Keep a prop's own keys on its children (a bell swinging on its bail), never on what the hand holds.
- Clips. act() keys bones by path, as offsets from rest (`pose.bones["chest"].rotation_euler`). Key the chest in
  every clip: from the battle camera, behind and above, the torso turning and leaning is what reads first. Pass
  the keys through `wield()` for a hand that carries a long prop, so it holds its lean whatever the arm does; then
  check that grips.py passes, since a chest leaning forward lowers the hand and can drive the prop into the floor.
- Helpers. `halfway()` registers a copy of a joint's bone, hung from that bone's parent, that every clip turns half as
  far; weight the skin rings round the crease to it and the joint keeps its volume (shoulder and elbow).
  `drape()` registers a bone from the elbow to a wide sleeve's opening that every clip slides and droops by the
  forearm's elevation; weight the sleeve to it from nothing at the elbow to all of it at the opening, and put the
  bare forearm under the sleeve, since it shows. act() keys both from the clip's own keys; idle loops do not.
"""
import math
import sys

import bpy
from mathutils import Euler, Matrix, Vector

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


def void():
    """The `void` material. Blender shows it as black emission; the game swaps in an unlit black, so its shape never shades."""
    m = bpy.data.materials.get('void') or bpy.data.materials.new('void')
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = (0, 0, 0, 1)
    nt.links.new(e.outputs[0], nt.nodes.new('ShaderNodeOutputMaterial').inputs['Surface'])
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


def armature(name, bones):
    """An armature from `bones`: (name, head, tail, parent, x), its bones' local x axis turned toward `x`. Each pose
    bone rotates in XYZ euler, so `act()` keys it like an object."""
    rig = bpy.data.objects.new(name, bpy.data.armatures.new(name))
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    for bone, head, tail, par, x in bones:
        b = rig.data.edit_bones.new(bone)
        b.head, b.tail = head, tail
        b.align_roll(Vector(x).cross(b.vector))
        if par:
            b.parent = rig.data.edit_bones[par]
            b.use_connect = (b.parent.tail - b.head).length < 1e-6
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in rig.pose.bones:
        pb.rotation_mode = 'XYZ'
    return rig


def bone_parent(child, rig, bone):
    """Hangs `child` on `bone` where it stands: it rides the bone and keeps its own transform."""
    bpy.context.view_layer.update()
    child.parent, child.parent_type, child.parent_bone = rig, 'BONE', bone
    tip = rig.matrix_world @ rig.pose.bones[bone].matrix @ Matrix.Translation((0, rig.data.bones[bone].length, 0))
    child.matrix_parent_inverse = tip.inverted()
    return child


def keyed(frames, f):
    """The value [(frame, value)] keys give at frame `f`, straight between keys."""
    pts = sorted(frames)
    for (f0, v0), (f1, v1) in zip(pts, pts[1:]):
        if f0 <= f <= f1:
            return v0 + (v1 - v0) * (f - f0) / (f1 - f0)
    return pts[0][1] if f < pts[0][0] else pts[-1][1]


def _bone(bone, prop='rotation_euler'):
    return f'pose.bones["{bone}"].{prop}'


def _turn(keys, ob, path, f):
    rest = ob.path_resolve(path)
    return Euler([rest[i] + keyed(keys.get((ob, path, i), [(0, 0)]), f) for i in range(3)]).to_matrix()


def posed(keys, rig, bone, f, own=True):
    """The world orientation of `bone` at frame `f` of a clip keyed by `keys` (act()'s offsets from rest), through the
    objects that carry `rig`; `own=False` leaves out the bone's own key."""
    b = rig.data.bones[bone]
    if b.parent:
        up = posed(keys, rig, b.parent.name, f) @ b.parent.matrix_local.to_3x3().inverted()
    else:
        up, ob = Matrix.Identity(3), rig
        while ob:
            up = ob.matrix_parent_inverse.to_3x3() @ _turn(keys, ob, 'rotation_euler', f) @ up
            ob = ob.parent
    turn = _turn(keys, rig, _bone(bone), f) if own else Matrix.Identity(3)
    return up @ b.matrix_local.to_3x3() @ turn


def wield(keys, rig, hand, lean, facing):
    """`keys` with `hand` keyed so what it holds leans forward by `lean` [(frame, radians)] in the facing of bone
    `facing`, whatever the arm above it does: a hand that carries a prop's weight, not one bolted to its forearm.
    It solves every frame that any key or `lean` names."""
    rest, face = rig.data.bones[hand].matrix_local.to_3x3(), rig.data.bones[facing].matrix_local.to_3x3().inverted()
    path = _bone(hand)
    out, prev = [[], [], []], Euler()
    for f in sorted({f for frames in keys.values() for f, _ in frames} | {f for f, _ in lean}):
        ahead = posed(keys, rig, facing, f) @ face @ Vector((0, -1, 0))
        held = Euler((keyed(lean, f), 0, math.atan2(ahead.x, -ahead.y))).to_matrix() @ rest
        prev = (posed(keys, rig, hand, f, own=False).inverted() @ held).to_euler('XYZ', prev)
        for i in range(3):
            out[i].append((f, prev[i]))
    for i in range(3):
        keys[(rig, path, i)] = out[i]
    return keys


def smoothstep(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


_HALVES, _DRAPES = {}, {}


def halfway(rig, helper, bone, bulge=0.0):
    """Has every clip key `helper` to half of each turn `bone` makes, swelling it across by `bulge` per radian of that
    turn. Make `helper` a copy of `bone` hung from `bone`'s parent and weight the skin round the joint to it: the ring
    at the crease then turns rigidly halfway instead of averaging two turns, which is what pinches a bent elbow thin."""
    _HALVES.setdefault(rig.name, []).append((helper, bone, bulge))


def drape(rig, bone, slide, droop):
    """Has every clip key `bone`, hung from a forearm from the elbow to the sleeve's opening, so the sleeve falls like
    cloth once the forearm rises past 10 degrees: by 55 it has slid back toward the elbow by `slide` of its length and
    its opening has swung `droop` radians toward the ground. Weight the sleeve to it from nothing at the elbow to all
    of it at the opening."""
    _DRAPES.setdefault(rig.name, []).append((bone, slide, droop))


def _derive(keys):
    """`keys` plus the keys `halfway()` and `drape()` derive from them."""
    keys = dict(keys)
    for rig in {ob for ob, _, _ in keys if ob.type == 'ARMATURE'}:
        for helper, bone, bulge in _HALVES.get(rig.name, ()):
            src = [keys.get((rig, _bone(bone), i)) or [(0, 0)] for i in range(3)]
            frames = sorted({f for fr in src for f, _ in fr})
            turns = [Vector([keyed(fr, f) for fr in src]) for f in frames]
            if not any(t.length for t in turns):
                continue
            for i in range(3):
                keys[(rig, _bone(helper), i)] = [(f, t[i] / 2) for f, t in zip(frames, turns)]
                keys[(rig, _bone(helper, 'scale'), i)] = [(f, bulge * t.length * (i != 1)) for f, t in zip(frames, turns)]
        frames = sorted({f for fr in keys.values() for f, _ in fr})
        for bone, slide, droop in _DRAPES.get(rig.name, ()):
            out = {(_bone(bone), i): [] for i in range(3)} | {(_bone(bone, 'scale'), i): [] for i in range(3)}
            prev = Euler()
            for f in frames:
                m = posed(keys, rig, bone, f, own=False)
                fall = smoothstep(0.17, 0.96, math.asin(max(-1.0, min(1.0, m.col[1].z))))
                down = m.inverted() @ Vector((0, 0, -1))
                across = Vector((down.x, 0, down.z))
                n = across.length
                turn = Matrix.Rotation(droop * fall * n, 3, Vector((0, 1, 0)).cross(across)) if n > 1e-6 else None
                prev = turn.to_euler('XYZ', prev) if turn else Euler()
                for i in range(3):
                    out[(_bone(bone), i)].append((f, prev[i]))
                    out[(_bone(bone, 'scale'), i)].append((f, -slide * fall if i == 1 else 0.0))
            for (path, i), v in out.items():
                keys[(rig, path, i)] = v
    return keys


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
        obj.path_resolve(path)[index] = v
        obj.keyframe_insert(path, index=index, frame=frame)
    return obj


def spin(obj, axis=2, period=96, turns=1):
    """`turns` full turns about `axis` every `period` frames, at constant speed; negative turns spin the other way."""
    start = obj.rotation_euler[axis]
    for frame, v in ((1, start), (1 + period, start + 2 * math.pi * turns)):
        obj.rotation_euler[axis] = v
        obj.keyframe_insert('rotation_euler', index=axis, frame=frame)
    for fc in _fcurves(obj.animation_data.action):
        for k in fc.keyframe_points:
            k.interpolation = 'LINEAR'
    obj.rotation_euler[axis] = start
    return obj


def act(name, strike, keys):
    """Authors the action clip `name` from frame 0. `keys` maps (object, path, index) to [(frame, offset from rest)];
    `strike` is the frame its blow lands. A path may reach into a pose bone (`pose.bones["arm"].rotation_euler`) on an
    armature. The clip sits on a muted NLA track, so the idle clips stay what plays.
    Every component of a keyed path gets keys: the exporter fills an unkeyed one from whatever an earlier clip left."""
    clip = bpy.data.actions.new(name)
    clip['strike'] = strike / FPS
    last = max(f for frames in keys.values() for f, _ in frames)
    keys = _derive(keys)
    for ob, path in {(ob, path) for ob, path, _ in keys}:
        for index in range(len(ob.path_resolve(path))):
            keys.setdefault((ob, path, index), [(0, 0), (last, 0)])
    for (ob, path, index), frames in keys.items():
        ad = ob.animation_data or ob.animation_data_create()
        idle = ad.action
        ad.action = clip
        prop = ob.path_resolve(path)
        rest = prop[index]
        for frame, v in frames:
            prop[index] = rest + v
            ob.keyframe_insert(path, index=index, frame=frame)
        prop[index] = rest
        slot = ad.action_slot
        ad.action = idle
        if not any(s.action == clip for t in ad.nla_tracks for s in t.strips):
            track = ad.nla_tracks.new()
            track.name, track.mute = name, True
            track.strips.new(name, 0, clip).action_slot = slot
    return clip


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
