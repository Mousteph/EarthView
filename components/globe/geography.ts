import {
  BufferGeometry,
  Float32BufferAttribute,
  Sphere,
  Uint32BufferAttribute,
  Vector3,
} from "three";
import type { PreparedGeography } from "./geographyPreparation";

export type GeographicLod = "50m" | "10m";

type WorkerResult =
  | { ok: true; prepared: PreparedGeography }
  | { ok: false; message: string };

declare global {
  interface Window {
    __EARTHVIEW_GEOGRAPHY__?: Partial<Record<GeographicLod, {
      sourceVertices: number;
      buildMilliseconds: number;
    }>>;
  }
}

export const GEOGRAPHY_LOD_THRESHOLDS = {
  enterCloseDistance: 2.15,
  exitCloseDistance: 2.45,
} as const;

const countriesPaths: Record<GeographicLod, string> = {
  "50m": "/data/natural-earth/ne_50m_admin_0_countries.geojson",
  "10m": "/data/natural-earth/ne_10m_admin_0_countries.geojson",
};
const preparedGeography = new Map<GeographicLod, Promise<PreparedGeography>>();
const geographyBounds = new Sphere(new Vector3(), 1.0015);

function prepareInWorker(path: string) {
  return new Promise<PreparedGeography>((resolve, reject) => {
    const worker = new Worker(new URL("./geography.worker.ts", import.meta.url), {
      type: "module",
    });
    const cleanup = () => worker.terminate();

    worker.addEventListener("message", (event: MessageEvent<WorkerResult>) => {
      cleanup();
      if (event.data.ok) resolve(event.data.prepared);
      else reject(new Error(event.data.message));
    }, { once: true });
    worker.addEventListener("error", (event) => {
      cleanup();
      reject(event.error ?? new Error(event.message));
    }, { once: true });
    worker.postMessage(path);
  });
}

export function loadPreparedGeography(lod: GeographicLod) {
  const cached = preparedGeography.get(lod);
  if (cached) return cached;

  const request = prepareInWorker(countriesPaths[lod])
    .then((prepared) => {
      if (process.env.NODE_ENV !== "production") {
        window.__EARTHVIEW_GEOGRAPHY__ = {
          ...window.__EARTHVIEW_GEOGRAPHY__,
          [lod]: {
            sourceVertices: prepared.sourceVertices,
            buildMilliseconds: prepared.buildMilliseconds,
          },
        };
      }

      return prepared;
    })
    .catch((error) => {
      preparedGeography.delete(lod);
      throw error;
    });

  preparedGeography.set(lod, request);
  return request;
}

export function createGeographyGeometries(prepared: PreparedGeography) {
  const land = new BufferGeometry();
  land.setAttribute("position", new Float32BufferAttribute(prepared.landPositions, 3));
  land.setIndex(new Uint32BufferAttribute(prepared.landIndices, 1));
  land.boundingSphere = geographyBounds.clone();

  const borders = new BufferGeometry();
  borders.setAttribute("position", new Float32BufferAttribute(prepared.borderPositions, 3));
  borders.setIndex(new Uint32BufferAttribute(prepared.borderIndices, 1));
  borders.boundingSphere = geographyBounds.clone();

  return { land, borders };
}
