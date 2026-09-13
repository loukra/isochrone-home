import type { LocationConstraint, MapLayer } from '../../domain/models/analysis.js';
import type { BoundingBox, Coordinate } from '../../domain/models/geo.js';
import type { GeocodingProvider } from '../../domain/ports/geocoding-provider.js';
import type { IsochroneProvider } from '../../domain/ports/isochrone-provider.js';
import { validateAnalysisRequest } from '../../domain/services/constraint-validation.js';
import { boundsOf } from '../../domain/services/geometry.js';

export type SingleIsochroneResult = {
  constraintId: string;
  coordinate: Coordinate;
  layer: MapLayer;
  /** Damit das Frontend die Karte fitten kann, ohne selbst zu rechnen. */
  bounds: BoundingBox | null;
};

/**
 * Schritt 1 des Bedienablaufs: die Isochrone genau eines bestätigten Ziels.
 * Bewusst getrennt von der Analyse-Strategie -- hier wird keine Schnittmenge
 * berechnet.
 */
export class IsochroneQuery {
  constructor(
    private readonly geocoding: GeocodingProvider,
    private readonly isochrones: IsochroneProvider,
  ) {}

  async execute(constraint: LocationConstraint): Promise<SingleIsochroneResult> {
    validateAnalysisRequest({ constraints: [constraint] });

    const coordinate =
      constraint.coordinate ?? (await this.geocoding.geocode(constraint.address));

    const geometry = await this.isochrones.calculate(coordinate, {
      travelMode: constraint.travelMode,
      maxTravelTimeMinutes: constraint.maxTravelTimeMinutes,
    });

    return {
      constraintId: constraint.id,
      coordinate,
      layer: {
        id: `isochrone-${constraint.id}`,
        type: 'isochrone',
        name: constraint.name,
        constraintId: constraint.id,
        geometry,
      },
      bounds: boundsOf([geometry], [coordinate]),
    };
  }
}
