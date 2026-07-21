export type VectorTuple = [number, number, number];

export type CandleCompositeConfig = {
  id: string;
  kind: "candle-composite";
  label: string;
  visible: boolean;
  position: VectorTuple;
  rotation: VectorTuple;
  wallScale: number;
  holderModel: string;
  candleModel: string;
  flameTexture: string;
  candleOffset: VectorTuple;
  candleScale: number;
  flameOffset: VectorTuple;
  flameScale: number;
  flameOpacity: number;
  flameLightColor: string;
  flameLightIntensity: number;
  flameLightDistance: number;
};

export const candleFlameAtlas = {
  columns: 16,
  rows: 9,
  frameCount: 139,
  frameDurationMs: 70,
};

export const defaultCandleComposite: CandleCompositeConfig = {
  id: "candle-holder-composite",
  kind: "candle-composite",
  label: "Candle holder",
  visible: true,
  position: [-3.08, -1.1, 0.18],
  rotation: [0, 0.08, 0],
  wallScale: 0.92,
  holderModel: "/3d-models/candle-and-holder/holder.glb",
  candleModel: "/3d-models/candle-and-holder/candle_no_flame_shorter.glb",
  flameTexture: "/3d-models/candle-and-holder/candleflame_atlas.png",
  candleOffset: [0, 0.42, 0.02],
  candleScale: 0.46,
  flameOffset: [0, 0.9, 0.08],
  flameScale: 0.46,
  flameOpacity: 0.92,
  flameLightColor: "#ffb86b",
  flameLightIntensity: 0.3,
  flameLightDistance: 1.1,
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const nextValue = isFiniteNumber(value) ? value : fallback;
  return Number(Math.min(max, Math.max(min, nextValue)).toFixed(4));
}

function normalizeVector(
  value: unknown,
  fallback: VectorTuple,
  min: VectorTuple,
  max: VectorTuple,
): VectorTuple {
  if (!Array.isArray(value)) {
    return fallback;
  }

  return [
    clampNumber(value[0], fallback[0], min[0], max[0]),
    clampNumber(value[1], fallback[1], min[1], max[1]),
    clampNumber(value[2], fallback[2], min[2], max[2]),
  ];
}

function normalizePath(value: unknown, fallback: string) {
  return typeof value === "string" && value.startsWith("/") ? value : fallback;
}

function normalizeColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

export function normalizeCandleComposite(
  value: Partial<CandleCompositeConfig> | null | undefined,
): CandleCompositeConfig {
  const seed = value ?? {};
  return {
    id: typeof seed.id === "string" && seed.id.trim() ? seed.id : defaultCandleComposite.id,
    kind: "candle-composite",
    label:
      typeof seed.label === "string" && seed.label.trim()
        ? seed.label
        : defaultCandleComposite.label,
    visible: seed.visible !== false,
    position: normalizeVector(seed.position, defaultCandleComposite.position, [-4.2, -4.2, -0.35], [4.2, 2, 2.8]),
    rotation: normalizeVector(seed.rotation, defaultCandleComposite.rotation, [-Math.PI, -Math.PI, -Math.PI], [Math.PI, Math.PI, Math.PI]),
    wallScale: clampNumber(seed.wallScale, defaultCandleComposite.wallScale, 0.35, 2.4),
    holderModel: normalizePath(seed.holderModel, defaultCandleComposite.holderModel),
    candleModel: normalizePath(seed.candleModel, defaultCandleComposite.candleModel),
    flameTexture: normalizePath(seed.flameTexture, defaultCandleComposite.flameTexture),
    candleOffset: normalizeVector(seed.candleOffset, defaultCandleComposite.candleOffset, [-0.8, -0.2, -0.8], [0.8, 1.4, 0.8]),
    candleScale: clampNumber(seed.candleScale, defaultCandleComposite.candleScale, 0.08, 1.2),
    flameOffset: normalizeVector(seed.flameOffset, defaultCandleComposite.flameOffset, [-0.8, -0.1, -0.8], [0.8, 1.6, 0.8]),
    flameScale: clampNumber(seed.flameScale, defaultCandleComposite.flameScale, 0.04, 0.8),
    flameOpacity: clampNumber(seed.flameOpacity, defaultCandleComposite.flameOpacity, 0, 1),
    flameLightColor: normalizeColor(seed.flameLightColor, defaultCandleComposite.flameLightColor),
    flameLightIntensity: clampNumber(seed.flameLightIntensity, defaultCandleComposite.flameLightIntensity, 0, 4),
    flameLightDistance: clampNumber(seed.flameLightDistance, defaultCandleComposite.flameLightDistance, 0.1, 4),
  };
}
