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
import type { GeoEvent } from "@/lib/dataLayer";
import { geoToVector3 } from "@/lib/geo";

type PointLayerProps<T extends GeoEvent> = {
  readonly entities: readonly T[];
  readonly selectedId: string | null;
  readonly visible: boolean;
  readonly color: string;
  readonly ringed?: boolean;
  readonly sizeFor: (entity: T) => number;
  readonly onSelect: (id: string) => void;
  readonly onSelectedPositionChange: (position: SelectedPointScreenPosition | null) => void;
};

export type SelectedPointScreenPosition = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

const markerRadius = 1.012;
const pickingThreshold = 0.014;

function createPointGeometry(points: readonly Vector3[], sizes?: readonly number[]) {
  const geometry = new BufferGeometry();
  geometry.setFromPoints([...points]);
  if (sizes) geometry.setAttribute("markerSize", new Float32BufferAttribute(sizes, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

function raycastPoints(
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

  const cameraPosition = raycaster.ray.origin;
  const visibleCandidates = candidates.filter((candidate) =>
    candidate.point.clone().normalize().dot(cameraPosition.clone().sub(candidate.point)) > 0,
  );
  visibleCandidates.sort(
    (left, right) => (left.distanceToRay ?? Infinity) - (right.distanceToRay ?? Infinity),
  );
  if (visibleCandidates[0]) intersections.push(visibleCandidates[0]);
}

function SelectedPointProjection({
  layer,
  position,
  onChange,
}: {
  readonly layer: RefObject<Group | null>;
  readonly position: Vector3;
  readonly onChange: (position: SelectedPointScreenPosition | null) => void;
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

export function PointLayer<T extends GeoEvent>({
  entities,
  selectedId,
  visible,
  color,
  ringed = false,
  sizeFor,
  onSelect,
  onSelectedPositionChange,
}: PointLayerProps<T>) {
  const invalidate = useThree((state) => state.invalidate);
  const layer = useRef<Group>(null);
  const positions = useMemo(
    () => entities.map((entity) => geoToVector3([entity.lon, entity.lat], markerRadius)),
    [entities],
  );
  const sizes = useMemo(
    () => entities.map((entity) => Math.max(sizeFor(entity), ringed ? 1.2 : 1)),
    [entities, ringed, sizeFor],
  );
  const geometry = useMemo(() => createPointGeometry(positions, sizes), [positions, sizes]);
  const selectedIndex = entities.findIndex((entity) => entity.id === selectedId);
  const selectedGeometry = useMemo(
    () => selectedIndex < 0 ? null : createPointGeometry([positions[selectedIndex]], [sizes[selectedIndex]]),
    [positions, selectedIndex, sizes],
  );
  const markerMaterial = useMemo(
    () => {
      const material = new PointsMaterial({
        color,
        depthWrite: false,
        size: ringed ? 6.8 : 4.2,
        sizeAttenuation: false,
        transparent: true,
        opacity: 0.9,
      });
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nattribute float markerSize;")
          .replace("gl_PointSize = size;", "gl_PointSize = markerSize * size;");
        const markerShape = ringed
          ? `
            float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
            if (radius > 1.0) discard;
            float center = 1.0 - smoothstep(0.28, 0.34, radius);
            float outerRing = 1.0 - smoothstep(0.065, 0.11, abs(radius - 0.72));
            diffuseColor.a *= max(center, outerRing);`
          : "if (length(gl_PointCoord - vec2(0.5)) > 0.5) discard;";
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <clipping_planes_fragment>",
          `#include <clipping_planes_fragment>\n${markerShape}`,
        );
      };
      material.customProgramCacheKey = () => `earthview-data-points-v3-${ringed}`;
      return material;
    },
    [color, ringed],
  );
  const selectedMaterial = useMemo(
    () => {
      const material = new PointsMaterial({
        color,
        depthWrite: false,
        size: ringed ? 9.5 : 5.5,
        sizeAttenuation: false,
        transparent: true,
      });
      material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nattribute float markerSize;")
          .replace("gl_PointSize = size;", "gl_PointSize = markerSize * size;");
        const markerShape = ringed
          ? `
            float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
            if (radius > 1.0) discard;
            float center = 1.0 - smoothstep(0.28, 0.34, radius);
            float outerRing = 1.0 - smoothstep(0.07, 0.12, abs(radius - 0.72));
            diffuseColor.a *= max(center, outerRing);`
          : "if (length(gl_PointCoord - vec2(0.5)) > 0.5) discard;";
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <clipping_planes_fragment>",
          `#include <clipping_planes_fragment>\n${markerShape}`,
        );
      };
      material.customProgramCacheKey = () => `earthview-selected-data-points-v3-${ringed}`;
      return material;
    },
    [color, ringed],
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
    onSelect(entities[event.index].id);
  };

  return (
    <group ref={layer}>
      <points
        geometry={geometry}
        material={markerMaterial}
        raycast={raycastPoints}
        onClick={handleClick}
        renderOrder={2}
      />
      {selectedGeometry ? <points geometry={selectedGeometry} material={selectedMaterial} raycast={() => null} renderOrder={3} /> : null}
      {selectedGeometry ? (
        <SelectedPointProjection
          layer={layer}
          position={positions[selectedIndex]}
          onChange={onSelectedPositionChange}
        />
      ) : null}
    </group>
  );
}
