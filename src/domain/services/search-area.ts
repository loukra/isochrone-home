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
 * 1,36 bei 15, 1,42 bei 25. Die ersten Minuten gehen für die Anfahrt zur
 * schnellen Straße drauf, deshalb kann ein einzelner Wert nur entweder die
 * kurzen oder die langen Zeiten treffen.
 *
 * Getroffen werden die kurzen: 1,1 km/min ist genau die gemessene Reichweite
 * bei 10 Minuten, und zwar die von der Autobahnauffahrt aus -- dem günstigsten
 * Punkt der Referenzregion. Zehn Minuten sind die Vorgabe der Bedingung und
 * die Zeit, die bei Schule, Supermarkt und Kita tatsächlich eingestellt wird.
 *
 * Vorher stand dort 1,5 km/min (*geändert am 14.09.2026 auf Entscheidung des
 * Nutzers*), abgeleitet aus einem geschätzten Tempo statt gemessen. Was das
 * kostete, ist nachgerechnet an 346 Schulen der Referenzregion, echte
 * Fahrzeitmatrix von fünf Stützstellen in der gemeinsamen Region:
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
 * 15-km-Ring bestand zu vier Fünfteln aus Orten, die die Bedingung
 * nachweislich nie erfüllen; die Liste stand voll damit, und die Angabe
 * "x km außerhalb" war für die Entscheidung wertlos.
 *
 * Was bleibt, steht ausdrücklich hier: Bei **langen** Zeiten deckt der Radius
 * die Reichweite nicht mehr ganz ab (25 Min.: 27,5 km gegen 35,4 km gemessen).
 * Ein Ort weit draußen an derselben Autobahn wie die Region wäre dort in der
 * Zeit erreichbar und wird nicht gefunden. Anders als beim Vorfiltern von POIs
 * ist das aber eine Zahl, die hier steht und die man drehen kann -- kein
 * stiller Ausschluss.
 *
 * Rad, E-Bike und zu Fuß liegen bewusst ein gutes Stück über ihrer Messung
 * (0,29 / 0,35 / 0,085): Dort kostet Großzügigkeit fast nichts -- 40 % von
 * 1,2 km sind 400 m --, während 40 % beim Auto fünf Kilometer Ring sind.
 * Ein gemeinsamer Wert ginge ohnehin nicht: Mit dem Autowert durchsuchte eine
 * Bedingung "10 Minuten zu Fuß" einen Ring von 11 km um die Region.
 */
const KM_PER_MINUTE: Record<TravelMode, number> = {
  driving: 1.1,
  ebike: 0.5,
  cycling: 0.4,
  walking: 0.1,
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
