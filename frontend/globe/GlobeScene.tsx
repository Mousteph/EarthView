"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { memo, Suspense, useCallback, useEffect, useState } from "react";
import { KTX2Loader } from "three-stdlib";
import { useThree } from "@react-three/fiber";
import type { Earthquake } from "@/features/earthquakes/model";
import type { Fire } from "@/features/fires/model";
import type { OrbitalObject, SelectedSatellitePosition } from "@/features/orbital/model";
import type { Pipeline } from "@/features/pipelines/model";
import type { HoverKey } from "@/features/map/hover";
import { Earth } from "./relief/Earth";
import { PointLayer, type SelectedPointScreenPosition } from "./points/PointLayer";
import { SatelliteLayer } from "./orbital/SatelliteLayer";
import { PipelineLayer } from "./pipelines/PipelineLayer";
import { GeographicLayers } from "./geography/GeographicLayers";
import type { GeographicLod } from "./geography/geography";
import { RELIEF } from "./relief/relief";
import type { EarthViewId } from "./earthViews";
import { DESIGN_COLOR_TOKENS } from "@/shared/designTokens";
import {
  PerformancePanel,
  PerformanceProbe,
  type PerformanceSnapshot,
  usePerformanceDebugEnabled,
} from "./debug/PerformanceDebug";

type GlobeSceneProps = {
  readonly earthView: EarthViewId;
  readonly autoRotate: boolean;
  readonly earthquakes: readonly Earthquake[];
  readonly earthquakesVisible: boolean;
  readonly selectedEarthquakeId: string | null;
  readonly fires: readonly Fire[];
  readonly firesVisible: boolean;
  readonly selectedFireId: string | null;
  readonly satellites: readonly OrbitalObject[];
  readonly satellitesVisible: boolean;
  readonly satelliteVisibility: Uint8Array | null;
  readonly selectedSatelliteId: string | null;
  readonly pipelines: readonly Pipeline[];
  readonly pipelinesVisible: boolean;
  readonly selectedPipelineId: string | null;
  readonly onEarthquakeSelect: (earthquakeId: string) => void;
  readonly onFireSelect: (fireId: string) => void;
  readonly onSatelliteSelect: (satelliteId: string) => void;
  readonly onPipelineSelect: (pipelineId: string) => void;
  readonly onSelectedSatelliteData: (position: SelectedSatellitePosition | null) => void;
  readonly onSelectedPositionChange: (position: SelectedPointScreenPosition | null) => void;
  readonly onScaleChange: (scale: MapScale) => void;
  readonly hovered: HoverKey | null;
  readonly onHover: (key: HoverKey, clientX: number, clientY: number, distance: number, event: PointerEvent) => void;
  readonly onHoverEnd: (key: HoverKey) => void;
};

export type MapScale = { readonly distanceKm: number; readonly widthPx: number };

const earthquakeSize = (earthquake: Earthquake) => Math.min(3, Math.max(0.75, 0.75 + Math.max(0, earthquake.magnitude) * 0.35));
const fireSize = (fire: Fire) => Math.min(2.2, Math.max(0.75, 0.8 + Math.log1p(fire.frp ?? 0) * 0.22));
const fireOpacity = (fire: Fire) => fire.frp === null
  ? 0.65
  : 0.35 + 0.6 * Math.min(1, Math.log1p(Math.max(0, fire.frp)) / Math.log1p(300));

function RenderScheduler({ active }: { active: boolean }) {
  useFrame(({ invalidate }) => {
    if (active) invalidate();
  });

  return null;
}

function ReliefSurface({ earthView, onActiveLodChange }: {
  readonly earthView: EarthViewId;
  readonly onActiveLodChange: (lod: GeographicLod) => void;
}) {
  const renderer = useThree((state) => state.gl);
  const texture = useLoader(
    KTX2Loader,
    RELIEF.texturePath,
    (loader) => loader.setTranscoderPath("/basis/").detectSupport(renderer),
  );

  return (
    <>
      <Earth reliefTexture={texture} />
      <GeographicLayers reliefTexture={texture} earthView={earthView} onActiveLodChange={onActiveLodChange} />
    </>
  );
}

function niceDistance(value: number) {
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  return (normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1) * magnitude;
}

function GlobeControls({
  autoRotate,
  onScaleChange,
}: {
  readonly autoRotate: boolean;
  readonly onScaleChange: GlobeSceneProps["onScaleChange"];
}) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const updateScale = useCallback(() => {
    const distance = camera.position.length();
    const focalPixels = size.height / (2 * Math.tan(("fov" in camera ? camera.fov : 30) * Math.PI / 360));
    const kmPerPixel = (6371 * Math.max(0.15, distance - 1)) / focalPixels;
    const distanceKm = niceDistance(kmPerPixel * 190);
    onScaleChange({ distanceKm, widthPx: distanceKm / kmPerPixel });
  }, [camera, onScaleChange, size.height]);

  useEffect(() => {
    updateScale();
  }, [updateScale]);

  return <OrbitControls
    onChange={updateScale}
    autoRotate={autoRotate}
    autoRotateSpeed={0.16}
    enablePan={false}
    enableDamping={false}
    rotateSpeed={0.25}
    zoomSpeed={0.28}
    minDistance={1.15}
    maxDistance={12}
    minPolarAngle={0.35}
    maxPolarAngle={Math.PI - 0.35}
  />;
}

function GlobeSceneComponent({
  earthView,
  autoRotate,
  earthquakes,
  earthquakesVisible,
  selectedEarthquakeId,
  fires,
  firesVisible,
  selectedFireId,
  satellites,
  satellitesVisible,
  satelliteVisibility,
  selectedSatelliteId,
  pipelines,
  pipelinesVisible,
  selectedPipelineId,
  onEarthquakeSelect,
  onFireSelect,
  onSatelliteSelect,
  onPipelineSelect,
  onSelectedSatelliteData,
  onSelectedPositionChange,
  onScaleChange,
  hovered,
  onHover,
  onHoverEnd,
}: GlobeSceneProps) {
  const debugEnabled = usePerformanceDebugEnabled();
  const [performance, setPerformance] = useState<PerformanceSnapshot | null>(null);
  const [activeLod, setActiveLod] = useState<GeographicLod>("50m");
  const handleActiveLodChange = useCallback((lod: GeographicLod) => setActiveLod(lod), []);

  return (
    <>
      <Canvas
        camera={{ fov: 30, near: 0.05, far: 25, position: [0.12, 0.35, 5.0] }}
        dpr={[1, 1.5]}
        frameloop="demand"
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      >
        <group rotation={[0, -0.1, 0]}>
          <Suspense fallback={null}>
            <ReliefSurface earthView={earthView} onActiveLodChange={handleActiveLodChange} />
          </Suspense>
          <PipelineLayer pipelines={pipelines} visible={pipelinesVisible} selectedId={selectedPipelineId} hoveredId={hovered?.type === "pipelines" ? hovered.id : null} onSelect={onPipelineSelect} onHover={onHover} onHoverEnd={onHoverEnd} />
          <PointLayer
            entities={earthquakes}
            selectedId={selectedEarthquakeId}
            visible={earthquakesVisible}
            colorToken={DESIGN_COLOR_TOKENS.earthquake}
            ringed
            layerType="earthquakes"
            hoveredId={hovered?.type === "earthquakes" ? hovered.id : null}
            sizeFor={earthquakeSize}
            onSelect={onEarthquakeSelect}
            onHover={onHover}
            onHoverEnd={onHoverEnd}
            onSelectedPositionChange={onSelectedPositionChange}
          />
          <PointLayer
            entities={fires}
            selectedId={selectedFireId}
            visible={firesVisible}
            colorToken={DESIGN_COLOR_TOKENS.fire}
            layerType="fires"
            hoveredId={hovered?.type === "fires" ? hovered.id : null}
            sizeFor={fireSize}
            opacityFor={fireOpacity}
            onSelect={onFireSelect}
            onHover={onHover}
            onHoverEnd={onHoverEnd}
            onSelectedPositionChange={onSelectedPositionChange}
          />
          {satellitesVisible && satellites.length > 0 ? <SatelliteLayer
            satellites={satellites}
            visibility={satelliteVisibility}
            selectedId={selectedSatelliteId}
            hoveredId={hovered?.type === "satellites" ? hovered.id : null}
            onSelect={onSatelliteSelect}
            onHover={onHover}
            onHoverEnd={onHoverEnd}
            onSelectedData={onSelectedSatelliteData}
            onSelectedPositionChange={onSelectedPositionChange}
          /> : null}
        </group>
        <ambientLight intensity={RELIEF.ambientIntensity} />
        <directionalLight position={[-3, 4, 5]} intensity={RELIEF.directionalIntensity} />
        <GlobeControls autoRotate={autoRotate} onScaleChange={onScaleChange} />
        <RenderScheduler active={debugEnabled || autoRotate || (satellitesVisible && satellites.length > 0)} />
        {debugEnabled ? <PerformanceProbe activeLod={activeLod} onSample={setPerformance} /> : null}
      </Canvas>
      {debugEnabled ? <PerformancePanel snapshot={performance} /> : null}
    </>
  );
}

export const GlobeScene = memo(GlobeSceneComponent);
