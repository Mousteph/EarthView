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
import type { OrbitalObject, SelectedSatellitePosition } from "@/lib/satellites";
import { segmentHiddenByEarth, snapshotAlpha } from "@/lib/satelliteMath";
import { orbitalObjectColor } from "@/lib/orbitalColors";
import type { SelectedPointScreenPosition } from "./PointLayer";
import type { OrbitalElements, SatelliteWorkerInput, SatelliteWorkerOutput } from "./satelliteProtocol";

type SatelliteLayerProps = {
  readonly satellites: readonly OrbitalObject[];
  readonly visibility: Uint8Array | null;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly onSelectedData: (position: SelectedSatellitePosition | null) => void;
  readonly onSelectedPositionChange: (position: SelectedPointScreenPosition | null) => void;
};

type Snapshot = { first: Float32Array; second: Float32Array; startMs: number; endMs: number };

const pointColors = new Map<string, Color>();
const DEFAULT_SATELLITE_COLOR = new Color("#587b83");

function colorForObject(satellite: OrbitalObject): Color {
  const color = orbitalObjectColor(satellite);
  let resolved = pointColors.get(color);
  if (!resolved) {
    resolved = new Color(color);
    pointColors.set(color, resolved);
  }
  return resolved;
}

function createGeometry(count: number, satellites?: readonly OrbitalObject[]) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute("futurePosition", new BufferAttribute(new Float32Array(count * 3), 3));
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const color = satellites ? colorForObject(satellites[index]) : DEFAULT_SATELLITE_COLOR;
    color.toArray(colors, index * 3);
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  const filterVisible = new Float32Array(count);
  filterVisible.fill(1);
  geometry.setAttribute("filterVisible", new BufferAttribute(filterVisible, 1));
  return geometry;
}

function createMaterial(color: string, size: number, selected: boolean) {
  const material = new PointsMaterial({ color, size, sizeAttenuation: false, depthTest: true, depthWrite: false, transparent: true, opacity: selected ? 0.82 : 0.83, vertexColors: !selected });
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
        ${selected ? "if (radius > 0.5 || (radius < 0.29 && radius > 0.17)) discard;" : "if (radius > 0.5) discard;"}`);
  };
  material.customProgramCacheKey = () => `earthview-satellite-${selected ? "selected" : "points"}-v1`;
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

export function SatelliteLayer({ satellites, visibility, selectedId, onSelect, onSelectedData, onSelectedPositionChange }: SatelliteLayerProps) {
  const { camera, gl, invalidate, size } = useThree();
  const group = useRef<Group>(null);
  const worker = useRef<Worker | null>(null);
  const workerInitCount = useRef(0);
  const snapshot = useRef<Snapshot | null>(null);
  const selectedIdRef = useRef(selectedId);
  const selectedIndexRef = useRef(-1);
  const onSelectRef = useRef(onSelect);
  const onDataRef = useRef(onSelectedData);
  const onScreenRef = useRef(onSelectedPositionChange);
  const markerMaterialRef = useRef<PointsMaterial | null>(null);
  const highlightMaterialRef = useRef<PointsMaterial | null>(null);
  const projected = useMemo(() => new Vector3(), []);
  const cameraPosition = useMemo(() => new Vector3(), []);
  const geometry = useMemo(() => createGeometry(satellites.length, satellites), [satellites]);
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
  const material = useMemo(() => createMaterial("#ffffff", 3.4, false), []);
  const selectedMaterial = useMemo(() => createMaterial("#587b83", 12, true), []);
  const pathMaterial = useMemo(() => new MeshBasicMaterial({ color: "#587b83", transparent: true, opacity: 0.82, depthTest: true, depthWrite: false }), []);
  const [path, setPath] = useState<{ id: string; positions: Float32Array } | null>(null);
  const selectedIndex = useMemo(() => satellites.findIndex((satellite) => satellite.id === selectedId), [satellites, selectedId]);
  const pathGeometry = useMemo(() => path && path.id === selectedId ? (() => {
    const points = Array.from({ length: path.positions.length / 3 }, (_, index) => new Vector3(
      path.positions[index * 3], path.positions[index * 3 + 1], path.positions[index * 3 + 2],
    ));
    return new TubeGeometry(new CatmullRomCurve3(points, true), points.length * 2, 0.0028, 5, true);
  })() : null, [path, selectedId]);

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { selectedIndexRef.current = selectedIndex; }, [selectedIndex]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onDataRef.current = onSelectedData; }, [onSelectedData]);
  useEffect(() => { onScreenRef.current = onSelectedPositionChange; }, [onSelectedPositionChange]);
  useEffect(() => { markerMaterialRef.current = material; }, [material]);
  useEffect(() => { highlightMaterialRef.current = selectedMaterial; }, [selectedMaterial]);
  useEffect(() => {
    const selectedObject = selectedIndex >= 0 ? satellites[selectedIndex] : null;
    const color = selectedObject ? colorForObject(selectedObject) : DEFAULT_SATELLITE_COLOR;
    pathMaterial.color.copy(color);
    selectedMaterial.color.copy(color);
    invalidate();
  }, [invalidate, pathMaterial, satellites, selectedIndex, selectedMaterial]);

  useEffect(() => {
    const attribute = geometry.getAttribute("filterVisible") as BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let index = 0; index < satellites.length; index += 1) array[index] = visibility?.[index] ?? 1;
    attribute.needsUpdate = true;
    invalidate();
  }, [geometry, invalidate, satellites, visibility]);

  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => selectedGeometry.dispose(), [selectedGeometry]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => selectedMaterial.dispose(), [selectedMaterial]);
  useEffect(() => () => pathMaterial.dispose(), [pathMaterial]);
  useEffect(() => () => pathGeometry?.dispose(), [pathGeometry]);

  useEffect(() => {
    if (satellites.length === 0) return;
    workerInitCount.current += 1;
    const orbitWorker = new Worker(new URL("./satellite.worker.ts", import.meta.url), { type: "module" });
    worker.current = orbitWorker;
    orbitWorker.addEventListener("message", (event: MessageEvent<SatelliteWorkerOutput>) => {
      const message = event.data;
      if (message.type === "snapshot") {
        const first = message.first ?? snapshot.current?.second;
        if (!first) return;
        snapshot.current = { first, second: message.second, startMs: message.startMs, endMs: message.endMs };
        setGeometryPositions(geometry, first, message.second);
        const index = selectedIndexRef.current;
        if (index >= 0) {
          const offset = index * 3;
          setGeometryPositions(selectedGeometry, first.subarray(offset, offset + 3), message.second.subarray(offset, offset + 3));
        }
        if (new URLSearchParams(window.location.search).get("debug") === "1") window.__EARTHVIEW_SATELLITES__ = { count: satellites.length, workerCalculationMs: message.calculationMs, workerInitCount: workerInitCount.current };
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
      delete window.__EARTHVIEW_SATELLITES__;
      onDataRef.current(null);
      onScreenRef.current(null);
    };
  }, [geometry, invalidate, orbitElements, satellites.length, selectedGeometry]);

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
    const canvas = gl.domElement;
    const pick = (event: MouseEvent) => {
      if (!group.current || !snapshot.current) return;
      const bounds = canvas.getBoundingClientRect();
      const clickX = event.clientX - bounds.left;
      const clickY = event.clientY - bounds.top;
      const { first, second, startMs, endMs } = snapshot.current;
      const blend = snapshotAlpha(Date.now(), startMs, endMs);
      camera.getWorldPosition(cameraPosition);
      group.current.updateWorldMatrix(true, false);
      let bestIndex = -1;
      let bestDistance = Infinity;
      let bestDepth = Infinity;
      for (let index = 0; index < satellites.length; index += 1) {
        if (visibility && !visibility[index]) continue;
        const offset = index * 3;
        if (
          first[offset] ** 2 + first[offset + 1] ** 2 + first[offset + 2] ** 2 < 0.5
          || second[offset] ** 2 + second[offset + 1] ** 2 + second[offset + 2] ** 2 < 0.5
        ) continue;
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
        const distance = (screenX - clickX) ** 2 + (screenY - clickY) ** 2;
        if (distance <= 64 && (distance < bestDistance || (distance === bestDistance && depth < bestDepth))) {
          bestIndex = index;
          bestDistance = distance;
          bestDepth = depth;
        }
      }
      if (bestIndex < 0) return;
      event.stopPropagation();
      onSelectRef.current(satellites[bestIndex].id);
    };
    canvas.addEventListener("click", pick, true);
    return () => canvas.removeEventListener("click", pick, true);
  }, [camera, cameraPosition, gl, projected, satellites, visibility]);

  useFrame(() => {
    const current = snapshot.current;
    if (!current) return;
    const blend = snapshotAlpha(Date.now(), current.startMs, current.endMs);
    if (markerMaterialRef.current) markerMaterialRef.current.userData.interpolationAlpha.value = blend;
    if (highlightMaterialRef.current) highlightMaterialRef.current.userData.interpolationAlpha.value = blend;
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
    onScreenRef.current({ x: (projected.x + 1) * size.width * 0.5, y: (1 - projected.y) * size.height * 0.5, width: size.width, height: size.height });
  });

  return <group ref={group}>
    <points geometry={geometry} material={material} frustumCulled={false} raycast={() => null} renderOrder={2} />
    {selectedId ? <points geometry={selectedGeometry} material={selectedMaterial} frustumCulled={false} raycast={() => null} renderOrder={4} /> : null}
    {selectedId && pathGeometry ? <mesh geometry={pathGeometry} material={pathMaterial} frustumCulled={false} raycast={() => null} renderOrder={3} /> : null}
  </group>;
}

declare global {
  interface Window {
    __EARTHVIEW_SATELLITES__?: { count: number; workerCalculationMs: number; workerInitCount: number };
  }
}
