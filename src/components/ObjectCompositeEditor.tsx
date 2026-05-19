"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { works } from "@/content/works";

type MaskShape = "rectangle" | "oval";
type DragMode = "move" | "nw" | "ne" | "se" | "sw";

type CompositeConfig = {
  id: string;
  model: string;
  workSlug: string;
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
const SCENE_STORAGE_KEY = "yaz-environment-editor-v4";
const FRAME_STORAGE_KEY = "yaz-frame-editor-v3";
const LEGACY_FRAME_STORAGE_KEY = "yaz-frame-editor-v2";
const FRAME_ROTATION_LIMIT = Math.PI;
const PREVIEW_YAW_LIMIT = Math.PI;
const PREVIEW_PITCH_LIMIT = Math.PI / 2;

const frameModels = [
  "/3d-models/frames/picture_frame_1520_dimensions.glb",
  "/3d-models/frames/standing_picture_frame_01.glb",
  "/3d-models/frames/picture_frame_2.glb",
  "/3d-models/frames/fancy_picture_frame_01-freepoly.org.glb",
  "/3d-models/frames/picture_frame.glb",
  "/3d-models/frames/vintage_picture_frame..glb",
];

function normalizeFrameModelPath(model: string) {
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
  model: frameModels[1],
  workSlug: works[0]?.slug ?? "",
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

const defaultComposites = [
  defaultComposite,
  normalizeComposite({
    ...defaultComposite,
    id: "composite-02",
    workSlug: works[1]?.slug ?? defaultComposite.workSlug,
  }),
] satisfies CompositeConfig[];

type SceneFrameSetting = {
  id?: string;
  kind?: string;
  model?: string;
  workSlug?: string;
  maskShape?: string;
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

function normalizeComposite(composite: Partial<CompositeConfig>) {
  const parsed = { ...defaultComposite, ...composite };
  const videoAspect = parsed.videoAspect || defaultComposite.videoAspect;
  return {
    ...parsed,
    model: normalizeFrameModelPath(parsed.model),
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
  if (composites.length >= defaultComposites.length) {
    return composites;
  }

  const existingIds = new Set(composites.map((composite) => composite.id));
  const missingDefaults = defaultComposites.filter((composite) => !existingIds.has(composite.id));
  return [...composites, ...missingDefaults].slice(0, defaultComposites.length);
}

function sceneFrameToComposite(frame: SceneFrameSetting, index: number): CompositeConfig {
  const fallback = defaultComposites[index] ?? defaultComposite;
  const videoWidth = frame.clipWidth ?? fallback.videoWidth;
  const videoHeight = frame.clipHeight ?? fallback.videoHeight;
  const videoAspect = videoWidth / Math.max(0.001, videoHeight);

  return normalizeComposite({
    id: frame.id ?? `scene-frame-${String(index + 1).padStart(2, "0")}`,
    model: frame.model ?? fallback.model,
    workSlug: frame.workSlug ?? works[index % Math.max(works.length, 1)]?.slug ?? fallback.workSlug,
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
    .filter((setting) => !setting.kind || setting.kind === "frame")
    .map(sceneFrameToComposite);
}

function compositeToSceneFramePatch(composite: CompositeConfig): Partial<SceneFrameSetting> {
  return {
    model: composite.model,
    workSlug: composite.workSlug,
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
    const matchingFrameIndex = nextObjects.findIndex(
      (object) => (!object.kind || object.kind === "frame") && object.id === composite.id,
    );
    const targetIndex = matchingFrameIndex >= 0 ? matchingFrameIndex : frameIndexes[index];
    if (targetIndex === undefined || targetIndex < 0) {
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
    let dragStartPoint = new THREE.Vector3();
    let dragStartConfig = configRef.current;
    let orbitStartX = 0;
    let orbitStartY = 0;
    let orbitStartRotationX = 0;
    let orbitStartRotationY = 0;
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
    camera.position.set(0, 0, cameraDistance);
    camera.lookAt(0, 0, 0);

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

    const loader = new GLTFLoader();
    const video = document.createElement("video");
    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace;
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.wrapS = THREE.ClampToEdgeWrapping;
    videoTexture.wrapT = THREE.ClampToEdgeWrapping;
    textures.push(videoTexture);
    videos.push(video);

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
      camera.position.z = cameraDistance;
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
      applyVideoCrop(videoTexture, current);
      dragPlane.constant = -current.videoZ;

      const shape = createVideoGeometry(current, geometries);
      const videoMaterial = makeMaterial(
        new THREE.MeshBasicMaterial({
          map: videoTexture,
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
      const gltf = await loader.loadAsync(current.model);
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
      if (!activePointers.size && !orbiting && !dragMode) {
        cameraDistance = THREE.MathUtils.clamp(cameraDistance || baseCameraDistance, 1.8, 8);
      }
      camera.position.z = cameraDistance || baseCameraDistance;
      camera.updateProjectionMatrix();
    };

    const onPointerDown = (event: PointerEvent) => {
      activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (activePointers.size === 2) {
        event.preventDefault();
        host.setPointerCapture(event.pointerId);
        dragMode = null;
        orbiting = false;
        pinchStartDistance = distanceBetweenActivePointers();
        pinchStartCameraDistance = cameraDistance || baseCameraDistance;
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
          const sceneComposites = readSceneFrameComposites();
          setComposites(
            sceneComposites.length > 0
              ? sceneComposites
              : ensureDefaultCompositeCount(loaded.map(normalizeComposite)),
          );
        } catch (nextError) {
          try {
            const sceneComposites = readSceneFrameComposites();
            setComposites(sceneComposites.length > 0 ? sceneComposites : readStoredComposites());
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

  const resetComposite = () => {
    setError(null);
    setSaveStatus(null);
    setComposites((current) =>
      current.map((composite, index) =>
        index === selectedComposite
          ? normalizeComposite({ ...defaultComposite, id: composite.id })
          : composite,
      ),
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
              const selected = index === selectedComposite;
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
                  {work ? (
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
                      Object {index + 1}
                    </span>
                    <span className="block truncate text-[11px] text-[#d8cdbb]">
                      {work?.artist ?? composite.id}
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

          <label className="grid min-w-0 gap-1 text-xs text-[#d8cdbb]">
            Frame model
            <select
              className="w-full min-w-0 rounded border border-white/10 bg-[#221d17] px-3 py-2 text-sm text-[#f6f0e5]"
              value={config.model}
              onChange={(event) => updateConfig({ model: event.target.value })}
            >
              {frameModels.map((model) => (
                <option key={model} value={model}>
                  {model.replace("/3d-models/frames/", "")}
                </option>
              ))}
            </select>
          </label>

          <label className="grid min-w-0 gap-1 text-xs text-[#d8cdbb]">
            Clip
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
              step={0.02}
              value={config.frameWidth}
              onChange={(value) => updateConfig({ frameWidth: value })}
            />
            <RangeControl
              label="Frame H"
              min={0.6}
              max={3.2}
              step={0.02}
              value={config.frameHeight}
              onChange={(value) => updateConfig({ frameHeight: value })}
            />
            <RangeControl
              label="Frame Pitch"
              min={-FRAME_ROTATION_LIMIT}
              max={FRAME_ROTATION_LIMIT}
              step={0.01}
              value={config.frameRotationX}
              onChange={(value) => updateConfig({ frameRotationX: value })}
            />
            <RangeControl
              label="Frame Yaw"
              min={-FRAME_ROTATION_LIMIT}
              max={FRAME_ROTATION_LIMIT}
              step={0.01}
              value={config.frameRotationY}
              onChange={(value) => updateConfig({ frameRotationY: value })}
            />
            <RangeControl
              label="Frame Roll"
              min={-FRAME_ROTATION_LIMIT}
              max={FRAME_ROTATION_LIMIT}
              step={0.01}
              value={config.frameRotationZ}
              onChange={(value) => updateConfig({ frameRotationZ: value })}
            />
            <RangeControl
              label="Video X"
              min={-1.2}
              max={1.2}
              step={0.01}
              value={config.videoX}
              onChange={(value) => updateConfig({ videoX: value })}
            />
            <RangeControl
              label="Video Y"
              min={-1.2}
              max={1.2}
              step={0.01}
              value={config.videoY}
              onChange={(value) => updateConfig({ videoY: value })}
            />
            <RangeControl
              label="Video Z"
              min={-0.12}
              max={0.24}
              step={0.005}
              value={config.videoZ}
              onChange={(value) => updateConfig({ videoZ: value })}
            />
            <RangeControl
              label="Video Zoom"
              min={1}
              max={3}
              step={0.02}
              value={config.videoZoom}
              onChange={(value) =>
                updateConfig({
                  videoZoom: value,
                  cropX: clampCropAmount(config.cropX),
                  cropY: clampCropAmount(config.cropY),
                })
              }
            />
            <RangeControl
              label="Video Size"
              min={0.12}
              max={2.4}
              step={0.01}
              value={config.videoWidth}
              onChange={(value) =>
                updateConfig({
                  videoWidth: value,
                  videoHeight: formatNumber(value / config.videoAspect),
                })
              }
            />
            <RangeControl
              label="Crop X"
              min={0}
              max={0.48}
              step={0.01}
              value={config.cropX}
              onChange={(value) => updateConfig({ cropX: clampCropAmount(value) })}
            />
            <RangeControl
              label="Crop Y"
              min={0}
              max={0.48}
              step={0.01}
              value={config.cropY}
              onChange={(value) => updateConfig({ cropY: clampCropAmount(value) })}
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
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-xs text-[#d8cdbb]">
      <span className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 font-mono text-[#fff7e8]">{formatNumber(value)}</span>
      </span>
      <input
        className="w-full min-w-0 accent-sky-300"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
