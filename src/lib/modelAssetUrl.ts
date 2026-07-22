const configuredR2BaseUrl = process.env.NEXT_PUBLIC_R2_ASSET_BASE_URL?.trim().replace(/\/+$/, "");

export function isModelAssetPath(path: string) {
  return path.startsWith("/3d-models/");
}

export function resolveModelAssetUrl(path: string) {
  if (!configuredR2BaseUrl || !isModelAssetPath(path)) {
    return path;
  }

  return `${configuredR2BaseUrl}${path}`;
}
