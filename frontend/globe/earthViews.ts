export const EARTH_VIEWS = [
  { id: "editorial", label: "Editorial" },
  { id: "surface", label: "Surface" },
] as const;

export type EarthViewId = (typeof EARTH_VIEWS)[number]["id"];
