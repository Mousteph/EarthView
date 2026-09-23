"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { EarthViewHeader, LayerControls, type LayerControl, type SelectedEvent } from "@/components/data/LayerControls";
import { GlobeScene, type MapScale, type ZoomApi } from "@/components/globe/GlobeScene";
import type { SelectedPointScreenPosition } from "@/components/globe/PointLayer";
import { useEarthquakes } from "@/lib/earthquakes";
import { useFires } from "@/lib/fires";

export default function Home() {
  const [hasInteracted, setHasInteracted] = useState(false);
  const [earthquakesVisible, setEarthquakesVisible] = useState(false);
  const [firesVisible, setFiresVisible] = useState(false);
  const [selection, setSelection] = useState<{ type: "earthquakes" | "fires"; id: string } | null>(null);
  const [zoomApi, setZoomApi] = useState<ZoomApi | null>(null);
  const [mapScale, setMapScale] = useState<MapScale | null>(null);
  const handleScaleChange = useCallback((scale: MapScale) => {
    setMapScale((current) => current && current.distanceKm === scale.distanceKm && Math.abs(current.widthPx - scale.widthPx) < 0.5 ? current : scale);
  }, []);
  const connectorRef = useRef<SVGSVGElement>(null);
  const connectorPathRef = useRef<SVGPathElement>(null);
  const connectorRingRef = useRef<SVGCircleElement>(null);
  const detailsRef = useRef<HTMLElement>(null);
  const earthquakesData = useEarthquakes();
  const firesData = useFires();
  const { earthquakes } = earthquakesData;
  const { fires } = firesData;
  const selected = useMemo((): SelectedEvent | null => {
    if (!selection) return null;
    if (selection.type === "earthquakes") {
      const index = earthquakes.findIndex((event) => event.id === selection.id);
      return index < 0 ? null : { type: "earthquakes", event: earthquakes[index], index, total: earthquakes.length };
    }
    const index = fires.findIndex((event) => event.id === selection.id);
    return index < 0 ? null : { type: "fires", event: fires[index], index, total: fires.length };
  }, [earthquakes, fires, selection]);

  const toggleEarthquakes = () => {
    if (earthquakesVisible && selection?.type === "earthquakes") setSelection(null);
    if (!earthquakesVisible && !earthquakesData.hasLoaded && !earthquakesData.isLoading) void earthquakesData.refresh();
    setEarthquakesVisible((visible) => !visible);
  };

  const toggleFires = () => {
    if (firesVisible && selection?.type === "fires") setSelection(null);
    if (!firesVisible && !firesData.hasLoaded && !firesData.isLoading) void firesData.refresh();
    setFiresVisible((visible) => !visible);
  };

  const refreshEarthquakes = async () => {
    const updatedEarthquakes = await earthquakesData.refresh();
    if (
      updatedEarthquakes
      && selection?.type === "earthquakes"
      && !updatedEarthquakes.some((earthquake) => earthquake.id === selection.id)
    ) {
      setSelection((current) => current?.type === "earthquakes" && current.id === selection.id ? null : current);
    }
  };

  const refreshFires = async () => {
    const updatedFires = await firesData.refresh();
    if (updatedFires && selection?.type === "fires" && !updatedFires.some((fire) => fire.id === selection.id)) {
      setSelection((current) => current?.type === "fires" && current.id === selection.id ? null : current);
    }
  };

  const layers: LayerControl[] = [
    { id: "earthquakes", label: "Earthquakes", description: "Seismic activity, real time", countLabel: "earthquake", visible: earthquakesVisible,
      hasLoaded: earthquakesData.hasLoaded, isLoading: earthquakesData.isLoading, error: earthquakesData.error,
      count: earthquakes.length, onToggle: toggleEarthquakes, onRefresh: () => void refreshEarthquakes() },
    { id: "fires", label: "Active Fires", description: "Wildfires and thermal hotspots", countLabel: "active fire", visible: firesVisible,
      hasLoaded: firesData.hasLoaded, isLoading: firesData.isLoading, error: firesData.error,
      count: fires.length, onToggle: toggleFires, onRefresh: () => void refreshFires() },
  ];

  const updateSelectedConnector = useCallback((position: SelectedPointScreenPosition | null) => {
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
      <div className="stage-title stage-title-left" aria-hidden="true">Earth<br />View</div>
      <div className="globe-canvas">
        <GlobeScene
          autoRotate={!hasInteracted}
          earthquakes={earthquakes}
          earthquakesVisible={earthquakesVisible}
          selectedEarthquakeId={selection?.type === "earthquakes" ? selection.id : null}
          fires={fires}
          firesVisible={firesVisible}
          selectedFireId={selection?.type === "fires" ? selection.id : null}
          onEarthquakeSelect={(id) => setSelection({ type: "earthquakes", id })}
          onFireSelect={(id) => setSelection({ type: "fires", id })}
          onSelectedPositionChange={updateSelectedConnector}
          onZoomApiChange={setZoomApi}
          onScaleChange={handleScaleChange}
        />
      </div>
      <svg className="event-connector" ref={connectorRef} aria-hidden="true">
        <path ref={connectorPathRef} />
        <circle ref={connectorRingRef} r="13" />
      </svg>
      <EarthViewHeader />
      <LayerControls layers={layers} selected={selected} detailsRef={detailsRef} onClose={() => setSelection(null)} />
      <div className="map-zoom-controls" aria-label="Map zoom controls">
        <button type="button" onClick={() => { setHasInteracted(true); zoomApi?.zoomIn(); }} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => { setHasInteracted(true); zoomApi?.zoomOut(); }} aria-label="Zoom out">−</button>
      </div>
      {mapScale ? <div className="map-scale" aria-label={`Scale: ${new Intl.NumberFormat("en-US").format(mapScale.distanceKm)} kilometers`}>
        <div className="map-scale-labels" style={{ width: `${mapScale.widthPx}px` }}>
          <span>0</span><span>{new Intl.NumberFormat("en-US").format(mapScale.distanceKm / 2)}</span><span>{new Intl.NumberFormat("en-US").format(mapScale.distanceKm)} km</span>
        </div>
        <div className="map-scale-rule" style={{ width: `${mapScale.widthPx}px` }} aria-hidden="true"><i /><i /><i /></div>
      </div> : null}
    </main>
  );
}
