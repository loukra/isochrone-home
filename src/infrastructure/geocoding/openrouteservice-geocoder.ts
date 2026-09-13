import { DomainError } from '../../domain/models/errors.js';
import type { Coordinate } from '../../domain/models/geo.js';
import type {
  GeocodingCandidate,
  GeocodingProvider,
} from '../../domain/ports/geocoding-provider.js';
import { ORS_BASE_URL, orsFetch } from '../openrouteservice/client.js';

/** Ausschnitt der Pelias-Antwort, den dieser Adapter auswertet. */
type OrsGeocodeResponse = {
  features?: Array<{
    geometry?: { coordinates?: [number, number] };
    properties?: { label?: string; name?: string };
  }>;
};

export class OpenRouteServiceGeocoder implements GeocodingProvider {
  constructor(private readonly apiKey: string) {}

  async search(address: string, limit = 5): Promise<GeocodingCandidate[]> {
    const query = address.trim();

    if (query.length === 0) {
      throw new DomainError(
        'INVALID_INPUT',
        'Bitte gib einen Ort oder eine Adresse ein.',
      );
    }

    const url = new URL(`${ORS_BASE_URL}/geocode/search`);
    url.searchParams.set('api_key', this.apiKey);
    url.searchParams.set('text', query);
    url.searchParams.set('size', String(limit));

    const payload = (await orsFetch(
      url.toString(),
      { method: 'GET' },
      this.apiKey,
    )) as OrsGeocodeResponse;

    const candidates: GeocodingCandidate[] = [];

    for (const feature of payload.features ?? []) {
      const coordinates = feature.geometry?.coordinates;
      if (coordinates === undefined) continue;

      const [longitude, latitude] = coordinates;
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;

      candidates.push({
        label: feature.properties?.label ?? feature.properties?.name ?? query,
        coordinate: { latitude, longitude },
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
}
