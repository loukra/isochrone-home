import type { TravelMode } from '../../src/domain/models/analysis.js';
import type { AreaFeature, Coordinate } from '../../src/domain/models/geo.js';
import type {
  GeocodingCandidate,
  GeocodingProvider,
} from '../../src/domain/ports/geocoding-provider.js';
import type {
  IsochroneOptions,
  IsochroneProvider,
} from '../../src/domain/ports/isochrone-provider.js';
import { DomainError } from '../../src/domain/models/errors.js';

/** Achsenparalleles Rechteck als Test-Isochrone. */
export const square = (
  west: number,
  south: number,
  east: number,
  north: number,
): AreaFeature => ({
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  },
});

export const constraint = (
  id: string,
  overrides: Partial<{
    name: string;
    address: string;
    travelMode: TravelMode;
    maxTravelTimeMinutes: number;
    coordinate: Coordinate;
  }> = {},
) => ({
  id,
  name: overrides.name ?? `Ziel ${id}`,
  address: overrides.address ?? 'Münster',
  travelMode: overrides.travelMode ?? ('driving' as TravelMode),
  maxTravelTimeMinutes: overrides.maxTravelTimeMinutes ?? 30,
  ...(overrides.coordinate !== undefined ? { coordinate: overrides.coordinate } : {}),
});

export class StubGeocoder implements GeocodingProvider {
  calls: string[] = [];

  constructor(private readonly byAddress: Record<string, Coordinate> = {}) {}

  async search(address: string): Promise<GeocodingCandidate[]> {
    const coordinate = this.byAddress[address];
    return coordinate === undefined ? [] : [{ label: address, coordinate }];
  }

  async geocode(address: string): Promise<Coordinate> {
    this.calls.push(address);
    const coordinate = this.byAddress[address];

    if (coordinate === undefined) {
      throw new DomainError(
        'ADDRESS_NOT_FOUND',
        `Die Adresse "${address}" konnte nicht gefunden werden.`,
      );
    }

    return coordinate;
  }
}

export class StubIsochroneProvider implements IsochroneProvider {
  calls: Array<{ origin: Coordinate; options: IsochroneOptions }> = [];

  constructor(private readonly areas: AreaFeature[]) {}

  async calculate(origin: Coordinate, options: IsochroneOptions): Promise<AreaFeature> {
    const index = this.calls.length;
    this.calls.push({ origin, options });
    const area = this.areas[index] ?? this.areas[this.areas.length - 1];

    if (area === undefined) {
      throw new DomainError('PROVIDER_UNAVAILABLE', 'Keine Testgeometrie hinterlegt.');
    }

    return area;
  }
}
