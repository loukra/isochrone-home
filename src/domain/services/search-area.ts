import type { TravelMode } from '../models/analysis.js';
import type { BoundingBox } from '../models/geo.js';

const KM_PER_DEGREE_LAT = 111.32;

/**
 * Luftlinie je Minute -- für alles außer dem Auto, weil nur dort die
 * Reichweite wirklich linear mit der Zeit wächst. Gemessen an echten
 * Isochronen (`smoothing: 0`, größter Abstand vom Startpunkt zum Rand der
 * Fläche), Oldenburg und Delmenhorst, je Stadt und Land:
 *
 * | | 5 Min. | 15 Min. | 30 Min. | 60 Min. |
 * | --- | ---: | ---: | ---: | ---: |
 * | E-Bike | 0,38 | 0,37 | 0,36 | 0,35 |
 * | Rad | 0,32 | 0,30 | 0,30 | 0,29 |
 * | zu Fuß | 0,08 | 0,09 | 0,09 | 0,08 |
 *
 * Die Zahl steht über 5 bis 60 Minuten still -- ein einzelner Wert je
 * Verkehrsmittel trifft das also wirklich. Die Werte hier liegen bewusst ein
 * Stück darüber (25 bis 30 %): Großzügigkeit kostet hier fast nichts,
 * 30 % von 1,3 km sind 400 m.
 */
const KM_PER_MINUTE: Record<Exclude<TravelMode, 'driving'>, number> = {
  ebike: 0.5,
  cycling: 0.4,
  walking: 0.1,
};

/**
 * Das Auto ist die Ausnahme: Seine Reichweite wächst **nicht** linear mit der
 * Zeit, weil die ersten Minuten für die Anfahrt zur schnellen Straße
 * draufgehen. Gemessen (größte Luftlinie über sieben Startpunkte in
 * Oldenburg und Delmenhorst -- Zentrum, Land, Kleinstadt, Autobahnauffahrt,
 * Autobahnkreuz):
 *
 * | Fahrzeit | größte Reichweite | je Minute |
 * | ---: | ---: | ---: |
 * | 5 Min. | 4,2 km | 0,84 |
 * | 8 Min. | 8,2 km | 1,03 |
 * | 10 Min. | 11,1 km | 1,11 |
 * | 12 Min. | 15,6 km | 1,30 |
 * | 15 Min. | 20,4 km | 1,36 |
 * | 20 Min. | 27,7 km | 1,39 |
 * | 30 Min. | 49,8 km | 1,66 |
 * | 45 Min. | 81,7 km | 1,82 |
 * | 60 Min. | 110,5 km | 1,84 |
 *
 * Von 0,84 auf 1,84 km/min -- **das Doppelte**. Ein fester Wert kann das nicht
 * abbilden: 1,5 km/min suchte bei 5 Minuten fast doppelt so weit wie
 * erreichbar und bei 30 Minuten nur noch neun Zehntel davon. Beides ist ein
 * Fehler, nur fällt der erste als volle Liste auf und der zweite gar nicht.
 *
 * Darum steht hier die gemessene Kurve selbst, mit rund 10 % Luft nach oben.
 * Dazwischen wird linear interpoliert; weil die Kurve nach oben gekrümmt ist,
 * liegt jede Sehne über ihr -- Zwischenwerte sind also nie zu knapp.
 */
const DRIVING_REACH_KM: ReadonlyArray<readonly [minutes: number, km: number]> = [
  [5, 5],
  [8, 9],
  [10, 12],
  [12, 17],
  [15, 23],
  [20, 31],
  [30, 55],
  [45, 90],
  [60, 122],
];

const drivingReachKm = (minutes: number): number => {
  let previous: readonly [number, number] | null = null;

  for (const point of DRIVING_REACH_KM) {
    const [pointMinutes, pointKm] = point;

    if (minutes <= pointMinutes) {
      // Unterhalb der ersten Stützstelle gibt es nichts zu interpolieren --
      // dann gilt die Gerade durch den Nullpunkt.
      const [fromMinutes, fromKm] = previous ?? [0, 0];
      const span = pointMinutes - fromMinutes;
      return fromKm + ((pointKm - fromKm) * (minutes - fromMinutes)) / span;
    }

    previous = point;
  }

  // Über 60 Minuten rechnet ORS nicht (`maxTravelTimeMinutes`); falls die
  // Grenze je steigt, ist Fortschreiben mit der letzten Rate ehrlicher als
  // ein stiller Deckel.
  const [lastMinutes, lastKm] = previous ?? [1, 0];
  return (minutes / lastMinutes) * lastKm;
};

/** Obergrenze der Luftlinie, die in der angegebenen Zeit erreichbar ist. */
export const reachRadiusKm = (minutes: number, travelMode: TravelMode): number =>
  travelMode === 'driving' ? drivingReachKm(minutes) : minutes * KM_PER_MINUTE[travelMode];

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
