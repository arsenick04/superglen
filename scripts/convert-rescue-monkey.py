"""blender -b --python scripts/convert-rescue-monkey.py -- SOURCE OUTPUT"""
import bpy
import os
import sys
source, output = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.fbx(filepath=os.path.join(source, 'Monkey_Animated.fbx'))
print('MONKEY_ACTIONS', [(a.name, list(a.frame_range)) for a in bpy.data.actions])
run = next(a for a in bpy.data.actions if a.name.endswith('Monkey_Run'))
for obj in bpy.context.selected_objects:
    if obj.type == 'ARMATURE':
        obj.animation_data_create()
        for track in list(obj.animation_data.nla_tracks):
            obj.animation_data.nla_tracks.remove(track)
        obj.animation_data.action = run
bpy.context.scene.frame_start = int(run.frame_range[0])
bpy.context.scene.frame_end = int(run.frame_range[1])
bpy.context.scene.frame_set(bpy.context.scene.frame_start)
texture = bpy.data.images.load(os.path.join(source, 'Monkey_BaseColor.png'))
for material in bpy.data.materials:
    material.use_nodes = True
    bsdf = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    image = material.node_tree.nodes.new('ShaderNodeTexImage')
    image.image = texture
    material.node_tree.links.new(image.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.85
os.makedirs(os.path.dirname(output), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=output, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='ACTIVE_ACTIONS')
