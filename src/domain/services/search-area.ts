import type { TravelMode } from '../models/analysis.js';
import type { BoundingBox } from '../models/geo.js';

const KM_PER_DEGREE_LAT = 111.32;

/**
 * Wie weit man je Minute Luftlinie kommt -- als Kurve, nicht als Zahl. Jedes
 * Verkehrsmittel hat eine; dass sie bei Rad, E-Bike und zu Fuß flach ist, ist
 * ein Messergebnis und kein anderer Mechanismus.
 *
 * Eine Stützstelle ist `[Fahrzeit, km je Minute]`. **Zwischenzeiten runden auf
 * die nächste Stützstelle auf**: 6 Minuten rechnen mit dem Wert von 10, 14 mit
 * dem von 15. Eine Kurve mit einer einzigen Stützstelle ist damit genau eine
 * Konstante.
 *
 * Aufrunden statt interpolieren ist hier nicht die bequemere, sondern die
 * belastbarere Wahl. Die Reichweite je Minute steigt mit der Fahrzeit; der
 * Wert bei 10 Minuten deckt deshalb jede kürzere Zeit mit ab, ohne dass
 * irgendetwas dazwischen gemessen sein muss. Interpoliert war genau das
 * **nicht** sicher: Mit Stützstellen bei 20, 25 und 30 Minuten lag der Radius
 * bei 22 und 27 Minuten nachgemessen 3 % zu niedrig -- die echte Kurve steigt
 * dort steiler als die Sehne, und ein erreichbarer Ort wäre unbemerkt aus der
 * Liste gefallen.
 */
type ReachCurve = readonly [
  readonly [minutes: number, kmPerMinute: number],
  ...Array<readonly [minutes: number, kmPerMinute: number]>,
];

/**
 * Gemessen an echten Isochronen (`smoothing: 0`, größter Abstand vom
 * Startpunkt zum Rand der Fläche): 126 Messungen über sieben Startpunkte in
 * Oldenburg **und** Delmenhorst -- Zentrum, Land, Kleinstadt,
 * Autobahnauffahrt, Autobahnkreuz.
 *
 * **Das Auto ist das einzige, dessen Kurve steigt** -- von 0,84 auf 1,84 km je
 * Minute, dem Doppelten. Die ersten Minuten gehen für die Anfahrt zur
 * schnellen Straße drauf; erst danach zählt das Tempo der Autobahn. Ein fester
 * Wert kann davon nur ein Ende treffen: Der frühere Wert 1,5 km/min suchte bei
 * 5 Minuten fast doppelt so weit wie erreichbar und bei 30 Minuten nur noch
 * neun Zehntel davon -- beides falsch, aber nur das erste sichtbar. Eine zu
 * lange Liste fällt auf, ein fehlender Ort nicht.
 *
 * | Fahrzeit | gemessen | je Min. | | Fahrzeit | gemessen | je Min. |
 * | ---: | ---: | ---: | --- | ---: | ---: | ---: |
 * | 5 Min. | 4,2 km | 0,84 | | 22 Min. | 32,3 km | 1,47 |
 * | 6 Min. | 5,4 km | 0,90 | | 25 Min. | 35,4 km | 1,42 |
 * | 8 Min. | 8,2 km | 1,03 | | 27 Min. | 43,2 km | 1,60 |
 * | 9 Min. | 9,7 km | 1,07 | | 30 Min. | 49,8 km | 1,66 |
 * | 10 Min. | 11,1 km | 1,11 | | 35 Min. | 60,6 km | 1,73 |
 * | 11 Min. | 13,1 km | 1,19 | | 45 Min. | 81,7 km | 1,82 |
 * | 12 Min. | 15,6 km | 1,30 | | 50 Min. | 91,2 km | 1,82 |
 * | 13 Min. | 17,5 km | 1,35 | | 60 Min. | 110,5 km | 1,84 |
 * | 15 Min. | 20,4 km | 1,36 | | | | |
 * | 18 Min. | 24,2 km | 1,34 | | | | |
 * | 20 Min. | 27,7 km | 1,39 | | | | |
 *
 * Eine Stützstelle trägt das aufgerundete Maximum **bis zu ihrer Fahrzeit**,
 * nicht nur den Wert an dieser einen Stelle -- sonst zöge eine dichter
 * gemessene Zwischenzeit (22 Min.: 1,47) die spätere (25 Min.: 1,42) nach
 * unten. Aufgerundet wird auf die nächsten 0,05 km je Minute, mehr nicht.
 *
 * **Bei den drei übrigen steht die Zahl still**, über 5 bis 60 Minuten hinweg:
 * E-Bike 0,385 bis 0,346, Rad 0,318 bis 0,283, zu Fuß 0,092 bis 0,083. Sie
 * bekommen deshalb eine Kurve mit einer einzigen Stützstelle -- die größte
 * gemessene Rate, aufgerundet; die Minutenzahl daneben sagt nur, wo dieses
 * Maximum lag.
 *
 * `tests/search-area.test.ts` prüft jede der 19 gemessenen Fahrzeiten einzeln.
 * Neue Messungen gehören dorthin, nicht in einen Kommentar.
 */
const REACH_CURVES: Record<TravelMode, ReachCurve> = {
  driving: [
    [5, 0.85],
    [10, 1.15],
    [20, 1.4],
    [25, 1.5],
    [30, 1.7],
    [45, 1.85],
  ],
  ebike: [[5, 0.4]],
  cycling: [[5, 0.35]],
  walking: [[15, 0.1]],
};

const kmPerMinuteAt = (curve: ReachCurve, minutes: number): number => {
  for (const [pointMinutes, pointRate] of curve) {
    if (minutes <= pointMinutes) return pointRate;
  }

  // Über 60 Minuten rechnet ORS nicht (`maxTravelTimeMinutes`); falls die
  // Grenze je steigt, ist Fortschreiben mit der letzten Rate ehrlicher als ein
  // stiller Deckel.
  const [, lastRate] = curve[curve.length - 1] ?? curve[0];
  return lastRate;
};

/** Obergrenze der Luftlinie, die in der angegebenen Zeit erreichbar ist. */
export const reachRadiusKm = (minutes: number, travelMode: TravelMode): number =>
  minutes * kmPerMinuteAt(REACH_CURVES[travelMode], minutes);

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
