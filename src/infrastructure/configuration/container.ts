import { IsochroneIntersectionStrategy } from '../../application/analysis/isochrone-intersection-strategy.js';
import { IsochroneQuery } from '../../application/analysis/isochrone-query.js';
import { DomainError } from '../../domain/models/errors.js';
import type { GeocodingProvider } from '../../domain/ports/geocoding-provider.js';
import type { IsochroneProvider } from '../../domain/ports/isochrone-provider.js';
import type { LocationAnalysisStrategy } from '../../domain/ports/analysis-strategy.js';
import { OpenRouteServiceGeocoder } from '../geocoding/openrouteservice-geocoder.js';
import { CachingIsochroneProvider } from '../isochrone/caching-isochrone-provider.js';
import { OpenRouteServiceIsochroneProvider } from '../isochrone/openrouteservice-isochrone-provider.js';
import type { AppConfig } from './config.js';

export type Container = {
  config: AppConfig;
  geocoding: GeocodingProvider;
  isochrones: IsochroneProvider;
  strategy: LocationAnalysisStrategy;
  isochroneQuery: IsochroneQuery;
};

const createGeocoder = (config: AppConfig): GeocodingProvider => {
  switch (config.geocodingProvider) {
    case 'openrouteservice':
      return new OpenRouteServiceGeocoder(
        config.openRouteServiceApiKey,
        config.openRouteServiceGeocodingUrl,
      );
    default:
      throw new DomainError(
        'CONFIGURATION_ERROR',
        `Unbekannter GEOCODING_PROVIDER: "${config.geocodingProvider}".`,
        'Unterstützt wird derzeit: openrouteservice',
      );
  }
};

const createIsochroneProvider = (config: AppConfig): IsochroneProvider => {
  switch (config.isochroneProvider) {
    case 'openrouteservice':
      return new CachingIsochroneProvider(
        new OpenRouteServiceIsochroneProvider(
          config.openRouteServiceApiKey,
          config.openRouteServiceIsochroneUrl,
        ),
      );
    default:
      throw new DomainError(
        'CONFIGURATION_ERROR',
        `Unbekannter ISOCHRONE_PROVIDER: "${config.isochroneProvider}".`,
        'Unterstützt wird derzeit: openrouteservice',
      );
  }
};

const createStrategy = (
  config: AppConfig,
  geocoding: GeocodingProvider,
  isochrones: IsochroneProvider,
): LocationAnalysisStrategy => {
  switch (config.analysisStrategy) {
    case 'isochrone-intersection':
      return new IsochroneIntersectionStrategy(geocoding, isochrones);
    default:
      throw new DomainError(
        'CONFIGURATION_ERROR',
        `Unbekannte ANALYSIS_STRATEGY: "${config.analysisStrategy}".`,
        'Unterstützt wird derzeit: isochrone-intersection',
      );
  }
};

/** Einziger Ort, an dem konkrete Implementierungen verdrahtet werden. */
export const createContainer = (config: AppConfig): Container => {
  const geocoding = createGeocoder(config);
  const isochrones = createIsochroneProvider(config);

  return {
    config,
    geocoding,
    isochrones,
    strategy: createStrategy(config, geocoding, isochrones),
    isochroneQuery: new IsochroneQuery(geocoding, isochrones),
  };
};
