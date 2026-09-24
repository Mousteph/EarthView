export const EARTH_RADIUS_KM = 6371;
export const SNAPSHOT_INTERVAL_MS = 5000;

export function earthFixedToGlobe(x: number, y: number, z: number) {
  return [y / EARTH_RADIUS_KM, z / EARTH_RADIUS_KM, x / EARTH_RADIUS_KM] as const;
}

export function snapshotAlpha(now: number, start: number, end: number) {
  if (end <= start) return 1;
  return Math.max(0, Math.min(1, (now - start) / (end - start)));
}

export function orbitPeriodMinutes(meanMotion: number) {
  return 1440 / meanMotion;
}

export function buildOrbitPath(
  startMs: number,
  periodMinutes: number,
  fixedGmst: number,
  positionAt: (timeMs: number) => { x: number; y: number; z: number } | null,
  samples = 256,
) {
  if (!Number.isFinite(periodMinutes) || periodMinutes <= 0 || samples < 3) return null;
  const points = new Float32Array(samples * 3);
  const cosine = Math.cos(fixedGmst);
  const sine = Math.sin(fixedGmst);
  for (let index = 0; index < samples; index += 1) {
    const position = positionAt(startMs + index * periodMinutes * 60_000 / samples);
    if (!position) return null;
    const offset = index * 3;
    const [x, y, z] = earthFixedToGlobe(
      position.x * cosine + position.y * sine,
      -position.x * sine + position.y * cosine,
      position.z,
    );
    points[offset] = x;
    points[offset + 1] = y;
    points[offset + 2] = z;
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
