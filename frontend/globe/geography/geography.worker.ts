import {
  prepareGeography,
  type FeatureCollection,
} from "./geographyPreparation";

self.addEventListener("message", async (event: MessageEvent<string>) => {
  try {
    const response = await fetch(event.data);
    if (!response.ok) throw new Error(`Unable to load ${event.data}`);

    const prepared = prepareGeography((await response.json()) as FeatureCollection);
    const transfer = [
      prepared.landPositions.buffer,
      prepared.landIndices.buffer,
      prepared.borderPositions.buffer,
      prepared.borderIndices.buffer,
    ];

    self.postMessage({ ok: true, prepared }, { transfer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare geography";
    self.postMessage({ ok: false, message });
  }
});
