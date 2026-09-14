import type { GeocodingCandidate } from './types.js';

/**
 * Postleitzahlen sind keine Hausnummern. Ohne diesen Schritt gaelte
 * "26123 Oldenburg" als Frage nach einem Haus, und die Bestaetigung einer
 * Stadt waere ein Klick, der nichts klaert.
 *
 * Erkannt werden die Schreibweisen, die sich von einer Hausnummer wirklich
 * unterscheiden lassen:
 *
 * - fuenf Ziffern, optional mit ZIP+4 -- DE, FR, ES, IT, US
 * - vier Ziffern plus zwei Buchstaben -- NL ("9745 CC")
 * - die Buchstaben-Ziffern-Muster von GB ("SW1A 2AA") und CA ("K1A 0B1")
 *
 * **Rein vierstellige Postleitzahlen bleiben absichtlich draussen** (AT, CH,
 * BE, DK, AU, NZ). Sie sind von einer Hausnummer nicht zu unterscheiden --
 * "Hauptstraße 1234" gibt es --, und sie hier wegzustreichen hiesse, eine
 * echte Hausnummer zu uebersehen. Dann uebernaehme die Oberflaeche einen
 * Ortsmittelpunkt wortlos, und das ist der Fehler, gegen den die ganze Datei
 * gebaut ist. Die Folge ist eine Rueckfrage zu viel in "1010 Wien" -- ein
 * Klick, sichtbar, und damit die richtige Richtung.
 */
const POSTAL_CODE =
  /\b\d{5}(?:-\d{4})?\b|\b\d{4}\s?[A-Za-z]{2}\b|\b[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}\b|\b[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d\b/g;

/**
 * Eine Zahl, die fuer sich steht, mit hoechstens einem angehaengten Buchstaben:
 * "28", "28a", "17B". "Straße des 17. Juni" faellt heraus, weil auf die Zahl
 * ein Punkt folgt.
 *
 * Trifft es einmal zu viel, kostet das eine Bestaetigung zu viel -- trifft es
 * einmal zu wenig, uebernimmt die App stillschweigend einen Punkt, der woanders
 * liegt. Die Regel ist deshalb absichtlich in Richtung Nachfrage schief.
 */
const HOUSE_NUMBER = /(?:^|[\s,])\d{1,4}\s?[a-zA-Z]?(?=$|[\s,])/;

/** Wurde nach einem bestimmten Haus gefragt -- oder nur nach einer Gegend? */
export const asksForHouseNumber = (query: string): boolean =>
  HOUSE_NUMBER.test(query.replace(POSTAL_CODE, ' '));

/**
 * Der einzige Treffer, der ohne Rueckfrage uebernommen werden darf -- sonst
 * `null`, und der Nutzer bekommt die Liste zu sehen.
 *
 * Der Grund ist ein gemessener Fehler: Auf "Astruper Straße 28, Hatten"
 * antwortete der alte Geocoder mit genau *einem* Treffer, naemlich dem
 * Mittelpunkt der Strasse -- 405 m neben dem Haus. Bei einem Treffer
 * uebernahm die Oberflaeche ihn wortlos. Der Nutzer hatte eine Hausnummer
 * eingegeben, bekam eine Isochrone um einen anderen Punkt und erfuhr nirgends,
 * dass eine andere Frage beantwortet worden war.
 *
 * Ein Treffer allein genuegt also nicht; er muss auch die gestellte Frage
 * beantworten. Nach einer Gegend gefragt ("Oldenburg"), ist ein Ort die
 * richtige Antwort und wird uebernommen -- die Rueckfrage kommt nur, wenn die
 * Antwort ungenauer ist als die Frage.
 */
export const soleAnswer = (
  query: string,
  candidates: GeocodingCandidate[],
): GeocodingCandidate | null => {
  const [only] = candidates;

  if (candidates.length !== 1 || only === undefined) return null;
  if (only.precision === 'address') return only;

  return asksForHouseNumber(query) ? null : only;
};

/**
 * Keiner der Treffer ist ein Haus -- dann sagt die Liste, warum sie ueberhaupt
 * dasteht, statt nur "Welche Adresse meinst du?" zu fragen.
 */
export const missesHouseNumber = (
  query: string,
  candidates: GeocodingCandidate[],
): boolean =>
  candidates.length > 0 &&
  asksForHouseNumber(query) &&
  !candidates.some((candidate) => candidate.precision === 'address');
