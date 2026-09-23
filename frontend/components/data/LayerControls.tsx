"use client";

import { useEffect, useState, type RefObject } from "react";
import Link from "next/link";
import type { Earthquake } from "@/lib/earthquakes";
import type { Fire } from "@/lib/fires";

export type LayerControl = {
  readonly id: "earthquakes" | "fires";
  readonly label: string;
  readonly description: string;
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

export function EarthViewHeader({ activePage = "map" }: { readonly activePage?: "map" | "data" }) {
  return <header className="stage-header">
    <div className="stage-header-identity">
      <Link className="stage-wordmark" href="/">EarthView</Link>
      <span className="stage-header-divider" aria-hidden="true" />
      <span className="stage-header-descriptor">Real-time Earth Data</span>
      <span className="stage-header-dot" aria-hidden="true">•</span>
      <UtcClock />
      <span className="live-status"><span className="live-dot" aria-hidden="true" />Live</span>
    </div>
    <nav className="stage-nav" aria-label="Main navigation">
      <Link href="/" aria-current={activePage === "map" ? "page" : undefined}>Map</Link>
      <Link href="/data" aria-current={activePage === "data" ? "page" : undefined}>Data</Link>
    </nav>
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

function EventDetails({ selected, detailsRef, onClose }: {
  readonly selected: SelectedEvent;
  readonly detailsRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}) {
  const fire = selected.type === "fires" ? selected.event : null;
  const earthquake = selected.type === "earthquakes" ? selected.event : null;
  const isFire = fire !== null;
  const event = selected.event;
  const satellite = fire ? ({ N20: "NOAA-20", N21: "NOAA-21", N: "Suomi NPP" } as Record<string, string>)[fire.satellite ?? ""] ?? fire.satellite : null;
  const source = fire ? [satellite, fire.instrument].filter(Boolean).join(" / ") : "";
  return <section className="event-details" aria-label={isFire ? "Selected active fire" : "Selected earthquake"} ref={detailsRef}>
    <button className="event-close" type="button" onClick={onClose} aria-label="Close selected event">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
    </button>
    <div className="event-details-heading">
      <span>{isFire ? "Active fire" : "Earthquake event"}</span>
      <span>#{new Intl.NumberFormat("en-US").format(selected.index + 1)}</span>
    </div>
    <div className="event-primary">
      <div className={isFire ? "fire-primary-label" : undefined}>{fire ? (fire.frp === null ? "Power unavailable" : formatFirePower(fire.frp)) : earthquake ? `M ${earthquake.magnitude.toFixed(1)}` : null}</div>
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

export function LayerControls({ layers, selected, detailsRef, onClose }: {
  readonly layers: readonly LayerControl[];
  readonly selected: SelectedEvent | null;
  readonly detailsRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}) {
  return <>
    <aside className="layer-controls" aria-label="Data layer controls">
      {layers.map((layer) => <div className="layer-row" key={layer.id}>
        <div className="layer-actions">
          <button className={`layer-toggle layer-toggle-${layer.id}`} type="button" onClick={layer.onToggle} aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.label} layer`} aria-pressed={layer.visible}>
            <span className="layer-toggle-circle" aria-hidden="true" />
            <span className="layer-copy"><strong>{layer.label}</strong><span>{layer.description}</span></span>
          </button>
          <button className="layer-refresh" type="button" onClick={layer.onRefresh} disabled={layer.isLoading} aria-label={`Refresh ${layer.label}`} title={`Refresh ${layer.label}`}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 8a8 8 0 0 0-14.5-2.5L3 8m0 0V3m0 5h5M4 16a8 8 0 0 0 14.5 2.5L21 16m0 0v5m0-5h-5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
        {layer.error ? <p className="layer-status" role="alert">{layer.error}</p> : null}
      </div>)}
    </aside>
    {selected ? <EventDetails selected={selected} detailsRef={detailsRef} onClose={onClose} /> : <section className="inspection-prompt" aria-label="Inspect data">
      <h2>Select a layer or object<br />to inspect</h2>
      <p>Explore real-time Earth data layers to discover what&apos;s happening across our planet.</p>
    </section>}
    <section className="stage-data-loaded" aria-label="Live summary">
      <h2>Live summary</h2>
      {layers.filter((layer) => layer.visible && layer.hasLoaded).map((layer) => <output className={`layer-count layer-count-${layer.id}`} key={layer.id}>
        <span className="summary-marker" aria-hidden="true" />
        <span><strong>{new Intl.NumberFormat("en-US").format(layer.count)}</strong> {layer.count === 1 ? layer.countLabel : `${layer.countLabel}s`} loaded</span>
      </output>)}
      {!layers.some((layer) => layer.visible && layer.hasLoaded) ? <p className="summary-empty">Turn on a layer to load live data.</p> : null}
    </section>
  </>;
}
