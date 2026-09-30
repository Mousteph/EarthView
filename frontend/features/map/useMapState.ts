"use client";

import { useCallback, useState } from "react";
import type { OrbitalMode } from "@/features/orbital/model";
import type { PipelineFuel } from "@/features/pipelines/model";
import { EMPTY_PIPELINE_STATUS_FILTERS, type PipelineStatusFilters } from "@/features/pipelines/filters";
import { EMPTY_ORBITAL_FILTERS, type OrbitalFilterGroup, type OrbitalFilters } from "@/features/orbital/filters";
import { resolveSelection, type SelectionData, type SelectionKey } from "./selection";

export function useMapState() {
  const [earthquakesVisible, setEarthquakesVisible] = useState(false);
  const [firesVisible, setFiresVisible] = useState(false);
  const [enabledOrbitalModes, setEnabledOrbitalModes] = useState<readonly OrbitalMode[]>([]);
  const [enabledPipelineFuels, setEnabledPipelineFuels] = useState<readonly PipelineFuel[]>([]);
  const [pipelineStatusFilters, setPipelineStatusFilters] = useState<PipelineStatusFilters>(EMPTY_PIPELINE_STATUS_FILTERS);
  const [orbitalFilters, setOrbitalFilters] = useState<OrbitalFilters>(EMPTY_ORBITAL_FILTERS);
  const [selection, setSelection] = useState<SelectionKey | null>(null);

  const toggleEarthquakes = useCallback(() => setEarthquakesVisible((visible) => !visible), []);
  const toggleFires = useCallback(() => setFiresVisible((visible) => !visible), []);
  const toggleOrbitalMode = useCallback((mode: OrbitalMode) => setEnabledOrbitalModes((current) =>
    current.includes(mode) ? current.filter((item) => item !== mode) : [...current, mode]), []);
  const togglePipelineFuel = useCallback((fuel: PipelineFuel) => setEnabledPipelineFuels((current) =>
    current.includes(fuel) ? current.filter((item) => item !== fuel) : [...current, fuel]), []);
  const changePipelineStatusFilters = useCallback((fuel: PipelineFuel, values: readonly string[]) =>
    setPipelineStatusFilters((current) => ({ ...current, [fuel]: values })), []);
  const reconcilePipelineStatusFilters = useCallback((values: PipelineStatusFilters) =>
    setPipelineStatusFilters((current) => {
      const unchanged = (left: readonly string[], right: readonly string[]) => left.length === right.length && left.every((value, index) => value === right[index]);
      return unchanged(current.gas, values.gas) && unchanged(current.oil, values.oil) ? current : values;
    }), []);
  const changeOrbitalFilter = useCallback((group: OrbitalFilterGroup, values: readonly string[]) =>
    setOrbitalFilters((current) => ({ ...current, [group]: values })), []);
  const select = useCallback((next: SelectionKey) => setSelection(next), []);
  const clearSelection = useCallback(() => setSelection(null), []);
  const reconcileSelection = useCallback((data: SelectionData) => setSelection((current) =>
    current && !resolveSelection(current, data) ? null : current), []);

  return { earthquakesVisible, firesVisible, enabledOrbitalModes, enabledPipelineFuels, pipelineStatusFilters, orbitalFilters, selection,
    toggleEarthquakes, toggleFires, toggleOrbitalMode, togglePipelineFuel, changePipelineStatusFilters, reconcilePipelineStatusFilters,
    changeOrbitalFilter, select, clearSelection, reconcileSelection };
}
