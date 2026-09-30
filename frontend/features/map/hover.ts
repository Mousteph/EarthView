import type { Earthquake } from "@/features/earthquakes/model";
import type { Fire } from "@/features/fires/model";
import type { OrbitalObject } from "@/features/orbital/model";
import type { Pipeline } from "@/features/pipelines/model";

export type HoverKey =
  | { readonly type: "earthquakes"; readonly id: string }
  | { readonly type: "fires"; readonly id: string }
  | { readonly type: "satellites"; readonly id: string }
  | { readonly type: "pipelines"; readonly id: string };

export type HoverData = {
  readonly earthquakes: readonly Earthquake[];
  readonly fires: readonly Fire[];
  readonly orbitalObjects: readonly OrbitalObject[];
  readonly orbitalVisibility: Uint8Array;
  readonly earthquakesVisible: boolean;
  readonly firesVisible: boolean;
  readonly satellitesVisible: boolean;
  readonly pipelines: readonly Pipeline[];
  readonly pipelinesVisible: boolean;
  readonly orbitalColorFor: (object: OrbitalObject) => string;
};

export type HoverTooltip = {
  readonly type: HoverKey["type"];
  readonly title: string;
  readonly label: string;
  readonly detail: string | null;
  readonly accent: string;
};

function formatFirePower(megawatts: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(megawatts)} MW`;
}

function formatPipelineLength(lengthKm: number) {
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(lengthKm)} km`;
}

export function resolveHoverTooltip(key: HoverKey | null, data: HoverData): HoverTooltip | null {
  if (!key) return null;
  if (key.type === "earthquakes") {
    if (!data.earthquakesVisible) return null;
    const event = data.earthquakes.find((item) => item.id === key.id);
    return event ? { type: key.type, title: event.place, label: "Earthquake", detail: `Magnitude ${event.magnitude.toFixed(1)}`, accent: "var(--color-earthquake)" } : null;
  }
  if (key.type === "fires") {
    if (!data.firesVisible) return null;
    const event = data.fires.find((item) => item.id === key.id);
    return event ? {
      type: key.type,
      title: "Active fire",
      label: "Fire",
      detail: event.frp !== null ? `FRP ${formatFirePower(event.frp)}` : event.confidence ? `${event.confidence} confidence` : null,
      accent: "var(--color-fire)",
    } : null;
  }
  if (key.type === "satellites") {
    if (!data.satellitesVisible) return null;
    const index = data.orbitalObjects.findIndex((item) => item.id === key.id);
    const object = data.orbitalObjects[index];
    if (!object || !data.orbitalVisibility[index]) return null;
    const modeLabel = object.orbitalMode === "rocket_bodies" ? "Rocket body" : object.orbitalMode === "debris" ? "Debris" : "Satellite";
    const accent = data.orbitalColorFor(object);
    return { type: key.type, title: object.name, label: modeLabel, detail: object.objectType ?? modeLabel, accent };
  }

  if (!data.pipelinesVisible) return null;
  const pipeline = data.pipelines.find((item) => item.id === key.id);
  if (!pipeline) return null;
  return {
    type: key.type,
    title: pipeline.name,
    label: `${pipeline.fuel === "gas" ? "Gas" : "Oil"} pipeline · ${pipeline.type}`,
    detail: pipeline.status ?? (pipeline.lengthKm === null ? null : formatPipelineLength(pipeline.lengthKm)),
    accent: pipeline.fuel === "gas" ? "var(--color-pipeline-gas)" : "var(--color-pipeline-oil)",
  };
}
