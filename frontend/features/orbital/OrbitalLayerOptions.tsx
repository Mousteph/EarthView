"use client";

import { useState, type CSSProperties } from "react";
import type { OrbitalMode } from "./model";
import type { OrbitalFilterGroup } from "./filters";
import { missionTypeColor } from "./colors";
import { formatCount } from "@/shared/ui/format";
export type OrbitalControls = {
  readonly enabledModes: readonly OrbitalMode[];
  readonly onModeToggle: (mode: OrbitalMode) => void;
  readonly filters: Readonly<Record<OrbitalFilterGroup, readonly string[]>>;
  readonly selectedFilters: Readonly<Record<OrbitalFilterGroup, readonly string[]>>;
  readonly onFilterChange: (group: OrbitalFilterGroup, values: readonly string[]) => void;
};

export type OrbitalSummaryItem = { readonly id: OrbitalMode; readonly count: number; readonly hasLoaded: boolean };

export function OrbitalLayerOptions({ controls, summaryItems }: { readonly controls: OrbitalControls; readonly summaryItems: readonly OrbitalSummaryItem[] }) {
  const [openModes, setOpenModes] = useState<ReadonlySet<OrbitalMode>>(() => new Set());
  const [openGroups, setOpenGroups] = useState<ReadonlySet<OrbitalFilterGroup>>(() => new Set());
  const groups: readonly [OrbitalFilterGroup, string][] = [["missionTypes", "Mission type"], ["orbitClasses", "Orbit class"], ["constellations", "Constellation / group"]];
  const modes: readonly [OrbitalMode, string, string][] = [
    ["active", "Active", "satellite"],
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
        const summary = summaryItems.find((item) => item.id === mode);
        return <section className={"orbital-category orbital-category-" + color} key={mode}>
          <div className="orbital-category-row">
            <button className="orbital-category-choice" type="button" aria-pressed={controls.enabledModes.includes(mode)} onClick={() => controls.onModeToggle(mode)}>
              <span className="orbital-category-marker" aria-hidden="true" />
              <span>{label}{controls.enabledModes.includes(mode) && summary?.hasLoaded ? <> <output className="orbital-category-count">– {formatCount(summary.count)}</output></> : null}</span>
            </button>
            {mode === "active" ? <button className="orbital-disclosure" type="button" aria-label={(isOpen ? "Collapse " : "Expand ") + label + " filters"} aria-expanded={isOpen} onClick={() => toggleModeOpen(mode)}>
              <svg className={`orbital-chevron${isOpen ? " is-open" : ""}`} viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4 4 4 4-4" /></svg>
            </button> : null}
          </div>
          {isOpen && mode === "active" ? <div className="orbital-filter-groups">
            {groups.map(([group, groupLabel]) => controls.filters[group].length ? <section className="orbital-filter-group" key={group}>
              <button className="orbital-filter-heading" type="button" aria-expanded={openGroups.has(group)} onClick={() => toggleGroupOpen(group)}>
                <span>{groupLabel}</span><svg className={`orbital-chevron${openGroups.has(group) ? " is-open" : ""}`} viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4 4 4 4-4" /></svg>
              </button>
              {openGroups.has(group) ? <div className="orbital-filter-options">
                {controls.filters[group].map((value) => {
                  const isSelected = controls.selectedFilters[group].includes(value);
                  const markerStyle = group === "missionTypes"
                    ? { "--orbital-color": missionTypeColor(value) } as CSSProperties
                    : undefined;
                  return <button className="orbital-filter-option" type="button" key={value} aria-pressed={isSelected} onClick={() => {
                    const current = controls.selectedFilters[group];
                    controls.onFilterChange(group, isSelected ? current.filter((item) => item !== value) : [...current, value]);
                  }}><span className="orbital-category-marker" style={markerStyle} aria-hidden="true" />{value}</button>;
                })}
              </div> : null}
            </section> : null)}
          </div> : null}
        </section>;
      })}
    </div>
  </div>;
}
