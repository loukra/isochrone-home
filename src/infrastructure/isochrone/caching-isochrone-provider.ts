import {
  coordinateKey,
  type AreaFeature,
  type Coordinate,
} from '../../domain/models/geo.js';
import type {
  IsochroneOptions,
  IsochroneProvider,
} from '../../domain/ports/isochrone-provider.js';

const DEFAULT_MAX_ENTRIES = 200;

/**
 * Prozessweiter In-Memory-Cache vor einem echten Provider.
 *
 * Zweck: Schritt 1 holt die Isochrone eines Ziels bereits einzeln. Klickt der
 * Nutzer danach auf "Analysieren", darf dieselbe Isochrone nicht erneut beim
 * Provider angefragt werden (Spec 10). Keine Persistenz, kein TTL nötig --
 * Isochronen sind für identische Parameter stabil.
 */
export class CachingIsochroneProvider implements IsochroneProvider {
  private readonly cache = new Map<string, Promise<AreaFeature>>();

  get maxTravelTimeMinutes(): number {
    return this.delegate.maxTravelTimeMinutes;
  }

  constructor(
    private readonly delegate: IsochroneProvider,
    private readonly maxEntries: number = DEFAULT_MAX_ENTRIES,
  ) {}

  async calculate(origin: Coordinate, options: IsochroneOptions): Promise<AreaFeature> {
    const key = this.keyOf(origin, options);
    const cached = this.cache.get(key);

    if (cached !== undefined) {
      // Gleichen Eintrag ans Ende schieben (einfache LRU-Ordnung).
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }

    // Promise cachen, damit parallele Anfragen denselben Provider-Call teilen.
    const pending = this.delegate.calculate(origin, options);
    this.cache.set(key, pending);

    try {
      const result = await pending;
      this.evictIfNeeded();
      return result;
    } catch (error) {
      this.cache.delete(key);
      throw error;
    }
  }

  private keyOf(origin: Coordinate, options: IsochroneOptions): string {
    return `${coordinateKey(origin)}|${options.travelMode}|${options.maxTravelTimeMinutes}`;
  }

  private evictIfNeeded(): void {
    while (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next();
      if (oldest.done === true) return;
      this.cache.delete(oldest.value);
    }
  }
}
