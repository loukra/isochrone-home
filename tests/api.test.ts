import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/api/server.js';
import type { AppConfig } from '../src/infrastructure/configuration/config.js';

/** Echter fetch -- die Tests stubben globalThis.fetch für die Provider-Aufrufe. */
const realFetch = globalThis.fetch;

const CONFIG: AppConfig = {
  port: 0,
  analysisStrategy: 'isochrone-intersection',
  geocodingProvider: 'openrouteservice',
  isochroneProvider: 'openrouteservice',
  openRouteServiceApiKey: 'test-key',
  openRouteServiceIsochroneUrl: 'https://api.heigit.org/openrouteservice',
  openRouteServiceGeocodingUrl: 'https://api.heigit.org/pelias/v1',
  overpassUrl: 'https://overpass.test/api/interpreter',
  mapStyleUrl: 'https://example.test/style.json',
  mapStyleUrlDark: 'https://example.test/style-dark.json',
  mapToken: null,
  // Wird je Test durch ein frisches Verzeichnis ersetzt.
  cacheDirectory: '',
  cacheIsochroneDays: 7,
  cachePoiHours: 24,
  cacheGeocodeDays: 30,
  cacheRouteDays: 7,
};

const polygon = (west: number, south: number, east: number, north: number) => ({
  type: 'Polygon',
  coordinates: [
    [
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ],
  ],
});

/** Beantwortet ORS-Aufrufe je nach URL mit Geocoding- oder Isochronen-Daten. */
const stubOrs = (options: {
  geocode?: unknown;
  isochrones?: unknown[];
  matrix?: unknown;
  status?: number;
}) => {
  let isochroneIndex = 0;

  const spy = vi.fn(async (url: string) => {
    if (options.status !== undefined && options.status >= 400) {
      return { ok: false, status: options.status, json: async () => ({}) };
    }

    if (url.includes('/v2/matrix/')) {
      return {
        ok: true,
        status: 200,
        json: async () => options.matrix ?? { durations: [[]], distances: [[]] },
      };
    }

    if (url.includes('/pelias/v1/search')) {
      return {
        ok: true,
        status: 200,
        json: async () => options.geocode ?? { features: [] },
      };
    }

    const geometry = options.isochrones?.[isochroneIndex++] ?? polygon(0, 0, 10, 10);
    return {
      ok: true,
      status: 200,
      json: async () => ({ features: [{ geometry, properties: {} }] }),
    };
  });

  vi.stubGlobal('fetch', spy);
  return spy;
};

let server: Server;
let baseUrl: string;
let cacheDirectory: string;

const post = (path: string, body: unknown) =>
  realFetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  // Eigener Cache je Test: Sonst beantwortet ein Treffer aus dem vorigen Test
  // die Anfrage, der gestubbte fetch wird nie aufgerufen, und die Zusicherung
  // prueft nichts mehr.
  cacheDirectory = await mkdtemp(join(tmpdir(), 'location-optimizer-test-'));
  const app = createApp({ ...CONFIG, cacheDirectory });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(cacheDirectory, { recursive: true, force: true });
});

describe('GET /api/config', () => {
  it('liefert die Map-Konfiguration ohne Secrets', async () => {
    const response = await realFetch(`${baseUrl}/api/config`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      mapStyleUrl: CONFIG.mapStyleUrl,
      mapStyleUrlDark: CONFIG.mapStyleUrlDark,
      analysisStrategy: 'isochrone-intersection',
      maxTravelTimeMinutes: 60,
    });
    expect(JSON.stringify(body)).not.toContain('test-key');
  });
});

describe('POST /api/locations/check', () => {
  it('prüft mehrere Orte in einem Aufruf gegen beide Regionen', async () => {
    const response = await post('/api/locations/check', {
      coordinates: [
        { latitude: 5, longitude: 5 },
        { latitude: 8, longitude: 8 },
        { latitude: 50, longitude: 50 },
      ],
      intersection: { type: 'Feature', geometry: polygon(0, 0, 10, 10) },
      poiRegion: { type: 'Feature', geometry: polygon(6, 6, 10, 10) },
    });

    expect(response.status).toBe(200);
    // Die Antwort kommt in der Reihenfolge der Anfrage.
    await expect(response.json()).resolves.toEqual({
      results: [
        { inIntersection: true, inPoiRegion: false },
        { inIntersection: true, inPoiRegion: true },
        { inIntersection: false, inPoiRegion: false },
      ],
    });
  });

  it('meldet fehlende Regionen explizit als noch nicht prüfbar', async () => {
    const response = await post('/api/locations/check', {
      coordinates: [{ latitude: 5, longitude: 5 }],
      intersection: null,
      poiRegion: null,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      results: [{ inIntersection: null, inPoiRegion: null }],
    });
  });

  it('lehnt unvollständige GeoJSON-Geometrien ab', async () => {
    const response = await post('/api/locations/check', {
      coordinates: [{ latitude: 5, longitude: 5 }],
      intersection: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] } },
      poiRegion: null,
    });

    expect(response.status).toBe(400);
  });
});

describe('POST /api/locations/travel-times', () => {
  it('misst je Verkehrsmittel gebündelt und liefert Fahrzeit und Strecke', async () => {
    const spy = stubOrs({
      matrix: { durations: [[600, 1200]], distances: [[8.4, 17.2]] },
    });

    const response = await post('/api/locations/travel-times', {
      origin: { latitude: 53.14, longitude: 8.21 },
      targets: [
        {
          id: 'a',
          coordinate: { latitude: 53.2, longitude: 8.3 },
          travelMode: 'driving',
        },
        {
          id: 'b',
          coordinate: { latitude: 53.3, longitude: 8.4 },
          travelMode: 'driving',
        },
      ],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      legs: [
        { constraintId: 'a', durationMinutes: 10, distanceKm: 8.4 },
        { constraintId: 'b', durationMinutes: 20, distanceKm: 17.2 },
      ],
    });

    // Zwei Ziele, ein Verkehrsmittel -- ein einziger Provider-Aufruf.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('meldet eine fehlende Route als null statt als Fehler', async () => {
    stubOrs({ matrix: { durations: [[null]], distances: [[null]] } });

    const response = await post('/api/locations/travel-times', {
      origin: { latitude: 53.14, longitude: 8.21 },
      targets: [
        {
          id: 'a',
          coordinate: { latitude: 53.2, longitude: 8.3 },
          travelMode: 'driving',
        },
      ],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      legs: [{ constraintId: 'a', durationMinutes: null, distanceKm: null }],
    });
  });

  it('kommt ohne Ziele ohne Provider-Aufruf aus', async () => {
    const spy = stubOrs({});

    const response = await post('/api/locations/travel-times', {
      origin: { latitude: 53.14, longitude: 8.21 },
      targets: [],
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ legs: [] });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('POST /api/isochrone', () => {
  it('liefert die Isochrone eines bestätigten Ziels', async () => {
    stubOrs({
      geocode: {
        features: [
          { geometry: { coordinates: [7.63, 51.96] }, properties: { label: 'Münster' } },
        ],
      },
    });

    const response = await post('/api/isochrone', {
      id: 'a',
      name: 'Eltern A',
      address: 'Münster',
      travelMode: 'driving',
      maxTravelTimeMinutes: 30,
    });

    const body = (await response.json()) as {
      constraintId: string;
      layer: { type: string };
    };

    expect(response.status).toBe(200);
    expect(body.constraintId).toBe('a');
    expect(body.layer.type).toBe('isochrone');
  });

  it('reicht das Verkehrsmittel bis ins ORS-Profil durch', async () => {
    const spy = stubOrs({
      geocode: {
        features: [
          { geometry: { coordinates: [7.63, 51.96] }, properties: { label: 'Münster' } },
        ],
      },
    });

    const response = await post('/api/isochrone', {
      id: 'a',
      name: 'Eltern A',
      address: 'Münster',
      travelMode: 'ebike',
      maxTravelTimeMinutes: 20,
    });

    expect(response.status).toBe(200);
    const urls = spy.mock.calls.map((call) => String(call[0]));
    expect(urls.some((url) => url.includes('/isochrones/cycling-electric'))).toBe(true);
  });

  it('antwortet mit 400 bei unbekanntem Verkehrsmittel', async () => {
    const response = await post('/api/isochrone', {
      id: 'a',
      name: 'Eltern A',
      address: 'Münster',
      travelMode: 'helicopter',
      maxTravelTimeMinutes: 30,
    });

    expect(response.status).toBe(400);
  });

  it('antwortet mit 400 bei fehlendem Ort', async () => {
    const response = await post('/api/isochrone', {
      id: 'a',
      name: 'Eltern A',
      address: '',
      maxTravelTimeMinutes: 30,
    });

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'INVALID_INPUT',
    );
  });

  it('antwortet mit 400 bei ungültiger Fahrzeit', async () => {
    const response = await post('/api/isochrone', {
      id: 'a',
      name: 'Eltern A',
      address: 'Münster',
      maxTravelTimeMinutes: 0,
    });

    expect(response.status).toBe(400);
  });

  it('antwortet mit 404 wenn die Adresse nicht gefunden wird', async () => {
    stubOrs({ geocode: { features: [] } });

    const response = await post('/api/isochrone', {
      id: 'a',
      name: 'Eltern A',
      address: 'Nirgendwo',
      maxTravelTimeMinutes: 30,
    });

    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'ADDRESS_NOT_FOUND',
    );
  });

  it('antwortet mit 429 bei einem Rate Limit des Providers', async () => {
    stubOrs({ status: 429 });

    const response = await post('/api/isochrone', {
      id: 'a',
      name: 'Eltern A',
      address: 'Münster',
      maxTravelTimeMinutes: 30,
    });

    expect(response.status).toBe(429);
  });
});

describe('POST /api/analyze', () => {
  const target = (id: string, latitude: number) => ({
    id,
    name: `Ziel ${id}`,
    address: 'Münster',
    travelMode: 'driving',
    maxTravelTimeMinutes: 30,
    coordinate: { latitude, longitude: 7.63 },
  });

  it('liefert Layer und Schnittmenge für einen gültigen Request', async () => {
    stubOrs({ isochrones: [polygon(0, 0, 10, 10), polygon(5, 5, 15, 15)] });

    const response = await post('/api/analyze', {
      constraints: [target('a', 51.96), target('b', 51.51)],
    });

    const body = (await response.json()) as {
      layers: Array<{ type: string }>;
      intersection: unknown;
      bounds: number[];
    };

    expect(response.status).toBe(200);
    expect(body.intersection).not.toBeNull();
    expect(body.layers.filter((layer) => layer.type === 'isochrone')).toHaveLength(2);
    expect(body.layers.filter((layer) => layer.type === 'intersection')).toHaveLength(1);
    expect(body.bounds).toHaveLength(4);
  });

  it('liefert 200 mit intersection null wenn es keine gemeinsame Region gibt', async () => {
    stubOrs({ isochrones: [polygon(0, 0, 5, 5), polygon(20, 20, 25, 25)] });

    const response = await post('/api/analyze', {
      constraints: [target('a', 51.96), target('b', 51.51)],
    });

    const body = (await response.json()) as { intersection: unknown; layers: unknown[] };

    expect(response.status).toBe(200);
    expect(body.intersection).toBeNull();
    expect(body.layers).toHaveLength(2);
  });

  it('antwortet mit 400 bei leerer Zielliste', async () => {
    const response = await post('/api/analyze', { constraints: [] });
    expect(response.status).toBe(400);
  });

  it('antwortet mit 502 wenn der Provider nicht erreichbar ist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));

    const response = await post('/api/analyze', { constraints: [target('a', 51.96)] });

    expect(response.status).toBe(502);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      'PROVIDER_UNAVAILABLE',
    );
  });
});
