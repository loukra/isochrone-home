import 'dotenv/config';
import { DomainError } from '../../domain/models/errors.js';
import {
  DEFAULT_GEOCODING_BASE_URL,
  DEFAULT_ISOCHRONE_BASE_URL,
} from '../openrouteservice/client.js';
import { DEFAULT_OVERPASS_URL } from '../poi/overpass-poi-provider.js';

/** Tokenfreier Raster-Style auf Basis von OpenStreetMap-Tiles. */
const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export type AppConfig = {
  port: number;
  analysisStrategy: string;
  geocodingProvider: string;
  isochroneProvider: string;
  openRouteServiceApiKey: string;
  openRouteServiceIsochroneUrl: string;
  openRouteServiceGeocodingUrl: string;
  overpassUrl: string;
  mapStyleUrl: string;
  mapToken: string | null;
};

const readOptional = (key: string): string | null => {
  const value = process.env[key]?.trim();
  return value !== undefined && value.length > 0 ? value : null;
};

const readWithDefault = (key: string, fallback: string): string =>
  readOptional(key) ?? fallback;

/**
 * Liest und validiert die Konfiguration beim Start. Fehlende Pflichtwerte
 * führen zu einer klaren Fehlermeldung statt zu späteren 401ern (Spec 12).
 */
export const loadConfig = (): AppConfig => {
  const geocodingProvider = readWithDefault('GEOCODING_PROVIDER', 'openrouteservice');
  const isochroneProvider = readWithDefault('ISOCHRONE_PROVIDER', 'openrouteservice');
  const openRouteServiceApiKey = readOptional('OPENROUTESERVICE_API_KEY');

  const usesOrs =
    geocodingProvider === 'openrouteservice' || isochroneProvider === 'openrouteservice';

  if (usesOrs && openRouteServiceApiKey === null) {
    throw new DomainError(
      'CONFIGURATION_ERROR',
      'OPENROUTESERVICE_API_KEY fehlt.',
      'Lege eine .env nach dem Vorbild von .env.example an und trage einen kostenlosen Key von https://openrouteservice.org/dev/#/signup ein.',
    );
  }

  const port = Number.parseInt(readWithDefault('PORT', '3001'), 10);

  if (!Number.isInteger(port) || port <= 0) {
    throw new DomainError('CONFIGURATION_ERROR', 'PORT muss eine positive Zahl sein.');
  }

  return {
    port,
    analysisStrategy: readWithDefault('ANALYSIS_STRATEGY', 'isochrone-intersection'),
    geocodingProvider,
    isochroneProvider,
    openRouteServiceApiKey: openRouteServiceApiKey ?? '',
    openRouteServiceIsochroneUrl: readWithDefault(
      'OPENROUTESERVICE_ISOCHRONE_URL',
      DEFAULT_ISOCHRONE_BASE_URL,
    ),
    openRouteServiceGeocodingUrl: readWithDefault(
      'OPENROUTESERVICE_GEOCODING_URL',
      DEFAULT_GEOCODING_BASE_URL,
    ),
    overpassUrl: readWithDefault('OVERPASS_URL', DEFAULT_OVERPASS_URL),
    mapStyleUrl: readWithDefault('MAP_STYLE_URL', DEFAULT_MAP_STYLE_URL),
    mapToken: readOptional('MAP_TOKEN'),
  };
};
