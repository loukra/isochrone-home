import { afterEach, describe, expect, it, vi } from 'vitest';
import { TravelTimeQuery } from '../src/application/analysis/travel-times.js';
import { OpenRouteServiceMatrixProvider } from '../src/infrastructure/travel/openrouteservice-matrix-provider.js';
import type { TravelMode } from '../src/domain/models/analysis.js';
import type { Coordinate } from '../src/domain/models/geo.js';
import type {
  TravelLeg,
  TravelTimeProvider,
} from '../src/domain/ports/travel-time-provider.js';

const at = (latitude: number, longitude: number): Coordinate => ({ latitude, longitude });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TravelTimeQuery', () => {
  /** Zählt die Aufrufe mit und antwortet mit der Position als Minutenzahl. */
  const recordingProvider = () => {
    const calls: Array<{ mode: TravelMode; count: number }> = [];

    const provider: TravelTimeProvider = {
      async measure(_origin, destinations, travelMode) {
        calls.push({ mode: travelMode, count: destinations.length });
        return destinations.map((destination) => ({
          durationMinutes: destination.latitude,
          distanceKm: destination.longitude,
        }));
      },
    };

    return { provider, calls };
  };

  it('bündelt je Verkehrsmittel statt je Ziel', async () => {
    const { provider, calls } = recordingProvider();

    await new TravelTimeQuery(provider).execute({
      origin: at(53, 8),
      targets: [
        { id: 'a', coordinate: at(1, 1), travelMode: 'driving' },
        { id: 'b', coordinate: at(2, 2), travelMode: 'driving' },
        { id: 'c', coordinate: at(3, 3), travelMode: 'cycling' },
      ],
    });

    // Drei Ziele, zwei Verkehrsmittel -- also zwei Aufrufe, nicht drei.
    expect(calls).toHaveLength(2);
    expect(calls).toContainEqual({ mode: 'driving', count: 2 });
    expect(calls).toContainEqual({ mode: 'cycling', count: 1 });
  });

  it('liefert die Ergebnisse in der Reihenfolge der Anfrage zurück', async () => {
    const { provider } = recordingProvider();

    const result = await new TravelTimeQuery(provider).execute({
      origin: at(53, 8),
      targets: [
        { id: 'rad', coordinate: at(10, 20), travelMode: 'cycling' },
        { id: 'auto', coordinate: at(30, 40), travelMode: 'driving' },
        { id: 'fuss', coordinate: at(50, 60), travelMode: 'walking' },
      ],
    });

    expect(result.legs).toEqual([
      { constraintId: 'rad', durationMinutes: 10, distanceKm: 20 },
      { constraintId: 'auto', durationMinutes: 30, distanceKm: 40 },
      { constraintId: 'fuss', durationMinutes: 50, distanceKm: 60 },
    ]);
  });

  it('gibt eine fehlende Route als null weiter statt zu scheitern', async () => {
    const provider: TravelTimeProvider = {
      async measure(): Promise<(TravelLeg | null)[]> {
        return [null];
      },
    };

    const result = await new TravelTimeQuery(provider).execute({
      origin: at(53, 8),
      targets: [{ id: 'insel', coordinate: at(1, 1), travelMode: 'driving' }],
    });

    expect(result.legs).toEqual([
      { constraintId: 'insel', durationMinutes: null, distanceKm: null },
    ]);
  });

  it('fragt ohne Ziele gar nicht erst beim Provider nach', async () => {
    const measure = vi.fn();

    const result = await new TravelTimeQuery({ measure }).execute({
      origin: at(53, 8),
      targets: [],
    });

    expect(result.legs).toEqual([]);
    expect(measure).not.toHaveBeenCalled();
  });
});

describe('OpenRouteServiceMatrixProvider', () => {
  const mockFetch = (payload: unknown) => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    });
    vi.stubGlobal('fetch', spy);
    return spy;
  };

  it('fragt eine Zeile der Matrix ab und rechnet Sekunden in Minuten um', async () => {
    const spy = mockFetch({ durations: [[600, 1230]], distances: [[8.4, 17.25]] });

    const legs = await new OpenRouteServiceMatrixProvider('key').measure(
      at(53.14, 8.21),
      [at(53.2, 8.3), at(53.3, 8.4)],
      'driving',
    );

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.heigit.org/openrouteservice/v2/matrix/driving-car');
    // Der Key gehört in den Header, nie in die URL.
    expect(url).not.toContain('api_key');
    expect((init.headers as Record<string, string>).Authorization).toBe('key');

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    // Der Startpunkt ist Index 0, die Ziele folgen -- als GeoJSON lon/lat.
    expect(body.locations).toEqual([
      [8.21, 53.14],
      [8.3, 53.2],
      [8.4, 53.3],
    ]);
    expect(body.sources).toEqual([0]);
    expect(body.destinations).toEqual([1, 2]);
    expect(body.units).toBe('km');

    expect(legs).toEqual([
      { durationMinutes: 10, distanceKm: 8.4 },
      { durationMinutes: 20.5, distanceKm: 17.25 },
    ]);
  });

  it('übersetzt das Verkehrsmittel in ein ORS-Profil', async () => {
    const spy = mockFetch({ durations: [[60]], distances: [[1]] });

    await new OpenRouteServiceMatrixProvider('key').measure(
      at(53.14, 8.21),
      [at(53.2, 8.3)],
      'ebike',
    );

    expect(spy.mock.calls[0]?.[0]).toContain('/v2/matrix/cycling-electric');
  });

  it('meldet eine fehlende Route als null, nicht als Fehler', async () => {
    mockFetch({ durations: [[null, 300]], distances: [[null, 4]] });

    const legs = await new OpenRouteServiceMatrixProvider('key').measure(
      at(53.14, 8.21),
      [at(0, 0), at(53.2, 8.3)],
      'driving',
    );

    expect(legs).toEqual([null, { durationMinutes: 5, distanceKm: 4 }]);
  });

  it('spart den Aufruf, wenn es nichts zu messen gibt', async () => {
    const spy = mockFetch({});

    await expect(
      new OpenRouteServiceMatrixProvider('key').measure(at(53.14, 8.21), [], 'driving'),
    ).resolves.toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('wirft, wenn die Matrix nicht zu den angefragten Zielen passt', async () => {
    mockFetch({ durations: [[600]], distances: [[8.4]] });

    await expect(
      new OpenRouteServiceMatrixProvider('key').measure(
        at(53.14, 8.21),
        [at(53.2, 8.3), at(53.3, 8.4)],
        'driving',
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });
});
