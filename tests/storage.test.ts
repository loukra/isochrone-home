import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearState,
  loadState,
  loadViewport,
  saveState,
  saveViewport,
} from '../src/frontend/storage.js';
import { POI_CATEGORIES } from '../src/frontend/types.js';
import type { AreaFeature, Target } from '../src/frontend/types.js';

const KEY = 'location-optimizer:state:v1';

/** Minimales localStorage fuer die Node-Umgebung. */
class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const square = (size: number): AreaFeature => ({
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [size, 0],
        [size, size],
        [0, 0],
      ],
    ],
  },
});

const target = (overrides: Partial<Target> = {}): Target => ({
  id: 'a',
  name: 'Eltern A',
  address: 'Münster',
  maxTravelTimeMinutes: 30,
  travelMode: 'driving',
  color: '#2563eb',
  visible: true,
  status: 'ready',
  coordinate: { latitude: 51.95, longitude: 7.62 },
  resolvedLabel: 'Münster, NW, Germany',
  isochrone: square(1),
  bounds: [7, 51, 8, 52],
  error: null,
  ...overrides,
});

const poiState = (overrides: Record<string, unknown> = {}) => ({
  conditions: [
    {
      category: 'gym' as const,
      minutes: 10,
      open: true,
      sortMode: 'relevance' as const,
      searched: true,
    },
  ],
  applied: true,
  ...overrides,
});

/** Der Normalfall: Eingaben speichern, nichts Gerechnetes. */
const state = (overrides: Record<string, unknown> = {}) => ({
  targets: [target()],
  colorCursor: 0,
  analysisWasDone: false,
  pois: null,
  ...overrides,
});

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('saveState / loadState', () => {
  it('liefert null wenn nichts gespeichert ist', () => {
    expect(loadState()).toBeNull();
  });

  it('stellt die Eingaben eines Ziels wieder her', () => {
    saveState(state({ colorCursor: 1 }));

    const restored = loadState();

    expect(restored?.targets).toHaveLength(1);
    expect(restored?.targets[0]?.name).toBe('Eltern A');
    expect(restored?.targets[0]?.address).toBe('Münster');
    expect(restored?.targets[0]?.coordinate).toEqual({
      latitude: 51.95,
      longitude: 7.62,
    });
    expect(restored?.colorCursor).toBe(1);
  });

  it('schreibt keine Geometrie in den Browser', () => {
    // Der Kern der Sache: Eine Fläche im localStorage hat kein Ablaufdatum und
    // wäre nach Monaten still veraltet.
    saveState(state());

    const roh = localStorage.getItem(KEY) as string;

    expect(roh).not.toContain('coordinates');
    expect(roh).not.toContain('Polygon');
    expect(roh.length).toBeLessThan(2000);
  });

  it('markiert jedes Ziel zum Nachladen', () => {
    saveState(state());

    const restored = loadState();

    expect(restored?.targets[0]?.status).toBe('loading');
    expect(restored?.targets[0]?.isochrone).toBeNull();
    expect(restored?.targets[0]?.bounds).toBeNull();
  });

  it('stellt das Verkehrsmittel wieder her', () => {
    saveState(state({ targets: [target({ travelMode: 'ebike' })] }));
    expect(loadState()?.targets[0]?.travelMode).toBe('ebike');
  });

  it('setzt Ziele aus der Zeit vor dem Schalter auf Auto', () => {
    saveState(state());
    const stored = JSON.parse(localStorage.getItem(KEY) as string) as {
      targets: Array<Record<string, unknown>>;
    };
    delete stored.targets[0]?.travelMode;
    localStorage.setItem(KEY, JSON.stringify(stored));

    expect(loadState()?.targets[0]?.travelMode).toBe('driving');
  });

  it('merkt sich ausgeblendete Isochronen', () => {
    saveState(state({ targets: [target({ visible: false })] }));
    expect(loadState()?.targets[0]?.visible).toBe(false);
  });

  it('zeigt Ziele aus der Zeit vor dem Augen-Schalter an', () => {
    saveState(state());
    const stored = JSON.parse(localStorage.getItem(KEY) as string) as {
      targets: Array<Record<string, unknown>>;
    };
    delete stored.targets[0]?.visible;
    localStorage.setItem(KEY, JSON.stringify(stored));

    expect(loadState()?.targets[0]?.visible).toBe(true);
  });

  it('behaelt die Farbzuordnung bei', () => {
    saveState(state({ targets: [target({ color: '#eab308' })], colorCursor: 5 }));

    const restored = loadState();

    expect(restored?.targets[0]?.color).toBe('#eab308');
    expect(restored?.colorCursor).toBe(5);
  });

  it('merkt sich, dass analysiert war -- nicht das Ergebnis', () => {
    saveState(state({ analysisWasDone: true }));

    expect(loadState()?.analysisWasDone).toBe(true);
    expect(localStorage.getItem(KEY)).not.toContain('intersection');
  });

  it('merkt sich Bedingungen als Auftrag, nicht als Ergebnis', () => {
    saveState(state({ pois: poiState() }));

    const restored = loadState();

    expect(restored?.pois?.conditions[0]?.category).toBe('gym');
    expect(restored?.pois?.conditions[0]?.minutes).toBe(10);
    expect(restored?.pois?.conditions[0]?.searched).toBe(true);
    expect(restored?.pois?.applied).toBe(true);
  });

  it('kennt jede Kategorie -- auch die zuletzt hinzugekommenen', () => {
    // Die Liste steht im Frontend und in der Domain. Laufen sie auseinander,
    // faellt der gespeicherte Stand beim Laden *still* durch die Validierung
    // und der Nutzer findet seine Bedingungen nicht wieder.
    for (const category of POI_CATEGORIES) {
      saveState(
        state({
          pois: poiState({
            conditions: [
              {
                category,
                minutes: 10,
                open: true,
                sortMode: 'relevance' as const,
                searched: true,
              },
            ],
          }),
        }),
      );

      expect(loadState()?.pois?.conditions[0]?.category).toBe(category);
    }
  });

  it('unterscheidet eine gesuchte von einer nur angelegten Bedingung', () => {
    saveState(
      state({
        pois: poiState({
          conditions: [
            {
              category: 'station' as const,
              minutes: 10,
              open: true,
              sortMode: 'relevance' as const,
              searched: false,
            },
          ],
          applied: false,
        }),
      }),
    );

    const restored = loadState();
    expect(restored?.pois?.conditions[0]?.searched).toBe(false);
    expect(restored?.pois?.applied).toBe(false);
  });

  it('liefert ohne gespeicherten POI-Stand null', () => {
    saveState(state());
    expect(loadState()?.pois).toBeNull();
  });

  it('merkt sich die geprüften Orte, aber nicht ihr Urteil', () => {
    saveState(
      state({
        checkedPlaces: [
          {
            id: 'place-1',
            label: 'Ganderkesee, NI, Germany',
            coordinate: { latitude: 53.03, longitude: 8.54 },
            open: true,
          },
          {
            id: 'place-2',
            label: 'Hude, NI, Germany',
            coordinate: { latitude: 53.11, longitude: 8.46 },
            open: false,
          },
        ],
      }),
    );

    const restored = loadState();
    expect(restored?.checkedPlaces.map((place) => place.label)).toEqual([
      'Ganderkesee, NI, Germany',
      'Hude, NI, Germany',
    ]);
    // Aufgeklappt oder nicht ist Eingabe und bleibt; das Urteil wird neu geholt.
    expect(restored?.checkedPlaces[1]?.open).toBe(false);
    expect(localStorage.getItem(KEY)).not.toContain('inIntersection');
  });

  it('liefert ohne geprüfte Orte eine leere Liste', () => {
    saveState(state());
    expect(loadState()?.checkedPlaces).toEqual([]);
  });

  it('macht aus einem einzeln gespeicherten Ort die erste Kachel', () => {
    // Stand von vor der Liste: genau ein geprüfter Ort, ohne ID und ohne "open".
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        colorCursor: 0,
        targets: [],
        checkedLocation: {
          label: 'Ganderkesee, NI, Germany',
          coordinate: { latitude: 53.03, longitude: 8.54 },
        },
      }),
    );

    const restored = loadState();
    expect(restored?.checkedPlaces).toHaveLength(1);
    expect(restored?.checkedPlaces[0]?.label).toBe('Ganderkesee, NI, Germany');
    expect(restored?.checkedPlaces[0]?.open).toBe(true);
  });

  describe('Stände aus der Zeit, als die Geometrie noch im Browser lag', () => {
    const alterStand = (extra: Record<string, unknown>) => ({
      version: 1,
      colorCursor: 0,
      targets: [
        {
          id: 'a',
          name: 'Eltern A',
          address: 'Münster',
          maxTravelTimeMinutes: 30,
          travelMode: 'driving',
          visible: true,
          color: '#2563eb',
          coordinate: { latitude: 51.95, longitude: 7.62 },
          resolvedLabel: 'Münster, NW, Germany',
          isochrone: square(1),
          bounds: [7, 51, 8, 52],
        },
      ],
      ...extra,
    });

    it('wirft die alte Geometrie weg, behält aber die Ziele', () => {
      localStorage.setItem(KEY, JSON.stringify(alterStand({ analysis: null })));

      const restored = loadState();

      expect(restored?.targets[0]?.name).toBe('Eltern A');
      expect(restored?.targets[0]?.isochrone).toBeNull();
      expect(restored?.targets[0]?.status).toBe('loading');
    });

    it('liest aus einem alten Analyse-Ergebnis den Auftrag heraus', () => {
      localStorage.setItem(
        KEY,
        JSON.stringify(
          alterStand({
            analysis: { result: { intersection: square(2) }, stale: false },
          }),
        ),
      );

      expect(loadState()?.analysisWasDone).toBe(true);
    });

    it('leitet "gesucht" und "übernommen" aus dem alten Stand ab', () => {
      localStorage.setItem(
        KEY,
        JSON.stringify(
          alterStand({
            analysis: null,
            pois: {
              conditions: [
                {
                  category: 'gym',
                  minutes: 10,
                  open: true,
                  sortMode: 'relevance',
                  pois: [{ id: 'node/1' }],
                },
              ],
              region: square(3),
              blocking: [],
            },
          }),
        ),
      );

      const restored = loadState();

      expect(restored?.pois?.conditions[0]?.searched).toBe(true);
      expect(restored?.pois?.applied).toBe(true);
    });
  });

  it('verwirft beschaedigte Daten statt zu scheitern', () => {
    localStorage.setItem(KEY, '{kaputt');
    expect(loadState()).toBeNull();
  });

  it('verwirft einen fremden Datenstand', () => {
    localStorage.setItem(KEY, JSON.stringify({ version: 99, targets: [] }));
    expect(loadState()).toBeNull();
  });

  it('verwirft strukturell ungültige Ziele', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        colorCursor: 0,
        targets: [{ id: 'a', name: 'X' }],
      }),
    );

    expect(loadState()).toBeNull();
  });

  it('clearState entfernt den Stand', () => {
    saveState(state());
    clearState();
    expect(loadState()).toBeNull();
  });

  it('wirft nicht, wenn localStorage blockiert ist', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blockiert');
      },
      setItem: () => {
        throw new Error('blockiert');
      },
      removeItem: () => {
        throw new Error('blockiert');
      },
    });

    expect(() => saveState(state())).not.toThrow();
    expect(loadState()).toBeNull();
  });
});

describe('saveViewport / loadViewport', () => {
  const viewport = {
    center: [8.2, 53.14] as [number, number],
    zoom: 11.5,
    bearing: 0,
    pitch: 0,
  };

  it('liefert null wenn noch nie eine Karte bewegt wurde', () => {
    expect(loadViewport()).toBeNull();
  });

  it('stellt den zuletzt betrachteten Ausschnitt wieder her', () => {
    saveViewport(viewport);

    expect(loadViewport()).toEqual(viewport);
  });

  it('liegt getrennt vom übrigen Stand -- clearState räumt ihn nicht mit weg', () => {
    saveState(state());
    saveViewport(viewport);

    clearState();

    expect(loadState()).toBeNull();
    expect(loadViewport()).toEqual(viewport);
  });

  it('verwirft einen kaputten Stand, statt ohne Karte zu starten', () => {
    localStorage.setItem('location-optimizer:viewport:v1', '{"zoom":"weit"}');

    expect(loadViewport()).toBeNull();
  });

  it('verwirft NaN -- MapLibre käme damit nie wieder auf gültige Koordinaten', () => {
    localStorage.setItem(
      'location-optimizer:viewport:v1',
      '{"center":[null,null],"zoom":null,"bearing":0,"pitch":0}',
    );

    expect(loadViewport()).toBeNull();
  });
});
