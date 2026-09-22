import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from "three";
import { geoToVector3, type GeoCoordinate } from "@/lib/geo";

type Position = GeoCoordinate;
type Polygon = Position[][];
type MultiPolygon = Polygon[];

type PolygonGeometry = {
  type: "Polygon";
  coordinates: Polygon;
};

type MultiPolygonGeometry = {
  type: "MultiPolygon";
  coordinates: MultiPolygon;
};

type FeatureCollection = {
  features: Array<{ geometry: PolygonGeometry | MultiPolygonGeometry | null }>;
};

export type NaturalEarthData = {
  countries: FeatureCollection;
};

const countriesPath = "/data/natural-earth/ne_10m_admin_0_countries.geojson";
const maximumLandEdgeRadians = (4 * Math.PI) / 180;
const maximumRingEdgeRadians = Math.PI / 180;

let naturalEarthData: Promise<NaturalEarthData> | undefined;

export function loadNaturalEarthData() {
  naturalEarthData ??= fetch(countriesPath).then(async (response) => {
    if (!response.ok) throw new Error(`Unable to load ${countriesPath}`);

    return { countries: (await response.json()) as FeatureCollection };
  });

  return naturalEarthData;
}

function asPolygons(geometry: PolygonGeometry | MultiPolygonGeometry): Polygon[] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

function unwrapClosedRing(ring: Position[]) {
  let previousLongitude: number | undefined;

  return ring.map(([longitude, latitude]) => {
    let unwrappedLongitude = longitude;

    if (previousLongitude !== undefined) {
      while (unwrappedLongitude - previousLongitude > 180) unwrappedLongitude -= 360;
      while (unwrappedLongitude - previousLongitude < -180) unwrappedLongitude += 360;
    }

    previousLongitude = unwrappedLongitude;
    return new Vector2(unwrappedLongitude, latitude);
  });
}

function prepareRing(ring: Position[]) {
  const unwrappedRing = unwrapClosedRing(ring);
  const preparedRing: Vector2[] = [];

  for (let index = 1; index < unwrappedRing.length; index += 1) {
    const start = unwrappedRing[index - 1];
    const end = unwrappedRing[index];
    const startPoint = geoToVector3([start.x, start.y], 1);
    const endPoint = geoToVector3([end.x, end.y], 1);
    const segmentCount = Math.max(1, Math.ceil(startPoint.angleTo(endPoint) / maximumRingEdgeRadians));

    for (let segment = 0; segment < segmentCount; segment += 1) {
      preparedRing.push(start.clone().lerp(end, segment / segmentCount));
    }
  }

  return preparedRing;
}

function alignRing(ring: Vector2[], longitude: number) {
  const firstLongitude = ring[0]?.x;

  if (firstLongitude === undefined) return ring;

  const offset = Math.round((longitude - firstLongitude) / 360) * 360;
  return ring.map(({ x, y }) => new Vector2(x + offset, y));
}

function appendTriangle(
  positions: number[],
  first: Vector2,
  second: Vector2,
  third: Vector2,
  radius: number,
) {
  const firstPoint = geoToVector3([first.x, first.y], radius);
  const secondPoint = geoToVector3([second.x, second.y], radius);
  const thirdPoint = geoToVector3([third.x, third.y], radius);
  const firstSecondAngle = firstPoint.angleTo(secondPoint);
  const secondThirdAngle = secondPoint.angleTo(thirdPoint);
  const thirdFirstAngle = thirdPoint.angleTo(firstPoint);
  const longestAngle = Math.max(firstSecondAngle, secondThirdAngle, thirdFirstAngle);

  if (longestAngle <= maximumLandEdgeRadians) {
    positions.push(
      firstPoint.x,
      firstPoint.y,
      firstPoint.z,
      secondPoint.x,
      secondPoint.y,
      secondPoint.z,
      thirdPoint.x,
      thirdPoint.y,
      thirdPoint.z,
    );
    return;
  }

  if (longestAngle === firstSecondAngle) {
    const midpoint = first.clone().add(second).multiplyScalar(0.5);
    appendTriangle(positions, first, midpoint, third, radius);
    appendTriangle(positions, midpoint, second, third, radius);
    return;
  }

  if (longestAngle === secondThirdAngle) {
    const midpoint = second.clone().add(third).multiplyScalar(0.5);
    appendTriangle(positions, first, second, midpoint, radius);
    appendTriangle(positions, first, midpoint, third, radius);
    return;
  }

  const midpoint = third.clone().add(first).multiplyScalar(0.5);
  appendTriangle(positions, first, second, midpoint, radius);
  appendTriangle(positions, midpoint, second, third, radius);
}

export function createLandGeometry(data: FeatureCollection, radius = 1.0015) {
  const positions: number[] = [];

  for (const feature of data.features) {
    if (!feature.geometry) continue;

    for (const polygon of asPolygons(feature.geometry)) {
      const [outerRing, ...innerRings] = polygon;
      if (!outerRing || outerRing.length < 4) continue;

      const contour = prepareRing(outerRing);
      if (contour.length < 3) continue;

      const holes = innerRings
        .filter((ring) => ring.length >= 4)
        .map((ring) => alignRing(prepareRing(ring), contour[0].x));
      const vertices = [...contour, ...holes.flat()];

      for (const triangle of ShapeUtils.triangulateShape(contour, holes)) {
        appendTriangle(
          positions,
          vertices[triangle[0]],
          vertices[triangle[1]],
          vertices[triangle[2]],
          radius,
        );
      }
    }
  }

  return new BufferGeometry().setAttribute("position", new Float32BufferAttribute(positions, 3));
}

function addRingLine(positions: number[], ring: Position[], radius: number) {
  const preparedRing = prepareRing(ring);

  for (let index = 0; index < preparedRing.length; index += 1) {
    const nextIndex = (index + 1) % preparedRing.length;
    const start = preparedRing[index];
    const end = preparedRing[nextIndex];
    const startPoint = geoToVector3([start.x, start.y], radius);
    const endPoint = geoToVector3([end.x, end.y], radius);

    positions.push(startPoint.x, startPoint.y, startPoint.z, endPoint.x, endPoint.y, endPoint.z);
  }
}

export function createCountryBorderGeometry(data: FeatureCollection, radius = 1.0015) {
  const positions: number[] = [];

  for (const feature of data.features) {
    if (!feature.geometry) continue;

    for (const polygon of asPolygons(feature.geometry)) {
      for (const ring of polygon) addRingLine(positions, ring, radius);
    }
  }

  return new BufferGeometry().setAttribute("position", new Float32BufferAttribute(positions, 3));
}
