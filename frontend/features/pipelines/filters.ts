import type { Pipeline, PipelineFuel } from "./model";

export type PipelineStatusFilters = Readonly<Record<PipelineFuel, readonly string[]>>;
export type PipelineStatusOptions = Readonly<Record<PipelineFuel, readonly string[]>>;
export type PipelineFuelCounts = Readonly<Record<PipelineFuel, number>>;

export const EMPTY_PIPELINE_STATUS_FILTERS: PipelineStatusFilters = { gas: [], oil: [] };
export const UNSPECIFIED_PIPELINE_STATUS = "Unspecified";

export function pipelineStatusValue(status: string | null): string {
  return status?.trim() || UNSPECIFIED_PIPELINE_STATUS;
}

export function pipelineStatusOptions(pipelines: readonly Pipeline[]): PipelineStatusOptions {
  const options: Record<PipelineFuel, Set<string>> = { gas: new Set(), oil: new Set() };
  for (const pipeline of pipelines) options[pipeline.fuel].add(pipelineStatusValue(pipeline.status));
  return {
    gas: [...options.gas].sort((left, right) => left.localeCompare(right)),
    oil: [...options.oil].sort((left, right) => left.localeCompare(right)),
  };
}

export function filterPipelines(pipelines: readonly Pipeline[], filters: PipelineStatusFilters): Pipeline[] {
  return pipelines.filter((pipeline) => {
    const selected = filters[pipeline.fuel];
    return selected.length === 0 || selected.includes(pipelineStatusValue(pipeline.status));
  });
}

export function togglePipelineStatus(selected: readonly string[], status: string): string[] {
  return selected.includes(status)
    ? selected.filter((value) => value !== status)
    : [...selected, status];
}

export function reconcilePipelineStatusFilters(
  filters: PipelineStatusFilters,
  options: PipelineStatusOptions,
): PipelineStatusFilters {
  return {
    gas: filters.gas.filter((status) => options.gas.includes(status)),
    oil: filters.oil.filter((status) => options.oil.includes(status)),
  };
}
