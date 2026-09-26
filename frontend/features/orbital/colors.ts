import type { OrbitalMode, Satellite } from "./model";

const MISSION_COLORS: Readonly<Record<string, string>> = {
  Communications: "#587b83",
  Navigation: "#3f7892",
  Weather: "#6d8f67",
  "Earth Observation": "#8d70a5",
  Science: "#b37759",
  "Space Stations": "#6c7f91",
  "Data Relay": "#438b91",
  "Search and Rescue": "#aa8241",
  "Technology Demonstration": "#a36682",
  "Military / Surveillance": "#7c745f",
  "Other / Unclassified": "#85847e",
};

const MODE_COLORS: Readonly<Record<OrbitalMode, string>> = {
  active: "#587b83",
  debris: "#a58558",
  rocket_bodies: "#b87553",
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
  if (!missionType) return MISSION_COLORS["Other / Unclassified"];
  return MISSION_COLORS[missionType] ?? generatedColor(missionType);
}

export function orbitalObjectColor(object: Pick<Satellite, "missionType"> & { readonly orbitalMode: OrbitalMode }): string {
  return object.orbitalMode === "active" ? missionTypeColor(object.missionType) : MODE_COLORS[object.orbitalMode];
}
