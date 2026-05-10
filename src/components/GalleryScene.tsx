"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Eye,
  Lock,
  Plus,
  RotateCcw,
  ScanSearch,
  Scissors,
  SlidersHorizontal,
  Trash2,
  Unlock,
} from "lucide-react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import savedComposites from "@/content/composites.json";
import { works } from "@/content/works";

type MaskShape = "rectangle" | "oval";

type FrameSetting = {
  id: string;
  model: string;
  workSlug: string;
  maskShape: MaskShape;
  position: [number, number, number];
  width: number;
  height: number;
  frameRotationX: number;
  rotation: [number, number, number];
  wallScale: number;
  clipX: number;
  clipY: number;
  clipZ: number;
  clipWidth: number;
  clipHeight: number;
  videoScale: number;
  videoOffsetX: number;
  videoOffsetY: number;
};

const STORAGE_KEY = "yaz-frame-editor-v3";
const LEGACY_STORAGE_KEY = "yaz-frame-editor-v2";

const frameModels = [
  "/3d-models/frames/picture_frame_1520_dimensions.glb",
  "/3d-models/frames/picture_frame_2.glb",
  "/3d-models/frames/fancy_picture_frame_01-freepoly.org.glb",
  "/3d-models/frames/picture_frame.glb",
  "/3d-models/frames/vintage_picture_frame..glb",
];

const firstSavedComposite = savedComposites[0];

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
    model: normalizeFrameModelPath(seed?.model ?? firstSavedComposite?.model ?? frameModels[1]),
    workSlug: seed?.workSlug ?? work?.slug ?? firstSavedComposite?.workSlug ?? "",
    maskShape: normalizeMaskShape(seed?.maskShape ?? firstSavedComposite?.maskShape),
    position: seed?.position ?? defaultPositions[index % defaultPositions.length],
    width: seed?.width ?? firstSavedComposite?.frameWidth ?? 1.6,
    height: seed?.height ?? firstSavedComposite?.frameHeight ?? 2,
    frameRotationX: seed?.frameRotationX ?? firstSavedComposite?.frameRotationX ?? 0,
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
  };
}

const defaultFrameSettings = [
  createFrameSetting(0),
  createFrameSetting(1),
] satisfies FrameSetting[];

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
  textures: THREE.Texture[],
  videos: HTMLVideoElement[],
  onSceneError: (error: Error) => void,
) {
  const video = document.createElement("video");
  video.src = clipSrc;
  video.muted = true;
  video.loop = true;
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

  video.play().catch((error: unknown) => {
    onSceneError(error instanceof Error ? error : new Error(String(error)));
  });

  videos.push(video);
  textures.push(texture);
  return texture;
}

function applyVideoCrop(texture: THREE.Texture, setting: FrameSetting) {
  const aperture = visibleSize(setting);
  const repeatX = (aperture.width / setting.clipWidth) / Math.max(1, setting.videoScale);
  const repeatY = (aperture.height / setting.clipHeight) / Math.max(1, setting.videoScale);
  texture.repeat.set(repeatX, repeatY);
  texture.offset.set(0.5 - repeatX / 2, 0.5 - repeatY / 2);
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

function createFrame(
  setting: FrameSetting,
  sourceModel: THREE.Object3D,
  geometries: THREE.BufferGeometry[],
  materials: THREE.Material[],
  textures: THREE.Texture[],
  videos: HTMLVideoElement[],
  _selected: boolean,
  onSceneError: (error: Error) => void,
) {
  const group = new THREE.Group();
  applyFramePlacement(group, setting);

  const frameModel = sourceModel.clone(true);
  const modelBox = new THREE.Box3().setFromObject(frameModel);
  const modelSize = modelBox.getSize(new THREE.Vector3());
  const modelCenter = modelBox.getCenter(new THREE.Vector3());
  const scale = Math.min(setting.width / modelSize.x, setting.height / modelSize.y);

  frameModel.position.sub(modelCenter);
  frameModel.scale.setScalar(scale);
  frameModel.rotation.x = setting.frameRotationX;
  frameModel.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = false;
      object.receiveShadow = false;
    }
  });
  group.add(frameModel);

  const work = works.find((candidate) => candidate.slug === setting.workSlug) ?? works[0];
  if (!work) {
    throw new Error("No video work clips are configured.");
  }

  const texture = createVideoTexture(work.clipSrc, textures, videos, onSceneError);
  applyVideoCrop(texture, setting);
  const clipMaterial = makeMaterial(
    new THREE.MeshBasicMaterial({
      map: texture,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
    materials,
  );
  const clipShape = createClipGeometry(setting, geometries);
  const clip = new THREE.Mesh(clipShape.geometry, clipMaterial);
  clip.scale.copy(clipShape.scale);
  clip.position.set(setting.clipX, setting.clipY, setting.clipZ);
  group.add(clip);

  return group;
}

function applyFramePlacement(group: THREE.Group, setting: FrameSetting) {
  group.position.set(...setting.position);
  group.rotation.set(...setting.rotation);
  group.scale.setScalar(setting.wallScale);
}

async function loadFrameModels(settings: FrameSetting[]) {
  const loader = new GLTFLoader();
  const uniqueModels = Array.from(new Set(settings.map((frame) => frame.model)));
  const loadedModels = await Promise.all(
    uniqueModels.map(async (model) => {
      const gltf = await loader.loadAsync(model);
      return [model, gltf.scene] as const;
    }),
  );

  return new Map(loadedModels);
}

function ThreeWallCanvas({
  settings,
  selectedFrame,
  resetSignal,
  freeOrbit,
  onSceneError,
}: {
  settings: FrameSetting[];
  selectedFrame: number;
  resetSignal: number;
  freeOrbit: boolean;
  onSceneError: (error: Error) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef(settings);
  const freeOrbitRef = useRef(freeOrbit);
  const frameObjectsRef = useRef<THREE.Group[]>([]);

  useEffect(() => {
    settingsRef.current = settings;
    frameObjectsRef.current.forEach((group, index) => {
      const setting = settings[index];
      if (setting) {
        applyFramePlacement(group, setting);
      }
    });
  }, [settings]);

  useEffect(() => {
    freeOrbitRef.current = freeOrbit;
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

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor("#15130f", 1);
    renderer.domElement.className = "block h-full w-full";
    renderer.domElement.setAttribute("aria-label", "Interactive 3D picture frame wall");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    const root = new THREE.Group();
    scene.add(root);

    scene.add(new THREE.AmbientLight("#fff4dd", 2.2));

    const keyLight = new THREE.DirectionalLight("#ffe4ba", 2.8);
    keyLight.position.set(-3.8, 4.2, 5.6);
    scene.add(keyLight);

    const fillLight = new THREE.PointLight("#c7d9ff", 8, 12);
    fillLight.position.set(4.2, 2.1, 3.6);
    scene.add(fillLight);

    const wall = new THREE.Mesh(
      makeGeometry(new THREE.BoxGeometry(9.8, 5.6, 0.16), geometries),
      makeMaterial(
        new THREE.MeshStandardMaterial({
          color: "#ddd4bb",
          roughness: 0.92,
          metalness: 0.01,
        }),
        materials,
      ),
    );
    wall.position.set(0, 0.18, -0.14);
    root.add(wall);

    for (let index = 0; index < 18; index += 1) {
      const seam = new THREE.Mesh(
        makeGeometry(new THREE.BoxGeometry(0.012, 5.38, 0.012), geometries),
        makeMaterial(
          new THREE.MeshStandardMaterial({ color: "#c6b996", roughness: 1 }),
          materials,
        ),
      );
      seam.position.set(-4.5 + index * 0.55, 0.18, -0.045);
      root.add(seam);
    }

    const baseboard = new THREE.Mesh(
      makeGeometry(new THREE.BoxGeometry(10.25, 0.38, 0.28), geometries),
      makeMaterial(
        new THREE.MeshStandardMaterial({ color: "#4a4033", roughness: 0.78 }),
        materials,
      ),
    );
    baseboard.position.set(0, -2.72, 0.06);
    root.add(baseboard);

    const floor = new THREE.Mesh(
      makeGeometry(new THREE.PlaneGeometry(11, 4.8), geometries),
      makeMaterial(
        new THREE.MeshStandardMaterial({ color: "#8a806c", roughness: 0.88 }),
        materials,
      ),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -2.46, 1.86);
    root.add(floor);

    const frameGroup = new THREE.Group();
    root.add(frameGroup);

    let pointerIsDown = false;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let startRotationX = 0;
    let startRotationY = 0;
    let targetRotationX = 0;
    let targetRotationY = 0;
    let animationFrame = 0;
    let disposed = false;

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const isPhone = width < 720;

      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(width, height, false);

      camera.aspect = width / height;
      camera.fov = isPhone ? 54 : 43;
      camera.position.set(0, isPhone ? 0.1 : 0.32, isPhone ? 8.9 : 7.25);
      camera.lookAt(0, 0.05, -0.05);
      camera.updateProjectionMatrix();
    };

    const onPointerDown = (event: PointerEvent) => {
      pointerIsDown = true;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      startRotationX = targetRotationX;
      startRotationY = targetRotationY;
      host.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointerIsDown) {
        return;
      }

      const deltaX = event.clientX - pointerStartX;

      if (freeOrbitRef.current) {
        const deltaY = event.clientY - pointerStartY;
        targetRotationY = startRotationY + deltaX * 0.006;
        targetRotationX = startRotationX + deltaY * 0.004;
        return;
      }

      targetRotationY = THREE.MathUtils.clamp(startRotationY + deltaX * 0.0026, -0.16, 0.16);
      targetRotationX = 0;
    };

    const endPointer = (event: PointerEvent) => {
      pointerIsDown = false;
      if (host.hasPointerCapture(event.pointerId)) {
        host.releasePointerCapture(event.pointerId);
      }
    };

    const animate = () => {
      root.rotation.x += (targetRotationX - root.rotation.x) * 0.08;
      root.rotation.y += (targetRotationY - root.rotation.y) * 0.08;
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };

    host.style.touchAction = "none";
    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerup", endPointer);
    host.addEventListener("pointercancel", endPointer);
    window.addEventListener("resize", resize);

    loadFrameModels(settingsRef.current)
      .then((models) => {
        if (disposed) {
          return;
        }

        const currentSettings = settingsRef.current;
        const frames = currentSettings.map((setting, index) => {
          const sourceModel = models.get(setting.model);
          if (!sourceModel) {
            throw new Error(`Frame model did not load: ${setting.model}`);
          }

          return createFrame(
            setting,
            sourceModel,
            geometries,
            materials,
            textures,
            videos,
            index === selectedFrame,
            onSceneError,
          );
        });
        frameObjectsRef.current = frames;
        frames.forEach((frame) => frameGroup.add(frame));
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
      videos.forEach((video) => {
        video.pause();
        video.removeAttribute("src");
        video.load();
      });
      frameObjectsRef.current = [];
      renderer.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      renderer.domElement.remove();
    };
  }, [onSceneError, resetSignal, selectedFrame]);

  return <div ref={hostRef} className="absolute inset-0" />;
}

function readStoredSettings() {
  if (typeof window === "undefined") {
    return defaultFrameSettings;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  const legacyStored = stored ? null : window.localStorage.getItem(LEGACY_STORAGE_KEY);
  const storedValue = stored ?? legacyStored;
  if (!storedValue) {
    return defaultFrameSettings;
  }

  const parsed = JSON.parse(storedValue) as Partial<FrameSetting>[];
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return defaultFrameSettings;
  }

  const migrated = parsed.map((setting, index) => createFrameSetting(index, setting));
  if (legacyStored) {
    return [
      ...migrated,
      ...defaultFrameSettings.slice(migrated.length),
    ];
  }

  return migrated;
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

function FramePreviewButton({
  index,
  setting,
  selected,
  onClick,
}: {
  index: number;
  setting: FrameSetting;
  selected: boolean;
  onClick: () => void;
}) {
  const work = workForSetting(setting);

  return (
    <button
      type="button"
      className={`overflow-hidden rounded border text-left transition ${
        selected
          ? "border-sky-300 bg-sky-300/15 text-sky-100"
          : "border-white/10 bg-white/5 text-[#f6f0e5] hover:bg-white/10"
      }`}
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
        ) : null}
        <div className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
          {index + 1}
        </div>
      </div>
      <div className="min-w-0 px-2 py-1.5">
        <div className="truncate text-[11px] font-medium">{work?.artist ?? "Object"}</div>
        <div className="truncate text-[10px] text-[#bfb29f]">{work?.title ?? setting.id}</div>
      </div>
    </button>
  );
}

export function GalleryScene() {
  const storageReadyRef = useRef(false);
  const [showChrome, setShowChrome] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [freeOrbit, setFreeOrbit] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState(0);
  const [resetSignal, setResetSignal] = useState(0);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [settings, setSettings] = useState<FrameSetting[]>(defaultFrameSettings);
  const selected = settings[selectedFrame] ?? settings[0];
  const exportedSettings = useMemo(() => JSON.stringify(settings, null, 2), [settings]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        const loadedSettings = readStoredSettings();
        setSettings(loadedSettings);
        setSelectedFrame((current) => Math.min(current, loadedSettings.length - 1));
        setResetSignal((current) => current + 1);
      } catch (error) {
        setSceneError(error instanceof Error ? error.message : String(error));
      } finally {
        storageReadyRef.current = true;
      }
    }, 0);

    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (storageReadyRef.current) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  }, [settings]);

  const handleSceneError = useCallback((error: Error) => {
    setSceneError(error.message);
  }, []);

  const updateSelectedFrame = useCallback(
    (partial: Partial<FrameSetting>) => {
      setSceneError(null);
      setSettings((current) =>
        current.map((setting, index) =>
          index === selectedFrame ? { ...setting, ...partial } : setting,
        ),
      );
    },
    [selectedFrame],
  );

  const updateSelectedPosition = (axis: 0 | 1 | 2, value: number) => {
    if (!selected) {
      return;
    }

    const position = [...selected.position] as FrameSetting["position"];
    position[axis] = value;
    updateSelectedFrame({ position });
  };

  const updateSelectedRotation = (axis: 0 | 1 | 2, value: number) => {
    if (!selected) {
      return;
    }

    const rotation = [...selected.rotation] as FrameSetting["rotation"];
    rotation[axis] = value;
    updateSelectedFrame({ rotation });
  };

  const updateSelectedSize = (value: number) => {
    updateSelectedFrame({ wallScale: value });
  };

  const addFrame = () => {
    const source = selected ?? settings[settings.length - 1] ?? defaultFrameSettings[0];
    const nextIndex = settings.length;
    const nextPosition: FrameSetting["position"] = [
      formatNumber(THREE.MathUtils.clamp(source.position[0] + 0.65, -4.2, 4.2)),
      formatNumber(THREE.MathUtils.clamp(source.position[1] - 0.18, -1.5, 2)),
      source.position[2],
    ];
    const nextFrame = createFrameSetting(nextIndex, {
      ...source,
      id: `frame-${Date.now().toString(36)}`,
      position: nextPosition,
      rotation: [
        source.rotation[0],
        source.rotation[1] * -1 || 0.025,
        formatNumber(source.rotation[2] * -1 || -0.015),
      ],
      workSlug: works[nextIndex % Math.max(works.length, 1)]?.slug ?? source.workSlug,
    });

    setSceneError(null);
    setSettings([...settings, nextFrame]);
    setSelectedFrame(nextIndex);
    setResetSignal((current) => current + 1);
  };

  const removeSelectedFrame = () => {
    if (settings.length <= 1) {
      return;
    }

    const nextSettings = settings.filter((_, index) => index !== selectedFrame);
    const nextSelectedFrame = Math.min(selectedFrame, nextSettings.length - 1);
    setSceneError(null);
    setSettings(nextSettings);
    setSelectedFrame(nextSelectedFrame);
    setResetSignal((current) => current + 1);
  };

  return (
    <section className="relative h-full min-h-screen w-full supports-[height:100dvh]:min-h-dvh">
      <ThreeWallCanvas
        key={resetSignal}
        settings={settings}
        selectedFrame={selectedFrame}
        resetSignal={resetSignal}
        freeOrbit={freeOrbit}
        onSceneError={handleSceneError}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4 sm:p-6">
        {showChrome ? (
          <div className="max-w-[19rem] rounded border border-white/10 bg-[#16120d]/78 px-4 py-3 shadow-2xl backdrop-blur">
            <h1 className="text-base font-medium leading-6 text-[#fff7e8]">
              Yaz frame wall
            </h1>
          </div>
        ) : (
          <div />
        )}

        <div className="pointer-events-auto flex items-center gap-2 rounded border border-white/10 bg-[#16120d]/78 p-1 shadow-2xl backdrop-blur">
          <Link
            className="grid h-10 place-items-center rounded px-3 text-xs font-medium text-[#f6f0e5] transition hover:bg-white/10"
            href="/object-editor"
            aria-label="Open object editor"
            title="Open object editor"
          >
            Object
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
            className="grid size-10 place-items-center rounded text-[#f6f0e5] transition hover:bg-white/10"
            aria-label="Toggle editor"
            title="Toggle editor"
            onClick={() => setEditorOpen((current) => !current)}
          >
            <SlidersHorizontal size={18} />
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
          <button
            type="button"
            className="grid size-10 place-items-center rounded text-[#f6f0e5] transition hover:bg-white/10"
            aria-label="Toggle overlay"
            title="Toggle overlay"
            onClick={() => setShowChrome((current) => !current)}
          >
            {showChrome ? <Eye size={18} /> : <ScanSearch size={18} />}
          </button>
          <button
            type="button"
            className="grid size-10 place-items-center rounded text-[#f6f0e5] transition hover:bg-white/10"
            aria-label="Reset scene"
            title="Reset scene"
            onClick={() => {
              setSceneError(null);
              setResetSignal((current) => current + 1);
            }}
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </div>

      {editorOpen && selected ? (
        <div className="absolute bottom-3 left-3 right-3 max-h-[56vh] overflow-auto rounded border border-white/10 bg-[#16120d]/92 p-3 text-xs text-[#f6f0e5] shadow-2xl backdrop-blur sm:left-auto sm:right-4 sm:top-20 sm:bottom-auto sm:w-[22rem] sm:max-h-[calc(100vh-7rem)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
                Objects
              </div>
              <div className="font-mono text-[11px] text-[#fff7e8]">
                {selectedFrame + 1} / {settings.length}
              </div>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                className="grid size-9 place-items-center rounded border border-white/10 bg-white/10 text-[#f6f0e5] transition hover:bg-white/15"
                aria-label="Add object"
                title="Add object"
                onClick={addFrame}
              >
                <Plus size={16} />
              </button>
              <button
                type="button"
                className="grid size-9 place-items-center rounded border border-white/10 bg-white/10 text-[#f6f0e5] transition enabled:hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="Remove selected object"
                title="Remove selected object"
                disabled={settings.length <= 1}
                onClick={removeSelectedFrame}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-2">
            {settings.map((setting, index) => (
              <FramePreviewButton
                key={setting.id}
                index={index}
                setting={setting}
                selected={index === selectedFrame}
                onClick={() => setSelectedFrame(index)}
              />
            ))}
          </div>

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
              min={-1.5}
              max={2}
              step={0.02}
              value={selected.position[1]}
              onChange={(value) => updateSelectedPosition(1, value)}
            />
            <RangeControl
              label="Depth Z"
              min={-0.35}
              max={0.45}
              step={0.005}
              value={selected.position[2]}
              onChange={(value) => updateSelectedPosition(2, value)}
            />
            <RangeControl
              label="Size"
              min={0.35}
              max={2.4}
              step={0.01}
              value={selected.wallScale}
              onChange={updateSelectedSize}
            />
          </div>

          <div className="mb-3 mt-4 text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
            Rotation
          </div>
          <div className="grid grid-cols-2 gap-3">
            <RangeControl
              label="Pitch X"
              min={-0.55}
              max={0.55}
              step={0.005}
              value={selected.rotation[0]}
              onChange={(value) => updateSelectedRotation(0, value)}
            />
            <RangeControl
              label="Yaw Y"
              min={-0.55}
              max={0.55}
              step={0.005}
              value={selected.rotation[1]}
              onChange={(value) => updateSelectedRotation(1, value)}
            />
            <RangeControl
              label="Roll Z"
              min={-0.55}
              max={0.55}
              step={0.005}
              value={selected.rotation[2]}
              onChange={(value) => updateSelectedRotation(2, value)}
            />
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded border border-white/10 bg-white/10 px-3 py-2 text-xs hover:bg-white/15"
              onClick={() => {
                window.localStorage.removeItem(STORAGE_KEY);
                window.localStorage.removeItem(LEGACY_STORAGE_KEY);
                setSettings(defaultFrameSettings);
                setSelectedFrame(0);
                setSceneError(null);
                setResetSignal((current) => current + 1);
              }}
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

      {sceneError ? (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded border border-red-300/40 bg-red-950/90 px-3 py-2 font-mono text-xs leading-5 text-red-100">
          {sceneError}
        </div>
      ) : null}
    </section>
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
    <label className="block">
      <span className="mb-1 flex items-center justify-between gap-2 text-[11px] text-[#d8cdbb]">
        {label}
        <span className="font-mono text-[#fff7e8]">{formatNumber(value)}</span>
      </span>
      <input
        className="w-full accent-sky-300"
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
