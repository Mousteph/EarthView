export type PipelineFuel = "gas" | "oil";
export type PipelineType = "Gas" | "Oil" | "NGL";
export type PipelineCoordinate = readonly [longitude: number, latitude: number];

export type Pipeline = {
  readonly id: string;
  readonly projectId: string;
  readonly fuel: PipelineFuel;
  readonly type: PipelineType;
  readonly name: string;
  readonly segmentName: string | null;
  readonly status: string | null;
  readonly countries: string | null;
  readonly owner: string | null;
  readonly parent: string | null;
  readonly operator: string | null;
  readonly lengthKm: number | null;
  readonly capacity: string | null;
  readonly capacityUnit: string | null;
  readonly startYear: string | null;
  readonly sourceUrl: string | null;
  readonly routeAccuracy: string | null;
  readonly routes: readonly (readonly PipelineCoordinate[])[];
};

export type PipelineFeed = {
  readonly fuel: PipelineFuel;
  readonly dataset: string;
  readonly release: string;
  readonly source: string;
  readonly sourceUrl: string;
  readonly fetchedAt: number;
  readonly stale: boolean;
  readonly pipelines: readonly Pipeline[];
};

export type PipelineFeedState = {
  readonly feed: PipelineFeed | null;
  readonly hasLoaded: boolean;
  readonly isLoading: boolean;
  readonly error: string | null;
};

export const EMPTY_PIPELINE_FEED_STATE: PipelineFeedState = {
  feed: null,
  hasLoaded: false,
  isLoading: false,
  error: null,
};

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isPipelineCoordinate(value: unknown): value is PipelineCoordinate {
  if (!Array.isArray(value) || value.length < 2) return false;
  const [longitude, latitude] = value;
  return typeof longitude === "number" && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    && typeof latitude === "number" && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90;
}

function isPipeline(value: unknown, fuel: PipelineFuel): value is Pipeline {
  if (!value || typeof value !== "object") return false;
  const pipeline = value as Record<string, unknown>;
  const validType = fuel === "gas" ? pipeline.type === "Gas" : pipeline.type === "Oil" || pipeline.type === "NGL";
  return typeof pipeline.id === "string"
    && typeof pipeline.projectId === "string"
    && pipeline.fuel === fuel
    && validType
    && typeof pipeline.name === "string"
    && isNullableString(pipeline.segmentName)
    && isNullableString(pipeline.status)
    && isNullableString(pipeline.countries)
    && isNullableString(pipeline.owner)
    && isNullableString(pipeline.parent)
    && isNullableString(pipeline.operator)
    && isNullableNumber(pipeline.lengthKm)
    && isNullableString(pipeline.capacity)
    && isNullableString(pipeline.capacityUnit)
    && isNullableString(pipeline.startYear)
    && isNullableString(pipeline.sourceUrl)
    && isNullableString(pipeline.routeAccuracy)
    && Array.isArray(pipeline.routes)
    && pipeline.routes.length > 0
    && pipeline.routes.every((route) => Array.isArray(route) && route.length >= 2 && route.every(isPipelineCoordinate));
}

export function isPipelineFeed(value: unknown, expectedFuel: PipelineFuel): value is PipelineFeed {
  if (!value || typeof value !== "object") return false;
  const feed = value as Record<string, unknown>;
  return feed.fuel === expectedFuel
    && typeof feed.dataset === "string"
    && typeof feed.release === "string"
    && typeof feed.source === "string"
    && typeof feed.sourceUrl === "string"
    && typeof feed.fetchedAt === "number"
    && Number.isFinite(feed.fetchedAt)
    && typeof feed.stale === "boolean"
    && Array.isArray(feed.pipelines)
    && feed.pipelines.every((pipeline) => isPipeline(pipeline, expectedFuel));
}
