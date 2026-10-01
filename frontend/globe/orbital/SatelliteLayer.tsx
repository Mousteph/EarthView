"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  MeshBasicMaterial,
  PointsMaterial,
  TubeGeometry,
  Vector3,
  type Group,
} from "three";
import { isInternationalSpaceStation, type OrbitalObject, type SelectedSatellitePosition } from "@/features/orbital/model";
import { recordSatelliteWorkerCalculation, recordSatelliteWorkerCreated, recordSatelliteWorkerInitialization } from "@/features/orbital/performance";
import { DESIGN_COLOR_TOKENS, readDesignColor } from "@/shared/designTokens";
import { segmentHiddenByEarth, snapshotAlpha } from "./satelliteMath";
import { orbitalObjectColor } from "@/features/orbital/colors";
import type { HoverKey } from "@/features/map/hover";
import { ScreenSpatialIndex } from "@/globe/interaction/ScreenSpatialIndex";
import type { SelectedPointScreenPosition } from "../points/PointLayer";
import type { OrbitalElements, SatelliteWorkerInput, SatelliteWorkerOutput } from "./satelliteProtocol";

type SatelliteLayerProps = {
  readonly satellites: readonly OrbitalObject[];
  readonly visibility: Uint8Array | null;
  readonly selectedId: string | null;
  readonly hoveredId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onHover: (key: HoverKey, clientX: number, clientY: number, distance: number, event: PointerEvent) => void;
  readonly onHoverEnd: (key: HoverKey) => void;
  readonly onSelectedData: (position: SelectedSatellitePosition | null) => void;
  readonly onSelectedPositionChange: (position: SelectedPointScreenPosition | null) => void;
};

type Snapshot = { first: Float32Array; second: Float32Array; startMs: number; endMs: number };

const pointColors = new Map<string, Color>();
const satellitePickRadiusPixels = 6;
const dragThresholdPixels = 5;
const trajectoryTubeRadius = 0.0028;
const trajectoryDashLength = 0.075;
const trajectoryDashGap = 0.045;
const trajectoryRadialSegments = 5;

type TrajectoryUniforms = {
  readonly currentDistance: { value: number };
  readonly dashLength: { value: number };
  readonly dashPeriod: { value: number };
};

type TrajectoryGeometry = {
  readonly geometry: BufferGeometry;
  readonly centerline: Float32Array;
  readonly tubeSegments: number;
  readonly pathLength: number;
  readonly radialSegments: number;
  activeRingIndex: number;
  readonly activeRingBase: Float32Array;
};

function colorForObject(satellite: OrbitalObject): Color {
  const color = orbitalObjectColor(satellite);
  let resolved = pointColors.get(color);
  if (!resolved) {
    resolved = new Color(color);
    pointColors.set(color, resolved);
  }
  return resolved;
}

function createGeometry(count: number) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("futurePosition", new BufferAttribute(new Float32Array(count * 3), 3));
  const colors = new Float32Array(count * 3);
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  const filterVisible = new Float32Array(count);
  filterVisible.fill(1);
  geometry.setAttribute("filterVisible", new BufferAttribute(filterVisible, 1));
  return geometry;
}

function createMaterial(size: number, selected: boolean, stationGlyph = false) {
  const material = new PointsMaterial({ size, sizeAttenuation: false, depthTest: true, depthWrite: false, transparent: true, opacity: selected ? 0.82 : 0.83, vertexColors: !selected && !stationGlyph });
  material.userData.interpolationAlpha = { value: 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.interpolationAlpha = material.userData.interpolationAlpha;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 futurePosition;\nattribute float filterVisible;\nuniform float interpolationAlpha;\nvarying float satelliteValid;")
      .replace("#include <begin_vertex>", "vec3 transformed = mix(position, futurePosition, interpolationAlpha);\nsatelliteValid = filterVisible * step(0.5, length(position)) * step(0.5, length(futurePosition));");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float satelliteValid;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        ${selected ? "diffuseColor.rgb = min(diffuseColor.rgb * 1.35, vec3(1.0));" : ""}`)
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
        if (satelliteValid < 0.5) discard;
        float radius = length(gl_PointCoord - vec2(0.5));
        ${stationGlyph ? `
        vec2 station = gl_PointCoord - vec2(0.5);
        float bus = step(abs(station.x), 0.075) * step(abs(station.y), 0.15);
        float truss = step(abs(station.x), 0.36) * step(abs(station.y), 0.035);
        float panels = (step(-0.44, station.x) * step(station.x, -0.15) + step(0.15, station.x) * step(station.x, 0.44)) * step(abs(station.y), 0.18);
        float glyph = max(max(bus, truss), panels);
        if (satelliteValid < 0.5 || glyph < 0.5) discard;
        float panelGrid = max(1.0 - step(0.018, abs(abs(station.x) - 0.295)), 1.0 - step(0.015, abs(station.y)));
        if (panels > 0.5 && panelGrid > 0.5 && bus < 0.5 && truss < 0.5) discard;`
          : selected ? "if (radius > 0.5 || (radius < 0.29 && radius > 0.17)) discard;" : "if (radius > 0.5) discard;"}`);
  };
  material.customProgramCacheKey = () => `earthview-satellite-${stationGlyph ? "iss" : selected ? "selected" : "points"}-v1`;
  return material;
}

function setGeometryPositions(geometry: BufferGeometry, first: Float32Array, second: Float32Array) {
  const current = geometry.getAttribute("position") as BufferAttribute;
  const future = geometry.getAttribute("futurePosition") as BufferAttribute;
  (current.array as Float32Array).set(first);
  (future.array as Float32Array).set(second);
  current.needsUpdate = true;
  future.needsUpdate = true;
}

function createTrajectoryGeometry(positions: Float32Array): TrajectoryGeometry | null {
  const pointCount = positions.length / 3;
  if (pointCount < 3 || pointCount % 2 !== 1) return null;
  const points = Array.from({ length: pointCount }, (_, index) => new Vector3(
    positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2],
  ));
  const curve = new CatmullRomCurve3(points, false);
  const tubeSegments = pointCount * 8;
  const pathLength = curve.getLength();
  const geometry = new TubeGeometry(curve, tubeSegments, trajectoryTubeRadius, trajectoryRadialSegments, false);
  const ringVertexCount = trajectoryRadialSegments + 1;
  const vertexCount = (tubeSegments + 1) * ringVertexCount;
  const distanceValues = new Float32Array(vertexCount);
  for (let ring = 0; ring <= tubeSegments; ring += 1) {
    const distance = ring / tubeSegments * pathLength;
    distanceValues.fill(distance, ring * ringVertexCount, (ring + 1) * ringVertexCount);
  }
  geometry.setAttribute("pathDistance", new BufferAttribute(distanceValues, 1));

  const centerline = new Float32Array((tubeSegments + 1) * 3);
  const sample = new Vector3();
  const centerPointOffset = Math.floor(pointCount / 2) * 3;
  let activeRingIndex = 0;
  let closestCenterDistance = Infinity;
  for (let ring = 0; ring <= tubeSegments; ring += 1) {
    curve.getPointAt(ring / tubeSegments, sample);
    const offset = ring * 3;
    centerline[offset] = sample.x;
    centerline[offset + 1] = sample.y;
    centerline[offset + 2] = sample.z;
    const dx = sample.x - positions[centerPointOffset];
    const dy = sample.y - positions[centerPointOffset + 1];
    const dz = sample.z - positions[centerPointOffset + 2];
    const distanceSquared = dx * dx + dy * dy + dz * dz;
    if (distanceSquared < closestCenterDistance) {
      closestCenterDistance = distanceSquared;
      activeRingIndex = ring;
    }
  }

  const vertexOffset = activeRingIndex * ringVertexCount * 3;
  const geometryPositions = (geometry.getAttribute("position") as BufferAttribute).array as Float32Array;
  return {
    geometry,
    centerline,
    tubeSegments,
    pathLength,
    radialSegments: trajectoryRadialSegments,
    activeRingIndex,
    activeRingBase: geometryPositions.slice(vertexOffset, vertexOffset + ringVertexCount * 3),
  };
}

function updateTrajectoryAnchor(path: TrajectoryGeometry, x: number, y: number, z: number, material: MeshBasicMaterial) {
  const ringVertexCount = path.radialSegments + 1;
  let bestRingIndex = path.activeRingIndex;
  let bestDistance = Infinity;
  for (let ring = 1; ring < path.tubeSegments; ring += 1) {
    const offset = ring * 3;
    const dx = path.centerline[offset] - x;
    const dy = path.centerline[offset + 1] - y;
    const dz = path.centerline[offset + 2] - z;
    const distance = dx * dx + dy * dy + dz * dz;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestRingIndex = ring;
    }
  }

  const position = path.geometry.getAttribute("position") as BufferAttribute;
  const positionValues = position.array as Float32Array;
  const previousRingIndex = path.activeRingIndex;
  const previousVertexOffset = previousRingIndex * ringVertexCount;
  const nextVertexOffset = bestRingIndex * ringVertexCount;
  if (bestRingIndex !== previousRingIndex) {
    positionValues.set(path.activeRingBase, previousVertexOffset * 3);
    path.activeRingBase.set(positionValues.subarray(nextVertexOffset * 3, (nextVertexOffset + ringVertexCount) * 3));
    path.activeRingIndex = bestRingIndex;
  }

  const nextCenterOffset = bestRingIndex * 3;
  const deltaX = x - path.centerline[nextCenterOffset];
  const deltaY = y - path.centerline[nextCenterOffset + 1];
  const deltaZ = z - path.centerline[nextCenterOffset + 2];
  for (let vertex = 0; vertex < ringVertexCount; vertex += 1) {
    const offset = vertex * 3;
    positionValues[nextVertexOffset * 3 + offset] = path.activeRingBase[offset] + deltaX;
    positionValues[nextVertexOffset * 3 + offset + 1] = path.activeRingBase[offset + 1] + deltaY;
    positionValues[nextVertexOffset * 3 + offset + 2] = path.activeRingBase[offset + 2] + deltaZ;
  }
  position.clearUpdateRanges();
  if (bestRingIndex !== previousRingIndex) position.addUpdateRange(previousVertexOffset * 3, ringVertexCount * 3);
  position.addUpdateRange(nextVertexOffset * 3, ringVertexCount * 3);
  position.needsUpdate = true;

  const uniforms = material.userData.trajectoryUniforms as TrajectoryUniforms;
  uniforms.currentDistance.value = bestRingIndex / path.tubeSegments * path.pathLength;
}

export function SatelliteLayer({ satellites, visibility, selectedId, hoveredId, onSelect, onHover, onHoverEnd, onSelectedData, onSelectedPositionChange }: SatelliteLayerProps) {
  const { camera, gl, invalidate, size } = useThree();
  const group = useRef<Group>(null);
  const worker = useRef<Worker | null>(null);
  const snapshot = useRef<Snapshot | null>(null);
  const selectedIdRef = useRef(selectedId);
  const selectedIndexRef = useRef(-1);
  const hoveredIdRef = useRef(hoveredId);
  const hoveredIndexRef = useRef(-1);
  const onSelectRef = useRef(onSelect);
  const onHoverRef = useRef(onHover);
  const onHoverEndRef = useRef(onHoverEnd);
  const onDataRef = useRef(onSelectedData);
  const onScreenRef = useRef(onSelectedPositionChange);
  const markerMaterialRef = useRef<PointsMaterial | null>(null);
  const highlightMaterialRef = useRef<PointsMaterial | null>(null);
  const hoverMaterialRef = useRef<PointsMaterial | null>(null);
  const issMaterialRef = useRef<PointsMaterial | null>(null);
  const projected = useMemo(() => new Vector3(), []);
  const cameraPosition = useMemo(() => new Vector3(), []);
  const geometry = useMemo(() => createGeometry(satellites.length), [satellites]);
  const orbitElements = useMemo<OrbitalElements[]>(() => satellites.map((satellite) => ({
    id: satellite.id, noradId: satellite.noradId, name: satellite.name, epoch: satellite.epoch,
    meanMotion: satellite.meanMotion, eccentricity: satellite.eccentricity,
    inclination: satellite.inclination, rightAscension: satellite.rightAscension,
    argOfPericenter: satellite.argOfPericenter, meanAnomaly: satellite.meanAnomaly,
    bstar: satellite.bstar, meanMotionDot: satellite.meanMotionDot,
    meanMotionDdot: satellite.meanMotionDdot, elementSetNo: satellite.elementSetNo,
    revolutionNumber: satellite.revolutionNumber,
  })), [satellites]);
  const selectedGeometry = useMemo(() => createGeometry(1), []);
  const hoverGeometry = useMemo(() => createGeometry(1), []);
  const issGeometry = useMemo(() => createGeometry(1), []);
  const material = useMemo(() => createMaterial(3.4, false), []);
  const selectedMaterial = useMemo(() => createMaterial(12, true), []);
  const hoverMaterial = useMemo(() => createMaterial(9, true), []);
  const issMaterial = useMemo(() => createMaterial(23, false, true), []);
  const pathMaterial = useMemo(() => {
    const material = new MeshBasicMaterial({ transparent: true, opacity: 0.82, depthTest: true, depthWrite: false });
    const trajectoryUniforms: TrajectoryUniforms = {
      currentDistance: { value: 0 },
      dashLength: { value: trajectoryDashLength },
      dashPeriod: { value: trajectoryDashLength + trajectoryDashGap },
    };
    material.userData.trajectoryUniforms = trajectoryUniforms;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.trajectoryCurrentDistance = trajectoryUniforms.currentDistance;
      shader.uniforms.trajectoryDashLength = trajectoryUniforms.dashLength;
      shader.uniforms.trajectoryDashPeriod = trajectoryUniforms.dashPeriod;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float pathDistance;\nvarying float vPathDistance;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvPathDistance = pathDistance;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vPathDistance;\nuniform float trajectoryCurrentDistance;\nuniform float trajectoryDashLength;\nuniform float trajectoryDashPeriod;")
        .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
          if (vPathDistance > trajectoryCurrentDistance
            && mod(vPathDistance - trajectoryCurrentDistance, trajectoryDashPeriod) > trajectoryDashLength) discard;`);
    };
    material.customProgramCacheKey = () => "earthview-orbit-past-future-tube-v1";
    return material;
  }, []);
  const [path, setPath] = useState<{ id: string; positions: Float32Array } | null>(null);
  const selectedIndex = useMemo(() => satellites.findIndex((satellite) => satellite.id === selectedId), [satellites, selectedId]);
  const hoveredIndex = useMemo(() => satellites.findIndex((satellite) => satellite.id === hoveredId), [satellites, hoveredId]);
  const issIndex = useMemo(() => satellites.findIndex(isInternationalSpaceStation), [satellites]);
  const pathGeometry = useMemo(() => path && path.id === selectedId ? createTrajectoryGeometry(path.positions) : null, [path, selectedId]);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { selectedIndexRef.current = selectedIndex; }, [selectedIndex]);
  useEffect(() => { hoveredIdRef.current = hoveredId; }, [hoveredId]);
  useEffect(() => { hoveredIndexRef.current = hoveredIndex; }, [hoveredIndex]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onHoverRef.current = onHover; }, [onHover]);
  useEffect(() => { onHoverEndRef.current = onHoverEnd; }, [onHoverEnd]);
  useEffect(() => { onDataRef.current = onSelectedData; }, [onSelectedData]);
  useEffect(() => { onScreenRef.current = onSelectedPositionChange; }, [onSelectedPositionChange]);
  useEffect(() => { markerMaterialRef.current = material; }, [material]);
  useEffect(() => { highlightMaterialRef.current = selectedMaterial; }, [selectedMaterial]);
  useEffect(() => { hoverMaterialRef.current = hoverMaterial; }, [hoverMaterial]);
  useEffect(() => { issMaterialRef.current = issMaterial; }, [issMaterial]);
  useEffect(() => {
    const iss = issIndex >= 0 ? satellites[issIndex] : null;
    issMaterial.color.copy(iss ? colorForObject(iss) : new Color(readDesignColor(DESIGN_COLOR_TOKENS.satellite)));
    invalidate();
  }, [invalidate, issIndex, issMaterial, satellites]);
  useEffect(() => {
    const colors = geometry.getAttribute("color") as BufferAttribute;
    const values = colors.array as Float32Array;
    for (let index = 0; index < satellites.length; index += 1) {
      colorForObject(satellites[index]).toArray(values, index * 3);
    }
    colors.needsUpdate = true;
    material.color.set(readDesignColor(DESIGN_COLOR_TOKENS.white));
    invalidate();
  }, [geometry, invalidate, material, satellites]);
  useEffect(() => {
    const selectedObject = selectedIndex >= 0 ? satellites[selectedIndex] : null;
    const color = selectedObject
      ? colorForObject(selectedObject)
      : new Color(readDesignColor(DESIGN_COLOR_TOKENS.satellite));
    pathMaterial.color.copy(color);
    selectedMaterial.color.copy(color);
    if (hoveredIndex >= 0) hoverMaterial.color.copy(colorForObject(satellites[hoveredIndex]));
    invalidate();
  }, [hoverMaterial, hoveredIndex, invalidate, pathMaterial, satellites, selectedIndex, selectedMaterial]);

  useEffect(() => {
    const attribute = geometry.getAttribute("filterVisible") as BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let index = 0; index < satellites.length; index += 1) array[index] = visibility?.[index] ?? 1;
    attribute.needsUpdate = true;
    invalidate();
  }, [geometry, invalidate, satellites, visibility]);

  useEffect(() => {
    const attribute = issGeometry.getAttribute("filterVisible") as BufferAttribute;
    (attribute.array as Float32Array)[0] = issIndex >= 0 ? visibility?.[issIndex] ?? 1 : 0;
    attribute.needsUpdate = true;
    invalidate();
  }, [invalidate, issGeometry, issIndex, visibility]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => selectedGeometry.dispose(), [selectedGeometry]);
  useEffect(() => () => hoverGeometry.dispose(), [hoverGeometry]);
  useEffect(() => () => issGeometry.dispose(), [issGeometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => selectedMaterial.dispose(), [selectedMaterial]);
  useEffect(() => () => hoverMaterial.dispose(), [hoverMaterial]);
  useEffect(() => () => issMaterial.dispose(), [issMaterial]);
  useEffect(() => () => pathMaterial.dispose(), [pathMaterial]);
  useEffect(() => () => pathGeometry?.geometry.dispose(), [pathGeometry]);

  useEffect(() => {
    if (satellites.length === 0) return;
    recordSatelliteWorkerCreated();
    const orbitWorker = new Worker(new URL("./satellite.worker.ts", import.meta.url), { type: "module" });
    worker.current = orbitWorker;
    orbitWorker.addEventListener("message", (event: MessageEvent<SatelliteWorkerOutput>) => {
      const message = event.data;
      if (message.type === "snapshot") {
        const first = message.first ?? snapshot.current?.second;
        if (!first) return;
        snapshot.current = { first, second: message.second, startMs: message.startMs, endMs: message.endMs };
        setGeometryPositions(geometry, first, message.second);
        if (issIndex >= 0) {
          const offset = issIndex * 3;
          setGeometryPositions(issGeometry, first.subarray(offset, offset + 3), message.second.subarray(offset, offset + 3));
        }
        const index = selectedIndexRef.current;
        if (index >= 0) {
          const offset = index * 3;
          setGeometryPositions(selectedGeometry, first.subarray(offset, offset + 3), message.second.subarray(offset, offset + 3));
        }
        const hoveredIndex = hoveredIndexRef.current;
        if (hoveredIndex >= 0) {
          const offset = hoveredIndex * 3;
          setGeometryPositions(hoverGeometry, first.subarray(offset, offset + 3), message.second.subarray(offset, offset + 3));
        }
        recordSatelliteWorkerCalculation(satellites.length, message.calculationMs);
        if (message.initializationMs !== undefined) recordSatelliteWorkerInitialization(message.initializationMs);
        invalidate();
      } else if (message.type === "selected") {
        if (message.id !== selectedIdRef.current) return;
        onDataRef.current(message.position);
        if ("trajectory" in message) setPath(message.trajectory ? { id: message.id, positions: message.trajectory } : null);
      } else {
        console.error("Satellite propagation failed:", message.message);
      }
    });
    orbitWorker.postMessage({ type: "init", satellites: orbitElements } satisfies SatelliteWorkerInput);
    if (selectedIdRef.current) orbitWorker.postMessage({ type: "select", id: selectedIdRef.current } satisfies SatelliteWorkerInput);
    return () => {
      orbitWorker.terminate();
      worker.current = null;
      snapshot.current = null;
      onDataRef.current(null);
      onScreenRef.current(null);
    };
  }, [geometry, hoverGeometry, invalidate, issGeometry, issIndex, orbitElements, satellites.length, selectedGeometry]);

  useEffect(() => {
    worker.current?.postMessage({ type: "select", id: selectedId } satisfies SatelliteWorkerInput);
    if (!selectedId) {
      onDataRef.current(null);
      onScreenRef.current(null);
    } else {
      const current = snapshot.current;
      const index = satellites.findIndex((satellite) => satellite.id === selectedId);
      if (current && index >= 0) {
        const offset = index * 3;
        setGeometryPositions(selectedGeometry, current.first.subarray(offset, offset + 3), current.second.subarray(offset, offset + 3));
      }
    }
    invalidate();
  }, [invalidate, satellites, selectedGeometry, selectedId]);

  useEffect(() => {
    if (hoveredIndex < 0) return;
    const current = snapshot.current;
    if (current) {
      const offset = hoveredIndex * 3;
      setGeometryPositions(hoverGeometry, current.first.subarray(offset, offset + 3), current.second.subarray(offset, offset + 3));
    }
    if (hoveredIndex >= 0) hoverMaterial.color.copy(colorForObject(satellites[hoveredIndex]));
    invalidate();
  }, [hoverGeometry, hoverMaterial, hoveredIndex, invalidate, satellites]);

  useEffect(() => {
    const canvas = gl.domElement;
    let activePointer: { id: number; x: number; y: number; dragged: boolean } | null = null;
    let suppressClickAfterDrag = false;
    const pickIndex = new ScreenSpatialIndex();
    const startProjected = new Vector3();
    const endProjected = new Vector3();
    const updatePointerMovement = (event: PointerEvent) => {
      if (!activePointer || activePointer.id !== event.pointerId) return;
      if ((event.clientX - activePointer.x) ** 2 + (event.clientY - activePointer.y) ** 2 > dragThresholdPixels ** 2) {
        activePointer.dragged = true;
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      activePointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
      suppressClickAfterDrag = false;
    };
    const pickAt = (clientX: number, clientY: number) => {
      if (!group.current || !snapshot.current) return { index: -1, depth: Infinity };
      const bounds = canvas.getBoundingClientRect();
      const current = snapshot.current;
      camera.updateMatrixWorld();
      group.current.updateWorldMatrix(true, false);
      const indexSnapshot = {
        width: bounds.width,
        height: bounds.height,
        cameraWorld: camera.matrixWorld.elements,
        cameraProjection: camera.projectionMatrix.elements,
        objectWorld: group.current.matrixWorld.elements,
        cameraDistance: camera.position.length(),
        source: current,
      };
      if (pickIndex.isStale(indexSnapshot)) {
        pickIndex.reset(indexSnapshot);
        for (let index = 0; index < satellites.length; index += 1) {
          if (visibility && !visibility[index]) continue;
          const offset = index * 3;
          if (current.first[offset] ** 2 + current.first[offset + 1] ** 2 + current.first[offset + 2] ** 2 < 0.5
            || current.second[offset] ** 2 + current.second[offset + 1] ** 2 + current.second[offset + 2] ** 2 < 0.5) continue;
          startProjected.set(current.first[offset], current.first[offset + 1], current.first[offset + 2]).applyMatrix4(group.current.matrixWorld).project(camera);
          endProjected.set(current.second[offset], current.second[offset + 1], current.second[offset + 2]).applyMatrix4(group.current.matrixWorld).project(camera);
          if ((startProjected.z < -1 && endProjected.z < -1) || (startProjected.z > 1 && endProjected.z > 1)) continue;
          pickIndex.insertSegment(
            (startProjected.x + 1) * bounds.width * 0.5,
            (1 - startProjected.y) * bounds.height * 0.5,
            (endProjected.x + 1) * bounds.width * 0.5,
            (1 - endProjected.y) * bounds.height * 0.5,
            index,
            satellitePickRadiusPixels + 3,
          );
        }
      }

      const pointerX = clientX - bounds.left;
      const pointerY = clientY - bounds.top;
      const candidates = pickIndex.query(pointerX, pointerY, satellitePickRadiusPixels);
      const { first, second, startMs, endMs } = current;
      const blend = snapshotAlpha(Date.now(), startMs, endMs);
      camera.getWorldPosition(cameraPosition);
      let bestIndex = -1;
      let bestDistance = satellitePickRadiusPixels * satellitePickRadiusPixels;
      let bestDepth = Infinity;
      for (const index of candidates) {
        if (visibility && !visibility[index]) continue;
        const offset = index * 3;
        const x = first[offset] + (second[offset] - first[offset]) * blend;
        const y = first[offset + 1] + (second[offset + 1] - first[offset + 1]) * blend;
        const z = first[offset + 2] + (second[offset + 2] - first[offset + 2]) * blend;
        if (x * x + y * y + z * z < 0.5) continue;
        projected.set(x, y, z).applyMatrix4(group.current.matrixWorld);
        if (segmentHiddenByEarth(cameraPosition.x, cameraPosition.y, cameraPosition.z, projected.x, projected.y, projected.z)) continue;
        const depth = projected.distanceToSquared(cameraPosition);
        projected.project(camera);
        if (projected.z < -1 || projected.z > 1) continue;
        const screenX = (projected.x + 1) * bounds.width * 0.5;
        const screenY = (1 - projected.y) * bounds.height * 0.5;
        const distance = (screenX - pointerX) ** 2 + (screenY - pointerY) ** 2;
        if (distance < bestDistance || (distance === bestDistance && depth < bestDepth)) {
          bestIndex = index;
          bestDistance = distance;
          bestDepth = depth;
        }
      }
      return { index: bestIndex, depth: bestDepth };
    };
    const handlePointerMove = (event: PointerEvent) => {
      updatePointerMovement(event);
      if (event.pointerType === "touch" || activePointer?.dragged) {
        if (hoveredIdRef.current) onHoverEndRef.current({ type: "satellites", id: hoveredIdRef.current });
        return;
      }
      const hit = pickAt(event.clientX, event.clientY);
      if (hit.index >= 0) onHoverRef.current({ type: "satellites", id: satellites[hit.index].id }, event.clientX, event.clientY, Math.sqrt(hit.depth), event);
      else if (hoveredIdRef.current) onHoverEndRef.current({ type: "satellites", id: hoveredIdRef.current });
    };
    const handlePointerUp = (event: PointerEvent) => {
      updatePointerMovement(event);
      if (activePointer?.id === event.pointerId) {
        suppressClickAfterDrag = activePointer.dragged;
        activePointer = null;
      }
    };
    const handlePointerCancel = (event: PointerEvent) => {
      if (activePointer?.id === event.pointerId) {
        suppressClickAfterDrag = true;
        activePointer = null;
      }
    };
    const pick = (event: MouseEvent) => {
      if (suppressClickAfterDrag) {
        suppressClickAfterDrag = false;
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const hit = pickAt(event.clientX, event.clientY);
      if (hit.index < 0) return;
      event.stopPropagation();
      onSelectRef.current(satellites[hit.index].id);
    };
    canvas.addEventListener("pointerdown", handlePointerDown, true);
    canvas.addEventListener("pointermove", handlePointerMove, true);
    canvas.addEventListener("pointerup", handlePointerUp, true);
    canvas.addEventListener("pointercancel", handlePointerCancel, true);
    canvas.addEventListener("click", pick, true);
    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown, true);
      canvas.removeEventListener("pointermove", handlePointerMove, true);
      canvas.removeEventListener("pointerup", handlePointerUp, true);
      canvas.removeEventListener("pointercancel", handlePointerCancel, true);
      canvas.removeEventListener("click", pick, true);
    };
  }, [camera, cameraPosition, gl, onHover, onHoverEnd, projected, satellites, visibility]);

  useFrame(() => {
    const current = snapshot.current;
    if (!current) return;
    const blend = snapshotAlpha(Date.now(), current.startMs, current.endMs);
    if (markerMaterialRef.current) markerMaterialRef.current.userData.interpolationAlpha.value = blend;
    if (highlightMaterialRef.current) highlightMaterialRef.current.userData.interpolationAlpha.value = blend;
    if (hoverMaterialRef.current) hoverMaterialRef.current.userData.interpolationAlpha.value = blend;
    if (issMaterialRef.current) issMaterialRef.current.userData.interpolationAlpha.value = blend;
    if (!selectedIdRef.current || !group.current) return;
    const index = selectedIndexRef.current;
    if (index < 0) return;
    const offset = index * 3;
    if (
      current.first[offset] ** 2 + current.first[offset + 1] ** 2 + current.first[offset + 2] ** 2 < 0.5
      || current.second[offset] ** 2 + current.second[offset + 1] ** 2 + current.second[offset + 2] ** 2 < 0.5
    ) {
      onScreenRef.current(null);
      return;
    }
    const x = current.first[offset] + (current.second[offset] - current.first[offset]) * blend;
    const y = current.first[offset + 1] + (current.second[offset + 1] - current.first[offset + 1]) * blend;
    const z = current.first[offset + 2] + (current.second[offset + 2] - current.first[offset + 2]) * blend;
    if (x * x + y * y + z * z < 0.5) {
      onScreenRef.current(null);
      return;
    }
    group.current.updateWorldMatrix(true, false);
    projected.set(x, y, z).applyMatrix4(group.current.matrixWorld);
    camera.getWorldPosition(cameraPosition);
    if (segmentHiddenByEarth(cameraPosition.x, cameraPosition.y, cameraPosition.z, projected.x, projected.y, projected.z)) {
      onScreenRef.current(null);
      return;
    }
    projected.project(camera);
    if (projected.x < -1 || projected.x > 1 || projected.y < -1 || projected.y > 1 || projected.z < -1 || projected.z > 1) {
      onScreenRef.current(null);
      return;
    }
    if (pathGeometry) updateTrajectoryAnchor(pathGeometry, x, y, z, pathMaterial);
    onScreenRef.current({ x: (projected.x + 1) * size.width * 0.5, y: (1 - projected.y) * size.height * 0.5, width: size.width, height: size.height });
  });

  return <group ref={group}>
    <points geometry={geometry} material={material} frustumCulled={false} raycast={() => null} renderOrder={2} />
    {issIndex >= 0 ? <points geometry={issGeometry} material={issMaterial} frustumCulled={false} raycast={() => null} renderOrder={2.2} /> : null}
    {hoveredId && hoveredId !== selectedId ? <points geometry={hoverGeometry} material={hoverMaterial} frustumCulled={false} raycast={() => null} renderOrder={2.5} /> : null}
    {selectedId ? <points geometry={selectedGeometry} material={selectedMaterial} frustumCulled={false} raycast={() => null} renderOrder={4} /> : null}
    {selectedId && pathGeometry ? <mesh geometry={pathGeometry.geometry} material={pathMaterial} frustumCulled={false} raycast={() => null} renderOrder={3} /> : null}
  </group>;
}
