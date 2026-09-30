"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import {
  Vector3,
  type Intersection,
  type Raycaster,
} from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import type { Pipeline, PipelineCoordinate } from "@/features/pipelines/model";
import type { HoverKey } from "@/features/map/hover";
import { DESIGN_COLOR_TOKENS, readDesignColor } from "@/shared/designTokens";
import { ScreenSpatialIndex } from "@/globe/interaction/ScreenSpatialIndex";
import { routeRangeForSegment, type PipelineRouteRange } from "./picking";

type PipelineGeometry = {
  readonly geometry: LineSegmentsGeometry;
  readonly positions: Float32Array;
  readonly routes: readonly PipelineRouteRange[];
};

type PreparedPipeline = {
  readonly pipeline: Pipeline;
  readonly routes: readonly (readonly PipelineCoordinate[])[];
  readonly segmentCount: number;
};

const pipelineRadius = 1.008;
const maxSegmentAngle = Math.PI / 22.5;
// At the closest camera distance this is about a 1.6-pixel route tolerance.
const simplificationTolerance = 0.00012;
const pickRadiusPixels = 6;

function unitVector([longitude, latitude]: PipelineCoordinate, target: Vector3) {
  const latitudeRadians = (latitude * Math.PI) / 180;
  const longitudeRadians = (longitude * Math.PI) / 180;
  const horizontalRadius = Math.cos(latitudeRadians);
  return target.set(
    horizontalRadius * Math.sin(longitudeRadians),
    Math.sin(latitudeRadians),
    horizontalRadius * Math.cos(longitudeRadians),
  );
}

function squaredDistanceFromGreatCircleArc(
  vectors: Float64Array,
  pointOffset: number,
  startOffset: number,
  endOffset: number,
) {
  const px = vectors[pointOffset];
  const py = vectors[pointOffset + 1];
  const pz = vectors[pointOffset + 2];
  const ax = vectors[startOffset];
  const ay = vectors[startOffset + 1];
  const az = vectors[startOffset + 2];
  const bx = vectors[endOffset];
  const by = vectors[endOffset + 1];
  const bz = vectors[endOffset + 2];
  let nx = ay * bz - az * by;
  let ny = az * bx - ax * bz;
  let nz = ax * by - ay * bx;
  const normalLength = Math.hypot(nx, ny, nz);
  if (normalLength < 1e-12) {
    const startDistance = (px - ax) ** 2 + (py - ay) ** 2 + (pz - az) ** 2;
    const endDistance = (px - bx) ** 2 + (py - by) ** 2 + (pz - bz) ** 2;
    return Math.min(startDistance, endDistance);
  }
  nx /= normalLength;
  ny /= normalLength;
  nz /= normalLength;

  const signedDistance = px * nx + py * ny + pz * nz;
  let qx = px - signedDistance * nx;
  let qy = py - signedDistance * ny;
  let qz = pz - signedDistance * nz;
  const projectedLength = Math.hypot(qx, qy, qz);
  if (projectedLength < 1e-12) return 0;
  qx /= projectedLength;
  qy /= projectedLength;
  qz /= projectedLength;
  if (qx * px + qy * py + qz * pz < 0) {
    qx = -qx;
    qy = -qy;
    qz = -qz;
  }

  const startDotEnd = ax * bx + ay * by + az * bz;
  const projectedOnArc = ax * qx + ay * qy + az * qz >= startDotEnd - 1e-7
    && bx * qx + by * qy + bz * qz >= startDotEnd - 1e-7;
  if (projectedOnArc) {
    return signedDistance * signedDistance;
  }
  const startDistance = (px - ax) ** 2 + (py - ay) ** 2 + (pz - az) ** 2;
  const endDistance = (px - bx) ** 2 + (py - by) ** 2 + (pz - bz) ** 2;
  return Math.min(startDistance, endDistance);
}

function simplifyRoute(route: readonly PipelineCoordinate[]) {
  if (route.length < 3) return route;

  const vectors = new Float64Array(route.length * 3);
  const vector = new Vector3();
  route.forEach((coordinate, index) => {
    unitVector(coordinate, vector);
    vectors[index * 3] = vector.x;
    vectors[index * 3 + 1] = vector.y;
    vectors[index * 3 + 2] = vector.z;
  });

  const candidates = new Uint32Array(route.length);
  let candidateCount = 1;
  let lastCandidate = 0;
  const radialTolerance = simplificationTolerance * 0.5;
  const radialToleranceSquared = radialTolerance * radialTolerance;
  candidates[0] = 0;
  for (let index = 1; index < route.length - 1; index += 1) {
    const offset = index * 3;
    const previousOffset = lastCandidate * 3;
    const dx = vectors[offset] - vectors[previousOffset];
    const dy = vectors[offset + 1] - vectors[previousOffset + 1];
    const dz = vectors[offset + 2] - vectors[previousOffset + 2];
    if (dx * dx + dy * dy + dz * dz > radialToleranceSquared) {
      candidates[candidateCount++] = index;
      lastCandidate = index;
    }
  }
  candidates[candidateCount++] = route.length - 1;
  if (candidateCount < 3) return [route[0], route[route.length - 1]];

  const retained = new Uint8Array(candidateCount);
  retained[0] = 1;
  retained[candidateCount - 1] = 1;
  const pending: number[] = [0, candidateCount - 1];
  while (pending.length > 0) {
    const last = pending.pop()!;
    const first = pending.pop()!;
    if (last - first < 2) continue;
    let farthestIndex = -1;
    let farthestDistanceSquared = simplificationTolerance * simplificationTolerance;
    for (let index = first + 1; index < last; index += 1) {
      const distanceSquared = squaredDistanceFromGreatCircleArc(
        vectors,
        candidates[index] * 3,
        candidates[first] * 3,
        candidates[last] * 3,
      );
      if (distanceSquared > farthestDistanceSquared) {
        farthestDistanceSquared = distanceSquared;
        farthestIndex = index;
      }
    }
    if (farthestIndex >= 0) {
      retained[farthestIndex] = 1;
      pending.push(first, farthestIndex, farthestIndex, last);
    }
  }

  const sourceRetained = new Uint8Array(route.length);
  for (let index = 0; index < candidateCount; index += 1) {
    if (retained[index]) sourceRetained[candidates[index]] = 1;
  }
  return route.filter((_, index) => sourceRetained[index] === 1);
}

function getStepCount(start: Vector3, end: Vector3) {
  const angle = Math.acos(Math.max(-1, Math.min(1, start.dot(end))));
  return Math.max(1, Math.ceil(angle / maxSegmentAngle));
}

function preparePipelines(pipelines: readonly Pipeline[]): PreparedPipeline[] {
  const ordered = [...pipelines].sort((first, second) => first.fuel.localeCompare(second.fuel));
  return ordered.map((pipeline) => {
    const routes = pipeline.routes.map(simplifyRoute);
    const first = new Vector3();
    const second = new Vector3();
    let segmentCount = 0;
    for (const route of routes) {
      for (let index = 1; index < route.length; index += 1) {
        unitVector(route[index - 1], first);
        unitVector(route[index], second);
        segmentCount += getStepCount(first, second);
      }
    }
    return { pipeline, routes, segmentCount };
  });
}

function writeRoute(positions: Float32Array, scalarOffset: number, routes: PreparedPipeline["routes"]) {
  const start = new Vector3();
  const end = new Vector3();
  const previous = new Vector3();
  const next = new Vector3();

  for (const route of routes) {
    for (let index = 1; index < route.length; index += 1) {
      unitVector(route[index - 1], start);
      unitVector(route[index], end);
      const angle = Math.acos(Math.max(-1, Math.min(1, start.dot(end))));
      const steps = Math.max(1, Math.ceil(angle / maxSegmentAngle));
      const sine = Math.sin(angle);
      previous.copy(start);

      for (let step = 1; step <= steps; step += 1) {
        if (angle < 1e-7) {
          next.copy(end);
        } else if (Math.abs(sine) < 1e-7) {
          next.copy(start).lerp(end, step / steps).normalize();
        } else {
          const fraction = step / steps;
          next.set(
            start.x * Math.sin((1 - fraction) * angle) / sine + end.x * Math.sin(fraction * angle) / sine,
            start.y * Math.sin((1 - fraction) * angle) / sine + end.y * Math.sin(fraction * angle) / sine,
            start.z * Math.sin((1 - fraction) * angle) / sine + end.z * Math.sin(fraction * angle) / sine,
          ).normalize();
        }
        positions[scalarOffset++] = previous.x * pipelineRadius;
        positions[scalarOffset++] = previous.y * pipelineRadius;
        positions[scalarOffset++] = previous.z * pipelineRadius;
        positions[scalarOffset++] = next.x * pipelineRadius;
        positions[scalarOffset++] = next.y * pipelineRadius;
        positions[scalarOffset++] = next.z * pipelineRadius;
        previous.copy(next);
      }
    }
  }
}

function createPipelineGeometry(pipelines: readonly Pipeline[]): PipelineGeometry {
  const prepared = preparePipelines(pipelines);
  const totalSegments = prepared.reduce((total, item) => total + item.segmentCount, 0);
  const positions = new Float32Array(totalSegments * 6);
  const routes: PipelineRouteRange[] = [];
  let segmentOffset = 0;
  for (const item of prepared) {
    writeRoute(positions, segmentOffset * 6, item.routes);
    routes.push({ id: item.pipeline.id, startSegment: segmentOffset, segmentCount: item.segmentCount });
    segmentOffset += item.segmentCount;
  }

  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);
  geometry.computeBoundingSphere();
  return { geometry, positions, routes };
}

function createSelectedGeometry(batch: PipelineGeometry | null, selectedId: string | null) {
  if (!batch || !selectedId) return null;
  const range = batch.routes.find((route) => route.id === selectedId);
  if (!range) return null;
  const positions = batch.positions;
  const start = range.startSegment * 6;
  const end = start + range.segmentCount * 6;
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions.slice(start, end));
  return geometry;
}

function createHoverGeometry(maxSegments: number) {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(new Float32Array(Math.max(1, maxSegments) * 6));
  return geometry;
}

function updateHoverGeometry(geometry: LineSegmentsGeometry, batch: PipelineGeometry | null, route: PipelineRouteRange | null) {
  const instanceStart = geometry.getAttribute("instanceStart");
  const instanceBuffer = "data" in instanceStart ? instanceStart.data : null;
  if (!instanceBuffer) return;
  const target = instanceBuffer.array as Float32Array;
  if (batch && route) {
    const source = batch.positions;
    const start = route.startSegment * 6;
    const end = start + route.segmentCount * 6;
    target.set(source.subarray(start, end), 0);
    geometry.instanceCount = route.segmentCount;
  } else {
    geometry.instanceCount = 0;
  }
  instanceBuffer.needsUpdate = true;
}

function createPipelinePickingCache(batch: PipelineGeometry) {
  const segmentCount = batch.positions.length / 6;
  return {
    index: new ScreenSpatialIndex(),
    startX: new Float32Array(segmentCount),
    startY: new Float32Array(segmentCount),
    endX: new Float32Array(segmentCount),
    endY: new Float32Array(segmentCount),
  };
}

export function PipelineLayer({ pipelines, visible, selectedId, hoveredId, onSelect, onHover, onHoverEnd }: {
  readonly pipelines: readonly Pipeline[];
  readonly visible: boolean;
  readonly selectedId: string | null;
  readonly hoveredId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onHover: (key: HoverKey, clientX: number, clientY: number, distance: number, event: PointerEvent) => void;
  readonly onHoverEnd: (key: HoverKey) => void;
}) {
  const { camera, invalidate, size, pointer } = useThree();
  const gasBatch = useMemo(() => createPipelineGeometry(pipelines.filter((pipeline) => pipeline.fuel === "gas")), [pipelines]);
  const oilBatch = useMemo(() => createPipelineGeometry(pipelines.filter((pipeline) => pipeline.fuel === "oil")), [pipelines]);
  const selectedPipeline = useMemo(() => pipelines.find((pipeline) => pipeline.id === selectedId) ?? null, [pipelines, selectedId]);
  const hoveredPipeline = useMemo(() => pipelines.find((pipeline) => pipeline.id === hoveredId) ?? null, [pipelines, hoveredId]);
  const selectedBatch = selectedPipeline?.fuel === "gas" ? gasBatch : selectedPipeline?.fuel === "oil" ? oilBatch : null;
  const hoveredBatch = hoveredPipeline?.fuel === "gas" ? gasBatch : hoveredPipeline?.fuel === "oil" ? oilBatch : null;
  const selectedGeometry = useMemo(() => createSelectedGeometry(selectedBatch, selectedId), [selectedBatch, selectedId]);
  const maxRouteSegments = Math.max(1,
    gasBatch.routes.reduce((max, route) => Math.max(max, route.segmentCount), 0),
    oilBatch.routes.reduce((max, route) => Math.max(max, route.segmentCount), 0),
  );
  const hoverGeometry = useMemo(() => createHoverGeometry(maxRouteSegments), [maxRouteSegments]);
  const gasMaterial = useMemo(() => new LineMaterial({ linewidth: 1.6, transparent: true, depthTest: true, depthWrite: false, opacity: 0.76 }), []);
  const oilMaterial = useMemo(() => new LineMaterial({ linewidth: 1.6, transparent: true, depthTest: true, depthWrite: false, opacity: 0.76 }), []);
  const gasLine = useMemo(() => new LineSegments2(gasBatch.geometry, gasMaterial), [gasBatch.geometry, gasMaterial]);
  const oilLine = useMemo(() => new LineSegments2(oilBatch.geometry, oilMaterial), [oilBatch.geometry, oilMaterial]);
  const selectedMaterial = useMemo(() => new LineMaterial({
    linewidth: 2.8,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    opacity: 1,
  }), []);
  const selectedLine = useMemo(
    () => selectedGeometry ? new LineSegments2(selectedGeometry, selectedMaterial) : null,
    [selectedGeometry, selectedMaterial],
  );
  const hoverMaterial = useMemo(() => new LineMaterial({
    linewidth: 2.1,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    opacity: 0.96,
  }), []);
  const hoverLine = useMemo(() => new LineSegments2(hoverGeometry, hoverMaterial), [hoverGeometry, hoverMaterial]);
  const gasPicking = useMemo(() => createPipelinePickingCache(gasBatch), [gasBatch]);
  const oilPicking = useMemo(() => createPipelinePickingCache(oilBatch), [oilBatch]);
  const worldStart = useMemo(() => new Vector3(), []);
  const worldEnd = useMemo(() => new Vector3(), []);
  const projectedStart = useMemo(() => new Vector3(), []);
  const projectedEnd = useMemo(() => new Vector3(), []);
  const cameraPosition = useMemo(() => new Vector3(), []);
  const raycastFor = useCallback((batch: PipelineGeometry, cache: ReturnType<typeof createPipelinePickingCache>) => function raycastPipelineLines(
    this: LineSegments2,
    _raycaster: Raycaster,
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
      source: batch.positions,
    };
    const positions = batch.positions;
    if (cache.index.isStale(snapshot)) {
      cache.index.reset(snapshot);
      const segmentCount = positions.length / 6;
      for (let segment = 0; segment < segmentCount; segment += 1) {
        const offset = segment * 6;
        worldStart.set(positions[offset], positions[offset + 1], positions[offset + 2]).applyMatrix4(this.matrixWorld);
        worldEnd.set(positions[offset + 3], positions[offset + 4], positions[offset + 5]).applyMatrix4(this.matrixWorld);
        projectedStart.copy(worldStart).project(camera);
        projectedEnd.copy(worldEnd).project(camera);
        if ((projectedStart.z < -1 && projectedEnd.z < -1) || (projectedStart.z > 1 && projectedEnd.z > 1)) continue;
        const x1 = (projectedStart.x + 1) * size.width * 0.5;
        const y1 = (1 - projectedStart.y) * size.height * 0.5;
        const x2 = (projectedEnd.x + 1) * size.width * 0.5;
        const y2 = (1 - projectedEnd.y) * size.height * 0.5;
        cache.startX[segment] = x1;
        cache.startY[segment] = y1;
        cache.endX[segment] = x2;
        cache.endY[segment] = y2;
        cache.index.insertSegment(x1, y1, x2, y2, segment, pickRadiusPixels);
      }
    }

    const pointerX = (pointer.x + 1) * size.width * 0.5;
    const pointerY = (1 - pointer.y) * size.height * 0.5;
    const candidates = cache.index.query(pointerX, pointerY, pickRadiusPixels);
    let bestSegment = -1;
    let bestDistance = pickRadiusPixels * pickRadiusPixels;
    let bestWorldX = 0;
    let bestWorldY = 0;
    let bestWorldZ = 0;
    let bestDepth = Infinity;
    camera.getWorldPosition(cameraPosition);
    for (const segment of candidates) {
      const x1 = cache.startX[segment];
      const y1 = cache.startY[segment];
      const dx = cache.endX[segment] - x1;
      const dy = cache.endY[segment] - y1;
      const lengthSquared = dx * dx + dy * dy;
      const fraction = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((pointerX - x1) * dx + (pointerY - y1) * dy) / lengthSquared));
      const closestX = x1 + dx * fraction;
      const closestY = y1 + dy * fraction;
      const distance = (closestX - pointerX) ** 2 + (closestY - pointerY) ** 2;
      if (distance > bestDistance) continue;
      const offset = segment * 6;
      worldStart.set(positions[offset], positions[offset + 1], positions[offset + 2]).applyMatrix4(this.matrixWorld);
      worldEnd.set(positions[offset + 3], positions[offset + 4], positions[offset + 5]).applyMatrix4(this.matrixWorld);
      const worldX = worldStart.x + (worldEnd.x - worldStart.x) * fraction;
      const worldY = worldStart.y + (worldEnd.y - worldStart.y) * fraction;
      const worldZ = worldStart.z + (worldEnd.z - worldStart.z) * fraction;
      const normalLength = Math.max(Math.hypot(worldX, worldY, worldZ), 1e-9);
      const facing = worldX * (cameraPosition.x - worldX) + worldY * (cameraPosition.y - worldY) + worldZ * (cameraPosition.z - worldZ);
      if (facing / normalLength <= 0) continue;
      const depth = (worldX - cameraPosition.x) ** 2 + (worldY - cameraPosition.y) ** 2 + (worldZ - cameraPosition.z) ** 2;
      if (distance < bestDistance || (distance === bestDistance && depth < bestDepth)) {
        bestSegment = segment;
        bestDistance = distance;
        bestDepth = depth;
        bestWorldX = worldX;
        bestWorldY = worldY;
        bestWorldZ = worldZ;
      }
    }
    if (bestSegment >= 0) intersections.push({
      distance: Math.sqrt(bestDepth),
      distanceToRay: Math.sqrt(bestDistance),
      point: new Vector3(bestWorldX, bestWorldY, bestWorldZ),
      object: this,
      index: bestSegment * 2,
    } as Intersection);
  }, [camera, cameraPosition, pointer, projectedEnd, projectedStart, size.height, size.width, worldEnd, worldStart]);
  const gasRaycast = useMemo(() => raycastFor(gasBatch, gasPicking), [gasBatch, gasPicking, raycastFor]);
  const oilRaycast = useMemo(() => raycastFor(oilBatch, oilPicking), [oilBatch, oilPicking, raycastFor]);

  useEffect(() => () => gasBatch.geometry.dispose(), [gasBatch.geometry]);
  useEffect(() => () => oilBatch.geometry.dispose(), [oilBatch.geometry]);
  useEffect(() => () => selectedGeometry?.dispose(), [selectedGeometry]);
  useEffect(() => () => hoverGeometry.dispose(), [hoverGeometry]);
  useEffect(() => () => gasMaterial.dispose(), [gasMaterial]);
  useEffect(() => () => oilMaterial.dispose(), [oilMaterial]);
  useEffect(() => () => selectedMaterial.dispose(), [selectedMaterial]);
  useEffect(() => () => hoverMaterial.dispose(), [hoverMaterial]);
  useEffect(() => {
    gasMaterial.color.set(readDesignColor(DESIGN_COLOR_TOKENS.pipelineGas));
    oilMaterial.color.set(readDesignColor(DESIGN_COLOR_TOKENS.pipelineOil));
    const opacity = selectedPipeline ? 0.38 : 0.76;
    gasMaterial.opacity = opacity;
    oilMaterial.opacity = opacity;
    if (selectedPipeline) selectedMaterial.color.set(readDesignColor(
      selectedPipeline.fuel === "gas" ? DESIGN_COLOR_TOKENS.pipelineGas : DESIGN_COLOR_TOKENS.pipelineOil,
    ));
    if (hoveredPipeline) hoverMaterial.color.set(readDesignColor(
      hoveredPipeline.fuel === "gas" ? DESIGN_COLOR_TOKENS.pipelineGas : DESIGN_COLOR_TOKENS.pipelineOil,
    ));
    invalidate();
  }, [gasMaterial, hoverMaterial, hoveredPipeline, invalidate, oilMaterial, selectedMaterial, selectedPipeline]);
  useEffect(() => invalidate(), [gasBatch.geometry, hoverGeometry, invalidate, oilBatch.geometry, selectedGeometry, visible]);
  useEffect(() => {
    const range = hoveredBatch?.routes.find((route) => route.id === hoveredId) ?? null;
    updateHoverGeometry(hoverGeometry, hoveredBatch, range);
    invalidate();
  }, [hoverGeometry, hoveredBatch, hoveredId, invalidate]);

  if (!visible || pipelines.length === 0) return null;

  const handleHoverMove = (batch: PipelineGeometry) => (event: { readonly index?: number; readonly distance: number; readonly clientX: number; readonly clientY: number; readonly nativeEvent: PointerEvent; stopPropagation: () => void }) => {
    if (event.nativeEvent.pointerType === "touch" || event.index === undefined) return;
    const route = routeRangeForSegment(batch.routes, Math.floor(event.index / 2));
    if (!route) return;
    event.stopPropagation();
    onHover({ type: "pipelines", id: route.id }, event.clientX, event.clientY, event.distance, event.nativeEvent);
  };
  const handleHoverOut = (batch: PipelineGeometry) => (event: { readonly index?: number }) => {
    if (event.index === undefined) return;
    const route = routeRangeForSegment(batch.routes, Math.floor(event.index / 2));
    if (route) onHoverEnd({ type: "pipelines", id: route.id });
  };
  const handleClick = (batch: PipelineGeometry) => (event: { readonly index?: number; readonly delta?: number; stopPropagation: () => void }) => {
    if (event.index === undefined || (event.delta ?? 0) > 5) return;
    const range = routeRangeForSegment(batch.routes, Math.floor(event.index / 2));
    if (!range) return;
    event.stopPropagation();
    onSelect(range.id);
  };

  return <group>
    {gasBatch.routes.length > 0 ? <primitive object={gasLine} raycast={gasRaycast} onClick={handleClick(gasBatch)} onPointerMove={handleHoverMove(gasBatch)} onPointerOut={handleHoverOut(gasBatch)} renderOrder={2} /> : null}
    {oilBatch.routes.length > 0 ? <primitive object={oilLine} raycast={oilRaycast} onClick={handleClick(oilBatch)} onPointerMove={handleHoverMove(oilBatch)} onPointerOut={handleHoverOut(oilBatch)} renderOrder={2} /> : null}
    {hoveredPipeline && hoveredId !== selectedId ? <primitive object={hoverLine} raycast={() => null} frustumCulled={false} renderOrder={2.5} /> : null}
    {selectedLine ? <primitive object={selectedLine} raycast={() => null} renderOrder={3} /> : null}
  </group>;
}
