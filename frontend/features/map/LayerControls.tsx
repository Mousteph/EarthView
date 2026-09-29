"use client";

import { useState, type RefObject } from "react";
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
  const [orbitalOpen, setOrbitalOpen] = useState(false);
  const [pipelinesOpen, setPipelinesOpen] = useState(false);
  return <>
    <aside className="layer-controls" aria-label="Data layer controls">
      <div className="layer-controls-scroll">
        {layers.map((layer) => <LayerRow layer={layer} key={layer.id}
          expanded={layer.id === "satellites" ? orbitalOpen : layer.id === "pipelines" ? pipelinesOpen : undefined}
          onDisclosure={layer.id === "satellites" ? () => setOrbitalOpen((open) => !open) : layer.id === "pipelines" ? () => setPipelinesOpen((open) => !open) : undefined}>
          {layer.id === "satellites" && orbitalOpen ? <OrbitalLayerOptions controls={orbitalControls} summaryItems={summaryItems} /> : null}
          {layer.id === "pipelines" && pipelinesOpen ? <PipelineLayerOptions {...pipelineControls} /> : null}
        </LayerRow>)}
      </div>
    </aside>
    {selected?.type === "earthquakes" ? <EarthquakeDetails event={selected.event} detailsRef={detailsRef} onClose={onClose} />
      : selected?.type === "fires" ? <FireDetails event={selected.event} detailsRef={detailsRef} onClose={onClose} />
        : selected?.type === "satellites" ? <OrbitalDetails event={selected.event} mode={selected.mode} position={selected.position} detailsRef={detailsRef} onClose={onClose} />
          : selected?.type === "pipelines" ? <PipelineDetails pipeline={selected.event} detailsRef={detailsRef} onClose={onClose} />
          : <section className="inspection-prompt" aria-label="Inspect data">
            <h2>Select a layer or object<br />to inspect</h2>
            <p>Explore real-time Earth data layers to discover what&apos;s happening across our planet.</p>
          </section>}
  </>;
}
