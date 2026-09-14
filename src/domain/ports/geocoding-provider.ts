import type { Coordinate } from '../models/geo.js';

/**
 * Wie genau ein Treffer die gestellte Frage beantwortet. Ein Ortsteil ist
 * keine Hausnummer, und wer das nicht sieht, hält den Mittelpunkt eines Dorfes
 * für seine Adresse -- gemessen bis zu einem Kilometer daneben.
 */
export type GeocodingPrecision = 'address' | 'street' | 'place';

export type GeocodingCandidate = {
  /** Vom Provider normalisierte, anzeigbare Bezeichnung des Ortes. */
  label: string;
  coordinate: Coordinate;
  precision: GeocodingPrecision;
};

export interface GeocodingProvider {
  /** Liefert den besten Treffer. Wirft DomainError('ADDRESS_NOT_FOUND'). */
  geocode(address: string): Promise<Coordinate>;
  /** Liefert mehrere Kandidaten zur Bestätigung durch den Nutzer (Spec 10). */
  search(address: string, limit?: number): Promise<GeocodingCandidate[]>;
}
