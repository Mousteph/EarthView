import {
  BufferGeometry,
  Float32BufferAttribute,
  Sphere,
  Uint32BufferAttribute,
  Vector3,
} from "three";
import type { GeographySources, PreparedGeography } from "./geographyPreparation";

export type GeographicLod = "50m" | "10m";

type GeographyAssetPaths = {
  land: string[];
  lakes: string;
  coastlines: string;
  borders: string;
};

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

const geographyPaths: Record<GeographicLod, GeographyAssetPaths> = {
  "50m": {
    land: ["/data/natural-earth/ne_50m_land.geojson"],
    lakes: "/data/natural-earth/ne_50m_lakes.geojson",
    coastlines: "/data/natural-earth/ne_50m_coastline.geojson",
    borders: "/data/natural-earth/ne_50m_admin_0_boundary_lines_land.geojson",
  },
  "10m": {
    land: [
      "/data/natural-earth/ne_10m_land.geojson",
      "/data/natural-earth/ne_10m_minor_islands.geojson",
    ],
    lakes: "/data/natural-earth/ne_10m_lakes.geojson",
    coastlines: "/data/natural-earth/ne_10m_coastline.geojson",
    borders: "/data/natural-earth/ne_10m_admin_0_boundary_lines_land.geojson",
  },
};
const preparedGeography = new Map<GeographicLod, Promise<PreparedGeography>>();
const geographyBounds = new Sphere(new Vector3(), 1.0015);

function prepareInWorker(paths: GeographyAssetPaths) {
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
    worker.postMessage(paths);
  });
}

export function loadPreparedGeography(lod: GeographicLod) {
  const cached = preparedGeography.get(lod);
  if (cached) return cached;

  const request = prepareInWorker(geographyPaths[lod])
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
  const createSurface = (positions: Float32Array, indices: Uint32Array) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    const normals = new Float32Array(positions.length);
    for (let index = 0; index < normals.length; index += 3) {
      const x = positions[index];
      const y = positions[index + 1];
      const z = positions[index + 2];
      const length = Math.hypot(x, y, z);
      normals[index] = x / length;
      normals[index + 1] = y / length;
      normals[index + 2] = z / length;
    }
    geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
    geometry.setIndex(new Uint32BufferAttribute(indices, 1));
    geometry.boundingSphere = geographyBounds.clone();
    return geometry;
  };

  const land = createSurface(prepared.landPositions, prepared.landIndices);
  const lakes = createSurface(prepared.lakePositions, prepared.lakeIndices);

  const createLines = (positions: Float32Array, indices: Uint32Array) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setIndex(new Uint32BufferAttribute(indices, 1));
    geometry.boundingSphere = geographyBounds.clone();
    return geometry;
  };

  return {
    land,
    lakes,
    coastlines: createLines(prepared.coastlinePositions, prepared.coastlineIndices),
    borders: createLines(prepared.borderPositions, prepared.borderIndices),
  };
}
