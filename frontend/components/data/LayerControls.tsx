"use client";

import { useEffect, useState, type RefObject } from "react";
import type { Earthquake } from "@/lib/earthquakes";
import type { Fire } from "@/lib/fires";

export type LayerControl = {
  readonly id: "earthquakes" | "fires";
  readonly label: string;
  readonly countLabel: string;
  readonly visible: boolean;
  readonly hasLoaded: boolean;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly count: number;
  readonly onToggle: () => void;
  readonly onRefresh: () => void;
};

export type SelectedEvent =
  | { readonly type: "earthquakes"; readonly event: Earthquake; readonly index: number; readonly total: number }
  | { readonly type: "fires"; readonly event: Fire; readonly index: number; readonly total: number };

function UtcClock() {
  const [time, setTime] = useState("--:--:--");
  useEffect(() => {
    const update = () => setTime(new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "UTC",
    }).format(new Date()));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, []);
  return <output className="utc-clock">UTC {time}</output>;
}

export function EarthViewHeader() {
  return <header className="stage-header">
    <span className="stage-wordmark">EarthView</span>
    <span className="stage-header-divider" />
    <span>Real-time Earth Data</span><span>•</span><UtcClock />
  </header>;
}

function formatEventTime(timestamp: number) {
  return `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium", timeStyle: "medium", timeZone: "UTC",
  }).format(new Date(timestamp))} UTC`;
}

function formatCoordinates(latitude: number, longitude: number) {
  return `${Math.abs(latitude).toFixed(2)}° ${latitude >= 0 ? "N" : "S"}, ${Math.abs(longitude).toFixed(2)}° ${longitude >= 0 ? "E" : "W"}`;
}

function formatFirePower(megawatts: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(megawatts * 1_000_000)} W`;
}

function EventDetails({ selected, detailsRef }: {
  readonly selected: SelectedEvent;
  readonly detailsRef: RefObject<HTMLElement | null>;
}) {
  const fire = selected.type === "fires" ? selected.event : null;
  const earthquake = selected.type === "earthquakes" ? selected.event : null;
  const isFire = fire !== null;
  const event = selected.event;
  const satellite = fire ? ({ N20: "NOAA-20", N21: "NOAA-21", N: "Suomi NPP" } as Record<string, string>)[fire.satellite ?? ""] ?? fire.satellite : null;
  const source = fire ? [satellite, fire.instrument].filter(Boolean).join(" / ") : "";
  return <section className="event-details" aria-label={isFire ? "Selected active fire" : "Selected earthquake"} ref={detailsRef}>
    <div className="event-details-heading">
      <span>{isFire ? "Active fire" : "Earthquake event"}</span>
      <span>{String(selected.index + 1).padStart(3, "0")} / {selected.total}</span>
    </div>
    <div className="event-primary">
      <div className={isFire ? "fire-primary-label" : undefined}>{fire ? (fire.frp === null ? null : formatFirePower(fire.frp)) : earthquake ? `M ${earthquake.magnitude.toFixed(1)}` : null}</div>
      {earthquake ? <p>{earthquake.location}</p> : null}
    </div>
    <dl>
      <div><dt>{isFire ? "Detection" : "Time"}</dt><dd>{formatEventTime(event.time)}</dd></div>
      {fire ? <>
        {fire.confidence ? <div><dt>Confidence</dt><dd>{fire.confidence}</dd></div> : null}
        {fire.frp !== null ? <div><dt>Power</dt><dd>{formatFirePower(fire.frp)}</dd></div> : null}
        {source ? <div><dt>Satellite</dt><dd>{source}</dd></div> : null}
      </> : earthquake ? <div><dt>Depth</dt><dd>{earthquake.depth.toFixed(1)} km</dd></div> : null}
      <div><dt>Coordinates</dt><dd>{formatCoordinates(event.lat, event.lon)}</dd></div>
    </dl>
  </section>;
}

export function LayerControls({ layers, selected, detailsRef }: {
  readonly layers: readonly LayerControl[];
  readonly selected: SelectedEvent | null;
  readonly detailsRef: RefObject<HTMLElement | null>;
}) {
  return <>
    <aside className="layer-controls" aria-label="Data layer controls">
      {layers.map((layer) => <div className="layer-row" key={layer.id}>
        <div className="layer-actions">
          <button type="button" onClick={layer.onToggle} aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.label} layer`} aria-pressed={layer.visible}>{layer.label}</button>
          <button type="button" onClick={layer.onRefresh} disabled={layer.isLoading} aria-label={`Refresh ${layer.label}`}>{layer.isLoading ? "Refreshing" : "Refresh"}</button>
        </div>
        {layer.error ? <p className="layer-status" role="alert">{layer.error}</p> : null}
      </div>)}
    </aside>
    {selected ? <EventDetails selected={selected} detailsRef={detailsRef} /> : null}
    <section className="stage-data-loaded" aria-label="Data loaded">
      <h2>Data loaded</h2>
      {layers.filter((layer) => layer.visible && layer.hasLoaded).map((layer) => <output className="layer-count" key={layer.id}>
        {layer.count} {layer.count === 1 ? layer.countLabel : `${layer.countLabel}s`}
      </output>)}
      <a className="data-source" href="https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2025-grid" target="_blank" rel="noreferrer">
        Relief: GEBCO 2025
      </a>
    </section>
  </>;
}
