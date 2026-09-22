"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useCallback, useState } from "react";
import { Earth } from "./Earth";
import { GeographicLayers } from "./GeographicLayers";
import type { GeographicLod } from "./geography";
import {
  PerformancePanel,
  PerformanceProbe,
  type PerformanceSnapshot,
  usePerformanceDebugEnabled,
} from "./PerformanceDebug";

type GlobeSceneProps = {
  autoRotate: boolean;
};

function RenderScheduler({ active }: { active: boolean }) {
  useFrame(({ invalidate }) => {
    if (active) invalidate();
  });

  return null;
}

export function GlobeScene({ autoRotate }: GlobeSceneProps) {
  const debugEnabled = usePerformanceDebugEnabled();
  const [performance, setPerformance] = useState<PerformanceSnapshot | null>(null);
  const [activeLod, setActiveLod] = useState<GeographicLod>("50m");
  const handleActiveLodChange = useCallback((lod: GeographicLod) => setActiveLod(lod), []);

  return (
    <>
      <Canvas
        camera={{ fov: 30, near: 0.05, far: 10, position: [0.25, 0.38, 3.75] }}
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#e5e4e0"]} />
        <group rotation={[0, -0.18, 0]}>
          <Earth />
          <GeographicLayers onActiveLodChange={handleActiveLodChange} />
        </group>
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
