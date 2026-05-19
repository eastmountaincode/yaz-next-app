import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { DOMParser } from "@xmldom/xmldom";
import sharp from "sharp";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";

const require = createRequire(import.meta.url);
const potrace = require("potrace");

if (typeof globalThis.DOMParser === "undefined") {
  globalThis.DOMParser = DOMParser;
}

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

const inputPath = path.resolve(
  process.argv[2] ?? "public/3d-models/clock/hands/hour_hand_meshy_input.png",
);
const svgPath = path.resolve(
  process.argv[3] ?? "public/3d-models/clock/hands/hour_hand_vector_trace.svg",
);
const outputPath = path.resolve(
  process.argv[4] ?? "public/3d-models/clock/hands/vintage_clock_hour_hand_vector.glb",
);
const useBevel = process.argv.includes("--bevel");
const pivotSide = process.argv.includes("--pivot=max") ? "max" : "min";
const skipSmoothing = process.argv.includes("--no-smooth");
const assetName = outputPath.includes("minute")
  ? "minute_hand_vector"
  : "hour_hand_vector";

function readNumberArg(prefix, fallback) {
  const value = process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const targetLength = readNumberArg("--length=", 0.72);
const targetDepth = readNumberArg("--depth=", 0.026);
const bevelThickness = readNumberArg("--bevel-thickness=", 0.35);
const bevelSize = readNumberArg("--bevel-size=", 0.35);
const smoothInputPath = svgPath.replace(/\.svg$/i, "_smooth_input.png");

async function createSmoothedMask(filePath, outputFilePath) {
  const { data, info } = await sharp(filePath)
    .ensureAlpha()
    .flatten({ background: "#ffffff" })
    .grayscale()
    .blur(1.3)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = Buffer.alloc(info.width * info.height * 4);

  for (let index = 0; index < info.width * info.height; index += 1) {
    const value = data[index] < 190 ? 17 : 255;
    const offset = index * 4;
    pixels[offset] = value;
    pixels[offset + 1] = value;
    pixels[offset + 2] = value;
    pixels[offset + 3] = 255;
  }

  await sharp(pixels, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png()
    .toFile(outputFilePath);
}

function traceToSvg(filePath) {
  return new Promise((resolve, reject) => {
    potrace.trace(
      filePath,
      {
        threshold: 128,
        blackOnWhite: true,
        turdSize: 8,
        turnPolicy: potrace.Potrace.TURNPOLICY_MINORITY,
        optCurve: true,
        optTolerance: 2.8,
        color: "#111111",
        background: "transparent",
      },
      (error, svg) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(svg);
      },
    );
  });
}

async function readDarkPixels(filePath) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({
    resolveWithObject: true,
  });
  const pixels = [];

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const index = (y * info.width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const a = data[index + 3];

      if (a > 20 && r < 128 && g < 128 && b < 128) {
        pixels.push([x, y]);
      }
    }
  }

  return { pixels, width: info.width, height: info.height };
}

function estimatePivotAndDirection(pixels) {
  let minX = Infinity;
  let maxX = -Infinity;

  for (const [x] of pixels) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }

  const pivotCluster =
    pivotSide === "max"
      ? pixels.filter(([x]) => x > maxX - 160)
      : pixels.filter(([x]) => x < minX + 160);
  const pivot = pivotCluster
    .reduce((sum, [x, y]) => [sum[0] + x, sum[1] + y], [0, 0])
    .map((value) => value / pivotCluster.length);

  let tip = null;
  let sourceLength = -Infinity;

  for (const [x, y] of pixels) {
    const distance = Math.hypot(x - pivot[0], y - pivot[1]);

    if (distance > sourceLength) {
      sourceLength = distance;
      tip = [x, y];
    }
  }

  const direction = [
    (tip[0] - pivot[0]) / sourceLength,
    (tip[1] - pivot[1]) / sourceLength,
  ];

  return { pivot, tip, direction, sourceLength };
}

function transformGeometry(geometry, pivot, direction, scale) {
  const sideAxis = [direction[1], -direction[0]];
  const position = geometry.getAttribute("position");

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    const dx = x - pivot[0];
    const dy = y - pivot[1];
    const side = dx * sideAxis[0] + dy * sideAxis[1];
    const along = dx * direction[0] + dy * direction[1];

    position.setXYZ(
      index,
      side * scale,
      along * scale,
      (z - 0.5) * targetDepth,
    );
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
}

if (!skipSmoothing) {
  await createSmoothedMask(inputPath, smoothInputPath);
}

const traceInputPath = skipSmoothing ? inputPath : smoothInputPath;
const svg = await traceToSvg(traceInputPath);
fs.writeFileSync(svgPath, svg);

const darkPixels = await readDarkPixels(inputPath);
const { pivot, tip, direction, sourceLength } = estimatePivotAndDirection(darkPixels.pixels);
const scale = targetLength / sourceLength;
const loader = new SVGLoader();
const parsed = loader.parse(svg);
const material = new THREE.MeshStandardMaterial({
  name: "vector_traced_aged_black_metal",
  color: "#11100f",
  metalness: 0.08,
  roughness: 0.92,
  side: THREE.DoubleSide,
});
const root = new THREE.Group();
root.name = `${assetName}_pivot_at_center`;

let shapeCount = 0;
for (const svgPathData of parsed.paths) {
  const shapes = SVGLoader.createShapes(svgPathData);

  for (const shape of shapes) {
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 1,
      bevelEnabled: useBevel,
      bevelThickness,
      bevelSize,
      bevelSegments: 2,
      curveSegments: 4,
    });

    transformGeometry(geometry, pivot, direction, scale);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${assetName}_shape_${String(shapeCount + 1).padStart(2, "0")}`;
    root.add(mesh);
    shapeCount += 1;
  }
}

const exporter = new GLTFExporter();
const result = await exporter.parseAsync(root, { binary: true });
fs.writeFileSync(outputPath, Buffer.from(result));

console.log(
  JSON.stringify(
    {
      inputPath,
      traceInputPath,
      smoothInputPath,
      svgPath,
      outputPath,
      useBevel,
      pivotSide,
      shapeCount,
      pivot: pivot.map((value) => Number(value.toFixed(2))),
      tip: tip.map((value) => Number(value.toFixed(2))),
      sourceLength: Number(sourceLength.toFixed(2)),
      targetLength,
      targetDepth,
      bevelThickness: useBevel ? bevelThickness : 0,
      bevelSize: useBevel ? bevelSize : 0,
      darkPixelCount: darkPixels.pixels.length,
    },
    null,
    2,
  ),
);
