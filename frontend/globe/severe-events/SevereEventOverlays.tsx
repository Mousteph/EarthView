"use client";
import { useEffect, useMemo } from "react";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute, LineBasicMaterial, LineDashedMaterial, LineSegments, MeshBasicMaterial, Color } from "three";
import type { SevereEventOverlay } from "@/features/severe-events/enrichment";
import { categoryColorToken } from "@/features/severe-events/categories";
import { DESIGN_COLOR_TOKENS, readDesignColor } from "@/shared/designTokens";
import { prepareOverlayGeometry } from "@/globe/geography/geographyPreparation";

export function overlayColorToken(overlay: SevereEventOverlay) {
  if (overlay.kind === "wind-zone") return overlay.value === 120 ? DESIGN_COLOR_TOKENS.hazardWindHigh : overlay.value === 90 ? DESIGN_COLOR_TOKENS.hazardWindMedium : DESIGN_COLOR_TOKENS.hazardWindLow;
  if (overlay.kind === "uncertainty") return DESIGN_COLOR_TOKENS.hazardUncertainty;
  if (overlay.kind === "shaking") return (overlay.value ?? 0) >= 5 ? DESIGN_COLOR_TOKENS.hazardShakingHigh : DESIGN_COLOR_TOKENS.hazardShakingLow;
  const category: Record<string, string> = { TC: "cyclones", DR: "droughts", FL: "floods", WF: "wildfires", EQ: "earthquakes" };
  return categoryColorToken(category[overlay.eventId.split(":")[0]] ?? "");
}

function HazardOverlay({ overlay, selected, onSelect }: { readonly overlay: SevereEventOverlay; readonly selected: boolean; readonly onSelect: (id: string) => void }) {
  const { invalidate, camera, size } = useThree();
  const resources = useMemo(() => {
    const prepared = prepareOverlayGeometry({ type: overlay.geometryType, coordinates: overlay.coordinates } as Parameters<typeof prepareOverlayGeometry>[0], overlay.kind === "shaking" ? 1.0035 + (overlay.value ?? 0) * 0.00003 : 1.003);
    const fill = new BufferGeometry();
    fill.setAttribute("position", new Float32BufferAttribute(prepared.positions, 3));
    fill.setIndex(new Uint32BufferAttribute(prepared.indices, 1));
    fill.computeBoundingSphere();
    const lines = new BufferGeometry();
    lines.setAttribute("position", new Float32BufferAttribute(prepared.linePositions, 3));
    lines.computeBoundingSphere();
    const color = new Color(readDesignColor(overlayColorToken(overlay)));
    const fillMaterial = new MeshBasicMaterial({ color, transparent: true, opacity: overlay.kind === "wind-zone" ? 0.20 : overlay.kind === "uncertainty" ? 0.07 : selected ? 0.18 : 0.11, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1 });
    const lineMaterial = overlay.forecast
      ? new LineDashedMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, dashSize: 0.008, gapSize: 0.004 })
      : new LineBasicMaterial({ color, transparent: true, opacity: overlay.kind === "track" || overlay.kind === "wind-zone" || selected ? 0.95 : 0.55, depthWrite: false });
    const line = new LineSegments(lines, lineMaterial);
    line.computeLineDistances();
    const nativeRaycast = line.raycast;
    line.raycast = function(raycaster, intersections) {
      const previous = raycaster.params.Line.threshold;
      // A six-pixel target; Three's default one-world-unit threshold covers most of Earth.
      const fieldOfView = "fov" in camera ? Number(camera.fov) : 30;
      raycaster.params.Line.threshold = 12 * Math.max(0.15, camera.position.length() - 1) * Math.tan(fieldOfView * Math.PI / 360) / size.height;
      try { nativeRaycast.call(this, raycaster, intersections); } finally { raycaster.params.Line.threshold = previous; }
    };
    return { fill, lines, fillMaterial, lineMaterial, line };
  }, [overlay, selected, camera, size.height]);
  useEffect(() => { invalidate(); return () => { resources.fill.dispose(); resources.lines.dispose(); resources.fillMaterial.dispose(); resources.lineMaterial.dispose(); }; }, [resources, invalidate]);
  const select = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 5 || event.point.dot(camera.position.clone().sub(event.point)) <= 0) return;
    event.stopPropagation();
    onSelect(overlay.eventId);
  };
  return <group>
    {overlay.kind !== "shaking" && resources.fill.getAttribute("position").count > 0 ? <mesh geometry={resources.fill} material={resources.fillMaterial} onClick={select} renderOrder={1.5} /> : null}
    <primitive object={resources.line} onClick={select} renderOrder={2} />
  </group>;
}
export function SevereEventOverlays({ overlays, selectedId, onSelect }: { readonly overlays: readonly SevereEventOverlay[]; readonly selectedId: string | null; readonly onSelect: (id: string) => void }) {
  return <group>{overlays.map((overlay, index) => <HazardOverlay key={`${overlay.eventId}:${overlay.kind}:${index}`} overlay={overlay} selected={overlay.eventId === selectedId} onSelect={onSelect} />)}</group>;
}
