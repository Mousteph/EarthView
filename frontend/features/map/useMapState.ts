"use client";

import { useCallback, useState } from "react";
import type { OrbitalMode } from "@/features/orbital/model";
import { EMPTY_ORBITAL_FILTERS, type OrbitalFilterGroup, type OrbitalFilters } from "@/features/orbital/filters";
import { resolveSelection, type SelectionData, type SelectionKey } from "./selection";

export function useMapState() {
  const [earthquakesVisible, setEarthquakesVisible] = useState(false);
  const [firesVisible, setFiresVisible] = useState(false);
  const [enabledOrbitalModes, setEnabledOrbitalModes] = useState<readonly OrbitalMode[]>([]);
  const [orbitalFilters, setOrbitalFilters] = useState<OrbitalFilters>(EMPTY_ORBITAL_FILTERS);
  const [selection, setSelection] = useState<SelectionKey | null>(null);

  const toggleEarthquakes = useCallback(() => setEarthquakesVisible((visible) => !visible), []);
  const toggleFires = useCallback(() => setFiresVisible((visible) => !visible), []);
  const toggleOrbitalMode = useCallback((mode: OrbitalMode) => setEnabledOrbitalModes((current) =>
    current.includes(mode) ? current.filter((item) => item !== mode) : [...current, mode]), []);
  const changeOrbitalFilter = useCallback((group: OrbitalFilterGroup, values: readonly string[]) =>
    setOrbitalFilters((current) => ({ ...current, [group]: values })), []);
  const select = useCallback((next: SelectionKey) => setSelection(next), []);
  const clearSelection = useCallback(() => setSelection(null), []);
  const reconcileSelection = useCallback((data: SelectionData) => setSelection((current) =>
    current && !resolveSelection(current, data) ? null : current), []);

  return { earthquakesVisible, firesVisible, enabledOrbitalModes, orbitalFilters, selection,
    toggleEarthquakes, toggleFires, toggleOrbitalMode, changeOrbitalFilter, select, clearSelection, reconcileSelection };
}
