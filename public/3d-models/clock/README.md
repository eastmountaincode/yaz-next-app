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
- `hands/vintage_clock_hour_hand_vector.glb`
- `hands/vintage_clock_hour_hand_vector_beveled.glb`
- `hands/vintage_clock_minute_hand_vector.glb`
- `hands/vintage_clock_minute_hand_vector_beveled.glb`
- `hands/vintage_clock_minute_hand.glb`
- `hands/vintage_clock_second_hand.glb`

Hand references:

- `hands/hour_hand_reference.png`
- `hands/hour_hand_meshy_input.png`
- `hands/vintage_clock_hour_hand_meshy5_preview.png`
- `hands/hour_hand_meshy_task.json`
- `hands/vintage_clock_hour_hand_meshy5_v2_preview.png`
- `hands/hour_hand_meshy_task_v2.json`
- `hands/hour_hand_vector_trace.svg`
- `hands/hour_hand_vector_trace_preview.png`
- `hands/hour_hand_vector_trace_smooth_input.png`
- `hands/minute_hand.png`
- `hands/minute_hand_vector_input.png`
- `hands/minute_hand_vector_trace.svg`
- `hands/minute_hand_vector_trace_preview.png`
- `hands/minute_hand_vector_trace_smooth_input.png`

The original face texture includes the Roman numerals, decorative aging, Shutterstock watermark, hour hand, minute hand, and second hand baked into one image. For a live clock, edit this into a clean version with the hands removed and save it here as:

- `vintage_clock_face_clean.jpg`

The hand GLBs are original geometry inspired by the reference clock and supplied hand references. Each hand points upward at 12 o'clock by default, with its root object pivot at the clock center. In Three.js, place the hand root at the face center and rotate around `rotation.z`.

`vintage_clock_hour_hand_meshy5_normalized.glb` is the Meshy-5 generated hour hand normalized for the live clock. It has its root pivot at the center ring, points upward at 12 o'clock, and uses a dark-metal material. The unnormalized Meshy download is preserved as `vintage_clock_hour_hand_meshy5.glb`.

`vintage_clock_hour_hand_meshy5_v2_normalized.glb` is the second Meshy-5 pass from the user-edited `hour_hand_meshy_input.png`. It uses the same normalized clock-ready orientation and is the preferred Meshy candidate so far.

For Meshy image-to-3D, the image drives the geometry. Text prompts are useful for texture/material guidance, but this workflow generates untextured geometry and applies clock-hand material locally.

`vintage_clock_hour_hand_vector.glb` is generated locally from `hour_hand_meshy_input.png` using Potrace + Three.js extrusion. It is the preferred hour hand asset for the live clock because the circular centers and long oval opening remain true empty holes instead of Meshy-invented filled geometry.

`vintage_clock_hour_hand_vector_beveled.glb` uses the same trace with a small bevel. Use it if the raw extrusion side reads too harshly in the 3D viewer. The vector script also uses a matte material and simplified contour to reduce side-wall banding from traced raster edges. Current flat vector hands use `--depth=0.0065`, about one quarter of the earlier `0.026` test depth, so they read more like clock hands than thick cutouts.

`vintage_clock_minute_hand_vector.glb` and `vintage_clock_minute_hand_vector_beveled.glb` are generated from `minute_hand.png` through `minute_hand_vector_input.png`. The current minute source still contains some broken central detail, so clean `minute_hand_vector_input.png` manually before regenerating if that artifact is visible in the clock.

Next implementation step:

- Load the clock model in the Three.js scene.
- Swap the baked face material to use `vintage_clock_face_recreation_1024.png` or `vintage_clock_face_clean.jpg`.
- Add separate Three.js hour, minute, and second hand meshes just in front of the face.
- Rotate those hand meshes from the current local time.
- Add a small calibration editor for hand center, hand length, z offset, and face rotation.
