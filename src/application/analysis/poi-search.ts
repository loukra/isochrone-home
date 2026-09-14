import type {
  LocationAnalysisRequest,
  TravelMode,
} from '../../domain/models/analysis.js';
import { DomainError } from '../../domain/models/errors.js';
import type { BoundingBox } from '../../domain/models/geo.js';
import type { PoiCategory, Poi } from '../../domain/models/poi.js';
import type { LocationAnalysisStrategy } from '../../domain/ports/analysis-strategy.js';
import type { PoiProvider } from '../../domain/ports/poi-provider.js';
import { expandBounds, reachRadiusKm } from '../../domain/services/search-area.js';
import { distanceToAreaKm } from '../../domain/services/geometry.js';

export type PoiSearchRequest = {
  constraints: LocationAnalysisRequest['constraints'];
  category: PoiCategory;
  /**
   * Zeit und Verkehrsmittel zusammen bestimmen, wie weit über die Region hinaus
   * gesucht wird -- zehn Minuten zu Fuß reichen nicht so weit wie zehn im Auto.
   */
  travelMode: TravelMode;
  maxTravelTimeMinutes: number;
};

export type FoundPoi = Poi & {
  /** Luftlinie zur gemeinsamen Region; 0 = innerhalb. */
  distanceToRegionKm: number;
};

export type PoiSearchResult = {
  category: PoiCategory;
  pois: FoundPoi[];
  /** Tatsächlich abgesuchter Bereich, inklusive Puffer. */
  searchArea: BoundingBox;
  /** Region, auf die sich die Suche bezieht. */
  regionBounds: BoundingBox;
};

/**
 * Sucht POIs für die gemeinsame Region der Wohnorte.
 *
 * Der Suchbereich wird um die Reichweite erweitert, weil ein POI außerhalb der
 * Region liegen und sie trotzdem bedienen kann.
 */
export class PoiSearch {
  constructor(
    private readonly strategy: LocationAnalysisStrategy,
    private readonly pois: PoiProvider,
  ) {}

  async execute(request: PoiSearchRequest): Promise<PoiSearchResult> {
    const analysis = await this.strategy.analyze({ constraints: request.constraints });

    if (analysis.intersection === null || analysis.bounds === null) {
      throw new DomainError(
        'INVALID_INPUT',
        'Für diese Ziele gibt es keine gemeinsame Region, in der gesucht werden könnte.',
      );
    }

    const regionBounds = boundsOfFeature(analysis.intersection);
    const radiusKm = reachRadiusKm(request.maxTravelTimeMinutes, request.travelMode);
    const searchArea = expandBounds(regionBounds, radiusKm);

    const found = await this.pois.search(request.category, searchArea);
    const region = analysis.intersection;

    // Das Suchrechteck greift in den Ecken viel weiter als die Reichweite.
    // Nachfiltern am echten Umriss haelt die Liste kurz und ehrlich.
    const relevant: FoundPoi[] = [];

    for (const poi of found) {
      const distanceToRegionKm = distanceToAreaKm(poi.coordinate, region);
      if (distanceToRegionKm <= radiusKm) {
        relevant.push({ ...poi, distanceToRegionKm });
      }
    }

    relevant.sort((a, b) => a.distanceToRegionKm - b.distanceToRegionKm);

    return { category: request.category, pois: relevant, searchArea, regionBounds };
  }
}

const boundsOfFeature = (feature: {
  geometry: { type: string; coordinates: unknown };
}): BoundingBox => {
  const rings =
    feature.geometry.type === 'Polygon'
      ? (feature.geometry.coordinates as number[][][])
      : (feature.geometry.coordinates as number[][][][]).flat();

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const ring of rings) {
    for (const [x, y] of ring as Array<[number, number]>) {
      west = Math.min(west, x);
      south = Math.min(south, y);
      east = Math.max(east, x);
      north = Math.max(north, y);
    }
  }

  return [west, south, east, north];
};
