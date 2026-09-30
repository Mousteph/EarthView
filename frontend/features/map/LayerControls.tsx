"use client";

import { useCallback, useEffect, useState, type RefObject, type TransitionEvent } from "react";
import { EarthquakeDetails } from "@/features/earthquakes/EarthquakeDetails";
import { FireDetails } from "@/features/fires/FireDetails";
import { OrbitalDetails } from "@/features/orbital/OrbitalDetails";
import { OrbitalLayerOptions, type OrbitalControls, type OrbitalSummaryItem } from "@/features/orbital/OrbitalLayerOptions";
import { PipelineDetails } from "@/features/pipelines/PipelineDetails";
import { PipelineLayerOptions } from "@/features/pipelines/PipelineLayerOptions";
import type { PipelineFeedState, PipelineFuel } from "@/features/pipelines/model";
import type { PipelineFuelCounts, PipelineStatusFilters, PipelineStatusOptions } from "@/features/pipelines/filters";
import { LayerRow, type LayerRowModel } from "@/shared/ui/LayerRow";
import type { SelectedEvent } from "./selection";

export type LayerControl = LayerRowModel;
type ControlsPhase = "expanded" | "collapsing" | "shrinking" | "compact" | "expanding" | "revealing" | "appearing";

export function LayerControls({ layers, selected, detailsRef, onClose, orbitalControls, summaryItems, pipelineControls }: {
  readonly layers: readonly LayerControl[];
  readonly selected: SelectedEvent | null;
  readonly detailsRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly orbitalControls: OrbitalControls;
  readonly summaryItems: readonly OrbitalSummaryItem[];
  readonly pipelineControls: {
    readonly enabledFuels: readonly PipelineFuel[];
    readonly feeds: Readonly<Record<PipelineFuel, PipelineFeedState>>;
    readonly statusOptions: PipelineStatusOptions;
    readonly selectedStatuses: PipelineStatusFilters;
    readonly counts: PipelineFuelCounts;
    readonly onToggle: (fuel: PipelineFuel) => void;
    readonly onStatusChange: (fuel: PipelineFuel, values: readonly string[]) => void;
  };
}) {
  const [controlsPhase, setControlsPhase] = useState<ControlsPhase>("expanded");
  const [orbitalOpen, setOrbitalOpen] = useState(false);
  const [pipelinesOpen, setPipelinesOpen] = useState(false);
  const compact = controlsPhase === "compact" || controlsPhase === "expanding" || controlsPhase === "shrinking";
  const transitioning = controlsPhase !== "expanded" && controlsPhase !== "compact";
  const expanded = controlsPhase === "expanded" || controlsPhase === "collapsing" || controlsPhase === "revealing" || controlsPhase === "appearing";
  const finishExpansion = useCallback(() => {
    setControlsPhase((phase) => phase === "expanding" ? "revealing" : phase);
    window.requestAnimationFrame(() => {
      setControlsPhase((phase) => phase === "revealing" ? "appearing" : phase);
    });
  }, []);
  useEffect(() => {
    if (controlsPhase === "collapsing") {
      const timeout = window.setTimeout(() => setControlsPhase((phase) => phase === "collapsing" ? "shrinking" : phase), 140);
      return () => window.clearTimeout(timeout);
    }
    if (controlsPhase === "shrinking") {
      const timeout = window.setTimeout(() => setControlsPhase((phase) => phase === "shrinking" ? "compact" : phase), 220);
      return () => window.clearTimeout(timeout);
    }
    if (controlsPhase === "expanding") {
      const timeout = window.setTimeout(finishExpansion, 220);
      return () => window.clearTimeout(timeout);
    }
    if (controlsPhase === "appearing") {
      const timeout = window.setTimeout(() => setControlsPhase((phase) => phase === "appearing" ? "expanded" : phase), 140);
      return () => window.clearTimeout(timeout);
    }
  }, [controlsPhase, finishExpansion]);
  const handleTransitionEnd = (event: TransitionEvent<HTMLElement>) => {
    if (event.target === event.currentTarget && event.propertyName === "width") {
      if (controlsPhase === "expanding") finishExpansion();
      else if (controlsPhase === "shrinking") setControlsPhase("compact");
    } else if (event.target instanceof HTMLElement && event.target.classList.contains("layer-copy") && event.propertyName === "opacity") {
      if (controlsPhase === "collapsing") setControlsPhase("shrinking");
      else if (controlsPhase === "appearing") setControlsPhase("expanded");
    }
  };
  const toggleControls = () => {
    if (transitioning) return;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setControlsPhase(compact ? "expanded" : "compact");
    } else {
      setControlsPhase(compact ? "expanding" : "collapsing");
    }
  };
  const showLayerOptions = (layer: "satellites" | "pipelines") => {
    if (compact) {
      if (layer === "satellites") setOrbitalOpen(true);
      else setPipelinesOpen(true);
      setControlsPhase(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "expanded" : "expanding");
      return;
    }
    if (layer === "satellites") setOrbitalOpen((open) => !open);
    else setPipelinesOpen((open) => !open);
  };
  return <>
    <aside className={`layer-controls${compact ? " is-compact" : ""}${controlsPhase === "expanding" ? " is-expanding" : ""}${controlsPhase === "collapsing" ? " is-collapsing" : ""}${controlsPhase === "revealing" ? " is-revealing" : ""}`}
      aria-label="Data layer controls" onTransitionEnd={handleTransitionEnd}>
      <div className="layer-controls-toolbar">
        <button className="layer-controls-toggle" type="button" onClick={toggleControls} aria-disabled={transitioning}
          aria-label={`${expanded ? "Collapse" : "Expand"} data layer controls`} aria-expanded={expanded} aria-controls="earthview-layer-list"
          title={`${expanded ? "Collapse" : "Expand"} data layer controls`}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className="layer-controls-scroll" id="earthview-layer-list">
        {layers.map((layer) => <LayerRow layer={layer} key={layer.id}
          expanded={layer.id === "satellites" ? !compact && orbitalOpen : layer.id === "pipelines" ? !compact && pipelinesOpen : undefined}
          onDisclosure={layer.id === "satellites" ? () => showLayerOptions("satellites") : layer.id === "pipelines" ? () => showLayerOptions("pipelines") : undefined}>
          {layer.id === "satellites" && orbitalOpen ? <OrbitalLayerOptions controls={orbitalControls} summaryItems={summaryItems} /> : null}
          {layer.id === "pipelines" && pipelinesOpen ? <PipelineLayerOptions {...pipelineControls} /> : null}
        </LayerRow>)}
      </div>
    </aside>
    {selected?.type === "earthquakes" ? <EarthquakeDetails event={selected.event} detailsRef={detailsRef} onClose={onClose} />
      : selected?.type === "fires" ? <FireDetails event={selected.event} detailsRef={detailsRef} onClose={onClose} />
        : selected?.type === "satellites" ? <OrbitalDetails event={selected.event} mode={selected.mode} position={selected.position} detailsRef={detailsRef} onClose={onClose} />
          : selected?.type === "pipelines" ? <PipelineDetails pipeline={selected.event} detailsRef={detailsRef} onClose={onClose} />
          : <section className="inspection-prompt" aria-label="Explore Earth data">
            <h2>EXPLORE EARTH, AS IT HAPPENS</h2>
            <p>Choose a data layer or object to follow events across our planet.</p>
            <p className="inspection-scale-note">Data marks and orbital objects are not shown at actual size.</p>
          </section>}
  </>;
}
