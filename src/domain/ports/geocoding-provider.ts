import type { Coordinate } from '../models/geo.js';

export type GeocodingCandidate = {
  /** Vom Provider normalisierte, anzeigbare Bezeichnung des Ortes. */
  label: string;
  coordinate: Coordinate;
};

export interface GeocodingProvider {
  /** Liefert den besten Treffer. Wirft DomainError('ADDRESS_NOT_FOUND'). */
  geocode(address: string): Promise<Coordinate>;
  /** Liefert mehrere Kandidaten zur Bestätigung durch den Nutzer (Spec 10). */
  search(address: string, limit?: number): Promise<GeocodingCandidate[]>;
}
