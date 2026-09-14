import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhotonGeocoder } from '../src/infrastructure/geocoding/photon-geocoder.js';
import { FallbackGeocodingProvider } from '../src/infrastructure/geocoding/fallback-geocoder.js';
import { DomainError } from '../src/domain/models/errors.js';
import type { GeocodingProvider } from '../src/domain/ports/geocoding-provider.js';

const mockFetch = (response: Partial<Response> & { json?: () => Promise<unknown> }) => {
  const spy = vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: response.json ?? (async () => ({})),
  });
  vi.stubGlobal('fetch', spy);
  return spy;
};

/** Die echte Antwort auf "Astruper Straße 28, Hatten" -- der Anlass des Wechsels. */
const house = {
  geometry: { coordinates: [8.2506713, 53.0518256] },
  properties: {
    osm_id: 1454451672,
    type: 'house',
    housenumber: '28',
    street: 'Astruper Straße',
    district: 'Sandkrug',
    city: 'Hatten',
    county: 'Landkreis Oldenburg',
    state: 'Niedersachsen',
    postcode: '26209',
    country: 'Deutschland',
    countrycode: 'DE',
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PhotonGeocoder', () => {
  it('mappt einen Haustreffer auf einen Kandidaten mit deutscher Bezeichnung', async () => {
    const spy = mockFetch({ json: async () => ({ features: [house] }) });

    const candidates = await new PhotonGeocoder().search('Astruper Straße 28, Hatten', 5, 'DE');

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toContain('https://photon.komoot.io/api');
    expect(url).toContain('lang=de');

    expect(candidates).toEqual([
      {
        // Kein "Deutschland", kein Bundeslandkuerzel, dafuer die PLZ.
        label: 'Astruper Straße 28, 26209 Hatten',
        coordinate: { latitude: 53.0518256, longitude: 8.2506713 },
        precision: 'address',
      },
    ]);
  });

  it('nennt das Land nur im Ausland', async () => {
    mockFetch({
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [6.57, 53.22] },
            properties: {
              type: 'house',
              housenumber: '1',
              street: 'Kerkstraat',
              city: 'Groningen',
              postcode: '9745CC',
              country: 'Niederlande',
              countrycode: 'NL',
            },
          },
        ],
      }),
    });

    const [candidate] = await new PhotonGeocoder().search('Kerkstraat 1');

    expect(candidate?.label).toBe('Kerkstraat 1, 9745CC Groningen, Niederlande');
  });

  it('ordnet einen Ort ueber den Kreis ein, statt den Namen zu wiederholen', async () => {
    mockFetch({
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [7.92, 53.25] },
            properties: {
              type: 'city',
              name: 'Westerstede',
              county: 'Landkreis Ammerland',
              state: 'Niedersachsen',
              country: 'Deutschland',
              countrycode: 'DE',
            },
          },
        ],
      }),
    });

    const [candidate] = await new PhotonGeocoder().search('Westerstede', 5, 'DE');

    expect(candidate?.label).toBe('Westerstede, Landkreis Ammerland');
    expect(candidate?.precision).toBe('place');
  });

  it('meldet einen Strassentreffer als "street"', async () => {
    mockFetch({
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [8.247297, 53.048798] },
            properties: {
              type: 'street',
              name: 'Astruper Straße',
              city: 'Hatten',
              postcode: '26209',
              country: 'Deutschland',
              countrycode: 'DE',
            },
          },
        ],
      }),
    });

    const [candidate] = await new PhotonGeocoder().search('Astruper Straße, Hatten');

    expect(candidate?.precision).toBe('street');
  });

  it('wirft ADDRESS_NOT_FOUND, wenn nichts gefunden wird', async () => {
    mockFetch({ json: async () => ({ features: [] }) });

    await expect(new PhotonGeocoder().geocode('Nirgendwo')).rejects.toMatchObject({
      code: 'ADDRESS_NOT_FOUND',
    });
  });

  it('mappt HTTP-Fehler auf Domain-Fehler', async () => {
    mockFetch({ ok: false, status: 503 });

    await expect(new PhotonGeocoder().search('Münster')).rejects.toBeInstanceOf(
      DomainError,
    );
  });

  it('schickt keinen Authorization-Header -- Photon kennt keinen Schluessel', async () => {
    const spy = mockFetch({ json: async () => ({ features: [house] }) });

    await new PhotonGeocoder().search('Astruper Straße 28');

    const [, init] = spy.mock.calls[0] as [string, RequestInit | undefined];
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

const stub = (overrides: Partial<GeocodingProvider>): GeocodingProvider => ({
  search: vi.fn(async () => []),
  geocode: vi.fn(async () => ({ latitude: 0, longitude: 0 })),
  ...overrides,
});

describe('FallbackGeocodingProvider', () => {
  it('fragt den Zweiten, wenn der Erste nicht erreichbar ist', async () => {
    const fallback = stub({
      search: vi.fn(async () => [
        {
          label: 'aus dem Rueckfall',
          coordinate: { latitude: 1, longitude: 2 },
          precision: 'address' as const,
        },
      ]),
    });
    const primary = stub({
      search: vi.fn(async () => {
        throw new DomainError('PROVIDER_UNAVAILABLE', 'weg');
      }),
    });

    const candidates = await new FallbackGeocodingProvider(primary, fallback).search('x');

    expect(candidates[0]?.label).toBe('aus dem Rueckfall');
    expect(fallback.search).toHaveBeenCalled();
  });

  /**
   * Der entscheidende Fall: Photon findet "Astruper Straße 28" nicht mehr,
   * antwortet aber. Pelias antwortete darauf mit dem Strassenmittelpunkt --
   * 405 m daneben. Ein ehrliches "nichts" ist besser als eine stille
   * Falschauskunft.
   */
  it('fragt den Zweiten NICHT, wenn der Erste antwortet und nichts findet', async () => {
    const fallback = stub({});
    const primary = stub({ search: vi.fn(async () => []) });

    const candidates = await new FallbackGeocodingProvider(primary, fallback).search('x');

    expect(candidates).toEqual([]);
    expect(fallback.search).not.toHaveBeenCalled();
  });

  it('reicht eine leere Eingabe durch, statt sie zweimal ablehnen zu lassen', async () => {
    const fallback = stub({});
    const primary = stub({
      search: vi.fn(async () => {
        throw new DomainError('INVALID_INPUT', 'leer');
      }),
    });

    await expect(
      new FallbackGeocodingProvider(primary, fallback).search(''),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(fallback.search).not.toHaveBeenCalled();
  });

  it('faellt auch beim Anfragelimit zurueck', async () => {
    const fallback = stub({
      geocode: vi.fn(async () => ({ latitude: 9, longitude: 9 })),
    });
    const primary = stub({
      geocode: vi.fn(async () => {
        throw new DomainError('PROVIDER_RATE_LIMITED', 'zu viel');
      }),
    });

    const coordinate = await new FallbackGeocodingProvider(primary, fallback).geocode(
      'x',
    );

    expect(coordinate).toEqual({ latitude: 9, longitude: 9 });
  });
});
