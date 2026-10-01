import type { Metadata } from "next";
import Link from "next/link";
import { EarthViewHeader } from "@/shared/ui/EarthViewHeader";

export const metadata: Metadata = {
  title: "Data Sources | EarthView",
  description: "Sources for EarthView's live data, geography, relief, and Surface Earth View.",
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
    title: "Orbital objects",
    provider: "CelesTrak",
    description: "CelesTrak GP orbital elements and SATCAT catalog records supply the available active satellites, debris, and rocket bodies. EarthView propagates positions locally with SGP4. Mission and orbit labels are inferred; debris and rocket-body name searches are not a complete catalog.",
    href: "https://celestrak.org/satcat/satcat-format.php",
    linkLabel: "View CelesTrak SATCAT formats",
  },
  {
    number: "04",
    category: "Infrastructure",
    title: "Gas pipelines",
    provider: "Global Energy Monitor (GEM)",
    description: "Gas transmission routes and project metadata from the Global Gas Infrastructure Tracker, November 2025 release. Route geometry comes from GEM's public pipeline map export. Dataset data is licensed under CC BY 4.0; missing values are not inferred.",
    href: "https://globalenergymonitor.org/projects/global-gas-infrastructure-tracker",
    linkLabel: "View the Global Gas Infrastructure Tracker",
  },
  {
    number: "05",
    category: "Infrastructure",
    title: "Oil pipelines",
    provider: "Global Energy Monitor (GEM)",
    description: "Crude oil and natural gas liquids (NGL) transmission routes and project metadata from the Global Oil Infrastructure Tracker, June 2026 release. Route geometry comes from GEM's public pipeline map export. Dataset data is licensed under CC BY 4.0; missing values are not inferred.",
    href: "https://globalenergymonitor.org/projects/global-oil-infrastructure-tracker",
    linkLabel: "View the Global Oil Infrastructure Tracker",
  },
  {
    number: "06",
    category: "Base geography",
    title: "Land, lakes, islands, and borders",
    provider: "Natural Earth",
    description: "Locally bundled Natural Earth physical and boundary data provides global land, coastline, lake, island, and country-border geometry. The globe uses 1:50m data globally and 1:10m data for close inspection, with minor islands included at close range.",
    href: "https://www.naturalearthdata.com/about/terms-of-use/",
    linkLabel: "View Natural Earth data and terms",
  },
  {
    number: "07",
    category: "Base geography",
    title: "Land and seafloor relief",
    provider: "GEBCO Bathymetric Compilation Group (2026), GEBCO_2026 Grid",
    description: "EarthView derives its local land and seafloor slope-shading texture from the GEBCO_2026 Grid at 15 arc-second intervals. GEBCO does not endorse EarthView; the grid is not suitable for navigation or safety at sea.",
    href: "https://doi.org/10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa",
    linkLabel: "View GEBCO_2026 Grid citation",
  },
  {
    number: "08",
    category: "Earth Views",
    title: "Surface land appearance",
    provider: "Natural Earth",
    description: "The Surface view uses Cross-Blended Hypsometric Tints, Natural Earth raster version 3.2.0 at 1:10m resolution (21,600×10,800). The no-relief large raster is resampled with area averaging to 4,096×2,048 and stored as mipmapped UASTC KTX2. Natural Earth data is public domain; the globe keeps its GEBCO terrain shading and vector coastlines, lakes, islands, and borders.",
    href: "https://www.naturalearthdata.com/downloads/10m-raster-data/10m-cross-blend-hypso/",
    linkLabel: "View Natural Earth Cross-Blended Hypsometric Tints",
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
      <Link className="back-to-map" href="/">← Back to view</Link>
    </div>
  </main>;
}
