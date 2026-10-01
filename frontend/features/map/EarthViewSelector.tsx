"use client";

import { EARTH_VIEWS, type EarthViewId } from "@/globe/earthViews";

export function EarthViewSelector({ active, onChange }: { readonly active: EarthViewId; readonly onChange: (view: EarthViewId) => void }) {
  return <nav className="earth-view-selector" aria-label="Earth views">
    {EARTH_VIEWS.map((view) => <button
      key={view.id}
      type="button"
      className={`earth-view-selector-button${active === view.id ? " is-active" : ""}`}
      aria-label={`${view.label} Earth view`}
      aria-current={active === view.id ? "true" : undefined}
      onClick={() => onChange(view.id)}
    >
      <span className="earth-view-selector-dot" aria-hidden="true" />
      <span className="earth-view-selector-label" aria-hidden="true">{view.label}</span>
    </button>)}
  </nav>;
}
