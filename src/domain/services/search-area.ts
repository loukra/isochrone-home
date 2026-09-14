import type { TravelMode } from '../models/analysis.js';
import type { BoundingBox } from '../models/geo.js';

const KM_PER_DEGREE_LAT = 111.32;

/**
 * Luftlinie je Minute, je Verkehrsmittel an echten Isochronen gemessen
 * (Referenzregion, `smoothing: 0`, größter Abstand vom Startpunkt zum Rand der
 * Fläche):
 *
 * | Verkehrsmittel | 10 Min. | 25 Min. | 45 Min. |
 * | --- | ---: | ---: | ---: |
 * | Auto, Ortsmitte | 5,8-6,7 km | 31,2 km | -- |
 * | Auto, an der Autobahnauffahrt | 10,9 km | 35,4 km | -- |
 * | E-Bike | 3,5 km | 8,7 km | -- |
 * | Rad | 2,9 km | -- | 12,7 km |
 * | zu Fuß | 0,77 km | 2,1 km | 3,8 km |
 *
 * Rad, E-Bike und zu Fuß sind dabei linear -- dieselbe Zahl bei 10 wie bei 45
 * Minuten. **Das Auto ist es nicht**: 0,84 km/min bei 5 Minuten, 1,09 bei 10,
 * 1,36 bei 15, 1,42 bei 25. Wer die letzte Zahl auf alle anwendet, sucht bei
 * kurzen Zeiten weit über das hinaus, was in dieser Zeit erreichbar ist.
 *
 * Darum steht das Auto auf 1,0 statt auf 1,5 km/min (*geändert am 14.09.2026
 * auf Entscheidung des Nutzers*). Gemessen an 346 Schulen der Referenzregion,
 * echte Fahrzeitmatrix von fünf Stützstellen in der Region:
 *
 * | Luftlinie zur Region | Schulen | davon in <= 10 Min. | Median-Fahrzeit |
 * | --- | ---: | ---: | ---: |
 * | 0-3 km | 43 | 43 (100 %) | 6 Min. |
 * | 3-5 km | 20 | 5 (25 %) | 11 Min. |
 * | 5-8 km | 33 | 2 (6 %) | 19 Min. |
 * | 8-10 km | 70 | 0 | 25 Min. |
 * | 10-15 km | 92 | 0 | 30 Min. |
 *
 * 258 gefunden, 50 erreichbar -- und alle 50 innerhalb von 6,1 km. Der alte
 * 15-km-Ring bestand also zu vier Fünfteln aus Orten, die die Bedingung
 * nachweislich nie erfüllen; die Liste stand voll damit, und die Angabe
 * "x km außerhalb" war für die Entscheidung wertlos.
 *
 * Was das kostet, steht ausdrücklich hier: Bei 1,0 km/min deckt der Radius den
 * Autobahn-Bestfall nicht mehr ab. Ein Ort 12 km draußen, direkt an derselben
 * Auffahrt wie die Region, wäre in 10 Minuten erreichbar und wird nicht mehr
 * gefunden. Bei langen Zeiten fällt das stärker aus als bei kurzen (25 Min.:
 * 25 km Radius gegen 35,4 km gemessene Reichweite). Das ist die bewusst in
 * Kauf genommene Gegenseite -- anders als beim Vorfiltern von POIs ist sie
 * hier wenigstens eine Zahl, die man nachlesen und drehen kann.
 *
 * Ein gemeinsamer Wert ginge ohnehin nicht: Mit dem Autowert durchsucht eine
 * Bedingung "10 Minuten zu Fuß" einen Ring von 10 km um die Region -- ein
 * Vielfaches dessen, was jemand in zehn Minuten läuft.
 */
const KM_PER_MINUTE: Record<TravelMode, number> = {
  driving: 1.0,
  ebike: 0.35,
  cycling: 0.3,
  walking: 0.09,
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
