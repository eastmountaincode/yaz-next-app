import sys

import bpy


def cli_arguments():
    separator = sys.argv.index("--")
    arguments = sys.argv[separator + 1 :]
    if len(arguments) != 2:
        raise SystemExit("Usage: blender --background --python scripts/optimize-candle-in-glass.py -- INPUT OUTPUT")
    return arguments


source_path, output_path = cli_arguments()

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source_path)

for scene_object in list(bpy.data.objects):
    if scene_object.type == "MESH" and any(
        material and material.name == "Candle_flame"
        for material in scene_object.data.materials
    ):
        bpy.data.objects.remove(scene_object, do_unlink=True)


def join_material_meshes(material_name, object_name):
    meshes = [
        scene_object
        for scene_object in bpy.data.objects
        if scene_object.type == "MESH"
        and any(
            material and material.name == material_name
            for material in scene_object.data.materials
        )
    ]
    if not meshes:
        return None

    bpy.ops.object.select_all(action="DESELECT")
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()

    joined = bpy.context.view_layer.objects.active
    joined.name = object_name
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=0.000001)
    bpy.ops.object.mode_set(mode="OBJECT")
    return joined


glass = join_material_meshes("Material.001", "Glass")
wax = join_material_meshes("Material.003", "Wax")

for scene_object in [glass, wax]:
    if scene_object is None:
        continue
    bpy.context.view_layer.objects.active = scene_object
    scene_object.select_set(True)
    decimate = scene_object.modifiers.new(name="Web decimation", type="DECIMATE")
    decimate.ratio = 0.2
    decimate.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    scene_object.select_set(False)

bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format="GLB",
    export_apply=True,
    export_texcoords=False,
    export_normals=True,
    export_materials="EXPORT",
)
