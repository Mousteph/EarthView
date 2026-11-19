import type { SevereEventCategoryOption } from "./categories";
import { categoryColorToken, DEFAULT_SEVERE_EVENT_COLOR } from "./categories.ts";
import type { SevereEvent } from "./model";
import type { DesignColorToken } from "@/shared/designTokens";

export type SevereAlertLevel = "Green" | "Orange" | "Red" | "Unknown";
export type SevereAlertFilters = Readonly<Record<string, readonly SevereAlertLevel[]>>;
export const ALERT_LEVELS: readonly SevereAlertLevel[] = ["Green", "Orange", "Red"];
export function alertLevel(event: SevereEvent): SevereAlertLevel { return event.alertLevel ?? "Unknown"; }
export function passesAlertFilter(event: SevereEvent, categoryId: string, filters: SevereAlertFilters) {
  const selected = filters[categoryId] ?? [];
  return !selected.length || selected.includes(alertLevel(event));
}
export function severeAlertOptions(events: readonly SevereEvent[], categoryId: string): readonly SevereAlertLevel[] {
  return events.some((event) => event.categories.some((c) => c.id === categoryId) && alertLevel(event) === "Unknown") ? [...ALERT_LEVELS, "Unknown"] : ALERT_LEVELS;
}

export type SevereEventCategoryCounts = Readonly<Record<string, number>>;

export function filterSevereEvents(events: readonly SevereEvent[], enabledCategories: readonly string[], filters: SevereAlertFilters = {}): SevereEvent[] {
  if (enabledCategories.length === 0) return [];
  const enabled = new Set(enabledCategories);
  return events.filter((event) => event.categories.some((category) => enabled.has(category.id) && passesAlertFilter(event, category.id, filters)));
}

export function severeEventCategoryCounts(events: readonly SevereEvent[], filters: SevereAlertFilters = {}): SevereEventCategoryCounts {
  const counts: Record<string, number> = {};
  for (const event of events) {
    for (const category of event.categories) {
      counts[category.id] ??= 0;
      if (passesAlertFilter(event, category.id, filters)) counts[category.id] += 1;
    }
  }
  return counts;
}

export function toggleSevereEventCategory(enabled: readonly string[], categoryId: string): string[] {
  return enabled.includes(categoryId)
    ? enabled.filter((item) => item !== categoryId)
    : [...enabled, categoryId];
}

export function reconcileSevereEventCategories(enabled: readonly string[], categories: readonly SevereEventCategoryOption[]): string[] {
  const available = new Set(categories.map((category) => category.id));
  return enabled.filter((categoryId) => available.has(categoryId));
}

export function severeEventColorToken(event: SevereEvent, enabledCategories: readonly string[]): DesignColorToken {
  const enabled = new Set(enabledCategories);
  const category = event.categories.find((item) => enabled.has(item.id));
  return category ? categoryColorToken(category.id) : DEFAULT_SEVERE_EVENT_COLOR;
}

export function reconcileSevereAlertFilters(filters: SevereAlertFilters, events: readonly SevereEvent[]): SevereAlertFilters {
  const next = Object.fromEntries(Object.entries(filters).map(([category, values]) => [category, category === "earthquakes" ? values.filter((level) => ["Green", "Orange", "Red", "Unknown"].includes(level)) : values.filter((level) => severeAlertOptions(events, category).includes(level))]));
  return Object.keys(filters).every((category) => filters[category].length === next[category].length) ? filters : next;
}
