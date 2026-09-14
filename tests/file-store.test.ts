import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FileStore } from '../src/infrastructure/cache/file-store.js';
import { cacheNamespaces } from '../src/infrastructure/cache/namespaces.js';

const NAMESPACES = cacheNamespaces({
  isochroneDays: 7,
  poiHours: 24,
  geocodeDays: 30,
  routeDays: 7,
});

let directory: string;
let store: FileStore;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'file-store-test-'));
  store = new FileStore(directory);
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(directory, { recursive: true, force: true });
});

describe('FileStore', () => {
  it('gibt zurück, was abgelegt wurde', async () => {
    await store.set(NAMESPACES.isochrones, 'a', { wert: 42 });
    expect(await store.get(NAMESPACES.isochrones, 'a')).toEqual({ wert: 42 });
  });

  it('liefert null für einen unbekannten Schlüssel', async () => {
    expect(await store.get(NAMESPACES.isochrones, 'nie-abgelegt')).toBeNull();
  });

  it('trennt die Fächer voneinander', async () => {
    await store.set(NAMESPACES.pois, 'gleich', 'orte');
    expect(await store.get(NAMESPACES.isochrones, 'gleich')).toBeNull();
  });

  it('vergisst einen Eintrag nach Ablauf der Haltedauer', async () => {
    vi.useFakeTimers();
    await store.set(NAMESPACES.pois, 'studios', ['McFit']);

    // Einen Tag plus eine Minute: die Ortssuche hält 24 Stunden.
    vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000 + 60_000);

    expect(await store.get(NAMESPACES.pois, 'studios')).toBeNull();
  });

  it('behält einen Eintrag innerhalb der Haltedauer', async () => {
    vi.useFakeTimers();
    await store.set(NAMESPACES.isochrones, 'ziel', { flaeche: true });

    // Sechs Tage -- Isochronen halten sieben.
    vi.setSystemTime(Date.now() + 6 * 24 * 60 * 60 * 1000);

    expect(await store.get(NAMESPACES.isochrones, 'ziel')).toEqual({ flaeche: true });
  });

  it('löscht abgelaufene Dateien, statt sie nur zu übergehen', async () => {
    vi.useFakeTimers();
    await store.set(NAMESPACES.pois, 'alt', ['x']);
    vi.setSystemTime(Date.now() + 48 * 60 * 60 * 1000);

    await store.get(NAMESPACES.pois, 'alt');

    expect(await readdir(join(directory, 'pois'))).toHaveLength(0);
  });

  it('verwirft eine beschädigte Datei, statt zu scheitern', async () => {
    await store.set(NAMESPACES.geocoding, 'muenster', { latitude: 51, longitude: 7 });
    const [file] = await readdir(join(directory, 'geocoding'));
    await writeFile(join(directory, 'geocoding', file as string), '{kaputt', 'utf8');

    expect(await store.get(NAMESPACES.geocoding, 'muenster')).toBeNull();
    expect(await readdir(join(directory, 'geocoding'))).toHaveLength(0);
  });

  it('wirft nicht, wenn das Verzeichnis nicht beschreibbar ist', async () => {
    // Eine Datei dort, wo ein Verzeichnis liegen müsste: mkdir schlägt fehl.
    // Der Name kommt aus dem Namensraum, nicht als Zeichenkette: Er trägt die
    // Glättung mit (siehe namespaces.ts) und ändert sich mit ihr.
    await mkdir(directory, { recursive: true });
    await writeFile(
      join(directory, NAMESPACES.isochrones.name),
      'kein Verzeichnis',
      'utf8',
    );

    await expect(store.set(NAMESPACES.isochrones, 'x', 1)).resolves.toBeUndefined();
    expect(await store.get(NAMESPACES.isochrones, 'x')).toBeNull();
  });
});
