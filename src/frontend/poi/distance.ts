/**
 * Entfernung eines Ortes zur gemeinsamen Region, so wie sie angezeigt wird.
 *
 * Entscheidend ist die **angezeigte** Zahl, nicht die rohe -- dieselbe Regel
 * wie bei den Fahrzeiten in den Adresskacheln. Vorher wurde auf `=== 0`
 * geprüft und danach auf eine Nachkommastelle gerundet: Ein Bahnhof 40 Meter
 * ausserhalb stand damit als "0.0 km außerhalb" in der Liste. Das ist keine
 * Aussage, sondern ein Widerspruch in einer Zeile.
 *
 * @returns `null`, wenn der Ort als "in der Region" gilt, sonst die gerundete
 *          Entfernung als Zeichenkette.
 */
export const regionDistance = (kilometres: number): string | null => {
  const shown = kilometres.toFixed(1);
  return shown === '0.0' ? null : shown;
};
