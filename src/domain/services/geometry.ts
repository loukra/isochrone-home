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
