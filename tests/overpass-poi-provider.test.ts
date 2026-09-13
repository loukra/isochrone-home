import { afterEach, describe, expect, it, vi } from 'vitest';
import { OverpassPoiProvider } from '../src/infrastructure/poi/overpass-poi-provider.js';
import type { BoundingBox } from '../src/domain/models/geo.js';

const AREA: BoundingBox = [7.998, 52.876, 8.654, 53.397];

const jsonResponse = (payload: unknown) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(payload),
});

/** Overpass antwortet unter Last mit HTML statt JSON. */
const busyResponse = () => ({
  ok: true,
  status: 200,
  text: async () =>
    '<?xml version="1.0"?><html><body>Error: server too busy</body></html>',
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OverpassPoiProvider', () => {
  it('mappt Knoten auf Domain-POIs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          elements: [
            {
              type: 'node',
              id: 42,
              lat: 53.14,
              lon: 8.21,
              tags: {
                name: 'McFit',
                brand: 'McFit',
                website: 'https://mcfit.com',
                sport: 'fitness',
              },
            },
          ],
        }),
      ),
    );

    const pois = await new OverpassPoiProvider().search('gym', AREA);

    expect(pois).toEqual([
      {
        id: 'node/42',
        category: 'gym',
        name: 'McFit',
        coordinate: { latitude: 53.14, longitude: 8.21 },
        brand: 'McFit',
        website: 'https://mcfit.com',
        sport: 'fitness',
        areaSquareMeters: null,
      },
    ]);
  });

  it('berechnet die Grundfläche von Flächenobjekten', async () => {
    // Rechteck von etwa 100 m x 100 m.
    const d = 100 / 111320;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          elements: [
            {
              type: 'way',
              id: 7,
              center: { lat: 53.0, lon: 8.0 },
              tags: { name: 'Grosses Studio' },
              geometry: [
                { lat: 53.0, lon: 8.0 },
                { lat: 53.0, lon: 8.0 + d / Math.cos((53 * Math.PI) / 180) },
                { lat: 53.0 + d, lon: 8.0 + d / Math.cos((53 * Math.PI) / 180) },
                { lat: 53.0 + d, lon: 8.0 },
                { lat: 53.0, lon: 8.0 },
              ],
            },
          ],
        }),
      ),
    );

    const [poi] = await new OverpassPoiProvider().search('gym', AREA);

    expect(poi?.areaSquareMeters).toBeGreaterThan(9000);
    expect(poi?.areaSquareMeters).toBeLessThan(11000);
  });

  it('nutzt operator als Marke, wenn brand fehlt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          elements: [
            {
              type: 'node',
              id: 1,
              lat: 53,
              lon: 8,
              tags: { name: 'X', operator: 'Kette' },
            },
          ],
        }),
      ),
    );

    const [poi] = await new OverpassPoiProvider().search('gym', AREA);
    expect(poi?.brand).toBe('Kette');
  });

  it('überspringt Elemente ohne Koordinate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          elements: [{ type: 'relation', id: 9, tags: { name: 'Ohne Ort' } }],
        }),
      ),
    );

    expect(await new OverpassPoiProvider().search('gym', AREA)).toEqual([]);
  });

  it('versucht es nach einer Überlastungsantwort erneut', async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce(busyResponse())
      .mockResolvedValueOnce(busyResponse())
      .mockResolvedValue(
        jsonResponse({ elements: [{ type: 'node', id: 3, lat: 53, lon: 8, tags: {} }] }),
      );
    vi.stubGlobal('fetch', spy);

    const pois = await new OverpassPoiProvider(undefined, 4, 1).search('gym', AREA);

    expect(spy).toHaveBeenCalledTimes(3);
    expect(pois).toHaveLength(1);
    expect(pois[0]?.name).toBe('Ohne Namen');
  });

  it('meldet dauerhafte Überlastung als Domain-Fehler', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(busyResponse()));

    await expect(
      new OverpassPoiProvider(undefined, 2, 1).search('gym', AREA),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });

  it('fragt identische Bereiche nur einmal ab', async () => {
    const spy = vi.fn().mockResolvedValue(jsonResponse({ elements: [] }));
    vi.stubGlobal('fetch', spy);

    const provider = new OverpassPoiProvider();
    await provider.search('gym', AREA);
    await provider.search('gym', AREA);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('trennt den Cache nach Kategorie', async () => {
    const spy = vi.fn().mockResolvedValue(jsonResponse({ elements: [] }));
    vi.stubGlobal('fetch', spy);

    const provider = new OverpassPoiProvider();
    await provider.search('gym', AREA);
    await provider.search('supermarket', AREA);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('schickt die Bounding-Box in Overpass-Reihenfolge (Süd,West,Nord,Ost)', async () => {
    const spy = vi.fn().mockResolvedValue(jsonResponse({ elements: [] }));
    vi.stubGlobal('fetch', spy);

    await new OverpassPoiProvider().search('gym', AREA);

    const body = decodeURIComponent(
      (spy.mock.calls[0]?.[1] as RequestInit).body as string,
    );
    expect(body).toContain('52.876,7.998,53.397,8.654');
    expect(body).toContain('leisure=fitness_centre');
  });
});

describe('OverpassPoiProvider — Fehlerunterscheidung', () => {
  const syntaxError = () => ({
    ok: true,
    status: 200,
    text: async () =>
      '<html><body><p>Error: line 1: parse error: Unknown type "out center geom"</p></body></html>',
  });

  it('wiederholt einen Abfragefehler nicht', async () => {
    const spy = vi.fn().mockResolvedValue(syntaxError());
    vi.stubGlobal('fetch', spy);

    await expect(
      new OverpassPoiProvider(undefined, 4, 1).search('gym', AREA),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });

    // Genau ein Versuch -- ein Syntaxfehler wird durch Wiederholen nicht besser.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('nennt die tatsächliche Overpass-Meldung in den Details', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(syntaxError()));

    await expect(
      new OverpassPoiProvider(undefined, 2, 1).search('gym', AREA),
    ).rejects.toMatchObject({ details: expect.stringContaining('parse error') });
  });

  it('fragt mit "out geom" ab, nicht mit "out center"', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ elements: [] }),
    });
    vi.stubGlobal('fetch', spy);

    await new OverpassPoiProvider().search('gym', AREA);

    const body = decodeURIComponent(
      (spy.mock.calls[0]?.[1] as RequestInit).body as string,
    );
    expect(body).toContain('out geom;');
    expect(body).not.toContain('center');
  });

  it('bildet den Mittelpunkt einer Fläche aus ihrem Ring', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            elements: [
              {
                type: 'way',
                id: 5,
                tags: { name: 'Halle' },
                geometry: [
                  { lat: 53.0, lon: 8.0 },
                  { lat: 53.0, lon: 8.2 },
                  { lat: 53.2, lon: 8.2 },
                  { lat: 53.2, lon: 8.0 },
                ],
              },
            ],
          }),
      }),
    );

    const [poi] = await new OverpassPoiProvider().search('gym', AREA);

    expect(poi?.coordinate.latitude).toBeCloseTo(53.1, 5);
    expect(poi?.coordinate.longitude).toBeCloseTo(8.1, 5);
  });
});
