import { DESIGN_COLOR_TOKENS, type DesignColorToken } from "../../shared/designTokens.ts";

export type SevereEventCategory = { readonly id: string; readonly title: string };

export type SevereEventCategoryOption = SevereEventCategory & { readonly colorToken: DesignColorToken };

export const SEVERE_EVENT_CATEGORIES: readonly SevereEventCategoryOption[] = [
  { id: "earthquakes", title: "Earthquakes", colorToken: DESIGN_COLOR_TOKENS.severeEarthquakes },
  { id: "active-fires", title: "Active Fires", colorToken: DESIGN_COLOR_TOKENS.fire },
  { id: "wildfires", title: "Wildfires", colorToken: DESIGN_COLOR_TOKENS.severeWildfires },
  { id: "floods", title: "Floods", colorToken: DESIGN_COLOR_TOKENS.severeFloods },
  { id: "cyclones", title: "Cyclones", colorToken: DESIGN_COLOR_TOKENS.severeCyclones },
  { id: "volcanoes", title: "Volcanoes", colorToken: DESIGN_COLOR_TOKENS.severeVolcanoes },
  { id: "droughts", title: "Droughts", colorToken: DESIGN_COLOR_TOKENS.severeDroughts },
];

export const DEFAULT_SEVERE_EVENT_COLOR = DESIGN_COLOR_TOKENS.severeOther;

export function categoryColorToken(categoryId: string): DesignColorToken {
  return SEVERE_EVENT_CATEGORIES.find((category) => category.id === categoryId)?.colorToken ?? DEFAULT_SEVERE_EVENT_COLOR;
}
