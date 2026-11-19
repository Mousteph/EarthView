export type GeoPoint = {
  readonly id: string;
  readonly lat: number;
  readonly lon: number;
};

export type GeoEvent = GeoPoint & {
  readonly time: number;
};
