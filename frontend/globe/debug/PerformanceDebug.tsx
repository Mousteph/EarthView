"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { BufferGeometry, Material } from "three";

export type PerformanceSnapshot = {
  fps: number;
  frameTime: number;
  drawCalls: number;
  triangles: number;
  lines: number;
  points: number;
  objects: number;
  geometries: number;
  materials: number;
  textures: number;
  vertices: number;
  activeLod: "10m" | "50m";
  dpr: number;
  canvasWidth: number;
  canvasHeight: number;
  cameraDistance: number;
  cameraNear: number;
  cameraFar: number;
  geographyBuildTime: number;
  sourceVertices: number;
  satelliteCount: number;
  satelliteWorkerMs: number;
  satelliteWorkerP50Ms: number;
  satelliteWorkerP95Ms: number;
  satelliteWorkerSamples: number;
  satelliteWorkerInitMs: number;
  satelliteWorkerInitP95Ms: number;
  satelliteWorkerInits: number;
  satelliteFeedTimings: string;
  jsHeapUsedMB: number;
};

declare global {
  interface Window {
    __EARTHVIEW_PERFORMANCE__?: PerformanceSnapshot;
  }
}

type PerformanceProbeProps = {
  activeLod: PerformanceSnapshot["activeLod"];
  onSample: (snapshot: PerformanceSnapshot) => void;
};

export function PerformanceProbe({ activeLod, onSample }: PerformanceProbeProps) {
  const { camera, gl, invalidate, scene } = useThree();
  const sample = useRef({ frames: 0, startedAt: 0 });

  useEffect(() => {
    sample.current = { frames: 0, startedAt: performance.now() - 500 };
    invalidate();
    const scheduledFrame = requestAnimationFrame(() => invalidate());
    return () => cancelAnimationFrame(scheduledFrame);
  }, [activeLod, invalidate]);

  useFrame(() => {
    const now = performance.now();
    if (sample.current.startedAt === 0) sample.current.startedAt = now;
    sample.current.frames += 1;
    const elapsed = now - sample.current.startedAt;

    if (elapsed < 500) return;

    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    let objects = 0;
    let vertices = 0;

    scene.traverse((object) => {
      objects += 1;
      const geometry = (object as { geometry?: BufferGeometry }).geometry;
      if (geometry) geometries.add(geometry);
      const objectMaterial = (object as { material?: Material | Material[] }).material;
      const objectMaterials = Array.isArray(objectMaterial) ? objectMaterial : [objectMaterial];

      for (const material of objectMaterials) {
        if (!material) continue;
        materials.add(material);
      }
    });

    for (const geometry of geometries) vertices += geometry.getAttribute("position")?.count ?? 0;

    const fps = (sample.current.frames * 1000) / elapsed;
    const satelliteMetrics = window.__EARTHVIEW_SATELLITES__;
    const feedTimings = (["active", "debris", "rocket_bodies"] as const).map((mode) => {
      const feed = satelliteMetrics?.feeds[mode];
      if (!feed) return `${mode}: awaiting request`;
      return `${mode} request ${feed.request.p50Ms.toFixed(1)}/${feed.request.p95Ms.toFixed(1)}ms, body+JSON ${feed.bodyAndJson.p50Ms.toFixed(1)}/${feed.bodyAndJson.p95Ms.toFixed(1)}ms, validation ${feed.validation.p50Ms.toFixed(1)}/${feed.validation.p95Ms.toFixed(1)}ms (${feed.request.samples} samples)`;
    }).join(" | ");
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
    const snapshot: PerformanceSnapshot = {
      fps,
      frameTime: 1000 / fps,
      drawCalls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      lines: gl.info.render.lines,
      points: gl.info.render.points,
      objects,
      geometries: gl.info.memory.geometries,
      materials: materials.size,
      textures: gl.info.memory.textures,
      vertices,
      activeLod,
      dpr: gl.getPixelRatio(),
      canvasWidth: gl.domElement.width,
      canvasHeight: gl.domElement.height,
      cameraDistance: camera.position.length(),
      cameraNear: camera.near,
      cameraFar: camera.far,
      geographyBuildTime: window.__EARTHVIEW_GEOGRAPHY__?.[activeLod]?.buildMilliseconds ?? 0,
      sourceVertices: window.__EARTHVIEW_GEOGRAPHY__?.[activeLod]?.sourceVertices ?? 0,
      satelliteCount: satelliteMetrics?.count ?? 0,
      satelliteWorkerMs: satelliteMetrics?.workerCalculation.latestMs ?? 0,
      satelliteWorkerP50Ms: satelliteMetrics?.workerCalculation.p50Ms ?? 0,
      satelliteWorkerP95Ms: satelliteMetrics?.workerCalculation.p95Ms ?? 0,
      satelliteWorkerSamples: satelliteMetrics?.workerCalculation.samples ?? 0,
      satelliteWorkerInitMs: satelliteMetrics?.workerInitialization.latestMs ?? 0,
      satelliteWorkerInitP95Ms: satelliteMetrics?.workerInitialization.p95Ms ?? 0,
      satelliteWorkerInits: satelliteMetrics?.workerInitCount ?? 0,
      satelliteFeedTimings: feedTimings,
      jsHeapUsedMB: heap / (1024 * 1024),
    };

    window.__EARTHVIEW_PERFORMANCE__ = snapshot;
    onSample(snapshot);
    sample.current = { frames: 0, startedAt: now };
  });

  return null;
}

export function PerformancePanel({ snapshot }: { readonly snapshot: PerformanceSnapshot | null }) {
  if (!snapshot) return null;

  return (
    <output className="performance-debug" data-earthview-performance>
      {Object.entries(snapshot).map(([label, value]) => (
        <span key={label}>
          {label}: {typeof value === "number" ? Number(value.toFixed(2)) : value}
        </span>
      ))}
    </output>
  );
}

export function usePerformanceDebugEnabled() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const explicitlyEnabled = new URLSearchParams(window.location.search).get("debug") === "1";
      const buildEnabled = process.env.NODE_ENV !== "production"
        || process.env.NEXT_PUBLIC_EARTHVIEW_DEBUG === "1";
      setEnabled(buildEnabled && explicitlyEnabled);
    });

    return () => window.clearTimeout(timeout);
  }, []);

  return enabled;
}
