"use client";

import { useMemo, useState } from "react";
import { EarthquakeControls } from "@/components/earthquakes/EarthquakeControls";
import { GlobeScene } from "@/components/globe/GlobeScene";
import { useEarthquakes } from "@/lib/earthquakes";

export default function Home() {
  const [hasInteracted, setHasInteracted] = useState(false);
  const [earthquakesVisible, setEarthquakesVisible] = useState(false);
  const [selectedEarthquakeId, setSelectedEarthquakeId] = useState<string | null>(null);
  const { earthquakes, isLoading, error, refresh } = useEarthquakes();
  const selectedEarthquake = useMemo(
    () => earthquakes.find((earthquake) => earthquake.id === selectedEarthquakeId) ?? null,
    [earthquakes, selectedEarthquakeId],
  );

  const toggleEarthquakes = () => {
    if (earthquakesVisible) setSelectedEarthquakeId(null);
    setEarthquakesVisible((visible) => !visible);
  };

  const refreshEarthquakes = async () => {
    const updatedEarthquakes = await refresh();
    if (
      updatedEarthquakes
      && selectedEarthquakeId
      && !updatedEarthquakes.some((earthquake) => earthquake.id === selectedEarthquakeId)
    ) {
      setSelectedEarthquakeId(null);
    }
  };

  return (
    <main
      aria-label="Interactive Earth globe"
      className="earthview"
      onPointerDown={() => setHasInteracted(true)}
      onWheel={() => setHasInteracted(true)}
    >
      <div className="stage-title stage-title-behind" aria-hidden="true">Earth<br />View</div>
      <div className="globe-canvas">
        <GlobeScene
          autoRotate={!hasInteracted}
          earthquakes={earthquakes}
          earthquakesVisible={earthquakesVisible}
          selectedEarthquakeId={selectedEarthquakeId}
          onEarthquakeSelect={setSelectedEarthquakeId}
        />
      </div>
      <div className="stage-overlay" aria-hidden="true">
        <div className="stage-wordmark">EarthView</div>
        <div className="stage-context">Earth observation / 001</div>
        <div className="stage-footer">Explore by touch or scroll</div>
      </div>
      <EarthquakeControls
        visible={earthquakesVisible}
        isLoading={isLoading}
        error={error}
        selectedEarthquake={selectedEarthquake}
        onToggle={toggleEarthquakes}
        onRefresh={() => void refreshEarthquakes()}
      />
    </main>
  );
}
