import { describe, expect, it } from 'vitest';
import { formatDistance, unitSystemFor } from '../src/frontend/units.js';

/**
 * Die Einheit haengt an der Region, nicht an der Sprache. Das ist keine
 * Feinheit: `en-GB` und `en-IE` sind dieselbe Sprache und verschiedene
 * Einheiten -- eine Ableitung aus der Sprache traefe einen der beiden immer
 * falsch.
 */
describe('unitSystemFor', () => {
  it('gibt den vier Meilenlaendern Meilen', () => {
    for (const region of ['US', 'GB', 'MM', 'LR']) {
      expect(unitSystemFor(region)).toBe('imperial');
    }
  });

  it('gibt allen anderen Kilometer', () => {
    for (const region of ['DE', 'IE', 'AT', 'FR', 'JP', 'AU', 'CA']) {
      expect(unitSystemFor(region)).toBe('metric');
    }
  });

  it('trennt Irland von Grossbritannien', () => {
    // Dieselbe Sprache, verschiedene Einheiten -- der ganze Grund, warum die
    // Einheit nicht aus dem Sprachkatalog kommen darf.
    expect(unitSystemFor('IE')).not.toBe(unitSystemFor('GB'));
  });

  it('waehlt bei unbekannter Region Kilometer', () => {
    // Raten muss in die haeufigere Richtung schiefliegen: Meilen gelten in
    // vier Laendern, Kilometer im Rest der Welt.
    expect(unitSystemFor(null)).toBe('metric');
  });
});

describe('formatDistance', () => {
  it('haengt die Einheit an', () => {
    expect(formatDistance(2.3, 'metric', 'en-GB')).toBe('2.3 km');
    expect(formatDistance(1.609344, 'imperial', 'en-GB')).toBe('1 mi');
  });

  it('nimmt das Zahlenformat aus der Sprache', () => {
    expect(formatDistance(2.3, 'metric', 'de-DE')).toBe('2,3 km');
  });

  it('laesst die Nachkommastellen bestimmen', () => {
    expect(formatDistance(103.4, 'metric', 'en-GB', 0)).toBe('103 km');
  });
});
