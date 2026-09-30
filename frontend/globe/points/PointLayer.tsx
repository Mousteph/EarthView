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
import type { GeoEvent } from "@/shared/geoEvent";
import { geoToVector3 } from "@/globe/geo";
import { readDesignColor, type DesignColorToken } from "@/shared/designTokens";
import type { HoverKey } from "@/features/map/hover";
import { ScreenSpatialIndex } from "@/globe/interaction/ScreenSpatialIndex";

type PointLayerProps<T extends GeoEvent> = {
  readonly entities: readonly T[];
  readonly selectedId: string | null;
  readonly visible: boolean;
  readonly colorToken: DesignColorToken;
  readonly ringed?: boolean;
  readonly layerType: "earthquakes" | "fires";
  readonly hoveredId: string | null;
  readonly sizeFor: (entity: T) => number;
  readonly opacityFor?: (entity: T) => number;
  readonly onSelect: (id: string) => void;
  readonly onHover: (key: HoverKey, clientX: number, clientY: number, distance: number, event: PointerEvent) => void;
  readonly onHoverEnd: (key: HoverKey) => void;
  readonly onSelectedPositionChange: (position: SelectedPointScreenPosition | null) => void;
};

export type SelectedPointScreenPosition = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

const markerRadius = 1.012;
const pointPickRadiusPixels = 6;

function createPointGeometry(
  points: readonly Vector3[],
  sizes: readonly number[],
  opacities: readonly number[] = points.map(() => 1),
) {
  const geometry = new BufferGeometry();
  geometry.setFromPoints([...points]);
  geometry.setAttribute("markerSize", new Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("markerOpacity", new Float32BufferAttribute(opacities, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

type PointMaterialOptions = {
  readonly size: number;
  readonly opacity?: number;
  readonly ringed: boolean;
  readonly selected?: boolean;
  readonly cacheKey: string;
};

function createPointMaterial({
  size,
  opacity = 1,
  ringed,
  selected = false,
  cacheKey,
}: PointMaterialOptions) {
  const material = new PointsMaterial({
    depthWrite: false,
    size,
    sizeAttenuation: false,
    transparent: true,
    opacity,
  });
  const markerShape = ringed
    ? `
      float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
      if (radius > 1.0) discard;
      float center = 1.0 - smoothstep(0.28, 0.34, radius);
      float outerRing = 1.0 - smoothstep(${selected ? "0.07, 0.12" : "0.065, 0.11"}, abs(radius - 0.72));
      diffuseColor.a *= max(center, outerRing);`
    : "if (length(gl_PointCoord - vec2(0.5)) > 0.5) discard;";

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float markerSize;\nattribute float markerOpacity;\nvarying float vMarkerOpacity;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMarkerOpacity = markerOpacity;")
      .replace("gl_PointSize = size;", "gl_PointSize = markerSize * size;");
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <clipping_planes_fragment>",
      `#include <clipping_planes_fragment>\ndiffuseColor.a *= vMarkerOpacity;\n${markerShape}`,
    );
    if (selected) {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        "#include <color_fragment>\ndiffuseColor.rgb = min(diffuseColor.rgb * 1.35, vec3(1.0));",
      );
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      "#include <common>\nvarying float vMarkerOpacity;",
    );
  };
  material.customProgramCacheKey = () => `${cacheKey}-${ringed}`;
  return material;
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
  colorToken,
  ringed = false,
  layerType,
  hoveredId,
  sizeFor,
  opacityFor,
  onSelect,
  onHover,
  onHoverEnd,
  onSelectedPositionChange,
}: PointLayerProps<T>) {
  const { camera, invalidate, size, pointer } = useThree();
  const layer = useRef<Group>(null);
  const positions = useMemo(
    () => entities.map((entity) => geoToVector3([entity.lon, entity.lat], markerRadius)),
    [entities],
  );
  const sizes = useMemo(
    () => entities.map((entity) => Math.max(sizeFor(entity), ringed ? 1.2 : 1)),
    [entities, ringed, sizeFor],
  );
  const opacities = useMemo(
    () => opacityFor ? entities.map((entity) => Math.min(1, Math.max(0, opacityFor(entity)))) : null,
    [entities, opacityFor],
  );
  const geometry = useMemo(() => {
    return createPointGeometry(positions, sizes, opacities ?? undefined);
  }, [opacities, positions, sizes]);
  const picking = useMemo(() => ({
    index: new ScreenSpatialIndex(),
    x: new Float32Array(entities.length),
    y: new Float32Array(entities.length),
    depth: new Float32Array(entities.length),
  }), [entities.length]);
  const worldPoint = useMemo(() => new Vector3(), []);
  const projectedPoint = useMemo(() => new Vector3(), []);
  const cameraPositionForPick = useMemo(() => new Vector3(), []);
  const raycast = useMemo(() => function raycastPoints(
    this: Points,
    raycaster: Raycaster,
    intersections: Intersection[],
  ) {
    camera.updateMatrixWorld();
    this.updateWorldMatrix(true, false);
    const snapshot = {
      width: size.width,
      height: size.height,
      cameraWorld: camera.matrixWorld.elements,
      cameraProjection: camera.projectionMatrix.elements,
      objectWorld: this.matrixWorld.elements,
      cameraDistance: camera.position.length(),
      source: positions,
    };
    if (picking.index.isStale(snapshot)) {
      picking.index.reset(snapshot);
      camera.getWorldPosition(cameraPositionForPick);
      for (let index = 0; index < positions.length; index += 1) {
        worldPoint.copy(positions[index]).applyMatrix4(this.matrixWorld);
        const towardCameraX = cameraPositionForPick.x - worldPoint.x;
        const towardCameraY = cameraPositionForPick.y - worldPoint.y;
        const towardCameraZ = cameraPositionForPick.z - worldPoint.z;
        const normalLength = Math.max(worldPoint.length(), 1e-9);
        if ((worldPoint.x * towardCameraX + worldPoint.y * towardCameraY + worldPoint.z * towardCameraZ) / normalLength <= 0) continue;
        projectedPoint.copy(worldPoint).project(camera);
        if (projectedPoint.z < -1 || projectedPoint.z > 1) continue;
        const x = (projectedPoint.x + 1) * size.width * 0.5;
        const y = (1 - projectedPoint.y) * size.height * 0.5;
        picking.x[index] = x;
        picking.y[index] = y;
        picking.depth[index] = worldPoint.distanceToSquared(cameraPositionForPick);
        picking.index.insertPoint(x, y, index);
      }
    }

    const pointerX = (pointer.x + 1) * size.width * 0.5;
    const pointerY = (1 - pointer.y) * size.height * 0.5;
    const candidates = picking.index.query(pointerX, pointerY, pointPickRadiusPixels);
    let bestIndex = -1;
    let bestDistance = pointPickRadiusPixels * pointPickRadiusPixels;
    let bestDepth = Infinity;
    for (const index of candidates) {
      const distance = (picking.x[index] - pointerX) ** 2 + (picking.y[index] - pointerY) ** 2;
      if (distance < bestDistance || (distance === bestDistance && picking.depth[index] < bestDepth)) {
        bestIndex = index;
        bestDistance = distance;
        bestDepth = picking.depth[index];
      }
    }
    if (bestIndex >= 0) {
      intersections.push({
        distance: Math.sqrt(bestDepth),
        distanceToRay: Math.sqrt(bestDistance),
        point: worldPoint.copy(positions[bestIndex]).applyMatrix4(this.matrixWorld).clone(),
        object: this,
        index: bestIndex,
      } as Intersection);
    }
  }, [camera, cameraPositionForPick, picking, pointer, positions, projectedPoint, size.height, size.width, worldPoint]);
  const selectedIndex = entities.findIndex((entity) => entity.id === selectedId);
  const hoveredIndex = entities.findIndex((entity) => entity.id === hoveredId);
  const selectedGeometry = useMemo(
    () => selectedIndex < 0 ? null : createPointGeometry([positions[selectedIndex]], [sizes[selectedIndex]]),
    [positions, selectedIndex, sizes],
  );
  const hoverGeometry = useMemo(() => createPointGeometry([new Vector3()], [1]), []);
  const markerMaterial = useMemo(() => createPointMaterial({
    size: ringed ? 6.8 : 4.2,
    opacity: opacityFor ? 1 : 0.9,
    ringed,
    cacheKey: "earthview-data-points-v4",
  }), [opacityFor, ringed]);
  const selectedMaterial = useMemo(() => createPointMaterial({
    size: ringed ? 9.5 : 6.5,
    ringed,
    selected: true,
    cacheKey: "earthview-selected-data-points-v4",
  }), [ringed]);
  const hoverMaterial = useMemo(() => createPointMaterial({
    size: ringed ? 8.1 : 4.8,
    opacity: 0.96,
    ringed,
    cacheKey: "earthview-hover-data-points-v2",
  }), [ringed]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => selectedGeometry?.dispose(), [selectedGeometry]);
  useEffect(() => () => hoverGeometry.dispose(), [hoverGeometry]);
  useEffect(() => () => markerMaterial.dispose(), [markerMaterial]);
  useEffect(() => () => selectedMaterial.dispose(), [selectedMaterial]);
  useEffect(() => () => hoverMaterial.dispose(), [hoverMaterial]);
  useEffect(() => {
    const color = readDesignColor(colorToken);
    markerMaterial.color.set(color);
    selectedMaterial.color.set(color);
    hoverMaterial.color.set(color);
    invalidate();
  }, [colorToken, hoverMaterial, invalidate, markerMaterial, selectedMaterial]);
  useEffect(() => {
    if (hoveredIndex < 0) return;
    const point = positions[hoveredIndex];
    const position = hoverGeometry.getAttribute("position") as Float32BufferAttribute;
    const markerSize = hoverGeometry.getAttribute("markerSize") as Float32BufferAttribute;
    position.setXYZ(0, point.x, point.y, point.z);
    markerSize.setX(0, sizes[hoveredIndex]);
    position.needsUpdate = true;
    markerSize.needsUpdate = true;
    invalidate();
  }, [hoverGeometry, hoveredIndex, invalidate, positions, sizes]);
  useEffect(() => {
    invalidate();
  }, [geometry, invalidate, selectedGeometry, visible]);
  useEffect(() => {
    if (!visible || selectedIndex < 0) onSelectedPositionChange(null);
  }, [onSelectedPositionChange, selectedIndex, visible]);

  if (!visible) return null;

  const handleClick = (event: ThreeEvent<MouseEvent> & { readonly delta?: number }) => {
    if ((event.delta ?? 0) > 5) return;
    if (event.index === undefined) return;
    event.stopPropagation();
    onSelect(entities[event.index].id);
  };
  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (event.nativeEvent.pointerType === "touch" || event.index === undefined) return;
    event.stopPropagation();
    onHover({ type: layerType, id: entities[event.index].id }, event.clientX, event.clientY, event.distance, event.nativeEvent);
  };
  const hoverKey = (id: string): HoverKey => ({ type: layerType, id });

  return (
    <group ref={layer}>
      <points
        geometry={geometry}
        material={markerMaterial}
        raycast={raycast}
        onClick={handleClick}
        onPointerMove={handlePointerMove}
        onPointerOut={(event) => {
          if (event.index !== undefined) onHoverEnd(hoverKey(entities[event.index].id));
        }}
        renderOrder={2}
      />
      {hoveredIndex >= 0 && hoveredId !== selectedId ? <points geometry={hoverGeometry} material={hoverMaterial} raycast={() => null} frustumCulled={false} renderOrder={2.5} /> : null}
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
