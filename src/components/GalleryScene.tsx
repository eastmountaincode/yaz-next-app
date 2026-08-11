"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PortableText, type PortableTextComponents } from "@portabletext/react";
import Link from "next/link";
import {
  ArrowLeft,
  Box,
  Clock,
  CircleHelp,
  Eye,
  EyeOff,
  Flame,
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
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { SceneLoadingScreen } from "@/components/SceneLoadingScreen";
import savedClockComposite from "@/content/clock.json";
import savedComposites from "@/content/composites.json";
import { framePictures } from "@/content/framePictures";
import optionalModels from "@/content/optionalModels.json";
import { works } from "@/content/works";
import { candleFlameAtlas } from "@/lib/candleComposite";
import { resolveModelAssetUrl } from "@/lib/modelAssetUrl";
import type {
  PortfolioClient,
  PortfolioContent,
  PortfolioProject,
  SanityImageContent,
  StillArtist,
} from "@/sanity/types";
import {
  ClockCompositeConfig,
  clockHandAngles,
  defaultClockComposite,
  normalizeClockComposite,
} from "@/lib/clockComposite";
import {
  CLOCK_PENDULUM_GROUP_NAME,
  extractClockPendulum,
  setClockPendulumSwing,
} from "@/lib/clockPendulum";

const BIO_PORTABLE_TEXT_COMPONENTS = {
  block: {
    normal: ({ children }) => <p>{children}</p>,
  },
  marks: {
    link: ({ children, value }) => {
      const href = typeof value?.href === "string" ? value.href : "";

      if (!href) {
        return <>{children}</>;
      }

      return (
        <a
          className="text-inherit underline decoration-current/40 underline-offset-[3px] transition-opacity hover:opacity-60"
          href={href}
          target="_blank"
          rel="noreferrer"
        >
          {children}
        </a>
      );
    },
  },
} satisfies PortableTextComponents;

type MaskShape = "rectangle" | "oval";
type ObjectKind =
  | "frame"
  | "bio-frame"
  | "image-frame"
  | "model"
  | "alcove"
  | "light"
  | "clock"
  | "hitbox"
  | "candle-composite"
  | "speaker-composite";
type VectorTuple = [number, number, number];
type SceneLayoutMode = "desktop" | "mobile";
type SceneLayoutOverride = {
  visible?: boolean;
  position?: VectorTuple;
  rotation?: VectorTuple;
  wallScale?: number;
  captionOffsetX?: number;
  captionOffsetY?: number;
  captionOffsetZ?: number;
  captionScale?: number;
};
type SceneLayoutOverrides = Partial<Record<SceneLayoutMode, SceneLayoutOverride>>;
type ClickZoneAction = "toggle-nearest-light" | "speaker-click";
type ImageFrameModalId = "stills" | "clients";

function PreloadedImage({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    // Keep the exact public URL used by SceneLoadingScreen so this reuses the
    // already-downloaded and decoded image instead of requesting a new variant.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`absolute inset-0 size-full ${className}`}
      src={src}
      alt={alt}
      decoding="async"
    />
  );
}

function ContentImage({
  image,
  className = "",
}: {
  image: SanityImageContent;
  className?: string;
}) {
  return (
    // Sanity serves the exact URL preloaded by SceneLoadingScreen. Keeping that
    // URL intact avoids a second optimized variant request when a modal opens.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={image.url}
      alt={image.alt}
      width={image.width}
      height={image.height}
      decoding="async"
    />
  );
}

function youtubeThumbnailUrl(sourceUrl: string): string | null {
  try {
    const url = new URL(sourceUrl);
    const hostname = url.hostname.replace(/^www\./, "");
    if (
      hostname !== "youtube.com" &&
      hostname !== "m.youtube.com" &&
      hostname !== "youtu.be" &&
      hostname !== "youtube-nocookie.com"
    ) {
      return null;
    }

    const pathParts = url.pathname.split("/").filter(Boolean);
    const videoId =
      hostname === "youtu.be"
        ? pathParts[0]
        : url.searchParams.get("v") ??
          (pathParts[0] === "embed" || pathParts[0] === "shorts"
            ? pathParts[1]
            : null);

    return videoId && /^[A-Za-z0-9_-]{6,}$/.test(videoId)
      ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      : null;
  } catch {
    return null;
  }
}

function clientCoverUrl(client: PortfolioClient): string | null {
  return (
    client.coverImage?.url ??
    client.projects.map((project) => youtubeThumbnailUrl(project.videoUrl)).find(Boolean) ??
    null
  );
}

type BaseObjectSetting = {
  id: string;
  kind: ObjectKind;
  label: string;
  visible: boolean;
  position: VectorTuple;
  rotation: VectorTuple;
  wallScale: number;
  layouts?: SceneLayoutOverrides;
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

type BioFrameSetting = Omit<FrameSetting, "kind" | "workSlug"> & {
  kind: "bio-frame";
  imageSrc: string;
  bioSlug: "yaslynn";
  captionText: string;
};

type ImageFrameSetting = Omit<FrameSetting, "kind" | "workSlug"> & {
  kind: "image-frame";
  imageSrc: string;
  captionText: string;
  imageTintColor: string;
  imageTintStrength: number;
  imageHazeColor: string;
  imageHazeOpacity: number;
};

type FrameLikeSetting = FrameSetting | BioFrameSetting | ImageFrameSetting;

type ModelSetting = BaseObjectSetting & {
  kind: "model";
  model: string;
  catalogId: string;
};

type ClockSetting = BaseObjectSetting & {
  kind: "clock";
};

type AlcoveSetting = BaseObjectSetting & {
  kind: "alcove";
  nicheWidth: number;
  nicheStraightHeight: number;
  nicheArchHeight: number;
  nicheDepth: number;
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
  action: ClickZoneAction;
};

type CandleCompositeSetting = BaseObjectSetting & {
  kind: "candle-composite";
  holderModel: string;
  candleModel: string;
  separateCandleModel: boolean;
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

type SpeakerCompositeSetting = BaseObjectSetting & {
  kind: "speaker-composite";
  speakerModel: string;
  hitboxOffset: VectorTuple;
  hitboxSize: VectorTuple;
  action: "speaker-click";
};

type SceneObjectSetting =
  | FrameSetting
  | BioFrameSetting
  | ImageFrameSetting
  | ModelSetting
  | ClockSetting
  | AlcoveSetting
  | LightSetting
  | HitboxSetting
  | CandleCompositeSetting
  | SpeakerCompositeSetting;

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
  captionColor?: string;
  lighting?: Partial<SceneLighting>;
  objects?: Partial<SceneObjectSetting>[];
};

type SpeakerAudioChain = {
  context: AudioContext;
  element: HTMLAudioElement;
};

const STORAGE_KEY = "yaz-environment-editor-v5";
const LIGHTING_STORAGE_KEY = "yaz-environment-lighting-v1";
const FRAME_STORAGE_KEY = "yaz-frame-editor-v3";
const LEGACY_STORAGE_KEY = "yaz-frame-editor-v2";
const CAPTION_FONT_STORAGE_KEY = "yaz-caption-font-v5";
const CAPTION_PLACEMENT_STORAGE_KEY = "yaz-caption-placement-v1";
const CAPTION_DISPLAY_STORAGE_KEY = "yaz-caption-display-v3";
const CAPTION_VISIBILITY_STORAGE_KEY = "yaz-caption-visibility-v1";
const DEFAULT_FRAME_CAPTION_COLOR = "#d71920";
const HELPER_CONTROLS_ENABLED =
  process.env.NEXT_PUBLIC_SHOW_HELPER_CONTROLS === "true";
const MODEL_FLOOR_Y = -2.88;
const ENVIRONMENT_FINE_DRAG_SENSITIVITY = 0.2;
const OBJECT_ROTATION_LIMIT = Number((Math.PI * 1.875).toFixed(3));
const ENVIRONMENT_WIDTH = 18;
const WALL_PANEL_SPACING = 0.55;
const WALL_HEIGHT = 9.25;
const WALL_TEXTURE_PATH = "/textures/plaster_wall.webp";
const WINKY_FONT_PATH = "/fonts/WinkyShowScript.woff2";
const SHOW_WALL_PANEL_SEAMS = false;
const FLOOR_COLOR_PATH = "/textures/floor/floor_color.webp";
const FLOOR_NORMAL_PATH = "/textures/floor/floor_normal.webp";
const FLOOR_ROUGHNESS_PATH = "/textures/floor/floor_roughness.webp";
const BASEBOARD_MODEL_PATH = "/3d-models/beaded_baseboard_4_plaster_texture.glb";
const BIO_FRAME_IMAGE_PATH = "/image/yaz_headshot.jpeg";
const FAMILY_FRAME_IMAGE_PATH = "/image/family_portrait.jpg";
// One texture tile covers this many world units. Smaller value = planks repeat
// more often. The Poly Haven "old_wooden_floor_03" image shows roughly a 1 m
// patch with a few planks running along U.
const FLOOR_TILE_METERS = 1.4;
const WALL_BOTTOM_Y = -2.62;
const WALL_TOP_Y = WALL_BOTTOM_Y + WALL_HEIGHT;
const WALL_CENTER_Y = WALL_BOTTOM_Y + WALL_HEIGHT / 2;
const BIO_FRAME_MAX_Y = WALL_TOP_Y - 0.9;
const BIO_FRAME_EXPANDED_MAX_Y = Number((BIO_FRAME_MAX_Y * 1.875).toFixed(3));
const CAMERA_PAN_Y_MAX = WALL_TOP_Y - 2.1;
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
const CANDLE_HOLDER_MODEL_PATH = "/3d-models/candle-and-holder/holder.glb";
const CANDLE_MODEL_PATH = "/3d-models/candle-and-holder/candle_no_flame_shorter.glb";
const CANDLE_FLAME_TEXTURE_PATH = "/3d-models/candle-and-holder/candleflame_atlas.png";
const CLAY_SAUCER_CANDLE_MODEL_PATH =
  "/3d-models/candles/low-poly_candle_on_clay_saucer_optimized.glb";
const SPEAKER_MODEL_PATH = "/3d-models/decor/portable_bluetooth_speaker.glb";
const SPEAKER_MUSIC_AUDIO_PATH = "/audio/speaker-radio-track.mp3";
const SPEAKER_BUTTON_AUDIO_PATH = "/audio/dragon-studio-button-press-2.mp3";
const SPEAKER_AUDIO_START_SECONDS = 30;
const LAMP_SWITCH_ON_AUDIO_PATH = "/audio/lamp-switch-on.mp3";
const LAMP_SWITCH_OFF_AUDIO_PATH = "/audio/lamp-switch-off.mp3";
const LAMP_TOGGLE_ZONE_NAME = "lamp-toggle-zone";
const SPEAKER_CLICK_ZONE_NAME = "speaker-click-zone";
const LAMP_TOGGLE_ZONE_LOCAL_POSITION: VectorTuple = [0, 0.68, 0];
const LAMP_TOGGLE_ZONE_LOCAL_SIZE: VectorTuple = [0.34, 0.64, 0.34];
const DESKTOP_CAMERA_DEFAULTS = {
  distance: 7.41,
  panX: -0.19,
  panY: 1,
  yaw: 0,
  pitch: 0,
  fov: 43,
};
const MOBILE_CAMERA_DEFAULTS = {
  distance: 6.02,
  panX: -0.21,
  panY: 1.04,
  yaw: 0,
  pitch: 0,
  fov: 54,
};
const DESKTOP_CONSTRAINED_YAW_LIMIT = THREE.MathUtils.degToRad(16);
const MOBILE_CONSTRAINED_YAW_LIMIT = THREE.MathUtils.degToRad(16);
const MOBILE_LAYOUT_BREAKPOINT = 720;

type CaptionFontId =
  | "winky-show"
  | "sobria"
  | "sato"
  | "helvetica"
  | "brik"
  | "zoom-pro"
  | "modestia-ultra"
  | "zafrada"
  | "puyita";
type CaptionPlacementId = "corner" | "frame";
type CaptionDisplayMode = "always" | "hover";
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
    id: "winky-show",
    label: "Winky Show Dotted",
    fontFamily: '"Yaz Winky Show"',
    fontWeight: 400,
  },
  {
    id: "sobria",
    label: "Sobria",
    fontFamily: '"Yaz Sobria", Sobria, serif',
    fontWeight: 400,
  },
  {
    id: "sato",
    label: "Sato",
    fontFamily: '"Yaz Sato", Sato, sans-serif',
    fontWeight: 400,
  },
  {
    id: "helvetica",
    label: "Helvetica",
    fontFamily: 'Helvetica, "Helvetica Neue", Arial, sans-serif',
    fontWeight: 400,
  },
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
  return value === "winky-show" ||
    value === "sobria" ||
    value === "sato" ||
    value === "helvetica" ||
    value === "brik" ||
    value === "zoom-pro" ||
    value === "modestia-ultra" ||
    value === "zafrada" ||
    value === "puyita"
    ? value
    : "winky-show";
}

function normalizeCaptionPlacementId(value: string | null | undefined): CaptionPlacementId {
  void value;
  return "frame";
}

function normalizeCaptionDisplayMode(value: string | null | undefined): CaptionDisplayMode {
  return value === "always" ? "always" : "hover";
}

function captionFontDescriptor(font: CaptionFontOption, size = 112) {
  const primaryFontFamily = font.fontFamily.split(",", 1)[0].trim();
  return `${font.fontWeight} ${size}px ${primaryFontFamily}`;
}

async function waitForCaptionFont(font: CaptionFontOption, text: string) {
  if (!document.fonts) {
    throw new Error("This browser cannot verify the caption font.");
  }

  const descriptor = captionFontDescriptor(font);
  await document.fonts.load(descriptor, text);
  await document.fonts.ready;
  if (!document.fonts.check(descriptor, text)) {
    throw new Error(`Caption font failed to load: ${font.label}`);
  }
}

const frameModels = [
  "/3d-models/frames/adobe_stock_265717933_wood_square_frame_optimized.glb",
  "/3d-models/frames/adobe_stock_259198522_art_frame_blank_04_optimized.glb",
  "/3d-models/frames/picture_frame_1520_dimensions.glb",
  "/3d-models/frames/standing_picture_frame_01.glb",
  "/3d-models/frames/picture_frame_2.glb",
  "/3d-models/frames/fancy_picture_frame_01-freepoly.org.glb",
  "/3d-models/frames/picture_frame.glb",
  "/3d-models/frames/picture_frame_2026_07_21_optimized.glb",
  "/3d-models/frames/backrooms_ff2_painting_bacteria_room_2026_07_21_optimized.glb",
  "/3d-models/frames/thick_simple_picture_frame_2026_07_21_optimized.glb",
  "/3d-models/frames/vintage_picture_frame..glb",
  "/3d-models/frames/wooden_picture_frame_2026_05_31_optimized.glb",
  "/3d-models/frames/new_frame_default_2026_05_31_pbr.glb",
  "/3d-models/frames/vintage_frame_04.glb",
  "/3d-models/frames/vintage_frame_06.glb",
  "/3d-models/frames/photo_frame_with_mat_2026_05_31.glb",
  "/3d-models/frames/photo_frame_with_mat_wider_2026_05_31.glb",
  "/3d-models/frames/red_cardinal_snowing_in_winter.glb",
  "/3d-models/frames/thin_brass_2026_05_31.glb",
  "/3d-models/frames/old_soviet_paints_first.glb",
  "/3d-models/frames/old_soviet_paints_second.glb",
];

type PropModelCatalogItem = {
  id: string;
  label: string;
  model: string;
  position: VectorTuple;
  rotation: VectorTuple;
  height: number;
};

const builtInPropModels: PropModelCatalogItem[] = [
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
  {
    id: "flor-de-maga-potted",
    label: "Flor de Maga potted plant",
    model: "/3d-models/plants/flor_de_maga_potted_optimized.glb",
    position: [2.32, MODEL_FLOOR_Y, 0.88] as VectorTuple,
    rotation: [0, -0.36, 0] as VectorTuple,
    height: 1.28,
  },
  {
    id: "egyptian-princess-v2",
    label: "Egyptian princess",
    model: "/3d-models/meshy/egyptian_princess_v2.glb",
    position: [2.58, MODEL_FLOOR_Y, 0.92] as VectorTuple,
    rotation: [0, -0.24, 0] as VectorTuple,
    height: 1.18,
  },
  {
    id: "human",
    label: "Reference human",
    model: "/3d-models/humans/human_optimized.glb",
    position: [0.68, MODEL_FLOOR_Y, 0.9] as VectorTuple,
    rotation: [0, 0, 0] as VectorTuple,
    height: 1.72,
  },
  {
    id: "wooden-cross",
    label: "Wooden Cross",
    model: "/3d-models/decor/wooden_cross.glb",
    position: [3.18, 0.82, 0.04] as VectorTuple,
    rotation: [0, 0, 0] as VectorTuple,
    height: 1.1,
  },
  {
    id: "thin-christ",
    label: "Thin Christ",
    model: "/3d-models/decor/thin_christ.glb",
    position: [-1.52, 0.56, 0.03] as VectorTuple,
    rotation: [0, 0, 0] as VectorTuple,
    height: 0.9,
  },
  {
    id: "directors-chair",
    label: "Director's chair",
    model: "/3d-models/decor/directors_chair.glb",
    position: [-3.05, MODEL_FLOOR_Y, 0.95] as VectorTuple,
    rotation: [0, 0.35, 0] as VectorTuple,
    height: 1.15,
  },
];

const optionalPropModels: PropModelCatalogItem[] = optionalModels.map((model) => ({
  ...model,
  position: model.position as VectorTuple,
  rotation: model.rotation as VectorTuple,
}));

const propModels = [...builtInPropModels, ...optionalPropModels];

const deprecatedPropModelIds = new Set(["table-lamp"]);

type SavedCompositeConfig = Partial<{
  id: string;
  kind: string;
  model: string;
  workSlug: string;
  imageSrc: string;
  bioSlug: "yaslynn";
  captionText: string;
  maskShape: string;
  frameWidth: number;
  frameHeight: number;
  frameRotationX: number;
  frameRotationY: number;
  frameRotationZ: number;
  videoX: number;
  videoY: number;
  videoZ: number;
  videoWidth: number;
  videoHeight: number;
  videoZoom: number;
  cropX: number;
  cropY: number;
  imageTintColor: string;
  imageTintStrength: number;
  imageHazeColor: string;
  imageHazeOpacity: number;
}>;

const savedCompositeEntries = savedComposites as SavedCompositeConfig[];
const firstSavedComposite =
  savedCompositeEntries.find(
    (composite) => composite.kind !== "bio-frame" && composite.kind !== "image-frame",
  ) ??
  savedCompositeEntries[0];
const savedBioComposite = savedCompositeEntries.find(
  (composite) => composite.kind === "bio-frame" || composite.id === "bio-yaslynn-frame",
);
const savedFamilyComposite = savedCompositeEntries.find(
  (composite) => composite.kind === "image-frame" || composite.id === "family-portrait-frame",
);
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
  if (
    model === "/3d-models/frames/frame_1_default.glb" ||
    model === "/3d-models/frames/new_frame_default_2026_05_31.glb"
  ) {
    return "/3d-models/frames/new_frame_default_2026_05_31_pbr.glb";
  }

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

function normalizeLayoutOverride(seed: SceneLayoutOverride | undefined) {
  if (!seed) {
    return undefined;
  }

  const normalized: SceneLayoutOverride = {};
  if (typeof seed.visible === "boolean") {
    normalized.visible = seed.visible;
  }
  if (Array.isArray(seed.position) && seed.position.length === 3) {
    normalized.position = seed.position.map((value) => formatNumber(Number(value))) as VectorTuple;
  }
  if (Array.isArray(seed.rotation) && seed.rotation.length === 3) {
    normalized.rotation = seed.rotation.map((value) => formatNumber(Number(value))) as VectorTuple;
  }
  if (Number.isFinite(seed.wallScale)) {
    normalized.wallScale = formatNumber(Number(seed.wallScale));
  }
  if (Number.isFinite(seed.captionOffsetX)) {
    normalized.captionOffsetX = formatNumber(Number(seed.captionOffsetX));
  }
  if (Number.isFinite(seed.captionOffsetY)) {
    normalized.captionOffsetY = formatNumber(Number(seed.captionOffsetY));
  }
  if (Number.isFinite(seed.captionOffsetZ)) {
    normalized.captionOffsetZ = formatNumber(Number(seed.captionOffsetZ));
  }
  if (Number.isFinite(seed.captionScale)) {
    normalized.captionScale = formatNumber(Number(seed.captionScale));
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeLayoutOverrides(seed: SceneLayoutOverrides | undefined) {
  const desktop = normalizeLayoutOverride(seed?.desktop);
  const mobile = normalizeLayoutOverride(seed?.mobile);
  if (!desktop && !mobile) {
    return undefined;
  }
  return { desktop, mobile } satisfies SceneLayoutOverrides;
}

function resolveSceneObjectLayout<T extends SceneObjectSetting>(
  setting: T,
  mode: SceneLayoutMode,
): T {
  const override = setting.layouts?.[mode];
  if (!override) {
    return setting;
  }

  return { ...setting, ...override } as T;
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
    layouts: normalizeLayoutOverrides(seed?.layouts),
    clipX: seed?.clipX ?? firstSavedComposite?.videoX ?? 0,
    clipY: seed?.clipY ?? firstSavedComposite?.videoY ?? 0,
    clipZ: seed?.clipZ ?? firstSavedComposite?.videoZ ?? 0.09,
    clipWidth: seed?.clipWidth ?? firstSavedComposite?.videoWidth ?? 1.2,
    clipHeight: seed?.clipHeight ?? firstSavedComposite?.videoHeight ?? 0.675,
    videoScale: seed?.videoScale ?? firstSavedComposite?.videoZoom ?? 1.25,
    videoOffsetX: clampCropAmount(seed?.videoOffsetX ?? firstSavedComposite?.cropX ?? 0),
    videoOffsetY: clampCropAmount(seed?.videoOffsetY ?? firstSavedComposite?.cropY ?? 0),
    captionOffsetX: formatNumber(
      THREE.MathUtils.clamp(seed?.captionOffsetX ?? 0, -2.813, 2.813),
    ),
    captionOffsetY: formatNumber(
      THREE.MathUtils.clamp(seed?.captionOffsetY ?? -0.18, -3.75, 1.125),
    ),
    captionOffsetZ: formatNumber(
      THREE.MathUtils.clamp(seed?.captionOffsetZ ?? 0.018, -0.095, 0.375),
    ),
    captionScale: formatNumber(
      THREE.MathUtils.clamp(seed?.captionScale ?? 1, 0.132, 4.688),
    ),
  };
}

function createBioFrameSetting(index: number, seed?: Partial<BioFrameSetting>): BioFrameSetting {
  const base = createFrameSetting(index, {
    ...(seed as Partial<FrameSetting>),
    model: seed?.model ?? savedBioComposite?.model ?? "/3d-models/frames/gold_picture_frame_2026_05_31_optimized.glb",
    maskShape: normalizeMaskShape(seed?.maskShape ?? savedBioComposite?.maskShape),
    width: seed?.width ?? savedBioComposite?.frameWidth ?? 1.42,
    height: seed?.height ?? savedBioComposite?.frameHeight ?? 2.02,
    frameRotationX: seed?.frameRotationX ?? savedBioComposite?.frameRotationX ?? 0,
    frameRotationY: seed?.frameRotationY ?? savedBioComposite?.frameRotationY ?? 0,
    frameRotationZ: seed?.frameRotationZ ?? savedBioComposite?.frameRotationZ ?? 0,
    clipX: seed?.clipX ?? savedBioComposite?.videoX ?? 0,
    clipY: seed?.clipY ?? savedBioComposite?.videoY ?? 0,
    clipWidth: seed?.clipWidth ?? savedBioComposite?.videoWidth ?? 0.94,
    clipHeight: seed?.clipHeight ?? savedBioComposite?.videoHeight ?? 1.42,
    clipZ: seed?.clipZ ?? savedBioComposite?.videoZ ?? 0.09,
    videoScale: seed?.videoScale ?? savedBioComposite?.videoZoom ?? 1,
    videoOffsetX: seed?.videoOffsetX ?? savedBioComposite?.cropX ?? 0,
    videoOffsetY: seed?.videoOffsetY ?? savedBioComposite?.cropY ?? 0,
    captionOffsetY: seed?.captionOffsetY ?? -0.22,
    captionScale: seed?.captionScale ?? 0.82,
  });
  return {
    ...base,
    id: seed?.id ?? "bio-yaslynn-frame",
    kind: "bio-frame",
    label: seed?.label ?? "Bio portrait",
    imageSrc: safeAssetPath(seed?.imageSrc ?? savedBioComposite?.imageSrc, BIO_FRAME_IMAGE_PATH),
    bioSlug: seed?.bioSlug ?? "yaslynn",
    captionText: seed?.captionText ?? savedBioComposite?.captionText ?? "About the Director",
    position: seed?.position ?? [2.55, 0.92, 0],
    rotation: seed?.rotation ?? [0, -0.03, -0.012],
    wallScale: seed?.wallScale ?? 0.78,
    layouts: normalizeLayoutOverrides(seed?.layouts),
  };
}

function createImageFrameSetting(index: number, seed?: Partial<ImageFrameSetting>): ImageFrameSetting {
  const base = createFrameSetting(index, {
    ...(seed as Partial<FrameSetting>),
    model: seed?.model ?? savedFamilyComposite?.model ?? "/3d-models/frames/photo_frame_with_mat_2026_05_31.glb",
    maskShape: normalizeMaskShape(seed?.maskShape ?? savedFamilyComposite?.maskShape),
    width: seed?.width ?? savedFamilyComposite?.frameWidth ?? 1.9,
    height: seed?.height ?? savedFamilyComposite?.frameHeight ?? 1.3,
    frameRotationX: seed?.frameRotationX ?? savedFamilyComposite?.frameRotationX ?? 0,
    frameRotationY: seed?.frameRotationY ?? savedFamilyComposite?.frameRotationY ?? 0,
    frameRotationZ: seed?.frameRotationZ ?? savedFamilyComposite?.frameRotationZ ?? 0,
    clipX: seed?.clipX ?? savedFamilyComposite?.videoX ?? 0,
    clipY: seed?.clipY ?? savedFamilyComposite?.videoY ?? 0,
    clipWidth: seed?.clipWidth ?? savedFamilyComposite?.videoWidth ?? 1.46,
    clipHeight: seed?.clipHeight ?? savedFamilyComposite?.videoHeight ?? 1,
    clipZ: seed?.clipZ ?? savedFamilyComposite?.videoZ ?? 0.09,
    videoScale: seed?.videoScale ?? savedFamilyComposite?.videoZoom ?? 1,
    videoOffsetX: seed?.videoOffsetX ?? savedFamilyComposite?.cropX ?? 0,
    videoOffsetY: seed?.videoOffsetY ?? savedFamilyComposite?.cropY ?? 0,
    captionOffsetY: seed?.captionOffsetY ?? -0.16,
    captionScale: seed?.captionScale ?? 1,
  });
  return {
    ...base,
    id: seed?.id ?? "family-portrait-frame",
    kind: "image-frame",
    label: seed?.label ?? "Family portrait",
    imageSrc: safeAssetPath(seed?.imageSrc ?? savedFamilyComposite?.imageSrc, FAMILY_FRAME_IMAGE_PATH),
    captionText: seed?.captionText ?? savedFamilyComposite?.captionText ?? "",
    imageTintColor: normalizeHexColor(
      seed?.imageTintColor ?? savedFamilyComposite?.imageTintColor,
      "#ead8bf",
    ),
    imageTintStrength: normalizeImageTintStrength(
      seed?.imageTintStrength ?? savedFamilyComposite?.imageTintStrength,
      0.05,
    ),
    imageHazeColor: normalizeHexColor(
      seed?.imageHazeColor ?? savedFamilyComposite?.imageHazeColor,
      "#ead8bf",
    ),
    imageHazeOpacity: normalizeImageHazeOpacity(
      seed?.imageHazeOpacity ?? savedFamilyComposite?.imageHazeOpacity,
      0.08,
    ),
    position: seed?.position ?? [-0.05, 1.1, -0.03],
    rotation: seed?.rotation ?? [0, 0.02, -0.01],
    wallScale: seed?.wallScale ?? 0.82,
    layouts: normalizeLayoutOverrides(seed?.layouts),
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
    layouts: normalizeLayoutOverrides(seed?.layouts),
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
    layouts: normalizeLayoutOverrides(seed?.layouts),
  };
}

function createAlcoveSetting(seed?: Partial<AlcoveSetting>): AlcoveSetting {
  return {
    id: seed?.id ?? `alcove-${Date.now().toString(36)}`,
    kind: "alcove",
    label: seed?.label ?? "Prayer niche",
    visible: seed?.visible ?? true,
    position: seed?.position ?? [0, 0.35, WALL_FRONT_Z + 0.012],
    rotation: seed?.rotation ?? [0, 0, 0],
    wallScale: seed?.wallScale ?? 1,
    layouts: normalizeLayoutOverrides(seed?.layouts),
    nicheWidth: seed?.nicheWidth ?? 1.35,
    nicheStraightHeight: seed?.nicheStraightHeight ?? 1.35,
    nicheArchHeight: seed?.nicheArchHeight ?? 0.68,
    nicheDepth: seed?.nicheDepth ?? 0.18,
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
    layouts: normalizeLayoutOverrides(seed?.layouts),
    color: seed?.color ?? "#ffd08a",
    intensity: seed?.intensity ?? 5.5,
    distance: seed?.distance ?? 3.2,
    decay: seed?.decay ?? 1.8,
    enabled: seed?.enabled ?? true,
  };
}

function createCandleAccentLightSetting(seed?: Partial<LightSetting>): LightSetting {
  return createLightSetting({
    label: "Candle accent light",
    wallScale: 0.08,
    color: "#ffb36b",
    intensity: 1.8,
    distance: 2.6,
    decay: 2,
    ...seed,
  });
}

function isCandleAccentLight(setting: SceneObjectSetting): setting is LightSetting {
  return (
    setting.kind === "light" &&
    (setting.label === "Candle accent light" || setting.id.startsWith("candle-accent-light-"))
  );
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
    layouts: normalizeLayoutOverrides(seed?.layouts),
    action: seed?.action ?? "toggle-nearest-light",
  };
}

function createCandleCompositeSetting(
  seed?: Partial<CandleCompositeSetting>,
): CandleCompositeSetting {
  return {
    id: seed?.id ?? `candle-composite-${Date.now().toString(36)}`,
    kind: "candle-composite",
    label: seed?.label ?? "Candle holder",
    visible: seed?.visible ?? true,
    position: seed?.position ?? [-3.08, -1.1, 0.18],
    rotation: seed?.rotation ?? [0, 0.08, 0],
    wallScale: seed?.wallScale ?? 0.92,
    layouts: normalizeLayoutOverrides(seed?.layouts),
    holderModel: seed?.holderModel ?? CANDLE_HOLDER_MODEL_PATH,
    candleModel: seed?.candleModel ?? CANDLE_MODEL_PATH,
    separateCandleModel: seed?.separateCandleModel ?? true,
    flameTexture: seed?.flameTexture ?? CANDLE_FLAME_TEXTURE_PATH,
    candleOffset: seed?.candleOffset ?? [0, 0.42, 0.02],
    candleScale: seed?.candleScale ?? 0.46,
    flameOffset: seed?.flameOffset ?? [0, 0.9, 0.08],
    flameScale: seed?.flameScale ?? 0.46,
    flameOpacity: seed?.flameOpacity ?? 0.92,
    flameLightColor: seed?.flameLightColor ?? "#ffb86b",
    flameLightIntensity: seed?.flameLightIntensity ?? 0.3,
    flameLightDistance: seed?.flameLightDistance ?? 1.1,
  };
}

function createClaySaucerCandleSetting(
  seed?: Partial<CandleCompositeSetting>,
): CandleCompositeSetting {
  return createCandleCompositeSetting({
    label: "Low-poly candle on clay saucer",
    holderModel: CLAY_SAUCER_CANDLE_MODEL_PATH,
    separateCandleModel: false,
    candleOffset: [0, 0, 0],
    candleScale: 1,
    flameOffset: [0, 0.98, 0.02],
    flameScale: 0.075,
    flameOpacity: 0.92,
    flameLightColor: "#ffb86b",
    flameLightIntensity: 0.1,
    flameLightDistance: 4,
    ...seed,
  });
}

function createSpeakerCompositeSetting(
  seed?: Partial<SpeakerCompositeSetting>,
): SpeakerCompositeSetting {
  return {
    id: seed?.id ?? `speaker-composite-${Date.now().toString(36)}`,
    kind: "speaker-composite",
    label: seed?.label ?? "Portable Bluetooth speaker",
    visible: seed?.visible ?? true,
    position: seed?.position ?? [-1.2, MODEL_FLOOR_Y, 0.72],
    rotation: seed?.rotation ?? [0, 0.16, 0],
    wallScale: seed?.wallScale ?? 0.42,
    layouts: normalizeLayoutOverrides(seed?.layouts),
    speakerModel: seed?.speakerModel ?? SPEAKER_MODEL_PATH,
    hitboxOffset: seed?.hitboxOffset ?? [0, 0.48, 0],
    hitboxSize: seed?.hitboxSize ?? [0.72, 0.52, 0.5],
    action: seed?.action ?? "speaker-click",
  };
}

const defaultSceneSettings = [
  createFrameSetting(0, {
    id: "frame-02",
    label: "Director reel",
    model: "/3d-models/frames/vintage_frame_06.glb",
    workSlug: "yaslynn-director-reel",
    maskShape: "rectangle",
    position: [-0.16, 1.04, -0.02],
    width: 2.3,
    height: 2.34,
    frameRotationX: -0.001592653589793,
    frameRotationY: -0.001592653589793,
    frameRotationZ: -1.57159265358979,
    rotation: [0, 0.008407346410207, 0.008407346410207],
    wallScale: 1.24,
    clipX: 0.011,
    clipY: -0.026,
    clipZ: -0.01,
    clipWidth: 2.789,
    clipHeight: 1.9290039032006248,
    videoScale: 1.25,
    videoOffsetX: 0.12,
    videoOffsetY: 0.06,
    captionOffsetX: 0,
    captionOffsetY: -0.13,
    captionOffsetZ: 0.146,
    captionScale: 2.03,
    layouts: { desktop: { visible: false } },
  }),
  createCandleCompositeSetting({
    id: "candle-holder-composite",
    position: [1.48, 0.14, 0.065],
    rotation: [-0.011592653589793, 0.028407346410207, -0.001592653589793],
    wallScale: 0.92,
    holderModel: "/3d-models/candle-and-holder/holder.glb",
    candleModel: "/3d-models/candle-and-holder/candle_no_flame_shorter.glb",
    flameTexture: "/3d-models/candle-and-holder/candleflame_atlas.png",
    candleOffset: [0, 0.015, 0.05],
    candleScale: 0.58,
    flameOffset: [0, 0.61, 0.05],
    flameScale: 0.065,
    flameOpacity: 0.92,
    flameLightColor: "#ffb86b",
    flameLightIntensity: 0.1,
    flameLightDistance: 4,
    layouts: { desktop: { visible: false } },
  }),
  createClaySaucerCandleSetting({
    id: "clay-saucer-candle-composite",
    visible: false,
    position: [0, 0, 0.08],
    rotation: [0, 0, 0],
    wallScale: 0.8,
    layouts: {
      desktop: { visible: false },
      mobile: { visible: false },
    },
  }),
  createClockSetting({
    id: "clock-vintage-wall",
    label: "Vintage clock",
    position: [-2.78, 0.78, -0.105],
    rotation: [0, 0.038407346410207, -0.001592653589793],
    wallScale: 0.82,
    layouts: { desktop: { visible: false } },
  }),
  createAlcoveSetting({
    id: "desktop-prayer-niche",
    label: "Prayer niche",
    position: [0, 0.15, WALL_FRONT_Z + 0.012],
    wallScale: 1,
    nicheWidth: 1.35,
    nicheStraightHeight: 1.35,
    nicheArchHeight: 0.68,
    nicheDepth: 0.18,
    layouts: {
      desktop: { visible: true },
      mobile: { visible: false },
    },
  }),
] satisfies SceneObjectSetting[];

const defaultSceneLighting: SceneLighting = {
  ambientColor: "#aa9f8d",
  ambientIntensity: 0.268,
  keyColor: "#ffb36e",
  keyIntensity: 1.404,
  keyPosition: [-0.113, 2.708, 0.531],
  fillColor: "#6a7595",
  fillIntensity: 2.22,
  fillPosition: [4.458, 3.474, 5.032],
  exposure: 1.207,
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

function normalizeHexColor(value: string | undefined, fallback: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function normalizeImageTintStrength(value: number | undefined, fallback = 0) {
  return formatNumber(THREE.MathUtils.clamp(value ?? fallback, 0, 0.563));
}

function normalizeImageHazeOpacity(value: number | undefined, fallback = 0) {
  return formatNumber(THREE.MathUtils.clamp(value ?? fallback, 0, 0.657));
}

function makeMaterial<T extends THREE.Material>(material: T, disposables: THREE.Material[]) {
  disposables.push(material);
  return material;
}

type FrameMediaGrayscaleStrength = { value: number };

function addFrameMediaGrayscale(
  material: THREE.MeshBasicMaterial,
  initialStrength = 1,
): FrameMediaGrayscaleStrength {
  const grayscaleStrength = { value: initialStrength };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.frameMediaGrayscale = grayscaleStrength;
    shader.fragmentShader = `uniform float frameMediaGrayscale;\n${shader.fragmentShader}`;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
       float frameMediaLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
       float frameMediaContrast = clamp((frameMediaLuma - 0.5) * 1.08 + 0.485, 0.0, 1.0);
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(frameMediaContrast), frameMediaGrayscale);`,
    );
  };
  material.customProgramCacheKey = () => "frame-media-grayscale-v6";
  return grayscaleStrength;
}

function makeGeometry<T extends THREE.BufferGeometry>(
  geometry: T,
  disposables: THREE.BufferGeometry[],
) {
  disposables.push(geometry);
  return geometry;
}

function visibleSize(setting: FrameLikeSetting) {
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
  options: { loop?: boolean; posterTime?: number },
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
  video.dataset.posterTime = String(Math.max(0, options.posterTime ?? 0));
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

  // Scene initialization seeks this video to its canonical poster time and
  // briefly primes a decoded frame while the loading screen is still visible.
  // createFrame() still decides whether it later plays (motion clip) or stays
  // frozen (poster clip).
  videos.push(video);
  textures.push(texture);
  return { texture, video };
}

function applyVideoCrop(target: THREE.Texture | THREE.Texture[], setting: FrameLikeSetting) {
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
  setting: FrameLikeSetting,
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
  color: string,
  textures: THREE.Texture[],
) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const canvasHeight = lines.length > 1 ? 224 : 192;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create caption canvas.");
  }

  const readinessDescriptor = captionFontDescriptor(font);
  if (document.fonts && !document.fonts.check(readinessDescriptor, text)) {
    throw new Error(`Caption font was not ready: ${font.label}`);
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const drawCaptionText = (line: string, x: number, y: number) => {
    ctx.fillText(line, x, y);
  };

  const maxWidth = canvas.width - 96;
  const fitText = (line: string, startSize: number, minSize: number) => {
    let fontSize = startSize;
    do {
      ctx.font = `${font.fontWeight} ${fontSize}px ${font.fontFamily}`;
      if (ctx.measureText(line).width <= maxWidth || fontSize <= minSize) {
        break;
      }
      fontSize -= 4;
    } while (fontSize > minSize);
    return fontSize;
  };

  if (lines.length > 1) {
    const lineStartSize = font.id === "winky-show" ? 135 : font.id === "sobria" ? 78 : 84;
    const fontSize = Math.min(...lines.map((line) => fitText(line, lineStartSize, 44)));
    ctx.font = `${font.fontWeight} ${fontSize}px ${font.fontFamily}`;
    lines.forEach((line, index) => {
      drawCaptionText(line, canvas.width / 2, index === 0 ? 78 : 174);
    });
  } else {
    const line = lines[0] ?? text;
    const lineStartSize = font.id === "winky-show" ? 180 : font.id === "sobria" ? 96 : 104;
    const fontSize = fitText(line, lineStartSize, 46);
    ctx.font = `${font.fontWeight} ${fontSize}px ${font.fontFamily}`;
    drawCaptionText(line, canvas.width / 2, canvas.height / 2 + 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  textures.push(texture);
  return texture;
}

function createFrameCaptionMesh(
  setting: FrameLikeSetting,
  artist: string,
  font: CaptionFontOption,
  color: string,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
  textures: THREE.Texture[],
) {
  const aperture = visibleSize(setting);
  const texture = createFrameCaptionTexture(artist, font, color, textures);
  const multilineCaption = artist.includes("\n");
  const textureHeight = multilineCaption ? 224 : 192;
  const height = multilineCaption
    ? THREE.MathUtils.clamp(aperture.height * 0.28, 0.18, 0.34) * (textureHeight / 192)
    : THREE.MathUtils.clamp(aperture.height * 0.2, 0.13, 0.27);
  const width = height * (1024 / textureHeight);
  const mesh = new THREE.Mesh(
    makeGeometry(new THREE.PlaneGeometry(width, height), geometries),
    makeMaterial(
      new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 1,
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
  mesh.visible = true;
  mesh.renderOrder = 2;
  mesh.userData.isFrameCaption = true;
  return mesh;
}

function createFrameInteractionMesh(
  setting: FrameLikeSetting,
  frameClip: THREE.Mesh,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
) {
  const hitMesh = new THREE.Mesh(
    makeGeometry(
      new THREE.PlaneGeometry(
        Math.max(0.04, setting.width),
        Math.max(0.04, setting.height),
      ),
      geometries,
    ),
    makeMaterial(
      new THREE.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
        opacity: 0,
        transparent: true,
        side: THREE.DoubleSide,
      }),
      materials,
    ),
  );
  hitMesh.position.set(0, 0, setting.clipZ + 0.02);
  hitMesh.userData.isFrameHitTarget = true;
  hitMesh.userData.frameClip = frameClip;
  hitMesh.userData.sceneObjectId = setting.id;
  return hitMesh;
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
  captionColor: string,
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
  const { texture: stillTexture } = createVideoTexture(
    work.clipSrc,
    { loop: false, posterTime },
    textures,
    videos,
    onSceneError,
  );
  const { texture: motionTexture, video: motionVideo } = createVideoTexture(
    work.clipSrc,
    { loop: true, posterTime },
    textures,
    videos,
    onSceneError,
  );

  applyVideoCrop([stillTexture, motionTexture], setting);

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
  addFrameMediaGrayscale(videoMaterial);
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
  group.add(createFrameInteractionMesh(setting, videoMesh, geometries, materials));

  if (captionPlacement === "frame") {
    const captionText =
      setting.workSlug === "yaslynn-director-reel" ? "Director's\nReel" : work.artist;
    const captionMesh = createFrameCaptionMesh(
      setting,
      captionText,
      captionFont,
      captionColor,
      geometries,
      materials,
      textures,
    );
    videoMesh.userData.captionMesh = captionMesh;
    group.add(captionMesh);
  }

  return group;
}

function createImageTexture(
  source: string,
  textures: THREE.Texture[],
  onSceneError: (error: Error) => void,
) {
  const texture = new THREE.TextureLoader().load(
    source,
    undefined,
    undefined,
    () => onSceneError(new Error(`Image failed to load: ${source}`)),
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textures.push(texture);
  return texture;
}

function createImageFrame(
  setting: BioFrameSetting | ImageFrameSetting,
  sourceModel: THREE.Object3D,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
  textures: THREE.Texture[],
  captionFont: CaptionFontOption,
  captionColor: string,
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

  const imageTexture = createImageTexture(setting.imageSrc, textures, onSceneError);
  applyVideoCrop(imageTexture, setting);
  const clipShape = createClipGeometry(setting, geometries);
  const imageTint =
    setting.kind === "image-frame"
      ? new THREE.Color("#ffffff").lerp(
          new THREE.Color(setting.imageTintColor),
          setting.imageTintStrength,
        )
      : new THREE.Color("#ffffff");
  const imageMaterial = makeMaterial(
    new THREE.MeshBasicMaterial({
      map: imageTexture,
      color: imageTint,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
    materials,
  );
  const isNavigationImage =
    setting.kind === "bio-frame" ||
    setting.captionText.trim().toLowerCase() === "stills" ||
    setting.captionText.trim().toLowerCase() === "clients";
  let imageMeshGrayscaleStrength: FrameMediaGrayscaleStrength | undefined;
  if (isNavigationImage) {
    imageMeshGrayscaleStrength = addFrameMediaGrayscale(imageMaterial, 0);
  }
  const imageMesh = new THREE.Mesh(clipShape.geometry, imageMaterial);
  imageMesh.scale.copy(clipShape.scale);
  imageMesh.position.set(setting.clipX, setting.clipY, setting.clipZ);
  imageMesh.renderOrder = 0;
  imageMesh.userData.isFrameClip = true;
  imageMesh.userData.grayscaleStrength = imageMeshGrayscaleStrength;
  if (setting.kind === "bio-frame") {
    imageMesh.userData.bioSlug = setting.bioSlug;
  } else {
    const modalId = setting.captionText.trim().toLowerCase();
    if (modalId === "stills" || modalId === "clients") {
      imageMesh.userData.imageFrameModalId = modalId satisfies ImageFrameModalId;
    }
  }
  imageMesh.userData.sceneObjectId = setting.id;
  group.add(imageMesh);
  group.add(createFrameInteractionMesh(setting, imageMesh, geometries, materials));

  if (setting.kind === "image-frame" && setting.imageHazeOpacity > 0.001) {
    const hazeMaterial = makeMaterial(
      new THREE.MeshBasicMaterial({
        color: setting.imageHazeColor,
        transparent: true,
        opacity: setting.imageHazeOpacity,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
      materials,
    );
    if (isNavigationImage) {
      addFrameMediaGrayscale(hazeMaterial);
    }
    const hazeMesh = new THREE.Mesh(clipShape.geometry, hazeMaterial);
    hazeMesh.scale.copy(clipShape.scale);
    hazeMesh.position.set(setting.clipX, setting.clipY, setting.clipZ + 0.002);
    hazeMesh.renderOrder = 1;
    group.add(hazeMesh);
  }

  if (captionPlacement === "frame" && setting.captionText.trim().length > 0) {
    const captionMesh = createFrameCaptionMesh(
      setting,
      setting.captionText,
      captionFont,
      captionColor,
      geometries,
      materials,
      textures,
    );
    imageMesh.userData.captionMesh = captionMesh;
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
  hitZone.userData.isClickZone = true;
  hitZone.userData.clickAction = setting.action;
  group.add(hitZone);

  return group;
}

function createSpeakerCompositeObject(
  setting: SpeakerCompositeSetting,
  sourceModel: THREE.Object3D,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
) {
  const group = new THREE.Group();
  group.name = "editable-speaker-composite";
  applyObjectPlacement(group, setting);

  const speaker = createNormalizedModel(sourceModel);
  speaker.name = "speaker-composite-model";
  speaker.userData.baseScale = speaker.scale.clone();
  group.add(speaker);

  const hitZone = new THREE.Mesh(
    makeGeometry(new THREE.BoxGeometry(1, 1, 1), geometries),
    makeMaterial(
      new THREE.MeshBasicMaterial({
        color: "#38bdf8",
        depthWrite: false,
        opacity: 0,
        transparent: true,
        wireframe: true,
      }),
      materials,
    ),
  );
  hitZone.name = SPEAKER_CLICK_ZONE_NAME;
  hitZone.castShadow = false;
  hitZone.receiveShadow = false;
  hitZone.renderOrder = 20;
  hitZone.userData.isClickZone = true;
  hitZone.userData.clickAction = setting.action;
  group.add(hitZone);
  syncSpeakerCompositeObject(group, setting);

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

function createNormalizedModel(sourceModel: THREE.Object3D) {
  const model = sourceModel.clone(true);
  const modelBox = new THREE.Box3().setFromObject(model);
  const modelSize = modelBox.getSize(new THREE.Vector3());
  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  const normalizingScale = modelSize.y > 0 ? 1 / modelSize.y : 1;

  model.position.set(-modelCenter.x * normalizingScale, -modelBox.min.y * normalizingScale, -modelCenter.z * normalizingScale);
  model.scale.setScalar(normalizingScale);
  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  return model;
}

function createAnimatedImageTexture(
  source: string,
  textures: THREE.Texture[],
  onSceneError: (error: Error) => void,
) {
  const texture = new THREE.TextureLoader().load(
    source,
    undefined,
    undefined,
    () => onSceneError(new Error(`Image failed to load: ${source}`)),
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1 / candleFlameAtlas.columns, 1 / candleFlameAtlas.rows);
  updateAnimatedImageTexture(texture, 0);

  textures.push(texture);
  return texture;
}

function updateAnimatedImageTexture(texture: THREE.Texture, timeSeconds: number) {
  const frame = Math.floor((timeSeconds * 1000) / candleFlameAtlas.frameDurationMs) %
    candleFlameAtlas.frameCount;
  if (texture.userData.currentFrame === frame) {
    return;
  }

  const column = frame % candleFlameAtlas.columns;
  const row = Math.floor(frame / candleFlameAtlas.columns);
  texture.offset.set(
    column / candleFlameAtlas.columns,
    1 - (row + 1) / candleFlameAtlas.rows,
  );
  texture.userData.currentFrame = frame;
}

function createSpeakerAudioChain(): SpeakerAudioChain {
  const context = new AudioContext();
  const element = new Audio(SPEAKER_MUSIC_AUDIO_PATH);
  element.preload = "auto";
  element.loop = true;
  element.volume = 0.21;

  const source = context.createMediaElementSource(element);

  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 95;
  highpass.Q.value = 0.55;

  const lowpass = context.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 1150;
  lowpass.Q.value = 0.65;

  const roomTone = context.createBiquadFilter();
  roomTone.type = "lowshelf";
  roomTone.frequency.value = 420;
  roomTone.gain.value = -2.5;

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 24;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.012;
  compressor.release.value = 0.28;

  const outputGain = context.createGain();
  outputGain.gain.value = 0.32;

  source
    .connect(highpass)
    .connect(lowpass)
    .connect(roomTone)
    .connect(compressor)
    .connect(outputGain)
    .connect(context.destination);

  return { context, element };
}

function syncCandleCompositeObject(group: THREE.Group, setting: CandleCompositeSetting) {
  const candleRoot = group.getObjectByName("candle-composite-candle-root");
  if (candleRoot) {
    candleRoot.position.set(...setting.candleOffset);
    candleRoot.scale.setScalar(setting.candleScale);
  }

  const flame = group.getObjectByName("candle-composite-flame");
  if (flame instanceof THREE.Mesh) {
    flame.position.set(...setting.flameOffset);
    flame.scale.setScalar(setting.flameScale);
    if (flame.material instanceof THREE.MeshBasicMaterial) {
      flame.material.opacity = setting.flameOpacity;
      flame.material.needsUpdate = true;
    }
  }

  const light = group.getObjectByName("candle-composite-flame-light");
  if (light instanceof THREE.PointLight) {
    light.position.set(...setting.flameOffset);
    light.color.set(setting.flameLightColor);
    light.intensity = setting.flameLightIntensity;
    light.distance = setting.flameLightDistance;
  }
}

function syncCandleCompositeAnimation(
  group: THREE.Group,
  camera: THREE.Camera,
  timeSeconds: number,
) {
  const flame = group.getObjectByName("candle-composite-flame");
  if (!(flame instanceof THREE.Mesh)) {
    return;
  }

  flame.lookAt(camera.position);
  const texture = flame.userData.animatedTexture as THREE.Texture | undefined;
  if (texture) {
    updateAnimatedImageTexture(texture, timeSeconds);
  }
}

function createCandleCompositeObject(
  setting: CandleCompositeSetting,
  sourceModels: Map<string, THREE.Object3D>,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
  textures: THREE.Texture[],
  onSceneError: (error: Error) => void,
) {
  const holderSource = sourceModels.get(setting.holderModel);
  const candleSource = setting.separateCandleModel
    ? sourceModels.get(setting.candleModel)
    : undefined;
  if (!holderSource || (setting.separateCandleModel && !candleSource)) {
    throw new Error("Candle composite model assets did not load.");
  }

  const group = new THREE.Group();
  group.name = "editable-candle-composite";
  applyObjectPlacement(group, setting);

  const holder = createNormalizedModel(holderSource);
  holder.name = "candle-composite-holder";
  group.add(holder);

  const candleRoot = new THREE.Group();
  candleRoot.name = "candle-composite-candle-root";
  if (candleSource) {
    candleRoot.add(createNormalizedModel(candleSource));
  }
  group.add(candleRoot);

  const flameTexture = createAnimatedImageTexture(
    resolveModelAssetUrl(setting.flameTexture),
    textures,
    onSceneError,
  );
  const flameMaterial = makeMaterial(
    new THREE.MeshBasicMaterial({
      map: flameTexture,
      transparent: true,
      opacity: setting.flameOpacity,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
    }),
    materials,
  );
  const flame = new THREE.Mesh(
    makeGeometry(new THREE.PlaneGeometry(0.3, 1), geometries),
    flameMaterial,
  );
  flame.name = "candle-composite-flame";
  flame.renderOrder = 10;
  flame.userData.isCandleFlameBillboard = true;
  flame.userData.animatedTexture = flameTexture;
  group.add(flame);

  const flameLight = new THREE.PointLight(
    new THREE.Color(setting.flameLightColor),
    setting.flameLightIntensity,
    setting.flameLightDistance,
    1.85,
  );
  flameLight.name = "candle-composite-flame-light";
  flameLight.castShadow = false;
  group.add(flameLight);

  syncCandleCompositeObject(group, setting);
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
  marker.visible = false;
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
  halo.visible = false;
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
  extractClockPendulum(model);
  const modelBox = new THREE.Box3().setFromObject(model);
  const modelSize = modelBox.getSize(new THREE.Vector3());
  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  const modelScale = modelSize.y > 0 ? clockComposite.clockHeight / modelSize.y : 1;
  const modelRoot = new THREE.Group();
  modelRoot.name = "live-clock-case-root";
  modelRoot.position.set(clockComposite.modelX, clockComposite.modelY, clockComposite.modelZ);
  modelRoot.rotation.x = clockComposite.modelRotationX;
  model.name = "live-clock-case";
  model.position.set(
    -modelCenter.x * modelScale,
    -modelCenter.y * modelScale,
    -modelCenter.z * modelScale,
  );
  model.scale.setScalar(modelScale);
  prepareStaticModel(model);
  modelRoot.add(model);
  group.add(modelRoot);

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

  const hourHand = minuteSource.clone(true);
  hourHand.name = "live-clock-hour-hand";
  hourHand.position.set(
    clockComposite.hourHandX,
    clockComposite.hourHandY,
    clockComposite.hourHandZ,
  );
  hourHand.scale.setScalar(clockComposite.hourScale);
  hourHand.visible = clockComposite.showHourHand;
  prepareStaticModel(hourHand);
  handsRoot.add(hourHand);

  const minuteHand = hourSource.clone(true);
  minuteHand.name = "live-clock-minute-hand";
  minuteHand.position.set(
    clockComposite.minuteHandX,
    clockComposite.minuteHandY,
    clockComposite.minuteHandZ,
  );
  minuteHand.scale.setScalar(clockComposite.minuteScale);
  minuteHand.visible = clockComposite.showMinuteHand;
  prepareStaticModel(minuteHand);
  handsRoot.add(minuteHand);

  const secondHand = secondSource.clone(true);
  secondHand.name = "live-clock-second-hand";
  secondHand.position.set(
    clockComposite.secondHandX,
    clockComposite.secondHandY,
    clockComposite.secondHandZ,
  );
  secondHand.scale.setScalar(clockComposite.secondScale);
  secondHand.visible = clockComposite.showSecondHand;
  prepareStaticModel(secondHand);
  handsRoot.add(secondHand);

  syncClockHands(group);
  return group;
}

function createAlcoveObject(setting: AlcoveSetting) {
  const group = new THREE.Group();
  group.name = "editable-alcove";
  applyObjectPlacement(group, setting);
  return group;
}

type AlcoveCutDimensions = {
  centerX: number;
  bottom: number;
  shoulder: number;
  halfWidth: number;
  archHeight: number;
  depth: number;
};

function alcoveCutDimensions(setting: AlcoveSetting): AlcoveCutDimensions {
  const scale = Math.max(0.01, setting.wallScale);
  const width = Math.max(0.2, setting.nicheWidth * scale);
  const straightHeight = Math.max(0.2, setting.nicheStraightHeight * scale);
  const archHeight = Math.max(0.08, setting.nicheArchHeight * scale);
  const totalHeight = straightHeight + archHeight;
  const bottom = setting.position[1] - totalHeight / 2;

  return {
    centerX: setting.position[0],
    bottom,
    shoulder: bottom + straightHeight,
    halfWidth: width / 2,
    archHeight,
    depth: Math.max(0.01, setting.nicheDepth),
  };
}

function createArchedOpeningPath(dimensions: AlcoveCutDimensions) {
  const { centerX, bottom, shoulder, halfWidth, archHeight } = dimensions;
  const path = new THREE.Path();
  path.moveTo(centerX - halfWidth, bottom);
  path.lineTo(centerX - halfWidth, shoulder);
  path.absellipse(centerX, shoulder, halfWidth, archHeight, Math.PI, 0, true);
  path.lineTo(centerX + halfWidth, bottom);
  path.closePath();
  return path;
}

function createArchedBackShape(dimensions: AlcoveCutDimensions) {
  const { centerX, bottom, shoulder, halfWidth, archHeight } = dimensions;
  const shape = new THREE.Shape();
  shape.moveTo(centerX - halfWidth, bottom);
  shape.lineTo(centerX + halfWidth, bottom);
  shape.lineTo(centerX + halfWidth, shoulder);
  shape.absellipse(centerX, shoulder, halfWidth, archHeight, 0, Math.PI, false);
  shape.lineTo(centerX - halfWidth, bottom);
  shape.closePath();
  return shape;
}

function setWallSurfaceUvs(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const uvs = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    uvs[index * 2] = (position.getX(index) + ENVIRONMENT_WIDTH / 2) / ENVIRONMENT_WIDTH;
    uvs[index * 2 + 1] = (position.getY(index) - WALL_BOTTOM_Y) / WALL_HEIGHT;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
}

function createTunnelQuad(points: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(points.flatMap((point) => point.toArray()), 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2),
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.computeVertexNormals();
  return geometry;
}

function createArchedTunnelGeometry(
  dimensions: AlcoveCutDimensions,
  frontZ: number,
  backZ: number,
) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const segments = 64;

  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments;
    const angle = progress * Math.PI;
    const x = dimensions.centerX + Math.cos(angle) * dimensions.halfWidth;
    const y = dimensions.shoulder + Math.sin(angle) * dimensions.archHeight;
    positions.push(x, y, frontZ, x, y, backZ);
    uvs.push(progress, 0, progress, 1);
    if (index < segments) {
      const vertex = index * 2;
      indices.push(vertex, vertex + 1, vertex + 3, vertex, vertex + 3, vertex + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createWallArchitecture(
  setting: AlcoveSetting | undefined,
  wallMaterial: THREE.MeshStandardMaterial,
) {
  const group = new THREE.Group();
  group.name = "room-wall-architecture";

  const wallShape = new THREE.Shape();
  wallShape.moveTo(-ENVIRONMENT_WIDTH / 2, WALL_BOTTOM_Y);
  wallShape.lineTo(ENVIRONMENT_WIDTH / 2, WALL_BOTTOM_Y);
  wallShape.lineTo(ENVIRONMENT_WIDTH / 2, WALL_TOP_Y);
  wallShape.lineTo(-ENVIRONMENT_WIDTH / 2, WALL_TOP_Y);
  wallShape.closePath();

  const dimensions = setting ? alcoveCutDimensions(setting) : null;
  if (dimensions) {
    wallShape.holes.push(createArchedOpeningPath(dimensions));
  }

  const wallGeometry = new THREE.ShapeGeometry(wallShape, 64);
  setWallSurfaceUvs(wallGeometry);
  const wall = new THREE.Mesh(wallGeometry, wallMaterial);
  wall.name = "room-wall-front";
  wall.position.z = WALL_FRONT_Z;
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  if (!dimensions) {
    return group;
  }

  const frontZ = WALL_FRONT_Z - 0.002;
  const backZ = WALL_FRONT_Z - dimensions.depth;
  const leftX = dimensions.centerX - dimensions.halfWidth;
  const rightX = dimensions.centerX + dimensions.halfWidth;

  const backGeometry = new THREE.ShapeGeometry(createArchedBackShape(dimensions), 64);
  setWallSurfaceUvs(backGeometry);
  const back = new THREE.Mesh(backGeometry, wallMaterial);
  back.name = "alcove-cut-back";
  back.position.z = backZ;
  back.receiveShadow = true;
  group.add(back);

  const left = new THREE.Mesh(
    createTunnelQuad([
      new THREE.Vector3(leftX, dimensions.bottom, frontZ),
      new THREE.Vector3(leftX, dimensions.bottom, backZ),
      new THREE.Vector3(leftX, dimensions.shoulder, backZ),
      new THREE.Vector3(leftX, dimensions.shoulder, frontZ),
    ]),
    wallMaterial,
  );
  left.name = "alcove-cut-left";
  left.castShadow = true;
  left.receiveShadow = true;
  group.add(left);

  const right = new THREE.Mesh(
    createTunnelQuad([
      new THREE.Vector3(rightX, dimensions.bottom, frontZ),
      new THREE.Vector3(rightX, dimensions.shoulder, frontZ),
      new THREE.Vector3(rightX, dimensions.shoulder, backZ),
      new THREE.Vector3(rightX, dimensions.bottom, backZ),
    ]),
    wallMaterial,
  );
  right.name = "alcove-cut-right";
  right.castShadow = true;
  right.receiveShadow = true;
  group.add(right);

  const bottom = new THREE.Mesh(
    createTunnelQuad([
      new THREE.Vector3(leftX, dimensions.bottom, frontZ),
      new THREE.Vector3(rightX, dimensions.bottom, frontZ),
      new THREE.Vector3(rightX, dimensions.bottom, backZ),
      new THREE.Vector3(leftX, dimensions.bottom, backZ),
    ]),
    wallMaterial,
  );
  bottom.name = "alcove-cut-bottom";
  bottom.castShadow = true;
  bottom.receiveShadow = true;
  group.add(bottom);

  const arch = new THREE.Mesh(
    createArchedTunnelGeometry(dimensions, frontZ, backZ),
    wallMaterial,
  );
  arch.name = "alcove-cut-arch";
  arch.castShadow = true;
  arch.receiveShadow = true;
  group.add(arch);

  return group;
}

function disposeObjectGeometries(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
    }
  });
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

function syncSpeakerCompositeObject(group: THREE.Group, setting: SpeakerCompositeSetting) {
  const hitZone = group.getObjectByName(SPEAKER_CLICK_ZONE_NAME);
  if (hitZone) {
    hitZone.position.set(...setting.hitboxOffset);
    hitZone.scale.set(...setting.hitboxSize);
    hitZone.userData.clickAction = setting.action;
  }
}

function syncSpeakerCompositePulse(
  group: THREE.Group,
  timeSeconds: number,
  speakerPlaying: boolean,
) {
  const speaker = group.getObjectByName("speaker-composite-model");
  if (!speaker) {
    return;
  }

  const baseScale = speaker.userData.baseScale as THREE.Vector3 | undefined;
  if (!baseScale) {
    speaker.userData.baseScale = speaker.scale.clone();
    return;
  }

  const pulse = speakerPlaying ? 1.0225 + Math.sin(timeSeconds * 8.2) * 0.061875 : 1;
  speaker.scale.copy(baseScale).multiplyScalar(pulse);
}

function syncSceneObject(group: THREE.Group, setting: SceneObjectSetting) {
  if (setting.kind === "light") {
    applyLightPlacement(group, setting);
    syncLightObject(group, setting);
    return;
  }

  applyObjectPlacement(group, setting);

  if (setting.kind === "frame" || setting.kind === "bio-frame" || setting.kind === "image-frame") {
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

  if (setting.kind === "candle-composite") {
    syncCandleCompositeObject(group, setting);
  }

  if (setting.kind === "speaker-composite") {
    syncSpeakerCompositeObject(group, setting);
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

function syncClockPendulum(group: THREE.Object3D, timeSeconds: number) {
  setClockPendulumSwing(
    group.getObjectByName(CLOCK_PENDULUM_GROUP_NAME),
    timeSeconds,
    clockComposite,
  );
}

function sceneModelPaths(settings: SceneObjectSetting[]) {
  const objectModels = settings.flatMap((setting) => {
    if (
      setting.kind === "frame" ||
      setting.kind === "bio-frame" ||
      setting.kind === "image-frame" ||
      setting.kind === "model"
    ) {
      return [safeAssetPath(setting.model, "")];
    }

    if (setting.kind === "candle-composite") {
      return setting.separateCandleModel
        ? [safeAssetPath(setting.holderModel, ""), safeAssetPath(setting.candleModel, "")]
        : [safeAssetPath(setting.holderModel, "")];
    }

    if (setting.kind === "speaker-composite") {
      return [safeAssetPath(setting.speakerModel, "")];
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
  return Array.from(
    new Set(objectModels.filter((model) => typeof model === "string" && model.length > 0)),
  );
}

async function loadSceneModels(settings: SceneObjectSetting[]) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const uniqueModels = sceneModelPaths(settings);
  const loadedModels = await Promise.all(
    uniqueModels.map(async (model) => {
      const gltf = await loader.loadAsync(resolveModelAssetUrl(model));
      return [model, gltf.scene] as const;
    }),
  );

  return new Map(loadedModels);
}

function scenePreloadAssets(
  settings: SceneObjectSetting[],
  portfolio: PortfolioContent,
) {
  const assets = new Set<string>([
    WALL_TEXTURE_PATH,
    FLOOR_COLOR_PATH,
    FLOOR_NORMAL_PATH,
    FLOOR_ROUGHNESS_PATH,
    resolveModelAssetUrl(clockComposite.faceTexture),
    WINKY_FONT_PATH,
    resolveModelAssetUrl(BASEBOARD_MODEL_PATH),
  ]);

  sceneModelPaths(settings).forEach((model) => assets.add(resolveModelAssetUrl(model)));
  framePictures.forEach((picture) => assets.add(picture.src));
  settings.forEach((setting) => {
    if (setting.kind === "frame") {
      const clip = workForSetting(setting)?.clipSrc;
      if (clip) {
        assets.add(clip);
      }
    } else if (setting.kind === "bio-frame" || setting.kind === "image-frame") {
      if (setting.imageSrc) {
        assets.add(setting.imageSrc);
      }
    } else if (setting.kind === "candle-composite") {
      assets.add(resolveModelAssetUrl(setting.flameTexture));
    }
  });
  if (portfolio.bio.image?.url) {
    assets.add(portfolio.bio.image.url);
  }
  portfolio.stillArtists.forEach((artist) => {
    if (artist.coverImage?.url) {
      assets.add(artist.coverImage.url);
    }
    artist.images.forEach((image) => assets.add(image.url));
  });
  portfolio.clients.forEach((client) => {
    const coverUrl = clientCoverUrl(client);
    if (coverUrl) {
      assets.add(coverUrl);
    }
  });

  return [...assets];
}

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: "loadedmetadata" | "loadeddata" | "seeked",
) {
  return new Promise<void>((resolve, reject) => {
    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(video.error?.message || `Video failed to load: ${video.currentSrc}`));
    };
    const cleanup = () => {
      video.removeEventListener(eventName, onLoaded);
      video.removeEventListener("error", onError);
    };

    video.addEventListener(eventName, onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function waitForDecodedVideoFrame(video: HTMLVideoElement) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (presented: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      window.clearTimeout(fallbackTimeout);
      resolve(presented);
    };
    const fallbackTimeout = window.setTimeout(() => finish(false), 1000);

    if (typeof video.requestVideoFrameCallback === "function") {
      video.requestVideoFrameCallback(() => finish(true));
    } else {
      window.requestAnimationFrame(() => finish(video.readyState >= 2));
    }
  });
}

async function waitForVideoFrame(video: HTMLVideoElement) {
  if (video.readyState < 1) {
    const metadataReady = waitForVideoEvent(video, "loadedmetadata");
    video.load();
    await metadataReady;
  }

  const requestedPosterTime = Number(video.dataset.posterTime ?? 0);
  const durationLimit = Number.isFinite(video.duration)
    ? Math.max(0, video.duration - 0.001)
    : requestedPosterTime;
  const posterTime = THREE.MathUtils.clamp(requestedPosterTime, 0, durationLimit);
  if (Math.abs(video.currentTime - posterTime) > 0.01) {
    const seekReady = waitForVideoEvent(video, "seeked");
    video.currentTime = posterTime;
    await seekReady;
  }

  if (video.readyState < 2) {
    await waitForVideoEvent(video, "loadeddata");
  }

  // A loaded frame is not necessarily uploaded into VideoTexture until the
  // video presents once. Prime that first presentation behind the loading
  // screen so the initial hover never fades toward an empty texture.
  const decodedFrameReady = waitForDecodedVideoFrame(video);
  try {
    await video.play();
  } catch {
    // Muted inline playback is normally permitted. The decoded-frame fallback
    // still prevents initialization from hanging if a browser refuses it.
  }
  if (await decodedFrameReady) {
    video.dataset.frameReady = "true";
  }
  video.pause();
}

export type CameraInfo = {
  viewportWidth: number;
  viewportHeight: number;
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
  showObjectLightMarkers,
  showHitboxHelpers,
  activeCaptionFrameId,
  resetSignal,
  freeOrbit,
  captionFont,
  captionColor,
  captionPlacement,
  captionDisplayMode,
  captionsVisible,
  speakerPlaying,
  onSceneError,
  onCameraInfoChange,
  onFrameClick,
  onBioClick,
  onImageFrameClick,
  onFrameHover,
  onLampToggle,
  onSpeakerClick,
  onSceneReady,
}: {
  settings: SceneObjectSetting[];
  lighting: SceneLighting;
  showSceneLightMarkers: boolean;
  showObjectLightMarkers: boolean;
  showHitboxHelpers: boolean;
  activeCaptionFrameId?: string | null;
  resetSignal: number;
  freeOrbit: boolean;
  captionFont: CaptionFontOption;
  captionColor: string;
  captionPlacement: CaptionPlacementId;
  captionDisplayMode: CaptionDisplayMode;
  captionsVisible: boolean;
  speakerPlaying: boolean;
  onSceneError: (error: Error) => void;
  onCameraInfoChange?: (info: CameraInfo) => void;
  onFrameClick?: (workSlug: string) => void;
  onBioClick?: () => void;
  onImageFrameClick?: (modalId: ImageFrameModalId) => void;
  onFrameHover?: (info: FrameHoverInfo | null) => void;
  onLampToggle?: (position: VectorTuple) => void;
  onSpeakerClick?: () => void;
  onSceneReady?: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef(settings);
  const lightingRef = useRef(lighting);
  const showSceneLightMarkersRef = useRef(showSceneLightMarkers);
  const showObjectLightMarkersRef = useRef(showObjectLightMarkers);
  const showHitboxHelpersRef = useRef(showHitboxHelpers);
  const activeCaptionFrameIdRef = useRef(activeCaptionFrameId ?? null);
  const captionDisplayModeRef = useRef(captionDisplayMode);
  const captionsVisibleRef = useRef(captionsVisible);
  const speakerPlayingRef = useRef(speakerPlaying);
  const syncLightingRef = useRef<(() => void) | null>(null);
  const syncHitboxHelpersRef = useRef<(() => void) | null>(null);
  const syncFrameCaptionVisibilityRef = useRef<(() => void) | null>(null);
  const syncOrbitModeRef = useRef<((enabled: boolean) => void) | null>(null);
  const syncWallArchitectureRef = useRef<(() => void) | null>(null);
  const freeOrbitRef = useRef(freeOrbit);
  const sceneObjectsRef = useRef<THREE.Group[]>([]);
  const cameraInfoCallbackRef = useRef(onCameraInfoChange);
  const frameClickCallbackRef = useRef(onFrameClick);
  const bioClickCallbackRef = useRef(onBioClick);
  const imageFrameClickCallbackRef = useRef(onImageFrameClick);
  const frameHoverCallbackRef = useRef(onFrameHover);
  const lampToggleCallbackRef = useRef(onLampToggle);
  const speakerClickCallbackRef = useRef(onSpeakerClick);
  const sceneReadyCallbackRef = useRef(onSceneReady);

  useEffect(() => {
    cameraInfoCallbackRef.current = onCameraInfoChange;
  }, [onCameraInfoChange]);

  useEffect(() => {
    frameClickCallbackRef.current = onFrameClick;
  }, [onFrameClick]);

  useEffect(() => {
    bioClickCallbackRef.current = onBioClick;
  }, [onBioClick]);

  useEffect(() => {
    imageFrameClickCallbackRef.current = onImageFrameClick;
  }, [onImageFrameClick]);

  useEffect(() => {
    frameHoverCallbackRef.current = onFrameHover;
  }, [onFrameHover]);

  useEffect(() => {
    lampToggleCallbackRef.current = onLampToggle;
  }, [onLampToggle]);

  useEffect(() => {
    speakerClickCallbackRef.current = onSpeakerClick;
  }, [onSpeakerClick]);

  useEffect(() => {
    sceneReadyCallbackRef.current = onSceneReady;
  }, [onSceneReady]);

  useEffect(() => {
    settingsRef.current = settings;
    sceneObjectsRef.current.forEach((group, index) => {
      const setting = settings[index];
      if (setting) {
        syncSceneObject(group, setting);
      }
    });
    syncWallArchitectureRef.current?.();
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
    showObjectLightMarkersRef.current = showObjectLightMarkers;
    syncHitboxHelpersRef.current?.();
  }, [showObjectLightMarkers]);

  useEffect(() => {
    showHitboxHelpersRef.current = showHitboxHelpers;
    syncHitboxHelpersRef.current?.();
  }, [showHitboxHelpers]);

  useEffect(() => {
    activeCaptionFrameIdRef.current = activeCaptionFrameId ?? null;
    syncFrameCaptionVisibilityRef.current?.();
  }, [activeCaptionFrameId]);

  useEffect(() => {
    captionDisplayModeRef.current = captionDisplayMode;
    syncFrameCaptionVisibilityRef.current?.();
  }, [captionDisplayMode]);

  useEffect(() => {
    captionsVisibleRef.current = captionsVisible;
    syncFrameCaptionVisibilityRef.current?.();
  }, [captionsVisible]);

  useEffect(() => {
    speakerPlayingRef.current = speakerPlaying;
  }, [speakerPlaying]);

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
    const clockFaceTexture = new THREE.TextureLoader().load(
      resolveModelAssetUrl(clockComposite.faceTexture),
    );
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
        side: THREE.DoubleSide,
      }),
      materials,
    );
    const wallHost = new THREE.Group();
    wallHost.name = "room-wall-host";
    root.add(wallHost);

    const syncWallArchitecture = () => {
      wallHost.children.forEach((child) => disposeObjectGeometries(child));
      wallHost.clear();
      const alcoveSetting = settingsRef.current.find(
        (setting) => setting.kind === "alcove" && isSceneObjectVisible(setting),
      ) as AlcoveSetting | undefined;
      wallHost.add(createWallArchitecture(alcoveSetting, wallMaterial));
    };
    syncWallArchitectureRef.current = syncWallArchitecture;
    syncWallArchitecture();

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

    new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(
      resolveModelAssetUrl(BASEBOARD_MODEL_PATH),
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
    ceiling.position.set(0, WALL_TOP_Y + 0.04, ROOM_SURFACE_Z);
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
    let viewportMode: "desktop" | "mobile" | null = null;
    const hoverMediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const canUseFrameHoverEffects = () => hoverMediaQuery.matches;
    let syncFrameCaptionVisibility = () => {};
    let activeCameraDefaults = DESKTOP_CAMERA_DEFAULTS;
    let targetRotationX = DESKTOP_CAMERA_DEFAULTS.pitch;
    let targetRotationY = DESKTOP_CAMERA_DEFAULTS.yaw;
    let basePanX = DESKTOP_CAMERA_DEFAULTS.panX;
    let basePanY = DESKTOP_CAMERA_DEFAULTS.panY;
    let currentPanX = basePanX;
    let currentPanY = basePanY;
    let targetPanX = basePanX;
    let targetPanY = basePanY;
    let animationFrame = 0;
    let disposed = false;
    let cameraBaseY = 0.32;
    let baseCameraDistance = DESKTOP_CAMERA_DEFAULTS.distance;
    let targetCameraDistance = baseCameraDistance;

    const resetViewTargets = () => {
      pointerIsDown = false;
      pointerMode = "orbit";
      targetRotationX = activeCameraDefaults.pitch;
      targetRotationY = activeCameraDefaults.yaw;
      targetPanX = basePanX;
      targetPanY = basePanY;
      targetCameraDistance = baseCameraDistance;
    };

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const isPhone = width < MOBILE_LAYOUT_BREAKPOINT;
      const nextViewportMode = isPhone ? "mobile" : "desktop";
      const nextCameraDefaults = isPhone ? MOBILE_CAMERA_DEFAULTS : DESKTOP_CAMERA_DEFAULTS;
      const viewportModeChanged = viewportMode !== nextViewportMode;
      viewportMode = nextViewportMode;
      activeCameraDefaults = nextCameraDefaults;
      baseCameraDistance = nextCameraDefaults.distance;
      basePanX = nextCameraDefaults.panX;
      basePanY = nextCameraDefaults.panY;

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(width, height, false);

      camera.aspect = width / height;
      camera.fov = nextCameraDefaults.fov;
      cameraBaseY = isPhone ? 0.1 : 0.32;
      if (viewportModeChanged) {
        resetViewTargets();
        root.rotation.set(nextCameraDefaults.pitch, nextCameraDefaults.yaw, 0);
        currentPanX = nextCameraDefaults.panX;
        currentPanY = nextCameraDefaults.panY;
        camera.position.z = nextCameraDefaults.distance;
      } else if (!freeOrbitRef.current) {
        resetViewTargets();
      }
      camera.position.set(currentPanX, cameraBaseY + currentPanY, targetCameraDistance);
      camera.lookAt(currentPanX, 0.05 + currentPanY, -0.05);
      camera.updateProjectionMatrix();
      syncFrameCaptionVisibility();
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
      return Boolean(clip.userData?.captionMesh);
    };

    syncFrameCaptionVisibility = () => {
      collectFrameClipMeshes().forEach((clip) => {
        const caption = clip.userData.captionMesh as THREE.Mesh | undefined;
        if (caption) {
          const sceneObjectId = clip.userData?.sceneObjectId as string | undefined;
          const supportsHover = canUseFrameHoverEffects();
          const isHovered = supportsHover && clip === hoveredFrameClip;
          const showImmediately = viewportMode === "mobile" || !supportsHover;
          const isEditorActive = sceneObjectId === activeCaptionFrameIdRef.current;
          caption.visible =
            captionsVisibleRef.current &&
            shouldShowFrameCaption(clip) &&
            (captionDisplayModeRef.current === "always" ||
              showImmediately ||
              isHovered ||
              isEditorActive);
          if (caption.material instanceof THREE.MeshBasicMaterial) {
            caption.material.opacity = isHovered || showImmediately ? 1 : 0.58;
            caption.material.needsUpdate = true;
          }
        }
      });
    };
    syncFrameCaptionVisibilityRef.current = syncFrameCaptionVisibility;

    const collectFrameClips = (target: THREE.Object3D[]) => {
      target.push(...collectFrameClipMeshes());
      sceneObjectsRef.current.forEach((group) => {
        if (!group.visible) {
          return;
        }

        group.traverse((child) => {
          if (child instanceof THREE.Mesh && child.userData?.isFrameHitTarget) {
            target.push(child);
          }
        });
      });
    };

    const canonicalFrameClip = (target: THREE.Mesh | undefined) => {
      return (target?.userData?.frameClip as THREE.Mesh | undefined) ?? target ?? null;
    };

    const isFrameClipInteractive = (clip: THREE.Mesh | null) => {
      if (!clip) {
        return false;
      }
      return Boolean(
        clip.userData?.workSlug ||
          clip.userData?.bioSlug ||
          clip.userData?.imageFrameModalId,
      );
    };

    const collectClickZones = (target: THREE.Object3D[]) => {
      sceneObjectsRef.current.forEach((group) => {
        if (!group.visible) {
          return;
        }

        group.traverse((child) => {
          if (
            child instanceof THREE.Mesh &&
            (child.userData?.isClickZone || child.userData?.isLampToggleZone)
          ) {
            target.push(child);
          }
        });
      });
    };

    const syncHitboxHelpers = () => {
      const lightMarkersVisible = showObjectLightMarkersRef.current;
      const opacity = showHitboxHelpersRef.current ? 0.55 : 0;
      sceneObjectsRef.current.forEach((group) => {
        group.traverse((child) => {
          if (
            child instanceof THREE.Mesh &&
            (child.name === "editable-light-marker" || child.name === "editable-light-halo")
          ) {
            child.visible = lightMarkersVisible;
            return;
          }
          if (
            !(child instanceof THREE.Mesh) ||
            !(child.userData?.isClickZone || child.userData?.isLampToggleZone)
          ) {
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
      clip.userData.playStarting = true;
      const posterTime = (clip.userData.posterTime as number) ?? 0;
      // Seek back to the still moment first so playback always starts at the
      // canonical pose. Errors here are non-fatal; some browsers throw if
      // metadata is not yet loaded.
      try {
        if (Math.abs(video.currentTime - posterTime) > 0.05) {
          video.dataset.frameReady = "false";
          video.currentTime = posterTime;
        }
      } catch {
        // Ignore; the video will play from wherever it currently is.
      }

      const revealMotionLayer = () => {
        clip.userData.playStarting = false;
        video.dataset.frameReady = "true";
        if (clip === hoveredFrameClip) {
          clip.userData.fadeTarget = 1;
        }
      };

      const revealAfterNextFrame = () => {
        let settled = false;
        const finish = () => {
          if (settled) {
            return;
          }
          settled = true;
          window.clearTimeout(fallbackTimeout);
          revealMotionLayer();
        };
        const fallbackTimeout = window.setTimeout(finish, 160);

        if (typeof video.requestVideoFrameCallback === "function") {
          video.requestVideoFrameCallback(finish);
        } else {
          window.requestAnimationFrame(finish);
        }
      };

      const playPromise = video.play();
      if (playPromise) {
        playPromise
          .then(() => {
            if (video.dataset.frameReady === "true") {
              revealMotionLayer();
            } else {
              revealAfterNextFrame();
            }
          })
          .catch(() => {
            clip.userData.playStarting = false;
            // Hover is a user gesture so play() is almost always allowed; ignore
            // the edge case where the browser still rejects (e.g. background tab).
          });
      } else if (video.dataset.frameReady === "true") {
        revealMotionLayer();
      } else {
        revealAfterNextFrame();
      }
    };

    const pauseFrame = (clip: THREE.Mesh) => {
      // Pause is driven by the fade tween: once opacity hits zero the animate
      // loop pauses the video and seeks back to the poster moment.
      clip.userData.playStarting = false;
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
        hoveredFrameClip.userData.playStarting = false;
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
      const nextClip = canonicalFrameClip(frameHits[0]?.object as THREE.Mesh | undefined);

      const clickTargets: THREE.Object3D[] = [];
      collectClickZones(clickTargets);
      const clickZoneHovered =
        !nextClip &&
        clickTargets.length > 0 &&
        hoverRaycaster.intersectObjects(clickTargets, false).length > 0;

      if (nextClip === hoveredFrameClip) {
        if (nextClip) {
          syncHoveredWork(nextClip);
        }
        syncFrameCaptionVisibility();
        if (nextClip) {
          host.style.cursor = isFrameClipInteractive(nextClip) ? "pointer" : "";
        } else {
          host.style.cursor = clickZoneHovered ? "pointer" : "";
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
        host.style.cursor = isFrameClipInteractive(hoveredFrameClip) ? "pointer" : "";
      } else {
        host.style.cursor = clickZoneHovered ? "pointer" : "";
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

      if (event.pointerType === "mouse" && canUseFrameHoverEffects()) {
        updateFrameHover(event.clientX, event.clientY);
      } else if (!canUseFrameHoverEffects() && hoveredFrameClip) {
        clearHoveredFrame();
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
          targetPanY = THREE.MathUtils.clamp(
            startPanY + deltaY * panSensitivity,
            -2.1,
            CAMERA_PAN_Y_MAX,
          );
          return;
        }

        targetRotationY = startRotationY + deltaX * 0.006;
        targetRotationX = startRotationX + deltaY * 0.004;
        return;
      }

      const constrainedYawLimit =
        viewportMode === "mobile"
          ? MOBILE_CONSTRAINED_YAW_LIMIT
          : DESKTOP_CONSTRAINED_YAW_LIMIT;
      targetRotationY = THREE.MathUtils.clamp(
        startRotationY + deltaX * 0.0026,
        -constrainedYawLimit,
        constrainedYawLimit,
      );
      targetRotationX = 0;
    };

    const tryClickZoneClick = (clientX: number, clientY: number) => {
      const rect = host.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }
      hoverPointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      hoverPointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      hoverRaycaster.setFromCamera(hoverPointer, camera);
      const targets: THREE.Object3D[] = [];
      collectClickZones(targets);
      if (targets.length === 0) {
        return false;
      }
      const hit = hoverRaycaster.intersectObjects(targets, false)[0];
      if (!hit) {
        return false;
      }
      const action = hit.object.userData?.clickAction as ClickZoneAction | undefined;
      if (action === "toggle-nearest-light" || hit.object.userData?.isLampToggleZone) {
        const handler = lampToggleCallbackRef.current;
        if (!handler) {
          return false;
        }
        const localPoint = root.worldToLocal(hit.point.clone());
        handler([
          formatNumber(localPoint.x),
          formatNumber(localPoint.y),
          formatNumber(localPoint.z),
        ]);
      } else if (action === "speaker-click") {
        speakerClickCallbackRef.current?.();
      }
      return true;
    };

    const tryFrameClick = (clientX: number, clientY: number) => {
      const frameHandler = frameClickCallbackRef.current;
      const bioHandler = bioClickCallbackRef.current;
      const imageFrameHandler = imageFrameClickCallbackRef.current;
      if (!frameHandler && !bioHandler && !imageFrameHandler) {
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
      const hit = canonicalFrameClip(hits[0]?.object as THREE.Mesh | undefined);
      const bioSlug = hit?.userData?.bioSlug as string | undefined;
      if (bioSlug === "yaslynn") {
        bioHandler?.();
        return;
      }
      const imageFrameModalId = hit?.userData?.imageFrameModalId as
        | ImageFrameModalId
        | undefined;
      if (imageFrameModalId) {
        imageFrameHandler?.(imageFrameModalId);
        return;
      }
      const slug = hit?.userData?.workSlug as string | undefined;
      if (slug) {
        frameHandler?.(slug);
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
        if (!tryClickZoneClick(event.clientX, event.clientY)) {
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
      const deltaPixels =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? event.deltaY * Math.max(host.clientHeight, 1)
            : event.deltaY;
      const boundedDelta = THREE.MathUtils.clamp(deltaPixels, -120, 120);
      const zoomFactor = Math.exp(boundedDelta * 0.00018);
      targetCameraDistance = THREE.MathUtils.clamp(
        targetCameraDistance * zoomFactor,
        baseCameraDistance * 0.6,
        baseCameraDistance * 5,
      );
    };

    let lastCameraInfoReport = 0;
    const animate = () => {
      if (!freeOrbitRef.current) {
        targetPanX = basePanX;
        targetPanY = basePanY;
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
      const timeSeconds = performance.now() / 1000;
      sceneObjectsRef.current.forEach((group) => {
        if (group.name === "editable-live-clock") {
          syncClockHands(group);
          syncClockPendulum(group, timeSeconds);
        }
        if (group.name === "editable-candle-composite") {
          syncCandleCompositeAnimation(group, camera, timeSeconds);
        }
        if (group.name === "editable-speaker-composite") {
          syncSpeakerCompositePulse(group, timeSeconds, speakerPlayingRef.current);
        }
      });

      sceneObjectsRef.current.forEach((group) => {
        group.traverse((child) => {
          if (!(child instanceof THREE.Mesh) || !child.userData?.isFrameClip) {
            return;
          }
          const grayscaleStrength = child.userData
            .grayscaleStrength as FrameMediaGrayscaleStrength | undefined;
          if (grayscaleStrength) {
            const grayscaleTarget =
              canUseFrameHoverEffects() && child === hoveredFrameClip ? 1 : 0;
            const nextGrayscale =
              grayscaleStrength.value +
              (grayscaleTarget - grayscaleStrength.value) * 0.18;
            grayscaleStrength.value =
              Math.abs(grayscaleTarget - nextGrayscale) < 0.001
                ? grayscaleTarget
                : nextGrayscale;
          }
          const mat = child.userData.videoMaterial as THREE.MeshBasicMaterial | undefined;
          if (!mat) {
            return;
          }
          const target = (child.userData.fadeTarget as number) ?? 0;
          const next = mat.opacity + (target - mat.opacity) * 0.18;
          mat.opacity = Math.abs(target - next) < 0.001 ? target : next;
          if (target === 0 && mat.opacity < 0.01 && !child.userData.playStarting) {
            const v = child.userData.video as HTMLVideoElement | undefined;
            if (v && !v.paused) {
              v.pause();
              const posterTime = (child.userData.posterTime as number) ?? 0;
              try {
                v.dataset.frameReady = "false";
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
            viewportWidth: host.clientWidth,
            viewportHeight: host.clientHeight,
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
      captionPlacement === "frame"
        ? waitForCaptionFont(captionFont, "Bio Clients Director's Reel Stills")
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

          if (setting.kind === "candle-composite") {
            return createCandleCompositeObject(
              setting,
              models,
              geometries,
              materials,
              textures,
              onSceneError,
            );
          }

          if (setting.kind === "speaker-composite") {
            const speakerSource = models.get(setting.speakerModel);
            if (!speakerSource) {
              throw new Error(`Speaker model did not load: ${setting.speakerModel}`);
            }
            return createSpeakerCompositeObject(setting, speakerSource, geometries, materials);
          }

          if (setting.kind === "alcove") {
            return createAlcoveObject(setting);
          }

          const sourceModel = models.get(setting.model);
          if (!sourceModel) {
            throw new Error(`Object model did not load: ${setting.model}`);
          }

          if (setting.kind === "model") {
            return createModelObject(setting, sourceModel);
          }

          if (setting.kind === "bio-frame" || setting.kind === "image-frame") {
            return createImageFrame(
              setting,
              sourceModel,
              geometries,
              materials,
              textures,
              captionFont,
              captionColor,
              captionPlacement,
              onSceneError,
            );
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
            captionColor,
            captionPlacement,
            onSceneError,
          );
        });
        sceneObjectsRef.current = sceneObjects;
        sceneObjects.forEach((sceneObject) => objectGroup.add(sceneObject));
        syncHitboxHelpers();
        syncFrameCaptionVisibility();
        return Promise.all(videos.map((video) => waitForVideoFrame(video)));
      })
      .then(() => {
        if (disposed) {
          return;
        }
        window.requestAnimationFrame(() => {
          if (!disposed) {
            sceneReadyCallbackRef.current?.();
          }
        });
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
      syncWallArchitectureRef.current = null;
      videos.forEach((video) => {
        video.pause();
        video.removeAttribute("src");
        video.load();
      });
      sceneObjectsRef.current = [];
      wallHost.children.forEach((child) => disposeObjectGeometries(child));
      wallHost.clear();
      renderer.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      renderer.domElement.remove();
    };
  }, [captionColor, captionFont, captionPlacement, onSceneError, resetSignal]);

  return <div ref={hostRef} className="absolute inset-0" />;
}

function normalizeSceneSettings(parsed: Partial<SceneObjectSetting>[] | undefined) {
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

    if (setting.kind === "alcove") {
      return createAlcoveSetting(setting as Partial<AlcoveSetting>);
    }

    if (setting.kind === "hitbox") {
      return createHitboxSetting(setting as Partial<HitboxSetting>);
    }

    if (setting.kind === "candle-composite") {
      return createCandleCompositeSetting(setting as Partial<CandleCompositeSetting>);
    }

    if (setting.kind === "speaker-composite") {
      return createSpeakerCompositeSetting(setting as Partial<SpeakerCompositeSetting>);
    }

    if (setting.kind === "bio-frame") {
      return createBioFrameSetting(index, setting as Partial<BioFrameSetting>);
    }

    if (setting.kind === "image-frame") {
      return createImageFrameSetting(index, setting as Partial<ImageFrameSetting>);
    }

    if (setting.kind === "model" && "catalogId" in setting && setting.catalogId) {
      if (deprecatedPropModelIds.has(setting.catalogId)) {
        return [];
      }

      return createModelSetting(setting.catalogId, setting as Partial<ModelSetting>);
    }

    return createFrameSetting(index, setting as Partial<FrameSetting>);
  });

  return migrated;
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

  return normalizeSceneSettings(JSON.parse(storedValue) as Partial<SceneObjectSetting>[]);
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
  captionColor: string;
}> {
  let storedSettings: SceneObjectSetting[] | null = null;
  let storedLighting: SceneLighting | null = null;

  try {
    const hasStoredSettings = Boolean(
      window.localStorage.getItem(STORAGE_KEY) ??
        window.localStorage.getItem(FRAME_STORAGE_KEY) ??
        window.localStorage.getItem(LEGACY_STORAGE_KEY),
    );
    if (hasStoredSettings) {
      storedSettings = readStoredSettings();
    }

    if (window.localStorage.getItem(LIGHTING_STORAGE_KEY)) {
      storedLighting = readStoredLighting();
    }
  } catch {
    // Ignore malformed or unavailable browser storage and use committed defaults.
  }

  try {
    const response = await fetch("/api/environment", { cache: "no-store" });
    if (response.ok) {
      const environment = (await response.json()) as StoredEnvironment;
      return {
        settings: storedSettings ?? normalizeSceneSettings(environment.objects),
        lighting: storedLighting ?? normalizeSceneLighting(environment.lighting),
        captionColor: normalizeHexColor(
          environment.captionColor,
          DEFAULT_FRAME_CAPTION_COLOR,
        ),
      };
    }
  } catch {
    // Fall back to browser storage when the local JSON file cannot be read.
  }

  return {
    settings: storedSettings ?? defaultSceneSettings,
    lighting: storedLighting ?? defaultSceneLighting,
    captionColor: DEFAULT_FRAME_CAPTION_COLOR,
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

  if (setting.kind === "alcove") {
    return {
      title: setting.label,
      detail: `${statusPrefix}architectural niche`,
    };
  }

  if (setting.kind === "candle-composite") {
    return {
      title: setting.label,
      detail: `${statusPrefix}candle composite`,
    };
  }

  if (setting.kind === "speaker-composite") {
    return {
      title: setting.label,
      detail: `${statusPrefix}speaker composite`,
    };
  }

  if (setting.kind === "bio-frame") {
    return {
      title: setting.label,
      detail: `${statusPrefix}bio image`,
    };
  }

  if (setting.kind === "image-frame") {
    return {
      title: setting.label,
      detail: `${statusPrefix}still image`,
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
  const imageSrc =
    setting.kind === "bio-frame" || setting.kind === "image-frame" ? setting.imageSrc : null;
  const visible = isSceneObjectVisible(setting);
  const label = labelForSetting(setting);
  const previewIcon =
    setting.kind === "light" ? (
      <Lightbulb size={24} />
    ) : setting.kind === "clock" ? (
      <Clock size={24} />
    ) : setting.kind === "hitbox" ? (
      <ScanSearch size={24} />
    ) : setting.kind === "speaker-composite" ? (
      <Box size={24} />
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
        ) : imageSrc ? (
          <PreloadedImage
            className="size-full object-cover"
            src={imageSrc}
            alt=""
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
  candleAccentLight,
  layoutMode,
  onChange,
  onCandleAccentChange,
  onAddCandleAccent,
  onReset,
}: {
  lighting: SceneLighting;
  candleAccentLight?: LightSetting;
  layoutMode: SceneLayoutMode;
  onChange: (partial: Partial<SceneLighting>) => void;
  onCandleAccentChange: (partial: Partial<LightSetting>) => void;
  onAddCandleAccent: () => void;
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
  const updateCandlePosition = (axis: 0 | 1 | 2, value: number) => {
    if (!candleAccentLight) {
      return;
    }
    const position = [...candleAccentLight.position] as VectorTuple;
    position[axis] = value;
    onCandleAccentChange({ position });
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
          step={0.001}
          value={lighting.ambientIntensity}
          onChange={(value) => onChange({ ambientIntensity: value })}
          fine
        />
        <RangeControl
          label="Key"
          tooltip={keyHelp}
          min={0}
          max={4}
          step={0.001}
          value={lighting.keyIntensity}
          onChange={(value) => onChange({ keyIntensity: value })}
          fine
        />
        <RangeControl
          label="Fill"
          tooltip={fillHelp}
          min={0}
          max={6}
          step={0.001}
          value={lighting.fillIntensity}
          onChange={(value) => onChange({ fillIntensity: value })}
          fine
        />
        <RangeControl
          label="Exposure"
          tooltip={exposureHelp}
          min={0.35}
          max={1.6}
          step={0.001}
          value={lighting.exposure}
          onChange={(value) => onChange({ exposure: value })}
          fine
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="grid min-w-0 gap-1 text-[11px] text-[#d8cdbb]">
          <TooltipLabel
            label="Ambient color"
            tooltip="The tint of the room's base light. Warmer colors feel candlelit; cooler colors feel duskier."
          />
          <input
            className="h-9 w-full rounded border border-white/10 bg-[#221d17]/70 p-1"
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
            className="h-9 w-full rounded border border-white/10 bg-[#221d17]/70 p-1"
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
            className="h-9 w-full rounded border border-white/10 bg-[#221d17]/70 p-1"
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
          step={0.001}
          value={lighting.keyPosition[0]}
          onChange={(value) => updatePosition("keyPosition", 0, value)}
          fine
        />
        <RangeControl
          label="Key Y"
          tooltip="Move the main shadow-casting light source up or down."
          min={-1}
          max={6}
          step={0.001}
          value={lighting.keyPosition[1]}
          onChange={(value) => updatePosition("keyPosition", 1, value)}
          fine
        />
        <RangeControl
          label="Key Z"
          tooltip="Move the main shadow-casting light source closer to or farther from the wall."
          min={-1}
          max={8}
          step={0.001}
          value={lighting.keyPosition[2]}
          onChange={(value) => updatePosition("keyPosition", 2, value)}
          fine
        />
        <RangeControl
          label="Fill X"
          tooltip="Move the softer fill light left or right."
          min={-6}
          max={6}
          step={0.001}
          value={lighting.fillPosition[0]}
          onChange={(value) => updatePosition("fillPosition", 0, value)}
          fine
        />
        <RangeControl
          label="Fill Y"
          tooltip="Move the softer fill light up or down."
          min={-1}
          max={6}
          step={0.001}
          value={lighting.fillPosition[1]}
          onChange={(value) => updatePosition("fillPosition", 1, value)}
          fine
        />
        <RangeControl
          label="Fill Z"
          tooltip="Move the softer fill light closer to or farther from the wall."
          min={-1}
          max={8}
          step={0.001}
          value={lighting.fillPosition[2]}
          onChange={(value) => updatePosition("fillPosition", 2, value)}
          fine
        />
      </div>

      <div className="mt-5 border-t border-white/10 pt-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
              Candle accent
            </div>
            <div className="font-mono text-[11px] text-[#fff7e8]">point light</div>
          </div>
          {candleAccentLight ? (
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-[11px] text-[#d8cdbb]">
                Visible on {layoutMode}
                <input
                  className="accent-amber-300"
                  type="checkbox"
                  checked={isSceneObjectVisible(candleAccentLight)}
                  onChange={(event) => onCandleAccentChange({ visible: event.target.checked })}
                />
              </label>
              <label className="flex items-center gap-2 text-[11px] text-[#d8cdbb]">
                Enabled
                <input
                  className="accent-amber-300"
                  type="checkbox"
                  checked={candleAccentLight.enabled}
                  onChange={(event) => onCandleAccentChange({ enabled: event.target.checked })}
                />
              </label>
            </div>
          ) : (
            <button
              type="button"
              className="rounded border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100 hover:bg-amber-300/15"
              onClick={onAddCandleAccent}
            >
              Add candle light
            </button>
          )}
        </div>

        {candleAccentLight ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <label className="grid min-w-0 gap-1 text-[11px] text-[#d8cdbb]">
                Color
                <input
                  className="h-9 w-full rounded border border-white/10 bg-[#221d17]/70 p-1"
                  type="color"
                  value={candleAccentLight.color}
                  onChange={(event) => onCandleAccentChange({ color: event.target.value })}
                />
              </label>
              <RangeControl
                label="Intensity"
                min={0}
                max={10}
                step={0.001}
                value={candleAccentLight.intensity}
                onChange={(value) => onCandleAccentChange({ intensity: value })}
                fine
              />
              <RangeControl
                label="Distance"
                min={0}
                max={12}
                step={0.001}
                value={candleAccentLight.distance}
                onChange={(value) => onCandleAccentChange({ distance: value })}
                fine
              />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-3">
              <RangeControl
                label="Falloff"
                min={0}
                max={4}
                step={0.001}
                value={candleAccentLight.decay}
                onChange={(value) => onCandleAccentChange({ decay: value })}
                fine
              />
              {(["X", "Y", "Z"] as const).map((axisLabel, axis) => (
                <RangeControl
                  key={axisLabel}
                  label={`Light ${axisLabel}`}
                  min={axis === 1 ? -7.875 : -10}
                  max={axis === 1 ? 6 : 10}
                  step={0.001}
                  value={candleAccentLight.position[axis as 0 | 1 | 2]}
                  onChange={(value) => updateCandlePosition(axis as 0 | 1 | 2, value)}
                  fine
                />
              ))}
            </div>
          </>
        ) : null}
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

export function GalleryScene({ portfolio }: { portfolio: PortfolioContent }) {
  const storageReadyRef = useRef(false);
  const saveTimeoutRef = useRef<number | null>(null);
  const speakerAudioRef = useRef<SpeakerAudioChain | null>(null);
  const speakerButtonAudioRef = useRef<HTMLAudioElement | null>(null);
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
  const [bioOpen, setBioOpen] = useState(false);
  const [openImageFrameModal, setOpenImageFrameModal] = useState<ImageFrameModalId | null>(null);
  const [speakerPlaying, setSpeakerPlaying] = useState(false);
  const [initialAssetPaths, setInitialAssetPaths] = useState<string[] | null>(null);
  const [initialAssetsReady, setInitialAssetsReady] = useState(false);
  const [initialSceneReady, setInitialSceneReady] = useState(false);
  const [hoveredFrameInfo, setHoveredFrameInfo] = useState<FrameHoverInfo | null>(null);
  const [captionFontId, setCaptionFontId] = useState<CaptionFontId>(() => {
    if (typeof window === "undefined") {
      return "winky-show";
    }

    try {
      return normalizeCaptionFontId(window.localStorage.getItem(CAPTION_FONT_STORAGE_KEY));
    } catch {
      return "winky-show";
    }
  });
  const [captionPlacementId] = useState<CaptionPlacementId>(() => {
    if (typeof window === "undefined") {
      return "frame";
    }

    try {
      return normalizeCaptionPlacementId(window.localStorage.getItem(CAPTION_PLACEMENT_STORAGE_KEY));
    } catch {
      return "frame";
    }
  });
  const [captionDisplayMode, setCaptionDisplayMode] = useState<CaptionDisplayMode>(() => {
    if (typeof window === "undefined") {
      return "hover";
    }

    try {
      return normalizeCaptionDisplayMode(
        window.localStorage.getItem(CAPTION_DISPLAY_STORAGE_KEY),
      );
    } catch {
      return "hover";
    }
  });
  const [captionsVisible, setCaptionsVisible] = useState(true);
  const [captionVisibilityReady, setCaptionVisibilityReady] = useState(false);
  const [captionColor, setCaptionColor] = useState(DEFAULT_FRAME_CAPTION_COLOR);
  const [captionColorDraft, setCaptionColorDraft] = useState(DEFAULT_FRAME_CAPTION_COLOR);
  const [layoutMode, setLayoutMode] = useState<SceneLayoutMode>("desktop");
  const openWork = useMemo(
    () => (openWorkSlug ? works.find((w) => w.slug === openWorkSlug) ?? null : null),
    [openWorkSlug],
  );
  const openPortfolioProject = useMemo(
    () =>
      openWorkSlug
        ? portfolio.clients
            .flatMap((client) => client.projects)
            .find((project) => project.slug === openWorkSlug) ?? null
        : null,
    [openWorkSlug, portfolio.clients],
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
  const activeSettings = useMemo(
    () => settings.map((setting) => resolveSceneObjectLayout(setting, layoutMode)),
    [layoutMode, settings],
  );
  const candleAccentLight = useMemo(
    () => activeSettings.find(isCandleAccentLight),
    [activeSettings],
  );
  const environmentObjectEntries = useMemo(
    () =>
      activeSettings
        .map((setting, index) => ({ setting, index }))
        .filter(({ setting }) => !isCandleAccentLight(setting)),
    [activeSettings],
  );
  const selectedBase = settings[selectedObject] ?? settings[0];
  const selected = selectedBase
    ? resolveSceneObjectLayout(selectedBase, layoutMode)
    : undefined;
  const exportedSettings = useMemo(
    () => JSON.stringify({ captionColor, lighting, objects: settings }, null, 2),
    [captionColor, lighting, settings],
  );

  useEffect(() => {
    const syncLayoutMode = () => {
      setLayoutMode(window.innerWidth < MOBILE_LAYOUT_BREAKPOINT ? "mobile" : "desktop");
    };
    syncLayoutMode();
    window.addEventListener("resize", syncLayoutMode);
    return () => window.removeEventListener("resize", syncLayoutMode);
  }, []);

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
    try {
      window.localStorage.setItem(CAPTION_DISPLAY_STORAGE_KEY, captionDisplayMode);
    } catch {
      // Non-critical preference.
    }
  }, [captionDisplayMode]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        setCaptionsVisible(
          window.localStorage.getItem(CAPTION_VISIBILITY_STORAGE_KEY) !== "hidden",
        );
      } catch {
        // Non-critical preference.
      } finally {
        setCaptionVisibilityReady(true);
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!captionVisibilityReady) {
      return;
    }

    try {
      window.localStorage.setItem(
        CAPTION_VISIBILITY_STORAGE_KEY,
        captionsVisible ? "visible" : "hidden",
      );
    } catch {
      // Non-critical preference.
    }
  }, [captionVisibilityReady, captionsVisible]);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const {
            settings: loadedSettings,
            lighting: loadedLighting,
            captionColor: loadedCaptionColor,
          } = await readPersistedEnvironment();
          if (cancelled) {
            return;
          }

          setSettings(loadedSettings);
          setLighting(loadedLighting);
          setCaptionColor(loadedCaptionColor);
          setCaptionColorDraft(loadedCaptionColor);
          setInitialAssetPaths(scenePreloadAssets(loadedSettings, portfolio));
          setSelectedObject((current) => Math.min(current, loadedSettings.length - 1));
          setResetSignal((current) => current + 1);
        } catch (error) {
          if (!cancelled) {
            setSceneError(error instanceof Error ? error.message : String(error));
            setInitialAssetPaths(scenePreloadAssets(defaultSceneSettings, portfolio));
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
  }, [portfolio]);

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
      setCaptionColor(DEFAULT_FRAME_CAPTION_COLOR);
      setCaptionColorDraft(DEFAULT_FRAME_CAPTION_COLOR);
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

  const playSpeakerButtonSound = useCallback(() => {
    speakerButtonAudioRef.current?.pause();
    const element = new Audio(SPEAKER_BUTTON_AUDIO_PATH);
    element.preload = "auto";
    element.volume = 0.375;
    speakerButtonAudioRef.current = element;

    element.addEventListener(
      "ended",
      () => {
        if (speakerButtonAudioRef.current === element) {
          speakerButtonAudioRef.current = null;
        }
      },
      { once: true },
    );
    element.play().catch((error: unknown) => {
      setSceneError(error instanceof Error ? error.message : String(error));
    });
  }, []);

  const handleSpeakerClick = useCallback(() => {
    setSceneError(null);
    playSpeakerButtonSound();

    const chain = speakerAudioRef.current ?? createSpeakerAudioChain();
    speakerAudioRef.current = chain;

    const togglePlayback = async () => {
      if (chain.context.state === "suspended") {
        await chain.context.resume();
      }

      if (chain.element.paused) {
        if (chain.element.currentTime < 0.25) {
          chain.element.currentTime = SPEAKER_AUDIO_START_SECONDS;
        }
        setSpeakerPlaying(true);
        await chain.element.play();
      } else {
        setSpeakerPlaying(false);
        chain.element.pause();
      }
    };

    togglePlayback().catch((error: unknown) => {
      setSpeakerPlaying(false);
      setSceneError(error instanceof Error ? error.message : String(error));
    });
  }, [playSpeakerButtonSound]);

  const handleInitialAssetsReady = useCallback(() => {
    setInitialAssetsReady(true);
  }, []);

  const handleInitialAssetError = useCallback((error: Error | null) => {
    setSceneError(error?.message ?? null);
  }, []);

  const handleInitialSceneReady = useCallback(() => {
    setInitialSceneReady(true);
  }, []);

  useEffect(() => {
    return () => {
      const chain = speakerAudioRef.current;
      if (chain) {
        chain.element.pause();
        chain.context.close().catch(() => undefined);
        speakerAudioRef.current = null;
      }

      if (speakerButtonAudioRef.current) {
        speakerButtonAudioRef.current.pause();
        speakerButtonAudioRef.current = null;
      }
    };
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

  const updateSelectedLayout = useCallback(
    (partial: SceneLayoutOverride) => {
      setSceneError(null);
      setSettings((current) =>
        current.map((setting, index) => {
          if (index !== selectedObject) {
            return setting;
          }
          return {
            ...setting,
            layouts: {
              ...setting.layouts,
              [layoutMode]: {
                ...setting.layouts?.[layoutMode],
                ...partial,
              },
            },
          } as SceneObjectSetting;
        }),
      );
    },
    [layoutMode, selectedObject],
  );

  const updateLighting = useCallback((partial: Partial<SceneLighting>) => {
    setLighting((current) => normalizeSceneLighting({ ...current, ...partial }));
  }, []);

  const updateCandleAccentLight = useCallback(
    (partial: Partial<LightSetting>) => {
      setSceneError(null);
      setSettings((current) =>
        current.map((setting) => {
          if (!isCandleAccentLight(setting)) {
            return setting;
          }

          const { position, visible, ...sharedPartial } = partial;
          const layoutChanged = Boolean(position) || typeof visible === "boolean";
          return {
            ...setting,
            ...sharedPartial,
            layouts: layoutChanged
              ? {
                  ...setting.layouts,
                  [layoutMode]: {
                    ...setting.layouts?.[layoutMode],
                    ...(position ? { position } : {}),
                    ...(typeof visible === "boolean" ? { visible } : {}),
                  },
                }
              : setting.layouts,
          };
        }),
      );
    },
    [layoutMode],
  );

  const playLampSwitchSound = useCallback((turningOn: boolean) => {
    const element = new Audio(turningOn ? LAMP_SWITCH_ON_AUDIO_PATH : LAMP_SWITCH_OFF_AUDIO_PATH);
    element.preload = "auto";
    element.volume = 0.205;
    element.play().catch((error: unknown) => {
      setSceneError(error instanceof Error ? error.message : String(error));
    });
  }, []);

  const toggleNearestLight = useCallback((position: VectorTuple) => {
    setSceneError(null);
    const hasVisibleLight = activeSettings.some(
      (setting) => setting.kind === "light" && isSceneObjectVisible(setting),
    );
    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;

    activeSettings.forEach((setting, index) => {
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
      return;
    }

    const nearest = settings[nearestIndex];
    if (nearest.kind !== "light") {
      return;
    }

    const nextEnabled = !nearest.enabled;
    playLampSwitchSound(nextEnabled);

    setSettings((current) =>
      current.map((setting, index) =>
        index === nearestIndex && setting.kind === "light"
          ? { ...setting, enabled: nextEnabled }
          : setting,
      ),
    );
  }, [activeSettings, playLampSwitchSound, settings]);

  const updateSelectedPosition = (axis: 0 | 1 | 2, value: number) => {
    if (!selected) {
      return;
    }

    const position = [...selected.position] as VectorTuple;
    position[axis] = value;
    updateSelectedLayout({ position });
  };

  const updateSelectedRotation = (axis: 0 | 1 | 2, value: number) => {
    if (!selected) {
      return;
    }

    const rotation = [...selected.rotation] as VectorTuple;
    rotation[axis] = value;
    updateSelectedLayout({ rotation });
  };

  const updateSelectedSize = (value: number) => {
    updateSelectedLayout({ wallScale: value });
  };

  const addObject = (kind: ObjectKind, modelCatalogId = "small-end-table") => {
    const source = selected ?? settings[settings.length - 1] ?? defaultSceneSettings[0];
    const nextIndex = settings.length;
    const nextPosition: VectorTuple = [
      formatNumber(THREE.MathUtils.clamp(source.position[0] + 0.65, -7.875, 7.875)),
      formatNumber(THREE.MathUtils.clamp(source.position[1] - 0.18, -7.875, 3.75)),
      source.position[2],
    ];
    const nextLightPosition: VectorTuple =
      source.kind === "model"
        ? [
            source.position[0],
            formatNumber(
              THREE.MathUtils.clamp(
                source.position[1] + source.wallScale * 1.45,
                -7.875,
                3.75,
              ),
            ),
            source.position[2],
          ]
        : nextPosition;
    const nextObject =
      kind === "light"
        ? modelCatalogId === "candle-accent"
          ? createCandleAccentLightSetting({
              id: `candle-accent-light-${Date.now().toString(36)}`,
              position: nextLightPosition,
            })
          : createLightSetting({
              id: `light-${Date.now().toString(36)}`,
              position: nextLightPosition,
            })
        : kind === "clock"
          ? createClockSetting({
              id: `clock-${Date.now().toString(36)}`,
              position: nextPosition,
            })
        : kind === "alcove"
          ? createAlcoveSetting({
              id: `alcove-${Date.now().toString(36)}`,
              position: nextPosition,
            })
        : kind === "model"
          ? createModelSetting(modelCatalogId, {
              id: `prop-${Date.now().toString(36)}`,
              position: nextPosition,
            })
        : kind === "bio-frame"
          ? createBioFrameSetting(nextIndex, {
              id: `bio-frame-${Date.now().toString(36)}`,
              position: nextPosition,
              rotation: [
                source.rotation[0],
                source.rotation[1] * -1 || -0.025,
                formatNumber(source.rotation[2] * -1 || -0.012),
              ],
            })
        : kind === "image-frame"
          ? createImageFrameSetting(nextIndex, {
              id: `image-frame-${Date.now().toString(36)}`,
              position: nextPosition,
              rotation: [
                source.rotation[0],
                source.rotation[1] * -1 || -0.025,
                formatNumber(source.rotation[2] * -1 || -0.012),
              ],
            })
        : kind === "candle-composite"
          ? modelCatalogId === "clay-saucer"
            ? createClaySaucerCandleSetting({
                id: `clay-saucer-candle-${Date.now().toString(36)}`,
                position: nextPosition,
              })
            : createCandleCompositeSetting({
                id: `candle-composite-${Date.now().toString(36)}`,
                position: nextPosition,
              })
        : kind === "speaker-composite"
          ? createSpeakerCompositeSetting({
              id: `speaker-composite-${Date.now().toString(36)}`,
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

    const nextObjectForLayout = {
      ...nextObject,
      layouts: {
        desktop: { visible: layoutMode === "desktop" },
        mobile: { visible: layoutMode === "mobile" },
      },
    } as SceneObjectSetting;

    setSceneError(null);
    setSettings([...settings, nextObjectForLayout]);
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
    updateSelectedLayout({ position });
  };

  const updateSelectedLight = (partial: Partial<LightSetting>) => {
    if (!selected || selected.kind !== "light") {
      return;
    }

    updateSelectedObject(partial as Partial<SceneObjectSetting>);
  };

  return (
    <section className="relative h-full min-h-screen w-full supports-[height:100dvh]:min-h-dvh">
      {initialAssetsReady ? (
        <ThreeWallCanvas
        key={resetSignal}
        settings={activeSettings}
        lighting={lighting}
        showSceneLightMarkers={HELPER_CONTROLS_ENABLED && lightingOpen}
        showObjectLightMarkers={HELPER_CONTROLS_ENABLED && (lightingOpen || editorOpen)}
        showHitboxHelpers={HELPER_CONTROLS_ENABLED && editorOpen}
        activeCaptionFrameId={
          HELPER_CONTROLS_ENABLED &&
          editorOpen &&
          (selected?.kind === "frame" ||
            selected?.kind === "bio-frame" ||
            selected?.kind === "image-frame")
            ? selected.id
            : null
        }
        resetSignal={resetSignal}
        freeOrbit={freeOrbit}
        captionFont={captionFont}
        captionColor={captionColorDraft}
        captionPlacement={captionPlacementId}
        captionDisplayMode={captionDisplayMode}
        captionsVisible={captionsVisible}
        speakerPlaying={speakerPlaying}
        onSceneError={handleSceneError}
        onCameraInfoChange={setCameraInfo}
        onFrameClick={setOpenWorkSlug}
        onBioClick={() => setBioOpen(true)}
        onImageFrameClick={setOpenImageFrameModal}
        onFrameHover={setHoveredFrameInfo}
        onLampToggle={toggleNearestLight}
        onSpeakerClick={handleSpeakerClick}
        onSceneReady={handleInitialSceneReady}
      />
      ) : null}

      <SceneLoadingScreen
        assets={initialAssetPaths}
        assetsReady={initialAssetsReady}
        sceneReady={initialSceneReady}
        sceneError={sceneError}
        onAssetsReady={handleInitialAssetsReady}
        onError={handleInitialAssetError}
      />

      {captionsVisible && hoveredWork && captionPlacementId === "corner" && !editorOpen && !lightingOpen && !openWork && !bioOpen && !openImageFrameModal ? (
        <div
          className="pointer-events-none absolute bottom-7 left-5 max-w-[calc(100vw-2.5rem)] break-words text-5xl leading-none sm:bottom-9 sm:left-8 sm:text-7xl lg:text-8xl"
          style={{
            color: captionColorDraft,
            fontFamily: captionFont.fontFamily,
            fontWeight: captionFont.fontWeight,
          }}
          aria-hidden="true"
        >
          {hoveredWork.artist}
        </div>
      ) : null}

      {HELPER_CONTROLS_ENABLED ? (
      <div className="pointer-events-none absolute right-4 top-4 flex items-start justify-end p-0 sm:right-6 sm:top-6">
        <div className="flex flex-col items-end gap-2">
          <div className="pointer-events-auto flex items-center gap-2 rounded border border-white/10 bg-[#16120d]/58 p-1 shadow-2xl backdrop-blur-[2px]">
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
                  href="/candle-editor"
                  aria-label="Open candle composite editor"
                  title="Open candle composite editor"
                >
                  <Flame size={17} />
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
                    const opening = !editorOpen;
                    if (opening && selected && isCandleAccentLight(selected)) {
                      setSelectedObject(environmentObjectEntries[0]?.index ?? 0);
                    }
                    setEditorOpen(opening);
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
            <div className="pointer-events-none rounded border border-white/10 bg-[#16120d]/58 px-3 py-2 font-mono text-[11px] leading-snug text-[#f6f0e5] shadow-2xl backdrop-blur-[2px]">
              <div>width&nbsp;{cameraInfo.viewportWidth}px</div>
              <div>height {cameraInfo.viewportHeight}px</div>
              <div>dist&nbsp;&nbsp;{cameraInfo.distance.toFixed(2)}</div>
              <div>pan&nbsp;&nbsp;&nbsp;{cameraInfo.panX.toFixed(2)},&nbsp;{cameraInfo.panY.toFixed(2)}</div>
              <div>yaw&nbsp;&nbsp;&nbsp;{((cameraInfo.yaw * 180) / Math.PI).toFixed(1)}°</div>
              <div>pitch&nbsp;{((cameraInfo.pitch * 180) / Math.PI).toFixed(1)}°</div>
              <div>fov&nbsp;&nbsp;&nbsp;{cameraInfo.fov.toFixed(0)}°</div>
            </div>
          ) : null}
        </div>
      </div>
      ) : null}

      {HELPER_CONTROLS_ENABLED && lightingOpen ? (
        <div className="absolute bottom-3 left-3 right-3 max-h-[56vh] overflow-auto rounded border border-white/10 bg-[#16120d]/58 p-3 text-xs text-[#f6f0e5] shadow-2xl backdrop-blur-[2px] sm:left-auto sm:right-4 sm:top-20 sm:bottom-auto sm:w-[30rem] sm:max-h-[calc(100vh-7rem)]">
          <SceneLightingControls
            lighting={lighting}
            candleAccentLight={candleAccentLight}
            layoutMode={layoutMode}
            onChange={updateLighting}
            onCandleAccentChange={updateCandleAccentLight}
            onAddCandleAccent={() => addObject("light", "candle-accent")}
            onReset={() => setPendingReset("lighting")}
          />
        </div>
      ) : null}

      {HELPER_CONTROLS_ENABLED && showChrome && captionOpen ? (
        <div className="absolute bottom-3 left-3 right-3 max-h-[56vh] overflow-auto rounded border border-white/10 bg-[#16120d]/58 p-3 text-xs text-[#f6f0e5] shadow-2xl backdrop-blur-[2px] sm:left-auto sm:right-4 sm:top-20 sm:bottom-auto sm:w-[22rem] sm:max-h-[calc(100vh-7rem)]">
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
              Caption options
            </div>
          </div>

          <div className="mb-4 grid gap-2">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
              Display
            </div>
            <button
              type="button"
              className={`flex items-center justify-between gap-3 rounded border px-3 py-2 text-left text-xs transition ${
                captionsVisible
                  ? "border-sky-300 bg-sky-300/15 text-sky-100"
                  : "border-white/10 bg-white/5 text-[#f6f0e5] hover:bg-white/10"
              }`}
              aria-pressed={captionsVisible}
              onClick={() => setCaptionsVisible((current) => !current)}
            >
              <span>{captionsVisible ? "Captions visible" : "Captions hidden"}</span>
              {captionsVisible ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "always", label: "Always visible" },
                { id: "hover", label: "Hover only" },
              ].map((option) => {
                const selectedDisplay = option.id === captionDisplayMode;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`rounded border px-3 py-2 text-left text-xs transition ${
                      selectedDisplay
                        ? "border-sky-300 bg-sky-300/15 text-sky-100"
                        : "border-white/10 bg-white/5 text-[#f6f0e5] hover:bg-white/10"
                    }`}
                    onClick={() => setCaptionDisplayMode(option.id as CaptionDisplayMode)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-4 grid gap-2">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
              Caption color
            </div>
            <div className="flex items-end gap-2">
              <label className="grid min-w-0 flex-1 gap-1 text-[11px] text-[#d8cdbb]">
                <span className="font-mono uppercase text-[#fff7e8]">
                  {captionColorDraft}
                </span>
                <input
                  className="h-9 w-full rounded border border-white/10 bg-[#221d17]/70 p-1"
                  type="color"
                  value={captionColorDraft}
                  onChange={(event) => setCaptionColorDraft(event.currentTarget.value)}
                />
              </label>
              <button
                type="button"
                className="h-9 rounded border border-white/10 bg-white/10 px-3 text-xs transition enabled:hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={captionColorDraft === captionColor}
                onClick={() => setCaptionColor(captionColorDraft)}
              >
                Save color
              </button>
            </div>
          </div>

          <div className="mb-2 text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
            Typography
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

      {HELPER_CONTROLS_ENABLED && editorOpen && selected ? (
        <div className="absolute bottom-3 left-3 right-3 max-h-[56vh] overflow-auto rounded border border-white/10 bg-[#16120d]/38 p-3 text-xs text-[#f6f0e5] shadow-2xl backdrop-blur-[2px] sm:left-auto sm:right-4 sm:top-20 sm:bottom-auto sm:w-[22rem] sm:max-h-[calc(100vh-7rem)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
                Environment objects
              </div>
              <div className="font-mono text-[11px] text-[#fff7e8]">
                {Math.max(
                  1,
                  environmentObjectEntries.findIndex(({ index }) => index === selectedObject) + 1,
                )}{" "}
                / {environmentObjectEntries.length}
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-sky-100">
                Editing {layoutMode}
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
              onClick={() => addObject("bio-frame")}
            >
              Add bio
            </button>
            <button
              type="button"
              className="rounded border border-white/10 bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
              onClick={() => addObject("image-frame")}
            >
              Add image
            </button>
            <select
              className="min-w-0 rounded border border-white/10 bg-[#221d17]/70 px-3 py-2 text-xs text-[#f6f0e5] hover:bg-white/10"
              value=""
              aria-label="Add model"
              onChange={(event) => {
                const catalogId = event.currentTarget.value;
                if (catalogId) {
                  addObject("model", catalogId);
                }
              }}
            >
              <option value="">Add model...</option>
              {propModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded border border-white/10 bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
              onClick={() => addObject("candle-composite")}
            >
              Add candle
            </button>
            <button
              type="button"
              className="rounded border border-white/10 bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
              onClick={() => addObject("candle-composite", "clay-saucer")}
            >
              Add clay candle
            </button>
            <button
              type="button"
              className="rounded border border-white/10 bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
              onClick={() => addObject("speaker-composite")}
            >
              Add speaker
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
            <button
              type="button"
              className="rounded border border-white/10 bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
              onClick={() => addObject("alcove")}
            >
              Add alcove
            </button>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            {environmentObjectEntries.map(({ setting, index }) => (
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
              className="w-full min-w-0 rounded border border-white/10 bg-[#221d17]/70 px-3 py-2 text-sm text-[#f6f0e5]"
              type="text"
              value={selected.label}
              onChange={(event) => updateSelectedObject({ label: event.currentTarget.value })}
            />
          </label>

          <label className="mb-3 flex items-center justify-between gap-3 rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#d8cdbb]">
            <span className="flex items-center gap-2">
              {isSceneObjectVisible(selected) ? <Eye size={14} /> : <EyeOff size={14} />}
              Visible on {layoutMode}
            </span>
            <input
              className="accent-sky-300"
              type="checkbox"
              checked={isSceneObjectVisible(selected)}
              onChange={(event) => updateSelectedLayout({ visible: event.target.checked })}
            />
          </label>

          {selected.kind === "model" ? (
            <label className="mb-3 grid min-w-0 gap-1 text-xs text-[#d8cdbb]">
              Model
              <select
                className="w-full min-w-0 rounded border border-white/10 bg-[#221d17]/70 px-3 py-2 text-sm text-[#f6f0e5]"
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
              min={-7.875}
              max={7.875}
              step={0.001}
              value={selected.position[0]}
              onChange={(value) => updateSelectedPosition(0, value)}
              fine
            />
            <RangeControl
              label="Wall Y"
              min={
                selected.kind === "frame" ||
                selected.kind === "bio-frame" ||
                selected.kind === "image-frame"
                  ? -5.063
                  : -7.875
              }
              max={
                selected.kind === "bio-frame"
                  ? BIO_FRAME_EXPANDED_MAX_Y
                  : selected.kind === "clock"
                    ? 7.875
                    : 3.75
              }
              step={0.001}
              value={selected.position[1]}
              onChange={(value) => updateSelectedPosition(1, value)}
              fine
            />
            {selected.kind !== "alcove" ? (
              <RangeControl
                label="Depth Z"
                min={-0.657}
                max={5.25}
                step={0.001}
                value={selected.position[2]}
                onChange={(value) => updateSelectedPosition(2, value)}
                fine
              />
            ) : null}
            <RangeControl
              label={
                selected.kind === "model"
                  ? "Height"
                  : selected.kind === "candle-composite"
                    ? "Height"
                  : selected.kind === "speaker-composite"
                    ? "Height"
                  : selected.kind === "light"
                    ? "Marker"
                    : "Size"
              }
              min={selected.kind === "light" ? 0.015 : 0.132}
              max={
                selected.kind === "model" && selected.catalogId === "human"
                  ? 11.25
                  : selected.kind === "light"
                    ? 0.938
                    : 4.5
              }
              step={0.001}
              value={selected.wallScale}
              onChange={updateSelectedSize}
              fine
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

          {selected.kind === "alcove" ? (
            <div className="mt-4 grid gap-3">
              <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
                Wall cut
              </div>
              <div className="grid grid-cols-2 gap-3">
                <RangeControl
                  label="Opening width"
                  tooltip="The horizontal length of the niche opening."
                  min={0.2}
                  max={6}
                  step={0.001}
                  value={selected.nicheWidth}
                  onChange={(value) =>
                    updateSelectedObject({ nicheWidth: value } as Partial<SceneObjectSetting>)
                  }
                  fine
                />
                <RangeControl
                  label="Side height"
                  tooltip="The height of the straight sides before the arch begins."
                  min={0.2}
                  max={6}
                  step={0.001}
                  value={selected.nicheStraightHeight}
                  onChange={(value) =>
                    updateSelectedObject({
                      nicheStraightHeight: value,
                    } as Partial<SceneObjectSetting>)
                  }
                  fine
                />
                <RangeControl
                  label="Arch height"
                  tooltip="How high the curved top rises above the straight sides."
                  min={0.08}
                  max={4}
                  step={0.001}
                  value={selected.nicheArchHeight}
                  onChange={(value) =>
                    updateSelectedObject({ nicheArchHeight: value } as Partial<SceneObjectSetting>)
                  }
                  fine
                />
                <RangeControl
                  label="Depth"
                  tooltip="The actual distance from the wall face to the recessed back."
                  min={0.01}
                  max={1.5}
                  step={0.001}
                  value={selected.nicheDepth}
                  onChange={(value) =>
                    updateSelectedObject({ nicheDepth: value } as Partial<SceneObjectSetting>)
                  }
                  fine
                />
              </div>
            </div>
          ) : null}

          {selected.kind === "frame" ||
          selected.kind === "bio-frame" ||
          selected.kind === "image-frame" ? (
            <div className="mt-4 grid gap-3">
              <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
                Caption
              </div>
              <div className="grid grid-cols-2 gap-3">
                <RangeControl
                  label="Caption X"
                  min={-2.813}
                  max={2.813}
                  step={0.001}
                  value={selected.captionOffsetX}
                  onChange={(value) => updateSelectedLayout({ captionOffsetX: value })}
                  fine
                />
                <RangeControl
                  label="Caption Y"
                  min={-3.75}
                  max={1.125}
                  step={0.001}
                  value={selected.captionOffsetY}
                  onChange={(value) => updateSelectedLayout({ captionOffsetY: value })}
                  fine
                />
                <RangeControl
                  label="Caption Z"
                  min={-0.095}
                  max={0.375}
                  step={0.001}
                  value={selected.captionOffsetZ}
                  onChange={(value) => updateSelectedLayout({ captionOffsetZ: value })}
                  fine
                />
                <RangeControl
                  label="Caption Size"
                  min={0.132}
                  max={4.688}
                  step={0.001}
                  value={selected.captionScale}
                  onChange={(value) => updateSelectedLayout({ captionScale: value })}
                  fine
                />
              </div>
            </div>
          ) : null}

          {selected.kind === "image-frame" ? (
            <div className="mt-4 grid gap-3">
              <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
                Photo treatment
              </div>
              <div className="grid grid-cols-2 gap-3">
                <RangeControl
                  label="Warm tint"
                  min={0}
                  max={0.563}
                  step={0.001}
                  value={selected.imageTintStrength}
                  onChange={(value) =>
                    updateSelectedObject({
                      imageTintStrength: value,
                    } as Partial<SceneObjectSetting>)
                  }
                  fine
                />
                <RangeControl
                  label="Haze"
                  min={0}
                  max={0.657}
                  step={0.001}
                  value={selected.imageHazeOpacity}
                  onChange={(value) =>
                    updateSelectedObject({
                      imageHazeOpacity: value,
                    } as Partial<SceneObjectSetting>)
                  }
                  fine
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid min-w-0 gap-1 text-xs text-[#d8cdbb]">
                  Tint color
                  <input
                    className="h-9 w-full rounded border border-white/10 bg-[#221d17]/70 p-1"
                    type="color"
                    value={selected.imageTintColor}
                    onChange={(event) =>
                      updateSelectedObject({
                        imageTintColor: event.target.value,
                      } as Partial<SceneObjectSetting>)
                    }
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-xs text-[#d8cdbb]">
                  Haze color
                  <input
                    className="h-9 w-full rounded border border-white/10 bg-[#221d17]/70 p-1"
                    type="color"
                    value={selected.imageHazeColor}
                    onChange={(event) =>
                      updateSelectedObject({
                        imageHazeColor: event.target.value,
                      } as Partial<SceneObjectSetting>)
                    }
                  />
                </label>
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

          {selected.kind === "candle-composite" ? (
            <div className="mt-4 grid gap-3">
              <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
                Flame
              </div>
              <div className="grid grid-cols-2 gap-3">
                {(["X", "Y", "Z"] as const).map((axisLabel, axis) => (
                  <RangeControl
                    key={axisLabel}
                    label={`Flame ${axisLabel}`}
                    min={axis === 1 ? -0.5 : -1.5}
                    max={axis === 1 ? 2.5 : 1.5}
                    step={0.001}
                    value={selected.flameOffset[axis]}
                    onChange={(value) => {
                      const flameOffset = [...selected.flameOffset] as VectorTuple;
                      flameOffset[axis] = value;
                      updateSelectedObject({
                        flameOffset,
                      } as Partial<SceneObjectSetting>);
                    }}
                    fine
                  />
                ))}
                <RangeControl
                  label="Flame Size"
                  min={0.01}
                  max={1.2}
                  step={0.001}
                  value={selected.flameScale}
                  onChange={(value) =>
                    updateSelectedObject({
                      flameScale: value,
                    } as Partial<SceneObjectSetting>)
                  }
                  fine
                />
              </div>
              <Link
                className="inline-block rounded border border-amber-300/30 bg-amber-300/15 px-3 py-2 text-xs text-amber-100 hover:bg-amber-300/20"
                href={`/candle-editor?id=${encodeURIComponent(selected.id)}`}
              >
                Open composite editor
              </Link>
            </div>
          ) : null}

          {selected.kind === "speaker-composite" ? (
            <div className="mt-4 grid gap-3">
              <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
                Speaker hitbox
              </div>
              <div className="grid grid-cols-2 gap-3">
                <RangeControl
                  label="Hitbox X"
                  min={-1.875}
                  max={1.875}
                  step={0.001}
                  value={selected.hitboxOffset[0]}
                  onChange={(value) => {
                    const hitboxOffset = [...selected.hitboxOffset] as VectorTuple;
                    hitboxOffset[0] = value;
                    updateSelectedObject({
                      hitboxOffset,
                    } as Partial<SceneObjectSetting>);
                  }}
                  fine
                />
                <RangeControl
                  label="Hitbox Y"
                  min={-0.47}
                  max={2.625}
                  step={0.001}
                  value={selected.hitboxOffset[1]}
                  onChange={(value) => {
                    const hitboxOffset = [...selected.hitboxOffset] as VectorTuple;
                    hitboxOffset[1] = value;
                    updateSelectedObject({
                      hitboxOffset,
                    } as Partial<SceneObjectSetting>);
                  }}
                  fine
                />
                <RangeControl
                  label="Hitbox Z"
                  min={-1.875}
                  max={1.875}
                  step={0.001}
                  value={selected.hitboxOffset[2]}
                  onChange={(value) => {
                    const hitboxOffset = [...selected.hitboxOffset] as VectorTuple;
                    hitboxOffset[2] = value;
                    updateSelectedObject({
                      hitboxOffset,
                    } as Partial<SceneObjectSetting>);
                  }}
                  fine
                />
                <RangeControl
                  label="Hitbox W"
                  min={0.019}
                  max={3.75}
                  step={0.001}
                  value={selected.hitboxSize[0]}
                  onChange={(value) => {
                    const hitboxSize = [...selected.hitboxSize] as VectorTuple;
                    hitboxSize[0] = value;
                    updateSelectedObject({
                      hitboxSize,
                    } as Partial<SceneObjectSetting>);
                  }}
                  fine
                />
                <RangeControl
                  label="Hitbox H"
                  min={0.019}
                  max={3.75}
                  step={0.001}
                  value={selected.hitboxSize[1]}
                  onChange={(value) => {
                    const hitboxSize = [...selected.hitboxSize] as VectorTuple;
                    hitboxSize[1] = value;
                    updateSelectedObject({
                      hitboxSize,
                    } as Partial<SceneObjectSetting>);
                  }}
                  fine
                />
                <RangeControl
                  label="Hitbox D"
                  min={0.019}
                  max={3.75}
                  step={0.001}
                  value={selected.hitboxSize[2]}
                  onChange={(value) => {
                    const hitboxSize = [...selected.hitboxSize] as VectorTuple;
                    hitboxSize[2] = value;
                    updateSelectedObject({
                      hitboxSize,
                    } as Partial<SceneObjectSetting>);
                  }}
                  fine
                />
              </div>
            </div>
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
                  className="h-9 w-full rounded border border-white/10 bg-[#221d17]/70 p-1"
                  type="color"
                  value={selected.color}
                  onChange={(event) => updateSelectedLight({ color: event.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <RangeControl
                  label="Intensity"
                  min={0}
                  max={30}
                  step={0.01}
                  value={selected.intensity}
                  onChange={(value) => updateSelectedLight({ intensity: value })}
                  fine
                />
                <RangeControl
                  label="Distance"
                  min={0.15}
                  max={15}
                  step={0.01}
                  value={selected.distance}
                  onChange={(value) => updateSelectedLight({ distance: value })}
                  fine
                />
                <RangeControl
                  label="Falloff"
                  min={0.15}
                  max={5.625}
                  step={0.01}
                  value={selected.decay}
                  onChange={(value) => updateSelectedLight({ decay: value })}
                  fine
                />
              </div>
            </div>
          ) : null}

          {selected.kind !== "light" && selected.kind !== "alcove" ? (
            <>
              <div className="mb-3 mt-4 text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
                Rotation
              </div>
              <div className="grid grid-cols-2 gap-3">
                <RangeControl
                  label="Pitch X"
                  min={-OBJECT_ROTATION_LIMIT}
                  max={OBJECT_ROTATION_LIMIT}
                  step={0.001}
                  value={selected.rotation[0]}
                  onChange={(value) => updateSelectedRotation(0, value)}
                  fine
                />
                <RangeControl
                  label="Yaw Y"
                  min={-OBJECT_ROTATION_LIMIT}
                  max={OBJECT_ROTATION_LIMIT}
                  step={0.001}
                  value={selected.rotation[1]}
                  onChange={(value) => updateSelectedRotation(1, value)}
                  fine
                />
                <RangeControl
                  label="Roll Z"
                  min={-OBJECT_ROTATION_LIMIT}
                  max={OBJECT_ROTATION_LIMIT}
                  step={0.001}
                  value={selected.rotation[2]}
                  onChange={(value) => updateSelectedRotation(2, value)}
                  fine
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

      {openWork?.slug === "yaslynn-director-reel" ? (
        <DirectorReelModal
          key={openWork.slug}
          sourceUrl={portfolio.directorReelUrl}
          onClose={() => setOpenWorkSlug(null)}
        />
      ) : openPortfolioProject ? (
        <ProjectModal
          key={openPortfolioProject.key}
          project={openPortfolioProject}
          onClose={() => setOpenWorkSlug(null)}
        />
      ) : null}
      {bioOpen ? (
        <BioModal bio={portfolio.bio} onClose={() => setBioOpen(false)} />
      ) : null}
      {openImageFrameModal === "stills" ? (
        <StillsModal
          artists={portfolio.stillArtists}
          onClose={() => setOpenImageFrameModal(null)}
        />
      ) : null}
      {openImageFrameModal === "clients" ? (
        <ClientsModal
          clients={portfolio.clients}
          onClose={() => setOpenImageFrameModal(null)}
        />
      ) : null}
    </section>
  );
}

type VideoEmbed = {
  src: string;
  platform: "Vimeo" | "YouTube";
};

function videoEmbed(sourceUrl: string): VideoEmbed | null {
  try {
    const url = new URL(sourceUrl);
    const hostname = url.hostname.replace(/^www\./, "");

    if (hostname === "vimeo.com" || hostname === "player.vimeo.com") {
      const videoId = url.pathname.split("/").find((part) => /^\d+$/.test(part));
      return videoId
        ? {
            src: `https://player.vimeo.com/video/${videoId}?title=0&byline=0&portrait=0`,
            platform: "Vimeo",
          }
        : null;
    }

    const videoId =
      hostname === "youtu.be"
        ? url.pathname.split("/").filter(Boolean)[0]
        : url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).pop();
    return videoId
      ? {
          src: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`,
          platform: "YouTube",
        }
      : null;
  } catch {
    return null;
  }
}

const MODAL_STYLE = {
  backdrop:
    "absolute inset-0 z-50 flex items-center justify-center bg-black/90 p-4 sm:p-6",
  surface: "relative max-h-full bg-black text-[#f6f0e5]",
  closeButton:
    "absolute right-2 top-2 z-20 grid size-9 cursor-pointer place-items-center bg-transparent text-white hover:bg-neutral-800 focus-visible:bg-neutral-800 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-white active:bg-neutral-700",
  lightCloseButton:
    "absolute right-2 top-2 z-20 grid size-9 cursor-pointer place-items-center bg-transparent text-black hover:bg-neutral-200 focus-visible:bg-neutral-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-3px] focus-visible:outline-black active:bg-neutral-300",
} as const;

const MODAL_HEADING_STYLE = {
  fontFamily: '"Yaz Winky Show"',
} as const;

function useModalDismissal(onClose: () => void) {
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
}

function ModalShell({
  onClose,
  ariaLabel,
  ariaLabelledBy,
  closeButtonTone = "dark",
  className = "",
  style,
  children,
}: {
  onClose: () => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  closeButtonTone?: "dark" | "light";
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  useModalDismissal(onClose);

  return (
    <div
      className={MODAL_STYLE.backdrop}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
    >
      <div
        className={`${MODAL_STYLE.surface} ${className}`}
        style={style}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={
            closeButtonTone === "light"
              ? MODAL_STYLE.lightCloseButton
              : MODAL_STYLE.closeButton
          }
        >
          <X size={20} strokeWidth={1.5} />
        </button>
        {children}
      </div>
    </div>
  );
}

function DirectorReelModal({
  sourceUrl,
  onClose,
}: {
  sourceUrl: string;
  onClose: () => void;
}) {
  const embed = videoEmbed(sourceUrl);

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel="Director's Reel"
      closeButtonTone="light"
      className="bg-white p-11 text-black"
      style={{
        width:
          "min(72rem, calc(100vw - 2rem), calc((100dvh - 8.5rem) * 16 / 9 + 5.5rem))",
      }}
    >
      <div className="relative aspect-video w-full">
        {embed ? (
          <iframe
            className="absolute inset-0 size-full"
            src={embed.src}
            title="Director's Reel"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-black px-8 text-center font-sans text-sm text-white/65">
            Director&rsquo;s Reel is not available.
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function ProjectModal({
  project,
  onClose,
}: {
  project: PortfolioProject;
  onClose: () => void;
}) {
  const embed = videoEmbed(project.videoUrl);

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel={project.title}
      closeButtonTone="light"
      className="w-full max-w-6xl bg-white text-black"
    >
      <div className="flex h-[min(calc(100dvh-3rem),52rem)] flex-col overflow-hidden bg-white font-sans">
        <header className="shrink-0 px-6 py-7 pr-16 sm:px-9 sm:py-9 sm:pr-20">
          <h2 className="text-4xl leading-none sm:text-5xl" style={MODAL_HEADING_STYLE}>
            {project.title}
          </h2>
        </header>
        <div className="relative min-h-0 flex-1 bg-black">
          {embed ? (
            <iframe
              className="absolute inset-0 size-full"
              src={embed.src}
              title={project.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <a
              className="absolute inset-0 grid place-items-center text-sm text-white transition-opacity hover:opacity-60"
              href={project.videoUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open video
            </a>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

function BioModal({
  bio,
  onClose,
}: {
  bio: PortfolioContent["bio"];
  onClose: () => void;
}) {
  const hasImage = Boolean(bio.image);

  return (
    <ModalShell
      onClose={onClose}
      ariaLabel="Yaslynn Rivera bio"
      closeButtonTone="light"
      className="w-full max-w-5xl bg-white text-black"
    >
      <div
        className={`h-[min(calc(100dvh-2rem),48rem)] overflow-y-auto overscroll-contain bg-white font-sans md:grid md:h-[min(calc(100dvh-3rem),48rem)] md:overflow-hidden ${
          hasImage
            ? "md:grid-cols-[0.9fr_minmax(0,1.1fr)] md:grid-rows-1"
            : "grid-cols-1"
        }`}
      >
        {bio.image ? (
          <div className="relative m-6 mb-0 aspect-[4/5] w-auto bg-white min-[480px]:m-[7%] min-[480px]:mb-0 sm:mx-auto sm:mb-0 sm:mt-8 sm:w-[72%] sm:max-w-md md:m-10 md:aspect-auto md:min-h-0 md:w-auto md:max-w-none">
            <ContentImage
              image={bio.image}
              className="absolute inset-0 size-full object-cover object-[50%_35%]"
            />
          </div>
        ) : null}
        <div className="min-h-0 px-6 pb-8 pt-6 pr-14 text-black sm:px-9 sm:pb-10 sm:pt-8 sm:pr-16 md:overflow-y-auto md:overscroll-contain md:py-10">
          <h2
            className="mb-7 text-5xl leading-none md:text-6xl"
            style={MODAL_HEADING_STYLE}
          >
            {bio.heading || "Bio"}
          </h2>
          <div className="space-y-5 text-[15px] leading-7 text-black/75 md:text-base md:leading-8">
            <PortableText value={bio.body} components={BIO_PORTABLE_TEXT_COMPONENTS} />
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function StillArtistCover({ artist }: { artist: StillArtist }) {
  const coverImage = artist.coverImage ?? artist.images[0];

  return coverImage ? (
    <ContentImage image={coverImage} className="size-full object-cover" />
  ) : (
    <div className="size-full bg-neutral-200" aria-hidden="true" />
  );
}

function StillsModal({ artists, onClose }: { artists: StillArtist[]; onClose: () => void }) {
  const [selectedArtistKey, setSelectedArtistKey] = useState<string | null>(null);
  const selectedArtist =
    artists.find((artist) => artist.key === selectedArtistKey) ?? null;

  return (
    <ModalShell
      onClose={onClose}
      ariaLabelledBy="stills-modal-title"
      closeButtonTone="light"
      className="w-full max-w-7xl bg-white text-black"
    >
      <div
        key={selectedArtistKey ?? "all-stills-artists"}
        className="h-[min(calc(100dvh-3rem),54rem)] overflow-y-auto overscroll-contain bg-white px-6 pb-10 pt-8 font-sans text-black sm:px-9 sm:pb-12 sm:pt-10"
      >
        <h2
          id="stills-modal-title"
          className="pr-12 text-5xl leading-none sm:pr-16 sm:text-6xl"
          style={MODAL_HEADING_STYLE}
        >
          Stills
        </h2>

        {selectedArtist ? (
          <div>
            <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-end sm:mt-2">
              <button
                type="button"
                onClick={() => setSelectedArtistKey(null)}
                className="inline-flex cursor-pointer items-center gap-2 justify-self-start text-sm transition-opacity hover:opacity-60 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-black"
                aria-label="Back to all stills artists"
              >
                <ArrowLeft size={18} strokeWidth={1.5} aria-hidden="true" />
                <span>Back</span>
              </button>
              <h3 className="min-w-0 text-center text-3xl leading-tight sm:text-4xl">
                {selectedArtist.name}
              </h3>
            </div>

            <div className="mt-3 grid items-start gap-4 sm:mt-4 sm:grid-cols-2 lg:grid-cols-3">
              {selectedArtist.images.map((image) => (
                <ContentImage key={image.key} image={image} className="h-auto w-full" />
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 items-start gap-x-4 gap-y-8 sm:mt-4 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10">
            {artists.map((artist) => (
              <button
                key={artist.key}
                type="button"
                onClick={() => setSelectedArtistKey(artist.key)}
                className="block w-full cursor-pointer text-left transition-opacity hover:opacity-60 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-black"
                aria-label={`View ${artist.name} stills`}
              >
                <div className="aspect-square w-full overflow-hidden bg-neutral-200">
                  <StillArtistCover artist={artist} />
                </div>
                <span className="mt-2 block text-sm leading-tight sm:text-base">
                  {artist.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function ClientCover({ client }: { client: PortfolioClient }) {
  const fallbackUrl = client.projects
    .map((project) => youtubeThumbnailUrl(project.videoUrl))
    .find(Boolean);

  if (client.coverImage) {
    return (
      <ContentImage
        image={{
          ...client.coverImage,
          alt: client.coverImage.alt || `${client.name} cover`,
        }}
        className="size-full object-cover"
      />
    );
  }

  if (fallbackUrl) {
    return (
      <div
        className="size-full bg-cover bg-center"
        style={{ backgroundImage: `url("${fallbackUrl}")` }}
        aria-hidden="true"
      />
    );
  }

  return <div className="size-full bg-neutral-200" aria-hidden="true" />;
}

function ClientProjects({ client }: { client: PortfolioClient }) {
  return (
    <div
      className={`mt-3 grid items-start gap-x-6 gap-y-10 sm:mt-4 ${
        client.projects.length > 1 ? "md:grid-cols-2" : "max-w-3xl"
      }`}
    >
      {client.projects.map((project) => {
        const embed = videoEmbed(project.videoUrl);
        return (
          <article key={project.key}>
            <h4 className="mb-3 text-base leading-tight sm:text-lg">{project.title}</h4>
            <div className="relative aspect-video w-full bg-black">
              {embed ? (
                <iframe
                  className="absolute inset-0 size-full"
                  src={embed.src}
                  title={`${client.name} — ${project.title}`}
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : (
                <a
                  className="absolute inset-0 grid place-items-center text-sm text-white transition-opacity hover:opacity-60"
                  href={project.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open video
                </a>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ClientsModal({
  clients,
  onClose,
}: {
  clients: PortfolioClient[];
  onClose: () => void;
}) {
  const [selectedClientKey, setSelectedClientKey] = useState<string | null>(null);
  const selectedClient =
    clients.find((client) => client.key === selectedClientKey) ?? null;

  return (
    <ModalShell
      onClose={onClose}
      ariaLabelledBy="clients-modal-title"
      closeButtonTone="light"
      className="w-full max-w-6xl bg-white text-black"
    >
      <div
        key={selectedClientKey ?? "all-clients"}
        className="h-[min(calc(100dvh-3rem),54rem)] overflow-y-auto overscroll-contain bg-white px-6 pb-10 pt-8 font-sans text-black sm:px-9 sm:pb-12 sm:pt-10"
      >
        <h2
          id="clients-modal-title"
          className="pr-12 text-5xl leading-none sm:pr-16 sm:text-6xl"
          style={MODAL_HEADING_STYLE}
        >
          Clients
        </h2>

        {selectedClient ? (
          <div>
            <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-end sm:mt-2">
              <button
                type="button"
                onClick={() => setSelectedClientKey(null)}
                className="inline-flex cursor-pointer items-center gap-2 justify-self-start text-sm transition-opacity hover:opacity-60 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-black"
                aria-label="Back to all clients"
              >
                <ArrowLeft size={18} strokeWidth={1.5} aria-hidden="true" />
                <span>Back</span>
              </button>
              <h3 className="min-w-0 text-center text-3xl leading-tight sm:text-4xl">
                {selectedClient.name}
              </h3>
            </div>
            <ClientProjects client={selectedClient} />
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 items-start gap-x-4 gap-y-8 sm:mt-4 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10">
            {clients.map((client) => (
              <button
                key={client.key}
                type="button"
                onClick={() => setSelectedClientKey(client.key)}
                className="group block w-full cursor-pointer text-left transition-opacity hover:opacity-60 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-black"
                aria-label={`View ${client.name} projects`}
              >
                <div className="aspect-square w-full overflow-hidden bg-neutral-200">
                  <ClientCover client={client} />
                </div>
                <span className="mt-2 block text-sm leading-tight sm:text-base">
                  {client.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
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
  fine = false,
}: {
  label: string;
  tooltip?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  fine?: boolean;
}) {
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startValue: number;
    width: number;
  } | null>(null);

  const endFineDrag = (event: React.PointerEvent<HTMLInputElement>) => {
    if (!fine || dragRef.current?.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between gap-2 text-[11px] text-[#d8cdbb]">
        <TooltipLabel label={label} tooltip={tooltip} />
        <span className="font-mono text-[#fff7e8]">{formatNumber(value)}</span>
      </span>
      <input
        className={`w-full accent-sky-300 ${fine ? "cursor-ew-resize touch-none" : ""}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        onKeyDown={(event) => {
          if (!fine) {
            return;
          }

          const direction =
            event.key === "ArrowRight" || event.key === "ArrowUp"
              ? 1
              : event.key === "ArrowLeft" || event.key === "ArrowDown"
                ? -1
                : 0;
          if (direction === 0) {
            return;
          }

          event.preventDefault();
          onChange(formatNumber(THREE.MathUtils.clamp(value + direction * step, min, max)));
        }}
        onPointerDown={(event) => {
          if (!fine || (event.pointerType === "mouse" && event.button !== 0)) {
            return;
          }

          event.preventDefault();
          event.currentTarget.focus({ preventScroll: true });
          const width = Math.max(event.currentTarget.getBoundingClientRect().width, 1);
          dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startValue: value,
            width,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!fine || !drag || drag.pointerId !== event.pointerId) {
            return;
          }

          event.preventDefault();
          const delta =
            ((event.clientX - drag.startX) / drag.width) *
            (max - min) *
            ENVIRONMENT_FINE_DRAG_SENSITIVITY;
          const rawValue = THREE.MathUtils.clamp(drag.startValue + delta, min, max);
          const snappedValue = min + Math.round((rawValue - min) / step) * step;
          onChange(formatNumber(THREE.MathUtils.clamp(snappedValue, min, max)));
        }}
        onPointerUp={endFineDrag}
        onPointerCancel={endFineDrag}
        onLostPointerCapture={() => {
          dragRef.current = null;
        }}
      />
    </label>
  );
}
