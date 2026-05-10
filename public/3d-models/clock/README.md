# Vintage Clock Assets

Source model:

- `vintage_clock_-_free_model.glb`

Extracted embedded texture:

- `vintage_clock_face_original.jpg`

Original recreated face texture:

- `vintage_clock_face_recreation.png`
- `vintage_clock_face_recreation_1024.png`

Generated hand models:

- `hands/vintage_clock_hour_hand.glb`
- `hands/vintage_clock_hour_hand_meshy5.glb`
- `hands/vintage_clock_hour_hand_meshy5_normalized.glb`
- `hands/vintage_clock_hour_hand_meshy5_v2.glb`
- `hands/vintage_clock_hour_hand_meshy5_v2_normalized.glb`
- `hands/vintage_clock_minute_hand.glb`
- `hands/vintage_clock_second_hand.glb`

Hand references:

- `hands/hour_hand_reference.png`
- `hands/hour_hand_meshy_input.png`
- `hands/vintage_clock_hour_hand_meshy5_preview.png`
- `hands/hour_hand_meshy_task.json`
- `hands/vintage_clock_hour_hand_meshy5_v2_preview.png`
- `hands/hour_hand_meshy_task_v2.json`

The original face texture includes the Roman numerals, decorative aging, Shutterstock watermark, hour hand, minute hand, and second hand baked into one image. For a live clock, edit this into a clean version with the hands removed and save it here as:

- `vintage_clock_face_clean.jpg`

The hand GLBs are original geometry inspired by the reference clock and supplied hand references. Each hand points upward at 12 o'clock by default, with its root object pivot at the clock center. In Three.js, place the hand root at the face center and rotate around `rotation.z`.

`vintage_clock_hour_hand_meshy5_normalized.glb` is the Meshy-5 generated hour hand normalized for the live clock. It has its root pivot at the center ring, points upward at 12 o'clock, and uses a dark-metal material. The unnormalized Meshy download is preserved as `vintage_clock_hour_hand_meshy5.glb`.

`vintage_clock_hour_hand_meshy5_v2_normalized.glb` is the second Meshy-5 pass from the user-edited `hour_hand_meshy_input.png`. It uses the same normalized clock-ready orientation and is the preferred Meshy candidate so far.

For Meshy image-to-3D, the image drives the geometry. Text prompts are useful for texture/material guidance, but this workflow generates untextured geometry and applies clock-hand material locally.

Next implementation step:

- Load the clock model in the Three.js scene.
- Swap the baked face material to use `vintage_clock_face_recreation_1024.png` or `vintage_clock_face_clean.jpg`.
- Add separate Three.js hour, minute, and second hand meshes just in front of the face.
- Rotate those hand meshes from the current local time.
- Add a small calibration editor for hand center, hand length, z offset, and face rotation.
