import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../src/infrastructure/cache/file-store.js';
import { cacheNamespaces } from '../src/infrastructure/cache/namespaces.js';
import {
  FileCachedIsochroneProvider,
  FileCachedPoiProvider,
  FileCachedTravelTimeProvider,
} from '../src/infrastructure/cache/file-cached-providers.js';
import { square, StubIsochroneProvider } from './helpers/fixtures.js';
import type { PoiProvider } from '../src/domain/ports/poi-provider.js';
import type { TravelTimeProvider } from '../src/domain/ports/travel-time-provider.js';
import type { BoundingBox, Coordinate } from '../src/domain/models/geo.js';
import type { Poi, PoiCategory } from '../src/domain/models/poi.js';

const NAMESPACES = cacheNamespaces({
  isochroneDays: 7,
  poiHours: 24,
  geocodeDays: 30,
  routeDays: 7,
});
const ORIGIN = { latitude: 51.96, longitude: 7.63 };
const OPTIONS = { travelMode: 'driving' as const, maxTravelTimeMinutes: 30 };
const AREA: BoundingBox = [7.998, 52.876, 8.654, 53.397];

class StubPoiProvider implements PoiProvider {
  calls = 0;

  async search(category: PoiCategory): Promise<Poi[]> {
    this.calls += 1;
    return [
      {
        id: 'node/1',
        category,
        name: 'Clever fit',
        coordinate: ORIGIN,
        brand: 'Clever fit',
        website: null,
        sport: 'fitness',
        areaSquareMeters: 800,
      },
    ];
  }
}

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'file-cached-test-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

class StubTravelTimeProvider implements TravelTimeProvider {
  calls = 0;

  async measure(_origin: Coordinate, destinations: Coordinate[]) {
    this.calls += 1;
    return destinations.map(() => ({ durationMinutes: 12, distanceKm: 8 }));
  }
}

describe('Plattencache vor den Providern', () => {
  it('fragt den Isochronen-Provider für dieselben Parameter nur einmal', async () => {
    const delegate = new StubIsochroneProvider([square(0, 0, 10, 10)]);
    const provider = new FileCachedIsochroneProvider(
      delegate,
      new FileStore(directory),
      NAMESPACES.isochrones,
    );

    await provider.calculate(ORIGIN, OPTIONS);
    await provider.calculate(ORIGIN, OPTIONS);

    expect(delegate.calls).toHaveLength(1);
  });

  it('überlebt den Neustart des Prozesses', async () => {
    // Der Kern der Sache: Ein neuer Store auf demselben Verzeichnis ist
    // dasselbe wie ein neu gestartetes Backend -- der Treffer muss bleiben.
    const erster = new StubIsochroneProvider([square(0, 0, 10, 10)]);
    await new FileCachedIsochroneProvider(
      erster,
      new FileStore(directory),
      NAMESPACES.isochrones,
    ).calculate(ORIGIN, OPTIONS);

    const zweiter = new StubIsochroneProvider([square(0, 0, 20, 20)]);
    const nachNeustart = await new FileCachedIsochroneProvider(
      zweiter,
      new FileStore(directory),
      NAMESPACES.isochrones,
    ).calculate(ORIGIN, OPTIONS);

    expect(zweiter.calls).toHaveLength(0);
    expect(nachNeustart).toEqual(square(0, 0, 10, 10));
  });

  it('unterscheidet nach Verkehrsmittel', async () => {
    const delegate = new StubIsochroneProvider([
      square(0, 0, 10, 10),
      square(0, 0, 3, 3),
    ]);
    const provider = new FileCachedIsochroneProvider(
      delegate,
      new FileStore(directory),
      NAMESPACES.isochrones,
    );

    await provider.calculate(ORIGIN, OPTIONS);
    await provider.calculate(ORIGIN, { ...OPTIONS, travelMode: 'ebike' });

    expect(delegate.calls).toHaveLength(2);
  });

  it('legt auch die Ortssuche ab', async () => {
    const delegate = new StubPoiProvider();
    const store = new FileStore(directory);

    await new FileCachedPoiProvider(delegate, store, NAMESPACES.pois).search('gym', AREA);
    const zweiterLauf = await new FileCachedPoiProvider(
      delegate,
      store,
      NAMESPACES.pois,
    ).search('gym', AREA);

    expect(delegate.calls).toBe(1);
    expect(zweiterLauf[0]?.name).toBe('Clever fit');
  });
  it('misst dieselbe Strecke nur einmal, unterscheidet aber die Reihenfolge', async () => {
    const delegate = new StubTravelTimeProvider();
    const store = new FileStore(directory);
    const provider = new FileCachedTravelTimeProvider(delegate, store, NAMESPACES.routes);
    const a = { latitude: 53.1, longitude: 8.2 };
    const b = { latitude: 53.2, longitude: 8.3 };

    await provider.measure(ORIGIN, [a, b], 'driving');
    await provider.measure(ORIGIN, [a, b], 'driving');

    expect(delegate.calls).toBe(1);

    // Die Antwort kommt in der Reihenfolge der Ziele -- eine andere Reihenfolge
    // ist deshalb eine andere Antwort und darf nicht denselben Eintrag treffen.
    await provider.measure(ORIGIN, [b, a], 'driving');
    expect(delegate.calls).toBe(2);

    // Dasselbe gilt für das Verkehrsmittel.
    await provider.measure(ORIGIN, [a, b], 'cycling');
    expect(delegate.calls).toBe(3);
  });
});
