import type { Earthquake } from "@/features/earthquakes/model";
import type { Fire } from "@/features/fires/model";
import type { OrbitalMode, OrbitalObject, SelectedSatellitePosition } from "@/features/orbital/model";

export type SelectionKey = { readonly type: "earthquakes" | "fires" | "satellites"; readonly id: string };

export type SelectedEvent =
  | { readonly type: "earthquakes"; readonly event: Earthquake }
  | { readonly type: "fires"; readonly event: Fire }
  | { readonly type: "satellites"; readonly mode: OrbitalMode; readonly event: OrbitalObject; readonly position: SelectedSatellitePosition | null };

export type SelectionData = {
  readonly earthquakes: readonly Earthquake[];
  readonly fires: readonly Fire[];
  readonly orbitalObjects: readonly OrbitalObject[];
  readonly orbitalVisibility: Uint8Array;
  readonly earthquakesVisible: boolean;
  readonly firesVisible: boolean;
  readonly enabledOrbitalModes: readonly OrbitalMode[];
  readonly selectedSatellitePosition: SelectedSatellitePosition | null;
};

export function resolveSelection(selection: SelectionKey | null, data: SelectionData): SelectedEvent | null {
  if (!selection) return null;
  if (selection.type === "earthquakes") {
    if (!data.earthquakesVisible) return null;
    const event = data.earthquakes.find((item) => item.id === selection.id);
    return event ? { type: "earthquakes", event } : null;
  }
  if (selection.type === "fires") {
    if (!data.firesVisible) return null;
    const event = data.fires.find((item) => item.id === selection.id);
    return event ? { type: "fires", event } : null;
  }
  const index = data.orbitalObjects.findIndex((item) => item.id === selection.id);
  if (index < 0 || !data.orbitalVisibility[index]) return null;
  const event = data.orbitalObjects[index];
  if (!data.enabledOrbitalModes.includes(event.orbitalMode)) return null;
  return { type: "satellites", mode: event.orbitalMode, event, position: data.selectedSatellitePosition };
}
