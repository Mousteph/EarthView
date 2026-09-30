"use client";

import { useState } from "react";
import type { PipelineFeedState, PipelineFuel } from "./model";
import type { PipelineFuelCounts, PipelineStatusFilters, PipelineStatusOptions } from "./filters";
import { togglePipelineStatus } from "./filters";
import { formatCount } from "@/shared/ui/format";

const options: readonly { readonly fuel: PipelineFuel; readonly label: string }[] = [
  { fuel: "gas", label: "Gas" },
  { fuel: "oil", label: "Oil" },
];

export function PipelineLayerOptions({ enabledFuels, feeds, statusOptions, selectedStatuses, counts, onToggle, onStatusChange }: {
  readonly enabledFuels: readonly PipelineFuel[];
  readonly feeds: Readonly<Record<PipelineFuel, PipelineFeedState>>;
  readonly statusOptions: PipelineStatusOptions;
  readonly selectedStatuses: PipelineStatusFilters;
  readonly counts: PipelineFuelCounts;
  readonly onToggle: (fuel: PipelineFuel) => void;
  readonly onStatusChange: (fuel: PipelineFuel, values: readonly string[]) => void;
}) {
  const [openFuels, setOpenFuels] = useState<ReadonlySet<PipelineFuel>>(() => new Set());
  function toggleFuelDisclosure(fuel: PipelineFuel) {
    setOpenFuels((current) => {
      const next = new Set(current);
      if (next.has(fuel)) next.delete(fuel); else next.add(fuel);
      return next;
    });
  }
  return <div className="pipeline-options" aria-label="Pipeline choices">
    {options.map(({ fuel, label }) => {
      const enabled = enabledFuels.includes(fuel);
      const isOpen = openFuels.has(fuel);
      const feed = feeds[fuel];
      const count = counts[fuel];
      return <section className={`pipeline-fuel pipeline-choice-${fuel}`} key={fuel}>
        <div className="pipeline-fuel-row">
          <button className="pipeline-choice" type="button" aria-pressed={enabled} onClick={() => onToggle(fuel)}>
            <span className="pipeline-marker" aria-hidden="true" />
            <span>{label}{enabled && feed.hasLoaded ? <> <output className="pipeline-count">– {formatCount(count)}</output></> : null}</span>
          </button>
          {statusOptions[fuel].length ? <button className="orbital-disclosure" type="button" aria-label={`${isOpen ? "Collapse" : "Expand"} ${label} status filters`}
            aria-expanded={isOpen} onClick={() => toggleFuelDisclosure(fuel)}>
            <svg className={`orbital-chevron${isOpen ? " is-open" : ""}`} viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4 4 4 4-4" /></svg>
          </button> : null}
        </div>
        {isOpen && statusOptions[fuel].length ? <div className="pipeline-status-filter" role="group" aria-label={`${label} status filters`}>
          <div className="orbital-filter-heading" aria-hidden="true">Status</div>
          <div className="orbital-filter-options">
            {statusOptions[fuel].map((status) => {
              const selected = selectedStatuses[fuel].includes(status);
              return <button className="orbital-filter-option pipeline-status-option" type="button" key={status}
                aria-pressed={selected} onClick={() => onStatusChange(fuel,
                  togglePipelineStatus(selectedStatuses[fuel], status))}>
                <span className="orbital-category-marker" aria-hidden="true" />{status}
              </button>;
            })}
          </div>
        </div> : null}
      </section>;
    })}
  </div>;
}
