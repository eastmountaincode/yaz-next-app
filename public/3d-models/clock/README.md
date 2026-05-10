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
- `hands/vintage_clock_minute_hand.glb`
- `hands/vintage_clock_second_hand.glb`

The original face texture includes the Roman numerals, decorative aging, Shutterstock watermark, hour hand, minute hand, and second hand baked into one image. For a live clock, edit this into a clean version with the hands removed and save it here as:

- `vintage_clock_face_clean.jpg`

The hand GLBs are original geometry inspired by the reference clock. Each hand points upward at 12 o'clock by default, with its root object pivot at the clock center. In Three.js, place the hand root at the face center and rotate around `rotation.z`.

Next implementation step:

- Load the clock model in the Three.js scene.
- Swap the baked face material to use `vintage_clock_face_recreation_1024.png` or `vintage_clock_face_clean.jpg`.
- Add separate Three.js hour, minute, and second hand meshes just in front of the face.
- Rotate those hand meshes from the current local time.
- Add a small calibration editor for hand center, hand length, z offset, and face rotation.
