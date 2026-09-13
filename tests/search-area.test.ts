import { describe, expect, it } from 'vitest';
import { expandBounds, reachRadiusKm } from '../src/domain/services/search-area.js';
import type { BoundingBox } from '../src/domain/models/geo.js';

describe('reachRadiusKm', () => {
  it('wächst linear mit der Fahrzeit', () => {
    expect(reachRadiusKm(10)).toBe(15);
    expect(reachRadiusKm(20)).toBe(30);
  });

  it('ist großzügig genug für Autobahnfahrt', () => {
    // 10 Minuten bei 90 km/h sind 15 km Luftlinie -- mehr geht im Auto nicht.
    expect(reachRadiusKm(10)).toBeGreaterThanOrEqual(15);
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
