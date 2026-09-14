import { describe, expect, it } from 'vitest';
import { expandBounds, reachRadiusKm } from '../src/domain/services/search-area.js';
import type { BoundingBox } from '../src/domain/models/geo.js';
import type { TravelMode } from '../src/domain/models/analysis.js';

describe('reachRadiusKm', () => {
  /**
   * Größte Luftlinie echter Isochronen (`smoothing: 0`) über sieben
   * Startpunkte in Oldenburg und Delmenhorst: Zentrum, Land, Kleinstadt,
   * Autobahnauffahrt, Autobahnkreuz. Neue Messungen gehören hier hinein.
   */
  const gemessen: Record<TravelMode, Array<[minutes: number, km: number]>> = {
    driving: [
      [5, 4.2],
      [6, 5.39],
      [8, 8.24],
      [9, 9.66],
      [10, 11.12],
      [11, 13.06],
      [12, 15.64],
      [13, 17.51],
      [15, 20.41],
      [18, 24.2],
      [20, 27.73],
      [22, 32.32],
      [25, 35.42],
      [27, 43.16],
      [30, 49.84],
      [35, 60.6],
      [45, 81.7],
      [50, 91.15],
      [60, 110.5],
    ],
    ebike: [
      [5, 1.92],
      [15, 5.51],
      [25, 8.65],
      [30, 10.68],
      [60, 21.0],
    ],
    cycling: [
      [5, 1.59],
      [15, 4.54],
      [30, 8.88],
      [45, 12.74],
      [60, 17.17],
    ],
    walking: [
      [5, 0.42],
      [15, 1.37],
      [25, 2.13],
      [30, 2.58],
      [60, 5.0],
    ],
  };

  const alleModi = Object.entries(gemessen) as Array<[TravelMode, Array<[number, number]>]>;

  it('deckt jede gemessene Reichweite ab', () => {
    // Untere Schranke ohne Ausnahme: Was gemessen erreichbar ist, muss der
    // Radius finden -- sonst fällt ein Ort unbemerkt aus der Liste, dieselbe
    // Gefahr wie beim Vorfiltern von POIs. Die Zwischenzeiten 6, 9, 11, 13,
    // 18, 22, 27, 35 und 50 stehen bewusst mit drin: Bei 22 und 27 Minuten lag
    // eine Kurve, die nur 20/25/30 kannte, nachgemessen 3 % zu niedrig.
    for (const [mode, punkte] of alleModi) {
      for (const [minutes, km] of punkte) {
        expect(reachRadiusKm(minutes, mode)).toBeGreaterThanOrEqual(km);
      }
    }
  });

  it('bleibt dicht an der Messung, statt vorsichtshalber weit zu suchen', () => {
    // Zwei Quellen von Luft, und beide sind gewollt: das Aufrunden auf die
    // nächsten 0,05 km je Minute, und das Aufrunden auf die nächste
    // Stützstelle. Zusammen sind es beim Auto höchstens 28 % -- bei 6 Minuten,
    // die mit dem Wert von 10 rechnen. An den Stützstellen selbst bleiben
    // 0,5 bis 3,4 %. Bei den flachen Kurven ist es bis zu einem Viertel; dort
    // kostet es fast nichts, weil ein Viertel von 1,3 km 300 m sind.
    for (const [mode, punkte] of alleModi) {
      const grenze = mode === 'driving' ? 1.3 : 1.25;

      for (const [minutes, km] of punkte) {
        expect(reachRadiusKm(minutes, mode)).toBeLessThanOrEqual(km * grenze);
      }
    }
  });

  it('wächst beim Auto überproportional mit der Fahrzeit', () => {
    // Die doppelte Zeit bringt mehr als die doppelte Luftlinie -- genau das
    // kann ein fester Wert je Minute nicht abbilden.
    expect(reachRadiusKm(30, 'driving')).toBeGreaterThan(2 * reachRadiusKm(15, 'driving'));
    expect(reachRadiusKm(10, 'driving')).toBeGreaterThan(2 * reachRadiusKm(5, 'driving'));
  });

  it('hält die Kurve bei Rad, E-Bike und zu Fuß flach', () => {
    // Gemessen steht die Reichweite je Minute dort über 5 bis 60 Minuten
    // still. Eine Kurve mit einer Stützstelle ist genau das.
    for (const mode of ['ebike', 'cycling', 'walking'] as const) {
      expect(reachRadiusKm(20, mode)).toBeCloseTo(2 * reachRadiusKm(10, mode), 5);
      expect(reachRadiusKm(60, mode)).toBeCloseTo(12 * reachRadiusKm(5, mode), 5);
    }
  });

  it('rundet Zwischenzeiten auf die nächste Stützstelle auf', () => {
    // 6 Minuten rechnen mit dem Wert von 10, 14 mit dem von 20 -- die
    // Reichweite je Minute steigt mit der Zeit, also deckt die spätere
    // Stützstelle jede frühere Zeit mit ab. Das ist der Grund, warum hier
    // nicht interpoliert wird: Interpoliert lag der Radius bei 22 und 27
    // Minuten nachgemessen 3 % zu niedrig.
    const proMinute = (minutes: number): number => reachRadiusKm(minutes, 'driving') / minutes;

    expect(proMinute(6)).toBeCloseTo(proMinute(10), 10);
    expect(proMinute(14)).toBeCloseTo(proMinute(20), 10);
    expect(proMinute(10)).toBeLessThan(proMinute(11));
  });

  it('wächst über den ganzen Bereich monoton', () => {
    for (const mode of ['driving', 'ebike', 'cycling', 'walking'] as const) {
      for (let minutes = 1; minutes < 60; minutes++) {
        expect(reachRadiusKm(minutes + 1, mode)).toBeGreaterThan(reachRadiusKm(minutes, mode));
      }
    }
  });

  it('ordnet die Verkehrsmittel nach Reichweite', () => {
    expect(reachRadiusKm(10, 'walking')).toBeLessThan(reachRadiusKm(10, 'cycling'));
    expect(reachRadiusKm(10, 'cycling')).toBeLessThan(reachRadiusKm(10, 'ebike'));
    expect(reachRadiusKm(10, 'ebike')).toBeLessThan(reachRadiusKm(10, 'driving'));
  });
});

describe('expandBounds', () => {
  const region: BoundingBox = [7.998, 52.876, 8.654, 53.397];

  it('erweitert in alle vier Richtungen', () => {
    const [w, s, e, n] = expandBounds(region, 12);
    expect(w).toBeLessThan(region[0]);
    expect(s).toBeLessThan(region[1]);
    expect(e).toBeGreaterThan(region[2]);
    expect(n).toBeGreaterThan(region[3]);
  });

  it('erweitert die Breite um die angegebene Distanz', () => {
    const [, south, , north] = expandBounds(region, 12);
    expect((region[1] - south) * 111.32).toBeCloseTo(12, 1);
    expect((north - region[3]) * 111.32).toBeCloseTo(12, 1);
  });

  it('erweitert die Länge breitengradkorrigiert stärker als die Breite', () => {
    const [west, south] = expandBounds(region, 12);
    // Auf 53° Nord ist ein Längengrad nur ~60% eines Breitengrads lang.
    expect(region[0] - west).toBeGreaterThan(region[1] - south);
  });

  it('bleibt in gültigen Koordinaten', () => {
    const [w, s, e, n] = expandBounds([179.9, 89.9, 179.95, 89.95], 500);
    expect(w).toBeGreaterThanOrEqual(-180);
    expect(e).toBeLessThanOrEqual(180);
    expect(s).toBeGreaterThanOrEqual(-90);
    expect(n).toBeLessThanOrEqual(90);
  });

  it('lässt den Bereich bei 0 km unverändert', () => {
    expect(expandBounds(region, 0)).toEqual(region);
  });
});
