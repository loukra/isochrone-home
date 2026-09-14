import {
  coordinateKey,
  type AreaFeature,
  type BoundingBox,
  type Coordinate,
} from '../../domain/models/geo.js';
import type { TravelMode } from '../../domain/models/analysis.js';
import type { Poi, PoiCategory } from '../../domain/models/poi.js';
import type {
  GeocodingCandidate,
  GeocodingProvider,
} from '../../domain/ports/geocoding-provider.js';
import type {
  IsochroneOptions,
  IsochroneProvider,
} from '../../domain/ports/isochrone-provider.js';
import type { PoiProvider } from '../../domain/ports/poi-provider.js';
import type {
  TravelLeg,
  TravelTimeProvider,
} from '../../domain/ports/travel-time-provider.js';
import type { CacheNamespace, FileStore } from './file-store.js';

/**
 * Alle Dekoratoren folgen demselben Muster: Treffer aus dem Cache
 * zurückgeben, sonst den echten Provider fragen und das Ergebnis ablegen.
 * Sie liegen hier gebündelt, weil einzeln je zwanzig Zeilen davon in eigenen
 * Dateien mehr Ablage als Erkenntnis wären.
 */

export class FileCachedIsochroneProvider implements IsochroneProvider {
  get maxTravelTimeMinutes(): number {
    return this.delegate.maxTravelTimeMinutes;
  }

  constructor(
    private readonly delegate: IsochroneProvider,
    private readonly store: FileStore,
    private readonly namespace: CacheNamespace,
  ) {}

  async calculate(origin: Coordinate, options: IsochroneOptions): Promise<AreaFeature> {
    const key = `${coordinateKey(origin)}|${options.travelMode}|${options.maxTravelTimeMinutes}|${options.direction}`;
    const cached = await this.store.get<AreaFeature>(this.namespace, key);

    if (cached !== null) return cached;

    const area = await this.delegate.calculate(origin, options);
    await this.store.set(this.namespace, key, area);
    return area;
  }
}

export class FileCachedPoiProvider implements PoiProvider {
  constructor(
    private readonly delegate: PoiProvider,
    private readonly store: FileStore,
    private readonly namespace: CacheNamespace,
  ) {}

  async search(category: PoiCategory, area: BoundingBox): Promise<Poi[]> {
    // Drei Nachkommastellen entsprechen gut hundert Metern -- fein genug, dass
    // sich verschiedene Regionen nicht vermischen, grob genug, dass ein
    // minimal verschobener Suchbereich noch trifft.
    const key = `${category}|${area.map((value) => value.toFixed(3)).join(',')}`;
    const cached = await this.store.get<Poi[]>(this.namespace, key);

    if (cached !== null) return cached;

    const pois = await this.delegate.search(category, area);
    await this.store.set(this.namespace, key, pois);
    return pois;
  }
}

export class FileCachedGeocodingProvider implements GeocodingProvider {
  constructor(
    private readonly delegate: GeocodingProvider,
    private readonly store: FileStore,
    private readonly namespace: CacheNamespace,
  ) {}

  async geocode(address: string): Promise<Coordinate> {
    const key = `geocode|${address.trim().toLowerCase()}`;
    const cached = await this.store.get<Coordinate>(this.namespace, key);

    if (cached !== null) return cached;

    // Ein Fehlschlag wird nicht abgelegt: "nicht gefunden" ist oft ein Tippfehler
    // oder eine Störung, und die soll sich nicht für dreißig Tage einbrennen.
    const coordinate = await this.delegate.geocode(address);
    await this.store.set(this.namespace, key, coordinate);
    return coordinate;
  }

  async search(address: string, limit?: number): Promise<GeocodingCandidate[]> {
    const key = `search|${address.trim().toLowerCase()}|${limit ?? 'default'}`;
    const cached = await this.store.get<GeocodingCandidate[]>(this.namespace, key);

    if (cached !== null) return cached;

    const candidates = await this.delegate.search(address, limit);
    if (candidates.length > 0) await this.store.set(this.namespace, key, candidates);
    return candidates;
  }
}

export class FileCachedTravelTimeProvider implements TravelTimeProvider {
  constructor(
    private readonly delegate: TravelTimeProvider,
    private readonly store: FileStore,
    private readonly namespace: CacheNamespace,
  ) {}

  async measure(
    origin: Coordinate,
    destinations: Coordinate[],
    travelMode: TravelMode,
  ): Promise<(TravelLeg | null)[]> {
    if (destinations.length === 0) return [];

    // Die Reihenfolge der Ziele gehört in den Schlüssel: Sie bestimmt die
    // Reihenfolge der Antwort.
    const key = [
      coordinateKey(origin),
      travelMode,
      destinations.map(coordinateKey).join(';'),
    ].join('|');

    const cached = await this.store.get<(TravelLeg | null)[]>(this.namespace, key);

    if (cached !== null) return cached;

    const legs = await this.delegate.measure(origin, destinations, travelMode);
    await this.store.set(this.namespace, key, legs);
    return legs;
  }
}
