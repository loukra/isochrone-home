import intersect from '@turf/intersect';
import bboxOf from '@turf/bbox';
import { featureCollection } from '@turf/helpers';
import type { AreaFeature, BoundingBox, Coordinate } from '../models/geo.js';

/**
 * Schnittmenge beliebig vieler Flächen, paarweise gefaltet.
 * Bei genau einer Fläche ist das Ergebnis diese Fläche (Spec 8).
 * Leere Schnittmenge -> null, kein Fehler.
 */
export const intersectAreas = (areas: AreaFeature[]): AreaFeature | null => {
  if (areas.length === 0) return null;

  let result: AreaFeature | null = areas[0] ?? null;

  for (const area of areas.slice(1)) {
    if (result === null) return null;
    result = intersect(featureCollection([result, area])) as AreaFeature | null;
  }

  return result;
};

/** Umschliessende Box über Flächen und Punkte; null wenn nichts vorhanden. */
export const boundsOf = (
  areas: AreaFeature[],
  points: Coordinate[] = [],
): BoundingBox | null => {
  if (areas.length === 0 && points.length === 0) return null;

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const area of areas) {
    const [w, s, e, n] = bboxOf(area);
    west = Math.min(west, w);
    south = Math.min(south, s);
    east = Math.max(east, e);
    north = Math.max(north, n);
  }

  for (const point of points) {
    west = Math.min(west, point.longitude);
    south = Math.min(south, point.latitude);
    east = Math.max(east, point.longitude);
    north = Math.max(north, point.latitude);
  }

  if (!Number.isFinite(west) || !Number.isFinite(south)) return null;
  if (!Number.isFinite(east) || !Number.isFinite(north)) return null;

  return [west, south, east, north];
};

const KM_PER_DEGREE_LAT = 111.32;

/**
 * Kürzeste Entfernung eines Punktes zur Fläche in Kilometern; 0 innerhalb.
 * Äquirektangulare Näherung -- auf den hier relevanten Distanzen genau genug.
 */
export const distanceToAreaKm = (point: Coordinate, area: AreaFeature): number => {
  const rings: number[][][] =
    area.geometry.type === 'Polygon'
      ? (area.geometry.coordinates as number[][][])
      : (area.geometry.coordinates as number[][][][]).flat();

  if (containsPoint(point, area)) return 0;

  const kmPerLon = KM_PER_DEGREE_LAT * Math.cos((point.latitude * Math.PI) / 180);
  let best = Infinity;

  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const from = ring[i] as [number, number];
      const to = ring[i + 1] as [number, number];

      const ax = (point.longitude - from[0]) * kmPerLon;
      const ay = (point.latitude - from[1]) * KM_PER_DEGREE_LAT;
      const bx = (to[0] - from[0]) * kmPerLon;
      const by = (to[1] - from[1]) * KM_PER_DEGREE_LAT;

      const lengthSquared = bx * bx + by * by;
      const t =
        lengthSquared > 0
          ? Math.max(0, Math.min(1, (ax * bx + ay * by) / lengthSquared))
          : 0;

      best = Math.min(best, Math.hypot(ax - t * bx, ay - t * by));
    }
  }

  return best;
};

/** Punkt-in-Fläche per Strahlenschnitt, Löcher berücksichtigt. */
export const containsPoint = (point: Coordinate, area: AreaFeature): boolean => {
  const polygons: number[][][][] =
    area.geometry.type === 'Polygon'
      ? [area.geometry.coordinates as number[][][]]
      : (area.geometry.coordinates as number[][][][]);

  const inRing = (ring: number[][]): boolean => {
    let inside = false;

    for (let i = 0; i < ring.length - 1; i++) {
      const [x1, y1] = ring[i] as [number, number];
      const [x2, y2] = ring[i + 1] as [number, number];

      if (y1 > point.latitude !== y2 > point.latitude) {
        const crossing = x1 + ((point.latitude - y1) * (x2 - x1)) / (y2 - y1);
        if (point.longitude < crossing) inside = !inside;
      }
    }

    return inside;
  };

  return polygons.some(
    (polygon) =>
      polygon[0] !== undefined &&
      inRing(polygon[0]) &&
      !polygon.slice(1).some((hole) => inRing(hole)),
  );
};
