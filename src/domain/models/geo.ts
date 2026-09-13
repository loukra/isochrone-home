import type { Feature, MultiPolygon, Polygon } from 'geojson';

export type Coordinate = {
  latitude: number;
  longitude: number;
};

/** Ein flächiges GeoJSON-Feature. Alles, was die Domain an Geometrie kennt. */
export type AreaFeature = Feature<Polygon | MultiPolygon>;

/** [west, south, east, north] */
export type BoundingBox = [number, number, number, number];

export const isValidCoordinate = (value: Coordinate): boolean =>
  Number.isFinite(value.latitude) &&
  Number.isFinite(value.longitude) &&
  value.latitude >= -90 &&
  value.latitude <= 90 &&
  value.longitude >= -180 &&
  value.longitude <= 180;

export const coordinateKey = (value: Coordinate): string =>
  `${value.latitude.toFixed(6)},${value.longitude.toFixed(6)}`;
