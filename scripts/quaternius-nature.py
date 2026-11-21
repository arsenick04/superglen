"""Build the small runtime subset of Quaternius Ultimate Stylized Nature.

Run with Blender, keeping the downloaded source outside the repository:
  blender -b --python scripts/quaternius-nature.py -- SOURCE_DIR public/env/quaternius-nature.glb

The source textures are sampled into a per-corner colour attribute. The exported
GLB therefore needs no large PNG textures and can be merged into city chunks.
"""

import math
import os
import sys

import bpy
import mathutils


args = sys.argv[sys.argv.index("--") + 1 :]
source_dir, output_file = args
models = {
    "quat_normal_1": "NormalTree_1.fbx",
    "quat_normal_3": "NormalTree_3.fbx",
    "quat_maple_2": "MapleTree_2.fbx",
    "quat_pine_2": "PineTree_2.fbx",
}
triangle_budget = {
    "quat_normal_1": 1400,
    "quat_normal_3": 1200,
    "quat_maple_2": 1000,
    "quat_pine_2": 800,
}


def image_for(material):
    if not material or not material.use_nodes:
        return None
    for node in material.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image and "normal" not in node.image.name.lower():
            return node.image
    return None


def sample(image, uv):
    if not image or not image.has_data:
        return (1.0, 1.0, 1.0, 1.0)
    w, h = image.size
    x = min(w - 1, max(0, int((uv.x % 1.0) * w)))
    y = min(h - 1, max(0, int((uv.y % 1.0) * h)))
    i = (y * w + x) * 4
    return tuple(image.pixels[i : i + 4])


def bake_colours(obj):
    mesh = obj.data
    uv = mesh.uv_layers.active
    colours = mesh.color_attributes.get("Color") or mesh.color_attributes.new(
        name="Color", type="BYTE_COLOR", domain="CORNER"
    )
    images = [image_for(mat) for mat in mesh.materials]
    for poly in mesh.polygons:
        image = images[poly.material_index] if poly.material_index < len(images) else None
        fallback = mesh.materials[poly.material_index].diffuse_color if poly.material_index < len(mesh.materials) else (1, 1, 1, 1)
        for loop_index in poly.loop_indices:
            colours.data[loop_index].color = sample(image, uv.data[loop_index].uv) if image and uv else fallback

    mesh.materials.clear()
    material = bpy.data.materials.new(f"{obj.name}_vertex")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    principled = nodes.get("Principled BSDF")
    vertex = nodes.new("ShaderNodeVertexColor")
    vertex.layer_name = "Color"
    material.node_tree.links.new(vertex.outputs["Color"], principled.inputs["Base Color"])
    mesh.materials.append(material)
    for poly in mesh.polygons:
        poly.use_smooth = True


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

for runtime_name, filename in models.items():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(source_dir, "FBX", filename), use_anim=False)
    imported = [obj for obj in bpy.data.objects if obj not in before and obj.type == "MESH"]
    if not imported:
        raise RuntimeError(f"No mesh in {filename}")
    for obj in imported:
        obj.select_set(True)
        bake_colours(obj)
    bpy.context.view_layer.objects.active = imported[0]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in imported:
        obj.select_set(True)
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = runtime_name
    obj.data.name = runtime_name
    triangles = sum(len(poly.vertices) - 2 for poly in obj.data.polygons)
    if triangles > triangle_budget[runtime_name]:
        modifier = obj.modifiers.new(name="mobile_lod", type="DECIMATE")
        modifier.ratio = triangle_budget[runtime_name] / triangles
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    # This FBX release stores its vertical axis as Blender Y. Rotate it to
    # Blender Z before glTF's Z-up -> Y-up conversion.
    obj.rotation_euler.rotate_axis("X", math.radians(90))
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    # Put the model on the ground and centre it horizontally. FBX import is in metres.
    corners = [obj.matrix_world @ mathutils.Vector(corner) for corner in obj.bound_box]
    min_x = min(v.x for v in corners)
    max_x = max(v.x for v in corners)
    min_y = min(v.y for v in corners)
    max_y = max(v.y for v in corners)
    min_z = min(v.z for v in corners)
    max_z = max(v.z for v in corners)
    for vertex in obj.data.vertices:
        vertex.co.x -= (min_x + max_x) * 0.5
        vertex.co.y -= (min_y + max_y) * 0.5
        vertex.co.z -= min_z

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(
    filepath=output_file,
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_materials="EXPORT",
)

