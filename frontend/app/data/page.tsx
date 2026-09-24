import type { Metadata } from "next";
import Link from "next/link";
import { EarthViewHeader } from "@/components/data/LayerControls";

export const metadata: Metadata = {
  title: "Data Sources | EarthView",
  description: "Sources for EarthView's earthquake, active fire, geography, and relief data.",
};

const sources = [
  {
    number: "01",
    category: "Live data",
    title: "Earthquakes",
    provider: "U.S. Geological Survey (USGS)",
    description: "EarthView uses the USGS all-earthquakes, past-day GeoJSON feed. Event locations, magnitudes, times, and depths come from this feed.",
    href: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php",
    linkLabel: "View USGS feed documentation",
  },
  {
    number: "02",
    category: "Live data",
    title: "Active fires",
    provider: "NASA Fire Information for Resource Management System (FIRMS)",
    description: "Near-real-time thermal detections come from the global VIIRS NOAA-20 Area API for the current UTC day. Fire radiative power is supplied in megawatts.",
    href: "https://firms.modaps.eosdis.nasa.gov/api/area/",
    linkLabel: "View NASA FIRMS Area API",
  },
  {
    number: "03",
    category: "Live data",
    title: "Satellites",
    provider: "CelesTrak",
    description: "Active satellite orbital elements are served from CelesTrak's public General Perturbations catalog. EarthView propagates positions locally from the element set.",
    href: "https://celestrak.org/NORAD/documentation/gp-data-formats.php",
    linkLabel: "View CelesTrak GP data formats",
  },
  {
    number: "04",
    category: "Base geography",
    title: "Land and country borders",
    provider: "Natural Earth",
    description: "Locally bundled Admin-0 Countries data provides the land and border geometry. The globe uses 1:50m data globally and 1:10m data for close inspection.",
    href: "https://www.naturalearthdata.com/about/terms-of-use/",
    linkLabel: "View Natural Earth data and terms",
  },
  {
    number: "05",
    category: "Base geography",
    title: "Land and seafloor relief",
    provider: "GEBCO Compilation Group (2025), GEBCO 2025 Grid",
    description: "EarthView derives its local land and seafloor shading texture from the GEBCO 2025 Grid. GEBCO does not endorse EarthView; the grid is not suitable for navigation or safety at sea.",
    href: "https://doi.org/10.5285/37c52e96-24ea-67ce-e063-7086abc05f29",
    linkLabel: "View GEBCO 2025 Grid citation",
  },
] as const;

export default function DataPage() {
  return <main className="data-page">
    <EarthViewHeader activePage="data" />
    <div className="data-page-content">
      <div className="data-page-intro">
        <p className="eyebrow">EarthView / References</p>
        <h1>Data sources<span>.</span></h1>
        <p>EarthView brings together public Earth observations and geographic reference data. These are the sources currently used by the application.</p>
      </div>
      <div className="data-source-list">
        {sources.map((source) => <article className="data-source-entry" key={source.number}>
          <span className="source-number">{source.number}</span>
          <div>
            <p className="source-category">{source.category}</p>
            <h2>{source.title}</h2>
            <p className="source-provider">{source.provider}</p>
            <p className="source-description">{source.description}</p>
            <a href={source.href} target="_blank" rel="noreferrer">{source.linkLabel} <span aria-hidden="true">↗</span></a>
          </div>
        </article>)}
      </div>
      <Link className="back-to-map" href="/">← Back to map</Link>
    </div>
  </main>;
}
