import { formatDistance, toDisplayUnit, type UnitSystem } from '../units.js';

/**
 * Entfernung eines Ortes zur gemeinsamen Region, so wie sie angezeigt wird.
 *
 * Entscheidend ist die **angezeigte** Zahl, nicht die rohe -- dieselbe Regel
 * wie bei den Fahrzeiten in den Adresskacheln. Vorher wurde auf `=== 0`
 * geprüft und danach auf eine Nachkommastelle gerundet: Ein Bahnhof 40 Meter
 * ausserhalb stand damit als "0.0 km außerhalb" in der Liste. Das ist keine
 * Aussage, sondern ein Widerspruch in einer Zeile.
 *
 * Gerundet wird deshalb in der Einheit, die auch dasteht. Das verschiebt die
 * Schwelle: In Meilen gilt ein Ort bis rund 80 m als "in der Region", in
 * Kilometern bis rund 50 m. Das ist eine Folge der Regel, kein Versehen --
 * die Alternative waere "0.0 mi außerhalb", also genau der Widerspruch, gegen
 * den sie gebaut ist.
 *
 * @returns `null`, wenn der Ort als "in der Region" gilt, sonst die fertige
 *          Angabe samt Einheit.
 */
export const regionDistance = (
  kilometres: number,
  units: UnitSystem,
  locale: string,
): string | null => {
  const shown = Math.round(toDisplayUnit(kilometres, units) * 10) / 10;
  return shown === 0 ? null : formatDistance(kilometres, units, locale);
};
