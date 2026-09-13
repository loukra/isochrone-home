import { IsochroneIntersectionStrategy } from '../../application/analysis/isochrone-intersection-strategy.js';
import { IsochroneQuery } from '../../application/analysis/isochrone-query.js';
import { PoiRegionRefinement } from '../../application/analysis/poi-region.js';
import { PoiSearch } from '../../application/analysis/poi-search.js';
import { TravelTimeQuery } from '../../application/analysis/travel-times.js';
import { DomainError } from '../../domain/models/errors.js';
import {
  FileCachedGeocodingProvider,
  FileCachedIsochroneProvider,
  FileCachedPoiProvider,
  FileCachedTravelTimeProvider,
} from '../cache/file-cached-providers.js';
import { FileStore } from '../cache/file-store.js';
import { cacheNamespaces } from '../cache/namespaces.js';
import type { GeocodingProvider } from '../../domain/ports/geocoding-provider.js';
import type { IsochroneProvider } from '../../domain/ports/isochrone-provider.js';
import type { LocationAnalysisStrategy } from '../../domain/ports/analysis-strategy.js';
import type { PoiProvider } from '../../domain/ports/poi-provider.js';
import type { TravelTimeProvider } from '../../domain/ports/travel-time-provider.js';
import { OverpassPoiProvider } from '../poi/overpass-poi-provider.js';
import { OpenRouteServiceGeocoder } from '../geocoding/openrouteservice-geocoder.js';
import { CachingIsochroneProvider } from '../isochrone/caching-isochrone-provider.js';
import { OpenRouteServiceIsochroneProvider } from '../isochrone/openrouteservice-isochrone-provider.js';
import { OpenRouteServiceMatrixProvider } from '../travel/openrouteservice-matrix-provider.js';
import type { AppConfig } from './config.js';

export type Container = {
  config: AppConfig;
  geocoding: GeocodingProvider;
  isochrones: IsochroneProvider;
  strategy: LocationAnalysisStrategy;
  isochroneQuery: IsochroneQuery;
  pois: PoiProvider;
  poiSearch: PoiSearch;
  poiRegion: PoiRegionRefinement;
  travelTimes: TravelTimeQuery;
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

/** Nur die Providerwahl -- die Cache-Huellen kommen in createContainer dazu. */
const createIsochroneProvider = (config: AppConfig): IsochroneProvider => {
  switch (config.isochroneProvider) {
    case 'openrouteservice':
      return new OpenRouteServiceIsochroneProvider(
        config.openRouteServiceApiKey,
        config.openRouteServiceIsochroneUrl,
      );
    default:
      throw new DomainError(
        'CONFIGURATION_ERROR',
        `Unbekannter ISOCHRONE_PROVIDER: "${config.isochroneProvider}".`,
        'Unterstützt wird derzeit: openrouteservice',
      );
  }
};

/**
 * Matrix und Isochronen sind bei ORS zwei Dienste unter derselben Basis-URL --
 * deshalb dieselbe Einstellung, nicht aus Bequemlichkeit.
 */
const createTravelTimeProvider = (config: AppConfig): TravelTimeProvider => {
  switch (config.isochroneProvider) {
    case 'openrouteservice':
      return new OpenRouteServiceMatrixProvider(
        config.openRouteServiceApiKey,
        config.openRouteServiceIsochroneUrl,
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
  const store = new FileStore(config.cacheDirectory);
  const namespaces = cacheNamespaces({
    isochroneDays: config.cacheIsochroneDays,
    poiHours: config.cachePoiHours,
    geocodeDays: config.cacheGeocodeDays,
    routeDays: config.cacheRouteDays,
  });

  // Reihenfolge der Hüllen: Speicher vor Platte vor Provider. Der schnellste
  // Treffer kommt zuerst, der teuerste zuletzt.
  const geocoding = new FileCachedGeocodingProvider(
    createGeocoder(config),
    store,
    namespaces.geocoding,
  );
  const isochrones = new CachingIsochroneProvider(
    new FileCachedIsochroneProvider(
      createIsochroneProvider(config),
      store,
      namespaces.isochrones,
    ),
  );
  const travelTimes = new FileCachedTravelTimeProvider(
    createTravelTimeProvider(config),
    store,
    namespaces.routes,
  );
  const strategy = createStrategy(config, geocoding, isochrones);
  const pois = new FileCachedPoiProvider(
    new OverpassPoiProvider(config.overpassUrl),
    store,
    namespaces.pois,
  );

  return {
    config,
    geocoding,
    isochrones,
    strategy,
    isochroneQuery: new IsochroneQuery(geocoding, isochrones),
    pois,
    poiSearch: new PoiSearch(strategy, pois),
    poiRegion: new PoiRegionRefinement(strategy, isochrones),
    travelTimes: new TravelTimeQuery(travelTimes),
  };
};
