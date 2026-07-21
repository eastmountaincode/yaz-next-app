# Code-only layout checkpoint

This branch intentionally excludes the new Git LFS-managed `.glb` and font files. It preserves the application source, composite definitions, wall positions, and non-LFS media so the current layout work can be reviewed and backed up without uploading the local 3D-model library.

The complete local checkpoint remains on branch `layout/yaz-rearrangement` at commit `2f5631b`.

The current wall layout expects these local-only assets at runtime:

- `public/3d-models/frames/vintage_frame_06.glb`
- `public/3d-models/frames/vintage_frame_04.glb`
- `public/3d-models/frames/photo_frame_with_mat_2026_05_31.glb`
- `public/3d-models/candle-and-holder/holder.glb`
- `public/3d-models/candle-and-holder/candle_no_flame_shorter.glb`
- `public/3d-models/decor/wooden_cross.glb`
- `public/fonts/Sato-Regular.ttf`
- `public/fonts/Sobria-Regular.ttf`

Copy those files from the local asset checkout before using this branch as a standalone runtime branch.
