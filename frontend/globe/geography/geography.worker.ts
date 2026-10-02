import {
  prepareGeography,
  type FeatureCollection,
} from "./geographyPreparation";

type GeographyAssetPaths = {
  land: string[];
  lakes: string;
  coastlines: string;
  borders: string;
};

self.addEventListener("message", async (event: MessageEvent<GeographyAssetPaths>) => {
  try {
    const paths = event.data;
    const [land, lakes, coastlines, borders] = await Promise.all([
      Promise.all(paths.land.map(loadCollection)),
      loadCollection(paths.lakes),
      loadCollection(paths.coastlines),
      loadCollection(paths.borders),
    ]);

    const prepared = prepareGeography({ land, lakes, coastlines, borders });
    const transfer = [
      prepared.landPositions.buffer,
      prepared.landNormals.buffer,
      prepared.landIndices.buffer,
      prepared.lakePositions.buffer,
      prepared.lakeNormals.buffer,
      prepared.lakeIndices.buffer,
      prepared.coastlinePositions.buffer,
      prepared.coastlineIndices.buffer,
      prepared.borderPositions.buffer,
      prepared.borderIndices.buffer,
    ];

    self.postMessage({ ok: true, prepared }, { transfer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare geography";
    self.postMessage({ ok: false, message });
  }
});

async function loadCollection(path: string): Promise<FeatureCollection> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Unable to load ${path}`);
  return response.json() as Promise<FeatureCollection>;
}
