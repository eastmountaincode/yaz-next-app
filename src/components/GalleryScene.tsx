"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Box,
  Clock,
  CircleHelp,
  Eye,
  EyeOff,
  Lightbulb,
  Lock,
  Plus,
  RotateCcw,
  ScanSearch,
  Scissors,
  SlidersHorizontal,
  Trash2,
  Type,
  Unlock,
  X,
} from "lucide-react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import savedClockComposite from "@/content/clock.json";
import savedComposites from "@/content/composites.json";
import { works, type WorkItem } from "@/content/works";
import {
  ClockCompositeConfig,
  clockHandAngles,
  defaultClockComposite,
  normalizeClockComposite,
} from "@/lib/clockComposite";

type MaskShape = "rectangle" | "oval";
type ObjectKind = "frame" | "model" | "light" | "clock" | "hitbox";
type VectorTuple = [number, number, number];

type BaseObjectSetting = {
  id: string;
  kind: ObjectKind;
  label: string;
  visible: boolean;
  position: VectorTuple;
  rotation: VectorTuple;
  wallScale: number;
};

type FrameSetting = BaseObjectSetting & {
  kind: "frame";
  model: string;
  workSlug: string;
  maskShape: MaskShape;
  width: number;
  height: number;
  frameRotationX: number;
  frameRotationY: number;
  frameRotationZ: number;
  clipX: number;
  clipY: number;
  clipZ: number;
  clipWidth: number;
  clipHeight: number;
  videoScale: number;
  videoOffsetX: number;
  videoOffsetY: number;
  captionOffsetX: number;
  captionOffsetY: number;
  captionOffsetZ: number;
  captionScale: number;
};

type ModelSetting = BaseObjectSetting & {
  kind: "model";
  model: string;
  catalogId: string;
};

type ClockSetting = BaseObjectSetting & {
  kind: "clock";
};

type LightSetting = BaseObjectSetting & {
  kind: "light";
  color: string;
  intensity: number;
  distance: number;
  decay: number;
  enabled: boolean;
};

type HitboxSetting = BaseObjectSetting & {
  kind: "hitbox";
  action: "toggle-nearest-light";
};

type SceneObjectSetting = FrameSetting | ModelSetting | ClockSetting | LightSetting | HitboxSetting;

type SceneLighting = {
  ambientColor: string;
  ambientIntensity: number;
  keyColor: string;
  keyIntensity: number;
  keyPosition: VectorTuple;
  fillColor: string;
  fillIntensity: number;
  fillPosition: VectorTuple;
  exposure: number;
};

type StoredEnvironment = {
  lighting?: Partial<SceneLighting>;
  objects?: Partial<SceneObjectSetting>[];
};

const STORAGE_KEY = "yaz-environment-editor-v4";
const LIGHTING_STORAGE_KEY = "yaz-environment-lighting-v1";
const FRAME_STORAGE_KEY = "yaz-frame-editor-v3";
const LEGACY_STORAGE_KEY = "yaz-frame-editor-v2";
const DEFAULT_LAMP_LIGHT_MIGRATION_KEY = "yaz-default-lamp-light-added-v1";
const DEFAULT_LAMP_HITBOX_MIGRATION_KEY = "yaz-default-lamp-hitbox-added-v1";
const CAPTION_FONT_STORAGE_KEY = "yaz-caption-font-v1";
const CAPTION_PLACEMENT_STORAGE_KEY = "yaz-caption-placement-v1";
const MODEL_FLOOR_Y = -2.88;
const OBJECT_ROTATION_LIMIT = Math.PI;
const ENVIRONMENT_WIDTH = 18;
const WALL_PANEL_SPACING = 0.55;
const WALL_HEIGHT = 6.85;
const WALL_TEXTURE_PATH = "/textures/plaster_wall.webp";
const SHOW_WALL_PANEL_SEAMS = false;
const FLOOR_COLOR_PATH = "/textures/floor/floor_color.webp";
const FLOOR_NORMAL_PATH = "/textures/floor/floor_normal.webp";
const FLOOR_ROUGHNESS_PATH = "/textures/floor/floor_roughness.webp";
const BASEBOARD_MODEL_PATH = "/3d-models/beaded_baseboard_4_plaster_texture.glb";
// One texture tile covers this many world units. Smaller value = planks repeat
// more often. The Poly Haven "old_wooden_floor_03" image shows roughly a 1 m
// patch with a few planks running along U.
const FLOOR_TILE_METERS = 1.4;
const WALL_BOTTOM_Y = -2.62;
const WALL_CENTER_Y = WALL_BOTTOM_Y + WALL_HEIGHT / 2;
const ROOM_SURFACE_DEPTH = 4.95;
const ROOM_SURFACE_Z = 2.36;
const ROOM_SURFACE_THICKNESS = 0.18;
const FLOOR_CENTER_Y = -2.55;
const FLOOR_TOP_Y = FLOOR_CENTER_Y + ROOM_SURFACE_THICKNESS / 2;
const WALL_DEPTH = 0.16;
const WALL_Z = -0.14;
const WALL_FRONT_Z = WALL_Z + WALL_DEPTH / 2;
const BASEBOARD_HEIGHT = 0.16;
const BASEBOARD_BOTTOM_Y = FLOOR_TOP_Y + 0.012;
const BASEBOARD_WIDTH_OVERHANG = 0.8;
const BASEBOARD_WALL_OFFSET = 0.006;
const LAMP_TOGGLE_ZONE_NAME = "lamp-toggle-zone";
const LAMP_TOGGLE_ZONE_LOCAL_POSITION: VectorTuple = [0, 0.68, 0];
const LAMP_TOGGLE_ZONE_LOCAL_SIZE: VectorTuple = [0.34, 0.64, 0.34];
const DESKTOP_CAMERA_DISTANCE = 6.81;
const PHONE_CAMERA_DISTANCE = 11;
const CONSTRAINED_YAW_LIMIT = THREE.MathUtils.degToRad(29.4);

type CaptionFontId = "brik" | "zoom-pro" | "modestia-ultra" | "zafrada" | "puyita";
type CaptionPlacementId = "corner" | "frame";
type FrameHoverInfo = {
  workSlug: string;
};
type CaptionFontOption = {
  id: CaptionFontId;
  label: string;
  fontFamily: string;
  fontWeight: number;
};

const captionFontOptions: CaptionFontOption[] = [
  {
    id: "brik",
    label: "BRIK",
    fontFamily: '"Yaz Brik", Brik, serif',
    fontWeight: 400,
  },
  {
    id: "zoom-pro",
    label: "Zoom Pro",
    fontFamily: '"Yaz Zoom Pro", "Zoom Pro", sans-serif',
    fontWeight: 500,
  },
  {
    id: "modestia-ultra",
    label: "Modestia Ultra",
    fontFamily: '"Yaz Modestia", Modestia, serif',
    fontWeight: 900,
  },
  {
    id: "zafrada",
    label: "Zafrada",
    fontFamily: '"Yaz Zafrada", Zafrada, serif',
    fontWeight: 900,
  },
  {
    id: "puyita",
    label: "Puyita",
    fontFamily: '"Yaz Puyita", Puyita, serif',
    fontWeight: 400,
  },
];

function normalizeCaptionFontId(value: string | null | undefined): CaptionFontId {
  return value === "zoom-pro" ||
    value === "modestia-ultra" ||
    value === "zafrada" ||
    value === "puyita"
    ? value
    : "brik";
}

function normalizeCaptionPlacementId(value: string | null | undefined): CaptionPlacementId {
  return value === "corner" ? "corner" : "frame";
}

const frameModels = [
  "/3d-models/frames/picture_frame_1520_dimensions.glb",
  "/3d-models/frames/standing_picture_frame_01.glb",
  "/3d-models/frames/picture_frame_2.glb",
  "/3d-models/frames/fancy_picture_frame_01-freepoly.org.glb",
  "/3d-models/frames/picture_frame.glb",
  "/3d-models/frames/vintage_picture_frame..glb",
];

const propModels = [
  {
    id: "victorian-bed",
    label: "Victorian bed",
    model: "/3d-models/bed/victorian_bed.glb",
    position: [-1.35, MODEL_FLOOR_Y, 1.82] as VectorTuple,
    rotation: [0, 0.08, 0] as VectorTuple,
    height: 1.28,
  },
  {
    id: "small-end-table",
    label: "Small end table",
    model: "/3d-models/Meshy_AI_small_simple_end_tabl_0510164139_texture.glb",
    position: [1.78, MODEL_FLOOR_Y, 1.18] as VectorTuple,
    rotation: [0, -0.24, 0] as VectorTuple,
    height: 1.02,
  },
  {
    id: "potted-plant",
    label: "Potted plant",
    model: "/3d-models/plants/potted_plant_02_optimized_webp.glb",
    position: [3.15, MODEL_FLOOR_Y, 0.72] as VectorTuple,
    rotation: [0, -0.2, 0] as VectorTuple,
    height: 1.35,
  },
];

const deprecatedPropModelIds = new Set(["table-lamp"]);
const requiredDefaultPropModelIds = new Set(["victorian-bed"]);

const firstSavedComposite = savedComposites[0];
const loadedClockComposite = normalizeClockComposite(savedClockComposite as Partial<ClockCompositeConfig>);
const clockComposite: ClockCompositeConfig = {
  ...loadedClockComposite,
  model: safeAssetPath(loadedClockComposite.model, defaultClockComposite.model),
  faceTexture: safeAssetPath(loadedClockComposite.faceTexture, defaultClockComposite.faceTexture),
  hourHandModel: safeAssetPath(loadedClockComposite.hourHandModel, defaultClockComposite.hourHandModel),
  minuteHandModel: safeAssetPath(loadedClockComposite.minuteHandModel, defaultClockComposite.minuteHandModel),
  secondHandModel: safeAssetPath(loadedClockComposite.secondHandModel, defaultClockComposite.secondHandModel),
};

function normalizeFrameModelPath(model: string) {
  if (model.startsWith("/3d-models/frames/")) {
    return model;
  }

  if (model.startsWith("/3d-models/")) {
    return model.replace("/3d-models/", "/3d-models/frames/");
  }

  return frameModels[1];
}

function safeAssetPath(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function isSceneObjectVisible(setting: Partial<BaseObjectSetting>) {
  return setting.visible !== false;
}

function normalizeMaskShape(maskShape: string | undefined): MaskShape {
  return maskShape === "oval" || maskShape === "circle" ? "oval" : "rectangle";
}

function frameIdFromIndex(index: number) {
  return `frame-${String(index + 1).padStart(2, "0")}`;
}

function createFrameSetting(index: number, seed?: Partial<FrameSetting>): FrameSetting {
  const work = works[index % Math.max(works.length, 1)];
  const defaultPositions: FrameSetting["position"][] = [
    [-0.9, 0.42, 0],
    [0.95, 0.12, 0],
    [-2.2, -0.35, 0],
    [2.25, 0.58, 0],
  ];

  return {
    id: seed?.id ?? frameIdFromIndex(index),
    kind: "frame",
    label: seed?.label ?? `Video frame ${index + 1}`,
    visible: seed?.visible ?? true,
    model: normalizeFrameModelPath(seed?.model ?? firstSavedComposite?.model ?? frameModels[1]),
    workSlug: seed?.workSlug ?? work?.slug ?? firstSavedComposite?.workSlug ?? "",
    maskShape: normalizeMaskShape(seed?.maskShape ?? firstSavedComposite?.maskShape),
    position: seed?.position ?? defaultPositions[index % defaultPositions.length],
    width: seed?.width ?? firstSavedComposite?.frameWidth ?? 1.6,
    height: seed?.height ?? firstSavedComposite?.frameHeight ?? 2,
    frameRotationX: seed?.frameRotationX ?? firstSavedComposite?.frameRotationX ?? 0,
    frameRotationY: seed?.frameRotationY ?? firstSavedComposite?.frameRotationY ?? 0,
    frameRotationZ: seed?.frameRotationZ ?? firstSavedComposite?.frameRotationZ ?? 0,
    rotation: seed?.rotation ?? [0, index % 2 === 0 ? 0.035 : -0.025, index % 2 === 0 ? 0.015 : -0.02],
    wallScale: seed?.wallScale ?? (index === 0 ? 1 : 0.86),
    clipX: seed?.clipX ?? firstSavedComposite?.videoX ?? 0,
    clipY: seed?.clipY ?? firstSavedComposite?.videoY ?? 0,
    clipZ: seed?.clipZ ?? firstSavedComposite?.videoZ ?? 0.09,
    clipWidth: seed?.clipWidth ?? firstSavedComposite?.videoWidth ?? 1.2,
    clipHeight: seed?.clipHeight ?? firstSavedComposite?.videoHeight ?? 0.675,
    videoScale: seed?.videoScale ?? firstSavedComposite?.videoZoom ?? 1.25,
    videoOffsetX: clampCropAmount(seed?.videoOffsetX ?? firstSavedComposite?.cropX ?? 0),
    videoOffsetY: clampCropAmount(seed?.videoOffsetY ?? firstSavedComposite?.cropY ?? 0),
    captionOffsetX: formatNumber(
      THREE.MathUtils.clamp(seed?.captionOffsetX ?? 0, -1.5, 1.5),
    ),
    captionOffsetY: formatNumber(
      THREE.MathUtils.clamp(seed?.captionOffsetY ?? -0.18, -2, 0.6),
    ),
    captionOffsetZ: formatNumber(
      THREE.MathUtils.clamp(seed?.captionOffsetZ ?? 0.018, -0.05, 0.2),
    ),
    captionScale: formatNumber(
      THREE.MathUtils.clamp(seed?.captionScale ?? 1, 0.35, 2.5),
    ),
  };
}

function createModelSetting(catalogId: string, seed?: Partial<ModelSetting>): ModelSetting {
  const catalogItem = propModels.find((item) => item.id === catalogId) ?? propModels[0];

  return {
    id: seed?.id ?? `${catalogItem.id}-${Date.now().toString(36)}`,
    kind: "model",
    catalogId: catalogItem.id,
    label: seed?.label ?? catalogItem.label,
    visible: seed?.visible ?? true,
    model: seed?.model ?? catalogItem.model,
    position: seed?.position ?? catalogItem.position,
    rotation: seed?.rotation ?? catalogItem.rotation,
    wallScale: seed?.wallScale ?? catalogItem.height,
  };
}

function createClockSetting(seed?: Partial<ClockSetting>): ClockSetting {
  return {
    id: seed?.id ?? `clock-${Date.now().toString(36)}`,
    kind: "clock",
    label: seed?.label ?? "Vintage clock",
    visible: seed?.visible ?? true,
    position: seed?.position ?? [-2.82, 0.78, 0.03],
    rotation: seed?.rotation ?? [0, 0.03, -0.015],
    wallScale: seed?.wallScale ?? 0.82,
  };
}

function createLightSetting(seed?: Partial<LightSetting>): LightSetting {
  return {
    id: seed?.id ?? `light-${Date.now().toString(36)}`,
    kind: "light",
    label: seed?.label ?? "Light source",
    visible: seed?.visible ?? true,
    position: seed?.position ?? [1.78, -1.55, 1.18],
    rotation: seed?.rotation ?? [0, 0, 0],
    wallScale: seed?.wallScale ?? 0.12,
    color: seed?.color ?? "#ffd08a",
    intensity: seed?.intensity ?? 5.5,
    distance: seed?.distance ?? 3.2,
    decay: seed?.decay ?? 1.8,
    enabled: seed?.enabled ?? true,
  };
}

function lampHitboxPlacementFromModel(setting: ModelSetting) {
  const offset = new THREE.Vector3(...LAMP_TOGGLE_ZONE_LOCAL_POSITION);
  offset.multiplyScalar(setting.wallScale);
  offset.applyEuler(new THREE.Euler(...setting.rotation));

  return {
    position: [
      formatNumber(setting.position[0] + offset.x),
      formatNumber(setting.position[1] + offset.y),
      formatNumber(setting.position[2] + offset.z),
    ] as VectorTuple,
    rotation: setting.rotation,
    wallScale: setting.wallScale,
  };
}

function createHitboxSetting(seed?: Partial<HitboxSetting>): HitboxSetting {
  const fallbackTable = createModelSetting("small-end-table", {
    id: "prop-small-end-table",
  });
  const fallbackPlacement = lampHitboxPlacementFromModel(fallbackTable);

  return {
    id: seed?.id ?? `hitbox-${Date.now().toString(36)}`,
    kind: "hitbox",
    label: seed?.label ?? "Lamp click zone",
    visible: seed?.visible ?? true,
    position: seed?.position ?? fallbackPlacement.position,
    rotation: seed?.rotation ?? fallbackPlacement.rotation,
    wallScale: seed?.wallScale ?? fallbackPlacement.wallScale,
    action: seed?.action ?? "toggle-nearest-light",
  };
}

const defaultSceneSettings = [
  createFrameSetting(0),
  createFrameSetting(1),
  createModelSetting("victorian-bed", {
    id: "prop-victorian-bed",
  }),
  createModelSetting("small-end-table", {
    id: "prop-small-end-table",
  }),
  createLightSetting({
    id: "light-table-lamp",
    label: "Lamp light source",
  }),
  createHitboxSetting({
    id: "hitbox-lamp-toggle",
  }),
  createClockSetting({
    id: "clock-vintage-wall",
  }),
] satisfies SceneObjectSetting[];

const defaultSceneLighting: SceneLighting = {
  ambientColor: "#7f715c",
  ambientIntensity: 0.82,
  keyColor: "#d7a46e",
  keyIntensity: 1.25,
  keyPosition: [-3.8, 4.2, 5.6],
  fillColor: "#485066",
  fillIntensity: 1.1,
  fillPosition: [4.2, 2.1, 3.6],
  exposure: 0.82,
};

function normalizeVectorTuple(
  seed: Partial<VectorTuple> | undefined,
  fallback: VectorTuple,
  min: VectorTuple,
  max: VectorTuple,
): VectorTuple {
  return [0, 1, 2].map((axis) => {
    const value = Number(seed?.[axis]);
    return formatNumber(
      THREE.MathUtils.clamp(Number.isFinite(value) ? value : fallback[axis], min[axis], max[axis]),
    );
  }) as VectorTuple;
}

function normalizeSceneLighting(seed?: Partial<SceneLighting>): SceneLighting {
  return {
    ambientColor: seed?.ambientColor ?? defaultSceneLighting.ambientColor,
    ambientIntensity: formatNumber(
      THREE.MathUtils.clamp(seed?.ambientIntensity ?? defaultSceneLighting.ambientIntensity, 0, 3),
    ),
    keyColor: seed?.keyColor ?? defaultSceneLighting.keyColor,
    keyIntensity: formatNumber(
      THREE.MathUtils.clamp(seed?.keyIntensity ?? defaultSceneLighting.keyIntensity, 0, 4),
    ),
    keyPosition: normalizeVectorTuple(seed?.keyPosition, defaultSceneLighting.keyPosition, [-6, -1, -1], [6, 6, 8]),
    fillColor: seed?.fillColor ?? defaultSceneLighting.fillColor,
    fillIntensity: formatNumber(
      THREE.MathUtils.clamp(seed?.fillIntensity ?? defaultSceneLighting.fillIntensity, 0, 6),
    ),
    fillPosition: normalizeVectorTuple(seed?.fillPosition, defaultSceneLighting.fillPosition, [-6, -1, -1], [6, 6, 8]),
    exposure: formatNumber(THREE.MathUtils.clamp(seed?.exposure ?? defaultSceneLighting.exposure, 0.35, 1.6)),
  };
}

function makeMaterial<T extends THREE.Material>(material: T, disposables: THREE.Material[]) {
  disposables.push(material);
  return material;
}

function makeGeometry<T extends THREE.BufferGeometry>(
  geometry: T,
  disposables: THREE.BufferGeometry[],
) {
  disposables.push(geometry);
  return geometry;
}

function visibleSize(setting: FrameSetting) {
  const cropX = clampCropAmount(setting.videoOffsetX);
  const cropY = clampCropAmount(setting.videoOffsetY);

  if (setting.clipWidth && setting.clipHeight) {
    const width = Math.max(0.04, setting.clipWidth * (1 - cropX * 2));
    const height = Math.max(0.04, setting.clipHeight * (1 - cropY * 2));

    return { width, height };
  }

  const inset = Math.min(setting.width, setting.height) * 0.32;
  const width = Math.max(0.08, setting.width - inset);
  const height = Math.max(0.08, setting.height - inset);

  return { width, height };
}

function createVideoTexture(
  clipSrc: string,
  options: { loop?: boolean },
  textures: THREE.Texture[],
  videos: HTMLVideoElement[],
  onSceneError: (error: Error) => void,
) {
  const video = document.createElement("video");
  video.src = clipSrc;
  video.muted = true;
  video.loop = options.loop ?? false;
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";
  video.addEventListener("error", () => {
    const message = video.error?.message || `Video failed to load: ${clipSrc}`;
    onSceneError(new Error(message));
  });

  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  // We deliberately do NOT call play() here. `preload="auto"` causes the
  // browser to load + decode the first frame on its own, and VideoTexture
  // uploads that frame to the GPU as soon as it's available — even with
  // autoplay blocked. createFrame() decides whether a given video should
  // ever play (motion clip) or stay frozen (still poster clip).
  videos.push(video);
  textures.push(texture);
  return { texture, video };
}

function applyVideoCrop(target: THREE.Texture | THREE.Texture[], setting: FrameSetting) {
  const aperture = visibleSize(setting);
  const repeatX = (aperture.width / setting.clipWidth) / Math.max(1, setting.videoScale);
  const repeatY = (aperture.height / setting.clipHeight) / Math.max(1, setting.videoScale);
  const offsetX = 0.5 - repeatX / 2;
  const offsetY = 0.5 - repeatY / 2;
  const textures = Array.isArray(target) ? target : [target];
  textures.forEach((texture) => {
    texture.repeat.set(repeatX, repeatY);
    texture.offset.set(offsetX, offsetY);
  });
}

function createClipGeometry(
  setting: FrameSetting,
  geometries: THREE.BufferGeometry[],
) {
  const size = visibleSize(setting);

  if (setting.maskShape === "oval") {
    return {
      geometry: makeGeometry(new THREE.CircleGeometry(0.5, 96), geometries),
      scale: new THREE.Vector3(size.width, size.height, 1),
    };
  }

  return {
    geometry: makeGeometry(new THREE.PlaneGeometry(size.width, size.height), geometries),
    scale: new THREE.Vector3(1, 1, 1),
  };
}

function createFrameCaptionTexture(
  text: string,
  font: CaptionFontOption,
  textures: THREE.Texture[],
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create caption canvas.");
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f6f0e5";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const maxWidth = canvas.width - 96;
  let fontSize = 112;
  do {
    ctx.font = `${font.fontWeight} ${fontSize}px ${font.fontFamily}`;
    if (ctx.measureText(text).width <= maxWidth || fontSize <= 54) {
      break;
    }
    fontSize -= 4;
  } while (fontSize > 54);

  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  textures.push(texture);
  return texture;
}

function createFrameCaptionMesh(
  setting: FrameSetting,
  artist: string,
  font: CaptionFontOption,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
  textures: THREE.Texture[],
) {
  const aperture = visibleSize(setting);
  const texture = createFrameCaptionTexture(artist, font, textures);
  const height = THREE.MathUtils.clamp(aperture.height * 0.24, 0.16, 0.34);
  const width = THREE.MathUtils.clamp(height * (1024 / 192), aperture.width * 0.9, setting.width * 1.7);
  const mesh = new THREE.Mesh(
    makeGeometry(new THREE.PlaneGeometry(width, height), geometries),
    makeMaterial(
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
      materials,
    ),
  );

  mesh.position.set(
    setting.clipX + setting.captionOffsetX,
    setting.clipY - aperture.height / 2 + setting.captionOffsetY,
    setting.clipZ + setting.captionOffsetZ,
  );
  mesh.scale.setScalar(setting.captionScale);
  mesh.visible = false;
  mesh.renderOrder = 2;
  mesh.userData.isFrameCaption = true;
  return mesh;
}

function createFrame(
  setting: FrameSetting,
  sourceModel: THREE.Object3D,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
  textures: THREE.Texture[],
  videos: HTMLVideoElement[],
  _selected: boolean,
  captionFont: CaptionFontOption,
  captionPlacement: CaptionPlacementId,
  onSceneError: (error: Error) => void,
) {
  const group = new THREE.Group();
  group.userData.sceneObjectId = setting.id;
  applyObjectPlacement(group, setting);
  const frameRoot = new THREE.Group();
  frameRoot.rotation.set(
    setting.frameRotationX,
    setting.frameRotationY,
    setting.frameRotationZ,
  );
  group.add(frameRoot);

  const frameModel = sourceModel.clone(true);
  const modelBox = new THREE.Box3().setFromObject(frameModel);
  const modelSize = modelBox.getSize(new THREE.Vector3());
  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  const scale = Math.min(setting.width / modelSize.x, setting.height / modelSize.y);

  frameModel.scale.setScalar(scale);
  frameModel.position.set(
    -modelCenter.x * scale,
    -modelCenter.y * scale,
    -modelCenter.z * scale,
  );
  frameModel.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = false;
      object.receiveShadow = false;
    }
  });
  frameRoot.add(frameModel);

  const work = works.find((candidate) => candidate.slug === setting.workSlug) ?? works[0];
  if (!work) {
    throw new Error("No video work clips are configured.");
  }

  const posterTime = Math.max(0, work.posterTime ?? 0);

  // Two independent video elements per frame:
  //   - stillVideo: never plays. Browser preloads the first frame, we seek
  //     to posterTime once metadata loads. Its VideoTexture is the canonical
  //     "still" that the poster mesh always shows.
  //   - motionVideo: plays on hover, pauses + rewinds to posterTime on
  //     mouseout. Its VideoTexture is what fades in over the still.
  //
  // Using two videos (rather than canvas capture from a single video) means
  // the still and motion textures are always independent and always valid,
  // so the crossfade is guaranteed to work regardless of autoplay policy.
  // The browser's HTTP cache means the underlying file is downloaded once.
  const { texture: stillTexture, video: stillVideo } = createVideoTexture(
    work.clipSrc,
    { loop: false },
    textures,
    videos,
    onSceneError,
  );
  const { texture: motionTexture, video: motionVideo } = createVideoTexture(
    work.clipSrc,
    { loop: true },
    textures,
    videos,
    onSceneError,
  );

  applyVideoCrop([stillTexture, motionTexture], setting);

  // Seek the still video to its canonical poster moment. The VideoTexture
  // will reflect the seeked frame as soon as the browser decodes it. For
  // posterTime === 0 the browser's preload already lands on frame 0 so no
  // seek is needed.
  if (posterTime > 0) {
    const seekToPoster = () => {
      try {
        stillVideo.currentTime = posterTime;
      } catch {
        // If metadata isn't quite ready, loadedmetadata will fire again
        // after the next state transition; the user-visible still is the
        // first frame in the meantime which is acceptable.
      }
    };
    if (stillVideo.readyState >= 1) {
      seekToPoster();
    } else {
      stillVideo.addEventListener("loadedmetadata", seekToPoster, { once: true });
    }
  }

  const clipShape = createClipGeometry(setting, geometries);

  const posterMaterial = makeMaterial(
    new THREE.MeshBasicMaterial({
      map: stillTexture,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
    materials,
  );
  const posterMesh = new THREE.Mesh(clipShape.geometry, posterMaterial);
  posterMesh.scale.copy(clipShape.scale);
  posterMesh.position.set(setting.clipX, setting.clipY, setting.clipZ);
  posterMesh.renderOrder = 0;
  group.add(posterMesh);

  const videoMaterial = makeMaterial(
    new THREE.MeshBasicMaterial({
      map: motionTexture,
      toneMapped: false,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
    materials,
  );
  const videoMesh = new THREE.Mesh(clipShape.geometry, videoMaterial);
  videoMesh.scale.copy(clipShape.scale);
  videoMesh.position.set(setting.clipX, setting.clipY, setting.clipZ + 0.0008);
  videoMesh.renderOrder = 1;
  videoMesh.userData.isFrameClip = true;
  videoMesh.userData.video = motionVideo;
  videoMesh.userData.posterTime = posterTime;
  videoMesh.userData.videoMaterial = videoMaterial;
  videoMesh.userData.fadeTarget = 0;
  videoMesh.userData.workSlug = work.slug;
  videoMesh.userData.sceneObjectId = setting.id;
  group.add(videoMesh);

  if (captionPlacement === "frame") {
    const captionMesh = createFrameCaptionMesh(
      setting,
      work.artist,
      captionFont,
      geometries,
      materials,
      textures,
    );
    videoMesh.userData.captionMesh = captionMesh;
    group.add(captionMesh);
  }

  return group;
}

function createHitboxObject(
  setting: HitboxSetting,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
) {
  const group = new THREE.Group();
  applyObjectPlacement(group, setting);

  const hitZone = new THREE.Mesh(
    makeGeometry(new THREE.BoxGeometry(...LAMP_TOGGLE_ZONE_LOCAL_SIZE), geometries),
    makeMaterial(
      new THREE.MeshBasicMaterial({
        color: "#67e8f9",
        depthWrite: false,
        opacity: 0,
        transparent: true,
        wireframe: true,
      }),
      materials,
    ),
  );
  hitZone.name = LAMP_TOGGLE_ZONE_NAME;
  hitZone.castShadow = false;
  hitZone.receiveShadow = false;
  hitZone.renderOrder = 20;
  hitZone.userData.isLampToggleZone = setting.action === "toggle-nearest-light";
  group.add(hitZone);

  return group;
}

function createModelObject(
  setting: ModelSetting,
  sourceModel: THREE.Object3D,
) {
  const group = new THREE.Group();
  applyObjectPlacement(group, setting);

  const model = sourceModel.clone(true);
  const modelBox = new THREE.Box3().setFromObject(model);
  const modelSize = modelBox.getSize(new THREE.Vector3());
  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  const normalizingScale = modelSize.y > 0 ? 1 / modelSize.y : 1;

  model.position.set(-modelCenter.x, -modelBox.min.y, -modelCenter.z);
  model.scale.setScalar(normalizingScale);
  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  group.add(model);

  return group;
}

function createLightObject(
  setting: LightSetting,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
) {
  const group = new THREE.Group();
  applyLightPlacement(group, setting);

  const color = new THREE.Color(setting.color);
  const light = new THREE.PointLight(
    color,
    setting.enabled ? setting.intensity : 0,
    setting.distance,
    setting.decay,
  );
  light.name = "editable-point-light";
  configurePointLightShadow(light);
  group.add(light);

  const markerMaterial = makeMaterial(
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: setting.enabled ? 0.94 : 0.28,
    }),
    materials,
  );
  const marker = new THREE.Mesh(
    makeGeometry(new THREE.SphereGeometry(0.5, 24, 16), geometries),
    markerMaterial,
  );
  marker.name = "editable-light-marker";
  marker.scale.setScalar(setting.wallScale);
  marker.castShadow = false;
  marker.receiveShadow = false;
  group.add(marker);

  const haloMaterial = makeMaterial(
    new THREE.MeshBasicMaterial({
      color,
      opacity: setting.enabled ? 0.18 : 0.08,
      transparent: true,
      depthWrite: false,
    }),
    materials,
  );
  const halo = new THREE.Mesh(
    makeGeometry(new THREE.SphereGeometry(1.12, 24, 16), geometries),
    haloMaterial,
  );
  halo.name = "editable-light-halo";
  halo.scale.setScalar(setting.wallScale);
  halo.castShadow = false;
  halo.receiveShadow = false;
  group.add(halo);

  return group;
}

function prepareStaticModel(model: THREE.Object3D) {
  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = false;
      object.receiveShadow = false;
    }
  });
}

function createPlasterWallTexture(
  sourceTexture: THREE.Texture,
  maxAnisotropy: number,
  textures: THREE.Texture[],
) {
  const sourceImage = sourceTexture.image as HTMLImageElement;
  const sourceWidth = sourceImage.naturalWidth || sourceImage.width;
  const sourceHeight = sourceImage.naturalHeight || sourceImage.height;
  if (!sourceWidth || !sourceHeight) {
    return sourceTexture;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = Math.round(canvas.width / (ENVIRONMENT_WIDTH / WALL_HEIGHT));
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return sourceTexture;
  }

  let seed = 1937;
  const random = () => {
    seed = (seed * 48271) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  const drawSourceCover = (
    targetCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    zoom = 1,
    alignX = 0.5,
    alignY = 0.5,
  ) => {
    const scale = Math.max(width / sourceWidth, height / sourceHeight) * zoom;
    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    targetCtx.drawImage(
      sourceImage,
      (width - drawWidth) * alignX,
      (height - drawHeight) * alignY,
      drawWidth,
      drawHeight,
    );
  };

  const tileHeight = canvas.height;
  const tileWidth = Math.ceil(tileHeight * (sourceWidth / sourceHeight));
  const overlapWidth = Math.round(tileWidth * 0.42);
  const tileStep = tileWidth - overlapWidth;

  const makeTile = () => {
    const tileCanvas = document.createElement("canvas");
    tileCanvas.width = tileWidth;
    tileCanvas.height = tileHeight;
    const tileCtx = tileCanvas.getContext("2d");
    if (!tileCtx) {
      return null;
    }

    drawSourceCover(tileCtx, tileCanvas.width, tileCanvas.height);

    return tileCanvas;
  };

  const drawFeatheredTile = (tileCanvas: HTMLCanvasElement, x: number, fadeLeft: boolean) => {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = tileCanvas.width;
    tempCanvas.height = tileCanvas.height;
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) {
      return;
    }

    tempCtx.drawImage(tileCanvas, 0, 0);
    if (fadeLeft) {
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = tempCanvas.width;
      maskCanvas.height = tempCanvas.height;
      const maskCtx = maskCanvas.getContext("2d");
      if (!maskCtx) {
        return;
      }

      tempCtx.globalCompositeOperation = "destination-in";
      const mask = maskCtx.createLinearGradient(0, 0, overlapWidth, 0);
      mask.addColorStop(0, "rgba(0, 0, 0, 0)");
      mask.addColorStop(1, "rgba(0, 0, 0, 1)");
      maskCtx.fillStyle = mask;
      maskCtx.fillRect(0, 0, overlapWidth, maskCanvas.height);
      maskCtx.fillStyle = "black";
      maskCtx.fillRect(overlapWidth, 0, maskCanvas.width - overlapWidth, maskCanvas.height);
      tempCtx.drawImage(maskCanvas, 0, 0);
    }

    ctx.drawImage(tempCanvas, x, 0);
  };

  ctx.fillStyle = "#bfb39b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let x = 0, index = 0; x < canvas.width; x += tileStep, index += 1) {
    const tile = makeTile();
    if (tile) {
      drawFeatheredTile(tile, Math.round(x), index > 0);
    }
  }

  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.025;
  for (let wash = 0; wash < 28; wash += 1) {
    const gradient = ctx.createRadialGradient(
      random() * canvas.width,
      random() * canvas.height,
      0,
      random() * canvas.width,
      random() * canvas.height,
      180 + random() * 520,
    );
    gradient.addColorStop(0, random() > 0.5 ? "#8d826e" : "#d0c4ab");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;

  ctx.globalAlpha = 0.35;
  const topFade = ctx.createLinearGradient(0, 0, 0, canvas.height);
  topFade.addColorStop(0, "rgba(115, 97, 70, 0.2)");
  topFade.addColorStop(0.25, "rgba(255, 255, 255, 0)");
  topFade.addColorStop(0.76, "rgba(255, 255, 255, 0)");
  topFade.addColorStop(1, "rgba(83, 69, 48, 0.15)");
  ctx.fillStyle = topFade;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;

  sourceTexture.dispose();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textures.push(texture);
  return texture;
}

function collectMaterialTextures(material: THREE.Material, textures: THREE.Texture[]) {
  const materialRecord = material as unknown as Record<string, unknown>;
  ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"].forEach((key) => {
    const texture = materialRecord[key];
    if (texture instanceof THREE.Texture && !textures.includes(texture)) {
      textures.push(texture);
    }
  });
}

function prepareBaseboardMaterial(
  sourceMaterial: THREE.Material | THREE.Material[],
  materials: THREE.Material[],
  textures: THREE.Texture[],
  maxAnisotropy: number,
) {
  const source = Array.isArray(sourceMaterial) ? sourceMaterial[0] : sourceMaterial;
  if (!(source instanceof THREE.MeshStandardMaterial)) {
    throw new Error("Baseboard mesh is missing a standard material.");
  }
  if (!source.map) {
    throw new Error("Baseboard material is missing a color texture.");
  }

  const material = source.clone();
  material.name = "baseboard-plaster-finish";
  material.map = source.map;
  material.map.colorSpace = THREE.SRGBColorSpace;
  material.map.anisotropy = maxAnisotropy;
  material.side = THREE.DoubleSide;
  material.color.set("#ffffff");
  material.metalness = 0;
  material.roughness = 0.94;
  material.emissive.set("#000000");
  material.emissiveIntensity = 0;
  material.normalScale.set(0.14, 0.14);
  collectMaterialTextures(material, textures);
  materials.push(material);
  return material;
}

function createBeadedBaseboard(
  sourceModel: THREE.Object3D,
  materials: THREE.Material[],
  textures: THREE.Texture[],
  maxAnisotropy: number,
) {
  const source = sourceModel.clone(true);
  let meshCount = 0;
  source.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      meshCount += 1;
      object.material = prepareBaseboardMaterial(object.material, materials, textures, maxAnisotropy);
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  if (meshCount === 0) {
    throw new Error("Baseboard model did not contain any meshes.");
  }

  const sourceBox = new THREE.Box3().setFromObject(source);
  const sourceSize = sourceBox.getSize(new THREE.Vector3());
  if (sourceSize.x <= 0 || sourceSize.y <= 0 || sourceSize.z <= 0) {
    throw new Error("Baseboard model has invalid dimensions.");
  }

  const sourceCenter = sourceBox.getCenter(new THREE.Vector3());
  source.position.set(-sourceCenter.x, -sourceBox.min.y, -sourceBox.min.z);

  const template = new THREE.Group();
  template.add(source);

  const profileScale = BASEBOARD_HEIGHT / sourceSize.y;
  const runWidth = ENVIRONMENT_WIDTH + BASEBOARD_WIDTH_OVERHANG;

  const group = new THREE.Group();
  group.name = "room-beaded-baseboard";

  template.scale.set(runWidth / sourceSize.x, profileScale, profileScale);
  template.position.set(0, BASEBOARD_BOTTOM_Y, WALL_FRONT_Z + BASEBOARD_WALL_OFFSET);
  group.add(template);

  return group;
}

function createClockObject(
  setting: ClockSetting,
  sourceModels: Map<string, THREE.Object3D>,
  faceTexture: THREE.Texture,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
) {
  const group = new THREE.Group();
  group.name = "editable-live-clock";
  applyObjectPlacement(group, setting);

  const modelSource = sourceModels.get(clockComposite.model);
  const hourSource = sourceModels.get(clockComposite.hourHandModel);
  const minuteSource = sourceModels.get(clockComposite.minuteHandModel);
  const secondSource = sourceModels.get(clockComposite.secondHandModel);
  if (!modelSource || !hourSource || !minuteSource || !secondSource) {
    throw new Error("Clock model assets did not load.");
  }

  const model = modelSource.clone(true);
  const modelBox = new THREE.Box3().setFromObject(model);
  const modelSize = modelBox.getSize(new THREE.Vector3());
  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  const modelScale = modelSize.y > 0 ? clockComposite.clockHeight / modelSize.y : 1;
  model.name = "live-clock-case";
  model.position.set(
    clockComposite.modelX - modelCenter.x,
    clockComposite.modelY - modelCenter.y,
    clockComposite.modelZ - modelCenter.z,
  );
  model.scale.setScalar(modelScale);
  model.rotation.x = clockComposite.modelRotationX;
  prepareStaticModel(model);
  group.add(model);

  const faceMaterial = makeMaterial(
    new THREE.MeshBasicMaterial({
      map: faceTexture,
      transparent: true,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
    materials,
  );
  const face = new THREE.Mesh(
    makeGeometry(new THREE.CircleGeometry(0.5, 128), geometries),
    faceMaterial,
  );
  face.name = "live-clock-face";
  face.position.set(clockComposite.faceX, clockComposite.faceY, clockComposite.faceZ);
  face.scale.setScalar(clockComposite.faceSize);
  face.rotation.z = clockComposite.faceRotation;
  group.add(face);

  const handsRoot = new THREE.Group();
  handsRoot.name = "live-clock-hands-root";
  handsRoot.position.set(clockComposite.handX, clockComposite.handY, clockComposite.handZ);
  group.add(handsRoot);

  const hourHand = hourSource.clone(true);
  hourHand.name = "live-clock-hour-hand";
  hourHand.scale.setScalar(clockComposite.hourScale);
  hourHand.visible = clockComposite.showHourHand;
  prepareStaticModel(hourHand);
  handsRoot.add(hourHand);

  const minuteHand = minuteSource.clone(true);
  minuteHand.name = "live-clock-minute-hand";
  minuteHand.scale.setScalar(clockComposite.minuteScale);
  minuteHand.visible = clockComposite.showMinuteHand;
  prepareStaticModel(minuteHand);
  handsRoot.add(minuteHand);

  const secondHand = secondSource.clone(true);
  secondHand.name = "live-clock-second-hand";
  secondHand.scale.setScalar(clockComposite.secondScale);
  secondHand.visible = clockComposite.showSecondHand;
  prepareStaticModel(secondHand);
  handsRoot.add(secondHand);

  syncClockHands(group);
  return group;
}

function applyObjectPlacement(group: THREE.Group, setting: SceneObjectSetting) {
  group.visible = isSceneObjectVisible(setting);
  group.position.set(...setting.position);
  group.rotation.set(...setting.rotation);
  group.scale.setScalar(setting.wallScale);
}

function applyLightPlacement(group: THREE.Group, setting: LightSetting) {
  group.visible = isSceneObjectVisible(setting);
  group.position.set(...setting.position);
  group.rotation.set(...setting.rotation);
  group.scale.setScalar(1);
}

function configurePointLightShadow(light: THREE.PointLight) {
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.camera.near = 0.02;
  light.shadow.camera.far = Math.max(light.distance || 0, 8);
  light.shadow.bias = -0.0005;
  light.shadow.normalBias = 0.02;
  light.shadow.camera.updateProjectionMatrix();
}

function syncLightObject(group: THREE.Group, setting: LightSetting) {
  const color = new THREE.Color(setting.color);
  const light = group.getObjectByName("editable-point-light");
  if (light instanceof THREE.PointLight) {
    light.color.copy(color);
    light.intensity = setting.enabled ? setting.intensity : 0;
    light.distance = setting.distance;
    light.decay = setting.decay;
    configurePointLightShadow(light);
  }

  const marker = group.getObjectByName("editable-light-marker");
  if (marker instanceof THREE.Mesh && marker.material instanceof THREE.MeshBasicMaterial) {
    marker.material.color.copy(color);
    marker.material.opacity = setting.enabled ? 0.94 : 0.28;
    marker.material.needsUpdate = true;
    marker.scale.setScalar(setting.wallScale);
  }

  const halo = group.getObjectByName("editable-light-halo");
  if (halo instanceof THREE.Mesh && halo.material instanceof THREE.MeshBasicMaterial) {
    halo.material.color.copy(color);
    halo.material.opacity = setting.enabled ? 0.18 : 0.08;
    halo.material.needsUpdate = true;
    halo.scale.setScalar(setting.wallScale);
  }
}

function syncSceneObject(group: THREE.Group, setting: SceneObjectSetting) {
  if (setting.kind === "light") {
    applyLightPlacement(group, setting);
    syncLightObject(group, setting);
    return;
  }

  applyObjectPlacement(group, setting);

  if (setting.kind === "frame") {
    const aperture = visibleSize(setting);
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !child.userData?.isFrameCaption) {
        return;
      }
      child.position.set(
        setting.clipX + setting.captionOffsetX,
        setting.clipY - aperture.height / 2 + setting.captionOffsetY,
        setting.clipZ + setting.captionOffsetZ,
      );
      child.scale.setScalar(setting.captionScale);
    });
  }
}

function syncClockHands(group: THREE.Object3D) {
  const angles = clockHandAngles();
  const hourHand = group.getObjectByName("live-clock-hour-hand");
  const minuteHand = group.getObjectByName("live-clock-minute-hand");
  const secondHand = group.getObjectByName("live-clock-second-hand");

  if (hourHand) {
    hourHand.rotation.z = angles.hour + clockComposite.hourRotationOffset;
  }
  if (minuteHand) {
    minuteHand.rotation.z = angles.minute + clockComposite.minuteRotationOffset;
  }
  if (secondHand) {
    secondHand.rotation.z = angles.second + clockComposite.secondRotationOffset;
  }
}

async function loadSceneModels(settings: SceneObjectSetting[]) {
  const loader = new GLTFLoader();
  const objectModels = settings.flatMap((setting) => {
    if (setting.kind === "frame" || setting.kind === "model") {
      return [safeAssetPath(setting.model, "")];
    }

    if (setting.kind === "clock") {
      return [
        clockComposite.model,
        clockComposite.hourHandModel,
        clockComposite.minuteHandModel,
        clockComposite.secondHandModel,
      ];
    }

    return [];
  });
  const uniqueModels = Array.from(
    new Set(objectModels.filter((model) => typeof model === "string" && model.length > 0)),
  );
  const loadedModels = await Promise.all(
    uniqueModels.map(async (model) => {
      const gltf = await loader.loadAsync(model);
      return [model, gltf.scene] as const;
    }),
  );

  return new Map(loadedModels);
}

export type CameraInfo = {
  distance: number;
  panX: number;
  panY: number;
  yaw: number;
  pitch: number;
  fov: number;
};

function ThreeWallCanvas({
  settings,
  lighting,
  showSceneLightMarkers,
  showHitboxHelpers,
  activeCaptionFrameId,
  resetSignal,
  freeOrbit,
  captionFont,
  captionPlacement,
  onSceneError,
  onCameraInfoChange,
  onFrameClick,
  onFrameHover,
  onLampToggle,
}: {
  settings: SceneObjectSetting[];
  lighting: SceneLighting;
  showSceneLightMarkers: boolean;
  showHitboxHelpers: boolean;
  activeCaptionFrameId?: string | null;
  resetSignal: number;
  freeOrbit: boolean;
  captionFont: CaptionFontOption;
  captionPlacement: CaptionPlacementId;
  onSceneError: (error: Error) => void;
  onCameraInfoChange?: (info: CameraInfo) => void;
  onFrameClick?: (workSlug: string) => void;
  onFrameHover?: (info: FrameHoverInfo | null) => void;
  onLampToggle?: (position: VectorTuple) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef(settings);
  const lightingRef = useRef(lighting);
  const showSceneLightMarkersRef = useRef(showSceneLightMarkers);
  const showHitboxHelpersRef = useRef(showHitboxHelpers);
  const activeCaptionFrameIdRef = useRef(activeCaptionFrameId ?? null);
  const syncLightingRef = useRef<(() => void) | null>(null);
  const syncHitboxHelpersRef = useRef<(() => void) | null>(null);
  const syncFrameCaptionVisibilityRef = useRef<(() => void) | null>(null);
  const syncOrbitModeRef = useRef<((enabled: boolean) => void) | null>(null);
  const freeOrbitRef = useRef(freeOrbit);
  const sceneObjectsRef = useRef<THREE.Group[]>([]);
  const cameraInfoCallbackRef = useRef(onCameraInfoChange);
  const frameClickCallbackRef = useRef(onFrameClick);
  const frameHoverCallbackRef = useRef(onFrameHover);
  const lampToggleCallbackRef = useRef(onLampToggle);

  useEffect(() => {
    cameraInfoCallbackRef.current = onCameraInfoChange;
  }, [onCameraInfoChange]);

  useEffect(() => {
    frameClickCallbackRef.current = onFrameClick;
  }, [onFrameClick]);

  useEffect(() => {
    frameHoverCallbackRef.current = onFrameHover;
  }, [onFrameHover]);

  useEffect(() => {
    lampToggleCallbackRef.current = onLampToggle;
  }, [onLampToggle]);

  useEffect(() => {
    settingsRef.current = settings;
    sceneObjectsRef.current.forEach((group, index) => {
      const setting = settings[index];
      if (setting) {
        syncSceneObject(group, setting);
      }
    });
    syncHitboxHelpersRef.current?.();
    syncFrameCaptionVisibilityRef.current?.();
  }, [settings]);

  useEffect(() => {
    lightingRef.current = normalizeSceneLighting(lighting);
    syncLightingRef.current?.();
  }, [lighting]);

  useEffect(() => {
    showSceneLightMarkersRef.current = showSceneLightMarkers;
    syncLightingRef.current?.();
    syncFrameCaptionVisibilityRef.current?.();
  }, [showSceneLightMarkers]);

  useEffect(() => {
    showHitboxHelpersRef.current = showHitboxHelpers;
    syncHitboxHelpersRef.current?.();
  }, [showHitboxHelpers]);

  useEffect(() => {
    activeCaptionFrameIdRef.current = activeCaptionFrameId ?? null;
    syncFrameCaptionVisibilityRef.current?.();
  }, [activeCaptionFrameId]);

  useEffect(() => {
    freeOrbitRef.current = freeOrbit;
    syncOrbitModeRef.current?.(freeOrbit);
  }, [freeOrbit]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      throw new Error("Three.js host element was not mounted.");
    }

    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    const videos: HTMLVideoElement[] = [];
    const clockFaceTexture = new THREE.TextureLoader().load(clockComposite.faceTexture);
    clockFaceTexture.colorSpace = THREE.SRGBColorSpace;
    textures.push(clockFaceTexture);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setClearColor("#15130f", 1);
    renderer.domElement.className = "block h-full w-full";
    renderer.domElement.setAttribute("aria-label", "Interactive 3D picture frame wall");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    const root = new THREE.Group();
    scene.add(root);

    const ambientLight = new THREE.AmbientLight(defaultSceneLighting.ambientColor, 1);
    scene.add(ambientLight);

    const keyLight = new THREE.PointLight(defaultSceneLighting.keyColor, 1, 0, 0);
    keyLight.position.set(...defaultSceneLighting.keyPosition);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 18;
    keyLight.shadow.bias = -0.0008;
    root.add(keyLight);

    const fillLight = new THREE.PointLight(defaultSceneLighting.fillColor, 1, 12);
    fillLight.position.set(...defaultSceneLighting.fillPosition);
    fillLight.castShadow = false;
    root.add(fillLight);

    const sceneLightMarkers = new THREE.Group();
    sceneLightMarkers.name = "scene-light-markers";
    const keyMarkerMaterial = makeMaterial(
      new THREE.MeshBasicMaterial({
        color: defaultSceneLighting.keyColor,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
      materials,
    );
    const keyMarker = new THREE.Mesh(
      makeGeometry(new THREE.SphereGeometry(0.12, 24, 16), geometries),
      keyMarkerMaterial,
    );
    sceneLightMarkers.add(keyMarker);

    const fillMarkerMaterial = makeMaterial(
      new THREE.MeshBasicMaterial({
        color: defaultSceneLighting.fillColor,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      }),
      materials,
    );
    const fillMarker = new THREE.Mesh(
      makeGeometry(new THREE.SphereGeometry(0.1, 24, 16), geometries),
      fillMarkerMaterial,
    );
    sceneLightMarkers.add(fillMarker);
    root.add(sceneLightMarkers);

    const syncSceneLighting = () => {
      const currentLighting = normalizeSceneLighting(lightingRef.current);
      lightingRef.current = currentLighting;
      ambientLight.color.set(currentLighting.ambientColor);
      ambientLight.intensity = currentLighting.ambientIntensity;
      keyLight.color.set(currentLighting.keyColor);
      keyLight.intensity = currentLighting.keyIntensity;
      keyLight.position.set(...currentLighting.keyPosition);
      fillLight.color.set(currentLighting.fillColor);
      fillLight.intensity = currentLighting.fillIntensity;
      fillLight.position.set(...currentLighting.fillPosition);
      keyMarker.position.set(...currentLighting.keyPosition);
      keyMarkerMaterial.color.set(currentLighting.keyColor);
      fillMarker.position.set(...currentLighting.fillPosition);
      fillMarkerMaterial.color.set(currentLighting.fillColor);
      sceneLightMarkers.visible = showSceneLightMarkersRef.current;
      renderer.toneMappingExposure = currentLighting.exposure;
    };

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    syncLightingRef.current = syncSceneLighting;
    syncSceneLighting();

    const wallMaterial = makeMaterial(
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 0.92,
        metalness: 0.01,
      }),
      materials,
    );
    const wall = new THREE.Mesh(
      makeGeometry(new THREE.BoxGeometry(ENVIRONMENT_WIDTH, WALL_HEIGHT, WALL_DEPTH), geometries),
      wallMaterial,
    );
    wall.position.set(0, WALL_CENTER_Y, WALL_Z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    root.add(wall);

    new THREE.TextureLoader().load(
      WALL_TEXTURE_PATH,
      (wallTexture) => {
        if (disposed) {
          wallTexture.dispose();
          return;
        }
        wallTexture.colorSpace = THREE.SRGBColorSpace;
        const preparedWallTexture = createPlasterWallTexture(
          wallTexture,
          renderer.capabilities.getMaxAnisotropy(),
          textures,
        );
        wallMaterial.map = preparedWallTexture;
        wallMaterial.needsUpdate = true;
      },
      undefined,
      (error) => {
        onSceneError(error instanceof Error ? error : new Error(String(error)));
      },
    );

    if (SHOW_WALL_PANEL_SEAMS) {
      const seamCount = Math.floor(ENVIRONMENT_WIDTH / WALL_PANEL_SPACING);
      const seamStart = -(seamCount - 1) * WALL_PANEL_SPACING * 0.5;
      for (let index = 0; index < seamCount; index += 1) {
        const seam = new THREE.Mesh(
          makeGeometry(new THREE.BoxGeometry(0.012, WALL_HEIGHT - 0.22, 0.012), geometries),
          makeMaterial(
            new THREE.MeshStandardMaterial({ color: "#c6b996", roughness: 1 }),
            materials,
          ),
        );
        seam.position.set(seamStart + index * WALL_PANEL_SPACING, WALL_CENTER_Y, -0.045);
        seam.castShadow = true;
        seam.receiveShadow = true;
        root.add(seam);
      }
    }

    const baseboardHost = new THREE.Group();
    baseboardHost.name = "baseboard-host";
    root.add(baseboardHost);

    new GLTFLoader().load(
      BASEBOARD_MODEL_PATH,
      (gltf) => {
        if (disposed) {
          return;
        }
        baseboardHost.clear();
        baseboardHost.add(
          createBeadedBaseboard(
            gltf.scene,
            materials,
            textures,
            renderer.capabilities.getMaxAnisotropy(),
          ),
        );
      },
      undefined,
      (error) => {
        onSceneError(error instanceof Error ? error : new Error(String(error)));
      },
    );

    const floorWidth = ENVIRONMENT_WIDTH + 1.2;
    const floorDepth = ROOM_SURFACE_DEPTH;
    const floorRepeatX = floorWidth / FLOOR_TILE_METERS;
    const floorRepeatY = floorDepth / FLOOR_TILE_METERS;

    const floorMaterial = makeMaterial(
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 1.0,
        metalness: 0.0,
      }),
      materials,
    );
    const floor = new THREE.Mesh(
      makeGeometry(
        new THREE.BoxGeometry(floorWidth, ROOM_SURFACE_THICKNESS, floorDepth),
        geometries,
      ),
      floorMaterial,
    );
    floor.position.set(0, FLOOR_CENTER_Y, ROOM_SURFACE_Z);
    floor.castShadow = true;
    floor.receiveShadow = true;
    root.add(floor);

    const floorLoader = new THREE.TextureLoader();
    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    const configureFloorTexture = (tex: THREE.Texture, isColor: boolean) => {
      tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
      tex.anisotropy = maxAnisotropy;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      // Rotate plank direction 90° so planks run front-to-back (toward/away from
      // the back wall) instead of side-to-side. Repeat is swapped to match.
      tex.center.set(0.5, 0.5);
      tex.rotation = Math.PI / 2;
      tex.repeat.set(floorRepeatY, floorRepeatX);
    };
    const reportFloorError = (error: unknown) => {
      onSceneError(error instanceof Error ? error : new Error(String(error)));
    };

    floorLoader.load(
      FLOOR_COLOR_PATH,
      (tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        configureFloorTexture(tex, true);
        floorMaterial.map = tex;
        floorMaterial.needsUpdate = true;
        textures.push(tex);
      },
      undefined,
      reportFloorError,
    );

    floorLoader.load(
      FLOOR_NORMAL_PATH,
      (tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        configureFloorTexture(tex, false);
        floorMaterial.normalMap = tex;
        floorMaterial.normalScale.set(0.7, 0.7);
        floorMaterial.needsUpdate = true;
        textures.push(tex);
      },
      undefined,
      reportFloorError,
    );

    floorLoader.load(
      FLOOR_ROUGHNESS_PATH,
      (tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        configureFloorTexture(tex, false);
        floorMaterial.roughnessMap = tex;
        floorMaterial.needsUpdate = true;
        textures.push(tex);
      },
      undefined,
      reportFloorError,
    );

    const ceiling = new THREE.Mesh(
      makeGeometry(
        new THREE.BoxGeometry(ENVIRONMENT_WIDTH + 1.2, ROOM_SURFACE_THICKNESS, ROOM_SURFACE_DEPTH),
        geometries,
      ),
      makeMaterial(
        new THREE.MeshStandardMaterial({ color: "#6f6758", roughness: 0.94 }),
        materials,
      ),
    );
    ceiling.position.set(0, WALL_BOTTOM_Y + WALL_HEIGHT + 0.04, ROOM_SURFACE_Z);
    ceiling.castShadow = false;
    ceiling.receiveShadow = true;
    root.add(ceiling);

    const floorShadowBlocker = new THREE.Mesh(
      makeGeometry(new THREE.BoxGeometry(ENVIRONMENT_WIDTH + 1.2, 2.4, 0.08), geometries),
      makeMaterial(
        new THREE.MeshBasicMaterial({
          colorWrite: false,
          depthWrite: false,
        }),
        materials,
      ),
    );
    floorShadowBlocker.name = "floor-shadow-blocker";
    floorShadowBlocker.position.set(0, -3.66, 0.02);
    floorShadowBlocker.castShadow = true;
    floorShadowBlocker.receiveShadow = false;
    root.add(floorShadowBlocker);

    const objectGroup = new THREE.Group();
    root.add(objectGroup);

    let pointerIsDown = false;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let pointerDragged = false;
    let startRotationX = 0;
    let startRotationY = 0;
    let startPanX = 0;
    let startPanY = 0;
    let pointerMode: "orbit" | "pan" = "orbit";
    let targetRotationX = 0;
    let targetRotationY = 0;
    let currentPanX = 0;
    let currentPanY = 0;
    let targetPanX = 0;
    let targetPanY = 0;
    let animationFrame = 0;
    let disposed = false;
    let cameraBaseY = 0.32;
    let baseCameraDistance = DESKTOP_CAMERA_DISTANCE;
    let targetCameraDistance = baseCameraDistance;

    const resetViewTargets = () => {
      pointerIsDown = false;
      pointerMode = "orbit";
      targetRotationX = 0;
      targetRotationY = 0;
      targetPanX = 0;
      targetPanY = 0;
      targetCameraDistance = baseCameraDistance;
    };

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const isPhone = width < 720;
      const nextBaseDistance = isPhone ? PHONE_CAMERA_DISTANCE : DESKTOP_CAMERA_DISTANCE;

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(width, height, false);

      camera.aspect = width / height;
      camera.fov = isPhone ? 54 : 43;
      cameraBaseY = isPhone ? 0.1 : 0.32;
      targetCameraDistance = THREE.MathUtils.clamp(
        targetCameraDistance + nextBaseDistance - baseCameraDistance,
        nextBaseDistance * 0.6,
        nextBaseDistance * 5,
      );
      baseCameraDistance = nextBaseDistance;
      if (!freeOrbitRef.current) {
        resetViewTargets();
      }
      camera.position.set(currentPanX, cameraBaseY + currentPanY, targetCameraDistance);
      camera.lookAt(currentPanX, 0.05 + currentPanY, -0.05);
      camera.updateProjectionMatrix();
    };

    const hoverRaycaster = new THREE.Raycaster();
    const hoverPointer = new THREE.Vector2();
    let hoveredFrameClip: THREE.Mesh | null = null;

    const collectFrameClipMeshes = () => {
      const clips: THREE.Mesh[] = [];
      sceneObjectsRef.current.forEach((group) => {
        if (!group.visible) {
          return;
        }

        group.traverse((child) => {
          if (child instanceof THREE.Mesh && child.userData?.isFrameClip) {
            clips.push(child);
          }
        });
      });
      return clips;
    };

    const shouldShowFrameCaption = (clip: THREE.Mesh) => {
      if (showSceneLightMarkersRef.current) {
        return false;
      }

      const sceneObjectId = clip.userData?.sceneObjectId as string | undefined;
      return clip === hoveredFrameClip || sceneObjectId === activeCaptionFrameIdRef.current;
    };

    const syncFrameCaptionVisibility = () => {
      collectFrameClipMeshes().forEach((clip) => {
        const caption = clip.userData.captionMesh as THREE.Mesh | undefined;
        if (caption) {
          caption.visible = shouldShowFrameCaption(clip);
        }
      });
    };
    syncFrameCaptionVisibilityRef.current = syncFrameCaptionVisibility;

    const collectFrameClips = (target: THREE.Object3D[]) => {
      target.push(...collectFrameClipMeshes());
    };

    const collectLampToggleZones = (target: THREE.Object3D[]) => {
      sceneObjectsRef.current.forEach((group) => {
        if (!group.visible) {
          return;
        }

        group.traverse((child) => {
          if (child instanceof THREE.Mesh && child.userData?.isLampToggleZone) {
            target.push(child);
          }
        });
      });
    };

    const syncHitboxHelpers = () => {
      const opacity = showHitboxHelpersRef.current ? 0.55 : 0;
      sceneObjectsRef.current.forEach((group) => {
        group.traverse((child) => {
          if (!(child instanceof THREE.Mesh) || !child.userData?.isLampToggleZone) {
            return;
          }
          const material = child.material;
          if (material instanceof THREE.MeshBasicMaterial) {
            material.opacity = opacity;
            material.needsUpdate = true;
          }
        });
      });
    };
    syncHitboxHelpersRef.current = syncHitboxHelpers;

    const playFrame = (clip: THREE.Mesh) => {
      const video = clip.userData.video as HTMLVideoElement | undefined;
      if (!video) {
        return;
      }
      clip.userData.fadeTarget = 1;
      const posterTime = (clip.userData.posterTime as number) ?? 0;
      // Seek back to the still moment first so playback always starts at the
      // canonical pose. Errors here are non-fatal; some browsers throw if
      // metadata is not yet loaded.
      try {
        if (Math.abs(video.currentTime - posterTime) > 0.05) {
          video.currentTime = posterTime;
        }
      } catch {
        // Ignore; the video will play from wherever it currently is.
      }
      const playPromise = video.play();
      if (playPromise) {
        playPromise.catch(() => {
          // Hover is a user gesture so play() is almost always allowed; ignore
          // the edge case where the browser still rejects (e.g. background tab).
        });
      }
    };

    const pauseFrame = (clip: THREE.Mesh) => {
      // Pause is driven by the fade tween: once opacity hits zero the animate
      // loop pauses the video and seeks back to the poster moment.
      clip.userData.fadeTarget = 0;
      syncFrameCaptionVisibility();
    };

    const syncHoveredWork = (clip: THREE.Mesh | null) => {
      const workSlug = clip?.userData?.workSlug as string | undefined;
      if (!clip || !workSlug) {
        frameHoverCallbackRef.current?.(null);
        return;
      }

      frameHoverCallbackRef.current?.({
        workSlug,
      });
    };

    const clearHoveredFrame = () => {
      if (hoveredFrameClip) {
        hoveredFrameClip.userData.fadeTarget = 0;
        hoveredFrameClip = null;
      }
      syncHoveredWork(null);
      syncFrameCaptionVisibility();
      if (host.style.cursor === "pointer") {
        host.style.cursor = "";
      }
    };

    // Threshold (px) below which a pointer down/up cycle is treated as a click
    // rather than a drag. Anything beyond this turns into an orbit/pan gesture
    // and the hovered frame is cleared.
    const dragThresholdPx = 5;

    const updateFrameHover = (clientX: number, clientY: number) => {
      if (pointerIsDown && pointerDragged) {
        // Once the user has actually dragged past the threshold we're in
        // orbit/pan mode — suspend frame hover so videos don't flicker on/off
        // as the cursor sweeps over them.
        clearHoveredFrame();
        return;
      }

      const rect = host.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      hoverPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      hoverPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      hoverRaycaster.setFromCamera(hoverPointer, camera);

      const frameTargets: THREE.Object3D[] = [];
      collectFrameClips(frameTargets);
      const frameHits =
        frameTargets.length > 0 ? hoverRaycaster.intersectObjects(frameTargets, false) : [];
      const nextClip = (frameHits[0]?.object as THREE.Mesh | undefined) ?? null;

      const lampTargets: THREE.Object3D[] = [];
      collectLampToggleZones(lampTargets);
      const lampHovered =
        !nextClip &&
        lampTargets.length > 0 &&
        hoverRaycaster.intersectObjects(lampTargets, false).length > 0;

      if (nextClip === hoveredFrameClip) {
        if (nextClip) {
          syncHoveredWork(nextClip);
        }
        syncFrameCaptionVisibility();
        if (!nextClip) {
          host.style.cursor = lampHovered ? "pointer" : "";
        }
        return;
      }

      if (hoveredFrameClip) {
        pauseFrame(hoveredFrameClip);
      }
      hoveredFrameClip = nextClip;
      syncHoveredWork(hoveredFrameClip);
      syncFrameCaptionVisibility();
      if (hoveredFrameClip) {
        playFrame(hoveredFrameClip);
        host.style.cursor = "pointer";
      } else {
        host.style.cursor = lampHovered ? "pointer" : "";
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      pointerIsDown = true;
      pointerDragged = false;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      startRotationX = targetRotationX;
      startRotationY = targetRotationY;
      startPanX = targetPanX;
      startPanY = targetPanY;
      pointerMode = freeOrbitRef.current && event.shiftKey ? "pan" : "orbit";
      host.setPointerCapture(event.pointerId);
      // Don't clear hover on press: a quick press-and-release on a hovered
      // frame is a click (open modal), not a drag. Hover only clears once the
      // user actually drags past dragThresholdPx.
    };

    const onPointerMove = (event: PointerEvent) => {
      if (pointerIsDown && !pointerDragged) {
        const dx = event.clientX - pointerStartX;
        const dy = event.clientY - pointerStartY;
        if (dx * dx + dy * dy >= dragThresholdPx * dragThresholdPx) {
          pointerDragged = true;
          clearHoveredFrame();
        }
      }

      if (event.pointerType === "mouse") {
        updateFrameHover(event.clientX, event.clientY);
      }

      if (!pointerIsDown) {
        return;
      }

      const deltaX = event.clientX - pointerStartX;

      if (freeOrbitRef.current) {
        const deltaY = event.clientY - pointerStartY;
        if (pointerMode === "pan") {
          const panSensitivity = targetCameraDistance * 0.00045;
          targetPanX = THREE.MathUtils.clamp(startPanX - deltaX * panSensitivity, -3.6, 3.6);
          targetPanY = THREE.MathUtils.clamp(startPanY + deltaY * panSensitivity, -2.1, 2.1);
          return;
        }

        targetRotationY = startRotationY + deltaX * 0.006;
        targetRotationX = startRotationX + deltaY * 0.004;
        return;
      }

      targetRotationY = THREE.MathUtils.clamp(
        startRotationY + deltaX * 0.0026,
        -CONSTRAINED_YAW_LIMIT,
        CONSTRAINED_YAW_LIMIT,
      );
      targetRotationX = 0;
    };

    const tryLampToggleClick = (clientX: number, clientY: number) => {
      const handler = lampToggleCallbackRef.current;
      if (!handler) {
        return false;
      }
      const rect = host.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }
      hoverPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      hoverPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      hoverRaycaster.setFromCamera(hoverPointer, camera);
      const targets: THREE.Object3D[] = [];
      collectLampToggleZones(targets);
      if (targets.length === 0) {
        return false;
      }
      const hit = hoverRaycaster.intersectObjects(targets, false)[0];
      if (!hit) {
        return false;
      }
      const localPoint = root.worldToLocal(hit.point.clone());
      handler([formatNumber(localPoint.x), formatNumber(localPoint.y), formatNumber(localPoint.z)]);
      return true;
    };

    const tryFrameClick = (clientX: number, clientY: number) => {
      const handler = frameClickCallbackRef.current;
      if (!handler) {
        return;
      }
      const rect = host.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return;
      }
      hoverPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      hoverPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      hoverRaycaster.setFromCamera(hoverPointer, camera);
      const targets: THREE.Object3D[] = [];
      collectFrameClips(targets);
      if (targets.length === 0) {
        return;
      }
      const hits = hoverRaycaster.intersectObjects(targets, false);
      const hit = hits[0]?.object as THREE.Mesh | undefined;
      const slug = hit?.userData?.workSlug as string | undefined;
      if (slug) {
        handler(slug);
      }
    };

    const endPointer = (event: PointerEvent) => {
      const wasDown = pointerIsDown;
      const wasDragged = pointerDragged;
      pointerIsDown = false;
      pointerDragged = false;
      if (host.hasPointerCapture(event.pointerId)) {
        host.releasePointerCapture(event.pointerId);
      }
      if (event.type === "pointerup" && wasDown && !wasDragged) {
        if (!tryLampToggleClick(event.clientX, event.clientY)) {
          tryFrameClick(event.clientX, event.clientY);
        }
      }
    };

    syncOrbitModeRef.current = (enabled) => {
      if (!enabled) {
        resetViewTargets();
      }
    };

    const onWheel = (event: WheelEvent) => {
      if (!freeOrbitRef.current) {
        return;
      }

      event.preventDefault();
      const zoomFactor = event.deltaY > 0 ? 1.018 : 0.982;
      targetCameraDistance = THREE.MathUtils.clamp(
        targetCameraDistance * zoomFactor,
        baseCameraDistance * 0.6,
        baseCameraDistance * 5,
      );
    };

    let lastCameraInfoReport = 0;
    const animate = () => {
      if (!freeOrbitRef.current) {
        targetPanX = 0;
        targetPanY = 0;
        targetCameraDistance = baseCameraDistance;
      }

      root.rotation.x += (targetRotationX - root.rotation.x) * 0.08;
      root.rotation.y += (targetRotationY - root.rotation.y) * 0.08;
      currentPanX += (targetPanX - currentPanX) * 0.1;
      currentPanY += (targetPanY - currentPanY) * 0.1;
      camera.position.x = currentPanX;
      camera.position.y = cameraBaseY + currentPanY;
      camera.position.z += (targetCameraDistance - camera.position.z) * 0.08;
      camera.lookAt(currentPanX, 0.05 + currentPanY, -0.05);
      sceneObjectsRef.current.forEach((group) => {
        if (group.name === "editable-live-clock") {
          syncClockHands(group);
        }
      });

      sceneObjectsRef.current.forEach((group) => {
        group.traverse((child) => {
          if (!(child instanceof THREE.Mesh) || !child.userData?.isFrameClip) {
            return;
          }
          const mat = child.userData.videoMaterial as THREE.MeshBasicMaterial | undefined;
          if (!mat) {
            return;
          }
          const target = (child.userData.fadeTarget as number) ?? 0;
          const next = mat.opacity + (target - mat.opacity) * 0.18;
          mat.opacity = Math.abs(target - next) < 0.001 ? target : next;
          if (target === 0 && mat.opacity < 0.01) {
            const v = child.userData.video as HTMLVideoElement | undefined;
            if (v && !v.paused) {
              v.pause();
              const posterTime = (child.userData.posterTime as number) ?? 0;
              try {
                v.currentTime = posterTime;
              } catch {
                // Ignore; the next hover will re-seek.
              }
            }
          }
        });
      });

      const callback = cameraInfoCallbackRef.current;
      if (callback) {
        const now = performance.now();
        if (now - lastCameraInfoReport >= 200) {
          lastCameraInfoReport = now;
          callback({
            distance: camera.position.z,
            panX: currentPanX,
            panY: currentPanY,
            yaw: root.rotation.y,
            pitch: root.rotation.x,
            fov: camera.fov,
          });
        }
      }

      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };

    const onPointerLeave = () => {
      clearHoveredFrame();
    };

    host.style.touchAction = "none";
    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerup", endPointer);
    host.addEventListener("pointercancel", endPointer);
    host.addEventListener("pointerleave", onPointerLeave);
    host.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", resize);

    const captionFontReady =
      captionPlacement === "frame" && document.fonts
        ? document.fonts
            .load(`${captionFont.fontWeight} 112px ${captionFont.fontFamily}`)
            .catch(() => undefined)
        : Promise.resolve();

    Promise.all([loadSceneModels(settingsRef.current), captionFontReady])
      .then(([models]) => {
        if (disposed) {
          return;
        }

        const currentSettings = settingsRef.current;
        const sceneObjects = currentSettings.map((setting) => {
          if (setting.kind === "light") {
            return createLightObject(setting, geometries, materials);
          }

          if (setting.kind === "clock") {
            return createClockObject(setting, models, clockFaceTexture, geometries, materials);
          }

          if (setting.kind === "hitbox") {
            return createHitboxObject(setting, geometries, materials);
          }

          const sourceModel = models.get(setting.model);
          if (!sourceModel) {
            throw new Error(`Object model did not load: ${setting.model}`);
          }

          if (setting.kind === "model") {
            return createModelObject(setting, sourceModel);
          }

          return createFrame(
            setting,
            sourceModel,
            geometries,
            materials,
            textures,
            videos,
            false,
            captionFont,
            captionPlacement,
            onSceneError,
          );
        });
        sceneObjectsRef.current = sceneObjects;
        sceneObjects.forEach((sceneObject) => objectGroup.add(sceneObject));
        syncHitboxHelpers();
        syncFrameCaptionVisibility();
      })
      .catch((error: unknown) => {
        onSceneError(error instanceof Error ? error : new Error(String(error)));
      });

    resize();
    animate();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", endPointer);
      host.removeEventListener("pointercancel", endPointer);
      host.removeEventListener("pointerleave", onPointerLeave);
      host.removeEventListener("wheel", onWheel);
      syncLightingRef.current = null;
      syncHitboxHelpersRef.current = null;
      syncFrameCaptionVisibilityRef.current = null;
      syncOrbitModeRef.current = null;
      videos.forEach((video) => {
        video.pause();
        video.removeAttribute("src");
        video.load();
      });
      sceneObjectsRef.current = [];
      renderer.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      renderer.domElement.remove();
    };
  }, [captionFont, captionPlacement, onSceneError, resetSignal]);

  return <div ref={hostRef} className="absolute inset-0" />;
}

function normalizeSceneSettings(
  parsed: Partial<SceneObjectSetting>[] | undefined,
  {
    includeLegacyDefaults = false,
    addDefaultLampLight = false,
    addDefaultLampHitbox = false,
    markLampLightMigration = false,
    markLampHitboxMigration = false,
  }: {
    includeLegacyDefaults?: boolean;
    addDefaultLampLight?: boolean;
    addDefaultLampHitbox?: boolean;
    markLampLightMigration?: boolean;
    markLampHitboxMigration?: boolean;
  } = {},
) {
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return defaultSceneSettings;
  }

  const migrated = parsed.flatMap((setting, index) => {
    if (setting.kind === "light") {
      return createLightSetting(setting as Partial<LightSetting>);
    }

    if (setting.kind === "clock") {
      return createClockSetting(setting as Partial<ClockSetting>);
    }

    if (setting.kind === "hitbox") {
      return createHitboxSetting(setting as Partial<HitboxSetting>);
    }

    if (setting.kind === "model" && "catalogId" in setting && setting.catalogId) {
      if (deprecatedPropModelIds.has(setting.catalogId)) {
        return [];
      }

      return createModelSetting(setting.catalogId, setting as Partial<ModelSetting>);
    }

    return createFrameSetting(index, setting as Partial<FrameSetting>);
  });

  const existingCatalogIds = new Set(
    migrated
      .filter((setting): setting is ModelSetting => setting.kind === "model")
      .map((setting) => setting.catalogId),
  );
  const missingDefaultModels = defaultSceneSettings.filter(
    (setting): setting is ModelSetting =>
      setting.kind === "model" &&
      !existingCatalogIds.has(setting.catalogId) &&
      (includeLegacyDefaults || requiredDefaultPropModelIds.has(setting.catalogId)),
  );
  const hasLightSource = migrated.some((setting) => setting.kind === "light");
  const shouldAddDefaultLampLight = !hasLightSource && addDefaultLampLight;
  const missingDefaultLights = shouldAddDefaultLampLight
    ? defaultSceneSettings.filter((setting): setting is LightSetting => setting.kind === "light")
    : [];
  const hasLampHitbox = migrated.some(
    (setting) => setting.kind === "hitbox" && setting.action === "toggle-nearest-light",
  );
  const lampAnchor =
    migrated.find(
      (setting): setting is ModelSetting =>
        setting.kind === "model" && setting.catalogId === "small-end-table",
    ) ??
    defaultSceneSettings.find(
      (setting): setting is ModelSetting =>
        setting.kind === "model" && setting.catalogId === "small-end-table",
    );
  const missingDefaultHitboxes =
    !hasLampHitbox && addDefaultLampHitbox && lampAnchor
      ? [
          createHitboxSetting({
            id: "hitbox-lamp-toggle",
            ...lampHitboxPlacementFromModel(lampAnchor),
          }),
        ]
      : [];

  if (shouldAddDefaultLampLight && markLampLightMigration && typeof window !== "undefined") {
    window.localStorage.setItem(DEFAULT_LAMP_LIGHT_MIGRATION_KEY, "1");
  }

  if (
    (hasLampHitbox || missingDefaultHitboxes.length > 0) &&
    markLampHitboxMigration &&
    typeof window !== "undefined"
  ) {
    window.localStorage.setItem(DEFAULT_LAMP_HITBOX_MIGRATION_KEY, "1");
  }

  return [...migrated, ...missingDefaultModels, ...missingDefaultLights, ...missingDefaultHitboxes];
}

function readStoredSettings() {
  if (typeof window === "undefined") {
    return defaultSceneSettings;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  const frameStored = stored ? null : window.localStorage.getItem(FRAME_STORAGE_KEY);
  const legacyStored = stored || frameStored ? null : window.localStorage.getItem(LEGACY_STORAGE_KEY);
  const storedValue = stored ?? frameStored ?? legacyStored;
  if (!storedValue) {
    return defaultSceneSettings;
  }

  const shouldAddDefaultLampLight =
    Boolean(frameStored || legacyStored) ||
    (Boolean(stored) && window.localStorage.getItem(DEFAULT_LAMP_LIGHT_MIGRATION_KEY) !== "1");
  const shouldAddDefaultLampHitbox =
    Boolean(frameStored || legacyStored) ||
    (Boolean(stored) && window.localStorage.getItem(DEFAULT_LAMP_HITBOX_MIGRATION_KEY) !== "1");

  return normalizeSceneSettings(JSON.parse(storedValue) as Partial<SceneObjectSetting>[], {
    includeLegacyDefaults: Boolean(frameStored || legacyStored),
    addDefaultLampLight: shouldAddDefaultLampLight,
    addDefaultLampHitbox: shouldAddDefaultLampHitbox,
    markLampLightMigration: true,
    markLampHitboxMigration: true,
  });
}

function readStoredLighting() {
  if (typeof window === "undefined") {
    return defaultSceneLighting;
  }

  const stored = window.localStorage.getItem(LIGHTING_STORAGE_KEY);
  if (!stored) {
    return defaultSceneLighting;
  }

  const parsed = JSON.parse(stored) as Partial<SceneLighting>;
  return normalizeSceneLighting(parsed);
}

async function readPersistedEnvironment(): Promise<{
  settings: SceneObjectSetting[];
  lighting: SceneLighting;
}> {
  try {
    const response = await fetch("/api/environment", { cache: "no-store" });
    if (response.ok) {
      const environment = (await response.json()) as StoredEnvironment;
      const shouldAddDefaultLampHitbox =
        typeof window === "undefined" ||
        window.localStorage.getItem(DEFAULT_LAMP_HITBOX_MIGRATION_KEY) !== "1";
      return {
        settings: normalizeSceneSettings(environment.objects, {
          addDefaultLampLight: true,
          addDefaultLampHitbox: shouldAddDefaultLampHitbox,
          markLampHitboxMigration: true,
        }),
        lighting: normalizeSceneLighting(environment.lighting),
      };
    }
  } catch {
    // Fall back to browser storage when the local JSON file cannot be read.
  }

  return {
    settings: readStoredSettings(),
    lighting: readStoredLighting(),
  };
}

function formatNumber(value: number) {
  return Number(value.toFixed(3));
}

function clampCropAmount(value: number) {
  return formatNumber(THREE.MathUtils.clamp(Math.abs(value), 0, 0.48));
}

function workForSetting(setting: FrameSetting) {
  return works.find((candidate) => candidate.slug === setting.workSlug) ?? works[0];
}

function labelForSetting(setting: SceneObjectSetting) {
  const visible = isSceneObjectVisible(setting);
  const statusPrefix = visible ? "" : "Hidden ";

  if (setting.kind === "light") {
    return {
      title: setting.label,
      detail: visible ? (setting.enabled ? "Light source" : "Light off") : "Hidden light",
    };
  }

  if (setting.kind === "model") {
    return {
      title: setting.label,
      detail: `${statusPrefix}3D model`,
    };
  }

  if (setting.kind === "clock") {
    return {
      title: setting.label,
      detail: `${statusPrefix}live clock`,
    };
  }

  if (setting.kind === "hitbox") {
    return {
      title: setting.label,
      detail: `${statusPrefix}lamp toggle hitbox`,
    };
  }

  const work = workForSetting(setting);
  return {
    title: work?.artist ?? setting.label,
    detail: visible ? (work?.title ?? setting.id) : `Hidden ${work?.title ?? setting.id}`,
  };
}

function ObjectPreviewButton({
  index,
  setting,
  selected,
  onClick,
}: {
  index: number;
  setting: SceneObjectSetting;
  selected: boolean;
  onClick: () => void;
}) {
  const work = setting.kind === "frame" ? workForSetting(setting) : null;
  const visible = isSceneObjectVisible(setting);
  const label = labelForSetting(setting);
  const previewIcon =
    setting.kind === "light" ? (
      <Lightbulb size={24} />
    ) : setting.kind === "clock" ? (
      <Clock size={24} />
    ) : setting.kind === "hitbox" ? (
      <ScanSearch size={24} />
    ) : (
      <Box size={24} />
    );

  return (
    <button
      type="button"
      className={`overflow-hidden rounded border text-left transition ${
        selected
          ? "border-sky-300 bg-sky-300/15 text-sky-100"
          : "border-white/10 bg-white/5 text-[#f6f0e5] hover:bg-white/10"
      } ${visible ? "" : "opacity-55"}`}
      aria-label={`Select object ${index + 1}`}
      onClick={onClick}
    >
      <div className="relative aspect-[4/3] bg-black/35">
        {work ? (
          <video
            className="size-full object-cover"
            src={work.clipSrc}
            muted
            loop
            playsInline
            autoPlay
            preload="metadata"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-[#d8cdbb]">
            {previewIcon}
          </div>
        )}
        <div className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
          {index + 1}
        </div>
        {!visible ? (
          <div className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded bg-black/70 text-white">
            <EyeOff size={13} />
          </div>
        ) : null}
      </div>
      <div className="min-w-0 px-2 py-1.5">
        <div className="truncate text-[11px] font-medium">{label.title}</div>
        <div className="truncate text-[10px] text-[#bfb29f]">{label.detail}</div>
      </div>
    </button>
  );
}

function SceneLightingControls({
  lighting,
  onChange,
  onReset,
}: {
  lighting: SceneLighting;
  onChange: (partial: Partial<SceneLighting>) => void;
  onReset: () => void;
}) {
  const ambientHelp = "The base wash of light across the whole room. Higher values lift shadows everywhere.";
  const keyHelp = "The main shadow-casting light source. The visible marker shows where this light comes from.";
  const fillHelp = "A softer non-shadow fill light that keeps dark areas from going completely black.";
  const exposureHelp = "Overall rendered brightness after the lights are applied.";
  const updatePosition = (
    property: "keyPosition" | "fillPosition",
    axis: 0 | 1 | 2,
    value: number,
  ) => {
    const position = [...lighting[property]] as VectorTuple;
    position[axis] = value;
    onChange({ [property]: position });
  };

  return (
    <div className="rounded border border-white/10 bg-white/[0.04] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
            Scene light
          </div>
          <div className="font-mono text-[11px] text-[#fff7e8]">
            global
          </div>
        </div>
        <button
          type="button"
          className="rounded border border-white/10 bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
          onClick={onReset}
        >
          Reset
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <RangeControl
          label="Ambient"
          tooltip={ambientHelp}
          min={0}
          max={3}
          step={0.05}
          value={lighting.ambientIntensity}
          onChange={(value) => onChange({ ambientIntensity: value })}
        />
        <RangeControl
          label="Key"
          tooltip={keyHelp}
          min={0}
          max={4}
          step={0.05}
          value={lighting.keyIntensity}
          onChange={(value) => onChange({ keyIntensity: value })}
        />
        <RangeControl
          label="Fill"
          tooltip={fillHelp}
          min={0}
          max={6}
          step={0.05}
          value={lighting.fillIntensity}
          onChange={(value) => onChange({ fillIntensity: value })}
        />
        <RangeControl
          label="Exposure"
          tooltip={exposureHelp}
          min={0.35}
          max={1.6}
          step={0.01}
          value={lighting.exposure}
          onChange={(value) => onChange({ exposure: value })}
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="grid min-w-0 gap-1 text-[11px] text-[#d8cdbb]">
          <TooltipLabel
            label="Ambient color"
            tooltip="The tint of the room's base light. Warmer colors feel candlelit; cooler colors feel duskier."
          />
          <input
            className="h-9 w-full rounded border border-white/10 bg-[#221d17] p-1"
            type="color"
            value={lighting.ambientColor}
            onChange={(event) => onChange({ ambientColor: event.target.value })}
          />
        </label>
        <label className="grid min-w-0 gap-1 text-[11px] text-[#d8cdbb]">
          <TooltipLabel
            label="Key color"
            tooltip="The tint of the main shadow-casting light source."
          />
          <input
            className="h-9 w-full rounded border border-white/10 bg-[#221d17] p-1"
            type="color"
            value={lighting.keyColor}
            onChange={(event) => onChange({ keyColor: event.target.value })}
          />
        </label>
        <label className="grid min-w-0 gap-1 text-[11px] text-[#d8cdbb]">
          <TooltipLabel
            label="Fill color"
            tooltip="The tint of the softer secondary light that fills shadows without casting its own."
          />
          <input
            className="h-9 w-full rounded border border-white/10 bg-[#221d17] p-1"
            type="color"
            value={lighting.fillColor}
            onChange={(event) => onChange({ fillColor: event.target.value })}
          />
        </label>
      </div>

      <div className="mb-3 mt-4 text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
        Source position
      </div>
      <div className="grid grid-cols-3 gap-3">
        <RangeControl
          label="Key X"
          tooltip="Move the main shadow-casting light source left or right."
          min={-6}
          max={6}
          step={0.05}
          value={lighting.keyPosition[0]}
          onChange={(value) => updatePosition("keyPosition", 0, value)}
        />
        <RangeControl
          label="Key Y"
          tooltip="Move the main shadow-casting light source up or down."
          min={-1}
          max={6}
          step={0.05}
          value={lighting.keyPosition[1]}
          onChange={(value) => updatePosition("keyPosition", 1, value)}
        />
        <RangeControl
          label="Key Z"
          tooltip="Move the main shadow-casting light source closer to or farther from the wall."
          min={-1}
          max={8}
          step={0.05}
          value={lighting.keyPosition[2]}
          onChange={(value) => updatePosition("keyPosition", 2, value)}
        />
        <RangeControl
          label="Fill X"
          tooltip="Move the softer fill light left or right."
          min={-6}
          max={6}
          step={0.05}
          value={lighting.fillPosition[0]}
          onChange={(value) => updatePosition("fillPosition", 0, value)}
        />
        <RangeControl
          label="Fill Y"
          tooltip="Move the softer fill light up or down."
          min={-1}
          max={6}
          step={0.05}
          value={lighting.fillPosition[1]}
          onChange={(value) => updatePosition("fillPosition", 1, value)}
        />
        <RangeControl
          label="Fill Z"
          tooltip="Move the softer fill light closer to or farther from the wall."
          min={-1}
          max={8}
          step={0.05}
          value={lighting.fillPosition[2]}
          onChange={(value) => updatePosition("fillPosition", 2, value)}
        />
      </div>
    </div>
  );
}

function TooltipLabel({ label, tooltip }: { label: string; tooltip?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1">
      <span className="truncate">{label}</span>
      {tooltip ? (
        <span
          className="grid size-4 shrink-0 place-items-center text-[#a99d8a]"
          title={tooltip}
          aria-label={tooltip}
        >
          <CircleHelp size={12} />
        </span>
      ) : null}
    </span>
  );
}

export function GalleryScene() {
  const storageReadyRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);
  const [showChrome, setShowChrome] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [lightingOpen, setLightingOpen] = useState(false);
  const [captionOpen, setCaptionOpen] = useState(false);
  const [freeOrbit, setFreeOrbit] = useState(false);
  const [selectedObject, setSelectedObject] = useState(0);
  const [resetSignal, setResetSignal] = useState(0);
  const [cameraInfo, setCameraInfo] = useState<CameraInfo | null>(null);
  const [pendingReset, setPendingReset] = useState<"layout" | "lighting" | null>(null);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [openWorkSlug, setOpenWorkSlug] = useState<string | null>(null);
  const [hoveredFrameInfo, setHoveredFrameInfo] = useState<FrameHoverInfo | null>(null);
  const [captionFontId, setCaptionFontId] = useState<CaptionFontId>(() => {
    if (typeof window === "undefined") {
      return "brik";
    }

    try {
      return normalizeCaptionFontId(window.localStorage.getItem(CAPTION_FONT_STORAGE_KEY));
    } catch {
      return "brik";
    }
  });
  const [captionPlacementId, setCaptionPlacementId] = useState<CaptionPlacementId>(() => {
    if (typeof window === "undefined") {
      return "frame";
    }

    try {
      return normalizeCaptionPlacementId(window.localStorage.getItem(CAPTION_PLACEMENT_STORAGE_KEY));
    } catch {
      return "frame";
    }
  });
  const openWork = useMemo(
    () => (openWorkSlug ? works.find((w) => w.slug === openWorkSlug) ?? null : null),
    [openWorkSlug],
  );
  const hoveredWork = useMemo(
    () =>
      hoveredFrameInfo?.workSlug
        ? works.find((w) => w.slug === hoveredFrameInfo.workSlug) ?? null
        : null,
    [hoveredFrameInfo],
  );
  const captionFont = useMemo(
    () => captionFontOptions.find((option) => option.id === captionFontId) ?? captionFontOptions[0],
    [captionFontId],
  );
  const [settings, setSettings] = useState<SceneObjectSetting[]>(defaultSceneSettings);
  const [lighting, setLighting] = useState<SceneLighting>(defaultSceneLighting);
  const selected = settings[selectedObject] ?? settings[0];
  const exportedSettings = useMemo(
    () => JSON.stringify({ lighting, objects: settings }, null, 2),
    [lighting, settings],
  );

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousRootOverscroll = root.style.overscrollBehavior;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;

    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";

    return () => {
      root.style.overflow = previousRootOverflow;
      root.style.overscrollBehavior = previousRootOverscroll;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CAPTION_FONT_STORAGE_KEY, captionFontId);
    } catch {
      // Non-critical preference.
    }
  }, [captionFontId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CAPTION_PLACEMENT_STORAGE_KEY, captionPlacementId);
    } catch {
      // Non-critical preference.
    }
  }, [captionPlacementId]);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const { settings: loadedSettings, lighting: loadedLighting } = await readPersistedEnvironment();
          if (cancelled) {
            return;
          }

          setSettings(loadedSettings);
          setLighting(loadedLighting);
          setSelectedObject((current) => Math.min(current, loadedSettings.length - 1));
          setResetSignal((current) => current + 1);
        } catch (error) {
          if (!cancelled) {
            setSceneError(error instanceof Error ? error.message : String(error));
          }
        } finally {
          if (!cancelled) {
            storageReadyRef.current = true;
          }
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!storageReadyRef.current) {
      return undefined;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.localStorage.setItem(LIGHTING_STORAGE_KEY, JSON.stringify(lighting));

    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/environment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: exportedSettings,
          });

          if (!response.ok) {
            throw new Error("Could not save environment JSON.");
          }
        } catch (error) {
          setSceneError(error instanceof Error ? error.message : String(error));
        }
      })();
    }, 350);

    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [exportedSettings, lighting, settings]);

  const confirmPendingReset = useCallback(() => {
    if (pendingReset === "layout") {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(LIGHTING_STORAGE_KEY);
      window.localStorage.removeItem(FRAME_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      setSettings(defaultSceneSettings);
      setLighting(defaultSceneLighting);
      setSelectedObject(0);
      setSceneError(null);
      setResetSignal((current) => current + 1);
    }

    if (pendingReset === "lighting") {
      setLighting(defaultSceneLighting);
      setSceneError(null);
    }

    setPendingReset(null);
  }, [pendingReset]);

  const handleSceneError = useCallback((error: Error) => {
    setSceneError(error.message);
  }, []);

  const updateSelectedObject = useCallback(
    (partial: Partial<SceneObjectSetting>) => {
      setSceneError(null);
      setSettings((current) =>
        current.map((setting, index) =>
          index === selectedObject ? ({ ...setting, ...partial } as SceneObjectSetting) : setting,
        ),
      );
    },
    [selectedObject],
  );

  const updateLighting = useCallback((partial: Partial<SceneLighting>) => {
    setLighting((current) => normalizeSceneLighting({ ...current, ...partial }));
  }, []);

  const toggleNearestLight = useCallback((position: VectorTuple) => {
    setSceneError(null);
    setSettings((current) => {
      const hasVisibleLight = current.some(
        (setting) => setting.kind === "light" && isSceneObjectVisible(setting),
      );
      let nearestIndex = -1;
      let nearestDistance = Number.POSITIVE_INFINITY;

      current.forEach((setting, index) => {
        if (setting.kind !== "light") {
          return;
        }
        if (hasVisibleLight && !isSceneObjectVisible(setting)) {
          return;
        }

        const dx = setting.position[0] - position[0];
        const dy = setting.position[1] - position[1];
        const dz = setting.position[2] - position[2];
        const distance = dx * dx + dy * dy + dz * dz;
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      if (nearestIndex === -1) {
        return current;
      }

      return current.map((setting, index) =>
        index === nearestIndex && setting.kind === "light"
          ? { ...setting, enabled: !setting.enabled }
          : setting,
      );
    });
  }, []);

  const updateSelectedPosition = (axis: 0 | 1 | 2, value: number) => {
    if (!selected) {
      return;
    }

    const position = [...selected.position] as VectorTuple;
    position[axis] = value;
    updateSelectedObject({ position });
  };

  const updateSelectedRotation = (axis: 0 | 1 | 2, value: number) => {
    if (!selected) {
      return;
    }

    const rotation = [...selected.rotation] as VectorTuple;
    rotation[axis] = value;
    updateSelectedObject({ rotation });
  };

  const updateSelectedSize = (value: number) => {
    updateSelectedObject({ wallScale: value });
  };

  const addObject = (kind: ObjectKind) => {
    const source = selected ?? settings[settings.length - 1] ?? defaultSceneSettings[0];
    const nextIndex = settings.length;
    const nextPosition: VectorTuple = [
      formatNumber(THREE.MathUtils.clamp(source.position[0] + 0.65, -4.2, 4.2)),
      formatNumber(THREE.MathUtils.clamp(source.position[1] - 0.18, -4.2, 2)),
      source.position[2],
    ];
    const nextLightPosition: VectorTuple =
      source.kind === "model"
        ? [
            source.position[0],
            formatNumber(THREE.MathUtils.clamp(source.position[1] + source.wallScale * 1.45, -4.2, 2)),
            source.position[2],
          ]
        : nextPosition;
    const nextObject =
      kind === "light"
        ? createLightSetting({
            id: `light-${Date.now().toString(36)}`,
            position: nextLightPosition,
          })
        : kind === "clock"
          ? createClockSetting({
              id: `clock-${Date.now().toString(36)}`,
              position: nextPosition,
            })
        : kind === "model"
          ? createModelSetting("small-end-table", {
              id: `prop-${Date.now().toString(36)}`,
              position: nextPosition,
            })
        : kind === "hitbox"
          ? createHitboxSetting({
              id: `hitbox-${Date.now().toString(36)}`,
              position: nextPosition,
            })
          : createFrameSetting(nextIndex, {
              ...(source.kind === "frame" ? source : undefined),
              id: `frame-${Date.now().toString(36)}`,
              visible: true,
              position: nextPosition,
              rotation: [
                source.rotation[0],
                source.rotation[1] * -1 || 0.025,
                formatNumber(source.rotation[2] * -1 || -0.015),
              ],
              workSlug: works[nextIndex % Math.max(works.length, 1)]?.slug ?? firstSavedComposite?.workSlug ?? "",
            });

    setSceneError(null);
    setSettings([...settings, nextObject]);
    setSelectedObject(nextIndex);
    setResetSignal((current) => current + 1);
  };

  const removeSelectedObject = () => {
    if (settings.length <= 1) {
      return;
    }

    const nextSettings = settings.filter((_, index) => index !== selectedObject);
    const nextSelectedObject = Math.min(selectedObject, nextSettings.length - 1);
    setSceneError(null);
    setSettings(nextSettings);
    setSelectedObject(nextSelectedObject);
    setResetSignal((current) => current + 1);
  };

  const updateSelectedModel = (catalogId: string) => {
    if (!selected || selected.kind !== "model") {
      return;
    }

    const catalogItem = propModels.find((item) => item.id === catalogId);
    if (!catalogItem) {
      return;
    }

    updateSelectedObject({
      catalogId: catalogItem.id,
      label: catalogItem.label,
      model: catalogItem.model,
    });
    setResetSignal((current) => current + 1);
  };

  const snapSelectedModelToFloor = () => {
    if (!selected || selected.kind !== "model") {
      return;
    }

    const position = [...selected.position] as VectorTuple;
    position[1] = MODEL_FLOOR_Y;
    updateSelectedObject({ position });
  };

  const updateSelectedLight = (partial: Partial<LightSetting>) => {
    if (!selected || selected.kind !== "light") {
      return;
    }

    updateSelectedObject(partial as Partial<SceneObjectSetting>);
  };

  return (
    <section className="relative h-full min-h-screen w-full supports-[height:100dvh]:min-h-dvh">
      <ThreeWallCanvas
        key={resetSignal}
        settings={settings}
        lighting={lighting}
        showSceneLightMarkers={lightingOpen}
        showHitboxHelpers={editorOpen}
        activeCaptionFrameId={editorOpen && selected?.kind === "frame" ? selected.id : null}
        resetSignal={resetSignal}
        freeOrbit={freeOrbit}
        captionFont={captionFont}
        captionPlacement={captionPlacementId}
        onSceneError={handleSceneError}
        onCameraInfoChange={setCameraInfo}
        onFrameClick={setOpenWorkSlug}
        onFrameHover={setHoveredFrameInfo}
        onLampToggle={toggleNearestLight}
      />

      {hoveredWork && captionPlacementId === "corner" && !editorOpen && !lightingOpen && !openWork ? (
        <div
          className="pointer-events-none absolute bottom-7 left-5 max-w-[calc(100vw-2.5rem)] break-words text-5xl leading-none text-[#f6f0e5] sm:bottom-9 sm:left-8 sm:text-7xl lg:text-8xl"
          style={{
            fontFamily: captionFont.fontFamily,
            fontWeight: captionFont.fontWeight,
          }}
          aria-hidden="true"
        >
          {hoveredWork.artist}
        </div>
      ) : null}

      <div className="pointer-events-none absolute right-4 top-4 flex items-start justify-end p-0 sm:right-6 sm:top-6">
        <div className="flex flex-col items-end gap-2">
          <div className="pointer-events-auto flex items-center gap-2 rounded border border-white/10 bg-[#16120d]/78 p-1 shadow-2xl backdrop-blur">
            {showChrome ? (
              <>
                <Link
                  className="grid h-10 place-items-center rounded px-3 text-xs font-medium text-[#f6f0e5] transition hover:bg-white/10"
                  href="/object-editor"
                  aria-label="Open object composite editor"
                  title="Open object composite editor"
                >
                  Object
                </Link>
                <Link
                  className="grid h-10 place-items-center rounded px-3 text-xs font-medium text-[#f6f0e5] transition hover:bg-white/10"
                  href="/clock-editor"
                  aria-label="Open clock composite editor"
                  title="Open clock composite editor"
                >
                  Clock
                </Link>
                <Link
                  className="grid size-10 place-items-center rounded text-[#f6f0e5] transition hover:bg-white/10"
                  href="/clip-tool"
                  aria-label="Open clip tool"
                  title="Open clip tool"
                >
                  <Scissors size={17} />
                </Link>
                <button
                  type="button"
                  className={`grid size-10 place-items-center rounded text-[#f6f0e5] transition hover:bg-white/10 ${
                    captionOpen ? "bg-white/15" : ""
                  }`}
                  aria-label="Toggle caption typography"
                  title="Toggle caption typography"
                  onClick={() => {
                    setCaptionOpen((current) => !current);
                    setEditorOpen(false);
                    setLightingOpen(false);
                  }}
                >
                  <Type size={18} />
                </button>
                <button
                  type="button"
                  className={`grid size-10 place-items-center rounded text-[#f6f0e5] transition hover:bg-white/10 ${
                    editorOpen ? "bg-white/15" : ""
                  }`}
                  aria-label="Toggle environment object editor"
                  title="Toggle environment object editor"
                  onClick={() => {
                    setEditorOpen((current) => !current);
                    setCaptionOpen(false);
                    setLightingOpen(false);
                  }}
                >
                  <SlidersHorizontal size={18} />
                </button>
                <button
                  type="button"
                  className={`grid size-10 place-items-center rounded text-[#f6f0e5] transition hover:bg-white/10 ${
                    lightingOpen ? "bg-white/15" : ""
                  }`}
                  aria-label="Toggle scene lighting"
                  title="Toggle scene lighting"
                  onClick={() => {
                    setLightingOpen((current) => !current);
                    setCaptionOpen(false);
                    setEditorOpen(false);
                  }}
                >
                  <Lightbulb size={18} />
                </button>
                <button
                  type="button"
                  className="grid size-10 place-items-center rounded text-[#f6f0e5] transition hover:bg-white/10"
                  aria-label={freeOrbit ? "Use constrained orbit" : "Use free orbit"}
                  title={freeOrbit ? "Use constrained orbit" : "Use free orbit"}
                  onClick={() => setFreeOrbit((current) => !current)}
                >
                  {freeOrbit ? <Unlock size={18} /> : <Lock size={18} />}
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="grid size-10 place-items-center rounded text-[#f6f0e5] transition hover:bg-white/10"
              aria-label={showChrome ? "Hide helper controls" : "Show helper controls"}
              title={showChrome ? "Hide helper controls" : "Show helper controls"}
              onClick={() => {
                if (showChrome) {
                  setCaptionOpen(false);
                }
                setShowChrome((current) => !current);
              }}
            >
              <Eye size={18} />
            </button>
            {showChrome ? (
              <button
                type="button"
                className="grid size-10 place-items-center rounded text-[#f6f0e5] transition hover:bg-white/10"
                aria-label="Recenter view"
                title="Recenter view"
                onClick={() => {
                  setSceneError(null);
                  setResetSignal((current) => current + 1);
                }}
              >
                <RotateCcw size={18} />
              </button>
            ) : null}
          </div>

          {showChrome && cameraInfo ? (
            <div className="pointer-events-none rounded border border-white/10 bg-[#16120d]/78 px-3 py-2 font-mono text-[11px] leading-snug text-[#f6f0e5] shadow-2xl backdrop-blur">
              <div>dist&nbsp;&nbsp;{cameraInfo.distance.toFixed(2)}</div>
              <div>pan&nbsp;&nbsp;&nbsp;{cameraInfo.panX.toFixed(2)},&nbsp;{cameraInfo.panY.toFixed(2)}</div>
              <div>yaw&nbsp;&nbsp;&nbsp;{((cameraInfo.yaw * 180) / Math.PI).toFixed(1)}°</div>
              <div>pitch&nbsp;{((cameraInfo.pitch * 180) / Math.PI).toFixed(1)}°</div>
              <div>fov&nbsp;&nbsp;&nbsp;{cameraInfo.fov.toFixed(0)}°</div>
            </div>
          ) : null}
        </div>
      </div>

      {lightingOpen ? (
        <div className="absolute bottom-3 left-3 right-3 max-h-[56vh] overflow-auto rounded border border-white/10 bg-[#16120d]/92 p-3 text-xs text-[#f6f0e5] shadow-2xl backdrop-blur sm:left-auto sm:right-4 sm:top-20 sm:bottom-auto sm:w-[22rem] sm:max-h-[calc(100vh-7rem)]">
          <SceneLightingControls
            lighting={lighting}
            onChange={updateLighting}
            onReset={() => setPendingReset("lighting")}
          />
        </div>
      ) : null}

      {showChrome && captionOpen ? (
        <div className="absolute bottom-3 left-3 right-3 max-h-[56vh] overflow-auto rounded border border-white/10 bg-[#16120d]/92 p-3 text-xs text-[#f6f0e5] shadow-2xl backdrop-blur sm:left-auto sm:right-4 sm:top-20 sm:bottom-auto sm:w-[22rem] sm:max-h-[calc(100vh-7rem)]">
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
              Caption typography
            </div>
          </div>

          <div className="mb-4">
            <div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
              Placement
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "frame", label: "Below frame" },
                { id: "corner", label: "Lower left" },
              ].map((option) => {
                const selectedPlacement = option.id === captionPlacementId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`rounded border px-3 py-2 text-left text-xs transition ${
                      selectedPlacement
                        ? "border-sky-300 bg-sky-300/15 text-sky-100"
                        : "border-white/10 bg-white/5 text-[#f6f0e5] hover:bg-white/10"
                    }`}
                    onClick={() => setCaptionPlacementId(option.id as CaptionPlacementId)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2">
            {captionFontOptions.map((option) => {
              const selectedFont = option.id === captionFontId;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`flex items-center justify-between gap-3 rounded border px-3 py-2 text-left transition ${
                    selectedFont
                      ? "border-sky-300 bg-sky-300/15 text-sky-100"
                      : "border-white/10 bg-white/5 text-[#f6f0e5] hover:bg-white/10"
                  }`}
                  onClick={() => setCaptionFontId(option.id)}
                >
                  <span
                    className="block truncate text-xl leading-none"
                    style={{
                      fontFamily: option.fontFamily,
                      fontWeight: option.fontWeight,
                    }}
                  >
                    {option.label}
                  </span>
                  {selectedFont ? (
                    <span className="shrink-0 text-[11px] uppercase tracking-[0.08em] text-sky-100">
                      Using this
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {editorOpen && selected ? (
        <div className="absolute bottom-3 left-3 right-3 max-h-[56vh] overflow-auto rounded border border-white/10 bg-[#16120d]/92 p-3 text-xs text-[#f6f0e5] shadow-2xl backdrop-blur sm:left-auto sm:right-4 sm:top-20 sm:bottom-auto sm:w-[22rem] sm:max-h-[calc(100vh-7rem)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
                Environment objects
              </div>
              <div className="font-mono text-[11px] text-[#fff7e8]">
                {selectedObject + 1} / {settings.length}
              </div>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                className="grid size-9 place-items-center rounded border border-white/10 bg-white/10 text-[#f6f0e5] transition hover:bg-white/15"
                aria-label="Add object"
                title="Add object"
                onClick={() => addObject("frame")}
              >
                <Plus size={16} />
              </button>
              <button
                type="button"
                className="grid size-9 place-items-center rounded border border-white/10 bg-white/10 text-[#f6f0e5] transition enabled:hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="Remove selected object"
                title="Remove selected object"
                disabled={settings.length <= 1}
                onClick={removeSelectedObject}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded border border-white/10 bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
              onClick={() => addObject("frame")}
            >
              Add frame
            </button>
            <button
              type="button"
              className="rounded border border-white/10 bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
              onClick={() => addObject("model")}
            >
              Add model
            </button>
            <button
              type="button"
              className="rounded border border-white/10 bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
              onClick={() => addObject("light")}
            >
              Add light
            </button>
            <button
              type="button"
              className="rounded border border-white/10 bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
              onClick={() => addObject("hitbox")}
            >
              Add hitbox
            </button>
            <button
              type="button"
              className="rounded border border-white/10 bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
              onClick={() => addObject("clock")}
            >
              Add clock
            </button>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            {settings.map((setting, index) => (
              <ObjectPreviewButton
                key={setting.id}
                index={index}
                setting={setting}
                selected={index === selectedObject}
                onClick={() => setSelectedObject(index)}
              />
            ))}
          </div>

          <label className="mb-3 grid min-w-0 gap-1 text-xs text-[#d8cdbb]">
            Name
            <input
              className="w-full min-w-0 rounded border border-white/10 bg-[#221d17] px-3 py-2 text-sm text-[#f6f0e5]"
              type="text"
              value={selected.label}
              onChange={(event) => updateSelectedObject({ label: event.currentTarget.value })}
            />
          </label>

          <label className="mb-3 flex items-center justify-between gap-3 rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#d8cdbb]">
            <span className="flex items-center gap-2">
              {isSceneObjectVisible(selected) ? <Eye size={14} /> : <EyeOff size={14} />}
              Visible in scene
            </span>
            <input
              className="accent-sky-300"
              type="checkbox"
              checked={isSceneObjectVisible(selected)}
              onChange={(event) => updateSelectedObject({ visible: event.target.checked })}
            />
          </label>

          {selected.kind === "model" ? (
            <label className="mb-3 grid min-w-0 gap-1 text-xs text-[#d8cdbb]">
              Model
              <select
                className="w-full min-w-0 rounded border border-white/10 bg-[#221d17] px-3 py-2 text-sm text-[#f6f0e5]"
                value={selected.catalogId}
                onChange={(event) => updateSelectedModel(event.target.value)}
              >
                {propModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="mb-3 text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
            Position
          </div>
          <div className="grid grid-cols-2 gap-3">
            <RangeControl
              label="Wall X"
              min={-4.2}
              max={4.2}
              step={0.02}
              value={selected.position[0]}
              onChange={(value) => updateSelectedPosition(0, value)}
            />
            <RangeControl
              label="Wall Y"
              min={selected.kind === "frame" ? -2.7 : -4.2}
              max={2}
              step={0.02}
              value={selected.position[1]}
              onChange={(value) => updateSelectedPosition(1, value)}
            />
            <RangeControl
              label="Depth Z"
              min={-0.35}
              max={2.8}
              step={0.005}
              value={selected.position[2]}
              onChange={(value) => updateSelectedPosition(2, value)}
            />
            <RangeControl
              label={
                selected.kind === "model"
                  ? "Height"
                  : selected.kind === "light"
                    ? "Marker"
                    : "Size"
              }
              min={selected.kind === "light" ? 0.04 : 0.35}
              max={selected.kind === "light" ? 0.5 : 2.4}
              step={selected.kind === "light" ? 0.005 : 0.01}
              value={selected.wallScale}
              onChange={updateSelectedSize}
            />
          </div>

          {selected.kind === "model" ? (
            <button
              type="button"
              className="mt-3 rounded border border-white/10 bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
              onClick={snapSelectedModelToFloor}
            >
              Floor
            </button>
          ) : null}

          {selected.kind === "frame" ? (
            <div className="mt-4 grid gap-3">
              <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
                Caption
              </div>
              <div className="grid grid-cols-2 gap-3">
                <RangeControl
                  label="Caption X"
                  min={-1.5}
                  max={1.5}
                  step={0.01}
                  value={selected.captionOffsetX}
                  onChange={(value) =>
                    updateSelectedObject({ captionOffsetX: value } as Partial<SceneObjectSetting>)
                  }
                />
                <RangeControl
                  label="Caption Y"
                  min={-2}
                  max={0.6}
                  step={0.01}
                  value={selected.captionOffsetY}
                  onChange={(value) =>
                    updateSelectedObject({ captionOffsetY: value } as Partial<SceneObjectSetting>)
                  }
                />
                <RangeControl
                  label="Caption Z"
                  min={-0.05}
                  max={0.2}
                  step={0.002}
                  value={selected.captionOffsetZ}
                  onChange={(value) =>
                    updateSelectedObject({ captionOffsetZ: value } as Partial<SceneObjectSetting>)
                  }
                />
                <RangeControl
                  label="Caption Size"
                  min={0.35}
                  max={2.5}
                  step={0.01}
                  value={selected.captionScale}
                  onChange={(value) =>
                    updateSelectedObject({ captionScale: value } as Partial<SceneObjectSetting>)
                  }
                />
              </div>
            </div>
          ) : null}

          {selected.kind === "clock" ? (
            <Link
              className="mt-3 inline-block rounded border border-sky-300/30 bg-sky-300/15 px-3 py-2 text-xs text-sky-100 hover:bg-sky-300/20"
              href="/clock-editor"
            >
              Clock editor
            </Link>
          ) : null}

          {selected.kind === "light" ? (
            <div className="mt-4 grid gap-3">
              <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
                Light
              </div>
              <label className="flex items-center justify-between gap-3 rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#d8cdbb]">
                Enabled
                <input
                  className="accent-sky-300"
                  type="checkbox"
                  checked={selected.enabled}
                  onChange={(event) => updateSelectedLight({ enabled: event.target.checked })}
                />
              </label>
              <label className="grid min-w-0 gap-1 text-xs text-[#d8cdbb]">
                Color
                <input
                  className="h-9 w-full rounded border border-white/10 bg-[#221d17] p-1"
                  type="color"
                  value={selected.color}
                  onChange={(event) => updateSelectedLight({ color: event.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <RangeControl
                  label="Intensity"
                  min={0}
                  max={16}
                  step={0.1}
                  value={selected.intensity}
                  onChange={(value) => updateSelectedLight({ intensity: value })}
                />
                <RangeControl
                  label="Distance"
                  min={0.4}
                  max={8}
                  step={0.1}
                  value={selected.distance}
                  onChange={(value) => updateSelectedLight({ distance: value })}
                />
                <RangeControl
                  label="Falloff"
                  min={0.4}
                  max={3}
                  step={0.05}
                  value={selected.decay}
                  onChange={(value) => updateSelectedLight({ decay: value })}
                />
              </div>
            </div>
          ) : null}

          {selected.kind !== "light" ? (
            <>
              <div className="mb-3 mt-4 text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
                Rotation
              </div>
              <div className="grid grid-cols-2 gap-3">
                <RangeControl
                  label="Pitch X"
                  min={-OBJECT_ROTATION_LIMIT}
                  max={OBJECT_ROTATION_LIMIT}
                  step={0.01}
                  value={selected.rotation[0]}
                  onChange={(value) => updateSelectedRotation(0, value)}
                />
                <RangeControl
                  label="Yaw Y"
                  min={-OBJECT_ROTATION_LIMIT}
                  max={OBJECT_ROTATION_LIMIT}
                  step={0.01}
                  value={selected.rotation[1]}
                  onChange={(value) => updateSelectedRotation(1, value)}
                />
                <RangeControl
                  label="Roll Z"
                  min={-OBJECT_ROTATION_LIMIT}
                  max={OBJECT_ROTATION_LIMIT}
                  step={0.01}
                  value={selected.rotation[2]}
                  onChange={(value) => updateSelectedRotation(2, value)}
                />
              </div>
            </>
          ) : null}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded border border-white/10 bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
              onClick={() => setPendingReset("layout")}
            >
              Reset layout
            </button>
          </div>

          <textarea
            className="mt-3 h-28 w-full resize-none rounded border border-white/10 bg-black/25 p-2 font-mono text-[10px] leading-4 text-[#d8cdbb]"
            readOnly
            value={exportedSettings}
          />
        </div>
      ) : null}

      {pendingReset ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-black/55 px-4">
          <div className="w-full max-w-sm rounded border border-white/10 bg-[#16120d] p-4 text-sm text-[#f6f0e5] shadow-2xl">
            <div className="mb-2 text-base font-medium">
              {pendingReset === "layout" ? "Reset scene layout?" : "Reset scene lighting?"}
            </div>
            <p className="mb-4 leading-6 text-[#d8cdbb]">
              {pendingReset === "layout"
                ? "This will replace the saved environment objects and lighting with the default scene."
                : "This will replace the saved global lighting values with the defaults."}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-white/10 bg-white/5 px-3 py-2 text-xs hover:bg-white/10"
                onClick={() => setPendingReset(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded border border-red-300/30 bg-red-500/20 px-3 py-2 text-xs text-red-100 hover:bg-red-500/30"
                onClick={confirmPendingReset}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {sceneError ? (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded border border-red-300/40 bg-red-950/90 px-3 py-2 font-mono text-xs leading-5 text-red-100">
          {sceneError}
        </div>
      ) : null}

      {openWork ? (
        <WorkModal work={openWork} onClose={() => setOpenWorkSlug(null)} />
      ) : null}
    </section>
  );
}

function WorkModal({ work, onClose }: { work: WorkItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={work.slug}
    >
      <div
        className="relative w-full max-w-4xl rounded-lg border border-white/10 bg-[#16120d]/95 shadow-2xl"
        style={{ aspectRatio: "16 / 9" }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid size-9 place-items-center rounded text-[#f6f0e5] transition hover:bg-white/10"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}

function RangeControl({
  label,
  tooltip,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  tooltip?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between gap-2 text-[11px] text-[#d8cdbb]">
        <TooltipLabel label={label} tooltip={tooltip} />
        <span className="font-mono text-[#fff7e8]">{formatNumber(value)}</span>
      </span>
      <input
        className="w-full accent-sky-300"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}
