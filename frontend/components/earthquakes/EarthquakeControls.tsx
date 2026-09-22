"use client";

import { useEffect, useState, type RefObject } from "react";
import type { Earthquake } from "@/lib/earthquakes";

type EarthquakeControlsProps = {
  readonly visible: boolean;
  readonly hasLoaded: boolean;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly selectedEarthquake: Earthquake | null;
  readonly selectedEarthquakeIndex: number;
  readonly totalEarthquakes: number;
  readonly detailsRef: RefObject<HTMLElement | null>;
  readonly onToggle: () => void;
  readonly onRefresh: () => void;
};

function UtcClock() {
  const [time, setTime] = useState("--:--:--");

  useEffect(() => {
    const update = () => {
      setTime(new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "UTC",
      }).format(new Date()));
    };

    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return <output className="earthquake-clock">UTC {time}</output>;
}

export function EarthquakeHeader() {
  return (
    <header className="stage-header">
      <span className="stage-wordmark">EarthView</span>
      <span className="stage-header-divider" />
      <span>Real-time Earth Data</span>
      <span>•</span>
      <UtcClock />
    </header>
  );
}

function formatEventTime(timestamp: number) {
  return `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(timestamp))} UTC`;
}

function formatCoordinates(latitude: number, longitude: number) {
  const latitudeDirection = latitude >= 0 ? "N" : "S";
  const longitudeDirection = longitude >= 0 ? "E" : "W";
  return `${Math.abs(latitude).toFixed(2)}° ${latitudeDirection}, ${Math.abs(longitude).toFixed(2)}° ${longitudeDirection}`;
}

function EarthquakeDetails({
  earthquake,
  index,
  total,
  detailsRef,
}: {
  readonly earthquake: Earthquake;
  readonly index: number;
  readonly total: number;
  readonly detailsRef: RefObject<HTMLElement | null>;
}) {
  return (
    <section className="earthquake-details" aria-label="Selected earthquake" ref={detailsRef}>
      <div className="earthquake-details-heading">
        <span>Earthquake event</span>
        <span>{String(index + 1).padStart(3, "0")} / {total}</span>
      </div>
      <div className="earthquake-primary">
        <div>M {earthquake.magnitude.toFixed(1)}</div>
        <p>{earthquake.location}</p>
      </div>
      <dl>
        <div>
          <dt>Time</dt>
          <dd>{formatEventTime(earthquake.time)}</dd>
        </div>
        <div>
          <dt>Depth</dt>
          <dd>{earthquake.depth.toFixed(1)} km</dd>
        </div>
        <div>
          <dt>Coordinates</dt>
          <dd>{formatCoordinates(earthquake.lat, earthquake.lon)}</dd>
        </div>
      </dl>
    </section>
  );
}

export function EarthquakeControls({
  visible,
  hasLoaded,
  isLoading,
  error,
  selectedEarthquake,
  selectedEarthquakeIndex,
  totalEarthquakes,
  detailsRef,
  onToggle,
  onRefresh,
}: EarthquakeControlsProps) {
  return (
    <>
      <aside className="earthquake-controls" aria-label="Earthquake data controls">
        <div className="earthquake-actions">
          <button
            type="button"
            onClick={onToggle}
            aria-label={visible ? "Hide earthquake layer" : "Show earthquake layer"}
            aria-pressed={visible}
          >
            Earthquakes
          </button>
          <button type="button" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? "Refreshing" : "Refresh"}
          </button>
        </div>
        {error ? <p className="earthquake-status" role="alert">{error}</p> : null}
      </aside>
      {selectedEarthquake ? (
        <EarthquakeDetails
          earthquake={selectedEarthquake}
          index={selectedEarthquakeIndex}
          total={totalEarthquakes}
          detailsRef={detailsRef}
        />
      ) : null}
      <section className="stage-data-loaded" aria-label="Data loaded">
        <h2>Data loaded</h2>
        {visible && hasLoaded ? (
          <output className="earthquake-count">
            {totalEarthquakes} {totalEarthquakes === 1 ? "earthquake" : "earthquakes"}
          </output>
        ) : null}
      </section>
    </>
  );
}
