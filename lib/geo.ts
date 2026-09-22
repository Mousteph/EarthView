import { Vector3 } from "three";

export type GeoCoordinate = readonly [longitude: number, latitude: number];

export function geoToVector3([longitude, latitude]: GeoCoordinate, radius: number): Vector3 {
  const latitudeRadians = (latitude * Math.PI) / 180;
  const longitudeRadians = (longitude * Math.PI) / 180;
  const horizontalRadius = radius * Math.cos(latitudeRadians);

  return new Vector3(
    horizontalRadius * Math.sin(longitudeRadians),
    radius * Math.sin(latitudeRadians),
    horizontalRadius * Math.cos(longitudeRadians),
  );
}
