import type { TravelMode } from '../../domain/models/analysis.js';
import { DomainError } from '../../domain/models/errors.js';
import type { AreaFeature, Coordinate } from '../../domain/models/geo.js';
import type {
  IsochroneOptions,
  IsochroneProvider,
} from '../../domain/ports/isochrone-provider.js';
import { ORS_BASE_URL, orsFetch } from '../openrouteservice/client.js';

/** Domain-Verkehrsmittel -> ORS-Profil. Bleibt im Adapter (Spec 13). */
const PROFILE_BY_TRAVEL_MODE: Record<TravelMode, string> = {
  driving: 'driving-car',
  cycling: 'cycling-regular',
  walking: 'foot-walking',
};

type OrsIsochroneResponse = {
  features?: Array<{
    type?: string;
    geometry?: { type?: string; coordinates?: unknown };
    properties?: Record<string, unknown>;
  }>;
};

export class OpenRouteServiceIsochroneProvider implements IsochroneProvider {
  constructor(private readonly apiKey: string) {}

  async calculate(origin: Coordinate, options: IsochroneOptions): Promise<AreaFeature> {
    const profile = PROFILE_BY_TRAVEL_MODE[options.travelMode];

    const payload = (await orsFetch(
      `${ORS_BASE_URL}/v2/isochrones/${profile}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations: [[origin.longitude, origin.latitude]],
          range: [Math.round(options.maxTravelTimeMinutes * 60)],
          range_type: 'time',
          area_units: 'km',
        }),
      },
      this.apiKey,
    )) as OrsIsochroneResponse;

    const feature = payload.features?.[0];
    const geometry = feature?.geometry;

    if (geometry?.type !== 'Polygon' && geometry?.type !== 'MultiPolygon') {
      throw new DomainError(
        'PROVIDER_UNAVAILABLE',
        'Für diesen Ort konnte keine Isochrone berechnet werden.',
        'Der Kartendienst hat keine Fläche zurückgeliefert.',
      );
    }

    // Provider-Properties bewusst verwerfen; nur die Geometrie ist fachlich relevant.
    return {
      type: 'Feature',
      properties: {},
      geometry: geometry as AreaFeature['geometry'],
    };
  }
}
