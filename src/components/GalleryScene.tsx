"use client";

import { Suspense, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Center,
  Clone,
  ContactShadows,
  Environment,
  Html,
  OrbitControls,
  PerspectiveCamera,
  Resize,
  useGLTF,
} from "@react-three/drei";
import { Eye, RotateCcw, ScanSearch } from "lucide-react";
import type { ThreeElements } from "@react-three/fiber";

const frameModels = [
  "/3d-models/picture_frame_1520_dimensions.glb",
  "/3d-models/picture_frame_2.glb",
  "/3d-models/fancy_picture_frame_01-freepoly.org.glb",
  "/3d-models/picture_frame.glb",
  "/3d-models/vintage_picture_frame..glb",
];

const frameLayout = [
  { model: frameModels[1], position: [-3.35, 1.15, -0.03], scale: 1.2, rotation: [0, 0.02, 0.01] },
  { model: frameModels[1], position: [-1.55, 1.48, -0.03], scale: 0.96, rotation: [0, -0.04, -0.03] },
  { model: frameModels[2], position: [0.35, 1.12, -0.03], scale: 1.05, rotation: [0, 0.03, 0.02] },
  { model: frameModels[1], position: [2.15, 1.44, -0.03], scale: 0.92, rotation: [0, -0.02, -0.01] },
  { model: frameModels[2], position: [3.58, 1.02, -0.03], scale: 0.82, rotation: [0, 0.05, 0.025] },
  { model: frameModels[1], position: [-2.42, -0.68, -0.03], scale: 0.88, rotation: [0, 0.05, 0.02] },
  { model: frameModels[1], position: [-0.55, -0.5, -0.03], scale: 0.82, rotation: [0, -0.025, -0.015] },
  { model: frameModels[2], position: [1.25, -0.78, -0.03], scale: 0.84, rotation: [0, 0.04, 0.01] },
  { model: frameModels[1], position: [3.0, -0.48, -0.03], scale: 0.78, rotation: [0, -0.045, -0.02] },
] satisfies Array<{
  model: string;
  position: [number, number, number];
  scale: number;
  rotation: [number, number, number];
}>;

function GalleryFrame({
  model,
  ...props
}: ThreeElements["group"] & {
  model: string;
}) {
  const gltf = useGLTF(model);

  return (
    <group {...props}>
      <Resize height>
        <Center>
          <Clone object={gltf.scene} />
        </Center>
      </Resize>
    </group>
  );
}

function Wall() {
  const verticalLines = useMemo(
    () => Array.from({ length: 18 }, (_, index) => -4.5 + index * 0.55),
    [],
  );

  return (
    <group>
      <mesh position={[0, 0.18, -0.18]} receiveShadow>
        <boxGeometry args={[9.8, 5.6, 0.18]} />
        <meshStandardMaterial color="#c9b992" roughness={0.92} metalness={0.02} />
      </mesh>
      <mesh position={[0, -2.76, 0.04]} receiveShadow>
        <boxGeometry args={[10.4, 0.42, 0.34]} />
        <meshStandardMaterial color="#473e32" roughness={0.78} />
      </mesh>
      {verticalLines.map((x) => (
        <mesh key={x} position={[x, 0.18, -0.075]}>
          <boxGeometry args={[0.012, 5.35, 0.012]} />
          <meshStandardMaterial color="#b7a67f" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, -2.45, 1.85]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[11, 4.8]} />
        <meshStandardMaterial color="#6f6656" roughness={0.86} />
      </mesh>
    </group>
  );
}

function SceneContent() {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0.35, 7.25]} fov={43} />
      <ambientLight intensity={1.15} />
      <directionalLight position={[-3.6, 4.6, 4]} intensity={2.25} castShadow />
      <pointLight position={[3.8, 2.6, 2.8]} intensity={1.2} color="#ffdca5" />
      <Environment preset="apartment" />
      <Wall />
      <group position={[0, 0, 0.04]}>
        {frameLayout.map((frame, index) => (
          <GalleryFrame
            key={`${frame.model}-${index}`}
            model={frame.model}
            position={frame.position}
            rotation={frame.rotation}
            scale={frame.scale}
          />
        ))}
      </group>
      <ContactShadows
        position={[0, -2.42, 1.45]}
        opacity={0.35}
        scale={9}
        blur={2.8}
        far={4.5}
      />
      <OrbitControls
        enablePan={false}
        minDistance={4.7}
        maxDistance={9.4}
        minPolarAngle={Math.PI / 2.55}
        maxPolarAngle={Math.PI / 1.82}
        target={[0, 0.1, -0.08]}
      />
    </>
  );
}

function LoadingScene() {
  return (
    <Html center>
      <div className="rounded bg-[#211d18]/90 px-4 py-3 text-sm text-[#f6f0e5] shadow-2xl">
        Loading gallery
      </div>
    </Html>
  );
}

export function GalleryScene() {
  const [showChrome, setShowChrome] = useState(true);
  const [viewKey, setViewKey] = useState(0);

  return (
    <section className="relative h-full w-full">
      <Canvas key={viewKey} shadows dpr={[1, 2]} gl={{ antialias: true }}>
        <Suspense fallback={<LoadingScene />}>
          <SceneContent />
        </Suspense>
      </Canvas>

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
            aria-label="Reset view"
            title="Reset view"
            onClick={() => setViewKey((current) => current + 1)}
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}

frameModels.forEach((model) => useGLTF.preload(model));
