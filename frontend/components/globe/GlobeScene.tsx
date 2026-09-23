"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useCallback, useLayoutEffect, useRef, useState } from "react";
import { Group, TextureLoader } from "three";
import type { Earthquake } from "@/lib/earthquakes";
import { Earth } from "./Earth";
import { EarthquakeLayer, type SelectedEarthquakeScreenPosition } from "./EarthquakeLayer";
import { GeographicLayers } from "./GeographicLayers";
import type { GeographicLod } from "./geography";
import { RELIEF } from "./relief";
import {
  PerformancePanel,
  PerformanceProbe,
  type PerformanceSnapshot,
  usePerformanceDebugEnabled,
} from "./PerformanceDebug";

type GlobeSceneProps = {
  readonly autoRotate: boolean;
  readonly earthquakes: readonly Earthquake[];
  readonly earthquakesVisible: boolean;
  readonly selectedEarthquakeId: string | null;
  readonly onEarthquakeSelect: (earthquakeId: string) => void;
  readonly onSelectedEarthquakePositionChange: (position: SelectedEarthquakeScreenPosition | null) => void;
};

function RenderScheduler({ active }: { active: boolean }) {
  useFrame(({ invalidate }) => {
    if (active) invalidate();
  });

  return null;
}

function ReliefSurface({ onActiveLodChange }: { readonly onActiveLodChange: (lod: GeographicLod) => void }) {
  const texture = useLoader(TextureLoader, RELIEF.texturePath);

  return (
    <>
      <Earth reliefTexture={texture} />
      <GeographicLayers reliefTexture={texture} onActiveLodChange={onActiveLodChange} />
    </>
  );
}

export function GlobeScene({
  autoRotate,
  earthquakes,
  earthquakesVisible,
  selectedEarthquakeId,
  onEarthquakeSelect,
  onSelectedEarthquakePositionChange,
}: GlobeSceneProps) {
  const debugEnabled = usePerformanceDebugEnabled();
  const [performance, setPerformance] = useState<PerformanceSnapshot | null>(null);
  const [activeLod, setActiveLod] = useState<GeographicLod>("50m");
  const globeGroup = useRef<Group>(null);
  const handleActiveLodChange = useCallback((lod: GeographicLod) => setActiveLod(lod), []);

  useLayoutEffect(() => {
    globeGroup.current?.rotation.set(0, -0.18, 0);
  }, []);

  return (
    <>
      <Canvas
        camera={{ fov: 30, near: 0.05, far: 10, position: [0.25, 0.38, 4.2] }}
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      >
        <group ref={globeGroup}>
          <Suspense fallback={null}>
            <ReliefSurface onActiveLodChange={handleActiveLodChange} />
          </Suspense>
          <EarthquakeLayer
            earthquakes={earthquakes}
            selectedEarthquakeId={selectedEarthquakeId}
            visible={earthquakesVisible}
            onSelect={onEarthquakeSelect}
            onSelectedPositionChange={onSelectedEarthquakePositionChange}
          />
        </group>
        <ambientLight intensity={RELIEF.ambientIntensity} />
        <directionalLight position={[-3, 4, 5]} intensity={RELIEF.directionalIntensity} />
        <OrbitControls
          autoRotate={autoRotate}
          autoRotateSpeed={0.16}
          enablePan={false}
          enableDamping
          dampingFactor={0.12}
          rotateSpeed={0.25}
          zoomSpeed={0.28}
          minDistance={1.15}
          maxDistance={5.25}
          minPolarAngle={0.35}
          maxPolarAngle={Math.PI - 0.35}
        />
        <RenderScheduler active={autoRotate} />
        {debugEnabled ? <PerformanceProbe activeLod={activeLod} onSample={setPerformance} /> : null}
      </Canvas>
      {debugEnabled ? <PerformancePanel snapshot={performance} /> : null}
    </>
  );
}
