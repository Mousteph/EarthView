"use client";

import { useState, type RefObject } from "react";
import { EarthquakeDetails } from "@/features/earthquakes/EarthquakeDetails";
import { FireDetails } from "@/features/fires/FireDetails";
import { OrbitalDetails } from "@/features/orbital/OrbitalDetails";
import { OrbitalLayerOptions, type OrbitalControls, type OrbitalSummaryItem } from "@/features/orbital/OrbitalLayerOptions";
import { LayerRow, type LayerRowModel } from "@/shared/ui/LayerRow";
import type { SelectedEvent } from "./selection";

export type LayerControl = LayerRowModel;

export function LayerControls({ layers, selected, detailsRef, onClose, orbitalControls, summaryItems }: {
  readonly layers: readonly LayerControl[];
  readonly selected: SelectedEvent | null;
  readonly detailsRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly orbitalControls: OrbitalControls;
  readonly summaryItems: readonly OrbitalSummaryItem[];
}) {
  const [orbitalOpen, setOrbitalOpen] = useState(false);
  return <>
    <aside className="layer-controls" aria-label="Data layer controls">
      {layers.map((layer) => <LayerRow layer={layer} key={layer.id} expanded={orbitalOpen} onDisclosure={() => setOrbitalOpen((open) => !open)}>
        {layer.id === "satellites" && orbitalOpen ? <OrbitalLayerOptions controls={orbitalControls} summaryItems={summaryItems} /> : null}
      </LayerRow>)}
    </aside>
    {selected?.type === "earthquakes" ? <EarthquakeDetails event={selected.event} detailsRef={detailsRef} onClose={onClose} />
      : selected?.type === "fires" ? <FireDetails event={selected.event} detailsRef={detailsRef} onClose={onClose} />
        : selected?.type === "satellites" ? <OrbitalDetails event={selected.event} mode={selected.mode} position={selected.position} detailsRef={detailsRef} onClose={onClose} />
          : <section className="inspection-prompt" aria-label="Inspect data">
            <h2>Select a layer or object<br />to inspect</h2>
            <p>Explore real-time Earth data layers to discover what&apos;s happening across our planet.</p>
          </section>}
  </>;
}
