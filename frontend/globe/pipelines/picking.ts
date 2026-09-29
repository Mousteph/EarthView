export type PipelineRouteRange = {
  readonly id: string;
  readonly startSegment: number;
  readonly segmentCount: number;
};

export function routeRangeForSegment(ranges: readonly PipelineRouteRange[], segmentIndex: number) {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const range = ranges[middle];
    if (segmentIndex < range.startSegment) high = middle - 1;
    else if (segmentIndex >= range.startSegment + range.segmentCount) low = middle + 1;
    else return range;
  }
  return null;
}
