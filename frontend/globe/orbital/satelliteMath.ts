export const EARTH_RADIUS_KM = 6371;
export const SNAPSHOT_INTERVAL_MS = 5000;

export function writeEciToGlobe(
  target: Float32Array,
  offset: number,
  x: number,
  y: number,
  z: number,
  cosineGmst: number,
  sineGmst: number,
) {
  target[offset] = (-x * sineGmst + y * cosineGmst) / EARTH_RADIUS_KM;
  target[offset + 1] = z / EARTH_RADIUS_KM;
  target[offset + 2] = (x * cosineGmst + y * sineGmst) / EARTH_RADIUS_KM;
}

export function snapshotAlpha(now: number, start: number, end: number) {
  if (end <= start) return 1;
  return Math.max(0, Math.min(1, (now - start) / (end - start)));
}

export function orbitPeriodMinutes(meanMotion: number) {
  return 1440 / meanMotion;
}

export function buildCenteredOrbitPath(
  centerMs: number,
  periodMinutes: number,
  fixedGmst: number,
  positionAt: (timeMs: number) => { x: number; y: number; z: number } | null,
  samplesPerSide = 128,
) {
  if (!Number.isFinite(periodMinutes) || periodMinutes <= 0 || !Number.isInteger(samplesPerSide) || samplesPerSide < 1) return null;
  const sampleCount = samplesPerSide * 2 + 1;
  const points = new Float32Array(sampleCount * 3);
  const cosine = Math.cos(fixedGmst);
  const sine = Math.sin(fixedGmst);
  const halfPeriodMs = periodMinutes * 30_000;

  for (let index = 0; index < sampleCount; index += 1) {
    const sampleTime = centerMs - halfPeriodMs + index * halfPeriodMs / samplesPerSide;
    const position = positionAt(sampleTime);
    if (!position) return null;
    const offset = index * 3;
    writeEciToGlobe(points, offset, position.x, position.y, position.z, cosine, sine);
  }

  return points;
}

export function segmentHiddenByEarth(
  cameraX: number, cameraY: number, cameraZ: number,
  pointX: number, pointY: number, pointZ: number,
  radius = 1.0015,
) {
  const dx = pointX - cameraX;
  const dy = pointY - cameraY;
  const dz = pointZ - cameraZ;
  const squaredLength = dx * dx + dy * dy + dz * dz;
  if (squaredLength === 0) return false;
  const t = Math.max(0, Math.min(1, -(cameraX * dx + cameraY * dy + cameraZ * dz) / squaredLength));
  if (t === 0 || t === 1) return false;
  const x = cameraX + t * dx;
  const y = cameraY + t * dy;
  const z = cameraZ + t * dz;
  return x * x + y * y + z * z < radius * radius;
}
