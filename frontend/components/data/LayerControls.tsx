"use client";

import { useEffect, useState, type RefObject } from "react";
import Link from "next/link";
import type { Earthquake } from "@/lib/earthquakes";
import type { Fire } from "@/lib/fires";
import type { OrbitalMode, Satellite, SelectedSatellitePosition } from "@/lib/satellites";
import type { OrbitalFilterGroup } from "@/lib/orbitalFilters";

export type LayerControl = {
  readonly id: "earthquakes" | "fires" | "satellites";
  readonly label: string;
  readonly description: string;
  readonly countLabel: string;
  readonly countLabelPlural?: string;
  readonly visible: boolean;
  readonly hasLoaded: boolean;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly stale?: boolean;
  readonly count: number;
  readonly onToggle: () => void;
  readonly onRefresh: () => void;
};

export type SelectedEvent =
  | { readonly type: "earthquakes"; readonly event: Earthquake; readonly index: number; readonly total: number }
  | { readonly type: "fires"; readonly event: Fire; readonly index: number; readonly total: number }
  | { readonly type: "satellites"; readonly mode: OrbitalMode; readonly event: Satellite; readonly position: SelectedSatellitePosition | null };

export type OrbitalControls = {
  readonly enabledModes: readonly OrbitalMode[];
  readonly onModeToggle: (mode: OrbitalMode) => void;
  readonly filters: Readonly<Record<OrbitalFilterGroup, readonly string[]>>;
  readonly selectedFilters: Readonly<Record<OrbitalFilterGroup, readonly string[]>>;
  readonly onFilterChange: (group: OrbitalFilterGroup, values: readonly string[]) => void;
};

export type OrbitalSummaryItem = { readonly id: OrbitalMode; readonly label: string; readonly count: number };

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
  if (selected.type === "satellites") {
    const { event: satellite, position } = selected;
    const metadata = satellite;
    const objectLabel = selected.mode === "satellites" ? "Satellite" : selected.mode === "debris" ? "Debris" : "Rocket body";
    const operational = metadata.operationalStatus === "active" ? true : metadata.operationalStatus === "inactive" ? false : null;
    const sections: readonly [string, readonly (readonly [string, string | null | undefined])[]][] = [
      ["Identity", [["NORAD ID", String(satellite.noradId)], ["International designator", metadata.internationalDesignator], ["Object type", metadata.objectType], ["Mission type", selected.mode === "satellites" ? metadata.missionType : null], ["Constellation / group", selected.mode === "satellites" ? metadata.constellation : null]]],
      ["Ownership", [["Owner / source", metadata.owner], ["Launch date", metadata.launchDate], ["Launch site", metadata.launchSite]]],
      ["Orbit", [["Orbit class", metadata.orbitClass], ["Altitude", position ? `${position.altitudeKm.toFixed(1)} km` : "Calculating"], [metadata.apsidesEstimated ? "Apogee (est.)" : "Apogee", metadata.apogeeKm == null ? null : `${metadata.apogeeKm.toFixed(1)} km`], [metadata.apsidesEstimated ? "Perigee (est.)" : "Perigee", metadata.perigeeKm == null ? null : `${metadata.perigeeKm.toFixed(1)} km`], ["Inclination", `${satellite.inclination.toFixed(2)}°`], ["Period", `${(metadata.orbitalPeriodMinutes ?? 1440 / satellite.meanMotion).toFixed(1)} min`], ["Orbits per day", (metadata.orbitsPerDay ?? satellite.meanMotion).toFixed(2)], ["Velocity", position ? `${position.velocityKmS.toFixed(2)} km/s` : "Calculating"]]],
      ["Position", [["Latitude / longitude", position ? formatCoordinates(position.latitude, position.longitude) : "Calculating"]]],
    ];
    return <section className="event-details" aria-label={`Selected ${objectLabel.toLowerCase()}`} ref={detailsRef}>
      <button className="event-close" type="button" onClick={onClose} aria-label={`Close selected ${objectLabel.toLowerCase()}`}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
      <div className="event-details-scroll">
        <div className="event-details-heading"><span>{objectLabel}</span></div>
        <div className="event-primary">
          <div className="satellite-primary-label">{satellite.name}</div>
          <div className="orbital-primary-badges">
            {selected.mode === "satellites" ? <>
              {metadata.missionType ? <span className="orbital-info-pill">{metadata.missionType}</span> : null}
              {metadata.orbitClass ? <span className="orbital-info-pill">{metadata.orbitClass}</span> : null}
              {metadata.constellation ? <span className="orbital-info-pill">{metadata.constellation}</span> : null}
            </> : null}
            {operational !== null ? <span className={`orbital-status-pill ${operational ? "is-active" : "is-inactive"}`}><i aria-hidden="true" />{operational ? "Active" : "Inactive"}</span> : null}
          </div>
        </div>
        {sections.map(([title, rows]) => {
          const availableRows = rows.filter(([, value]) => value != null && value !== "");
          return availableRows.length ? <div className="orbital-detail-section" key={title}>
            <h3>{title}</h3><dl>{availableRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          </div> : null;
        })}
      </div>
    </section>;
  }
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
    <div className="event-details-scroll">
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
    </div>
  </section>;
}

function OrbitalLayerOptions({ controls }: { readonly controls: OrbitalControls }) {
  const [openModes, setOpenModes] = useState<ReadonlySet<OrbitalMode>>(() => new Set(["satellites"]));
  const [openGroups, setOpenGroups] = useState<ReadonlySet<OrbitalFilterGroup>>(() => new Set());
  const groups: readonly [OrbitalFilterGroup, string][] = [["missionTypes", "Mission type"], ["orbitClasses", "Orbit class"], ["constellations", "Constellation / group"]];
  const modes: readonly [OrbitalMode, string, string][] = [
    ["satellites", "Satellites", "satellite"],
    ["debris", "Debris", "debris"],
    ["rocket_bodies", "Rocket Bodies", "rocket-body"],
  ];
  function toggleModeOpen(mode: OrbitalMode) {
    setOpenModes((current) => {
      const next = new Set(current);
      if (next.has(mode)) next.delete(mode); else next.add(mode);
      return next;
    });
  }
  function toggleGroupOpen(group: OrbitalFilterGroup) {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  }
  return <div className="orbital-options" aria-label="Orbital object choices">
    <div className="orbital-category-list">
      {modes.map(([mode, label, color]) => {
        const isOpen = openModes.has(mode);
        return <section className={"orbital-category orbital-category-" + color} key={mode}>
          <div className="orbital-category-row">
            <button className="orbital-category-choice" type="button" aria-pressed={controls.enabledModes.includes(mode)} onClick={() => controls.onModeToggle(mode)}>
              <span className="orbital-category-marker" aria-hidden="true" />
              <span>{label}</span>
            </button>
            {mode === "satellites" ? <button className="orbital-disclosure" type="button" aria-label={(isOpen ? "Collapse " : "Expand ") + label + " filters"} aria-expanded={isOpen} onClick={() => toggleModeOpen(mode)}>
              <svg className={`orbital-chevron${isOpen ? " is-open" : ""}`} viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4 4 4 4-4" /></svg>
            </button> : null}
          </div>
          {isOpen && mode === "satellites" ? <div className="orbital-filter-groups">
            {groups.map(([group, groupLabel]) => controls.filters[group].length ? <section className="orbital-filter-group" key={group}>
              <button className="orbital-filter-heading" type="button" aria-expanded={openGroups.has(group)} onClick={() => toggleGroupOpen(group)}>
                <span>{groupLabel}</span><svg className={`orbital-chevron${openGroups.has(group) ? " is-open" : ""}`} viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4 4 4 4-4" /></svg>
              </button>
              {openGroups.has(group) ? <div className="orbital-filter-options">
                {controls.filters[group].map((value) => {
                  const isSelected = controls.selectedFilters[group].includes(value);
                  return <button className="orbital-filter-option" type="button" key={value} aria-pressed={isSelected} onClick={() => {
                    const current = controls.selectedFilters[group];
                    controls.onFilterChange(group, isSelected ? current.filter((item) => item !== value) : [...current, value]);
                  }}><span className="orbital-category-marker" aria-hidden="true" />{value}</button>;
                })}
              </div> : null}
            </section> : null)}
          </div> : null}
        </section>;
      })}
    </div>
  </div>;
}

export function LayerControls({ layers, selected, detailsRef, onClose, orbitalControls, summaryItems }: {
  readonly layers: readonly LayerControl[];
  readonly selected: SelectedEvent | null;
  readonly detailsRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly orbitalControls?: OrbitalControls;
  readonly summaryItems?: readonly OrbitalSummaryItem[];
}) {
  const [orbitalOpen, setOrbitalOpen] = useState(true);
  return <>
    <aside className="layer-controls" aria-label="Data layer controls">
      {layers.map((layer) => <div className="layer-row" key={layer.id}>
        <div className="layer-actions">
          <button className={`layer-toggle layer-toggle-${layer.id}`} type="button" onClick={layer.id === "satellites" ? () => setOrbitalOpen((open) => !open) : layer.onToggle} aria-label={layer.id === "satellites" ? `${orbitalOpen ? "Collapse" : "Expand"} ${layer.label} options` : `${layer.visible ? "Hide" : "Show"} ${layer.label} layer`} aria-pressed={layer.id === "satellites" ? undefined : layer.visible} aria-expanded={layer.id === "satellites" ? orbitalOpen : undefined}>
            <span className="layer-toggle-circle" aria-hidden="true" />
            <span className="layer-copy"><strong>{layer.label}</strong><span>{layer.description}</span></span>
          </button>
          <button className="layer-refresh" type="button" onClick={layer.onRefresh} disabled={layer.isLoading} aria-label={`Refresh ${layer.label}`} title={`Refresh ${layer.label}`}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 8a8 8 0 0 0-14.5-2.5L3 8m0 0V3m0 5h5M4 16a8 8 0 0 0 14.5 2.5L21 16m0 0v5m0-5h-5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        </div>
        {layer.error ? <p className="layer-status" role="alert">{layer.error}</p> : null}
        {layer.stale && !layer.error ? <p className="layer-status layer-status-stale">Using cached orbital data or metadata</p> : null}
        {layer.id === "satellites" && orbitalControls && orbitalOpen ? <OrbitalLayerOptions controls={orbitalControls} /> : null}
      </div>)}
    </aside>
    {selected ? <EventDetails selected={selected} detailsRef={detailsRef} onClose={onClose} /> : <section className="inspection-prompt" aria-label="Inspect data">
      <h2>Select a layer or object<br />to inspect</h2>
      <p>Explore real-time Earth data layers to discover what&apos;s happening across our planet.</p>
    </section>}
    <section className="stage-data-loaded" aria-label="Live summary">
      <h2>Live summary</h2>
      {layers.filter((layer) => layer.id !== "satellites" && layer.visible && layer.hasLoaded).map((layer) => <output className={`layer-count layer-count-${layer.id}`} key={layer.id}>
        <span className="summary-marker" aria-hidden="true" />
        <span><strong>{new Intl.NumberFormat("en-US").format(layer.count)}</strong> {layer.count === 1 ? layer.countLabel : layer.countLabelPlural ?? `${layer.countLabel}s`} loaded</span>
      </output>)}
      {summaryItems?.map((item) => <output className={`layer-count layer-count-orbital layer-count-${item.id}`} key={item.id}>
        <span className="summary-marker" aria-hidden="true" />
        <span><strong>{new Intl.NumberFormat("en-US").format(item.count)}</strong> {item.count === 1 ? ({ Satellites: "Satellite", Debris: "Debris", "Rocket Bodies": "Rocket Body" }[item.label] ?? item.label) : item.label} loaded</span>
      </output>)}
      {!layers.some((layer) => layer.id !== "satellites" && layer.visible && layer.hasLoaded) && !summaryItems?.length ? <p className="summary-empty">{layers.find((layer) => layer.id === "satellites")?.isLoading ? "Loading orbital data…" : orbitalControls ? "Choose an orbital object category to display." : "Turn on a layer to load live data."}</p> : null}
    </section>
  </>;
}
