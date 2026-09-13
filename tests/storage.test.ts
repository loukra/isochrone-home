import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearState, loadState, saveState } from '../src/frontend/storage.js';
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
  color: '#2563eb',
  status: 'ready',
  coordinate: { latitude: 51.95, longitude: 7.62 },
  resolvedLabel: 'Münster, NW, Germany',
  isochrone: square(1),
  bounds: [7, 51, 8, 52],
  error: null,
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

  it('stellt Ziele samt Geometrie wieder her', () => {
    saveState({ targets: [target()], colorCursor: 1, analysis: null });

    const restored = loadState();

    expect(restored?.targets).toHaveLength(1);
    expect(restored?.targets[0]?.name).toBe('Eltern A');
    expect(restored?.targets[0]?.address).toBe('Münster');
    expect(restored?.targets[0]?.isochrone).toEqual(square(1));
    expect(restored?.colorCursor).toBe(1);
  });

  it('setzt wiederhergestellte Ziele mit Geometrie auf "ready"', () => {
    saveState({ targets: [target()], colorCursor: 0, analysis: null });
    expect(loadState()?.targets[0]?.status).toBe('ready');
  });

  it('markiert Ziele ohne Geometrie zum Nachladen', () => {
    saveState({
      targets: [target({ isochrone: null, bounds: null })],
      colorCursor: 0,
      analysis: null,
    });

    const restored = loadState();
    expect(restored?.targets[0]?.status).toBe('loading');
    expect(restored?.targets[0]?.isochrone).toBeNull();
  });

  it('behaelt die Farbzuordnung bei', () => {
    saveState({
      targets: [target({ color: '#eab308' })],
      colorCursor: 5,
      analysis: null,
    });

    expect(loadState()?.targets[0]?.color).toBe('#eab308');
    expect(loadState()?.colorCursor).toBe(5);
  });

  it('stellt ein vorhandenes Analyse-Ergebnis wieder her', () => {
    saveState({
      targets: [target()],
      colorCursor: 1,
      analysis: {
        result: { layers: [], intersection: square(2), targets: [], bounds: null },
        stale: false,
      },
    });

    const restored = loadState();
    expect(restored?.analysis?.stale).toBe(false);
    expect(restored?.analysis?.result.intersection).toEqual(square(2));
  });

  it('verwirft beschaedigte Daten statt zu scheitern', () => {
    localStorage.setItem(KEY, '{kaputt');
    expect(loadState()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
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
        analysis: null,
        targets: [{ id: 'a', name: 'X' }],
      }),
    );
    expect(loadState()).toBeNull();
  });

  it('clearState entfernt den Stand', () => {
    saveState({ targets: [target()], colorCursor: 0, analysis: null });
    clearState();
    expect(loadState()).toBeNull();
  });

  it('speichert ohne Geometrie weiter, wenn das Budget überschritten wird', () => {
    // Eine künstlich große Geometrie erzwingt den Fallback.
    const huge: AreaFeature = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          Array.from({ length: 300_000 }, (_, i) => [
            (i % 180) + 0.123456,
            (i % 90) + 0.654321,
          ]),
        ],
      },
    };

    saveState({
      targets: [target({ isochrone: huge })],
      colorCursor: 2,
      analysis: null,
    });

    const restored = loadState();
    // Ziel bleibt erhalten, Geometrie wird beim Laden neu geholt.
    expect(restored?.targets).toHaveLength(1);
    expect(restored?.targets[0]?.address).toBe('Münster');
    expect(restored?.targets[0]?.isochrone).toBeNull();
    expect(restored?.targets[0]?.status).toBe('loading');
  });

  it('wirft nicht, wenn localStorage blockiert ist', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('blocked');
      },
      removeItem() {
        throw new Error('blocked');
      },
    });

    expect(() =>
      saveState({ targets: [target()], colorCursor: 0, analysis: null }),
    ).not.toThrow();
    expect(loadState()).toBeNull();
  });
});
