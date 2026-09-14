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
  /**
   * Liefert mehrere Kandidaten zur Bestätigung durch den Nutzer (Spec 10).
   *
   * `homeCountry` ist das Land, in dem die App gerade benutzt wird (ISO 3166-1
   * alpha-2, aus der Region des Browsers). Es entscheidet **nur** darüber, ob
   * der Ländername in der Bezeichnung steht: Was bei jeder Zeile gleich lautet,
   * unterscheidet nichts. Auf Treffer und Koordinaten hat es keinen Einfluss --
   * es ist eine Frage der Anzeige, keine Einschränkung der Suche.
   */
  search(
    address: string,
    limit?: number,
    homeCountry?: string | null,
  ): Promise<GeocodingCandidate[]>;
}
