import { DomainError } from '../../domain/models/errors.js';
import type { Coordinate } from '../../domain/models/geo.js';
import type {
  GeocodingCandidate,
  GeocodingPrecision,
  GeocodingProvider,
} from '../../domain/ports/geocoding-provider.js';
import { labelOf, type AddressParts } from './address-label.js';

/**
 * Komoots oeffentliche Photon-Instanz: OSM-Daten, kein Schluessel, und ein
 * unscharfer Abgleich, weil der Dienst fuer die Eingabe waehrend des Tippens
 * gebaut ist. Genau das ist hier der Grund fuer die Wahl -- gemessen an 13
 * ungenauen Eingaben (Tippfehler, "ss" statt "ß", Ortsteil statt Gemeinde,
 * fehlender Ort) fand Photon 12 auf Platz 1, Pelias 3.
 *
 * Wird die Instanz je zum Problem, laesst sich Photon selbst betreiben; dann
 * genuegt PHOTON_URL.
 */
export const DEFAULT_PHOTON_BASE_URL = 'https://photon.komoot.io';

/**
 * Ortsnamen kommen in der Sprache der Urfassung zurueck ("Niederlande" statt
 * "Netherlands"). Die Bezeichnung wird beim Bestaetigen festgehalten und bleibt
 * gespeichert; sie darf deshalb nicht an einer Einstellung haengen, die der
 * Nutzer danach umlegen kann -- sonst stuenden nach einem Sprachwechsel zwei
 * Sprachen in derselben Liste.
 */
const LANGUAGE = 'de';

/** Ausschnitt der Photon-Antwort, den dieser Adapter auswertet. */
type PhotonProperties = {
  type?: string;
  name?: string;
  housenumber?: string;
  street?: string;
  postcode?: string;
  city?: string;
  district?: string;
  county?: string;
  state?: string;
  country?: string;
  countrycode?: string;
};

type PhotonResponse = {
  features?: Array<{
    geometry?: { coordinates?: [number, number] };
    properties?: PhotonProperties;
  }>;
};

const clean = (value: string | undefined): string => value?.trim() ?? '';

/**
 * Photon sagt die Genauigkeit selbst, statt sie aus einer Ebene erraten zu
 * lassen: `type` ist "house", "street", "city", "district" und so fort. Ein
 * Treffer mit Hausnummer gilt zusaetzlich als Adresse -- ein benannter Ort mit
 * Hausnummer (Photon meldet dort mitunter den Typ des Objekts) ist so genau
 * wie eine Adresse, und zu niedrig einzustufen hiesse, unnoetig nachzufragen.
 */
const precisionOf = (properties: PhotonProperties): GeocodingPrecision => {
  if (properties.type === 'house' || clean(properties.housenumber) !== '') {
    return 'address';
  }
  if (properties.type === 'street') return 'street';
  return 'place';
};

/**
 * Photon kennt "city" (Gemeinde) und "district" (Ortsteil) nebeneinander. Die
 * Gemeinde ordnet ein, der Ortsteil steht nur dann dafuer ein, wenn es keine
 * gibt -- "Astruper Straße 28, 26209 Hatten" ist die Zeile, die auf einem
 * Briefumschlag stuende.
 */
const partsOf = (properties: PhotonProperties): AddressParts => ({
  name: properties.name,
  street: properties.street,
  houseNumber: properties.housenumber,
  postalCode: properties.postcode,
  place: clean(properties.city) !== '' ? properties.city : properties.district,
  county: properties.county,
  state: properties.state,
  country: properties.country,
  countryCode: properties.countrycode,
});

export class PhotonGeocoder implements GeocodingProvider {
  constructor(private readonly baseUrl: string = DEFAULT_PHOTON_BASE_URL) {}

  async search(
    address: string,
    limit = 5,
    homeCountry: string | null = null,
  ): Promise<GeocodingCandidate[]> {
    const query = address.trim();

    if (query.length === 0) {
      throw new DomainError(
        'INVALID_INPUT',
        'Bitte gib einen Ort oder eine Adresse ein.',
      );
    }

    const url = new URL(`${this.baseUrl}/api`);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('lang', LANGUAGE);

    const payload = await this.request(url);
    const candidates: GeocodingCandidate[] = [];

    for (const feature of payload.features ?? []) {
      const coordinates = feature.geometry?.coordinates;
      if (coordinates === undefined) continue;

      const [longitude, latitude] = coordinates;
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;

      const properties = feature.properties ?? {};

      candidates.push({
        label: labelOf(partsOf(properties), query, homeCountry),
        coordinate: { latitude, longitude },
        precision: precisionOf(properties),
      });
    }

    return candidates;
  }

  async geocode(address: string): Promise<Coordinate> {
    const [best] = await this.search(address, 1);

    if (best === undefined) {
      throw new DomainError(
        'ADDRESS_NOT_FOUND',
        `Die Adresse "${address}" konnte nicht gefunden werden.`,
      );
    }

    return best.coordinate;
  }

  /**
   * Eigener Aufruf statt orsFetch: Photon ist ein anderer Dienst ohne
   * Schluessel, und ein Authorization-Header gehoert dort nicht hin.
   */
  private async request(url: URL): Promise<PhotonResponse> {
    let response: Response;

    try {
      response = await fetch(url.toString(), {
        headers: { Accept: 'application/json, application/geo+json' },
      });
    } catch (cause) {
      throw new DomainError(
        'PROVIDER_UNAVAILABLE',
        'Die Adresssuche ist momentan nicht erreichbar. Bitte versuche es erneut.',
        cause instanceof Error ? cause.message : undefined,
      );
    }

    if (response.status === 429) {
      throw new DomainError(
        'PROVIDER_RATE_LIMITED',
        'Das Anfragelimit der Adresssuche ist erreicht. Bitte versuche es später erneut.',
      );
    }

    if (!response.ok) {
      throw new DomainError(
        'PROVIDER_UNAVAILABLE',
        'Die Adresssuche ist momentan nicht erreichbar. Bitte versuche es erneut.',
        `HTTP ${response.status}`,
      );
    }

    try {
      return (await response.json()) as PhotonResponse;
    } catch {
      throw new DomainError(
        'PROVIDER_UNAVAILABLE',
        'Die Antwort der Adresssuche war unlesbar. Bitte versuche es erneut.',
      );
    }
  }
}
