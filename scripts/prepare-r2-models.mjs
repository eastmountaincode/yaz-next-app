import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.join(projectRoot, "public");
const outputRoot = path.join(projectRoot, ".r2-assets");
const cliPath = path.join(projectRoot, "node_modules", ".bin", "gltf-transform");
const environmentPath = path.join(projectRoot, "src", "content", "environment.json");
const clockPath = path.join(projectRoot, "src", "content", "clock.json");
const optionalModelsPath = path.join(projectRoot, "src", "content", "optionalModels.json");
const baseboardPath = "/3d-models/beaded_baseboard_4_plaster_texture.glb";
const publishedFrameModelPaths = [
  "/3d-models/frames/adobe_stock_265717933_wood_square_frame_optimized.glb",
  "/3d-models/frames/adobe_stock_259198522_art_frame_blank_04_optimized.glb",
];

const environment = JSON.parse(await readFile(environmentPath, "utf8"));
const clock = JSON.parse(await readFile(clockPath, "utf8"));
const optionalModels = JSON.parse(await readFile(optionalModelsPath, "utf8"));
const assetPaths = new Set([baseboardPath, ...publishedFrameModelPaths]);

async function isProductionReadyGlb(sourcePath) {
  const bytes = await readFile(sourcePath);
  if (bytes.length < 20 || bytes.toString("utf8", 0, 4) !== "glTF") {
    return false;
  }

  const jsonChunkLength = bytes.readUInt32LE(12);
  const jsonChunkType = bytes.readUInt32LE(16);
  if (jsonChunkType !== 0x4e4f534a || 20 + jsonChunkLength > bytes.length) {
    return false;
  }

  const document = JSON.parse(
    bytes
      .toString("utf8", 20, 20 + jsonChunkLength)
      .replace(/\0+$/g, "")
      .trim(),
  );
  const extensions = new Set([
    ...(document.extensionsUsed ?? []),
    ...(document.extensionsRequired ?? []),
  ]);
  const images = document.images ?? [];
  const texturesAreWebReady = images.every(
    (image) =>
      image.mimeType === "image/webp" ||
      (typeof image.uri === "string" && image.uri.toLowerCase().endsWith(".webp")),
  );

  return extensions.has("EXT_meshopt_compression") && texturesAreWebReady;
}

for (const model of optionalModels) {
  if (typeof model.model === "string" && model.model.endsWith(".glb")) {
    assetPaths.add(model.model);
  }
}

for (const object of environment.objects ?? []) {
  for (const key of ["model", "holderModel", "candleModel", "speakerModel"]) {
    if (key === "candleModel" && object.separateCandleModel === false) {
      continue;
    }
    if (typeof object[key] === "string" && object[key].endsWith(".glb")) {
      assetPaths.add(object[key]);
    }
  }

  if (typeof object.flameTexture === "string") {
    assetPaths.add(object.flameTexture);
  }

  if (object.kind === "clock") {
    for (const key of ["model", "hourHandModel", "minuteHandModel", "secondHandModel"]) {
      if (typeof clock[key] === "string") {
        assetPaths.add(clock[key]);
      }
    }
  }
}

if (typeof clock.faceTexture === "string") {
  assetPaths.add(clock.faceTexture);
}

const orderedPaths = [...assetPaths].sort();
await mkdir(outputRoot, { recursive: true });
const temporaryRelease = await mkdtemp(path.join(outputRoot, "tmp-"));
const manifestEntries = [];

try {
  for (const publicPath of orderedPaths) {
    if (
      !publicPath.startsWith("/3d-models/") ||
      ![".glb", ".png"].includes(path.extname(publicPath).toLowerCase())
    ) {
      throw new Error(`Refusing unexpected runtime asset path: ${publicPath}`);
    }

    const relativePath = publicPath.slice(1);
    const sourcePath = path.join(publicRoot, relativePath);
    const outputPath = path.join(temporaryRelease, relativePath);
    await mkdir(path.dirname(outputPath), { recursive: true });

    if (publicPath.endsWith(".glb") && !(await isProductionReadyGlb(sourcePath))) {
      execFileSync(
        cliPath,
        [
          "optimize",
          sourcePath,
          outputPath,
          "--compress",
          "meshopt",
          "--meshopt-level",
          "high",
          "--texture-compress",
          "webp",
          "--texture-size",
          "1024",
          "--flatten",
          "false",
          "--join",
          "false",
          "--instance",
          "false",
          "--palette",
          "false",
          "--simplify",
          "false",
        ],
        { cwd: projectRoot, stdio: "inherit" },
      );
    } else {
      await copyFile(sourcePath, outputPath);
    }

    const sourceInfo = await stat(sourcePath);
    const outputInfo = await stat(outputPath);
    const outputBytes = await readFile(outputPath);
    manifestEntries.push({
      publicPath,
      objectKey: relativePath,
      sourceBytes: sourceInfo.size,
      outputBytes: outputInfo.size,
      sha256: createHash("sha256").update(outputBytes).digest("hex"),
      contentType: publicPath.endsWith(".glb") ? "model/gltf-binary" : "image/png",
    });
  }

  const releaseHash = createHash("sha256")
    .update(manifestEntries.map((entry) => `${entry.objectKey}:${entry.sha256}`).join("\n"))
    .digest("hex")
    .slice(0, 12);
  const releaseId = `yaz-${releaseHash}`;
  const releaseRoot = path.join(outputRoot, "releases", releaseId);
  const manifest = {
    releaseId,
    r2Prefix: `releases/${releaseId}`,
    createdAt: new Date().toISOString(),
    sourceBytes: manifestEntries.reduce((total, entry) => total + entry.sourceBytes, 0),
    outputBytes: manifestEntries.reduce((total, entry) => total + entry.outputBytes, 0),
    assets: manifestEntries,
  };

  await mkdir(path.dirname(releaseRoot), { recursive: true });
  try {
    await rename(temporaryRelease, releaseRoot);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "EEXIST" || error.code === "ENOTEMPTY")
    ) {
      await rm(temporaryRelease, { recursive: true, force: true });
    } else {
      throw error;
    }
  }

  await writeFile(
    path.join(releaseRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(path.join(outputRoot, "latest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const reduction = 100 - (manifest.outputBytes / manifest.sourceBytes) * 100;
  const modelCount = manifest.assets.filter(
    (asset) => asset.contentType === "model/gltf-binary",
  ).length;
  console.log(
    `\nPrepared ${modelCount} production models and ${manifest.assets.length - modelCount} dependent textures.`,
  );
  console.log(`Release: ${releaseId}`);
  console.log(`Size: ${(manifest.sourceBytes / 1_048_576).toFixed(1)} MB -> ${(manifest.outputBytes / 1_048_576).toFixed(1)} MB (${reduction.toFixed(1)}% smaller)`);
  console.log(`R2 base URL suffix: /releases/${releaseId}`);
} catch (error) {
  await rm(temporaryRelease, { recursive: true, force: true });
  throw error;
}
