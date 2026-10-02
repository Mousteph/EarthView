"use client";

import { Html } from "@react-three/drei";
import { useFrame, useThree as useFiberThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Vector3, type Group } from "three";
import { geoToVector3 } from "../geo";
import { ScreenSpatialIndex, type ScreenSpatialSnapshot } from "../interaction/ScreenSpatialIndex";
import {
  isLabelEligible,
  labelOpacityForFacing,
  labelZoom,
  selectNonOverlappingLabels,
  type GeoLabelRecord,
  type ProjectedGeoLabel,
} from "./labelMath";
import styles from "./GeographicLabels.module.css";

type GeographicLabelsProps = {
  readonly visible: boolean;
  readonly globe: RefObject<Group | null>;
};

type LabelAsset = {
  readonly countries: readonly GeoLabelRecord[];
  readonly cities: readonly GeoLabelRecord[];
};

const ASSET_PATH = "/data/natural-earth/earth-labels.json";
const LABEL_RADIUS = 1.004;

export function GeographicLabels({ visible, globe }: GeographicLabelsProps) {
  const [asset, setAsset] = useState<LabelAsset | null>(null);
  const [visibleLabels, setVisibleLabels] = useState<readonly ProjectedGeoLabel[]>([]);
  const camera = useFiberThree((state) => state.camera);
  const size = useFiberThree((state) => state.size);
  const spatialIndex = useMemo(() => new ScreenSpatialIndex(32), []);
  const indexSource = useMemo(() => ({ asset, visible }), [asset, visible]);
  const candidatePositions = useMemo(() => {
    if (!asset) return [];
    return [...asset.countries, ...asset.cities].map((record) => ({
      record,
      position: geoToVector3([record.longitude, record.latitude], LABEL_RADIUS),
    }));
  }, [asset]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(ASSET_PATH, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Geographic labels are unavailable");
        return response.json() as Promise<LabelAsset>;
      })
      .then(setAsset)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useFrame(() => {
    if (!visible) return;
    const group = globe.current;
    if (!asset || !group) return;
    group.updateWorldMatrix(true, false);
    camera.updateMatrixWorld();
    const cameraDistance = camera.position.length();
    const snapshot: ScreenSpatialSnapshot = {
      width: size.width,
      height: size.height,
      cameraWorld: camera.matrixWorld.elements,
      cameraProjection: camera.projectionMatrix.elements,
      objectWorld: group.matrixWorld.elements,
      cameraDistance,
      source: indexSource,
    };
    if (!spatialIndex.isStale(snapshot)) return;
    spatialIndex.reset(snapshot);

    const zoom = labelZoom(cameraDistance);
    const projected: ProjectedGeoLabel[] = [];
    const cameraPosition = camera.getWorldPosition(new Vector3());
    const worldPosition = new Vector3();
    const surfaceNormal = new Vector3();
    const cameraDirection = new Vector3();
    const screenPosition = new Vector3();

    for (const item of candidatePositions) {
      if (!isLabelEligible(item.record, zoom)) continue;
      worldPosition.copy(item.position).applyMatrix4(group.matrixWorld);
      surfaceNormal.copy(worldPosition).normalize();
      cameraDirection.copy(cameraPosition).sub(worldPosition).normalize();
      const facing = surfaceNormal.dot(cameraDirection);
      const opacity = labelOpacityForFacing(facing);
      if (opacity <= 0) continue;

      const screen = screenPosition.copy(worldPosition).project(camera);
      if (screen.z < -1 || screen.z > 1) continue;
      const fontSize = item.record.kind === "country" ? 11 : 9;
      const text = item.record.kind === "country" ? item.record.name.toLocaleUpperCase() : item.record.name;
      projected.push({
        record: item.record,
        x: (screen.x * 0.5 + 0.5) * size.width,
        y: (0.5 - screen.y * 0.5) * size.height,
        opacity,
        width: Math.max(16, text.length * fontSize * 0.58),
        height: fontSize + 4,
      });
    }

    const next = selectNonOverlappingLabels(projected, size.width, size.height);
    setVisibleLabels((current) => {
      if (current.length === next.length && current.every((label, index) =>
        label.record.id === next[index].record.id && Math.abs(label.opacity - next[index].opacity) < 0.12,
      )) return current;
      return next;
    });
  });

  if (!visible) return null;

  return <>
    {visibleLabels.map((label) => {
      const text = label.record.kind === "country" ? label.record.name.toLocaleUpperCase() : label.record.name;
      return <Html
        key={label.record.id}
        position={[...geoToVector3([label.record.longitude, label.record.latitude], LABEL_RADIUS).toArray()]}
        center
        zIndexRange={[4, 1]}
        style={{ opacity: label.opacity * 0.86 }}
        pointerEvents="none"
      >
        <span className={`${styles.label} ${label.record.kind === "country" ? styles.country : styles.city}`}>
          {text}
        </span>
      </Html>;
    })}
  </>;
}
