import type { ReactNode } from "react";
import { formatCount } from "./format";

type LayerRowBase = {
  readonly label: string;
  readonly description: string;
  readonly visible: boolean;
  readonly hasLoaded: boolean;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly stale?: boolean;
  readonly count: number;
  readonly onRefresh: () => void;
};

export type LayerRowModel = LayerRowBase & (
  | { readonly id: "earthquakes" | "fires"; readonly onToggle: () => void }
  | { readonly id: "satellites" | "pipelines" }
);

export function LayerRow({ layer, expanded, onDisclosure, children }: {
  readonly layer: LayerRowModel;
  readonly expanded?: boolean;
  readonly onDisclosure?: () => void;
  readonly children?: ReactNode;
}) {
  const isDisclosure = layer.id === "satellites" || layer.id === "pipelines";
  const handleToggle = () => {
    if (layer.id === "earthquakes" || layer.id === "fires") layer.onToggle();
    else onDisclosure?.();
  };
  return <div className="layer-row">
    <div className="layer-actions">
      <button className={`layer-toggle layer-toggle-${layer.id}`} type="button" onClick={handleToggle}
        aria-label={isDisclosure ? `${expanded ? "Collapse" : "Expand"} ${layer.label} options` : `${layer.visible ? "Hide" : "Show"} ${layer.label} layer`}
        aria-pressed={layer.visible} aria-expanded={isDisclosure ? expanded : undefined}>
        <span className="layer-toggle-circle" aria-hidden="true" />
        <span className="layer-copy"><strong>{layer.label}{layer.visible && layer.hasLoaded ? <> <output className="layer-heading-count">– {formatCount(layer.count)}</output></> : null}</strong><span>{layer.description}</span></span>
      </button>
      <button className="layer-refresh" type="button" onClick={layer.onRefresh} disabled={layer.isLoading} aria-label={`Refresh ${layer.label}`} title={`Refresh ${layer.label}`}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 8a8 8 0 0 0-14.5-2.5L3 8m0 0V3m0 5h5M4 16a8 8 0 0 0 14.5 2.5L21 16m0 0v5m0-5h-5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </div>
    {layer.error ? <p className="layer-status" role="alert">{layer.error}</p> : null}
    {layer.stale && !layer.error ? <p className="layer-status layer-status-stale">Using cached data</p> : null}
    {children}
  </div>;
}
