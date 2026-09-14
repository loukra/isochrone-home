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
            properties: {
              layer: 'address',
              name: 'Domplatz 1',
              postalcode: '48143',
              locality: 'Münster',
              country: 'Deutschland',
              country_a: 'DEU',
              // Das Label des Providers wird bewusst nicht übernommen.
              label: 'Domplatz 1, Münster, NW, Germany',
            },
          },
        ],
      }),
    });

    // Pelias meldet den Ländercode dreistellig ("DEU"); das Frontend schickt
    // die Region zweistellig ("DE"), so wie Browser und Photon sie kennen.
    // Hier steht deshalb die Schreibweise, die dieser Anbieter selbst braucht.
    const candidates = await new OpenRouteServiceGeocoder('key').search('Münster', 5, 'DEU');

    const [url, init] = spy.mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toContain('https://api.heigit.org/pelias/v1/search');
    // Der Key darf nicht in der URL stehen.
    expect(url).not.toContain('api_key');
    expect((init?.headers as Record<string, string>).Authorization).toBe('key');
    expect(url).toContain('lang=de');

    expect(candidates).toEqual([
      {
        label: 'Domplatz 1, 48143 Münster',
        coordinate: { latitude: 51.96, longitude: 7.63 },
        precision: 'address',
      },
    ]);
  });

  /**
   * Bewusst festgehalten, damit es niemand für einen Zufall hält: Mit der
   * zweistelligen Region aus dem Browser erkennt dieser Adapter das eigene Land
   * **nicht** wieder, und "Deutschland" steht auch daheim in der Zeile.
   *
   * Der Preis dafür wäre eine Umrechnungstabelle aller Länder. Er lohnt hier
   * nicht: Pelias ist seit dem 14.09.2026 nur noch der Rückfall, und der Fehler
   * ist eine zu lange Zeile, keine falsche. Sichtbar ausführlich schlägt still
   * falsch -- dieselbe Regel wie beim Verzicht auf das Vorfiltern von POIs.
   */
  it('nennt das Land, wenn die Schreibweise des Codes nicht zusammenpasst', async () => {
    mockFetch({
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [7.63, 51.96] },
            properties: {
              layer: 'address',
              name: 'Domplatz 1',
              housenumber: '1',
              street: 'Domplatz',
              postalcode: '48143',
              locality: 'Münster',
              country: 'Deutschland',
              country_a: 'DEU',
              label: 'Domplatz 1, Münster, NW, Germany',
            },
          },
        ],
      }),
    });

    const [candidate] = await new OpenRouteServiceGeocoder('key').search('Münster', 5, 'DE');

    expect(candidate?.label).toBe('Domplatz 1, 48143 Münster, Deutschland');
  });

  it('nennt das Land nur, wenn es ein anderes ist', async () => {
    mockFetch({
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [6.57, 53.22] },
            properties: {
              layer: 'address',
              name: 'Kerkstraat 1',
              postalcode: '9745CC',
              locality: 'Groningen',
              country: 'Niederlande',
              country_a: 'NLD',
            },
          },
        ],
      }),
    });

    const [candidate] = await new OpenRouteServiceGeocoder('key').search('Kerkstraat 1');

    expect(candidate?.label).toBe('Kerkstraat 1, 9745CC Groningen, Niederlande');
  });

  it('wiederholt die Straße nicht, wenn der Ort selbst gemeint ist', async () => {
    mockFetch({
      json: async () => ({
        features: [
          {
            geometry: { coordinates: [7.92, 53.25] },
            properties: {
              layer: 'locality',
              name: 'Westerstede',
              locality: 'Westerstede',
              localadmin: 'Westerstede',
              county: 'Landkreis Ammerland',
              country_a: 'DEU',
            },
          },
        ],
      }),
    });

    const [candidate] = await new OpenRouteServiceGeocoder('key').search('Westerstede');

    expect(candidate?.label).toBe('Westerstede, Landkreis Ammerland');
    expect(candidate?.precision).toBe('place');
  });

  /**
   * Der Fall, der den Anlass gab: Pelias liefert auf "Burnhörn 32 Ocholt
   * Westerstede" nur den Zentroid des Ortsteils -- rund 900 m neben dem Haus,
   * und die Oberfläche übernimmt einen einzigen Treffer ohne Rückfrage.
   */
  it('fragt strukturiert nach, wenn zur Hausnummer nur ein Ortsteil kommt', async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          geocoding: {
            query: {
              parsed_text: {
                street: 'burnhörn',
                housenumber: '32',
                neighbourhood: 'ocholt',
                city: 'westerstede',
              },
            },
          },
          features: [
            {
              geometry: { coordinates: [7.88386, 53.20476] },
              properties: {
                layer: 'neighbourhood',
                name: 'Ocholt',
                locality: 'Westerstede',
                country_a: 'DEU',
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          features: [
            {
              geometry: { coordinates: [7.896892, 53.201599] },
              properties: {
                layer: 'address',
                name: 'Burnhörn 32',
                postalcode: '26655',
                locality: 'Westerstede',
                country_a: 'DEU',
              },
            },
          ],
        }),
      });
    vi.stubGlobal('fetch', spy);

    const candidates = await new OpenRouteServiceGeocoder('key').search(
      'Burnhörn 32 Ocholt Westerstede',
    );

    const [second] = spy.mock.calls[1] as [string];
    expect(second).toContain('/search/structured');
    // Pelias gibt die zerlegte Eingabe klein zurück; die Suche ist unempfindlich dafür.
    expect(second).toContain('address=burnh%C3%B6rn+32');
    expect(second).toContain('locality=westerstede');
    // Der Ortsteil bleibt weg -- genau er bringt die Freitextsuche vom Haus ab.
    expect(second).not.toContain('ocholt');

    // Das Haus steht oben, der Ortsteil bleibt als Möglichkeit darunter stehen.
    expect(candidates.map((candidate) => candidate.label)).toEqual([
      'Burnhörn 32, 26655 Westerstede',
      'Ocholt, Westerstede',
    ]);
    expect(candidates[0]?.coordinate).toEqual({
      latitude: 53.201599,
      longitude: 7.896892,
    });
  });

  it('fragt nicht nach, wenn die Hausnummer schon getroffen ist', async () => {
    const spy = mockFetch({
      json: async () => ({
        geocoding: { query: { parsed_text: { street: 'domplatz', housenumber: '1' } } },
        features: [
          {
            geometry: { coordinates: [7.63, 51.96] },
            properties: { layer: 'address', name: 'Domplatz 1', country_a: 'DEU' },
          },
        ],
      }),
    });

    await new OpenRouteServiceGeocoder('key').search('Domplatz 1 Münster');

    expect(spy).toHaveBeenCalledTimes(1);
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

const POLYGON_RESPONSE = {
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
};

describe('OpenRouteServiceIsochroneProvider', () => {
  it.each([
    ['driving', 'driving-car'],
    ['cycling', 'cycling-regular'],
    ['ebike', 'cycling-electric'],
    ['walking', 'foot-walking'],
  ] as const)('bildet %s auf das Profil %s ab', async (travelMode, profile) => {
    const spy = mockFetch(POLYGON_RESPONSE);

    await new OpenRouteServiceIsochroneProvider('key').calculate(
      { latitude: 51.96, longitude: 7.63 },
      { travelMode, maxTravelTimeMinutes: 30, direction: 'toTarget' },
    );

    const [url] = spy.mock.calls[0] as [string];
    expect(url).toBe(`https://api.heigit.org/openrouteservice/v2/isochrones/${profile}`);
  });

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
      { travelMode: 'driving', maxTravelTimeMinutes: 30, direction: 'toTarget' },
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

  it('schickt smoothing 0 mit', async () => {
    // Nicht weglassen: ORS waehlt dann seine eigene Vorgabe, und die liegt
    // gemessen zwischen 0 und 50 -- die Flaeche loest sich dabei vom
    // Strassennetz und behauptet Erreichbarkeit, die es nicht gibt.
    const spy = mockFetch(POLYGON_RESPONSE);

    await new OpenRouteServiceIsochroneProvider('key').calculate(
      { latitude: 51.96, longitude: 7.63 },
      { travelMode: 'driving', maxTravelTimeMinutes: 30, direction: 'toTarget' },
    );

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ smoothing: 0 });
  });

  it.each([
    ['toTarget', 'destination'],
    ['fromTarget', 'start'],
  ] as const)('schickt fuer %s den location_type %s', async (direction, expected) => {
    // ORS benennt aus Sicht des uebergebenen Punktes: "destination" heisst
    // "der Punkt ist das Ziel", die Flaeche ist also der Hinweg -- genau
    // umgekehrt zur fachlichen Lesart. Eine vertauschte Tabelle waere an der
    // Flaeche nicht zu erkennen, deshalb steht sie hier fest.
    const spy = mockFetch(POLYGON_RESPONSE);

    await new OpenRouteServiceIsochroneProvider('key').calculate(
      { latitude: 51.96, longitude: 7.63 },
      { travelMode: 'driving', maxTravelTimeMinutes: 30, direction },
    );

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ location_type: expected });
  });

  it('meldet eine Fahrzeit über dem Providerlimit als Eingabefehler', async () => {
    const spy = mockFetch({ json: async () => ({ features: [] }) });
    const provider = new OpenRouteServiceIsochroneProvider('key');

    expect(provider.maxTravelTimeMinutes).toBe(60);

    await expect(
      provider.calculate(
        { latitude: 51.96, longitude: 7.63 },
        { travelMode: 'driving', maxTravelTimeMinutes: 75, direction: 'toTarget' },
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
      { travelMode: 'driving', maxTravelTimeMinutes: 60, direction: 'toTarget' },
    );

    const [, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).range).toEqual([3600]);
  });

  it('wirft einen Domain-Fehler wenn keine Fläche geliefert wird', async () => {
    mockFetch({ json: async () => ({ features: [] }) });

    await expect(
      new OpenRouteServiceIsochroneProvider('key').calculate(
        { latitude: 51.96, longitude: 7.63 },
        { travelMode: 'driving', maxTravelTimeMinutes: 30, direction: 'toTarget' },
      ),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
