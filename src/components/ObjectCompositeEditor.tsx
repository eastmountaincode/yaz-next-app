"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import {
  bioFramePicture,
  familyFramePicture,
  framePictures,
} from "@/content/framePictures";
import { works } from "@/content/works";
import { resolveModelAssetUrl } from "@/lib/modelAssetUrl";

type MaskShape = "rectangle" | "oval";
type DragMode = "move" | "nw" | "ne" | "se" | "sw";
type CompositeKind = "video-frame" | "bio-frame" | "image-frame";

type CompositeConfig = {
  id: string;
  kind: CompositeKind;
  model: string;
  workSlug: string;
  imageSrc: string;
  bioSlug?: "yaslynn";
  captionText?: string;
  maskShape: MaskShape;
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
  videoAspect: number;
  videoZoom: number;
  cropX: number;
  cropY: number;
};

const STORAGE_KEY = "yaz-object-composites-v1";
const SCENE_STORAGE_KEY = "yaz-environment-editor-v5";
const FRAME_STORAGE_KEY = "yaz-frame-editor-v3";
const LEGACY_FRAME_STORAGE_KEY = "yaz-frame-editor-v2";
const FRAME_ROTATION_LIMIT = Math.PI;
const PREVIEW_YAW_LIMIT = Math.PI;
const PREVIEW_PITCH_LIMIT = Math.PI / 2;
const COMPOSITE_FINE_DRAG_SENSITIVITY = 0.2;
const BIO_FRAME_IMAGE_PATH = bioFramePicture.src;
const BIO_IMAGE_ASPECT = bioFramePicture.aspect;
const FAMILY_FRAME_IMAGE_PATH = familyFramePicture.src;
const FAMILY_IMAGE_ASPECT = familyFramePicture.aspect;

const frameModels = [
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

function normalizeMaskShape(maskShape: string | undefined): MaskShape {
  return maskShape === "oval" || maskShape === "circle" ? "oval" : "rectangle";
}

const defaultComposite: CompositeConfig = {
  id: "composite-01",
  kind: "video-frame",
  model: frameModels[1],
  workSlug: works[0]?.slug ?? "",
  imageSrc: "",
  maskShape: "rectangle",
  frameWidth: 1.6,
  frameHeight: 2.0,
  frameRotationX: 0,
  frameRotationY: 0,
  frameRotationZ: 0,
  videoX: 0,
  videoY: 0,
  videoZ: 0.09,
  videoWidth: 1.2,
  videoHeight: 0.675,
  videoAspect: 16 / 9,
  videoZoom: 1.25,
  cropX: 0,
  cropY: 0,
};

const defaultBioComposite: CompositeConfig = {
  ...defaultComposite,
  id: "bio-yaslynn-frame",
  kind: "bio-frame",
  model: "/3d-models/frames/vintage_frame_06.glb",
  workSlug: works[0]?.slug ?? "",
  imageSrc: BIO_FRAME_IMAGE_PATH,
  bioSlug: "yaslynn",
  captionText: bioFramePicture.defaultCaption,
  frameWidth: 1.42,
  frameHeight: 2.02,
  frameRotationX: 0,
  frameRotationY: 0,
  frameRotationZ: 0,
  videoX: 0,
  videoY: 0,
  videoZ: 0.09,
  videoWidth: 0.82,
  videoHeight: 0.82 / BIO_IMAGE_ASPECT,
  videoAspect: BIO_IMAGE_ASPECT,
  videoZoom: 1,
  cropX: 0,
  cropY: 0,
};

const defaultFamilyComposite: CompositeConfig = {
  ...defaultComposite,
  id: "family-portrait-frame",
  kind: "image-frame",
  model: "/3d-models/frames/photo_frame_with_mat_2026_05_31.glb",
  workSlug: works[0]?.slug ?? "",
  imageSrc: FAMILY_FRAME_IMAGE_PATH,
  bioSlug: undefined,
  captionText: "",
  frameWidth: 1.9,
  frameHeight: 1.3,
  frameRotationX: 0,
  frameRotationY: 0,
  frameRotationZ: 0,
  videoX: 0,
  videoY: 0,
  videoZ: 0.09,
  videoWidth: 1.46,
  videoHeight: 1.46 / FAMILY_IMAGE_ASPECT,
  videoAspect: FAMILY_IMAGE_ASPECT,
  videoZoom: 1,
  cropX: 0,
  cropY: 0,
};

const defaultComposites = [
  {
    ...defaultComposite,
    id: "frame-02",
    model: "/3d-models/frames/vintage_frame_06.glb",
    workSlug: "yaslynn-director-reel",
    frameWidth: 2.3,
    frameHeight: 2.34,
    frameRotationX: -0.001592653589793,
    frameRotationY: -0.001592653589793,
    frameRotationZ: -1.57159265358979,
    videoX: 0.011,
    videoY: -0.026,
    videoZ: -0.01,
    videoWidth: 2.789,
    videoHeight: 1.9290039032006248,
    videoAspect: 1.445823927765237,
    videoZoom: 1.25,
    cropX: 0.12,
    cropY: 0.06,
  },
] satisfies CompositeConfig[];

type SceneFrameSetting = {
  id?: string;
  kind?: string;
  label?: string;
  visible?: boolean;
  model?: string;
  workSlug?: string;
  imageSrc?: string;
  bioSlug?: "yaslynn";
  captionText?: string;
  maskShape?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  wallScale?: number;
  width?: number;
  height?: number;
  frameRotationX?: number;
  frameRotationY?: number;
  frameRotationZ?: number;
  clipX?: number;
  clipY?: number;
  clipZ?: number;
  clipWidth?: number;
  clipHeight?: number;
  videoScale?: number;
  videoOffsetX?: number;
  videoOffsetY?: number;
};

type StoredEnvironment = {
  lighting?: unknown;
  objects?: SceneFrameSetting[];
};

function normalizeComposite(composite: Partial<CompositeConfig>): CompositeConfig {
  const kind: CompositeKind =
    composite.kind === "bio-frame" || composite.id === defaultBioComposite.id
      ? "bio-frame"
      : composite.kind === "image-frame" || composite.id === defaultFamilyComposite.id
        ? "image-frame"
      : "video-frame";
  const fallback =
    kind === "bio-frame"
      ? defaultBioComposite
      : kind === "image-frame"
        ? defaultFamilyComposite
        : defaultComposite;
  const parsed = { ...fallback, ...composite, kind };
  const videoAspect = parsed.videoAspect || fallback.videoAspect;
  return {
    ...parsed,
    model: normalizeFrameModelPath(parsed.model),
    imageSrc: kind === "bio-frame" || kind === "image-frame" ? parsed.imageSrc || fallback.imageSrc : "",
    bioSlug: kind === "bio-frame" ? parsed.bioSlug ?? "yaslynn" : undefined,
    captionText:
      kind === "bio-frame" || kind === "image-frame" ? parsed.captionText ?? fallback.captionText : undefined,
    maskShape: normalizeMaskShape(parsed.maskShape),
    frameRotationX: parsed.frameRotationX ?? 0,
    frameRotationY: parsed.frameRotationY ?? 0,
    frameRotationZ: parsed.frameRotationZ ?? 0,
    videoAspect,
    videoHeight: parsed.videoWidth / videoAspect,
    cropX: clampCropAmount(parsed.cropX),
    cropY: clampCropAmount(parsed.cropY),
  };
}

function readStoredComposites() {
  if (typeof window === "undefined") {
    return defaultComposites;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return defaultComposites;
  }

  const parsed = JSON.parse(stored) as Partial<CompositeConfig>[] | Partial<CompositeConfig>;
  const composites = Array.isArray(parsed) ? parsed : [parsed];
  return ensureDefaultCompositeCount(composites.map(normalizeComposite));
}

function ensureDefaultCompositeCount(composites: CompositeConfig[]) {
  return composites.length > 0 ? composites : defaultComposites;
}

function mergeCompositeLists(
  baseComposites: CompositeConfig[],
  overrideComposites: CompositeConfig[],
) {
  if (overrideComposites.length === 0) {
    return baseComposites;
  }

  const baseById = new Map(baseComposites.map((composite) => [composite.id, composite]));
  const overridesById = new Map(overrideComposites.map((composite) => [composite.id, composite]));
  const merged = baseComposites.map((composite) => overridesById.get(composite.id) ?? composite);
  const appendedOverrides = overrideComposites.filter((composite) => !baseById.has(composite.id));
  return [...merged, ...appendedOverrides];
}

function sceneFrameToComposite(frame: SceneFrameSetting, index: number): CompositeConfig {
  const isBioFrame = frame.kind === "bio-frame";
  const isImageFrame = frame.kind === "image-frame";
  const fallback = isBioFrame
    ? defaultBioComposite
    : isImageFrame
      ? defaultFamilyComposite
      : defaultComposites[index] ?? defaultComposite;
  const videoWidth = frame.clipWidth ?? fallback.videoWidth;
  const videoHeight = frame.clipHeight ?? fallback.videoHeight;
  const videoAspect = videoWidth / Math.max(0.001, videoHeight);

  return normalizeComposite({
    id: frame.id ?? `scene-frame-${String(index + 1).padStart(2, "0")}`,
    kind: isBioFrame ? "bio-frame" : isImageFrame ? "image-frame" : "video-frame",
    model: frame.model ?? fallback.model,
    workSlug: frame.workSlug ?? works[index % Math.max(works.length, 1)]?.slug ?? fallback.workSlug,
    imageSrc: frame.imageSrc ?? fallback.imageSrc,
    bioSlug: frame.bioSlug ?? fallback.bioSlug,
    captionText: frame.captionText ?? fallback.captionText,
    maskShape: normalizeMaskShape(frame.maskShape),
    frameWidth: frame.width ?? fallback.frameWidth,
    frameHeight: frame.height ?? fallback.frameHeight,
    frameRotationX: frame.frameRotationX ?? fallback.frameRotationX,
    frameRotationY: frame.frameRotationY ?? fallback.frameRotationY,
    frameRotationZ: frame.frameRotationZ ?? fallback.frameRotationZ,
    videoX: frame.clipX ?? fallback.videoX,
    videoY: frame.clipY ?? fallback.videoY,
    videoZ: frame.clipZ ?? fallback.videoZ,
    videoWidth,
    videoHeight,
    videoAspect,
    videoZoom: frame.videoScale ?? fallback.videoZoom,
    cropX: frame.videoOffsetX ?? fallback.cropX,
    cropY: frame.videoOffsetY ?? fallback.cropY,
  });
}

function readSceneFrameComposites() {
  if (typeof window === "undefined") {
    return [];
  }

  const stored =
    window.localStorage.getItem(SCENE_STORAGE_KEY) ??
    window.localStorage.getItem(FRAME_STORAGE_KEY) ??
    window.localStorage.getItem(LEGACY_FRAME_STORAGE_KEY);
  if (!stored) {
    return [];
  }

  const parsed = JSON.parse(stored) as SceneFrameSetting[] | SceneFrameSetting;
  const settings = Array.isArray(parsed) ? parsed : [parsed];
  return settings
    .filter(
      (setting) =>
        !setting.kind ||
        setting.kind === "frame" ||
        setting.kind === "bio-frame" ||
        setting.kind === "image-frame",
    )
    .map(sceneFrameToComposite);
}

function compositeToSceneFramePatch(composite: CompositeConfig): Partial<SceneFrameSetting> {
  const common = {
    model: composite.model,
    maskShape: composite.maskShape,
    width: composite.frameWidth,
    height: composite.frameHeight,
    frameRotationX: composite.frameRotationX,
    frameRotationY: composite.frameRotationY,
    frameRotationZ: composite.frameRotationZ,
    clipX: composite.videoX,
    clipY: composite.videoY,
    clipZ: composite.videoZ,
    clipWidth: composite.videoWidth,
    clipHeight: composite.videoHeight,
    videoScale: composite.videoZoom,
    videoOffsetX: composite.cropX,
    videoOffsetY: composite.cropY,
  };

  return composite.kind === "bio-frame" || composite.kind === "image-frame"
    ? {
        ...common,
        imageSrc:
          composite.imageSrc ||
          (composite.kind === "bio-frame" ? BIO_FRAME_IMAGE_PATH : defaultFamilyComposite.imageSrc),
        bioSlug: composite.kind === "bio-frame" ? composite.bioSlug ?? "yaslynn" : undefined,
        captionText: composite.captionText,
      }
    : {
        ...common,
        workSlug: composite.workSlug,
      };
}

function compositeToSceneFrame(composite: CompositeConfig, index: number): SceneFrameSetting {
  return {
    id: composite.id,
    kind:
      composite.kind === "bio-frame"
        ? "bio-frame"
        : composite.kind === "image-frame"
          ? "image-frame"
          : "frame",
    label:
      composite.kind === "bio-frame"
        ? "Bio portrait"
        : composite.kind === "image-frame"
          ? composite.captionText ?? "Family portrait"
          : `Video frame ${index + 1}`,
    visible: true,
    position:
      composite.kind === "bio-frame"
        ? [2.55, 0.92, 0]
        : composite.kind === "image-frame"
          ? [-0.05, 1.1, -0.03]
          : [0.95, 0.12, 0],
    rotation: [0, index % 2 === 0 ? 0.035 : -0.025, index % 2 === 0 ? 0.015 : -0.02],
    wallScale:
      composite.kind === "bio-frame" ? 0.78 : composite.kind === "image-frame" ? 0.82 : index === 0 ? 1 : 0.86,
    ...compositeToSceneFramePatch(composite),
  };
}

function applyCompositesToSceneFrames(
  objects: SceneFrameSetting[],
  composites: CompositeConfig[],
) {
  const nextObjects = objects.map((object) => ({ ...object }));
  const frameIndexes = nextObjects
    .map((object, index) => (!object.kind || object.kind === "frame" ? index : -1))
    .filter((index) => index >= 0);

  composites.forEach((composite, index) => {
    const isStillComposite = composite.kind === "bio-frame" || composite.kind === "image-frame";
    const matchingFrameIndex = nextObjects.findIndex(
      (object) =>
        isStillComposite
          ? object.kind === composite.kind && object.id === composite.id
          : (!object.kind || object.kind === "frame") && object.id === composite.id,
    );
    const targetIndex =
      matchingFrameIndex >= 0
        ? matchingFrameIndex
        : isStillComposite
          ? -1
          : frameIndexes[index];
    if (targetIndex === undefined || targetIndex < 0) {
      nextObjects.push(compositeToSceneFrame(composite, nextObjects.length));
      return;
    }

    nextObjects[targetIndex] = {
      ...nextObjects[targetIndex],
      ...compositeToSceneFramePatch(composite),
    };
  });

  return nextObjects;
}

function updateStoredSceneFrames(composites: CompositeConfig[]) {
  if (typeof window === "undefined") {
    return false;
  }

  const stored = window.localStorage.getItem(SCENE_STORAGE_KEY);
  if (!stored) {
    return false;
  }

  const parsed = JSON.parse(stored) as SceneFrameSetting[];
  if (!Array.isArray(parsed)) {
    return false;
  }

  window.localStorage.setItem(
    SCENE_STORAGE_KEY,
    JSON.stringify(applyCompositesToSceneFrames(parsed, composites)),
  );
  return true;
}

function formatNumber(value: number) {
  return Number(value.toFixed(3));
}

function clampCropAmount(value: number) {
  return formatNumber(THREE.MathUtils.clamp(Math.abs(value), 0, 0.48));
}

function getCropAmounts(config: CompositeConfig) {
  return {
    x: clampCropAmount(config.cropX),
    y: clampCropAmount(config.cropY),
  };
}

function getApertureSize(config: CompositeConfig) {
  const fullWidth = config.videoWidth;
  const fullHeight = getVideoHeight(config);
  const crop = getCropAmounts(config);
  const width = Math.max(0.04, fullWidth * (1 - crop.x * 2));
  const height = Math.max(0.04, fullHeight * (1 - crop.y * 2));

  return { width, height };
}

function makeGeometry<T extends THREE.BufferGeometry>(
  geometry: T,
  disposables: THREE.BufferGeometry[],
) {
  disposables.push(geometry);
  return geometry;
}

function makeMaterial<T extends THREE.Material>(material: T, disposables: THREE.Material[]) {
  disposables.push(material);
  return material;
}

function applyVideoCrop(texture: THREE.Texture, config: CompositeConfig) {
  const aperture = getApertureSize(config);
  const repeatX = (aperture.width / config.videoWidth) / Math.max(1, config.videoZoom);
  const repeatY = (aperture.height / getVideoHeight(config)) / Math.max(1, config.videoZoom);
  texture.repeat.set(repeatX, repeatY);
  texture.offset.set(0.5 - repeatX / 2, 0.5 - repeatY / 2);
}

function getVideoHeight(config: CompositeConfig) {
  return config.videoWidth / config.videoAspect;
}

function workForComposite(config: CompositeConfig) {
  return works.find((candidate) => candidate.slug === config.workSlug) ?? works[0];
}

function createVideoGeometry(config: CompositeConfig, geometries: THREE.BufferGeometry[]) {
  const aperture = getApertureSize(config);

  if (config.maskShape === "oval") {
    return {
      geometry: makeGeometry(new THREE.CircleGeometry(0.5, 96), geometries),
      scale: new THREE.Vector3(aperture.width, aperture.height, 1),
    };
  }

  return {
    geometry: makeGeometry(new THREE.PlaneGeometry(aperture.width, aperture.height), geometries),
    scale: new THREE.Vector3(1, 1, 1),
  };
}

function frameScaleForSize(size: THREE.Vector3, config: CompositeConfig) {
  return Math.min(config.frameWidth / size.x, config.frameHeight / size.y);
}

function createGridLines(
  vertices: number[],
  color: string,
  opacity: number,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
) {
  const geometry = makeGeometry(new THREE.BufferGeometry(), geometries);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  const material = makeMaterial(
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
    }),
    materials,
  );
  const lines = new THREE.LineSegments(geometry, material);
  lines.renderOrder = 40;
  return lines;
}

function createAlignmentGrid(
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
) {
  const size = 6;
  const z = 0.24;
  const minorVertices: number[] = [];
  const majorVertices: number[] = [];
  const axisVertices: number[] = [
    0, -size, z, 0, size, z,
    -size, 0, z, size, 0, z,
  ];

  for (let index = -size * 4; index <= size * 4; index += 1) {
    const value = index / 4;
    if (value === 0) {
      continue;
    }
    const target = index % 4 === 0 ? majorVertices : minorVertices;
    target.push(value, -size, z, value, size, z);
    target.push(-size, value, z, size, value, z);
  }

  const grid = new THREE.Group();
  grid.add(
    createGridLines(minorVertices, "#7dd3fc", 0.16, geometries, materials),
    createGridLines(majorVertices, "#9bdcff", 0.3, geometries, materials),
    createGridLines(axisVertices, "#f6d98f", 0.62, geometries, materials),
  );
  return grid;
}

function CompositeCanvas({
  config,
  showGrid,
  onChange,
  onError,
}: {
  config: CompositeConfig;
  showGrid: boolean;
  onChange: (partial: Partial<CompositeConfig>) => void;
  onError: (error: Error) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const onChangeRef = useRef(onChange);
  const configRef = useRef(config);
  const showGridRef = useRef(showGrid);
  const sceneControlsRef = useRef<{ syncConfig: () => void; syncGrid: () => void } | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
    configRef.current = config;
    showGridRef.current = showGrid;
    sceneControlsRef.current?.syncConfig();
    sceneControlsRef.current?.syncGrid();
  }, [config, onChange, showGrid]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      throw new Error("Composite editor canvas host was not mounted.");
    }

    let disposed = false;
    let animationFrame = 0;
    let dragMode: DragMode | null = null;
    let orbiting = false;
    let panning = false;
    let dragStartPoint = new THREE.Vector3();
    let dragStartConfig = configRef.current;
    let orbitStartX = 0;
    let orbitStartY = 0;
    let orbitStartRotationX = 0;
    let orbitStartRotationY = 0;
    let panStartX = 0;
    let panStartY = 0;
    let panStartTargetX = 0;
    let panStartTargetY = 0;
    let cameraDistance = 5.2;
    let baseCameraDistance = 5.2;
    const activePointers = new Map<number, { x: number; y: number }>();
    let pinchStartDistance = 0;
    let pinchStartCameraDistance = cameraDistance;

    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    const videos: HTMLVideoElement[] = [];

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor("#15130f", 1);
    renderer.domElement.className = "block h-full w-full";
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const cameraTarget = new THREE.Vector3(0, 0, 0);
    const updateCameraPlacement = () => {
      camera.position.set(cameraTarget.x, cameraTarget.y, cameraTarget.z + cameraDistance);
      camera.lookAt(cameraTarget);
    };
    updateCameraPlacement();

    const compositeRoot = new THREE.Group();
    const frameRoot = new THREE.Group();
    const videoRoot = new THREE.Group();
    const handleRoot = new THREE.Group();
    const alignmentGrid = createAlignmentGrid(geometries, materials);
    compositeRoot.add(frameRoot, videoRoot, handleRoot);
    scene.add(compositeRoot);
    scene.add(alignmentGrid);

    scene.add(new THREE.AmbientLight("#fff4df", 2.4));
    const keyLight = new THREE.DirectionalLight("#ffe0af", 3);
    keyLight.position.set(-3, 4, 4.5);
    scene.add(keyLight);

    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -configRef.current.videoZ);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const videoMeshRef: { current: THREE.Mesh | null } = { current: null };
    const handleMeshes: Array<{ mode: DragMode; mesh: THREE.Mesh }> = [];
    let loadedFrameModel: THREE.Object3D | null = null;
    let loadedFrameSize = new THREE.Vector3(1, 1, 1);
    let loadedFrameCenter = new THREE.Vector3();

    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const imageLoader = new THREE.TextureLoader();
    const video = document.createElement("video");
    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.wrapS = THREE.ClampToEdgeWrapping;
    videoTexture.wrapT = THREE.ClampToEdgeWrapping;
    textures.push(videoTexture);
    videos.push(video);
    let imageTexture: THREE.Texture | null = null;
    let imageTextureSource = "";

    const getImageTexture = (source: string) => {
      const nextSource = source || BIO_FRAME_IMAGE_PATH;
      if (imageTexture && imageTextureSource === nextSource) {
        return imageTexture;
      }

      if (imageTexture) {
        imageTexture.dispose();
      }

      imageTexture = imageLoader.load(
        nextSource,
        () => renderConfig(),
        undefined,
        (error) => onError(error instanceof Error ? error : new Error(String(error))),
      );
      imageTexture.colorSpace = THREE.SRGBColorSpace;
      imageTexture.minFilter = THREE.LinearFilter;
      imageTexture.magFilter = THREE.LinearFilter;
      imageTexture.wrapS = THREE.ClampToEdgeWrapping;
      imageTexture.wrapT = THREE.ClampToEdgeWrapping;
      imageTextureSource = nextSource;
      textures.push(imageTexture);
      return imageTexture;
    };

    const disposeGroup = (group: THREE.Group) => {
      while (group.children.length) {
        group.remove(group.children[0]);
      }
    };

    const setPointer = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
    };

    const pointFromEvent = (event: PointerEvent) => {
      setPointer(event);
      raycaster.setFromCamera(pointer, camera);
      const point = new THREE.Vector3();
      raycaster.ray.intersectPlane(dragPlane, point);
      return point;
    };

    const updateCameraDistance = (distance: number) => {
      cameraDistance = THREE.MathUtils.clamp(distance, 1.8, 8);
      updateCameraPlacement();
      camera.updateProjectionMatrix();
    };

    const distanceBetweenActivePointers = () => {
      const pointers = Array.from(activePointers.values());
      if (pointers.length < 2) {
        return 0;
      }

      return Math.hypot(pointers[0].x - pointers[1].x, pointers[0].y - pointers[1].y);
    };

    const updateFrameTransform = () => {
      const current = configRef.current;
      frameRoot.rotation.set(
        current.frameRotationX,
        current.frameRotationY,
        current.frameRotationZ,
      );
      if (loadedFrameModel) {
        const frameScale = frameScaleForSize(loadedFrameSize, current);
        loadedFrameModel.scale.setScalar(frameScale);
        loadedFrameModel.position.set(
          -loadedFrameCenter.x * frameScale,
          -loadedFrameCenter.y * frameScale,
          -loadedFrameCenter.z * frameScale,
        );
      }
    };

    const updateGridVisibility = () => {
      alignmentGrid.visible = showGridRef.current;
    };

    const updateVideo = () => {
      const current = configRef.current;
      disposeGroup(videoRoot);
      disposeGroup(handleRoot);
      handleMeshes.length = 0;

      updateFrameTransform();
      const mediaTexture =
        current.kind === "bio-frame" || current.kind === "image-frame"
          ? getImageTexture(current.imageSrc)
          : videoTexture;
      applyVideoCrop(mediaTexture, current);
      dragPlane.constant = -current.videoZ;

      const shape = createVideoGeometry(current, geometries);
      const videoMaterial = makeMaterial(
        new THREE.MeshBasicMaterial({
          map: mediaTexture,
          toneMapped: false,
          side: THREE.DoubleSide,
        }),
        materials,
      );
      const mesh = new THREE.Mesh(shape.geometry, videoMaterial);
      mesh.scale.copy(shape.scale);
      mesh.position.set(current.videoX, current.videoY, current.videoZ);
      videoRoot.add(mesh);
      videoMeshRef.current = mesh;

      const handleMaterial = makeMaterial(
        new THREE.MeshBasicMaterial({
          color: "#7dd3fc",
          opacity: 0.48,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        }),
        materials,
      );
      const handleGeometry = makeGeometry(new THREE.PlaneGeometry(0.1, 0.1), geometries);
      const aperture = getApertureSize(current);
      const halfWidth = aperture.width / 2;
      const halfHeight = aperture.height / 2;

      const corners: Array<{ mode: DragMode; x: number; y: number }> = [
        { mode: "nw", x: -halfWidth, y: halfHeight },
        { mode: "ne", x: halfWidth, y: halfHeight },
        { mode: "se", x: halfWidth, y: -halfHeight },
        { mode: "sw", x: -halfWidth, y: -halfHeight },
      ];

      corners.forEach((corner) => {
        const handle = new THREE.Mesh(handleGeometry, handleMaterial);
        handle.position.set(
          current.videoX + corner.x,
          current.videoY + corner.y,
          current.videoZ + 0.02,
        );
        handleRoot.add(handle);
        handleMeshes.push({ mode: corner.mode, mesh: handle });
      });
    };

    const updateVideoSource = () => {
      if (configRef.current.kind === "bio-frame" || configRef.current.kind === "image-frame") {
        video.pause();
        return;
      }

      const work = works.find((candidate) => candidate.slug === configRef.current.workSlug);
      if (!work || video.src.endsWith(work.clipSrc)) {
        return;
      }

      video.src = work.clipSrc;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "auto";
      video.crossOrigin = "anonymous";
      video.addEventListener(
        "loadedmetadata",
        () => {
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            const videoAspect = video.videoWidth / video.videoHeight;
            onChangeRef.current({
              videoAspect,
              videoHeight: formatNumber(configRef.current.videoWidth / videoAspect),
            });
          }
        },
        { once: true },
      );
      video.play().catch((error: unknown) => {
        onError(error instanceof Error ? error : new Error(String(error)));
      });
    };

    const updateFrame = async () => {
      const current = configRef.current;
      disposeGroup(frameRoot);
      const gltf = await loader.loadAsync(resolveModelAssetUrl(current.model));
      if (disposed) {
        return;
      }

      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      loadedFrameSize = box.getSize(new THREE.Vector3());
      loadedFrameCenter = center;
      loadedFrameModel = model;
      updateFrameTransform();
      model.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = false;
          object.receiveShadow = false;
        }
      });
      frameRoot.add(model);
    };

    const renderConfig = () => {
      updateVideoSource();
      updateVideo();
    };
    sceneControlsRef.current = { syncConfig: renderConfig, syncGrid: updateGridVisibility };

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      baseCameraDistance = width < 720 ? 6.2 : 5.2;
      if (!activePointers.size && !orbiting && !panning && !dragMode) {
        cameraDistance = THREE.MathUtils.clamp(cameraDistance || baseCameraDistance, 1.8, 8);
      }
      updateCameraPlacement();
      camera.updateProjectionMatrix();
    };

    const onPointerDown = (event: PointerEvent) => {
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activePointers.size === 2) {
        event.preventDefault();
        host.setPointerCapture(event.pointerId);
        dragMode = null;
        orbiting = false;
        panning = false;
        pinchStartDistance = distanceBetweenActivePointers();
        pinchStartCameraDistance = cameraDistance || baseCameraDistance;
        return;
      }

      if (event.shiftKey) {
        event.preventDefault();
        host.setPointerCapture(event.pointerId);
        dragMode = null;
        orbiting = false;
        panning = true;
        panStartX = event.clientX;
        panStartY = event.clientY;
        panStartTargetX = cameraTarget.x;
        panStartTargetY = cameraTarget.y;
        return;
      }

      const point = pointFromEvent(event);
      const handleHits = raycaster.intersectObjects(handleMeshes.map((item) => item.mesh));
      const handleHit = handleHits[0];
      const hitHandle = handleHit
        ? handleMeshes.find((item) => item.mesh === handleHit.object)
        : undefined;
      const videoHits = videoMeshRef.current ? raycaster.intersectObject(videoMeshRef.current) : [];

      if (!hitHandle && videoHits.length === 0) {
        event.preventDefault();
        host.setPointerCapture(event.pointerId);
        orbiting = true;
        orbitStartX = event.clientX;
        orbitStartY = event.clientY;
        orbitStartRotationX = compositeRoot.rotation.x;
        orbitStartRotationY = compositeRoot.rotation.y;
        return;
      }

      event.preventDefault();
      host.setPointerCapture(event.pointerId);
      dragMode = hitHandle?.mode ?? "move";
      dragStartPoint = point;
      dragStartConfig = { ...configRef.current };
    };

    const onPointerMove = (event: PointerEvent) => {
      if (activePointers.has(event.pointerId)) {
        activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }

      if (activePointers.size >= 2) {
        event.preventDefault();
        const nextPinchDistance = distanceBetweenActivePointers();
        if (pinchStartDistance > 0 && nextPinchDistance > 0) {
          const pinchRatio = nextPinchDistance / pinchStartDistance;
          const softenedRatio = 1 + (pinchRatio - 1) * 0.35;
          updateCameraDistance(pinchStartCameraDistance / Math.max(0.1, softenedRatio));
        }
        return;
      }

      if (panning) {
        const deltaX = event.clientX - panStartX;
        const deltaY = event.clientY - panStartY;
        const panSensitivity = cameraDistance * 0.00075;
        cameraTarget.x = THREE.MathUtils.clamp(panStartTargetX - deltaX * panSensitivity, -2.5, 2.5);
        cameraTarget.y = THREE.MathUtils.clamp(panStartTargetY + deltaY * panSensitivity, -2.2, 2.2);
        updateCameraPlacement();
        return;
      }

      if (orbiting) {
        const dx = event.clientX - orbitStartX;
        const dy = event.clientY - orbitStartY;
        compositeRoot.rotation.y = THREE.MathUtils.clamp(
          orbitStartRotationY + dx * 0.008,
          -PREVIEW_YAW_LIMIT,
          PREVIEW_YAW_LIMIT,
        );
        compositeRoot.rotation.x = THREE.MathUtils.clamp(
          orbitStartRotationX + dy * 0.006,
          -PREVIEW_PITCH_LIMIT,
          PREVIEW_PITCH_LIMIT,
        );
        return;
      }

      if (!dragMode) {
        return;
      }

      const point = pointFromEvent(event);
      const dx = point.x - dragStartPoint.x;
      const dy = point.y - dragStartPoint.y;

      if (dragMode === "move") {
        onChangeRef.current({
          videoX: formatNumber(dragStartConfig.videoX + dx),
          videoY: formatNumber(dragStartConfig.videoY + dy),
        });
        return;
      }

      const xSign = dragMode === "ne" || dragMode === "se" ? 1 : -1;
      const ySign = dragMode === "nw" || dragMode === "ne" ? 1 : -1;
      const startHeight = getVideoHeight(dragStartConfig);
      const widthFromX = dragStartConfig.videoWidth + dx * xSign;
      const widthFromY =
        dragStartConfig.videoWidth + dy * ySign * dragStartConfig.videoAspect;
      const nextWidth = Math.max(
        0.12,
        Math.abs(dx) > Math.abs(dy) ? widthFromX : widthFromY,
      );
      const nextHeight = nextWidth / dragStartConfig.videoAspect;
      onChangeRef.current({
        videoWidth: formatNumber(nextWidth),
        videoHeight: formatNumber(nextHeight),
        videoX: formatNumber(
          dragStartConfig.videoX + (xSign * (nextWidth - dragStartConfig.videoWidth)) / 2,
        ),
        videoY: formatNumber(
          dragStartConfig.videoY + (ySign * (nextHeight - startHeight)) / 2,
        ),
      });
    };

    const onPointerUp = (event: PointerEvent) => {
      activePointers.delete(event.pointerId);
      if (activePointers.size < 2) {
        pinchStartDistance = 0;
      }
      orbiting = false;
      panning = false;
      dragMode = null;
      if (host.hasPointerCapture(event.pointerId)) {
        host.releasePointerCapture(event.pointerId);
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const zoomFactor = event.deltaY > 0 ? 1.012 : 0.988;
      updateCameraDistance(cameraDistance * zoomFactor);
    };

    const preventBrowserGesture = (event: Event) => {
      event.preventDefault();
    };

    const animate = () => {
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };

    host.style.touchAction = "none";
    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerup", onPointerUp);
    host.addEventListener("pointercancel", onPointerUp);
    host.addEventListener("wheel", onWheel, { passive: false });
    host.addEventListener("gesturestart", preventBrowserGesture);
    host.addEventListener("gesturechange", preventBrowserGesture);
    host.addEventListener("gestureend", preventBrowserGesture);
    window.addEventListener("resize", resize);

    updateFrame().catch((error: unknown) => {
      onError(error instanceof Error ? error : new Error(String(error)));
    });
    renderConfig();
    updateGridVisibility();
    resize();
    animate();

    const interval = window.setInterval(() => {
      renderConfig();
    }, 250);

    return () => {
      disposed = true;
      sceneControlsRef.current = null;
      window.clearInterval(interval);
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("pointercancel", onPointerUp);
      host.removeEventListener("wheel", onWheel);
      host.removeEventListener("gesturestart", preventBrowserGesture);
      host.removeEventListener("gesturechange", preventBrowserGesture);
      host.removeEventListener("gestureend", preventBrowserGesture);
      videos.forEach((item) => {
        item.pause();
        item.removeAttribute("src");
        item.load();
      });
      renderer.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      renderer.domElement.remove();
    };
  }, [onChange, onError]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  return <div ref={hostRef} className="absolute inset-0" />;
}

export function ObjectCompositeEditor() {
  const storageReadyRef = useRef(false);
  const [composites, setComposites] = useState<CompositeConfig[]>(defaultComposites);
  const [selectedComposite, setSelectedComposite] = useState(0);
  const [viewResetSignal, setViewResetSignal] = useState(0);
  const [showGrid, setShowGrid] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const config = composites[selectedComposite] ?? composites[0] ?? defaultComposite;
  const isImageComposite = config.kind === "bio-frame" || config.kind === "image-frame";
  const frameModelsUsedElsewhere = useMemo(
    () =>
      new Set(
        composites
          .filter((_, index) => index !== selectedComposite)
          .map((composite) => normalizeFrameModelPath(composite.model)),
      ),
    [composites, selectedComposite],
  );
  const exportedConfig = useMemo(() => JSON.stringify(config, null, 2), [config]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/composites", { cache: "no-store" });
          if (!response.ok) {
            throw new Error("Failed to load composites: " + response.status);
          }
          const loaded = (await response.json()) as Partial<CompositeConfig>[];
          const loadedComposites = ensureDefaultCompositeCount(loaded.map(normalizeComposite));
          setComposites(loadedComposites);
        } catch (nextError) {
          try {
            const sceneComposites = readSceneFrameComposites();
            setComposites(mergeCompositeLists(readStoredComposites(), sceneComposites));
          } catch {
            setComposites(defaultComposites);
          }
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        } finally {
          storageReadyRef.current = true;
        }
      })();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (storageReadyRef.current) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(composites));
    }
  }, [composites]);

  const updateConfig = useCallback(
    (partial: Partial<CompositeConfig>) => {
      setError(null);
      setSaveStatus(null);
      setComposites((current) =>
        current.map((composite, index) =>
          index === selectedComposite
            ? normalizeComposite({ ...composite, ...partial })
            : composite,
        ),
      );
    },
    [selectedComposite],
  );

  const saveComposites = useCallback(async () => {
    setError(null);
    setSaveStatus("Saving...");
    const compositesResponse = await fetch("/api/composites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(composites),
    });

    if (!compositesResponse.ok) {
      const message = await compositesResponse.text();
      throw new Error(message || "Save failed: " + compositesResponse.status);
    }

    updateStoredSceneFrames(composites);

    let savedEnvironment = false;
    const environmentResponse = await fetch("/api/environment", { cache: "no-store" });
    if (environmentResponse.ok) {
      const environment = (await environmentResponse.json()) as StoredEnvironment;
      if (Array.isArray(environment.objects)) {
        const nextEnvironment: StoredEnvironment = {
          ...environment,
          objects: applyCompositesToSceneFrames(environment.objects, composites),
        };
        const saveEnvironmentResponse = await fetch("/api/environment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextEnvironment),
        });

        if (!saveEnvironmentResponse.ok) {
          const message = await saveEnvironmentResponse.text();
          throw new Error(message || "Environment save failed: " + saveEnvironmentResponse.status);
        }
        savedEnvironment = true;
      }
    } else if (environmentResponse.status !== 404) {
      const message = await environmentResponse.text();
      throw new Error(message || "Environment load failed: " + environmentResponse.status);
    }

    setSaveStatus(
      savedEnvironment
        ? "Saved to src/content/composites.json and src/content/environment.json"
        : "Saved to src/content/composites.json",
    );
  }, [composites]);

  const handleSave = useCallback(() => {
    saveComposites().catch((nextError: unknown) => {
      setSaveStatus(null);
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    });
  }, [saveComposites]);

  const handleError = useCallback((nextError: Error) => {
    setError(nextError.message);
  }, []);

  const selectComposite = (index: number) => {
    setSelectedComposite(index);
    setViewResetSignal((current) => current + 1);
  };

  const addComposite = (kind: "video-frame" | "bio-frame") => {
    const nextIndex = composites.length;
    const nextComposite = normalizeComposite({
      ...(kind === "bio-frame" ? defaultBioComposite : defaultComposite),
      id: `${kind === "bio-frame" ? "picture" : "video"}-${Date.now().toString(36)}`,
      workSlug:
        kind === "video-frame"
          ? works[nextIndex % Math.max(works.length, 1)]?.slug ?? defaultComposite.workSlug
          : defaultBioComposite.workSlug,
    });

    setError(null);
    setSaveStatus(null);
    setComposites((current) => [...current, nextComposite]);
    setSelectedComposite(nextIndex);
    setViewResetSignal((current) => current + 1);
  };

  const selectPicture = (imageSrc: string) => {
    const picture = framePictures.find((candidate) => candidate.src === imageSrc);
    if (!picture) {
      return;
    }

    updateConfig({
      kind: picture.kind,
      imageSrc: picture.src,
      bioSlug: picture.bioSlug,
      captionText: picture.defaultCaption,
      videoAspect: picture.aspect,
      videoHeight: formatNumber(config.videoWidth / picture.aspect),
    });
  };

  const resetComposite = () => {
    setError(null);
    setSaveStatus(null);
    setComposites((current) =>
      current.map((composite, index) => {
        if (index !== selectedComposite) {
          return composite;
        }

        const resetDefaults =
          composite.kind === "bio-frame"
            ? defaultBioComposite
            : composite.kind === "image-frame"
              ? defaultFamilyComposite
              : defaultComposite;

        return normalizeComposite({
          ...resetDefaults,
          id: composite.id,
          kind: composite.kind,
          model: composite.model,
          workSlug: composite.workSlug,
          imageSrc: composite.imageSrc,
          bioSlug: composite.bioSlug,
          captionText: composite.captionText,
          maskShape: composite.maskShape,
          videoAspect: composite.videoAspect,
          videoHeight: formatNumber(resetDefaults.videoWidth / composite.videoAspect),
        });
      }),
    );
  };

  return (
    <main className="grid min-h-screen bg-[#15130f] text-[#f6f0e5] lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
      <section className="relative min-h-[58vh] lg:min-h-screen">
        <CompositeCanvas
          key={
            config.id +
            "-" +
            config.model +
            viewResetSignal
          }
          config={config}
          showGrid={showGrid}
          onChange={updateConfig}
          onError={handleError}
        />
        <div className="absolute left-4 top-4 flex items-start gap-2">
          <Link
            className="rounded border border-white/10 bg-[#16120d]/86 px-3 py-2 text-xs font-medium text-[#f6f0e5] shadow-2xl backdrop-blur transition hover:bg-white/10"
            href="/"
          >
            Wall
          </Link>
          <div className="pointer-events-none rounded border border-white/10 bg-[#16120d]/80 px-4 py-3 shadow-2xl backdrop-blur">
            <h1 className="text-base font-medium">Object composite editor</h1>
            <div className="mt-1 font-mono text-[11px] text-[#d8cdbb]">
              {config.id}
            </div>
          </div>
        </div>
        <div className="absolute inset-x-4 bottom-4 rounded border border-white/10 bg-[#16120d]/88 p-2 shadow-2xl backdrop-blur">
          <div className="mb-2 flex items-center justify-between gap-3 px-1">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
              Composite objects
            </div>
            <div className="font-mono text-[11px] text-[#d8cdbb]">
              {selectedComposite + 1} / {composites.length}
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {composites.map((composite, index) => {
              const work = workForComposite(composite);
              const picture = framePictures.find(
                (candidate) => candidate.src === composite.imageSrc,
              );
              const selected = index === selectedComposite;
              const isStillImage = composite.kind === "bio-frame" || composite.kind === "image-frame";
              return (
                <button
                  key={composite.id}
                  type="button"
                  className={`grid w-44 shrink-0 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2 rounded border p-1.5 text-left transition ${
                    selected
                      ? "border-sky-300 bg-sky-300/15 text-sky-100"
                      : "border-white/10 bg-white/5 text-[#f6f0e5] hover:bg-white/10"
                  }`}
                  onClick={() => selectComposite(index)}
                >
                  {isStillImage ? (
                    <span className="relative block h-12 w-full overflow-hidden rounded bg-black/35">
                      <Image
                        fill
                        unoptimized
                        className="object-cover object-top"
                        src={composite.imageSrc || (composite.kind === "bio-frame" ? BIO_FRAME_IMAGE_PATH : FAMILY_FRAME_IMAGE_PATH)}
                        alt=""
                        sizes="4.5rem"
                      />
                    </span>
                  ) : work ? (
                    <video
                      className="h-12 w-full rounded object-cover"
                      src={work.clipSrc}
                      muted
                      loop
                      playsInline
                      autoPlay
                      preload="metadata"
                    />
                  ) : (
                    <div className="h-12 rounded bg-black/35" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">
                      {isStillImage
                        ? composite.captionText?.trim() || picture?.label || "Still image"
                        : `Object ${index + 1}`}
                    </span>
                    <span className="block truncate text-[11px] text-[#d8cdbb]">
                      {isStillImage
                        ? composite.kind === "bio-frame"
                          ? "Yaslynn Rivera"
                          : "Still image"
                        : work?.artist ?? composite.id}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <aside className="min-w-0 overflow-x-hidden border-t border-white/10 bg-[#16120d] p-4 lg:h-screen lg:overflow-y-auto lg:border-l lg:border-t-0">
        <div className="grid min-w-0 gap-4">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-[#d8cdbb]">Object composite editor</div>
              <div className="truncate font-mono text-sm">{config.id}</div>
            </div>
            <button
              type="button"
              className="shrink-0 rounded border border-sky-300/30 bg-sky-300/15 px-3 py-2 text-xs text-sky-100 hover:bg-sky-300/20"
              onClick={handleSave}
            >
              Save JSON
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="rounded border border-white/10 bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
              onClick={() => addComposite("video-frame")}
            >
              Add video
            </button>
            <button
              type="button"
              className="rounded border border-white/10 bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
              onClick={() => addComposite("bio-frame")}
            >
              Add picture
            </button>
          </div>

          <label className="grid min-w-0 gap-1 text-xs text-[#d8cdbb]">
            Frame model
            <select
              className="w-full min-w-0 rounded border border-white/10 bg-[#221d17] px-3 py-2 text-sm text-[#f6f0e5]"
              value={config.model}
              onChange={(event) => updateConfig({ model: event.target.value })}
            >
              {frameModels.map((model) => (
                <option key={model} value={model}>
                  {frameModelsUsedElsewhere.has(model) ? "☑" : "☐"}{" "}
                  {model.replace("/3d-models/frames/", "")}
                </option>
              ))}
            </select>
          </label>

          {isImageComposite ? (
            <label className="grid min-w-0 gap-1 text-xs text-[#d8cdbb]">
              Caption
              <input
                className="w-full min-w-0 rounded border border-white/10 bg-[#221d17] px-3 py-2 text-sm text-[#f6f0e5]"
                value={config.captionText ?? ""}
                onChange={(event) => updateConfig({ captionText: event.target.value })}
              />
            </label>
          ) : null}

          <label className="grid min-w-0 gap-1 text-xs text-[#d8cdbb]">
            {isImageComposite ? "Picture" : "Clip"}
            {isImageComposite ? (
              <select
                className="w-full min-w-0 rounded border border-white/10 bg-[#221d17] px-3 py-2 text-sm text-[#f6f0e5]"
                value={config.imageSrc || (config.kind === "bio-frame" ? BIO_FRAME_IMAGE_PATH : FAMILY_FRAME_IMAGE_PATH)}
                onChange={(event) => selectPicture(event.target.value)}
              >
                {framePictures.map((picture) => (
                  <option key={picture.id} value={picture.src}>
                    {picture.label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                className="w-full min-w-0 rounded border border-white/10 bg-[#221d17] px-3 py-2 text-sm text-[#f6f0e5]"
                value={config.workSlug}
                onChange={(event) => updateConfig({ workSlug: event.target.value })}
              >
                {works.map((work) => (
                  <option key={work.slug} value={work.slug}>
                    {work.artist} - {work.title}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="grid min-w-0 gap-1 text-xs text-[#d8cdbb]">
            Mask
            <select
              className="w-full min-w-0 rounded border border-white/10 bg-[#221d17] px-3 py-2 text-sm text-[#f6f0e5]"
              value={config.maskShape}
              onChange={(event) => updateConfig({ maskShape: event.target.value as MaskShape })}
            >
              <option value="rectangle">Rectangle</option>
              <option value="oval">Oval</option>
            </select>
          </label>

          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <RangeControl
              label="Frame W"
              min={0.6}
              max={2.8}
              step={0.001}
              value={config.frameWidth}
              onChange={(value) => updateConfig({ frameWidth: value })}
              fine
            />
            <RangeControl
              label="Frame H"
              min={0.6}
              max={3.2}
              step={0.001}
              value={config.frameHeight}
              onChange={(value) => updateConfig({ frameHeight: value })}
              fine
            />
            <RangeControl
              label="Frame Pitch"
              min={-FRAME_ROTATION_LIMIT}
              max={FRAME_ROTATION_LIMIT}
              step={0.001}
              value={config.frameRotationX}
              onChange={(value) => updateConfig({ frameRotationX: value })}
              fine
            />
            <RangeControl
              label="Frame Yaw"
              min={-FRAME_ROTATION_LIMIT}
              max={FRAME_ROTATION_LIMIT}
              step={0.001}
              value={config.frameRotationY}
              onChange={(value) => updateConfig({ frameRotationY: value })}
              fine
            />
            <RangeControl
              label="Frame Roll"
              min={-FRAME_ROTATION_LIMIT}
              max={FRAME_ROTATION_LIMIT}
              step={0.001}
              value={config.frameRotationZ}
              onChange={(value) => updateConfig({ frameRotationZ: value })}
              fine
            />
            <RangeControl
              label={isImageComposite ? "Image X" : "Video X"}
              min={-1.2}
              max={1.2}
              step={0.001}
              value={config.videoX}
              onChange={(value) => updateConfig({ videoX: value })}
              fine
            />
            <RangeControl
              label={isImageComposite ? "Image Y" : "Video Y"}
              min={-1.2}
              max={1.2}
              step={0.001}
              value={config.videoY}
              onChange={(value) => updateConfig({ videoY: value })}
              fine
            />
            <RangeControl
              label={isImageComposite ? "Image Z" : "Video Z"}
              min={-0.12}
              max={0.24}
              step={0.001}
              value={config.videoZ}
              onChange={(value) => updateConfig({ videoZ: value })}
              fine
            />
            <RangeControl
              label={isImageComposite ? "Image Zoom" : "Video Zoom"}
              min={1}
              max={3}
              step={0.001}
              value={config.videoZoom}
              onChange={(value) =>
                updateConfig({
                  videoZoom: value,
                  cropX: clampCropAmount(config.cropX),
                  cropY: clampCropAmount(config.cropY),
                })
              }
              fine
            />
            <RangeControl
              label={isImageComposite ? "Image Size" : "Video Size"}
              min={0.12}
              max={3}
              step={0.001}
              value={config.videoWidth}
              onChange={(value) =>
                updateConfig({
                  videoWidth: value,
                  videoHeight: formatNumber(value / config.videoAspect),
                })
              }
              fine
            />
            <RangeControl
              label="Crop X"
              min={0}
              max={0.48}
              step={0.001}
              value={config.cropX}
              onChange={(value) => updateConfig({ cropX: clampCropAmount(value) })}
              fine
            />
            <RangeControl
              label="Crop Y"
              min={0}
              max={0.48}
              step={0.001}
              value={config.cropY}
              onChange={(value) => updateConfig({ cropY: clampCropAmount(value) })}
              fine
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border border-white/10 bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
              onClick={() => setShowGrid((current) => !current)}
            >
              {showGrid ? "Hide grid" : "Show grid"}
            </button>
            <button
              type="button"
              className="rounded border border-white/10 bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
              onClick={() => setViewResetSignal((current) => current + 1)}
            >
              Reset view
            </button>
            <button
              type="button"
              className="rounded border border-white/10 bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
              onClick={resetComposite}
            >
              Reset object
            </button>
          </div>

          {saveStatus ? (
            <div className="rounded border border-sky-300/30 bg-sky-950/50 px-3 py-2 font-mono text-xs leading-5 text-sky-100">
              {saveStatus}
            </div>
          ) : null}

          <textarea
            className="h-56 w-full min-w-0 resize-none overflow-x-hidden rounded border border-white/10 bg-black/25 p-3 font-mono text-[10px] leading-4 text-[#d8cdbb]"
            readOnly
            wrap="soft"
            value={exportedConfig}
          />

          {error ? (
            <div className="rounded border border-red-300/40 bg-red-950/90 px-3 py-2 font-mono text-xs leading-5 text-red-100">
              {error}
            </div>
          ) : null}
        </div>
      </aside>
    </main>
  );
}

function RangeControl({
  label,
  min,
  max,
  step,
  value,
  onChange,
  fine = false,
}: {
  label: string;
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
    <label className="grid min-w-0 gap-1 text-xs text-[#d8cdbb]">
      <span className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 font-mono text-[#fff7e8]">{formatNumber(value)}</span>
      </span>
      <input
        className={`w-full min-w-0 accent-sky-300 ${fine ? "cursor-ew-resize touch-none" : ""}`}
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
            COMPOSITE_FINE_DRAG_SENSITIVITY;
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
