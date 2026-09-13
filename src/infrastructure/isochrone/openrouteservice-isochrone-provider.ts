import type { TravelMode } from '../../domain/models/analysis.js';
import { DomainError } from '../../domain/models/errors.js';
import type { AreaFeature, Coordinate } from '../../domain/models/geo.js';
import type {
  IsochroneOptions,
  IsochroneProvider,
} from '../../domain/ports/isochrone-provider.js';
import { DEFAULT_ISOCHRONE_BASE_URL, orsFetch } from '../openrouteservice/client.js';

/**
 * Domain-Verkehrsmittel -> ORS-Profil. Bleibt im Adapter (Spec 13).
 *
 * ORS kennt beim Rad mehrere Profile (`cycling-regular`, `-road`, `-mountain`,
 * `-electric`). Für die Frage "wo kann ich wohnen" trennen Rennrad und
 * Mountainbike nichts Sinnvolles -- `cycling-regular` als Alltagsrad und
 * `cycling-electric` als Pedelec decken den echten Unterschied ab.
 */
const PROFILE_BY_TRAVEL_MODE: Record<TravelMode, string> = {
  driving: 'driving-car',
  cycling: 'cycling-regular',
  ebike: 'cycling-electric',
  walking: 'foot-walking',
};

type OrsIsochroneResponse = {
  features?: Array<{
    type?: string;
    geometry?: { type?: string; coordinates?: unknown };
    properties?: Record<string, unknown>;
  }>;
};

/** ORS lehnt range > 3600 Sekunden mit Fehlercode 3004 ab. */
const MAX_RANGE_SECONDS = 3600;

export class OpenRouteServiceIsochroneProvider implements IsochroneProvider {
  readonly maxTravelTimeMinutes = MAX_RANGE_SECONDS / 60;

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = DEFAULT_ISOCHRONE_BASE_URL,
  ) {}

  async calculate(origin: Coordinate, options: IsochroneOptions): Promise<AreaFeature> {
    if (options.maxTravelTimeMinutes > this.maxTravelTimeMinutes) {
      // Vorab abfangen: ORS antwortet sonst mit einem generischen 400er.
      throw new DomainError(
        'INVALID_INPUT',
        `Der Kartendienst unterstützt maximal ${this.maxTravelTimeMinutes} Minuten Fahrzeit.`,
      );
    }

    const profile = PROFILE_BY_TRAVEL_MODE[options.travelMode];

    const payload = (await orsFetch(
      `${this.baseUrl}/v2/isochrones/${profile}`,
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
