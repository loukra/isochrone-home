import type { GeocodingPrecision } from '../../domain/ports/geocoding-provider.js';

/** Die Felder der Pelias-Antwort, aus denen hier eine Bezeichnung entsteht. */
export type PeliasProperties = {
  layer?: string;
  name?: string;
  housenumber?: string;
  street?: string;
  postalcode?: string;
  locality?: string;
  localadmin?: string;
  county?: string;
  country?: string;
  country_a?: string;
};

/**
 * Das Land, in dem die App gefragt wird. Es bei jedem einzelnen Ziel
 * mitzuschreiben beantwortet nichts -- eine Adresse im Ausland nennt ihres
 * weiterhin. Wird die App je auf ein anderes Land ausgerichtet, ist das die
 * eine Stelle dafür.
 */
const HOME_COUNTRY = 'DEU';

const clean = (value: string | undefined): string => value?.trim() ?? '';

/**
 * Pelias setzt seine Labels nach US-Muster zusammen: "Straße, Ort, ST, Land",
 * mit englischem Ländernamen und dem Kürzel des Bundeslandes ("NI"). Beides
 * beantwortet in einer deutschen Adresse keine Frage -- das Kürzel steht in
 * keinem Briefkopf, und "Germany" steht bei jedem Ziel dieser App. Darum wird
 * die Bezeichnung hier aus den Einzelfeldern selbst gesetzt: Name, dann
 * Postleitzahl und Ort, und das Land nur, wenn es ein anderes ist.
 */
export const labelOf = (properties: PeliasProperties, fallback: string): string => {
  const street = clean(properties.street);
  const housenumber = clean(properties.housenumber);
  const name =
    clean(properties.name) ||
    [street, housenumber].filter((part) => part !== '').join(' ');

  const place = clean(properties.locality) || clean(properties.localadmin);
  // Bei einem Ort selbst wäre der Ort noch einmal der Name; dann ordnet der
  // Kreis ein ("Westerstede, Landkreis Ammerland") statt ihn zu wiederholen.
  const area = place === '' || place === name ? clean(properties.county) : place;

  const country = clean(properties.country);
  const parts = [
    name,
    [clean(properties.postalcode), area].filter((part) => part !== '').join(' '),
    clean(properties.country_a) === HOME_COUNTRY ? '' : country,
  ].filter((part) => part !== '');

  return parts.length > 0 ? parts.join(', ') : fallback;
};

/**
 * Wie genau ein Treffer ist. Pelias' Ebenen sind feiner, als hier jemand
 * unterscheiden muss: Was zählt, ist die Frage "Haus, Straße oder nur Gegend?".
 * `venue` ist ein einzelnes Gebäude und damit so genau wie eine Hausnummer.
 */
export const precisionOf = (layer: string | undefined): GeocodingPrecision => {
  if (layer === 'address' || layer === 'venue') return 'address';
  if (layer === 'street') return 'street';
  return 'place';
};
