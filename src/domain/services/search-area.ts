import type { TravelMode } from '../models/analysis.js';
import type { BoundingBox } from '../models/geo.js';

const KM_PER_DEGREE_LAT = 111.32;

/**
 * Luftlinie je Minute, je Verkehrsmittel bewusst über dem, was wirklich
 * erreichbar ist: Zu viel gefunden kostet nur Rechenzeit, zu wenig verfälscht
 * das Ergebnis unbemerkt. Auto 90 km/h (Autobahn), E-Bike 30, Rad 24, zu Fuß
 * 7,2 -- jeweils rund die Hälfte über dem Tempo, mit dem der Kartendienst für
 * dieses Profil rechnet.
 *
 * Ein gemeinsamer Wert ginge nicht: Mit 1,5 km/min durchsucht eine Bedingung
 * "10 Minuten zu Fuß" einen Ring von 15 km um die Region -- ein Vielfaches
 * dessen, was jemand in zehn Minuten läuft. Die Liste füllte sich mit Orten,
 * die für diese Bedingung nie in Frage kommen, und die Entfernungsangabe
 * ("x km außerhalb") wäre für die Entscheidung wertlos.
 */
const KM_PER_MINUTE: Record<TravelMode, number> = {
  driving: 1.5,
  ebike: 0.5,
  cycling: 0.4,
  walking: 0.12,
};

/** Obergrenze der Luftlinie, die in der angegebenen Zeit erreichbar ist. */
export const reachRadiusKm = (minutes: number, travelMode: TravelMode): number =>
  minutes * KM_PER_MINUTE[travelMode];

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
