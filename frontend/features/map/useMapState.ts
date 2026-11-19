"use client";

import { useCallback, useState } from "react";
import type { EarthquakeSource } from "@/features/earthquakes/model";
import type { OrbitalMode } from "@/features/orbital/model";
import type { PipelineFuel } from "@/features/pipelines/model";
import { EMPTY_PIPELINE_STATUS_FILTERS, type PipelineStatusFilters } from "@/features/pipelines/filters";
import { type SevereEventCategoryOption } from "@/features/severe-events/categories";
import type { SevereEvent } from "@/features/severe-events/model";
import type { SevereAlertFilters, SevereAlertLevel } from "@/features/severe-events/filters";
import { reconcileSevereAlertFilters, reconcileSevereEventCategories as reconcileEventCategories, toggleSevereEventCategory as toggleEventCategory } from "@/features/severe-events/filters";
import { EMPTY_ORBITAL_FILTERS, type OrbitalFilterGroup, type OrbitalFilters } from "@/features/orbital/filters";
import { resolveSelection, type SelectionData, type SelectionKey } from "./selection";
import { INITIAL_VISUAL_LAYER_STATE, toggleVisualLayer, type VisualLayerId } from "./visualLayers";

export function useMapState() {
  const [enabledSevereEventCategories, setEnabledSevereEventCategories] = useState<readonly string[]>([]);
  const [earthquakeSourceFilters, setEarthquakeSourceFilters] = useState<readonly EarthquakeSource[]>([]);
  const changeEarthquakeSources = useCallback((sources: readonly EarthquakeSource[]) => setEarthquakeSourceFilters(sources), []);
  const earthquakesVisible = enabledSevereEventCategories.includes("earthquakes");
  const firesVisible = enabledSevereEventCategories.includes("active-fires");
  const [severeAlertFilters, setSevereAlertFilters] = useState<SevereAlertFilters>({});
  const reconcileSevereAlerts = useCallback((events: readonly SevereEvent[]) => setSevereAlertFilters((current) => reconcileSevereAlertFilters(current, events)), []);
  const changeSevereAlertFilter = useCallback((categoryId: string, values: readonly SevereAlertLevel[]) => setSevereAlertFilters((current) => ({ ...current, [categoryId]: values })), []);
  const [enabledOrbitalModes, setEnabledOrbitalModes] = useState<readonly OrbitalMode[]>([]);
  const [enabledPipelineFuels, setEnabledPipelineFuels] = useState<readonly PipelineFuel[]>([]);
  const [pipelineStatusFilters, setPipelineStatusFilters] = useState<PipelineStatusFilters>(EMPTY_PIPELINE_STATUS_FILTERS);
  const [orbitalFilters, setOrbitalFilters] = useState<OrbitalFilters>(EMPTY_ORBITAL_FILTERS);
  const [selection, setSelection] = useState<SelectionKey | null>(null);
  const [visualLayers, setVisualLayers] = useState(INITIAL_VISUAL_LAYER_STATE);

  const toggleSevereEventCategory = useCallback((categoryId: string) => setEnabledSevereEventCategories((current) =>
    toggleEventCategory(current, categoryId)), []);
  const reconcileSevereEventCategories = useCallback((categories: readonly SevereEventCategoryOption[]) =>
    setEnabledSevereEventCategories((current) => {
      const next = reconcileEventCategories(current, categories);
      return current.length === next.length && current.every((category, index) => category === next[index]) ? current : next;
    }), []);
  const toggleVisualLayerById = useCallback((layer: VisualLayerId) =>
    setVisualLayers((current) => toggleVisualLayer(current, layer)), []);
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

  return { earthquakeSourceFilters, changeEarthquakeSources, reconcileSevereAlerts, severeAlertFilters, changeSevereAlertFilter, earthquakesVisible, firesVisible, enabledSevereEventCategories, visualLayers, enabledOrbitalModes, enabledPipelineFuels, pipelineStatusFilters, orbitalFilters, selection,
    toggleSevereEventCategory, reconcileSevereEventCategories, toggleVisualLayer: toggleVisualLayerById, toggleOrbitalMode, togglePipelineFuel, changePipelineStatusFilters, reconcilePipelineStatusFilters,
    changeOrbitalFilter, select, clearSelection, reconcileSelection };
}
