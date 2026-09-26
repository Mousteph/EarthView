"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EarthViewHeader } from "@/shared/ui/EarthViewHeader";
import { LayerControls, type LayerControl } from "./LayerControls";
import { resolveSelection, type SelectedEvent, type SelectionData } from "./selection";
import { useMapState } from "./useMapState";
import { GlobeScene, type MapScale } from "@/globe/GlobeScene";
import type { SelectedPointScreenPosition } from "@/globe/points/PointLayer";
import { useEarthquakes } from "@/features/earthquakes/useEarthquakes";
import { useFires } from "@/features/fires/useFires";
import { composeOrbitalObjects, useOrbitalFeeds } from "@/features/orbital/useOrbitalFeeds";
import type { OrbitalMode, SelectedSatellitePosition } from "@/features/orbital/model";
import { orbitalFilterMask, orbitalFilterOptions, orbitalVisibilityMask, visibleOrbitalCount } from "@/features/orbital/filters";

export function MapView() {
  const [hasInteracted, setHasInteracted] = useState(false);
  const { earthquakesVisible, firesVisible, enabledOrbitalModes, orbitalFilters, selection,
    toggleEarthquakes: toggleEarthquakesState, toggleFires: toggleFiresState, toggleOrbitalMode,
    changeOrbitalFilter, select, clearSelection, reconcileSelection } = useMapState();
  const satellitesVisible = enabledOrbitalModes.length > 0;
  const [selectedSatellitePosition, setSelectedSatellitePosition] = useState<SelectedSatellitePosition | null>(null);
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
  const { active: satellitesData, debris: debrisData, rocketBodies: rocketBodiesData, refreshEnabled } = useOrbitalFeeds(enabledOrbitalModes);
  const { earthquakes } = earthquakesData;
  const { fires } = firesData;
  const satelliteCatalog = satellitesData.satellites;
  const orbitalObjects = useMemo(() => composeOrbitalObjects(enabledOrbitalModes, {
    active: satellitesData.satellites, debris: debrisData.satellites, rocket_bodies: rocketBodiesData.satellites,
  }), [debrisData.satellites, enabledOrbitalModes, rocketBodiesData.satellites, satellitesData.satellites]);
  const filterOptions = useMemo(() => orbitalFilterOptions(satelliteCatalog), [satelliteCatalog]);
  const visibleMask = useMemo(() => orbitalVisibilityMask(orbitalObjects, satelliteCatalog, orbitalFilters), [orbitalFilters, orbitalObjects, satelliteCatalog]);
  const satellitesLoaded = satellitesData.hasLoaded;
  const debrisLoaded = debrisData.hasLoaded;
  const rocketBodiesLoaded = rocketBodiesData.hasLoaded;
  const orbitalSummaryItems = useMemo(() => {
    return [
      { id: "active" as const, count: visibleOrbitalCount(orbitalFilterMask(satelliteCatalog, orbitalFilters)), hasLoaded: satellitesLoaded },
      { id: "debris" as const, count: debrisData.satellites.length, hasLoaded: debrisLoaded },
      { id: "rocket_bodies" as const, count: rocketBodiesData.satellites.length, hasLoaded: rocketBodiesLoaded },
    ];
  }, [debrisData.satellites.length, debrisLoaded, orbitalFilters, rocketBodiesData.satellites.length, rocketBodiesLoaded, satelliteCatalog, satellitesLoaded]);
  const selectionData: SelectionData = useMemo(() => ({
    earthquakes, fires, orbitalObjects, orbitalVisibility: visibleMask, earthquakesVisible, firesVisible,
    enabledOrbitalModes, selectedSatellitePosition,
  }), [earthquakes, fires, orbitalObjects, visibleMask, earthquakesVisible, firesVisible, enabledOrbitalModes, selectedSatellitePosition]);
  const selected: SelectedEvent | null = resolveSelection(selection, selectionData);
  useEffect(() => {
    if (!selection || selected) return;
    const timeout = window.setTimeout(() => reconcileSelection(selectionData));
    return () => window.clearTimeout(timeout);
  }, [reconcileSelection, selected, selection, selectionData]);

  const reconcile = (next: SelectionData) => {
    reconcileSelection(next);
  };

  const toggleEarthquakes = () => {
    if (!earthquakesVisible && !earthquakesData.hasLoaded && !earthquakesData.isLoading) void earthquakesData.refresh();
    reconcile({ ...selectionData, earthquakesVisible: !earthquakesVisible });
    toggleEarthquakesState();
  };
  const toggleFires = () => {
    if (!firesVisible && !firesData.hasLoaded && !firesData.isLoading) void firesData.refresh();
    reconcile({ ...selectionData, firesVisible: !firesVisible });
    toggleFiresState();
  };
  const handleOrbitalModeToggle = (mode: OrbitalMode) => {
    const nextModes = enabledOrbitalModes.includes(mode) ? enabledOrbitalModes.filter((item) => item !== mode) : [...enabledOrbitalModes, mode];
    reconcile({ ...selectionData, enabledOrbitalModes: nextModes });
    toggleOrbitalMode(mode);
  };
  const handleOrbitalFilterChange = (group: keyof typeof orbitalFilters, values: readonly string[]) => {
    const nextFilters = { ...orbitalFilters, [group]: values };
    reconcile({ ...selectionData, orbitalVisibility: orbitalVisibilityMask(orbitalObjects, satelliteCatalog, nextFilters) });
    changeOrbitalFilter(group, values);
  };
  const refreshEarthquakes = () => void earthquakesData.refresh();
  const refreshFires = () => void firesData.refresh();
  const refreshSatellites = () => void refreshEnabled();

  const handleEarthquakeSelect = useCallback((id: string) => select({ type: "earthquakes", id }), [select]);
  const handleFireSelect = useCallback((id: string) => select({ type: "fires", id }), [select]);
  const handleSatelliteSelect = useCallback((id: string) => {
    setSelectedSatellitePosition(null);
    select({ type: "satellites", id });
  }, [select]);
  const handleSelectedSatelliteData = useCallback((position: SelectedSatellitePosition | null) => {
    setSelectedSatellitePosition(position);
  }, []);

  const layers: LayerControl[] = [
    { id: "earthquakes", label: "Earthquakes", description: "Seismic activity, real time", visible: earthquakesVisible,
      hasLoaded: earthquakesData.hasLoaded, isLoading: earthquakesData.isLoading, error: earthquakesData.error,
      count: earthquakes.length, onToggle: toggleEarthquakes, onRefresh: () => void refreshEarthquakes() },
    { id: "fires", label: "Active Fires", description: "Wildfires and thermal hotspots", visible: firesVisible,
      hasLoaded: firesData.hasLoaded, isLoading: firesData.isLoading, error: firesData.error,
      count: fires.length, onToggle: toggleFires, onRefresh: () => void refreshFires() },
    { id: "satellites", label: "Satellites", description: "Objects in Earth orbit", visible: satellitesVisible,
      hasLoaded: orbitalSummaryItems.some((item) => item.hasLoaded && enabledOrbitalModes.includes(item.id)),
      isLoading: [satellitesData, debrisData, rocketBodiesData].some((data, index) => enabledOrbitalModes.includes((["active", "debris", "rocket_bodies"] as const)[index]) && data.isLoading),
      error: enabledOrbitalModes.map((mode) => mode === "active" ? satellitesData.error : mode === "debris" ? debrisData.error : rocketBodiesData.error).find(Boolean) ?? null,
      stale: enabledOrbitalModes.some((mode) => mode === "active" ? satellitesData.stale : mode === "debris" ? debrisData.stale : rocketBodiesData.stale),
      count: orbitalSummaryItems.reduce((sum, item) => sum + (item.hasLoaded && enabledOrbitalModes.includes(item.id) ? item.count : 0), 0), onRefresh: () => void refreshSatellites() },
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
      <div className="stage-title stage-title-left" aria-hidden="true">View<span>.</span></div>
      <div className="globe-canvas">
        <GlobeScene
          autoRotate={!hasInteracted}
          earthquakes={earthquakes}
          earthquakesVisible={earthquakesVisible}
          selectedEarthquakeId={selection?.type === "earthquakes" ? selection.id : null}
          fires={fires}
          firesVisible={firesVisible}
          satellites={orbitalObjects}
          satellitesVisible={satellitesVisible}
          satelliteVisibility={visibleMask}
          selectedSatelliteId={selection?.type === "satellites" && selected ? selection.id : null}
          onSatelliteSelect={handleSatelliteSelect}
          onSelectedSatelliteData={handleSelectedSatelliteData}
          selectedFireId={selection?.type === "fires" ? selection.id : null}
          onEarthquakeSelect={handleEarthquakeSelect}
          onFireSelect={handleFireSelect}
          onSelectedPositionChange={updateSelectedConnector}
          onScaleChange={handleScaleChange}
        />
      </div>
      <svg className="event-connector" ref={connectorRef} aria-hidden="true">
        <path ref={connectorPathRef} />
        <circle ref={connectorRingRef} r="13" />
      </svg>
      <EarthViewHeader />
      <LayerControls layers={layers} selected={selected} detailsRef={detailsRef} onClose={clearSelection} summaryItems={orbitalSummaryItems}
        orbitalControls={{ enabledModes: enabledOrbitalModes, onModeToggle: handleOrbitalModeToggle, filters: filterOptions,
          selectedFilters: orbitalFilters, onFilterChange: handleOrbitalFilterChange }} />
      {mapScale ? <div className="map-scale" aria-label={`Scale: ${new Intl.NumberFormat("en-US").format(mapScale.distanceKm)} kilometers`}>
        <div className="map-scale-labels" style={{ width: `${mapScale.widthPx}px` }}>
          <span>0</span><span>{new Intl.NumberFormat("en-US").format(mapScale.distanceKm / 2)}</span><span>{new Intl.NumberFormat("en-US").format(mapScale.distanceKm)} km</span>
        </div>
        <div className="map-scale-rule" style={{ width: `${mapScale.widthPx}px` }} aria-hidden="true"><i /><i /><i /></div>
      </div> : null}
    </main>
  );
}
