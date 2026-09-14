import { DomainError } from '../../domain/models/errors.js';
import type { BoundingBox } from '../../domain/models/geo.js';
import type { PoiCategory, Poi } from '../../domain/models/poi.js';
import type { PoiProvider } from '../../domain/ports/poi-provider.js';
import { OSM_FILTERS } from './category-tags.js';

export const DEFAULT_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/**
 * Overpass lehnt Anfragen ohne aussagekräftigen User-Agent mit HTTP 406 ab --
 * Node schickt von sich aus keinen. Eine Kennung ist bei OSM-Diensten zudem
 * ausdrücklich erwünscht.
 */
const USER_AGENT = 'LocationOptimizer/0.1 (+https://github.com/location-optimizer)';

type OverpassElement = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  geometry?: Array<{ lat: number; lon: number }>;
  tags?: Record<string, string>;
};

/** Aus der HTML-Fehlerseite die eigentliche Meldung ziehen. */
const errorTextOf = (html: string): string => {
  const match = /Error:([^<]{0,200})/.exec(html);
  return match?.[1]?.trim() ?? 'unbekannte Overpass-Antwort';
};

/** Nur Lastprobleme lohnen einen erneuten Versuch -- Syntaxfehler nicht. */
const isOverloaded = (message: string): boolean =>
  /too busy|timeout|rate_limited|load|try again/i.test(message);

const EARTH_RADIUS_M = 6378137;

/** Grundfläche eines geschlossenen Rings, äquirektangular projiziert. */
const footprintSquareMeters = (
  ring: Array<{ lat: number; lon: number }>,
): number | null => {
  if (ring.length < 4) return null;

  const meanLat = ring.reduce((sum, p) => sum + p.lat, 0) / ring.length;
  const mPerDegLon =
    (Math.PI / 180) * EARTH_RADIUS_M * Math.cos((meanLat * Math.PI) / 180);
  const mPerDegLat = (Math.PI / 180) * EARTH_RADIUS_M;

  let sum = 0;

  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as { lat: number; lon: number };
    const b = ring[(i + 1) % ring.length] as { lat: number; lon: number };
    sum +=
      a.lon * mPerDegLon * (b.lat * mPerDegLat) -
      b.lon * mPerDegLon * (a.lat * mPerDegLat);
  }

  return Math.abs(sum) / 2;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class OverpassPoiProvider implements PoiProvider {
  private readonly cache = new Map<string, Promise<Poi[]>>();

  constructor(
    private readonly baseUrl: string = DEFAULT_OVERPASS_URL,
    private readonly maxAttempts = 4,
    private readonly backoffMs = 2000,
  ) {}

  async search(category: PoiCategory, area: BoundingBox): Promise<Poi[]> {
    const key = `${category}|${area.map((n) => n.toFixed(3)).join(',')}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const pending = this.fetchWithRetry(category, area);
    this.cache.set(key, pending);

    try {
      return await pending;
    } catch (error) {
      this.cache.delete(key);
      throw error;
    }
  }

  /**
   * Der öffentliche Overpass-Server antwortet unter Last mit einer
   * HTML-Fehlerseite statt JSON. Das ist keine dauerhafte Störung, sondern
   * verlangt einen erneuten Versuch mit wachsender Wartezeit.
   */
  private async fetchWithRetry(category: PoiCategory, area: BoundingBox): Promise<Poi[]> {
    const [west, south, east, north] = area;
    const filters = OSM_FILTERS[category];
    const bbox = `${south},${west},${north},${east}`;
    // 'out geom' liefert Knoten mit lat/lon und Flaechen mit vollem Ring.
    // 'center' vertraegt sich nicht damit -- die Kombination ist ein Syntaxfehler.
    const body = `[out:json][timeout:90];(${filters
      .map((filter) => `nwr${filter}(${bbox});`)
      .join('')});out geom;`;

    let lastDetail = 'unbekannt';

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': USER_AGENT,
          },
          body: `data=${encodeURIComponent(body)}`,
        });

        if (response.status === 429 || response.status === 504) {
          lastDetail = `HTTP ${response.status}`;
        } else if (!response.ok) {
          lastDetail = `HTTP ${response.status}`;
        } else {
          const text = await response.text();

          if (text.trimStart().startsWith('{')) {
            return this.toPois(
              category,
              JSON.parse(text) as { elements?: OverpassElement[] },
            );
          }

          // HTML statt JSON: entweder Überlastung oder ein Fehler in der Abfrage.
          const message = errorTextOf(text);

          if (!isOverloaded(message)) {
            // Einen Abfragefehler zu wiederholen hilft nie und verschleiert die Ursache.
            throw new DomainError(
              'PROVIDER_UNAVAILABLE',
              'Die Ortssuche hat unerwartet geantwortet.',
              `Overpass: ${message}`,
            );
          }

          lastDetail = message;
        }
      } catch (cause) {
        // Ein bereits klassifizierter Fehler ist endgueltig, nicht erneut versuchen.
        if (cause instanceof DomainError) throw cause;
        lastDetail = cause instanceof Error ? cause.message : 'Netzwerkfehler';
      }

      if (attempt < this.maxAttempts) await sleep(this.backoffMs * attempt);
    }

    throw new DomainError(
      'PROVIDER_UNAVAILABLE',
      'Die Ortssuche ist momentan überlastet. Bitte versuche es in einem Moment erneut.',
      lastDetail,
    );
  }

  private toPois(
    category: PoiCategory,
    payload: { elements?: OverpassElement[] },
  ): Poi[] {
    const pois: Poi[] = [];

    for (const element of payload.elements ?? []) {
      const ring = element.geometry;
      // Flaechen liefern keinen Mittelpunkt -- aus dem Ring bilden.
      const latitude =
        element.lat ??
        (ring !== undefined && ring.length > 0
          ? ring.reduce((sum, p) => sum + p.lat, 0) / ring.length
          : undefined);
      const longitude =
        element.lon ??
        (ring !== undefined && ring.length > 0
          ? ring.reduce((sum, p) => sum + p.lon, 0) / ring.length
          : undefined);

      if (latitude === undefined || longitude === undefined) continue;
      if (element.type === undefined || element.id === undefined) continue;

      const tags = element.tags ?? {};

      pois.push({
        id: `${element.type}/${element.id}`,
        category,
        name: tags['name'] ?? null,
        coordinate: { latitude, longitude },
        brand: tags['brand'] ?? tags['operator'] ?? null,
        website: tags['website'] ?? tags['contact:website'] ?? null,
        sport: tags['sport'] ?? null,
        areaSquareMeters:
          element.geometry !== undefined ? footprintSquareMeters(element.geometry) : null,
      });
    }

    return pois;
  }
}
