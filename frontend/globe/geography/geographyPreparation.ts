import { ShapeUtils, Vector2, Vector3 } from "three";
import { geoToVector3, type GeoCoordinate } from "@/globe/geo";

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

export type FeatureCollection = {
  features: Array<{ geometry: PolygonGeometry | MultiPolygonGeometry | null }>;
};

export type PreparedGeography = {
  landPositions: Float32Array;
  landIndices: Uint32Array;
  borderPositions: Float32Array;
  borderIndices: Uint32Array;
  sourceVertices: number;
  buildMilliseconds: number;
};

const earthRadius = 1;
const geographyRadius = 1.0015;
const maximumLandEdgeRadians = (4 * Math.PI) / 180;
const maximumRingEdgeRadians = Math.PI / 180;

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
    const startPoint = geoToVector3([start.x, start.y], earthRadius);
    const endPoint = geoToVector3([end.x, end.y], earthRadius);
    const segmentCount = Math.max(
      1,
      Math.ceil(startPoint.angleTo(endPoint) / maximumRingEdgeRadians),
    );

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

function positionKey(point: Vector3) {
  return `${Math.fround(point.x)},${Math.fround(point.y)},${Math.fround(point.z)}`;
}

type IndexedGeometryBuilder = {
  positions: number[];
  indices: number[];
  vertices: Map<string, number>;
};

function addVertex(builder: IndexedGeometryBuilder, point: Vector3) {
  const key = positionKey(point);
  const existing = builder.vertices.get(key);

  if (existing !== undefined) return existing;

  const index = builder.positions.length / 3;
  builder.positions.push(Math.fround(point.x), Math.fround(point.y), Math.fround(point.z));
  builder.vertices.set(key, index);
  return index;
}

function appendTriangle(
  builder: IndexedGeometryBuilder,
  first: Vector2,
  second: Vector2,
  third: Vector2,
) {
  const firstPoint = geoToVector3([first.x, first.y], geographyRadius);
  const secondPoint = geoToVector3([second.x, second.y], geographyRadius);
  const thirdPoint = geoToVector3([third.x, third.y], geographyRadius);
  const angles = [
    firstPoint.angleTo(secondPoint),
    secondPoint.angleTo(thirdPoint),
    thirdPoint.angleTo(firstPoint),
  ];
  const longestAngle = Math.max(...angles);

  if (longestAngle > maximumLandEdgeRadians) {
    if (longestAngle === angles[0]) {
      const midpoint = first.clone().add(second).multiplyScalar(0.5);
      appendTriangle(builder, first, midpoint, third);
      appendTriangle(builder, midpoint, second, third);
      return;
    }

    if (longestAngle === angles[1]) {
      const midpoint = second.clone().add(third).multiplyScalar(0.5);
      appendTriangle(builder, first, second, midpoint);
      appendTriangle(builder, first, midpoint, third);
      return;
    }

    const midpoint = third.clone().add(first).multiplyScalar(0.5);
    appendTriangle(builder, first, second, midpoint);
    appendTriangle(builder, midpoint, second, third);
    return;
  }

  const normal = secondPoint
    .clone()
    .sub(firstPoint)
    .cross(thirdPoint.clone().sub(firstPoint));
  const centroid = firstPoint.clone().add(secondPoint).add(thirdPoint);
  const points = normal.dot(centroid) >= 0
    ? [firstPoint, secondPoint, thirdPoint]
    : [firstPoint, thirdPoint, secondPoint];

  builder.indices.push(...points.map((point) => addVertex(builder, point)));
}

function appendRingLines(
  builder: IndexedGeometryBuilder,
  segments: Set<string>,
  ring: Vector2[],
) {
  for (let index = 0; index < ring.length; index += 1) {
    const start = geoToVector3([ring[index].x, ring[index].y], geographyRadius);
    const next = ring[(index + 1) % ring.length];
    const end = geoToVector3([next.x, next.y], geographyRadius);
    const startIndex = addVertex(builder, start);
    const endIndex = addVertex(builder, end);
    const key = startIndex < endIndex
      ? `${startIndex}:${endIndex}`
      : `${endIndex}:${startIndex}`;

    if (segments.has(key)) continue;
    segments.add(key);
    builder.indices.push(startIndex, endIndex);
  }
}

export function prepareGeography(data: FeatureCollection): PreparedGeography {
  const startedAt = performance.now();
  const land: IndexedGeometryBuilder = { positions: [], indices: [], vertices: new Map() };
  const borders: IndexedGeometryBuilder = { positions: [], indices: [], vertices: new Map() };
  const borderSegments = new Set<string>();
  let sourceVertices = 0;

  for (const feature of data.features) {
    if (!feature.geometry) continue;

    for (const polygon of asPolygons(feature.geometry)) {
      const [outerRing, ...innerRings] = polygon;
      if (!outerRing || outerRing.length < 4) continue;

      sourceVertices += polygon.reduce((total, ring) => total + ring.length, 0);
      const contour = prepareRing(outerRing);
      if (contour.length < 3) continue;

      const holes = innerRings
        .filter((ring) => ring.length >= 4)
        .map((ring) => alignRing(prepareRing(ring), contour[0].x));
      const rings = [contour, ...holes];
      const vertices = rings.flat();

      for (const triangle of ShapeUtils.triangulateShape(contour, holes)) {
        appendTriangle(
          land,
          vertices[triangle[0]],
          vertices[triangle[1]],
          vertices[triangle[2]],
        );
      }

      for (const ring of rings) appendRingLines(borders, borderSegments, ring);
    }
  }

  return {
    landPositions: new Float32Array(land.positions),
    landIndices: new Uint32Array(land.indices),
    borderPositions: new Float32Array(borders.positions),
    borderIndices: new Uint32Array(borders.indices),
    sourceVertices,
    buildMilliseconds: performance.now() - startedAt,
  };
}
