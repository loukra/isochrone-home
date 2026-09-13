import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenRouteServiceGeocoder } from '../src/infrastructure/geocoding/openrouteservice-geocoder.js';
import { OpenRouteServiceIsochroneProvider } from '../src/infrastructure/isochrone/openrouteservice-isochrone-provider.js';
import { DomainError } from '../src/domain/models/errors.js';

const mockFetch = (response: Partial<Response> & { json?: () => Promise<unknown> }) => {
  const spy = vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: response.json ?? (async () => ({})),
  });
  vi.stubGlobal('fetch', spy);
  return spy;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('OpenRouteServiceGeocoder', () => {
  it('mappt Pelias-Features auf Domain-Kandidaten', async () => {
    const spy = mockFetch({
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [7.63, 51.96] },
            properties: { label: 'Münster, Deutschland' },
          },
        ],
      }),
    });

    const candidates = await new OpenRouteServiceGeocoder('key').search('Münster');

    const [url, init] = spy.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toContain('https://api.heigit.org/pelias/v1/search');
    // Der Key darf nicht in der URL stehen.
    expect(url).not.toContain('api_key');
    expect((init?.headers as Record<string, string>).Authorization).toBe('key');

    expect(candidates).toEqual([
      { label: 'Münster, Deutschland', coordinate: { latitude: 51.96, longitude: 7.63 } },
    ]);
  });

  it('wirft ADDRESS_NOT_FOUND bei leerer Trefferliste', async () => {
    mockFetch({ json: async () => ({ features: [] }) });

    await expect(
      new OpenRouteServiceGeocoder('key').geocode('Nirgendwo'),
    ).rejects.toMatchObject({ code: 'ADDRESS_NOT_FOUND' });
  });

  it('mappt 429 auf PROVIDER_RATE_LIMITED', async () => {
    mockFetch({ ok: false, status: 429 });

    await expect(
      new OpenRouteServiceGeocoder('key').search('Münster'),
    ).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMITED',
    });
  });

  it('mappt 403 auf CONFIGURATION_ERROR', async () => {
    mockFetch({ ok: false, status: 403 });

    await expect(
      new OpenRouteServiceGeocoder('key').search('Münster'),
    ).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR',
    });
  });

  it('mappt Netzwerkfehler auf PROVIDER_UNAVAILABLE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));

    await expect(
      new OpenRouteServiceGeocoder('key').search('Münster'),
    ).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });
});

describe('OpenRouteServiceIsochroneProvider', () => {
  it('schickt Sekunden und das driving-car-Profil', async () => {
    const spy = mockFetch({
      json: async () => ({
        features: [
          {
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 0],
                ],
              ],
            },
            properties: { value: 1800 },
          },
        ],
      }),
    });

    const result = await new OpenRouteServiceIsochroneProvider('key').calculate(
      { latitude: 51.96, longitude: 7.63 },
      { travelMode: 'driving', maxTravelTimeMinutes: 30 },
    );

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.heigit.org/openrouteservice/v2/isochrones/driving-car');
    expect(JSON.parse(init.body as string)).toMatchObject({
      locations: [[7.63, 51.96]],
      range: [1800],
      range_type: 'time',
    });

    // Provider-Properties werden nicht durchgereicht.
    expect(result.properties).toEqual({});
    expect(result.geometry.type).toBe('Polygon');
  });

  it('meldet eine Fahrzeit über dem Providerlimit als Eingabefehler', async () => {
    const spy = mockFetch({ json: async () => ({ features: [] }) });
    const provider = new OpenRouteServiceIsochroneProvider('key');

    expect(provider.maxTravelTimeMinutes).toBe(60);

    await expect(
      provider.calculate(
        { latitude: 51.96, longitude: 7.63 },
        { travelMode: 'driving', maxTravelTimeMinutes: 75 },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    // Gar nicht erst beim Provider anfragen.
    expect(spy).not.toHaveBeenCalled();
  });

  it('akzeptiert genau das Providerlimit', async () => {
    const spy = mockFetch({
      json: async () => ({
        features: [
          {
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [0, 0],
                  [1, 0],
                  [1, 1],
                  [0, 0],
                ],
              ],
            },
          },
        ],
      }),
    });

    await new OpenRouteServiceIsochroneProvider('key').calculate(
      { latitude: 51.96, longitude: 7.63 },
      { travelMode: 'driving', maxTravelTimeMinutes: 60 },
    );

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).range).toEqual([3600]);
  });

  it('wirft einen Domain-Fehler wenn keine Fläche geliefert wird', async () => {
    mockFetch({ json: async () => ({ features: [] }) });

    await expect(
      new OpenRouteServiceIsochroneProvider('key').calculate(
        { latitude: 51.96, longitude: 7.63 },
        { travelMode: 'driving', maxTravelTimeMinutes: 30 },
      ),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
