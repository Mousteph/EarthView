"use client";

import { useEffect, useState } from "react";
import type { Earthquake } from "@/lib/earthquakes";

type EarthquakeControlsProps = {
  readonly visible: boolean;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly selectedEarthquake: Earthquake | null;
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

function formatEventTime(timestamp: number) {
  return `${new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(timestamp))} UTC`;
}

function EarthquakeDetails({ earthquake }: { readonly earthquake: Earthquake }) {
  return (
    <section className="earthquake-details" aria-label="Selected earthquake">
      <div className="earthquake-details-heading">EARTHQUAKE EVENT</div>
      <dl>
        <div>
          <dt>Magnitude</dt>
          <dd>M {earthquake.magnitude.toFixed(1)}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{earthquake.location}</dd>
        </div>
        <div>
          <dt>Time</dt>
          <dd>{formatEventTime(earthquake.time)}</dd>
        </div>
        <div>
          <dt>Depth</dt>
          <dd>{earthquake.depth.toFixed(1)} km</dd>
        </div>
      </dl>
    </section>
  );
}

export function EarthquakeControls({
  visible,
  isLoading,
  error,
  selectedEarthquake,
  onToggle,
  onRefresh,
}: EarthquakeControlsProps) {
  return (
    <>
      <aside className="earthquake-controls" aria-label="Earthquake data controls">
        <UtcClock />
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
      {selectedEarthquake ? <EarthquakeDetails earthquake={selectedEarthquake} /> : null}
    </>
  );
}
