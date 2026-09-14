import type {
  LocationAnalysisRequest,
  LocationAnalysisResult,
  LocationConstraint,
  MapLayer,
  ResolvedTarget,
} from '../../domain/models/analysis.js';
import type { AreaFeature, Coordinate } from '../../domain/models/geo.js';
import type { GeocodingProvider } from '../../domain/ports/geocoding-provider.js';
import type { IsochroneProvider } from '../../domain/ports/isochrone-provider.js';
import type { LocationAnalysisStrategy } from '../../domain/ports/analysis-strategy.js';
import { validateAnalysisRequest } from '../../domain/services/constraint-validation.js';
import { boundsOf, intersectAreas } from '../../domain/services/geometry.js';
import { reachableArea } from './reachable-area.js';

export class IsochroneIntersectionStrategy implements LocationAnalysisStrategy {
  readonly id = 'isochrone-intersection';

  constructor(
    private readonly geocoding: GeocodingProvider,
    private readonly isochrones: IsochroneProvider,
  ) {}

  async analyze(request: LocationAnalysisRequest): Promise<LocationAnalysisResult> {
    validateAnalysisRequest(request);

    const targets = await Promise.all(
      request.constraints.map((constraint) => this.resolve(constraint)),
    );

    const isochrones = await Promise.all(
      targets.map((target) =>
        reachableArea(this.isochrones, target.coordinate, {
          travelMode: target.travelMode,
          maxTravelTimeMinutes: target.maxTravelTimeMinutes,
        }),
      ),
    );

    const layers: MapLayer[] = targets.map((target, index) => ({
      id: `isochrone-${target.constraintId}`,
      type: 'isochrone',
      name: target.name,
      constraintId: target.constraintId,
      geometry: isochrones[index] as AreaFeature,
    }));

    const intersection = intersectAreas(isochrones);

    if (intersection !== null) {
      layers.push({
        id: 'intersection',
        type: 'intersection',
        name: 'Gemeinsame Region',
        geometry: intersection,
      });
    }

    return {
      layers,
      intersection,
      targets,
      bounds: boundsOf(
        isochrones,
        targets.map((target) => target.coordinate),
      ),
    };
  }

  /**
   * Nutzt eine bereits aufgelöste Koordinate, falls vorhanden. Das spart den
   * Geocoding-Call, wenn das Frontend die Adresse schon bestätigt hat.
   */
  private async resolve(constraint: LocationConstraint): Promise<ResolvedTarget> {
    const coordinate: Coordinate =
      constraint.coordinate ?? (await this.geocoding.geocode(constraint.address));

    return {
      constraintId: constraint.id,
      name: constraint.name,
      address: constraint.address,
      coordinate,
      maxTravelTimeMinutes: constraint.maxTravelTimeMinutes,
      travelMode: constraint.travelMode,
    };
  }
}
