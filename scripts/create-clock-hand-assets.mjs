import fs from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const outDir = path.resolve("public/3d-models/clock/hands");

if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class FileReader {
    result = null;
    onloadend = null;

    async readAsArrayBuffer(blob) {
      this.result = await blob.arrayBuffer();
      this.onloadend?.();
    }
  };
}

const blackMaterial = new THREE.MeshStandardMaterial({
  name: "aged_black_metal",
  color: "#171412",
  metalness: 0.05,
  roughness: 0.42,
});

const redMaterial = new THREE.MeshStandardMaterial({
  name: "red_second_hand_enamel",
  color: "#9b1d1c",
  metalness: 0,
  roughness: 0.55,
});

const capMaterial = new THREE.MeshStandardMaterial({
  name: "dark_center_cap",
  color: "#2d2a27",
  metalness: 0.25,
  roughness: 0.36,
});

function extrudeShape(shape, depth = 0.018) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 2,
  });

  return geometry;
}

function makeHandShape(points) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) {
    shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function addMesh(group, geometry, material, name) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  group.add(mesh);
  return mesh;
}

function addDisc(group, radius, material, name, x = 0, y = 0, z = 0.016) {
  const geometry = new THREE.CylinderGeometry(radius, radius, 0.014, 64);
  geometry.rotateX(Math.PI / 2);
  const mesh = addMesh(group, geometry, material, name);
  mesh.position.set(x, y, z);
  return mesh;
}

function addRing(group, outerRadius, innerRadius, material, name, x = 0, y = 0, z = 0.02) {
  const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 64);
  const mesh = addMesh(group, geometry, material, name);
  mesh.position.set(x, y, z);
  return mesh;
}

function addEllipticalRing(
  group,
  outerX,
  outerY,
  innerX,
  innerY,
  material,
  name,
  x = 0,
  y = 0,
  z = 0.02,
) {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, outerX, outerY, 0, Math.PI * 2, false);

  const hole = new THREE.Path();
  hole.absellipse(0, 0, innerX, innerY, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const mesh = addMesh(group, extrudeShape(shape, 0.014), material, name);
  mesh.position.set(x, y, z);
  return mesh;
}

function addBar(group, width, height, material, name, x, y, rotationZ = 0, z = 0.024) {
  const geometry = new THREE.BoxGeometry(width, height, 0.014);
  const mesh = addMesh(group, geometry, material, name);
  mesh.position.set(x, y, z);
  mesh.rotation.z = rotationZ;
  return mesh;
}

function createMinuteHand() {
  const group = new THREE.Group();
  group.name = "minute_hand_pivot_at_center";

  const body = makeHandShape([
    [-0.018, -0.055],
    [0.018, -0.055],
    [0.024, 0.54],
    [0.07, 0.61],
    [0.02, 0.635],
    [0.012, 0.73],
    [0, 0.77],
    [-0.012, 0.73],
    [-0.02, 0.635],
    [-0.07, 0.61],
    [-0.024, 0.54],
  ]);
  addMesh(group, extrudeShape(body, 0.016), blackMaterial, "minute_hand_spear_body");

  addRing(group, 0.051, 0.03, blackMaterial, "minute_hand_center_ring", 0, 0, 0.03);
  addRing(group, 0.043, 0.026, blackMaterial, "minute_hand_lower_bubble", 0, 0.17, 0.031);
  addRing(group, 0.039, 0.023, blackMaterial, "minute_hand_mid_bubble", 0, 0.245, 0.031);
  addRing(group, 0.033, 0.019, blackMaterial, "minute_hand_upper_bubble", 0, 0.315, 0.031);
  addDisc(group, 0.018, capMaterial, "minute_hand_center_pin", 0, 0, 0.04);

  return group;
}

function createHourHand() {
  const group = new THREE.Group();
  group.name = "hour_hand_pivot_at_center";

  const lowerStem = makeHandShape([
    [-0.014, -0.025],
    [0.014, -0.025],
    [0.019, 0.078],
    [0.052, 0.113],
    [0.037, 0.141],
    [0.014, 0.111],
    [-0.008, 0.145],
    [-0.026, 0.13],
    [-0.018, 0.094],
  ]);
  addMesh(group, extrudeShape(lowerStem, 0.017), blackMaterial, "hour_hand_reference_lower_stem");

  addBar(group, 0.017, 0.21, blackMaterial, "hour_hand_reference_left_rail", -0.028, 0.23, -0.72);
  addBar(group, 0.015, 0.15, blackMaterial, "hour_hand_reference_right_rail", 0.025, 0.245, -0.48);

  addRing(group, 0.055, 0.033, blackMaterial, "hour_hand_reference_pivot_ring", 0, 0, 0.034);
  addDisc(group, 0.019, capMaterial, "hour_hand_reference_center_pin", 0, 0, 0.048);

  addRing(group, 0.032, 0.021, blackMaterial, "hour_hand_reference_small_bubble", 0.055, 0.16, 0.036);
  addRing(group, 0.045, 0.027, blackMaterial, "hour_hand_reference_lower_bubble", -0.012, 0.235, 0.036);
  addRing(group, 0.046, 0.028, blackMaterial, "hour_hand_reference_mid_bubble", 0.04, 0.284, 0.037);
  addRing(group, 0.038, 0.023, blackMaterial, "hour_hand_reference_upper_bubble", -0.026, 0.332, 0.037);

  addEllipticalRing(
    group,
    0.056,
    0.2,
    0.034,
    0.163,
    blackMaterial,
    "hour_hand_reference_long_oval_cutout",
    0.037,
    0.505,
    0.032,
  );

  const spear = makeHandShape([
    [-0.035, 0.635],
    [0.003, 0.712],
    [0.074, 0.795],
    [0.036, 0.812],
    [-0.009, 0.765],
    [-0.055, 0.724],
  ]);
  addMesh(group, extrudeShape(spear, 0.018), blackMaterial, "hour_hand_reference_spear_tip");

  addBar(group, 0.012, 0.19, blackMaterial, "hour_hand_reference_spear_inner_slash", 0.017, 0.725, -0.66, 0.044);
  addBar(group, 0.012, 0.16, blackMaterial, "hour_hand_reference_spear_outer_slash", 0.047, 0.742, -0.72, 0.044);

  return group;
}

function createSecondHand() {
  const group = new THREE.Group();
  group.name = "second_hand_pivot_at_center";

  const line = makeHandShape([
    [-0.006, -0.22],
    [0.006, -0.22],
    [0.004, 0.64],
    [0, 0.71],
    [-0.004, 0.64],
  ]);
  addMesh(group, extrudeShape(line, 0.008), redMaterial, "second_hand_fine_red_pointer");
  addDisc(group, 0.024, redMaterial, "second_hand_center_eye", 0, 0, 0.018);
  addDisc(group, 0.012, capMaterial, "second_hand_center_pin", 0, 0, 0.028);

  return group;
}

async function exportGlb(object, filename) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.castShadow = false;
      child.receiveShadow = false;
    }
  });

  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(object, { binary: true });
  await fs.writeFile(path.join(outDir, filename), Buffer.from(result));
}

await fs.mkdir(outDir, { recursive: true });

await exportGlb(createHourHand(), "vintage_clock_hour_hand.glb");
await exportGlb(createMinuteHand(), "vintage_clock_minute_hand.glb");
await exportGlb(createSecondHand(), "vintage_clock_second_hand.glb");

console.log(`Created clock hand GLBs in ${outDir}`);
