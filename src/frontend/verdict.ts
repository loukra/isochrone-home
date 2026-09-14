/**
 * Die beiden Urteile über einen geprüften Ort -- „liegt drin", „liegt
 * draußen", „noch nicht entscheidbar". Sie stehen an zwei Stellen: in der
 * Kachel der Seitenleiste und in der Info-Box am Haus auf der Karte. Beide
 * müssen dasselbe sagen, deshalb liegt die Zuordnung hier und nicht zweimal
 * nebeneinander.
 */

/** Der Strich ist ein eigener Zustand: „noch offen", nicht „nicht erfüllt". */
export const verdictText = (
  state: boolean | null,
  yes: string,
  no: string,
  open: string,
): string => (state === null ? open : state ? yes : no);

export const verdictTone = (state: boolean | null): 'hint' | 'success' | 'error' =>
  state === null ? 'hint' : state ? 'success' : 'error';
