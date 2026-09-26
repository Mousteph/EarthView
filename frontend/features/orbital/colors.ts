import type { OrbitalMode, Satellite } from "./model";
import { DESIGN_COLOR_TOKENS, readDesignColor, type DesignColorToken } from "@/shared/designTokens";

const MISSION_COLOR_TOKENS: Readonly<Record<string, DesignColorToken>> = {
  Communications: DESIGN_COLOR_TOKENS.missionCommunications,
  Navigation: DESIGN_COLOR_TOKENS.missionNavigation,
  Weather: DESIGN_COLOR_TOKENS.missionWeather,
  "Earth Observation": DESIGN_COLOR_TOKENS.missionEarthObservation,
  Science: DESIGN_COLOR_TOKENS.missionScience,
  "Space Stations": DESIGN_COLOR_TOKENS.missionSpaceStations,
  "Data Relay": DESIGN_COLOR_TOKENS.missionDataRelay,
  "Search and Rescue": DESIGN_COLOR_TOKENS.missionSearchAndRescue,
  "Technology Demonstration": DESIGN_COLOR_TOKENS.missionTechnologyDemonstration,
  "Military / Surveillance": DESIGN_COLOR_TOKENS.missionMilitarySurveillance,
  "Other / Unclassified": DESIGN_COLOR_TOKENS.missionOther,
};

const MODE_COLOR_TOKENS: Readonly<Record<OrbitalMode, DesignColorToken>> = {
  active: DESIGN_COLOR_TOKENS.satellite,
  debris: DESIGN_COLOR_TOKENS.debris,
  rocket_bodies: DESIGN_COLOR_TOKENS.rocketBody,
};

const generatedMissionColors = new Map<string, string>();

function generatedColor(missionType: string): string {
  const cached = generatedMissionColors.get(missionType);
  if (cached) return cached;

  let hash = 0;
  for (let index = 0; index < missionType.length; index += 1) {
    hash = (hash * 31 + missionType.charCodeAt(index)) | 0;
  }
  const hue = ((hash % 360) + 360) % 360;
  const saturation = 30;
  const lightness = 45;
  const chroma = (1 - Math.abs(2 * lightness / 100 - 1)) * saturation / 100;
  const section = hue / 60;
  const secondary = chroma * (1 - Math.abs(section % 2 - 1));
  const [red, green, blue] = section < 1 ? [chroma, secondary, 0]
    : section < 2 ? [secondary, chroma, 0]
      : section < 3 ? [0, chroma, secondary]
        : section < 4 ? [0, secondary, chroma]
          : section < 5 ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  const offset = lightness / 100 - chroma / 2;
  const toHex = (channel: number) => Math.round((channel + offset) * 255).toString(16).padStart(2, "0");
  const color = `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
  generatedMissionColors.set(missionType, color);
  return color;
}

export function missionTypeColor(missionType: string | null): string {
  const token = MISSION_COLOR_TOKENS[missionType ?? "Other / Unclassified"];
  return token ? `var(${token})` : generatedColor(missionType!);
}

export function orbitalObjectColor(object: Pick<Satellite, "missionType"> & { readonly orbitalMode: OrbitalMode }): string {
  if (object.orbitalMode !== "active") return readDesignColor(MODE_COLOR_TOKENS[object.orbitalMode]);
  const token = MISSION_COLOR_TOKENS[object.missionType ?? "Other / Unclassified"];
  return token ? readDesignColor(token) : generatedColor(object.missionType!);
}
