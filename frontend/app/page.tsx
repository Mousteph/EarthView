"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { EarthquakeControls, EarthquakeHeader } from "@/components/earthquakes/EarthquakeControls";
import { GlobeScene } from "@/components/globe/GlobeScene";
import type { SelectedEarthquakeScreenPosition } from "@/components/globe/EarthquakeLayer";
import { useEarthquakes } from "@/lib/earthquakes";

export default function Home() {
  const [hasInteracted, setHasInteracted] = useState(false);
  const [earthquakesVisible, setEarthquakesVisible] = useState(false);
  const [selectedEarthquakeId, setSelectedEarthquakeId] = useState<string | null>(null);
  const connectorRef = useRef<SVGSVGElement>(null);
  const connectorPathRef = useRef<SVGPathElement>(null);
  const connectorRingRef = useRef<SVGCircleElement>(null);
  const detailsRef = useRef<HTMLElement>(null);
  const { earthquakes, hasLoaded, isLoading, error, refresh } = useEarthquakes();
  const selectedEarthquake = useMemo(
    () => earthquakes.find((earthquake) => earthquake.id === selectedEarthquakeId) ?? null,
    [earthquakes, selectedEarthquakeId],
  );
  const selectedEarthquakeIndex = earthquakes.findIndex(
    (earthquake) => earthquake.id === selectedEarthquakeId,
  );

  const toggleEarthquakes = () => {
    if (earthquakesVisible) setSelectedEarthquakeId(null);
    setEarthquakesVisible((visible) => !visible);
  };

  const refreshEarthquakes = async () => {
    const updatedEarthquakes = await refresh();
    if (
      updatedEarthquakes
      && selectedEarthquakeId
      && !updatedEarthquakes.some((earthquake) => earthquake.id === selectedEarthquakeId)
    ) {
      setSelectedEarthquakeId(null);
    }
  };

  const updateSelectedEarthquakeConnector = useCallback((position: SelectedEarthquakeScreenPosition | null) => {
    const connector = connectorRef.current;
    const path = connectorPathRef.current;
    const ring = connectorRingRef.current;
    const details = detailsRef.current;
    if (!connector || !path || !ring || !details || !position) {
      connector?.style.setProperty("opacity", "0");
      return;
    }

    const panel = details.getBoundingClientRect();
    const panelBelowMarker = panel.top > position.y;
    const targetX = panelBelowMarker ? panel.left + panel.width * 0.5 : panel.left;
    const targetY = panelBelowMarker ? panel.top : panel.top + 24;
    const direction = Math.sign(targetX - position.x) || 1;
    const firstBendX = position.x + direction * Math.min(110, Math.abs(targetX - position.x) * 0.4);
    const finalBendX = targetX - direction * Math.min(46, Math.abs(targetX - position.x) * 0.16);

    connector.setAttribute("viewBox", `0 0 ${position.width} ${position.height}`);
    path.setAttribute("d", `M ${position.x} ${position.y} H ${firstBendX} L ${finalBendX} ${targetY} H ${targetX}`);
    ring.setAttribute("cx", String(position.x));
    ring.setAttribute("cy", String(position.y));
    connector.style.setProperty("opacity", "1");
  }, []);

  return (
    <main
      aria-label="Interactive Earth globe"
      className="earthview"
      onPointerDown={() => setHasInteracted(true)}
      onWheel={() => setHasInteracted(true)}
    >
      <div className="stage-title stage-title-behind" aria-hidden="true">Earth<br />View</div>
      <div className="globe-canvas">
        <GlobeScene
          autoRotate={!hasInteracted}
          earthquakes={earthquakes}
          earthquakesVisible={earthquakesVisible}
          selectedEarthquakeId={selectedEarthquakeId}
          onEarthquakeSelect={setSelectedEarthquakeId}
          onSelectedEarthquakePositionChange={updateSelectedEarthquakeConnector}
        />
      </div>
      <svg className="earthquake-connector" ref={connectorRef} aria-hidden="true">
        <path ref={connectorPathRef} />
        <circle ref={connectorRingRef} r="13" />
      </svg>
      <EarthquakeHeader />
      <div className="stage-footer" aria-hidden="true">Explore by touch or scroll</div>
      <EarthquakeControls
        visible={earthquakesVisible}
        hasLoaded={hasLoaded}
        isLoading={isLoading}
        error={error}
        selectedEarthquake={selectedEarthquake}
        selectedEarthquakeIndex={selectedEarthquakeIndex}
        totalEarthquakes={earthquakes.length}
        detailsRef={detailsRef}
        onToggle={toggleEarthquakes}
        onRefresh={() => void refreshEarthquakes()}
      />
    </main>
  );
}
