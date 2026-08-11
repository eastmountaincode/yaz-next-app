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

bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format="GLB",
    export_apply=True,
    export_texcoords=False,
    export_normals=True,
    export_materials="EXPORT",
)
