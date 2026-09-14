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
    expect(regionDistance(0, 'metric', 'en-GB')).toBeNull();
  });

  it('meldet alles, was auf 0,0 km rundet, als "in der Region"', () => {
    // Der Fall aus der Oberfläche: Delmenhorst Hasporter Damm, 40 m draussen.
    expect(regionDistance(0.04, 'metric', 'en-GB')).toBeNull();
    expect(regionDistance(0.0499, 'metric', 'en-GB')).toBeNull();
  });

  it('meldet ab der ersten sichtbaren Stelle eine Entfernung', () => {
    expect(regionDistance(0.05, 'metric', 'en-GB')).toBe('0.1 km');
    expect(regionDistance(0.4, 'metric', 'en-GB')).toBe('0.4 km');
    expect(regionDistance(14.94, 'metric', 'en-GB')).toBe('14.9 km');
  });

  it('liefert dieselbe Zahl, die angezeigt wird', () => {
    // Sonst stünde in der Zeile eine andere Zahl als die, über die entschieden
    // wurde -- genau der Fehler, den diese Funktion behebt.
    expect(regionDistance(0.06, 'metric', 'en-GB')).toBe('0.1 km');
    expect(regionDistance(1.25, 'metric', 'en-GB')).toBe('1.3 km');
    expect(regionDistance(103.4, 'metric', 'en-GB')).toBe('103.4 km');
  });

  it('laesst die Null hinter dem Komma weg', () => {
    // "10 km" statt "10.0 km" -- dieselbe Formatierung wie bei den Fahrzeiten
    // in den Adresskacheln. Vorher lief die Liste ueber `toFixed(1)` und zeigte
    // als einzige Stelle der App eine erzwungene Nachkommastelle.
    expect(regionDistance(9.99, 'metric', 'en-GB')).toBe('10 km');
  });

  it('folgt der Sprache im Zahlenformat', () => {
    expect(regionDistance(14.94, 'metric', 'de-DE')).toBe('14,9 km');
  });

  /**
   * Die Regel gilt in der angezeigten Einheit, nicht in Kilometern. Stünde
   * sonst "0.0 mi außerhalb" in der Zeile -- derselbe Widerspruch, gegen den
   * die Funktion gebaut ist, nur in der anderen Einheit.
   */
  describe('in Meilen', () => {
    it('rechnet um', () => {
      expect(regionDistance(1.609344, 'imperial', 'en-GB')).toBe('1 mi');
      expect(regionDistance(16.09344, 'imperial', 'en-GB')).toBe('10 mi');
    });

    it('verschiebt die Schwelle mit der Einheit', () => {
      // 0,06 km sind 0,037 mi -- rundet auf 0,0 und gilt damit als "drin",
      // waehrend dieselbe Strecke in Kilometern "0,1 km draussen" ergaebe.
      expect(regionDistance(0.06, 'imperial', 'en-GB')).toBeNull();
      expect(regionDistance(0.06, 'metric', 'en-GB')).toBe('0.1 km');
      // Ab rund 80 m wird auch in Meilen etwas angezeigt.
      expect(regionDistance(0.09, 'imperial', 'en-GB')).toBe('0.1 mi');
    });
  });
});
