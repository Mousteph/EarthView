"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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
      <Link href="/" aria-current={activePage === "map" ? "page" : undefined}>View</Link>
      <Link href="/data" aria-current={activePage === "data" ? "page" : undefined}>Data</Link>
    </nav>
  </header>;
}

