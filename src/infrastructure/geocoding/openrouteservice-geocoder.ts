import { DomainError } from '../../domain/models/errors.js';
import type { Coordinate } from '../../domain/models/geo.js';
import type {
  GeocodingCandidate,
  GeocodingProvider,
} from '../../domain/ports/geocoding-provider.js';
import { DEFAULT_GEOCODING_BASE_URL, orsFetch } from '../openrouteservice/client.js';
import { labelOf, precisionOf, type PeliasProperties } from './pelias-label.js';

/** Ausschnitt der Pelias-Antwort, den dieser Adapter auswertet. */
type OrsGeocodeResponse = {
  geocoding?: {
    query?: {
      parsed_text?: {
        housenumber?: string;
        street?: string;
        city?: string;
        postalcode?: string;
        country?: string;
      };
    };
  };
  features?: Array<{
    geometry?: { coordinates?: [number, number] };
    properties?: PeliasProperties;
  }>;
};

type ParsedQuery = NonNullable<
  NonNullable<NonNullable<OrsGeocodeResponse['geocoding']>['query']>['parsed_text']
>;

/**
 * Ortsnamen kommen in der Sprache der Urfassung zurück ("Niederlande" statt
 * "Netherlands"). Die Bezeichnung wird beim Bestätigen festgehalten und bleibt
 * gespeichert; sie darf deshalb nicht an einer Einstellung hängen, die der
 * Nutzer danach umlegen kann -- sonst stünden nach einem Sprachwechsel zwei
 * Sprachen in derselben Liste.
 */
const LANGUAGE = 'de';

export class OpenRouteServiceGeocoder implements GeocodingProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = DEFAULT_GEOCODING_BASE_URL,
  ) {}

  async search(address: string, limit = 5): Promise<GeocodingCandidate[]> {
    const query = address.trim();

    if (query.length === 0) {
      throw new DomainError(
        'INVALID_INPUT',
        'Bitte gib einen Ort oder eine Adresse ein.',
      );
    }

    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set('text', query);
    url.searchParams.set('size', String(limit));

    const payload = await this.request(url);
    const candidates = this.toCandidates(payload, query);
    const parsed = payload.geocoding?.query?.parsed_text;

    // Pelias fällt still auf den Mittelpunkt eines Ortsteils zurück, wenn es
    // die Hausnummer daneben nicht auflösen kann: "Burnhörn 32 Ocholt
    // Westerstede" ergibt genau einen Treffer -- den Zentroid von Ocholt, rund
    // 900 m neben dem Haus. Der Flaeche sieht das niemand an, und bei einem
    // einzigen Treffer übernimmt die Oberfläche ihn ohne Rückfrage. Nach einer
    // Hausnummer ist aber ausdrücklich gefragt worden; kommt keine zurück,
    // folgt eine zweite, strukturierte Anfrage ohne den Ortsteil.
    if (
      parsed?.housenumber !== undefined &&
      !candidates.some((candidate) => candidate.precision === 'address')
    ) {
      const exact = await this.searchStructured(parsed, limit, query);
      if (exact.length > 0) return dedupe([...exact, ...candidates]);
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
   * Zweiter Anlauf über die strukturierte Suche: Straße mit Hausnummer als
   * Adresse, Ort und Postleitzahl getrennt daneben. Der Ortsteil aus der
   * Eingabe bleibt weg -- genau er bringt die Freitextsuche vom Haus ab.
   */
  private async searchStructured(
    parsed: ParsedQuery,
    limit: number,
    fallbackLabel: string,
  ): Promise<GeocodingCandidate[]> {
    const street = parsed.street?.trim() ?? '';
    if (street === '') return [];

    const url = new URL(`${this.baseUrl}/search/structured`);
    url.searchParams.set('address', `${street} ${parsed.housenumber ?? ''}`.trim());
    url.searchParams.set('size', String(limit));
    if (parsed.city !== undefined) url.searchParams.set('locality', parsed.city);
    if (parsed.postalcode !== undefined) {
      url.searchParams.set('postalcode', parsed.postalcode);
    }
    if (parsed.country !== undefined) url.searchParams.set('country', parsed.country);

    const payload = await this.request(url);

    return this.toCandidates(payload, fallbackLabel).filter(
      (candidate) => candidate.precision === 'address',
    );
  }

  private async request(url: URL): Promise<OrsGeocodeResponse> {
    url.searchParams.set('lang', LANGUAGE);

    // Der Key geht ausschliesslich ueber den Authorization-Header, damit er
    // nicht in URLs, Proxy- oder Server-Logs landet.
    return (await orsFetch(
      url.toString(),
      { method: 'GET' },
      this.apiKey,
    )) as OrsGeocodeResponse;
  }

  private toCandidates(
    payload: OrsGeocodeResponse,
    fallbackLabel: string,
  ): GeocodingCandidate[] {
    const candidates: GeocodingCandidate[] = [];

    for (const feature of payload.features ?? []) {
      const coordinates = feature.geometry?.coordinates;
      if (coordinates === undefined) continue;

      const [longitude, latitude] = coordinates;
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;

      const properties = feature.properties ?? {};

      candidates.push({
        label: labelOf(properties, fallbackLabel),
        coordinate: { latitude, longitude },
        precision: precisionOf(properties.layer),
      });
    }

    return candidates;
  }
}

/** Beide Anläufe können denselben Ort liefern; zweimal dieselbe Zeile hilft nicht. */
const dedupe = (candidates: GeocodingCandidate[]): GeocodingCandidate[] => {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = `${candidate.coordinate.latitude},${candidate.coordinate.longitude}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
