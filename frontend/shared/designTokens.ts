export const DESIGN_COLOR_TOKENS = {
  parchment: "--color-parchment",
  white: "--color-white",
  land: "--color-land",
  ocean: "--color-ocean-blue",
  countryLine: "--color-country-line",
  earthquake: "--color-earthquake",
  fire: "--color-fire",
  satellite: "--color-satellite",
  debris: "--color-debris",
  rocketBody: "--color-rocket-body",
  missionCommunications: "--color-satellite",
  missionNavigation: "--color-orbital-mission-navigation",
  missionWeather: "--color-orbital-mission-weather",
  missionEarthObservation: "--color-orbital-mission-earth-observation",
  missionScience: "--color-orbital-mission-science",
  missionSpaceStations: "--color-orbital-mission-space-stations",
  missionDataRelay: "--color-orbital-mission-data-relay",
  missionSearchAndRescue: "--color-orbital-mission-search-rescue",
  missionTechnologyDemonstration: "--color-orbital-mission-technology",
  missionMilitarySurveillance: "--color-orbital-mission-military",
  missionOther: "--color-orbital-mission-other",
} as const;

export type DesignColorToken = typeof DESIGN_COLOR_TOKENS[keyof typeof DESIGN_COLOR_TOKENS];

const designColorCache = new Map<DesignColorToken, string>();

export function readDesignColor(token: DesignColorToken) {
  const cached = designColorCache.get(token);
  if (cached) return cached;

  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();

  if (!value) throw new Error(`Missing design color token: ${token}`);
  designColorCache.set(token, value);
  return value;
}
