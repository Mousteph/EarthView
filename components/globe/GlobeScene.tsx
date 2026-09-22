"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { CountryBorders } from "./CountryBorders";
import { Earth } from "./Earth";
import { Land } from "./Land";

type GlobeSceneProps = {
  autoRotate: boolean;
};

export function GlobeScene({ autoRotate }: GlobeSceneProps) {
  return (
    <Canvas
      camera={{ fov: 30, near: 0.01, far: 100, position: [0.25, 0.38, 3.75] }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
    >
      <color attach="background" args={["#e5e4e0"]} />
      <ambientLight intensity={1.05} />
      <directionalLight position={[-3, 4, 5]} intensity={1.35} color="#f7f1e8" />
      <group rotation={[0, -0.18, 0]}>
        <Earth />
        <Land />
        <CountryBorders />
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
    </Canvas>
  );
}
