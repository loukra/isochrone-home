import 'dotenv/config';
import { DomainError } from '../../domain/models/errors.js';
import {
  DEFAULT_GEOCODING_BASE_URL,
  DEFAULT_ISOCHRONE_BASE_URL,
} from '../openrouteservice/client.js';
import { DEFAULT_PHOTON_BASE_URL } from '../geocoding/photon-geocoder.js';
import { DEFAULT_OVERPASS_URL } from '../poi/overpass-poi-provider.js';

/** Tokenfreier Raster-Style auf Basis von OpenStreetMap-Tiles. */
const DEFAULT_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * Derselbe Anbieter, dunkler Stil. Eine helle Karte neben einer dunklen
 * Seitenleiste ist der hellste Fleck im Bild und blendet genau dort, wo man
 * hinsieht -- der Dunkelmodus muss die Karte mitnehmen, sonst ist er halb.
 */
const DEFAULT_MAP_STYLE_URL_DARK = 'https://tiles.openfreemap.org/styles/dark';

export type AppConfig = {
  port: number;
  analysisStrategy: string;
  geocodingProvider: string;
  /**
   * Zweiter Anbieter, falls der erste nicht antwortet. `null` schaltet den
   * Rueckfall ab. Er springt ausdruecklich *nicht* bei leeren Ergebnissen ein
   * -- siehe FallbackGeocodingProvider.
   */
  geocodingFallbackProvider: string | null;
  isochroneProvider: string;
  openRouteServiceApiKey: string;
  openRouteServiceIsochroneUrl: string;
  openRouteServiceGeocodingUrl: string;
  photonUrl: string;
  overpassUrl: string;
  mapStyleUrl: string;
  mapStyleUrlDark: string;
  mapToken: string | null;
  /** Ablageort des Plattencaches; darf jederzeit geloescht werden. */
  cacheDirectory: string;
  /** Haltedauer je Datentyp -- siehe cache/namespaces.ts. */
  cacheIsochroneDays: number;
  cachePoiHours: number;
  cacheGeocodeDays: number;
  cacheRouteDays: number;
};

/** Positive Zahl aus der Umgebung, sonst der Vorgabewert. */
const readNumber = (key: string, fallback: number): number => {
  const raw = readOptional(key);
  if (raw === null) return fallback;

  const value = Number.parseFloat(raw);

  if (!Number.isFinite(value) || value <= 0) {
    throw new DomainError('CONFIGURATION_ERROR', `${key} muss eine positive Zahl sein.`);
  }

  return value;
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
  // Photon ist der Erste, weil es messbar genauer ist: auf 13 ungenauen
  // Eingaben 12 Treffer auf Platz 1 gegen 3 bei Pelias, und Pelias' Index ist
  // nachweislich Monate alt (er liefert ein OSM-Objekt aus, das am 28.11.2025
  // geloescht wurde). Pelias bleibt als Rueckfall verdrahtet -- der Adapter
  // ist geschrieben und getestet, er wird nur nicht mehr zuerst gefragt.
  const geocodingProvider = readWithDefault('GEOCODING_PROVIDER', 'photon');
  const geocodingFallbackProvider = readWithDefault(
    'GEOCODING_FALLBACK_PROVIDER',
    'openrouteservice',
  );
  const isochroneProvider = readWithDefault('ISOCHRONE_PROVIDER', 'openrouteservice');
  const openRouteServiceApiKey = readOptional('OPENROUTESERVICE_API_KEY');

  const usesOrs =
    geocodingProvider === 'openrouteservice' ||
    geocodingFallbackProvider === 'openrouteservice' ||
    isochroneProvider === 'openrouteservice';

  if (usesOrs && openRouteServiceApiKey === null) {
    throw new DomainError(
      'CONFIGURATION_ERROR',
      'OPENROUTESERVICE_API_KEY fehlt.',
      'Lege eine .env nach dem Vorbild von .env.example an und trage einen kostenlosen Key von https://openrouteservice.org/dev/#/signup ein.',
    );
  }

  // 0 ist erlaubt und bedeutet "das Betriebssystem wählt einen freien Port";
  // welchen es war, meldet der Server beim Start. Die Mac-App nutzt das bewusst
  // *nicht* -- sie braucht einen festen Origin, sonst wäre ihr localStorage bei
  // jedem Start leer (siehe CLAUDE.md, Mac-App).
  const port = Number.parseInt(readWithDefault('PORT', '3001'), 10);

  if (!Number.isInteger(port) || port < 0) {
    throw new DomainError('CONFIGURATION_ERROR', 'PORT muss eine Zahl ab 0 sein.');
  }

  return {
    port,
    analysisStrategy: readWithDefault('ANALYSIS_STRATEGY', 'isochrone-intersection'),
    geocodingProvider,
    geocodingFallbackProvider:
      geocodingFallbackProvider === 'none' ||
      geocodingFallbackProvider === geocodingProvider
        ? null
        : geocodingFallbackProvider,
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
    photonUrl: readWithDefault('PHOTON_URL', DEFAULT_PHOTON_BASE_URL),
    overpassUrl: readWithDefault('OVERPASS_URL', DEFAULT_OVERPASS_URL),
    mapStyleUrl: readWithDefault('MAP_STYLE_URL', DEFAULT_MAP_STYLE_URL),
    mapStyleUrlDark: readWithDefault('MAP_STYLE_URL_DARK', DEFAULT_MAP_STYLE_URL_DARK),
    mapToken: readOptional('MAP_TOKEN'),
    cacheDirectory: readWithDefault('CACHE_DIR', '.cache'),
    cacheIsochroneDays: readNumber('CACHE_TTL_ISOCHRONE_DAYS', 7),
    cachePoiHours: readNumber('CACHE_TTL_POI_HOURS', 24),
    cacheGeocodeDays: readNumber('CACHE_TTL_GEOCODE_DAYS', 30),
    cacheRouteDays: readNumber('CACHE_TTL_ROUTE_DAYS', 7),
  };
};
