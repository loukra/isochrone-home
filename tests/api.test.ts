import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
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
  mapStyleUrl: 'https://example.test/style.json',
  mapToken: null,
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
  status?: number;
}) => {
  let isochroneIndex = 0;

  const spy = vi.fn(async (url: string) => {
    if (options.status !== undefined && options.status >= 400) {
      return { ok: false, status: options.status, json: async () => ({}) };
    }

    if (url.includes('/geocode/search')) {
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

const post = (path: string, body: unknown) =>
  realFetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  const app = createApp(CONFIG);
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
});

describe('GET /api/config', () => {
  it('liefert die Map-Konfiguration ohne Secrets', async () => {
    const response = await realFetch(`${baseUrl}/api/config`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({
      mapStyleUrl: CONFIG.mapStyleUrl,
      analysisStrategy: 'isochrone-intersection',
    });
    expect(JSON.stringify(body)).not.toContain('test-key');
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
