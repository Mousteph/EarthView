"use client";

import { useState, type CSSProperties } from "react";
import type { SevereEventCategoryOption } from "./categories";
import { severeAlertOptions, type SevereEventCategoryCounts, type SevereAlertFilters, type SevereAlertLevel } from "./filters";
import type { SevereEvent } from "./model";
import { formatCount } from "@/shared/ui/format";
import type { MergedEarthquake, EarthquakeSource } from "@/features/earthquakes/model";
import { EARTHQUAKE_SOURCES, earthquakeAlertOptions } from "@/features/earthquakes/merge";
import { LayerIcon, type LayerIconName } from "@/shared/ui/LayerIcon";

const categoryIcons: Readonly<Record<string, LayerIconName>> = {
  earthquakes: "earthquake",
  floods: "flood",
  cyclones: "hurricane",
  volcanoes: "mountain",
  droughts: "sun-dim",
  wildfires: "flame",
  "active-fires": "flame",
};

export function SevereEventLayerOptions({ categories, enabledCategories, counts, loadedCategories, onToggle, events, alertFilters, onAlertChange, earthquakes, sourceFilters, onSourcesChange, errors }: {
  readonly earthquakes: readonly MergedEarthquake[];
  readonly sourceFilters: readonly EarthquakeSource[];
  readonly onSourcesChange: (sources: readonly EarthquakeSource[]) => void;
  readonly errors: Readonly<Record<string, string | null>>;
  readonly events: readonly SevereEvent[];
  readonly alertFilters: SevereAlertFilters;
  readonly onAlertChange: (categoryId: string, values: readonly SevereAlertLevel[]) => void;
  readonly categories: readonly SevereEventCategoryOption[];
  readonly enabledCategories: readonly string[];
  readonly counts: SevereEventCategoryCounts;
  readonly loadedCategories: readonly string[];
  readonly onToggle: (categoryId: string) => void;
}) {
  const [openCategories, setOpenCategories] = useState<readonly string[]>([]);
  return <div className="severe-event-options" role="group" aria-label="Natural event categories">
    {categories.map((category) => {
      const isOpen = openCategories.includes(category.id);
      const alerts = alertFilters[category.id] ?? [];
      const selected = enabledCategories.includes(category.id);
      const colorStyle = { "--orbital-color": `var(${category.colorToken})` } as CSSProperties;
      return <section className="orbital-category" key={category.id} style={colorStyle}>
        <div className="orbital-category-row">
          <button className="orbital-category-choice" type="button" aria-pressed={selected} onClick={() => onToggle(category.id)}>
            <LayerIcon className="layer-option-icon" name={categoryIcons[category.id] ?? "triangle-alert"} />
            <span>{category.title}{selected && loadedCategories.includes(category.id) ? <> <output className="orbital-category-count">– {formatCount(counts[category.id] ?? 0)}</output></> : null}<small className="layer-category-description">{category.id === "earthquakes" ? "Unique earthquakes · 7 days" : category.id === "active-fires" ? "NASA FIRMS heat detections · 24 hours" : category.id === "wildfires" ? "GDACS wildfire incidents · 7 days" : category.id === "droughts" ? "GDACS ongoing droughts" : "GDACS alerts · 7 days"}</small></span>
          </button>
          {category.id !== "active-fires" ? <button className="orbital-disclosure" type="button" aria-label={`${isOpen ? "Collapse" : "Expand"} ${category.title} alert filters`} aria-expanded={isOpen}
            onClick={() => setOpenCategories((current) => isOpen ? current.filter((id) => id !== category.id) : [...current, category.id])}>
            <svg className={`orbital-chevron${isOpen ? " is-open" : ""}`} viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4 4 4 4-4" /></svg>
          </button> : null}
        </div>
        {selected && errors[category.id] ? <p className="category-feed-error" role="status">{errors[category.id]}</p> : null}
        {isOpen ? <div className="pipeline-status-filter" role="group" aria-label={`${category.title} alert filters`}>
          {category.id === "earthquakes" ? <>
            <div className="orbital-filter-heading">Sources · empty means all</div>
            <div className="orbital-filter-options">{EARTHQUAKE_SOURCES.map((source) => <button key={source} type="button" className="orbital-filter-option" style={{ "--alert-color": "var(--color-earthquake)" } as CSSProperties} aria-pressed={sourceFilters.includes(source)}
              onClick={() => onSourcesChange(sourceFilters.includes(source) ? sourceFilters.filter((s) => s !== source) : [...sourceFilters, source])}>
              <span className="orbital-category-marker" aria-hidden="true" />{source}
            </button>)}</div>
          </> : null}
          <div className="orbital-filter-heading">GDACS alert · empty means all</div>
          <div className="orbital-filter-options">{(category.id === "earthquakes" ? earthquakeAlertOptions(earthquakes) : severeAlertOptions(events, category.id)).map((level) => <button key={level} type="button"
            className={`orbital-filter-option severe-alert-${level.toLowerCase()}`} aria-pressed={alerts.includes(level)}
            onClick={() => onAlertChange(category.id, alerts.includes(level) ? alerts.filter((item) => item !== level) : [...alerts, level])}>
            <span className="orbital-category-marker" aria-hidden="true" />{level}
          </button>)}</div>
        </div> : null}
      </section>;
    })}
  </div>;
}
