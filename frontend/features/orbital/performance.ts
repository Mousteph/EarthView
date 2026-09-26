import type { OrbitalMode } from "./model";

export type TimingSummary = {
  readonly samples: number;
  readonly latestMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
};

export type FeedTimingSummary = {
  readonly request: TimingSummary;
  readonly bodyAndJson: TimingSummary;
  readonly validation: TimingSummary;
};

export type SatellitePerformance = {
  count: number;
  workerCalculation: TimingSummary;
  workerInitialization: TimingSummary;
  workerInitCount: number;
  feeds: Partial<Record<OrbitalMode, FeedTimingSummary>>;
};

declare global {
  interface Window {
    __EARTHVIEW_SATELLITES__?: SatellitePerformance;
  }
}

const SAMPLE_LIMIT = 30;
const samples = new Map<string, number[]>();
const emptyTiming: TimingSummary = { samples: 0, latestMs: 0, p50Ms: 0, p95Ms: 0 };

function getPerformance(): SatellitePerformance | null {
  const buildEnabled = process.env.NODE_ENV !== "production"
    || process.env.NEXT_PUBLIC_EARTHVIEW_DEBUG === "1";
  if (!buildEnabled || typeof window === "undefined" || new URLSearchParams(window.location.search).get("debug") !== "1") return null;
  return window.__EARTHVIEW_SATELLITES__ ??= {
    count: 0,
    workerCalculation: emptyTiming,
    workerInitialization: emptyTiming,
    workerInitCount: 0,
    feeds: {},
  };
}

function recordSample(key: string, durationMs: number): TimingSummary {
  const values = samples.get(key) ?? [];
  values.push(durationMs);
  if (values.length > SAMPLE_LIMIT) values.shift();
  samples.set(key, values);

  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (fraction: number) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
  return { samples: sorted.length, latestMs: durationMs, p50Ms: percentile(0.5), p95Ms: percentile(0.95) };
}

export function recordSatelliteWorkerCreated(): void {
  const performance = getPerformance();
  if (performance) performance.workerInitCount += 1;
}

export function recordSatelliteWorkerInitialization(durationMs: number): void {
  const performance = getPerformance();
  if (performance) performance.workerInitialization = recordSample("worker-initialization", durationMs);
}

export function recordSatelliteWorkerCalculation(count: number, durationMs: number): void {
  const performance = getPerformance();
  if (!performance) return;
  performance.count = count;
  performance.workerCalculation = recordSample("worker-calculation", durationMs);
}

export function recordSatelliteFeedTiming(mode: OrbitalMode, stage: keyof FeedTimingSummary, durationMs: number): void {
  const performance = getPerformance();
  if (!performance) return;

  const current = performance.feeds[mode] ?? {
    request: emptyTiming,
    bodyAndJson: emptyTiming,
    validation: emptyTiming,
  };
  performance.feeds[mode] = { ...current, [stage]: recordSample(`feed-${mode}-${stage}`, durationMs) };
}
