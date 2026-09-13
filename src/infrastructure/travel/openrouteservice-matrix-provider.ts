import type { TravelMode } from '../../domain/models/analysis.js';
import { DomainError } from '../../domain/models/errors.js';
import type { Coordinate } from '../../domain/models/geo.js';
import type {
  TravelLeg,
  TravelTimeProvider,
} from '../../domain/ports/travel-time-provider.js';
import { DEFAULT_ISOCHRONE_BASE_URL, orsFetch } from '../openrouteservice/client.js';

/** Dieselbe Zuordnung wie bei den Isochronen; beide bleiben im Adapter (Spec 13). */
const PROFILE_BY_TRAVEL_MODE: Record<TravelMode, string> = {
  driving: 'driving-car',
  cycling: 'cycling-regular',
  ebike: 'cycling-electric',
  walking: 'foot-walking',
};

type OrsMatrixResponse = {
  durations?: Array<Array<number | null>>;
  distances?: Array<Array<number | null>>;
};

/**
 * Misst über die Matrix-API statt über einzelne Routen: Ein Aufruf deckt alle
 * Ziele desselben Verkehrsmittels ab. Bei fünf Zielen ist das ein Aufruf statt
 * fünf -- und die Matrix hat bei ORS ihr eigenes Tageskontingent, verbraucht
 * also nichts von dem der Isochronen.
 */
export class OpenRouteServiceMatrixProvider implements TravelTimeProvider {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = DEFAULT_ISOCHRONE_BASE_URL,
  ) {}

  async measure(
    origin: Coordinate,
    destinations: Coordinate[],
    travelMode: TravelMode,
  ): Promise<(TravelLeg | null)[]> {
    if (destinations.length === 0) return [];

    const profile = PROFILE_BY_TRAVEL_MODE[travelMode];
    const locations = [origin, ...destinations].map((point) => [
      point.longitude,
      point.latitude,
    ]);

    const payload = (await orsFetch(
      `${this.baseUrl}/v2/matrix/${profile}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations,
          sources: [0],
          destinations: destinations.map((_, index) => index + 1),
          metrics: ['duration', 'distance'],
          units: 'km',
        }),
      },
      this.apiKey,
    )) as OrsMatrixResponse;

    const durations = payload.durations?.[0];
    const distances = payload.distances?.[0];

    if (durations === undefined || durations.length !== destinations.length) {
      throw new DomainError(
        'PROVIDER_UNAVAILABLE',
        'Die Fahrzeiten konnten nicht berechnet werden.',
        'Der Kartendienst hat keine vollständige Matrix zurückgeliefert.',
      );
    }

    return durations.map((seconds, index) => {
      const kilometers = distances?.[index];

      // ORS setzt null, wenn es keine Route gibt. Ohne Strecke ist die Zeit
      // fachlich nichts wert -- lieber gar keine Angabe als eine halbe.
      if (
        seconds === null ||
        seconds === undefined ||
        kilometers === null ||
        kilometers === undefined
      ) {
        return null;
      }

      return { durationMinutes: seconds / 60, distanceKm: kilometers };
    });
  }
}
