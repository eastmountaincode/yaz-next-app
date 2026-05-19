"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  ClockCompositeConfig,
  clockHandAngles,
  defaultClockComposite,
  normalizeClockComposite,
} from "@/lib/clockComposite";

const STORAGE_KEY = "yaz-clock-composite-v1";

type ClockSceneHandles = {
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
      object.castShadow = false;
      object.receiveShadow = false;
    }
  });
}

function setHandRotation(hand: THREE.Object3D | null, angle: number, offset: number) {
  if (hand) {
    hand.rotation.z = angle + offset;
  }
}

function ClockCanvas({
  config,
  showGrid,
  viewResetSignal,
  onError,
}: {
  config: ClockCompositeConfig;
  showGrid: boolean;
  viewResetSignal: number;
  onError: (error: Error) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const configRef = useRef(config);
  const onErrorRef = useRef(onError);
  const showGridRef = useRef(showGrid);
  const sceneHandlesRef = useRef<ClockSceneHandles | null>(null);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    configRef.current = config;
    sceneHandlesRef.current?.syncConfig();
  }, [config]);

  useEffect(() => {
    showGridRef.current = showGrid;
    sceneHandlesRef.current?.syncConfig();
  }, [showGrid]);

  useEffect(() => {
    sceneHandlesRef.current?.resetView();
  }, [viewResetSignal]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      throw new Error("Clock editor canvas host was not mounted.");
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
    renderer.setClearColor("#15130f", 1);
    renderer.domElement.className = "block h-full w-full";
    renderer.domElement.setAttribute("aria-label", "Live clock composite preview");
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    const cameraTarget = new THREE.Vector3(0, 0.2, 0.12);
    const cameraOffset = new THREE.Vector3(0, 0.08, 4.7);
    camera.position.copy(cameraTarget).add(cameraOffset);
    camera.lookAt(cameraTarget);

    scene.add(new THREE.AmbientLight("#f0ddbd", 1.3));
    const keyLight = new THREE.DirectionalLight("#ffe0ad", 1.4);
    keyLight.position.set(-2.8, 3.4, 4.8);
    scene.add(keyLight);
    const fillLight = new THREE.PointLight("#7380a8", 0.7, 8);
    fillLight.position.set(3, 1.2, 3.8);
    scene.add(fillLight);

    const root = new THREE.Group();
    scene.add(root);

    const modelRoot = new THREE.Group();
    const faceRoot = new THREE.Group();
    const handsRoot = new THREE.Group();
    root.add(modelRoot, faceRoot, handsRoot);

    const faceTexture = new THREE.TextureLoader().load(configRef.current.faceTexture);
    faceTexture.colorSpace = THREE.SRGBColorSpace;
    textures.push(faceTexture);

    const face = new THREE.Mesh(
      makeGeometry(new THREE.CircleGeometry(0.5, 128), geometries),
      makeMaterial(
        new THREE.MeshBasicMaterial({
          map: faceTexture,
          transparent: true,
          toneMapped: false,
          side: THREE.DoubleSide,
        }),
        materials,
      ),
    );
    face.name = "clock-face-overlay";
    faceRoot.add(face);

    const grid = new THREE.GridHelper(3, 24, "#9bdcff", "#9bdcff");
    grid.rotation.x = Math.PI / 2;
    grid.position.z = 0.16;
    if (grid.material instanceof THREE.Material) {
      grid.material.transparent = true;
      grid.material.opacity = 0.22;
      grid.material.depthWrite = false;
    }
    scene.add(grid);

    let clockModel: THREE.Object3D | null = null;
    let clockModelBaseHeight = 1;
    let hourHand: THREE.Object3D | null = null;
    let minuteHand: THREE.Object3D | null = null;
    let secondHand: THREE.Object3D | null = null;
    let pointerIsDown = false;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let startTargetX = 0;
    let startTargetY = 0.2;
    let pointerMode: "orbit" | "pan" = "orbit";
    let sphericalRadius = 4.7;
    let sphericalTheta = 0;
    let sphericalPhi = Math.PI / 2 - 0.015;

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
      cameraTarget.set(0, 0.2, 0.12);
      sphericalRadius = 4.7;
      sphericalTheta = 0;
      sphericalPhi = Math.PI / 2 - 0.015;
      updateCamera();
    };

    const syncConfig = () => {
      const current = normalizeClockComposite(configRef.current);

      if (clockModel) {
        const scale = clockModelBaseHeight > 0 ? current.clockHeight / clockModelBaseHeight : 1;
        modelRoot.position.set(current.modelX, current.modelY, current.modelZ);
        clockModel.scale.setScalar(scale);
        clockModel.rotation.x = current.modelRotationX;
      }

      face.position.set(current.faceX, current.faceY, current.faceZ);
      face.scale.setScalar(current.faceSize);
      face.rotation.z = current.faceRotation;

      handsRoot.position.set(current.handX, current.handY, current.handZ);
      if (hourHand) {
        hourHand.scale.setScalar(current.hourScale);
        hourHand.visible = current.showHourHand;
      }
      if (minuteHand) {
        minuteHand.scale.setScalar(current.minuteScale);
        minuteHand.visible = current.showMinuteHand;
      }
      if (secondHand) {
        secondHand.scale.setScalar(current.secondScale);
        secondHand.visible = current.showSecondHand;
      }

      grid.visible = showGridRef.current;
    };

    sceneHandlesRef.current = { syncConfig, resetView };

    const loader = new GLTFLoader();
    Promise.all([
      loader.loadAsync(configRef.current.model),
      loader.loadAsync(configRef.current.hourHandModel),
      loader.loadAsync(configRef.current.minuteHandModel),
      loader.loadAsync(configRef.current.secondHandModel),
    ])
      .then(([clock, hour, minute, second]) => {
        if (disposed) {
          return;
        }

        clockModel = clock.scene;
        const clockBox = new THREE.Box3().setFromObject(clockModel);
        clockModelBaseHeight = clockBox.getSize(new THREE.Vector3()).y || 1;
        const clockCenter = clockBox.getCenter(new THREE.Vector3());
        clockModel.position.sub(clockCenter);
        prepareModel(clockModel);
        modelRoot.add(clockModel);

        hourHand = hour.scene;
        minuteHand = minute.scene;
        secondHand = second.scene;
        [hourHand, minuteHand, secondHand].forEach((hand) => {
          prepareModel(hand);
          handsRoot.add(hand);
        });
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
        cameraTarget.y = THREE.MathUtils.clamp(startTargetY + deltaY * panSensitivity, -1.5, 1.9);
        updateCamera();
        return;
      }

      sphericalTheta = THREE.MathUtils.clamp(deltaX * 0.006, -Math.PI, Math.PI);
      sphericalPhi = THREE.MathUtils.clamp(
        Math.PI / 2 - 0.015 + deltaY * 0.005,
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
      sphericalRadius = THREE.MathUtils.clamp(sphericalRadius * zoomFactor, 1.1, 11);
      updateCamera();
    };

    const animate = () => {
      const current = normalizeClockComposite(configRef.current);
      const angles = clockHandAngles();
      setHandRotation(hourHand, angles.hour, current.hourRotationOffset);
      setHandRotation(minuteHand, angles.minute, current.minuteRotationOffset);
      setHandRotation(secondHand, angles.second, current.secondRotationOffset);
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

function readStoredClock() {
  if (typeof window === "undefined") {
    return defaultClockComposite;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return defaultClockComposite;
  }

  return normalizeClockComposite(JSON.parse(stored) as Partial<ClockCompositeConfig>);
}

function formatNumber(value: number) {
  return Number(value.toFixed(4));
}

export function ClockCompositeEditor() {
  const storageReadyRef = useRef(false);
  const [config, setConfig] = useState<ClockCompositeConfig>(defaultClockComposite);
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
          const response = await fetch("/api/clock", { cache: "no-store" });
          if (!response.ok) {
            throw new Error("Failed to load clock config: " + response.status);
          }
          setConfig(normalizeClockComposite(await response.json()));
        } catch (nextError) {
          try {
            setConfig(readStoredClock());
          } catch {
            setConfig(defaultClockComposite);
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
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  }, [config]);

  const updateConfig = useCallback((partial: Partial<ClockCompositeConfig>) => {
    setError(null);
    setSaveStatus(null);
    setConfig((current) => normalizeClockComposite({ ...current, ...partial }));
  }, []);

  const handleSave = useCallback(() => {
    setError(null);
    setSaveStatus("Saving...");
    fetch("/api/clock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    })
      .then(async (response) => {
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Save failed: " + response.status);
        }
        setSaveStatus("Saved to src/content/clock.json");
      })
      .catch((nextError: unknown) => {
        setSaveStatus(null);
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      });
  }, [config]);

  return (
    <main className="grid min-h-screen bg-[#15130f] text-[#f6f0e5] lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
      <section className="relative min-h-[58vh] lg:min-h-screen">
        <ClockCanvas
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
            <h1 className="text-base font-medium">Clock composite editor</h1>
            <div className="mt-1 font-mono text-[11px] text-[#d8cdbb]">
              {config.id}
            </div>
          </div>
        </div>
      </section>

      <aside className="min-w-0 overflow-x-hidden border-t border-white/10 bg-[#16120d] p-4 lg:h-screen lg:overflow-y-auto lg:border-l lg:border-t-0">
        <div className="grid min-w-0 gap-4">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs text-[#d8cdbb]">Clock composite editor</div>
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

          <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
            Clock body
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-3">
            <RangeControl
              label="Body Size"
              min={0.6}
              max={3.6}
              step={0.02}
              value={config.clockHeight}
              onChange={(value) => updateConfig({ clockHeight: value })}
            />
            <RangeControl
              label="Body X"
              min={-1.5}
              max={1.5}
              step={0.005}
              value={config.modelX}
              onChange={(value) => updateConfig({ modelX: value })}
            />
            <RangeControl
              label="Body Y"
              min={-1.5}
              max={1.5}
              step={0.005}
              value={config.modelY}
              onChange={(value) => updateConfig({ modelY: value })}
            />
            <RangeControl
              label="Body Z"
              min={-0.5}
              max={0.8}
              step={0.002}
              value={config.modelZ}
              onChange={(value) => updateConfig({ modelZ: value })}
            />
            <RangeControl
              label="Body Pitch"
              min={-1.2}
              max={1.2}
              step={0.005}
              value={config.modelRotationX}
              onChange={(value) => updateConfig({ modelRotationX: value })}
            />
          </div>

          <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
            Face
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-3">
            <RangeControl label="Face X" min={-0.8} max={0.8} step={0.005} value={config.faceX} onChange={(value) => updateConfig({ faceX: value })} />
            <RangeControl label="Face Y" min={-0.8} max={0.9} step={0.005} value={config.faceY} onChange={(value) => updateConfig({ faceY: value })} />
            <RangeControl label="Face Z" min={-0.12} max={0.45} step={0.002} value={config.faceZ} onChange={(value) => updateConfig({ faceZ: value })} />
            <RangeControl label="Face Size" min={0.3} max={1.8} step={0.005} value={config.faceSize} onChange={(value) => updateConfig({ faceSize: value })} />
            <RangeControl label="Face Roll" min={-0.6} max={0.6} step={0.002} value={config.faceRotation} onChange={(value) => updateConfig({ faceRotation: value })} />
          </div>

          <div className="text-[11px] uppercase tracking-[0.08em] text-[#a99d8a]">
            Hands
          </div>
          <div className="grid grid-cols-3 gap-2">
            <ToggleControl
              label="Hour"
              checked={config.showHourHand}
              onChange={(checked) => updateConfig({ showHourHand: checked })}
            />
            <ToggleControl
              label="Minute"
              checked={config.showMinuteHand}
              onChange={(checked) => updateConfig({ showMinuteHand: checked })}
            />
            <ToggleControl
              label="Second"
              checked={config.showSecondHand}
              onChange={(checked) => updateConfig({ showSecondHand: checked })}
            />
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-3">
            <RangeControl label="Center X" min={-0.8} max={0.8} step={0.002} value={config.handX} onChange={(value) => updateConfig({ handX: value })} />
            <RangeControl label="Center Y" min={-0.8} max={0.9} step={0.002} value={config.handY} onChange={(value) => updateConfig({ handY: value })} />
            <RangeControl label="Hand Z" min={-0.12} max={0.55} step={0.002} value={config.handZ} onChange={(value) => updateConfig({ handZ: value })} />
            <RangeControl label="Hour Scale" min={0.08} max={1.4} step={0.005} value={config.hourScale} onChange={(value) => updateConfig({ hourScale: value })} />
            <RangeControl label="Minute Scale" min={0.08} max={1.5} step={0.005} value={config.minuteScale} onChange={(value) => updateConfig({ minuteScale: value })} />
            <RangeControl label="Second Scale" min={0.08} max={1.6} step={0.005} value={config.secondScale} onChange={(value) => updateConfig({ secondScale: value })} />
            <RangeControl label="Hour Roll" min={-0.8} max={0.8} step={0.002} value={config.hourRotationOffset} onChange={(value) => updateConfig({ hourRotationOffset: value })} />
            <RangeControl label="Minute Roll" min={-0.8} max={0.8} step={0.002} value={config.minuteRotationOffset} onChange={(value) => updateConfig({ minuteRotationOffset: value })} />
            <RangeControl label="Second Roll" min={-0.8} max={0.8} step={0.002} value={config.secondRotationOffset} onChange={(value) => updateConfig({ secondRotationOffset: value })} />
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
              onClick={() => updateConfig(defaultClockComposite)}
            >
              Reset object
            </button>
          </div>

          {saveStatus ? (
            <div className="rounded border border-sky-300/30 bg-sky-950/50 px-3 py-2 font-mono text-xs leading-5 text-sky-100">
              {saveStatus}
            </div>
          ) : null}

          {error ? (
            <div className="rounded border border-red-300/40 bg-red-950/80 px-3 py-2 font-mono text-xs leading-5 text-red-100">
              {error}
            </div>
          ) : null}

          <textarea
            className="h-56 w-full min-w-0 resize-none overflow-x-hidden rounded border border-white/10 bg-black/25 p-3 font-mono text-[10px] leading-4 text-[#d8cdbb]"
            readOnly
            wrap="soft"
            value={exportedConfig}
          />
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
    <label className="block min-w-0">
      <span className="mb-1 flex items-center justify-between gap-2 text-[11px] text-[#d8cdbb]">
        <span className="truncate">{label}</span>
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

function ToggleControl({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 rounded border border-white/10 bg-white/5 px-3 py-2 text-xs text-[#d8cdbb]">
      <span className="truncate">{label}</span>
      <input
        className="accent-sky-300"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </label>
  );
}
