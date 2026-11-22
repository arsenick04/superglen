"""Blender: convert selected Quaternius FBX assets to embedded GLB.

Run with: blender -b --python scripts/convert-quaternius.py -- SOURCE OUTPUT
SOURCE is the ultimate-stylized-nature/sources folder from the credited mirror.
"""
import bpy
import os
import sys

source, output = sys.argv[sys.argv.index('--') + 1:]
os.makedirs(output, exist_ok=True)
for name in ['NormalTree_1', 'PineTree_2', 'Bush', 'Rock_1']:
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.fbx(filepath=os.path.join(source, 'FBX', name + '.fbx'))
    for material in bpy.data.materials:
        texture_name = material.name.split('.')[0]
        if texture_name == 'Rock':
            texture_name = 'Rocks_Dark_Green'
        path = os.path.join(source, 'Textures', texture_name + '.png')
        if not os.path.isfile(path):
            continue
        material.use_nodes = True
        nodes = material.node_tree.nodes
        bsdf = next(node for node in nodes if node.type == 'BSDF_PRINCIPLED')
        texture = nodes.new('ShaderNodeTexImage')
        texture.image = bpy.data.images.load(path, check_existing=True)
        material.node_tree.links.new(texture.outputs['Color'], bsdf.inputs['Base Color'])
        material.node_tree.links.new(texture.outputs['Alpha'], bsdf.inputs['Alpha'])
        bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
        bsdf.inputs['Roughness'].default_value = 0.85
        if 'Leaves' in texture_name:
            material.surface_render_method = 'DITHERED'
    for image in bpy.data.images:
        path = os.path.join(source, 'Textures', os.path.basename(image.filepath.replace('\\', '/')))
        if os.path.isfile(path):
            image.filepath = path
            image.reload()
    bpy.ops.export_scene.gltf(filepath=os.path.join(output, name + '.glb'), export_format='GLB', use_selection=True, export_animations=False)
