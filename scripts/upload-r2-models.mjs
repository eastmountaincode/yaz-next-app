import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(projectRoot, ".r2-assets");
const bucket = process.env.YASLYNN_R2_BUCKET;
const accountId = process.env.YASLYNN_CLOUDFLARE_ACCOUNT_ID;

if (!bucket || !accountId) {
  throw new Error(
    "Set YASLYNN_R2_BUCKET and YASLYNN_CLOUDFLARE_ACCOUNT_ID before uploading.",
  );
}

const commandEnvironment = {
  ...process.env,
  CLOUDFLARE_ACCOUNT_ID: accountId,
};
const identity = execFileSync("wrangler", ["whoami"], {
  cwd: projectRoot,
  encoding: "utf8",
  env: commandEnvironment,
});

if (!identity.includes(accountId)) {
  throw new Error(
    `Wrangler is not authenticated to the required Yaslynn Cloudflare account (${accountId}).`,
  );
}

const manifest = JSON.parse(await readFile(path.join(outputRoot, "latest.json"), "utf8"));
const releaseRoot = path.join(outputRoot, "releases", manifest.releaseId);
const assets = manifest.assets ?? manifest.models;

for (const asset of assets) {
  const sourcePath = path.join(releaseRoot, asset.objectKey);
  const destination = `${bucket}/${manifest.r2Prefix}/${asset.objectKey}`;
  console.log(`Uploading ${destination}`);
  execFileSync(
    "wrangler",
    [
      "r2",
      "object",
      "put",
      destination,
      "--file",
      sourcePath,
      "--content-type",
      asset.contentType ?? "model/gltf-binary",
      "--cache-control",
      "public, max-age=31536000, immutable",
      "--remote",
      "--force",
    ],
    { cwd: projectRoot, env: commandEnvironment, stdio: "inherit" },
  );
}

console.log(`\nUploaded ${assets.length} runtime assets to ${bucket}/${manifest.r2Prefix}.`);
