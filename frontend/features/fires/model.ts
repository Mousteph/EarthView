export type Fire = {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
  readonly time: number;
  readonly confidence: string | null;
  readonly frp: number | null;
  readonly satellite: string | null;
  readonly instrument: string | null;
};

export function isFire(value: unknown): value is Fire {
  if (!value || typeof value !== "object") return false;
  const fire = value as Record<string, unknown>;
  return typeof fire.id === "string"
    && typeof fire.lat === "number"
    && typeof fire.lon === "number"
    && typeof fire.time === "number"
    && (fire.confidence === null || typeof fire.confidence === "string")
    && (fire.frp === null || typeof fire.frp === "number")
    && (fire.satellite === null || typeof fire.satellite === "string")
    && (fire.instrument === null || typeof fire.instrument === "string");
}

