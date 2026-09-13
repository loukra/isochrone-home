import type { BoundingBox } from '../models/geo.js';

const KM_PER_DEGREE_LAT = 111.32;

/**
 * Obergrenze der Luftlinie, die in der angegebenen Fahrzeit erreichbar ist.
 * Bewusst großzügig (90 km/h), damit kein erreichbarer POI durchrutscht --
 * zu viel gefunden kostet nur etwas Rechenzeit, zu wenig verfälscht das
 * Ergebnis unbemerkt.
 */
export const reachRadiusKm = (minutes: number): number => minutes * 1.5;

/**
 * Erweitert den Suchbereich um die Reichweite.
 *
 * Ein POI muss nicht in der Zielregion liegen, um sie zu bedienen: In der
 * Referenzregion liegen 33 von 59 relevanten Fitnessstudios außerhalb, das
 * nächste nur 900 m hinter der Kante. Ohne diesen Puffer fehlt die Mehrheit.
 */
export const expandBounds = (bounds: BoundingBox, km: number): BoundingBox => {
  const [west, south, east, north] = bounds;
  const deltaLat = km / KM_PER_DEGREE_LAT;
  const meanLat = (south + north) / 2;
  const kmPerDegreeLon = KM_PER_DEGREE_LAT * Math.cos((meanLat * Math.PI) / 180);
  const deltaLon = kmPerDegreeLon > 0 ? km / kmPerDegreeLon : 0;

  return [
    Math.max(-180, west - deltaLon),
    Math.max(-90, south - deltaLat),
    Math.min(180, east + deltaLon),
    Math.min(90, north + deltaLat),
  ];
};
