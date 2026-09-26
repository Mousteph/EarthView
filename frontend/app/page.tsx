"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { EarthViewHeader, LayerControls, type LayerControl, type SelectedEvent } from "@/components/data/LayerControls";
import { GlobeScene, type MapScale } from "@/components/globe/GlobeScene";
import type { SelectedPointScreenPosition } from "@/components/globe/PointLayer";
import { useEarthquakes } from "@/lib/earthquakes";
import { useFires } from "@/lib/fires";
import { useSatellites, type OrbitalMode, type OrbitalObject, type Satellite, type SelectedSatellitePosition } from "@/lib/satellites";
import { EMPTY_ORBITAL_FILTERS, orbitalFilterMask, orbitalFilterOptions, visibleOrbitalCount, type OrbitalFilterGroup, type OrbitalFilters } from "@/lib/orbitalFilters";

export default function Home() {
  const [hasInteracted, setHasInteracted] = useState(false);
  const [earthquakesVisible, setEarthquakesVisible] = useState(false);
  const [firesVisible, setFiresVisible] = useState(false);
  const [enabledOrbitalModes, setEnabledOrbitalModes] = useState<readonly OrbitalMode[]>([]);
  const satellitesVisible = enabledOrbitalModes.length > 0;
  const [orbitalFilters, setOrbitalFilters] = useState<OrbitalFilters>(EMPTY_ORBITAL_FILTERS);
  const [selection, setSelection] = useState<{ type: "earthquakes" | "fires" | "satellites"; id: string } | null>(null);
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
  const satellitesData = useSatellites(enabledOrbitalModes.includes("active"), "active");
  const debrisData = useSatellites(enabledOrbitalModes.includes("debris"), "debris");
  const rocketBodiesData = useSatellites(enabledOrbitalModes.includes("rocket_bodies"), "rocket_bodies");
  const { earthquakes } = earthquakesData;
  const { fires } = firesData;
  const satelliteCatalog = satellitesData.satellites;
  const orbitalObjects = useMemo(() => {
    const objects: OrbitalObject[] = [];
    const seenIds = new Set<string>();
    const addCatalog = (mode: OrbitalMode, catalog: readonly Satellite[]) => {
      if (!enabledOrbitalModes.includes(mode)) return;
      for (const satellite of catalog) {
        if (seenIds.has(satellite.id)) continue;
        seenIds.add(satellite.id);
        objects.push({ ...satellite, orbitalMode: mode });
      }
    };
    addCatalog("active", satellitesData.satellites);
    addCatalog("debris", debrisData.satellites);
    addCatalog("rocket_bodies", rocketBodiesData.satellites);
    return objects;
  }, [debrisData.satellites, enabledOrbitalModes, rocketBodiesData.satellites, satellitesData.satellites]);
  const filterOptions = useMemo(() => orbitalFilterOptions(satelliteCatalog), [satelliteCatalog]);
  const visibleMask = useMemo(() => {
    const satelliteMask = orbitalFilterMask(satelliteCatalog, orbitalFilters);
    const satelliteIndexes = new Map(satelliteCatalog.map((satellite, index) => [satellite.id, index]));
    return Uint8Array.from(orbitalObjects, (object) => object.orbitalMode === "active"
      ? satelliteMask[satelliteIndexes.get(object.id) ?? -1] ?? 0
      : 1);
  }, [orbitalFilters, orbitalObjects, satelliteCatalog]);
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
  const selected = useMemo((): SelectedEvent | null => {
    if (!selection) return null;
    if (selection.type === "earthquakes") {
      const index = earthquakes.findIndex((event) => event.id === selection.id);
      return index < 0 ? null : { type: "earthquakes", event: earthquakes[index], index, total: earthquakes.length };
    }
    if (selection.type === "satellites") {
      const satellite = orbitalObjects.find((item) => item.id === selection.id);
      return satellite ? { type: "satellites", mode: satellite.orbitalMode, event: satellite, position: selectedSatellitePosition } : null;
    }
    const index = fires.findIndex((event) => event.id === selection.id);
    return index < 0 ? null : { type: "fires", event: fires[index], index, total: fires.length };
  }, [earthquakes, fires, orbitalObjects, selectedSatellitePosition, selection]);

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

  const toggleOrbitalMode = (mode: OrbitalMode) => {
    const isEnabled = enabledOrbitalModes.includes(mode);
    if (isEnabled && selection?.type === "satellites" && orbitalObjects.some((object) => object.id === selection.id && object.orbitalMode === mode)) {
      setSelection(null);
      setSelectedSatellitePosition(null);
    }
    setEnabledOrbitalModes((current) => isEnabled ? current.filter((item) => item !== mode) : [...current, mode]);
  };

  const changeOrbitalFilter = (group: OrbitalFilterGroup, values: readonly string[]) => {
    const next = { ...orbitalFilters, [group]: values };
    if (selection?.type === "satellites" && orbitalObjects.some((object) => object.id === selection.id && object.orbitalMode === "active")) {
      const index = satelliteCatalog.findIndex((satellite) => satellite.id === selection.id);
      if (index < 0 || !orbitalFilterMask(satelliteCatalog, next)[index]) {
        setSelection(null);
        setSelectedSatellitePosition(null);
      }
    }
    setOrbitalFilters(next);
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

  const refreshSatellites = async () => {
    const refreshes: Partial<Record<OrbitalMode, Awaited<ReturnType<typeof satellitesData.refresh>>>> = {};
    const results = await Promise.all(enabledOrbitalModes.map(async (mode) => {
      const data = mode === "active" ? satellitesData : mode === "debris" ? debrisData : rocketBodiesData;
      return [mode, await data.refresh()] as const;
    }));
    for (const [mode, result] of results) refreshes[mode] = result;
    if (selection?.type === "satellites") {
      const selectedMode = orbitalObjects.find((object) => object.id === selection.id)?.orbitalMode;
      const updatedCatalog = selectedMode ? refreshes[selectedMode]?.satellites : null;
      if (updatedCatalog) {
        const index = updatedCatalog.findIndex((satellite) => satellite.id === selection.id);
        if (index < 0 || (selectedMode === "active" && !orbitalFilterMask(updatedCatalog, orbitalFilters)[index])) {
          setSelection((current) => current?.type === "satellites" && current.id === selection.id ? null : current);
          setSelectedSatellitePosition(null);
        }
      }
    }
  };

  const handleEarthquakeSelect = useCallback((id: string) => setSelection({ type: "earthquakes", id }), []);
  const handleFireSelect = useCallback((id: string) => setSelection({ type: "fires", id }), []);
  const handleSatelliteSelect = useCallback((id: string) => {
    setSelectedSatellitePosition(null);
    setSelection({ type: "satellites", id });
  }, []);
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
      count: orbitalSummaryItems.reduce((sum, item) => sum + (item.hasLoaded && enabledOrbitalModes.includes(item.id) ? item.count : 0), 0), onToggle: () => {}, onRefresh: () => void refreshSatellites() },
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
      <LayerControls layers={layers} selected={selected} detailsRef={detailsRef} onClose={() => setSelection(null)} summaryItems={orbitalSummaryItems}
        orbitalControls={{ enabledModes: enabledOrbitalModes, onModeToggle: toggleOrbitalMode, filters: filterOptions,
          selectedFilters: orbitalFilters, onFilterChange: changeOrbitalFilter }} />
      {mapScale ? <div className="map-scale" aria-label={`Scale: ${new Intl.NumberFormat("en-US").format(mapScale.distanceKm)} kilometers`}>
        <div className="map-scale-labels" style={{ width: `${mapScale.widthPx}px` }}>
          <span>0</span><span>{new Intl.NumberFormat("en-US").format(mapScale.distanceKm / 2)}</span><span>{new Intl.NumberFormat("en-US").format(mapScale.distanceKm)} km</span>
        </div>
        <div className="map-scale-rule" style={{ width: `${mapScale.widthPx}px` }} aria-hidden="true"><i /><i /><i /></div>
      </div> : null}
    </main>
  );
}
