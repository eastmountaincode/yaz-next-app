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
    if scene_object.type != "MESH":
        continue

    material_names = {material.name for material in scene_object.data.materials if material}
    if "Candle_flame" in material_names:
        bpy.data.objects.remove(scene_object, do_unlink=True)
        continue

    if "Material.001" in material_names and scene_object.data.name != "Object_0":
        bpy.data.objects.remove(scene_object, do_unlink=True)
        continue

    if len(scene_object.data.polygons) < 200:
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
