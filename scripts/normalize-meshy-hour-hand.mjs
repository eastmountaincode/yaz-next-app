import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

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

const sourcePath = path.resolve(
  process.argv[2] ?? "public/3d-models/clock/hands/vintage_clock_hour_hand_meshy5.glb",
);
const outputPath = path.resolve(
  process.argv[3] ??
    "public/3d-models/clock/hands/vintage_clock_hour_hand_meshy5_normalized.glb",
);
const pivotSide = process.argv[4] ?? "max";

function parseGlb(filePath) {
  const buffer = fs.readFileSync(filePath);
  const readU32 = (offset) => buffer.readUInt32LE(offset);
  let offset = 12;
  let json = null;
  let binStart = null;

  while (offset < buffer.length) {
    const chunkLength = readU32(offset);
    const chunkType = buffer.toString("utf8", offset + 4, offset + 8);
    offset += 8;

    if (chunkType === "JSON") {
      json = JSON.parse(buffer.toString("utf8", offset, offset + chunkLength));
    }

    if (chunkType.startsWith("BIN")) {
      binStart = offset;
    }

    offset += chunkLength;
  }

  if (!json || binStart === null) {
    throw new Error(`Could not parse GLB: ${filePath}`);
  }

  return { buffer, json, binStart };
}

function componentCount(type) {
  return { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[type] ?? 1;
}

function componentSize(componentType) {
  return { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[componentType];
}

function readComponent(buffer, offset, componentType) {
  if (componentType === 5120) return buffer.readInt8(offset);
  if (componentType === 5121) return buffer.readUInt8(offset);
  if (componentType === 5122) return buffer.readInt16LE(offset);
  if (componentType === 5123) return buffer.readUInt16LE(offset);
  if (componentType === 5125) return buffer.readUInt32LE(offset);
  if (componentType === 5126) return buffer.readFloatLE(offset);
  throw new Error(`Unsupported accessor component type: ${componentType}`);
}

function readAccessor(parsed, accessorIndex) {
  const accessor = parsed.json.accessors[accessorIndex];
  const bufferView = parsed.json.bufferViews[accessor.bufferView];
  const count = componentCount(accessor.type);
  const bytes = componentSize(accessor.componentType);
  const stride = bufferView.byteStride ?? count * bytes;
  const start =
    parsed.binStart + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = [];

  for (let index = 0; index < accessor.count; index += 1) {
    const row = [];
    for (let component = 0; component < count; component += 1) {
      row.push(
        readComponent(
          parsed.buffer,
          start + index * stride + component * bytes,
          accessor.componentType,
        ),
      );
    }
    values.push(row);
  }

  return values;
}

function getPrimitive(parsed) {
  const mesh = parsed.json.meshes?.[0];
  const primitive = mesh?.primitives?.[0];

  if (primitive?.attributes?.POSITION == null) {
    throw new Error("Could not find a position accessor in the Meshy GLB.");
  }

  return primitive;
}

function estimatePivotAndTip(positions, side) {
  let minX = Infinity;
  let maxX = -Infinity;

  for (const [x] of positions) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }

  const pivotCluster =
    side === "min"
      ? positions.filter(([x]) => x < minX + 0.3)
      : positions.filter(([x]) => x > maxX - 0.3);
  const pivot = pivotCluster
    .reduce((sum, [x, , z]) => [sum[0] + x, sum[1] + z], [0, 0])
    .map((value) => value / pivotCluster.length);

  let tip = null;
  let tipDistance = -Infinity;

  for (const [x, , z] of positions) {
    const dx = x - pivot[0];
    const dz = z - pivot[1];
    const distance = Math.hypot(dx, dz);

    if (distance > tipDistance) {
      tipDistance = distance;
      tip = [x, z];
    }
  }

  const direction = [
    (tip[0] - pivot[0]) / tipDistance,
    (tip[1] - pivot[1]) / tipDistance,
  ];

  return { pivot, direction, sourceLength: tipDistance };
}

const parsed = parseGlb(sourcePath);
const primitive = getPrimitive(parsed);
const positions = readAccessor(parsed, primitive.attributes.POSITION);
const indices = primitive.indices == null ? null : readAccessor(parsed, primitive.indices).flat();
const { pivot, direction, sourceLength } = estimatePivotAndTip(positions, pivotSide);
const sideAxis = [direction[1], -direction[0]];
const targetLength = 0.72;
const scale = targetLength / sourceLength;

const transformed = new Float32Array(positions.length * 3);
for (const [index, [x, y, z]] of positions.entries()) {
  const dx = x - pivot[0];
  const dz = z - pivot[1];
  const side = dx * sideAxis[0] + dz * sideAxis[1];
  const along = dx * direction[0] + dz * direction[1];

  transformed[index * 3] = side * scale;
  transformed[index * 3 + 1] = along * scale;
  transformed[index * 3 + 2] = y * scale;
}

const geometry = new THREE.BufferGeometry();
geometry.setAttribute("position", new THREE.BufferAttribute(transformed, 3));

if (indices) {
  geometry.setIndex(indices);
}

geometry.computeVertexNormals();

const material = new THREE.MeshStandardMaterial({
  name: "meshy5_dark_clock_hand_metal",
  color: "#151311",
  metalness: 0.35,
  roughness: 0.38,
});

const mesh = new THREE.Mesh(geometry, material);
mesh.name = "hour_hand_meshy5_normalized_mesh";

const root = new THREE.Group();
root.name = "hour_hand_meshy5_pivot_at_center";
root.add(mesh);

const exporter = new GLTFExporter();
const result = await exporter.parseAsync(root, { binary: true });
fs.writeFileSync(outputPath, Buffer.from(result));

console.log(
  JSON.stringify(
    {
      sourcePath,
      outputPath,
      pivotSide,
      pivot: pivot.map((value) => Number(value.toFixed(4))),
      sourceLength: Number(sourceLength.toFixed(4)),
      targetLength,
      scale: Number(scale.toFixed(4)),
    },
    null,
    2,
  ),
);
