import { describe, expect, it } from 'vitest';
import { expandBounds, reachRadiusKm } from '../src/domain/services/search-area.js';
import type { BoundingBox } from '../src/domain/models/geo.js';

describe('reachRadiusKm', () => {
  it('wächst linear mit der Fahrzeit', () => {
    expect(reachRadiusKm(10, 'driving')).toBeCloseTo(11, 5);
    expect(reachRadiusKm(20, 'driving')).toBeCloseTo(22, 5);
  });

  it('deckt beim Auto die gemessene Reichweite bei 10 Minuten ab', () => {
    // Gemessen (Referenzregion, smoothing 0): 10 Minuten reichen aus einer
    // Ortsmitte 5,8-6,7 km weit, von einer Autobahnauffahrt aus 10,9 km. Zehn
    // Minuten sind die Vorgabe der Bedingung, also ist das der Fall, den der
    // Radius treffen muss -- bis zum günstigsten Punkt, nicht darüber.
    expect(reachRadiusKm(10, 'driving')).toBeGreaterThanOrEqual(10.9);
    expect(reachRadiusKm(10, 'driving')).toBeLessThan(13);
  });

  it('deckt je Verkehrsmittel die gemessene Reichweite ab, aber nicht beliebig', () => {
    // Untere Schranke: die gemessene maximale Luftlinie (E-Bike 0,35 km/min,
    // Rad 0,29, zu Fuß 0,085) -- sie darf der Radius nie unterschreiten.
    // Obere Schranke: die Hälfte darüber. Mehr wäre kein Puffer mehr,
    // sondern eine Liste voller Orte, die die Bedingung nie erfüllen können.
    expect(reachRadiusKm(60, 'ebike')).toBeGreaterThanOrEqual(21);
    expect(reachRadiusKm(60, 'ebike')).toBeLessThanOrEqual(31.5);
    expect(reachRadiusKm(60, 'cycling')).toBeGreaterThanOrEqual(17.4);
    expect(reachRadiusKm(60, 'cycling')).toBeLessThanOrEqual(26.1);
    expect(reachRadiusKm(60, 'walking')).toBeGreaterThanOrEqual(5.1);
    expect(reachRadiusKm(60, 'walking')).toBeLessThanOrEqual(7.65);
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
