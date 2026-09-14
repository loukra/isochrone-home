import { describe, expect, it } from 'vitest';
import { regionDistance } from '../src/frontend/poi/distance.js';

/**
 * Die angezeigte Zahl entscheidet, nicht die rohe.
 *
 * Vorher prüfte die Oberfläche auf `distanceToRegionKm === 0` und rundete
 * danach auf eine Nachkommastelle. Ein Bahnhof vierzig Meter ausserhalb stand
 * damit als "0.0 km außerhalb" in der Liste -- ein Widerspruch in einer Zeile,
 * und zwar an genau der Stelle, an der der Nutzer entscheidet, ob er den Ort
 * anhakt.
 */
describe('regionDistance', () => {
  it('meldet genau null als "in der Region"', () => {
    expect(regionDistance(0)).toBeNull();
  });

  it('meldet alles, was auf 0,0 km rundet, als "in der Region"', () => {
    // Der Fall aus der Oberfläche: Delmenhorst Hasporter Damm, 40 m draussen.
    expect(regionDistance(0.04)).toBeNull();
    expect(regionDistance(0.0499)).toBeNull();
  });

  it('meldet ab der ersten sichtbaren Stelle eine Entfernung', () => {
    expect(regionDistance(0.05)).toBe('0.1');
    expect(regionDistance(0.4)).toBe('0.4');
    expect(regionDistance(14.94)).toBe('14.9');
  });

  it('liefert dieselbe Zeichenkette, die angezeigt wird', () => {
    // Sonst stünde in der Zeile eine andere Zahl als die, über die entschieden
    // wurde -- genau der Fehler, den diese Funktion behebt.
    for (const km of [0.06, 1.25, 9.99, 103.4]) {
      expect(regionDistance(km)).toBe(km.toFixed(1));
    }
  });
});
