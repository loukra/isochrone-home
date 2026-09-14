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
  /**
   * Bundesland, Provinz, Staat -- moeglichst als Kuerzel ("NI", "IL"), wie der
   * Anbieter es liefert. Steht nur in den Laendern in der Zeile, deren
   * Adressen es brauchen (siehe `ADDRESS_SHAPES`).
   */
  state?: string;
  country?: string;
  /** ISO-Code des Landes, zwei- oder dreistellig -- je nach Anbieter. */
  countryCode?: string;
};

/**
 * Das Land, in dem die App gerade gefragt wird -- es wird in der Zeile
 * **weggelassen**, weil eine Angabe, die bei jeder Zeile gleich lautet, nichts
 * unterscheidet. Eine Adresse im Ausland nennt ihres weiterhin.
 *
 * Frueher stand hier fest `['DE', 'DEU']`. Das war richtig, solange die App
 * nur in Deutschland benutzt wurde, und in Frankreich stuende damit hinter
 * jedem Ziel "Frankreich" -- genau das Rauschen, gegen das die Regel gebaut
 * ist, nur mit umgekehrtem Vorzeichen. Das Land kommt deshalb jetzt von aussen
 * herein: aus der Region des Browsers, vom Frontend mitgeschickt.
 *
 * Erwartet wird ISO 3166-1 **alpha-2** ("DE", "FR"), so wie `navigator`
 * und Photon es liefern.
 *
 * Pelias meldet dagegen alpha-3 ("DEU"). Ein solcher Code passt hier nie, das
 * Land steht dann also auch daheim in der Zeile. Das ist bewusst in Kauf
 * genommen: Pelias ist seit dem 14.09.2026 nur noch der Rueckfall, der Fehler
 * ist eine zu lange Zeile und keine falsche, und die Alternative waere eine
 * Umrechnungstabelle aller Laender. Sichtbar ausfuehrlich schlaegt still
 * falsch -- dieselbe Regel wie beim Verzicht auf das Vorfiltern von POIs.
 */
const isHomeCountry = (code: string, homeCountry: string | null): boolean =>
  homeCountry !== null && code !== '' && code === homeCountry.trim().toUpperCase();

const clean = (value: string | undefined): string => value?.trim() ?? '';

/**
 * Anbieter setzen ihre Labels gern nach US-Muster zusammen: "Strasse, Ort, ST,
 * Land", mit englischem Laendernamen und dem Kuerzel des Bundeslandes ("NI").
 * Beides beantwortet in einer deutschen Adresse keine Frage -- das Kuerzel
 * steht in keinem Briefkopf, und "Germany" steht bei jedem Ziel dieser App.
 * Darum wird die Bezeichnung hier aus den Einzelfeldern selbst gesetzt: Name,
 * dann Postleitzahl und Ort, und das Land nur, wenn es ein anderes ist.
 */
/**
 * Wie eine Adresszeile im Land des **Treffers** aufgebaut ist -- nicht im Land
 * des Nutzers. Wer von Deutschland aus eine Adresse in London sucht, will die
 * Londoner Schreibweise sehen.
 *
 * Drei Formen decken die Faelle ab, die sich wirklich unterscheiden:
 *
 * | Land | Zeile |
 * | --- | --- |
 * | Vorgabe (DE, AT, NL, IT, ...) | `Wehdestraße 7, 26123 Oldenburg` |
 * | FR, BE | `10 Rue de Rivoli, 75004 Paris` |
 * | GB, IE, NZ | `10 Downing Street, London SW1A 2AA` |
 * | US, CA, AU | `742 Evergreen Terrace, Springfield, IL 62704` |
 *
 * **Die Tabelle ist absichtlich kurz und unvollstaendig.** Ein unbekanntes Land
 * bekommt die Vorgabe; das ist dort hoechstens ungewohnt sortiert, nie falsch
 * -- alle Bestandteile stehen da. Eine Tabelle aller Laender waere Pflege fuer
 * einen Unterschied, den ausser den Einheimischen niemand bemerkt. Wo jemand
 * nachmisst, dass es stoert, kommt eine Zeile dazu.
 *
 * Das Bundesland gehoert nur dorthin, wo es wirklich unterscheidet: Springfield
 * gibt es in ueber dreissig US-Staaten, und ohne "IL" beantwortet die Zeile
 * nicht, welches gemeint ist. In Deutschland stand frueher "NI" in jeder Zeile
 * und unterschied nichts -- genau der Grund, warum es entfernt wurde.
 */
type AddressShape = {
  /** Hausnummer vor den Strassennamen -- "10 Downing Street". */
  houseNumberFirst?: boolean;
  /** Postleitzahl hinter den Ort statt davor. */
  postalCodeAfterPlace?: boolean;
  /**
   * Das Bundesland gehoert in die Zeile, und zwar als eigener Abschnitt vor
   * der Postleitzahl: "Springfield, IL 62704".
   */
  includesState?: boolean;
};

const ADDRESS_SHAPES: Record<string, AddressShape> = {
  US: { houseNumberFirst: true, postalCodeAfterPlace: true, includesState: true },
  CA: { houseNumberFirst: true, postalCodeAfterPlace: true, includesState: true },
  AU: { houseNumberFirst: true, postalCodeAfterPlace: true, includesState: true },
  GB: { houseNumberFirst: true, postalCodeAfterPlace: true },
  IE: { houseNumberFirst: true, postalCodeAfterPlace: true },
  NZ: { houseNumberFirst: true, postalCodeAfterPlace: true },
  FR: { houseNumberFirst: true },
  BE: { houseNumberFirst: true },
};

export const labelOf = (
  parts: AddressParts,
  fallback: string,
  homeCountry: string | null = null,
): string => {
  const street = clean(parts.street);
  const houseNumber = clean(parts.houseNumber);
  const code = clean(parts.countryCode).toUpperCase();
  const shape = ADDRESS_SHAPES[code] ?? {};

  const streetParts =
    shape.houseNumberFirst === true ? [houseNumber, street] : [street, houseNumber];
  const name = clean(parts.name) || streetParts.filter((part) => part !== '').join(' ');

  const place = clean(parts.place);
  // Bei einem Ort selbst waere der Ort noch einmal der Name; dann ordnet der
  // Kreis ein ("Westerstede, Landkreis Ammerland") statt ihn zu wiederholen.
  // Fehlt auch der, tut es das Bundesland.
  const isPlace = place !== '' && place !== name;
  const area = isPlace ? place : clean(parts.county) || clean(parts.state);


  /**
   * Die Postleitzahl steht nur neben dem **Ort**, nie neben dem Kreis. Sonst
   * stuende dort "Westerstede, 26655 Landkreis Ammerland" -- die Zahl gehoert
   * zum Ort, und der ist in diesem Fall bereits der Name links davon.
   */
  const postalCode = isPlace ? clean(parts.postalCode) : '';

  // Das Bundesland nur, wenn es nicht schon die einordnende Ebene ist --
  // sonst stuende "Illinois, IL 62704" in der Zeile.
  const state =
    shape.includesState === true && clean(parts.state) !== area ? clean(parts.state) : '';

  const joined = (...values: string[]): string =>
    values.filter((value) => value !== '').join(' ');

  let locality: string[];

  if (shape.includesState === true) {
    // "Springfield" und "IL 62704" als zwei Abschnitte -- so steht es auf
    // einem US-Umschlag.
    locality = [area, joined(state, postalCode)];
  } else if (shape.postalCodeAfterPlace === true) {
    // "London SW1A 2AA" -- ein Abschnitt, kein Komma dazwischen.
    locality = [joined(area, postalCode)];
  } else {
    locality = [joined(postalCode, area)];
  }

  const segments = [
    name,
    ...locality,
    isHomeCountry(code, homeCountry) ? '' : clean(parts.country),
  ].filter((segment) => segment !== '');

  return segments.length > 0 ? segments.join(', ') : fallback;
};
