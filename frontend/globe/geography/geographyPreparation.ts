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

type LineStringGeometry = {
  type: "LineString";
  coordinates: Position[];
};

type MultiLineStringGeometry = {
  type: "MultiLineString";
  coordinates: Position[][];
};

type Geometry = PolygonGeometry | MultiPolygonGeometry | LineStringGeometry | MultiLineStringGeometry;

export type FeatureCollection = {
  features: Array<{ geometry: Geometry | null }>;
};

export type GeographySources = {
  land: FeatureCollection[];
  lakes: FeatureCollection;
  coastlines: FeatureCollection;
  borders: FeatureCollection;
};

export type PreparedGeography = {
  landPositions: Float32Array;
  landIndices: Uint32Array;
  lakePositions: Float32Array;
  lakeIndices: Uint32Array;
  coastlinePositions: Float32Array;
  coastlineIndices: Uint32Array;
  borderPositions: Float32Array;
  borderIndices: Uint32Array;
  sourceVertices: number;
  buildMilliseconds: number;
};

const earthRadius = 1;
const geographyRadius = 1.0015;
const lakeRadius = 1.00155;
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
  radius: number,
) {
  const firstPoint = geoToVector3([first.x, first.y], radius);
  const secondPoint = geoToVector3([second.x, second.y], radius);
  const thirdPoint = geoToVector3([third.x, third.y], radius);
  const angles = [
    firstPoint.angleTo(secondPoint),
    secondPoint.angleTo(thirdPoint),
    thirdPoint.angleTo(firstPoint),
  ];
  const longestAngle = Math.max(...angles);

  if (longestAngle > maximumLandEdgeRadians) {
    if (longestAngle === angles[0]) {
      const midpoint = first.clone().add(second).multiplyScalar(0.5);
      appendTriangle(builder, first, midpoint, third, radius);
      appendTriangle(builder, midpoint, second, third, radius);
      return;
    }

    if (longestAngle === angles[1]) {
      const midpoint = second.clone().add(third).multiplyScalar(0.5);
      appendTriangle(builder, first, second, midpoint, radius);
      appendTriangle(builder, first, midpoint, third, radius);
      return;
    }

    const midpoint = third.clone().add(first).multiplyScalar(0.5);
    appendTriangle(builder, first, second, midpoint, radius);
    appendTriangle(builder, midpoint, second, third, radius);
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

function asLineStrings(geometry: LineStringGeometry | MultiLineStringGeometry): Position[][] {
  return geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
}

function appendPathLines(builder: IndexedGeometryBuilder, coordinates: Position[]) {
  if (coordinates.length < 2) return;

  const path = unwrapClosedRing(coordinates);
  const points: Vector2[] = [];
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1];
    const end = path[index];
    const startPoint = geoToVector3([start.x, start.y], earthRadius);
    const endPoint = geoToVector3([end.x, end.y], earthRadius);
    const segmentCount = Math.max(
      1,
      Math.ceil(startPoint.angleTo(endPoint) / maximumRingEdgeRadians),
    );
    for (let segment = 0; segment < segmentCount; segment += 1) {
      points.push(start.clone().lerp(end, segment / segmentCount));
    }
  }
  points.push(path[path.length - 1]);

  for (let index = 1; index < points.length; index += 1) {
    const start = geoToVector3([points[index - 1].x, points[index - 1].y], geographyRadius);
    const end = geoToVector3([points[index].x, points[index].y], geographyRadius);
    const startIndex = addVertex(builder, start);
    const endIndex = addVertex(builder, end);
    builder.indices.push(startIndex, endIndex);
  }
}

function appendPolygonCollection(
  data: FeatureCollection,
  fill: IndexedGeometryBuilder,
  outlines: IndexedGeometryBuilder | undefined,
  radius: number,
  sourceVertexCount: { value: number },
) {
  for (const feature of data.features) {
    const geometry = feature.geometry;
    if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) continue;

    for (const polygon of asPolygons(geometry)) {
      const [outerRing, ...innerRings] = polygon;
      if (!outerRing || outerRing.length < 4) continue;

      sourceVertexCount.value += polygon.reduce((total, ring) => total + ring.length, 0);
      const contour = prepareRing(outerRing);
      if (contour.length < 3) continue;

      const holes = innerRings
        .filter((ring) => ring.length >= 4)
        .map((ring) => alignRing(prepareRing(ring), contour[0].x));
      const rings = [contour, ...holes];
      const vertices = rings.flat();

      for (const triangle of ShapeUtils.triangulateShape(contour, holes)) {
        appendTriangle(
          fill,
          vertices[triangle[0]],
          vertices[triangle[1]],
          vertices[triangle[2]],
          radius,
        );
      }

      if (outlines) {
        const outlineSegments = new Set<string>();
        for (const ring of rings) appendRingLines(outlines, outlineSegments, ring);
      }
    }
  }
}

function appendLineCollection(data: FeatureCollection, builder: IndexedGeometryBuilder) {
  for (const feature of data.features) {
    const geometry = feature.geometry;
    if (!geometry || (geometry.type !== "LineString" && geometry.type !== "MultiLineString")) continue;
    for (const line of asLineStrings(geometry)) appendPathLines(builder, line);
  }
}

export function prepareGeography(data: GeographySources): PreparedGeography {
  const startedAt = performance.now();
  const land: IndexedGeometryBuilder = { positions: [], indices: [], vertices: new Map() };
  const lakes: IndexedGeometryBuilder = { positions: [], indices: [], vertices: new Map() };
  const coastlines: IndexedGeometryBuilder = { positions: [], indices: [], vertices: new Map() };
  const borders: IndexedGeometryBuilder = { positions: [], indices: [], vertices: new Map() };
  const sourceVertexCount = { value: 0 };

  for (const collection of data.land) {
    appendPolygonCollection(collection, land, undefined, geographyRadius, sourceVertexCount);
  }
  appendPolygonCollection(data.lakes, lakes, undefined, lakeRadius, sourceVertexCount);
  appendLineCollection(data.coastlines, coastlines);
  appendLineCollection(data.borders, borders);

  return {
    landPositions: new Float32Array(land.positions),
    landIndices: new Uint32Array(land.indices),
    lakePositions: new Float32Array(lakes.positions),
    lakeIndices: new Uint32Array(lakes.indices),
    coastlinePositions: new Float32Array(coastlines.positions),
    coastlineIndices: new Uint32Array(coastlines.indices),
    borderPositions: new Float32Array(borders.positions),
    borderIndices: new Uint32Array(borders.indices),
    sourceVertices: sourceVertexCount.value,
    buildMilliseconds: performance.now() - startedAt,
  };
}
