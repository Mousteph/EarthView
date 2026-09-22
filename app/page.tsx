"use client";

import { useState } from "react";
import { GlobeScene } from "@/components/globe/GlobeScene";

export default function Home() {
  const [hasInteracted, setHasInteracted] = useState(false);

  return (
    <main
      aria-label="Interactive Earth globe"
      className="earthview"
      onPointerDown={() => setHasInteracted(true)}
      onWheel={() => setHasInteracted(true)}
    >
      <GlobeScene autoRotate={!hasInteracted} />
      <div className="stage-overlay" aria-hidden="true">
        <div className="stage-wordmark">EarthView</div>
        <div className="stage-context">Earth observation / 001</div>
        <div className="stage-title">Earth<br />View</div>
        <div className="stage-footer">Explore by touch or scroll</div>
      </div>
    </main>
  );
}
