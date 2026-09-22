"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Points,
  PointsMaterial,
  type Intersection,
  type Raycaster,
  Vector3,
} from "three";
import type { Earthquake } from "@/lib/earthquakes";
import { geoToVector3 } from "@/lib/geo";

type EarthquakeLayerProps = {
  readonly earthquakes: readonly Earthquake[];
  readonly selectedEarthquakeId: string | null;
  readonly visible: boolean;
  readonly onSelect: (earthquakeId: string) => void;
  readonly onSelectedPositionChange: (position: SelectedEarthquakeScreenPosition | null) => void;
};

export type SelectedEarthquakeScreenPosition = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

const markerRadius = 1.012;
const pickingThreshold = 0.014;

function magnitudeToScale(magnitude: number) {
  return Math.min(3, Math.max(0.75, 0.75 + Math.max(0, magnitude) * 0.35));
}

function createPointGeometry(points: readonly Vector3[], sizes?: readonly number[]) {
  const geometry = new BufferGeometry();
  geometry.setFromPoints([...points]);
  if (sizes) geometry.setAttribute("magnitudeSize", new Float32BufferAttribute(sizes, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function raycastEarthquakes(
  this: Points,
  raycaster: Raycaster,
  intersections: Intersection[],
) {
  const previousThreshold = raycaster.params.Points.threshold;
  const candidates: Intersection[] = [];
  try {
    raycaster.params.Points.threshold = pickingThreshold;
    Points.prototype.raycast.call(this, raycaster, candidates);
  } finally {
    raycaster.params.Points.threshold = previousThreshold;
  }

  candidates.sort(
    (left, right) => (left.distanceToRay ?? Infinity) - (right.distanceToRay ?? Infinity),
  );
  if (candidates[0]) intersections.push(candidates[0]);
}

function SelectedEarthquakeProjection({
  layer,
  position,
  onChange,
}: {
  readonly layer: RefObject<Group | null>;
  readonly position: Vector3;
  readonly onChange: (position: SelectedEarthquakeScreenPosition | null) => void;
}) {
  const worldPosition = useMemo(() => new Vector3(), []);
  const cameraPosition = useMemo(() => new Vector3(), []);
  const surfaceNormal = useMemo(() => new Vector3(), []);
  const cameraDirection = useMemo(() => new Vector3(), []);

  useEffect(() => () => onChange(null), [onChange]);

  useFrame(({ camera, size }) => {
    if (!layer.current) return;

    worldPosition.copy(position);
    layer.current.localToWorld(worldPosition);
    camera.getWorldPosition(cameraPosition);
    surfaceNormal.copy(worldPosition).normalize();
    cameraDirection.subVectors(cameraPosition, worldPosition).normalize();

    if (surfaceNormal.dot(cameraDirection) <= 0) {
      onChange(null);
      return;
    }

    worldPosition.project(camera);
    if (
      worldPosition.x < -1
      || worldPosition.x > 1
      || worldPosition.y < -1
      || worldPosition.y > 1
      || worldPosition.z < -1
      || worldPosition.z > 1
    ) {
      onChange(null);
      return;
    }

    onChange({
      x: (worldPosition.x + 1) * size.width * 0.5,
      y: (1 - worldPosition.y) * size.height * 0.5,
      width: size.width,
      height: size.height,
    });
  });

  return null;
}

export function EarthquakeLayer({
  earthquakes,
  selectedEarthquakeId,
  visible,
  onSelect,
  onSelectedPositionChange,
}: EarthquakeLayerProps) {
  const invalidate = useThree((state) => state.invalidate);
  const layer = useRef<Group>(null);
  const positions = useMemo(
    () => earthquakes.map((earthquake) => geoToVector3([earthquake.lon, earthquake.lat], markerRadius)),
    [earthquakes],
  );
  const sizes = useMemo(
    () => earthquakes.map((earthquake) => magnitudeToScale(earthquake.magnitude)),
    [earthquakes],
  );
  const geometry = useMemo(() => createPointGeometry(positions, sizes), [positions, sizes]);
  const selectedIndex = earthquakes.findIndex((earthquake) => earthquake.id === selectedEarthquakeId);
  const selectedGeometry = useMemo(
    () => selectedIndex < 0 ? null : createPointGeometry([positions[selectedIndex]], [sizes[selectedIndex]]),
    [positions, selectedIndex, sizes],
  );
  const markerMaterial = useMemo(
    () => {
      const material = new PointsMaterial({
        color: "#c5523b",
        depthWrite: false,
        size: 4,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.9,
      });
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nattribute float magnitudeSize;")
          .replace("gl_PointSize = size;", "gl_PointSize = magnitudeSize * size;");
      };
      material.customProgramCacheKey = () => "earthview-earthquake-magnitude-points-v1";
      return material;
    },
    [],
  );
  const selectedMaterial = useMemo(
    () => {
      const material = new PointsMaterial({
        color: "#000000",
        depthWrite: false,
        size: 4,
        sizeAttenuation: false,
      });
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nattribute float magnitudeSize;")
          .replace("gl_PointSize = size;", "gl_PointSize = magnitudeSize * size;");
      };
      material.customProgramCacheKey = () => "earthview-selected-earthquake-points-v1";
      return material;
    },
    [],
  );

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => selectedGeometry?.dispose(), [selectedGeometry]);
  useEffect(() => () => markerMaterial.dispose(), [markerMaterial]);
  useEffect(() => () => selectedMaterial.dispose(), [selectedMaterial]);
  useEffect(() => {
    invalidate();
  }, [geometry, invalidate, selectedGeometry, visible]);
  useEffect(() => {
    if (!visible || selectedIndex < 0) onSelectedPositionChange(null);
  }, [onSelectedPositionChange, selectedIndex, visible]);

  if (!visible) return null;

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.index === undefined) return;
    event.stopPropagation();
    onSelect(earthquakes[event.index].id);
  };

  return (
    <group ref={layer}>
      <points
        geometry={geometry}
        material={markerMaterial}
        raycast={raycastEarthquakes}
        onClick={handleClick}
        renderOrder={2}
      />
      {selectedGeometry ? <points geometry={selectedGeometry} material={selectedMaterial} raycast={() => null} renderOrder={3} /> : null}
      {selectedGeometry ? (
        <SelectedEarthquakeProjection
          layer={layer}
          position={positions[selectedIndex]}
          onChange={onSelectedPositionChange}
        />
      ) : null}
    </group>
  );
}
