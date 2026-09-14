import { describe, expect, it } from 'vitest';
import { expandBounds, reachRadiusKm } from '../src/domain/services/search-area.js';
import type { BoundingBox } from '../src/domain/models/geo.js';

describe('reachRadiusKm', () => {
  it('deckt beim Auto die gemessene Reichweite in jeder Stufe ab', () => {
    // Größte Luftlinie über sieben Startpunkte in Oldenburg und Delmenhorst
    // (Zentrum, Land, Kleinstadt, Autobahnauffahrt, Autobahnkreuz), echte
    // Isochronen mit smoothing 0. Der Radius muss jede dieser Zahlen decken --
    // sonst fällt ein erreichbarer Ort unbemerkt aus der Liste.
    const gemessen: Array<[number, number]> = [
      [5, 4.2],
      [8, 8.2],
      [10, 11.1],
      [12, 15.6],
      [15, 20.4],
      [20, 27.7],
      [30, 49.8],
      [45, 81.7],
      [60, 110.5],
    ];

    for (const [minutes, km] of gemessen) {
      expect(reachRadiusKm(minutes, 'driving')).toBeGreaterThanOrEqual(km);
      // Aber auch nicht beliebig darüber: ein Viertel Luft, mehr nicht.
      expect(reachRadiusKm(minutes, 'driving')).toBeLessThanOrEqual(km * 1.25);
    }
  });

  it('interpoliert zwischen den Stützstellen, ohne zu springen', () => {
    // Zwischen 10 und 12 Minuten liegt keine Messung; der Wert muss trotzdem
    // monoton dazwischen wachsen.
    const zehn = reachRadiusKm(10, 'driving');
    const elf = reachRadiusKm(11, 'driving');
    const zwoelf = reachRadiusKm(12, 'driving');
    expect(elf).toBeGreaterThan(zehn);
    expect(elf).toBeLessThan(zwoelf);
  });

  it('wächst beim Auto überproportional mit der Fahrzeit', () => {
    // Die doppelte Zeit bringt mehr als die doppelte Luftlinie -- genau das
    // kann ein fester Wert je Minute nicht abbilden.
    expect(reachRadiusKm(30, 'driving')).toBeGreaterThan(2 * reachRadiusKm(15, 'driving'));
    expect(reachRadiusKm(10, 'driving')).toBeGreaterThan(2 * reachRadiusKm(5, 'driving'));
  });

  it('wächst bei Rad, E-Bike und zu Fuß linear mit der Fahrzeit', () => {
    // Gemessen steht die Reichweite je Minute dort über 5 bis 60 Minuten
    // still -- anders als beim Auto.
    for (const mode of ['ebike', 'cycling', 'walking'] as const) {
      expect(reachRadiusKm(20, mode)).toBeCloseTo(2 * reachRadiusKm(10, mode), 5);
    }
  });

  it('deckt je Verkehrsmittel die gemessene Reichweite ab, aber nicht beliebig', () => {
    // Untere Schranke: die gemessene maximale Luftlinie (E-Bike 0,38 km/min,
    // Rad 0,32, zu Fuß 0,09) -- sie darf der Radius nie unterschreiten.
    // Obere Schranke: die Hälfte darüber. Mehr wäre kein Puffer mehr,
    // sondern eine Liste voller Orte, die die Bedingung nie erfüllen können.
    expect(reachRadiusKm(60, 'ebike')).toBeGreaterThanOrEqual(22.8);
    expect(reachRadiusKm(60, 'ebike')).toBeLessThanOrEqual(34.2);
    expect(reachRadiusKm(60, 'cycling')).toBeGreaterThanOrEqual(19.2);
    expect(reachRadiusKm(60, 'cycling')).toBeLessThanOrEqual(28.8);
    expect(reachRadiusKm(60, 'walking')).toBeGreaterThanOrEqual(5.4);
    expect(reachRadiusKm(60, 'walking')).toBeLessThanOrEqual(8.1);
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
