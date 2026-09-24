import type { Satellite, SelectedSatellitePosition } from "@/lib/satellites";

export type SatelliteWorkerInput =
  | { readonly type: "init"; readonly satellites: readonly Satellite[] }
  | { readonly type: "select"; readonly id: string | null };

export type SatelliteWorkerOutput =
  | { readonly type: "snapshot"; readonly startMs: number; readonly endMs: number; readonly first: Float32Array; readonly second: Float32Array; readonly calculationMs: number }
  | { readonly type: "selected"; readonly id: string; readonly position: SelectedSatellitePosition | null; readonly trajectory?: Float32Array | null }
  | { readonly type: "error"; readonly message: string };
