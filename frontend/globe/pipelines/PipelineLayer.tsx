"use client";

import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import {
  BufferAttribute,
  BufferGeometry,
  LineBasicMaterial,
  LineSegments,
  Vector3,
  type Intersection,
  type Raycaster,
} from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import type { Pipeline, PipelineCoordinate, PipelineFuel } from "@/features/pipelines/model";
import { DESIGN_COLOR_TOKENS, readDesignColor } from "@/shared/designTokens";

type RouteRange = {
  readonly id: string;
  readonly startSegment: number;
  readonly segmentCount: number;
};

type PipelineGeometry = {
  readonly geometry: BufferGeometry;
  readonly routes: readonly RouteRange[];
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
const pickRadiusPixels = 5;

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
  const routes: RouteRange[] = [];
  let segmentOffset = 0;
  for (const item of prepared) {
    writeRoute(positions, segmentOffset * 6, item.routes);
    routes.push({ id: item.pipeline.id, startSegment: segmentOffset, segmentCount: item.segmentCount });
    segmentOffset += item.segmentCount;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.computeBoundingSphere();
  return { geometry, routes };
}

function findRoute(ranges: readonly RouteRange[], segmentIndex: number) {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const range = ranges[middle];
    if (segmentIndex < range.startSegment) high = middle - 1;
    else if (segmentIndex >= range.startSegment + range.segmentCount) low = middle + 1;
    else return range;
  }
  return null;
}

function createSelectedGeometry(batch: PipelineGeometry | null, selectedId: string | null) {
  if (!batch || !selectedId) return null;
  const range = batch.routes.find((route) => route.id === selectedId);
  if (!range) return null;
  const positions = batch.geometry.getAttribute("position").array as Float32Array;
  const start = range.startSegment * 6;
  const end = start + range.segmentCount * 6;
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions.slice(start, end));
  return geometry;
}

export function PipelineLayer({ pipelines, visible, selectedId, onSelect }: {
  readonly pipelines: readonly Pipeline[];
  readonly visible: boolean;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}) {
  const { camera, invalidate, size } = useThree();
  const gasBatch = useMemo(() => createPipelineGeometry(pipelines.filter((pipeline) => pipeline.fuel === "gas")), [pipelines]);
  const oilBatch = useMemo(() => createPipelineGeometry(pipelines.filter((pipeline) => pipeline.fuel === "oil")), [pipelines]);
  const selectedPipeline = useMemo(() => pipelines.find((pipeline) => pipeline.id === selectedId) ?? null, [pipelines, selectedId]);
  const selectedBatch = selectedPipeline?.fuel === "gas" ? gasBatch : selectedPipeline?.fuel === "oil" ? oilBatch : null;
  const selectedGeometry = useMemo(() => createSelectedGeometry(selectedBatch, selectedId), [selectedBatch, selectedId]);
  const gasMaterial = useMemo(() => new LineBasicMaterial({ transparent: true, depthTest: true, depthWrite: false, opacity: 0.76 }), []);
  const oilMaterial = useMemo(() => new LineBasicMaterial({ transparent: true, depthTest: true, depthWrite: false, opacity: 0.76 }), []);
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

  const raycast = useMemo(() => function raycastPipelineLines(
    this: LineSegments,
    raycaster: Raycaster,
    intersections: Intersection[],
  ) {
    const previousThreshold = raycaster.params.Line.threshold;
    const cameraDepth = Math.max(camera.near, camera.position.length() - pipelineRadius);
    const zoom = "zoom" in camera ? camera.zoom : 1;
    const worldHeight = "fov" in camera
      ? 2 * cameraDepth * Math.tan(camera.fov * Math.PI / 360) / zoom
      : (camera.top - camera.bottom) / zoom;
    const candidates: Intersection[] = [];
    const cameraPosition = new Vector3();
    camera.getWorldPosition(cameraPosition);
    try {
      raycaster.params.Line.threshold = worldHeight / Math.max(size.height, 1) * pickRadiusPixels;
      LineSegments.prototype.raycast.call(this, raycaster, candidates);
    } finally {
      raycaster.params.Line.threshold = previousThreshold;
    }
    for (const candidate of candidates) {
      const normal = candidate.point.clone().normalize();
      const towardCamera = cameraPosition.clone().sub(candidate.point).normalize();
      if (normal.dot(towardCamera) > 0) intersections.push(candidate);
    }
  }, [camera, size.height]);

  useEffect(() => () => gasBatch.geometry.dispose(), [gasBatch.geometry]);
  useEffect(() => () => oilBatch.geometry.dispose(), [oilBatch.geometry]);
  useEffect(() => () => selectedGeometry?.dispose(), [selectedGeometry]);
  useEffect(() => () => gasMaterial.dispose(), [gasMaterial]);
  useEffect(() => () => oilMaterial.dispose(), [oilMaterial]);
  useEffect(() => () => selectedMaterial.dispose(), [selectedMaterial]);
  useEffect(() => {
    gasMaterial.color.set(readDesignColor(DESIGN_COLOR_TOKENS.pipelineGas));
    oilMaterial.color.set(readDesignColor(DESIGN_COLOR_TOKENS.pipelineOil));
    const opacity = selectedPipeline ? 0.38 : 0.76;
    gasMaterial.opacity = opacity;
    oilMaterial.opacity = opacity;
    if (selectedPipeline) selectedMaterial.color.set(readDesignColor(
      selectedPipeline.fuel === "gas" ? DESIGN_COLOR_TOKENS.pipelineGas : DESIGN_COLOR_TOKENS.pipelineOil,
    ));
    invalidate();
  }, [gasMaterial, invalidate, oilMaterial, selectedMaterial, selectedPipeline]);
  useEffect(() => invalidate(), [gasBatch.geometry, invalidate, oilBatch.geometry, selectedGeometry, visible]);

  if (!visible || pipelines.length === 0) return null;

  const handleClick = (batch: PipelineGeometry) => (event: { readonly index?: number; readonly delta?: number; stopPropagation: () => void }) => {
    if (event.index === undefined || (event.delta ?? 0) > 5) return;
    const range = findRoute(batch.routes, Math.floor(event.index / 2));
    if (!range) return;
    event.stopPropagation();
    onSelect(range.id);
  };

  return <group>
    {gasBatch.routes.length > 0 ? <lineSegments geometry={gasBatch.geometry} material={gasMaterial} raycast={raycast} onClick={handleClick(gasBatch)} renderOrder={2} /> : null}
    {oilBatch.routes.length > 0 ? <lineSegments geometry={oilBatch.geometry} material={oilMaterial} raycast={raycast} onClick={handleClick(oilBatch)} renderOrder={2} /> : null}
    {selectedLine ? <primitive object={selectedLine} raycast={() => null} renderOrder={3} /> : null}
  </group>;
}
