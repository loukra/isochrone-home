/**
 * Die Bezeichnung eines Treffers setzt die App, nicht der Anbieter -- und
 * deshalb steht sie hier und nicht in einem Adapter. Jeder Geocoder liefert
 * seine Felder anders (Pelias: `locality`, `country_a`; Photon: `city`,
 * `countrycode`); was daraus wird, ist eine Entscheidung dieser App und darf
 * sich nicht danach unterscheiden, wer gerade antwortet.
 *
 * Die Adapter uebersetzen ihre Antwort in diese Form, mehr nicht. Damit
 * bleiben Provider-Typen im Adapter (Architekturgrenze) und die Regel bleibt
 * an einem Ort.
 */
export type AddressParts = {
  /** Eigenname eines Ortes ("Westerstede", "Clever Fit"), falls vorhanden. */
  name?: string;
  street?: string;
  houseNumber?: string;
  postalCode?: string;
  /** Gemeinde oder Stadt -- die Ebene, die eine Adresse einordnet. */
  place?: string;
  /** Kreis; springt ein, wenn der Ort selbst der Treffer ist. */
  county?: string;
  country?: string;
  /** ISO-Code des Landes, zwei- oder dreistellig -- je nach Anbieter. */
  countryCode?: string;
};

/**
 * Das Land, in dem die App gefragt wird. Es bei jedem einzelnen Ziel
 * mitzuschreiben beantwortet nichts -- eine Adresse im Ausland nennt ihres
 * weiterhin. Wird die App je auf ein anderes Land ausgerichtet, ist das die
 * eine Stelle dafuer.
 *
 * Zwei Schreibweisen, weil die Anbieter sich nicht einig sind: Pelias meldet
 * "DEU", Photon "DE". Eine Umrechnungstabelle aller Laender dafuer anzulegen
 * waere Aufwand fuer eine Frage, die nur dieses eine Land betrifft.
 */
const HOME_COUNTRY = ['DE', 'DEU'];

const clean = (value: string | undefined): string => value?.trim() ?? '';

/**
 * Anbieter setzen ihre Labels gern nach US-Muster zusammen: "Strasse, Ort, ST,
 * Land", mit englischem Laendernamen und dem Kuerzel des Bundeslandes ("NI").
 * Beides beantwortet in einer deutschen Adresse keine Frage -- das Kuerzel
 * steht in keinem Briefkopf, und "Germany" steht bei jedem Ziel dieser App.
 * Darum wird die Bezeichnung hier aus den Einzelfeldern selbst gesetzt: Name,
 * dann Postleitzahl und Ort, und das Land nur, wenn es ein anderes ist.
 */
export const labelOf = (parts: AddressParts, fallback: string): string => {
  const street = clean(parts.street);
  const houseNumber = clean(parts.houseNumber);
  const name =
    clean(parts.name) || [street, houseNumber].filter((part) => part !== '').join(' ');

  const place = clean(parts.place);
  // Bei einem Ort selbst waere der Ort noch einmal der Name; dann ordnet der
  // Kreis ein ("Westerstede, Landkreis Ammerland") statt ihn zu wiederholen.
  const area = place === '' || place === name ? clean(parts.county) : place;

  const isHome = HOME_COUNTRY.includes(clean(parts.countryCode).toUpperCase());

  const segments = [
    name,
    [clean(parts.postalCode), area].filter((part) => part !== '').join(' '),
    isHome ? '' : clean(parts.country),
  ].filter((segment) => segment !== '');

  return segments.length > 0 ? segments.join(', ') : fallback;
};
