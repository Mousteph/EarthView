"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { EarthViewHeader } from "@/shared/ui/EarthViewHeader";
import { LayerControls, type LayerControl } from "./LayerControls";
import { resolveSelection, type SelectedEvent, type SelectionData } from "./selection";
import { resolveHoverTooltip, type HoverData, type HoverKey } from "./hover";
import { useMapState } from "./useMapState";
import { useMapLayers } from "./useMapLayers";
import { GlobeScene, type MapScale } from "@/globe/GlobeScene";
import type { SelectedPointScreenPosition } from "@/globe/points/PointLayer";
import type { OrbitalMode, SelectedSatellitePosition } from "@/features/orbital/model";
import type { PipelineFuel } from "@/features/pipelines/model";
import { filterPipelines, reconcilePipelineStatusFilters as reconcilePipelineStatusFilterValues } from "@/features/pipelines/filters";
import { orbitalVisibilityMask } from "@/features/orbital/filters";
import { orbitalObjectColor } from "@/features/orbital/colors";

export function MapView() {
  const [hasInteracted, setHasInteracted] = useState(false);
  const [hoverKey, setHoverKey] = useState<HoverKey | null>(null);
  const { earthquakesVisible, firesVisible, enabledOrbitalModes, enabledPipelineFuels, pipelineStatusFilters, orbitalFilters, selection,
    toggleEarthquakes: toggleEarthquakesState, toggleFires: toggleFiresState, toggleOrbitalMode,
    togglePipelineFuel: togglePipelineFuelState, changePipelineStatusFilters, reconcilePipelineStatusFilters: reconcilePipelineStatusFilterState,
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
  const globeCanvasRef = useRef<HTMLDivElement>(null);
  const hoverTooltipRef = useRef<HTMLDivElement>(null);
  const hoverKeyRef = useRef<HoverKey | null>(null);
  const hoverPositionRef = useRef<{ readonly x: number; readonly y: number } | null>(null);
  const activePointerRef = useRef<{ readonly id: number; readonly x: number; readonly y: number; dragged: boolean } | null>(null);
  const pendingHoverRef = useRef<{ readonly key: HoverKey; readonly x: number; readonly y: number; readonly distance: number; readonly event: PointerEvent } | null>(null);
  const hoverFrameRef = useRef<number | null>(null);
  const {
    earthquakeFeed: earthquakesData,
    fireFeed: firesData,
    pipelineFeeds,
    orbitalFeeds: { active: satellitesData, debris: debrisData, rocketBodies: rocketBodiesData },
    earthquakes,
    fires,
    pipelines,
    pipelineCatalog,
    pipelineFilters,
    pipelineCounts,
    satelliteCatalog,
    orbitalObjects,
    filterOptions,
    visibleMask,
    orbitalSummaryItems,
    refreshSatellites,
    refreshPipelines,
  } = useMapLayers(enabledOrbitalModes, orbitalFilters, enabledPipelineFuels, pipelineStatusFilters);
  const selectionData: SelectionData = useMemo(() => ({
    earthquakes, fires, orbitalObjects, orbitalVisibility: visibleMask, earthquakesVisible, firesVisible,
    enabledOrbitalModes, selectedSatellitePosition,
    pipelines, enabledPipelineFuels,
  }), [earthquakes, fires, orbitalObjects, visibleMask, earthquakesVisible, firesVisible, enabledOrbitalModes, selectedSatellitePosition, pipelines, enabledPipelineFuels]);
  const selected: SelectedEvent | null = resolveSelection(selection, selectionData);
  const hoverData: HoverData = useMemo(() => ({
    earthquakes, fires, orbitalObjects, orbitalVisibility: visibleMask, earthquakesVisible, firesVisible,
    satellitesVisible, pipelines, pipelinesVisible: enabledPipelineFuels.length > 0,
    orbitalColorFor: orbitalObjectColor,
  }), [earthquakes, fires, orbitalObjects, visibleMask, earthquakesVisible, firesVisible, satellitesVisible, pipelines, enabledPipelineFuels]);
  const hoverTooltip = useMemo(() => resolveHoverTooltip(hoverKey, hoverData), [hoverData, hoverKey]);
  useEffect(() => {
    if (!selection || selected) return;
    const timeout = window.setTimeout(() => reconcileSelection(selectionData));
    return () => window.clearTimeout(timeout);
  }, [reconcileSelection, selected, selection, selectionData]);
  useEffect(() => {
    reconcilePipelineStatusFilterState(reconcilePipelineStatusFilterValues(pipelineStatusFilters, pipelineFilters));
  }, [pipelineFilters, pipelineStatusFilters, reconcilePipelineStatusFilterState]);

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
  const handlePipelineFuelToggle = (fuel: PipelineFuel) => {
    const nextFuels = enabledPipelineFuels.includes(fuel) ? enabledPipelineFuels.filter((item) => item !== fuel) : [...enabledPipelineFuels, fuel];
    reconcile({ ...selectionData, enabledPipelineFuels: nextFuels });
    togglePipelineFuelState(fuel);
  };
  const handlePipelineStatusChange = (fuel: PipelineFuel, values: readonly string[]) => {
    const nextFilters = { ...pipelineStatusFilters, [fuel]: values };
    const nextPipelines = filterPipelines(pipelineCatalog, nextFilters);
    reconcile({ ...selectionData, pipelines: nextPipelines });
    changePipelineStatusFilters(fuel, values);
  };
  const handleOrbitalFilterChange = (group: keyof typeof orbitalFilters, values: readonly string[]) => {
    const nextFilters = { ...orbitalFilters, [group]: values };
    reconcile({ ...selectionData, orbitalVisibility: orbitalVisibilityMask(orbitalObjects, satelliteCatalog, nextFilters) });
    changeOrbitalFilter(group, values);
  };
  const refreshEarthquakes = () => void earthquakesData.refresh();
  const refreshFires = () => void firesData.refresh();
  const refreshSatelliteFeeds = () => void refreshSatellites();
  const refreshPipelineFeeds = () => void refreshPipelines();

  const handleEarthquakeSelect = useCallback((id: string) => select({ type: "earthquakes", id }), [select]);
  const handleFireSelect = useCallback((id: string) => select({ type: "fires", id }), [select]);
  const handleSatelliteSelect = useCallback((id: string) => {
    setSelectedSatellitePosition(null);
    select({ type: "satellites", id });
  }, [select]);
  const handlePipelineSelect = useCallback((id: string) => select({ type: "pipelines", id }), [select]);
  const handleSelectedSatelliteData = useCallback((position: SelectedSatellitePosition | null) => {
    setSelectedSatellitePosition(position);
  }, []);

  const positionHoverTooltip = useCallback((clientX: number, clientY: number) => {
    hoverPositionRef.current = { x: clientX, y: clientY };
    const root = globeCanvasRef.current?.parentElement;
    const tooltip = hoverTooltipRef.current;
    if (!root || !tooltip || !hoverKeyRef.current || activePointerRef.current?.dragged) return;
    const bounds = root.getBoundingClientRect();
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const localX = clientX - bounds.left;
    const localY = clientY - bounds.top;
    const gap = 14;
    const left = localX + width + gap <= bounds.width ? localX + gap : Math.max(0, localX - width - gap);
    const top = localY + height + gap <= bounds.height ? localY + gap : Math.max(0, localY - height - gap);
    tooltip.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }, []);

  const handleHover = useCallback((key: HoverKey, clientX: number, clientY: number, distance: number, event: PointerEvent) => {
    if (activePointerRef.current?.dragged) return;
    const pending = pendingHoverRef.current;
    if (!pending || pending.event !== event || distance < pending.distance) pendingHoverRef.current = { key, x: clientX, y: clientY, distance, event };
    positionHoverTooltip(clientX, clientY);
    if (hoverFrameRef.current === null) {
      hoverFrameRef.current = requestAnimationFrame(() => {
        hoverFrameRef.current = null;
        const next = pendingHoverRef.current;
        pendingHoverRef.current = null;
        if (!next || activePointerRef.current?.dragged) return;
        hoverKeyRef.current = next.key;
        setHoverKey((current) => current?.type === next.key.type && current.id === next.key.id ? current : next.key);
        positionHoverTooltip(next.x, next.y);
      });
    }
  }, [positionHoverTooltip]);

  const handleHoverEnd = useCallback((key: HoverKey) => {
    const current = hoverKeyRef.current;
    const pending = pendingHoverRef.current;
    if (pending?.key.type === key.type && pending.key.id === key.id) pendingHoverRef.current = null;
    if (!current || current.type !== key.type || current.id !== key.id) return;
    hoverKeyRef.current = null;
    setHoverKey(null);
  }, []);

  const clearHover = useCallback(() => {
    pendingHoverRef.current = null;
    if (hoverFrameRef.current !== null) cancelAnimationFrame(hoverFrameRef.current);
    hoverFrameRef.current = null;
    hoverKeyRef.current = null;
    setHoverKey(null);
  }, []);

  useEffect(() => {
    if (!hoverKey || hoverTooltip) return;
    const timeout = window.setTimeout(clearHover);
    return () => window.clearTimeout(timeout);
  }, [clearHover, hoverKey, hoverTooltip]);

  useEffect(() => {
    const canvas = globeCanvasRef.current?.querySelector("canvas");
    if (canvas) canvas.style.cursor = hoverTooltip && !activePointerRef.current?.dragged ? "pointer" : "";
  }, [hoverTooltip]);

  useEffect(() => {
    if (hoverTooltip && hoverPositionRef.current) positionHoverTooltip(hoverPositionRef.current.x, hoverPositionRef.current.y);
  }, [hoverTooltip, positionHoverTooltip]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    setHasInteracted(true);
    if (!(event.target instanceof HTMLCanvasElement) || event.pointerType === "touch") return;
    activePointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.target instanceof HTMLCanvasElement && event.pointerType !== "touch") setHasInteracted(true);
    const active = activePointerRef.current;
    if (active && active.id === event.pointerId && !active.dragged
      && (event.clientX - active.x) ** 2 + (event.clientY - active.y) ** 2 > 25) {
      active.dragged = true;
      clearHover();
    }
    if (event.pointerType !== "touch") positionHoverTooltip(event.clientX, event.clientY);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const active = activePointerRef.current;
    if (!active || active.id !== event.pointerId) return;
    const dragged = active.dragged;
    activePointerRef.current = null;
    if (!dragged || event.pointerType === "touch") return;
    requestAnimationFrame(() => {
      const canvas = globeCanvasRef.current?.querySelector("canvas");
      if (!canvas) return;
      canvas.dispatchEvent(new PointerEvent("pointermove", {
        bubbles: true,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        isPrimary: true,
      }));
    });
  };

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
      count: orbitalSummaryItems.reduce((sum, item) => sum + (item.hasLoaded && enabledOrbitalModes.includes(item.id) ? item.count : 0), 0), onRefresh: refreshSatelliteFeeds },
    { id: "pipelines", label: "Pipelines", description: "Global gas and oil transmission routes", visible: enabledPipelineFuels.length > 0,
      hasLoaded: enabledPipelineFuels.some((fuel) => pipelineFeeds[fuel].hasLoaded),
      isLoading: enabledPipelineFuels.some((fuel) => pipelineFeeds[fuel].isLoading),
      error: enabledPipelineFuels.map((fuel) => pipelineFeeds[fuel].error).find(Boolean) ?? null,
      stale: enabledPipelineFuels.some((fuel) => pipelineFeeds[fuel].feed?.stale),
      count: enabledPipelineFuels.reduce((sum, fuel) => sum + (pipelineFeeds[fuel].hasLoaded ? pipelineCounts[fuel] : 0), 0),
      onRefresh: refreshPipelineFeeds },
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
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { activePointerRef.current = null; clearHover(); }}
      onWheel={() => setHasInteracted(true)}
    >
      <div className="stage-title stage-title-left" aria-hidden="true">View<span>.</span></div>
      <div className="globe-canvas" ref={globeCanvasRef} onPointerLeave={clearHover}>
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
          pipelines={pipelines}
          pipelinesVisible={enabledPipelineFuels.length > 0}
          selectedPipelineId={selected?.type === "pipelines" ? selected.event.id : null}
          onPipelineSelect={handlePipelineSelect}
          selectedFireId={selection?.type === "fires" ? selection.id : null}
          onEarthquakeSelect={handleEarthquakeSelect}
          onFireSelect={handleFireSelect}
          onSelectedPositionChange={updateSelectedConnector}
          onScaleChange={handleScaleChange}
          hovered={hoverTooltip ? hoverKey : null}
          onHover={handleHover}
          onHoverEnd={handleHoverEnd}
        />
      </div>
      <svg className="event-connector" ref={connectorRef} aria-hidden="true">
        <path ref={connectorPathRef} />
        <circle ref={connectorRingRef} r="13" />
      </svg>
      {hoverTooltip ? <div
        className="globe-hover-tooltip"
        ref={hoverTooltipRef}
        style={{ "--hover-accent": hoverTooltip.accent } as CSSProperties}
        aria-hidden="true"
      >
        <span className="globe-hover-label">{hoverTooltip.label}</span>
        <span className="globe-hover-title">{hoverTooltip.title}</span>
        {hoverTooltip.detail ? <span className="globe-hover-detail">{hoverTooltip.detail}</span> : null}
      </div> : null}
      <EarthViewHeader />
      <LayerControls layers={layers} selected={selected} detailsRef={detailsRef} onClose={clearSelection} summaryItems={orbitalSummaryItems}
        orbitalControls={{ enabledModes: enabledOrbitalModes, onModeToggle: handleOrbitalModeToggle, filters: filterOptions,
          selectedFilters: orbitalFilters, onFilterChange: handleOrbitalFilterChange }}
        pipelineControls={{ enabledFuels: enabledPipelineFuels, feeds: pipelineFeeds, statusOptions: pipelineFilters,
          selectedStatuses: pipelineStatusFilters, counts: pipelineCounts, onToggle: handlePipelineFuelToggle,
          onStatusChange: handlePipelineStatusChange }} />
      {mapScale ? <div className="map-scale" aria-label={`Scale: ${new Intl.NumberFormat("en-US").format(mapScale.distanceKm)} kilometers`}>
        <div className="map-scale-labels" style={{ width: `${mapScale.widthPx}px` }}>
          <span>0</span><span>{new Intl.NumberFormat("en-US").format(mapScale.distanceKm / 2)}</span><span>{new Intl.NumberFormat("en-US").format(mapScale.distanceKm)} km</span>
        </div>
        <div className="map-scale-rule" style={{ width: `${mapScale.widthPx}px` }} aria-hidden="true"><i /><i /><i /></div>
      </div> : null}
    </main>
  );
}
