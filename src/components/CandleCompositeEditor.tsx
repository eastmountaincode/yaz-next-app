"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import {
  candleFlameAtlas,
  defaultCandleComposite,
  normalizeCandleComposite,
  type CandleCompositeConfig,
  type VectorTuple,
} from "@/lib/candleComposite";
import { resolveModelAssetUrl } from "@/lib/modelAssetUrl";

const STORAGE_KEY = "yaz-candle-composite-v1";

type CandleSceneHandles = {
  syncConfig: () => void;
  resetView: () => void;
};

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

function prepareModel(model: THREE.Object3D) {
  model.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
}

function createNormalizedModel(sourceModel: THREE.Object3D) {
  const model = sourceModel.clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = size.y > 0 ? 1 / size.y : 1;

  model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  model.scale.setScalar(scale);
  prepareModel(model);
  return model;
}

function createAnimatedImageTexture(source: string, textures: THREE.Texture[]) {
  const texture = new THREE.TextureLoader().load(source);
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

function CandleCanvas({
  config,
  showGrid,
  viewResetSignal,
  onError,
}: {
  config: CandleCompositeConfig;
  showGrid: boolean;
  viewResetSignal: number;
  onError: (error: Error) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const configRef = useRef(config);
  const showGridRef = useRef(showGrid);
  const onErrorRef = useRef(onError);
  const sceneHandlesRef = useRef<CandleSceneHandles | null>(null);

  useEffect(() => {
    configRef.current = config;
    sceneHandlesRef.current?.syncConfig();
  }, [config]);

  useEffect(() => {
    showGridRef.current = showGrid;
    sceneHandlesRef.current?.syncConfig();
  }, [showGrid]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    sceneHandlesRef.current?.resetView();
  }, [viewResetSignal]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      throw new Error("Candle editor canvas host was not mounted.");
    }

    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const textures: THREE.Texture[] = [];
    let animationFrame = 0;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor("#15130f", 1);
    renderer.domElement.className = "block h-full w-full";
    renderer.domElement.setAttribute("aria-label", "Candle composite preview");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const cameraTarget = new THREE.Vector3(0, 0.55, 0.02);
    const cameraOffset = new THREE.Vector3(0, 0.05, 4.2);
    camera.position.copy(cameraTarget).add(cameraOffset);
    camera.lookAt(cameraTarget);

    scene.add(new THREE.AmbientLight("#f1dfbf", 1.7));
    const keyLight = new THREE.DirectionalLight("#ffe0ad", 2.2);
    keyLight.position.set(-2.4, 3.2, 4.6);
    keyLight.castShadow = true;
    scene.add(keyLight);
    const fillLight = new THREE.PointLight("#7585ad", 0.55, 7);
    fillLight.position.set(2.6, 1.4, 3.5);
    scene.add(fillLight);

    const root = new THREE.Group();
    scene.add(root);

    const holderRoot = new THREE.Group();
    const candleRoot = new THREE.Group();
    root.add(holderRoot, candleRoot);

    const grid = new THREE.GridHelper(3, 24, "#9bdcff", "#9bdcff");
    grid.position.y = 0;
    if (grid.material instanceof THREE.Material) {
      grid.material.transparent = true;
      grid.material.opacity = 0.22;
      grid.material.depthWrite = false;
    }
    scene.add(grid);

    let holderModel: THREE.Object3D | null = null;
    let candleModel: THREE.Object3D | null = null;
    let flame: THREE.Mesh | null = null;
    let flameLight: THREE.PointLight | null = null;
    let pointerIsDown = false;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let startTargetX = 0;
    let startTargetY = 0.55;
    let pointerMode: "orbit" | "pan" = "orbit";
    let sphericalRadius = 4.2;
    let sphericalTheta = 0;
    let sphericalPhi = Math.PI / 2 - 0.04;

    const updateCamera = () => {
      const sinPhiRadius = Math.sin(sphericalPhi) * sphericalRadius;
      cameraOffset.set(
        sinPhiRadius * Math.sin(sphericalTheta),
        Math.cos(sphericalPhi) * sphericalRadius,
        sinPhiRadius * Math.cos(sphericalTheta),
      );
      camera.position.copy(cameraTarget).add(cameraOffset);
      camera.lookAt(cameraTarget);
    };

    const resetView = () => {
      pointerIsDown = false;
      pointerMode = "orbit";
      cameraTarget.set(0, 0.55, 0.02);
      sphericalRadius = 4.2;
      sphericalTheta = 0;
      sphericalPhi = Math.PI / 2 - 0.04;
      updateCamera();
    };

    const syncConfig = () => {
      const current = normalizeCandleComposite(configRef.current);

      root.scale.setScalar(current.wallScale);
      root.rotation.set(...current.rotation);

      if (holderModel) {
        holderModel.visible = current.visible;
      }

      candleRoot.position.set(...current.candleOffset);
      candleRoot.scale.setScalar(current.candleScale);

      if (flame) {
        flame.position.set(...current.flameOffset);
        flame.scale.setScalar(current.flameScale);
        if (flame.material instanceof THREE.MeshBasicMaterial) {
          flame.material.opacity = current.flameOpacity;
          flame.material.needsUpdate = true;
        }
      }

      if (flameLight) {
        flameLight.position.set(...current.flameOffset);
        flameLight.color.set(current.flameLightColor);
        flameLight.intensity = current.flameLightIntensity;
        flameLight.distance = current.flameLightDistance;
      }

      grid.visible = showGridRef.current;
    };

    sceneHandlesRef.current = { syncConfig, resetView };

    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    Promise.all([
      loader.loadAsync(resolveModelAssetUrl(configRef.current.holderModel)),
      configRef.current.separateCandleModel
        ? loader.loadAsync(resolveModelAssetUrl(configRef.current.candleModel))
        : Promise.resolve(null),
    ])
      .then(([holder, candle]) => {
        if (disposed) {
          return;
        }

        holderModel = createNormalizedModel(holder.scene);
        holderRoot.add(holderModel);
        if (candle) {
          candleModel = createNormalizedModel(candle.scene);
          candleRoot.add(candleModel);
        }

        const flameTexture = createAnimatedImageTexture(
          resolveModelAssetUrl(configRef.current.flameTexture),
          textures,
        );
        const flameMaterial = makeMaterial(
          new THREE.MeshBasicMaterial({
            map: flameTexture,
            transparent: true,
            opacity: configRef.current.flameOpacity,
            depthTest: true,
            depthWrite: false,
            toneMapped: false,
            side: THREE.DoubleSide,
            blending: THREE.NormalBlending,
          }),
          materials,
        );
        flame = new THREE.Mesh(
          makeGeometry(new THREE.PlaneGeometry(0.3, 1), geometries),
          flameMaterial,
        );
        flame.name = "candle-flame-billboard";
        flame.renderOrder = 10;
        flame.userData.animatedTexture = flameTexture;
        root.add(flame);

        flameLight = new THREE.PointLight(
          new THREE.Color(configRef.current.flameLightColor),
          configRef.current.flameLightIntensity,
          configRef.current.flameLightDistance,
          1.85,
        );
        flameLight.name = "flame-preview-light";
        root.add(flameLight);

        syncConfig();
      })
      .catch((error: unknown) => {
        onErrorRef.current(error instanceof Error ? error : new Error(String(error)));
      });

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const onPointerDown = (event: PointerEvent) => {
      pointerIsDown = true;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      startTargetX = cameraTarget.x;
      startTargetY = cameraTarget.y;
      pointerMode = event.shiftKey ? "pan" : "orbit";
      host.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointerIsDown) {
        return;
      }

      const deltaX = event.clientX - pointerStartX;
      const deltaY = event.clientY - pointerStartY;

      if (pointerMode === "pan") {
        const panSensitivity = sphericalRadius * 0.00075;
        cameraTarget.x = THREE.MathUtils.clamp(startTargetX - deltaX * panSensitivity, -1.8, 1.8);
        cameraTarget.y = THREE.MathUtils.clamp(startTargetY + deltaY * panSensitivity, -1.2, 2);
        updateCamera();
        return;
      }

      sphericalTheta = THREE.MathUtils.clamp(deltaX * 0.006, -Math.PI, Math.PI);
      sphericalPhi = THREE.MathUtils.clamp(
        Math.PI / 2 - 0.04 + deltaY * 0.005,
        0.18,
        Math.PI - 0.18,
      );
      updateCamera();
    };

    const onPointerUp = (event: PointerEvent) => {
      pointerIsDown = false;
      if (host.hasPointerCapture(event.pointerId)) {
        host.releasePointerCapture(event.pointerId);
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const zoomFactor = event.deltaY > 0 ? 1.027 : 0.973;
      sphericalRadius = THREE.MathUtils.clamp(sphericalRadius * zoomFactor, 1, 10);
      updateCamera();
    };

    const animate = () => {
      if (flame) {
        flame.lookAt(camera.position);
        const texture = flame.userData.animatedTexture as THREE.Texture | undefined;
        if (texture) {
          updateAnimatedImageTexture(texture, performance.now() / 1000);
        }
      }

      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };

    host.style.touchAction = "none";
    host.addEventListener("pointerdown", onPointerDown);
    host.addEventListener("pointermove", onPointerMove);
    host.addEventListener("pointerup", onPointerUp);
    host.addEventListener("pointercancel", onPointerUp);
    host.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", resize);
    resize();
    updateCamera();
    animate();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      host.removeEventListener("pointerdown", onPointerDown);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerup", onPointerUp);
      host.removeEventListener("pointercancel", onPointerUp);
      host.removeEventListener("wheel", onWheel);
      sceneHandlesRef.current = null;
      renderer.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className="absolute inset-0" />;
}

function readStoredCandle(storageKey: string) {
  if (typeof window === "undefined") {
    return defaultCandleComposite;
  }

  const stored = window.localStorage.getItem(storageKey);
  if (!stored) {
    return defaultCandleComposite;
  }

  return normalizeCandleComposite(JSON.parse(stored) as Partial<CandleCompositeConfig>);
}

function formatNumber(value: number) {
  return Number(value.toFixed(4));
}

function updateVector(
  vector: VectorTuple,
  axis: 0 | 1 | 2,
  value: number,
): VectorTuple {
  const next = [...vector] as VectorTuple;
  next[axis] = value;
  return next;
}

export function CandleCompositeEditor({ requestedId = "" }: { requestedId?: string }) {
  const storageKey = requestedId ? `${STORAGE_KEY}:${requestedId}` : STORAGE_KEY;
  const storageReadyRef = useRef(false);
  const [config, setConfig] = useState<CandleCompositeConfig>(defaultCandleComposite);
  const [showGrid, setShowGrid] = useState(true);
  const [viewResetSignal, setViewResetSignal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const exportedConfig = useMemo(() => JSON.stringify(config, null, 2), [config]);

  const handleError = useCallback((nextError: Error) => {
    setError(nextError.message);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void (async () => {
        try {
          const query = requestedId ? `?id=${encodeURIComponent(requestedId)}` : "";
          const response = await fetch(`/api/candle-composite${query}`, { cache: "no-store" });
          if (!response.ok) {
            throw new Error("Failed to load candle composite: " + response.status);
          }
          setConfig(normalizeCandleComposite(await response.json()));
        } catch (nextError) {
          try {
            setConfig(readStoredCandle(storageKey));
          } catch {
            setConfig(defaultCandleComposite);
          }
          setError(nextError instanceof Error ? nextError.message : String(nextError));
        } finally {
          storageReadyRef.current = true;
        }
      })();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [requestedId, storageKey]);

  useEffect(() => {
    if (storageReadyRef.current) {
      window.localStorage.setItem(storageKey, JSON.stringify(config));
    }
  }, [config, storageKey]);

  const updateConfig = useCallback((partial: Partial<CandleCompositeConfig>) => {
    setError(null);
    setSaveStatus(null);
    setConfig((current) => normalizeCandleComposite({ ...current, ...partial }));
  }, []);

  const handleSave = useCallback(() => {
    setError(null);
    setSaveStatus("Saving...");
    fetch("/api/candle-composite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    })
      .then(async (response) => {
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Save failed: " + response.status);
        }
        setSaveStatus("Saved to src/content/environment.json");
      })
      .catch((nextError: unknown) => {
        setSaveStatus(null);
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      });
  }, [config]);

  return (
    <main className="grid min-h-screen bg-[#15130f] text-[#f6f0e5] lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
      <section className="relative min-h-[58vh] lg:min-h-screen">
        <CandleCanvas
          key={`${config.holderModel}:${config.candleModel}:${config.separateCandleModel}`}
          config={config}
          showGrid={showGrid}
          viewResetSignal={viewResetSignal}
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
            <h1 className="text-base font-medium">Candle composite editor</h1>
            <div className="mt-1 font-mono text-[11px] text-[#d8cdbb]">{config.id}</div>
          </div>
        </div>
      </section>

      <aside className="min-w-0 overflow-x-hidden border-t border-white/10 bg-[#16120d] p-4 lg:h-screen lg:overflow-y-auto lg:border-l lg:border-t-0">
        <div className="grid min-w-0 gap-4">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-[#d8cdbb]">Candle composite editor</div>
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

          <ControlSection title="Composite">
            <div className="grid min-w-0 grid-cols-2 gap-3">
              <RangeControl label="Height" min={0.35} max={2.4} step={0.01} value={config.wallScale} onChange={(value) => updateConfig({ wallScale: value })} />
              <RangeControl label="Pitch X" min={-Math.PI} max={Math.PI} step={0.01} value={config.rotation[0]} onChange={(value) => updateConfig({ rotation: updateVector(config.rotation, 0, value) })} />
              <RangeControl label="Yaw Y" min={-Math.PI} max={Math.PI} step={0.01} value={config.rotation[1]} onChange={(value) => updateConfig({ rotation: updateVector(config.rotation, 1, value) })} />
              <RangeControl label="Roll Z" min={-Math.PI} max={Math.PI} step={0.01} value={config.rotation[2]} onChange={(value) => updateConfig({ rotation: updateVector(config.rotation, 2, value) })} />
            </div>
          </ControlSection>

          <ControlSection title="Candle">
            <div className="grid min-w-0 grid-cols-2 gap-3">
              <RangeControl label="Candle X" min={-0.8} max={0.8} step={0.005} value={config.candleOffset[0]} onChange={(value) => updateConfig({ candleOffset: updateVector(config.candleOffset, 0, value) })} />
              <RangeControl label="Candle Y" min={-0.2} max={1.4} step={0.005} value={config.candleOffset[1]} onChange={(value) => updateConfig({ candleOffset: updateVector(config.candleOffset, 1, value) })} />
              <RangeControl label="Candle Z" min={-0.8} max={0.8} step={0.005} value={config.candleOffset[2]} onChange={(value) => updateConfig({ candleOffset: updateVector(config.candleOffset, 2, value) })} />
              <RangeControl label="Candle Size" min={0.08} max={1.2} step={0.005} value={config.candleScale} onChange={(value) => updateConfig({ candleScale: value })} />
            </div>
          </ControlSection>

          <ControlSection title="Flame">
            <div className="grid min-w-0 grid-cols-2 gap-3">
              <RangeControl label="Flame X" min={-0.8} max={0.8} step={0.005} value={config.flameOffset[0]} onChange={(value) => updateConfig({ flameOffset: updateVector(config.flameOffset, 0, value) })} />
              <RangeControl label="Flame Y" min={-0.1} max={1.6} step={0.005} value={config.flameOffset[1]} onChange={(value) => updateConfig({ flameOffset: updateVector(config.flameOffset, 1, value) })} />
              <RangeControl label="Flame Z" min={-0.8} max={0.8} step={0.005} value={config.flameOffset[2]} onChange={(value) => updateConfig({ flameOffset: updateVector(config.flameOffset, 2, value) })} />
              <RangeControl label="Flame Size" min={0.04} max={0.8} step={0.005} value={config.flameScale} onChange={(value) => updateConfig({ flameScale: value })} />
              <RangeControl label="Flame Alpha" min={0} max={1} step={0.01} value={config.flameOpacity} onChange={(value) => updateConfig({ flameOpacity: value })} />
              <RangeControl label="Light" min={0} max={4} step={0.05} value={config.flameLightIntensity} onChange={(value) => updateConfig({ flameLightIntensity: value })} />
              <RangeControl label="Light Radius" min={0.1} max={4} step={0.05} value={config.flameLightDistance} onChange={(value) => updateConfig({ flameLightDistance: value })} />
              <label className="grid min-w-0 gap-1 text-xs text-[#d8cdbb]">
                Light Color
                <input
                  className="h-9 w-full rounded border border-white/10 bg-[#221d17] p-1"
                  type="color"
                  value={config.flameLightColor}
                  onChange={(event) => updateConfig({ flameLightColor: event.target.value })}
                />
              </label>
            </div>
          </ControlSection>

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
              onClick={() =>
                updateConfig({
                  flameOffset: defaultCandleComposite.flameOffset,
                })
              }
            >
              Center flame
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
              onClick={() => updateConfig(defaultCandleComposite)}
            >
              Reset object
            </button>
          </div>

          {saveStatus ? (
            <div className="rounded border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-100">
              {saveStatus}
            </div>
          ) : null}
          {error ? (
            <div className="rounded border border-red-300/30 bg-red-500/20 px-3 py-2 text-xs text-red-100">
              {error}
            </div>
          ) : null}

          <textarea
            className="h-44 w-full resize-none rounded border border-white/10 bg-black/25 p-2 font-mono text-[10px] leading-4 text-[#d8cdbb]"
            readOnly
            value={exportedConfig}
          />
        </div>
      </aside>
    </main>
  );
}

function ControlSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3">
      <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
        {title}
      </div>
      {children}
    </div>
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
      <span className="flex items-center justify-between gap-2">
        <span className="truncate">{label}</span>
        <span className="font-mono text-[10px] text-[#a99d8a]">{formatNumber(value)}</span>
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
