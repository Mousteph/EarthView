import type { RefObject } from "react";
import type { Pipeline } from "./model";
import { formatPipelineStakeholders } from "./format";
import { InspectionPanel } from "@/shared/ui/InspectionPanel";

function formatLength(lengthKm: number | null) {
  return lengthKm === null ? null : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(lengthKm)} km`;
}

export function PipelineDetails({ pipeline, detailsRef, onClose }: {
  readonly pipeline: Pipeline;
  readonly detailsRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}) {
  const rows: readonly (readonly [string, string | null])[] = [
    ["Countries", pipeline.countries],
    ["Owner", formatPipelineStakeholders(pipeline.owner)],
    ["Parent", formatPipelineStakeholders(pipeline.parent)],
    ["Operator", pipeline.operator],
    ["Length", formatLength(pipeline.lengthKm)],
    ["Capacity", pipeline.capacity ? [pipeline.capacity, pipeline.capacityUnit].filter(Boolean).join(" ") : null],
    ["Start year", pipeline.startYear],
    ["Route accuracy", pipeline.routeAccuracy],
  ];

  return <InspectionPanel ariaLabel="Selected pipeline" closeLabel="Close selected pipeline" detailsRef={detailsRef} onClose={onClose} className={`pipeline-details-${pipeline.fuel}`}>
    <div className="event-details-heading"><span>{pipeline.fuel === "gas" ? "Gas pipeline" : "Oil pipeline"}</span></div>
    <div className="event-primary pipeline-primary">
      <div>{pipeline.name}</div>
      {pipeline.segmentName ? <p>{pipeline.segmentName}</p> : null}
      <div className="orbital-primary-badges">
        <span className={`pipeline-type-pill pipeline-type-${pipeline.type.toLowerCase()}`}>{pipeline.type}</span>
        {pipeline.status ? <span className="orbital-info-pill">{pipeline.status}</span> : null}
      </div>
    </div>
    <div className="orbital-detail-section event-data-section"><h3>Project</h3><dl>
      <div><dt>Project ID</dt><dd>{pipeline.projectId}</dd></div>
      {rows.filter(([, value]) => value !== null && value !== "").map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl></div>
  </InspectionPanel>;
}
