import type { GeocodingPrecision } from '../../domain/ports/geocoding-provider.js';
import type { AddressParts } from './address-label.js';

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
  /** Bundesland als Kuerzel -- "NI", "IL". */
  region_a?: string;
  country?: string;
  country_a?: string;
};

/**
 * Uebersetzt Pelias' Feldschnitt in die anbieterneutrale Form. Was daraus fuer
 * eine Zeile wird, entscheidet `labelOf` in address-label.ts -- diese Datei
 * kennt nur Pelias.
 */
export const partsOf = (properties: PeliasProperties): AddressParts => ({
  name: properties.name,
  street: properties.street,
  houseNumber: properties.housenumber,
  postalCode: properties.postalcode,
  // Leerer String zaehlt wie fehlend -- sonst faellt die Zeile auf den Kreis
  // zurueck, obwohl Pelias die Gemeinde daneben stehen hat.
  place:
    (properties.locality ?? '').trim() !== ''
      ? properties.locality
      : properties.localadmin,
  county: properties.county,
  state: properties.region_a,
  country: properties.country,
  countryCode: properties.country_a,
});

/**
 * Wie genau ein Treffer ist. Pelias' Ebenen sind feiner, als hier jemand
 * unterscheiden muss: Was zaehlt, ist die Frage "Haus, Strasse oder nur
 * Gegend?". `venue` ist ein einzelnes Gebaeude und damit so genau wie eine
 * Hausnummer.
 */
export const precisionOf = (layer: string | undefined): GeocodingPrecision => {
  if (layer === 'address' || layer === 'venue') return 'address';
  if (layer === 'street') return 'street';
  return 'place';
};
