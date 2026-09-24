import { eciToGeodetic, gstime, json2satrec, propagate, type SatRec } from "satellite.js";
import { buildOrbitPath, EARTH_RADIUS_KM, orbitPeriodMinutes, SNAPSHOT_INTERVAL_MS } from "@/lib/satelliteMath";
import type { OrbitalElements, SatelliteWorkerInput, SatelliteWorkerOutput } from "./satelliteProtocol";

type OrbitRecord = { satellite: OrbitalElements; satrec: SatRec | null };

let records: OrbitRecord[] = [];
let selected: OrbitRecord | null = null;
let snapshotTimer: ReturnType<typeof setInterval> | null = null;
let selectedTimer: ReturnType<typeof setInterval> | null = null;
let lastTrajectoryAt = 0;
let lastSnapshotEndMs = 0;

function makeSatrec(satellite: OrbitalElements) {
  try {
    const epochMs = Date.parse(satellite.epoch);
    if (!Number.isFinite(epochMs) || epochMs > Date.now() + 5 * 60 * 1000) return null;
    return json2satrec({
      OBJECT_NAME: satellite.name,
      OBJECT_ID: "",
      EPOCH: satellite.epoch,
      MEAN_MOTION: satellite.meanMotion,
      ECCENTRICITY: satellite.eccentricity,
      INCLINATION: satellite.inclination,
      RA_OF_ASC_NODE: satellite.rightAscension,
      ARG_OF_PERICENTER: satellite.argOfPericenter,
      MEAN_ANOMALY: satellite.meanAnomaly,
      EPHEMERIS_TYPE: 0,
      CLASSIFICATION_TYPE: "U",
      NORAD_CAT_ID: satellite.noradId,
      ELEMENT_SET_NO: satellite.elementSetNo,
      REV_AT_EPOCH: satellite.revolutionNumber,
      BSTAR: satellite.bstar,
      MEAN_MOTION_DOT: satellite.meanMotionDot,
      MEAN_MOTION_DDOT: satellite.meanMotionDdot,
    });
  } catch {
    return null;
  }
}

function orbitPosition(record: OrbitRecord, timeMs: number) {
  if (!record.satrec) return null;
  const state = propagate(record.satrec, new Date(timeMs));
  if (!state) return null;
  const { x, y, z } = state.position;
  const radius = Math.hypot(x, y, z);
  if (!Number.isFinite(radius) || radius < EARTH_RADIUS_KM || radius > EARTH_RADIUS_KM * 100) return null;
  return state;
}

function snapshot(timeMs: number) {
  const positions = new Float32Array(records.length * 3);
  const gmst = gstime(new Date(timeMs));
  const cosine = Math.cos(gmst);
  const sine = Math.sin(gmst);
  const date = new Date(timeMs);

  for (let index = 0; index < records.length; index += 1) {
    const satrec = records[index].satrec;
    if (!satrec) continue;
    const state = propagate(satrec, date);
    if (!state) continue;
    const { x, y, z } = state.position;
    const radius = Math.hypot(x, y, z);
    if (!Number.isFinite(radius) || radius < EARTH_RADIUS_KM || radius > EARTH_RADIUS_KM * 100) continue;
    const offset = index * 3;
    positions[offset] = (-x * sine + y * cosine) / EARTH_RADIUS_KM;
    positions[offset + 1] = z / EARTH_RADIUS_KM;
    positions[offset + 2] = (x * cosine + y * sine) / EARTH_RADIUS_KM;
  }

  return positions;
}

function sendSnapshot() {
  const started = performance.now();
  const startMs = lastSnapshotEndMs || Date.now();
  const endMs = Math.max(startMs + SNAPSHOT_INTERVAL_MS, Date.now() + SNAPSHOT_INTERVAL_MS);
  const first = lastSnapshotEndMs ? undefined : snapshot(startMs);
  const second = snapshot(endMs);
  lastSnapshotEndMs = endMs;
  const message: SatelliteWorkerOutput = {
    type: "snapshot", startMs, endMs, ...(first ? { first } : {}), second, calculationMs: performance.now() - started,
  };
  self.postMessage(message, { transfer: first ? [first.buffer, second.buffer] : [second.buffer] });
}

function trajectory(record: OrbitRecord, timeMs: number) {
  const period = orbitPeriodMinutes(record.satellite.meanMotion);
  return buildOrbitPath(timeMs, period, gstime(new Date(timeMs)), (sampleTime) => orbitPosition(record, sampleTime)?.position ?? null);
}

function sendSelected(forceTrajectory = false) {
  if (!selected) return;
  const timeMs = Date.now();
  const state = orbitPosition(selected, timeMs);
  const position = state ? eciToGeodetic(state.position, gstime(new Date(timeMs))) : null;
  const details = position && state ? {
    latitude: position.latitude * 180 / Math.PI,
    longitude: position.longitude * 180 / Math.PI,
    altitudeKm: position.height,
    velocityKmS: Math.hypot(state.velocity.x, state.velocity.y, state.velocity.z),
  } : null;
  const refreshTrajectory = forceTrajectory || timeMs - lastTrajectoryAt >= 60_000;
  const path = refreshTrajectory ? trajectory(selected, timeMs) : undefined;
  if (refreshTrajectory) lastTrajectoryAt = timeMs;
  const message: SatelliteWorkerOutput = {
    type: "selected", id: selected.satellite.id, position: details,
    ...(refreshTrajectory ? { trajectory: path } : {}),
  };
  self.postMessage(message, path ? { transfer: [path.buffer] } : undefined);
}

self.addEventListener("message", (event: MessageEvent<SatelliteWorkerInput>) => {
  try {
    if (event.data.type === "init") {
      if (snapshotTimer) clearInterval(snapshotTimer);
      if (selectedTimer) clearInterval(selectedTimer);
      records = event.data.satellites.map((satellite) => ({ satellite, satrec: makeSatrec(satellite) }));
      selected = null;
      lastSnapshotEndMs = 0;
      sendSnapshot();
      snapshotTimer = setInterval(sendSnapshot, SNAPSHOT_INTERVAL_MS);
      selectedTimer = setInterval(() => sendSelected(), 1000);
      return;
    }
    const selectedId = event.data.id;
    selected = records.find((record) => record.satellite.id === selectedId) ?? null;
    lastTrajectoryAt = 0;
    sendSelected(true);
  } catch (error) {
    const message: SatelliteWorkerOutput = { type: "error", message: error instanceof Error ? error.message : "Unable to propagate satellites" };
    self.postMessage(message);
  }
});
