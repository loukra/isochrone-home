import { REGION } from './region.js';
import type {
  AnalysisResponse,
  AreaFeature,
  Coordinate,
  GeocodingCandidate,
  LocationCheckResponse,
  PoiRegionResponse,
  PoiSearchResponse,
  SingleIsochroneResponse,
  Target,
  TravelMode,
  TravelTimesResponse,
} from './types.js';

export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

const post = async <T>(path: string, body: unknown): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Die Meldung ist nur der Rückfall: Die Oberfläche übersetzt über den Code
    // (siehe i18n/errors.ts) und zeigt diesen Text nur, wenn sie ihn nicht kennt.
    throw new ApiError('NETWORK_ERROR', 'Die App erreicht ihren Server nicht.');
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | null)
      ?.error;
    throw new ApiError(
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? 'Es ist ein unerwarteter Fehler aufgetreten. Bitte versuche es erneut.',
    );
  }

  return payload as T;
};

const toConstraint = (target: Target) => ({
  id: target.id,
  name: target.name.trim(),
  address: target.address.trim(),
  travelMode: target.travelMode,
  maxTravelTimeMinutes: target.maxTravelTimeMinutes,
  ...(target.coordinate !== null ? { coordinate: target.coordinate } : {}),
});

/**
 * Die Region geht mit, damit die Bezeichnung das eigene Land weglassen kann --
 * "Wehdestraße 7, 26123 Oldenburg" statt "..., Deutschland". Eine Angabe, die
 * bei jeder Zeile gleich lautet, unterscheidet nichts.
 *
 * Sie schränkt die Suche **nicht** ein: Wer von Deutschland aus eine Adresse in
 * Frankreich sucht, findet sie unverändert -- sie nennt dann nur ihr Land.
 */
export const geocode = (query: string): Promise<{ candidates: GeocodingCandidate[] }> =>
  post('/api/geocode', REGION === null ? { query } : { query, homeCountry: REGION });

export const fetchIsochrone = (target: Target): Promise<SingleIsochroneResponse> =>
  post('/api/isochrone', toConstraint(target));

export const searchPois = (
  targets: Target[],
  category: string,
  travelMode: TravelMode,
  maxTravelTimeMinutes: number,
): Promise<PoiSearchResponse> =>
  post('/api/pois', {
    constraints: targets.map(toConstraint),
    category,
    // Das Verkehrsmittel bestimmt hier nur den Suchradius -- gefahren wird
    // erst in /api/pois/region.
    travelMode,
    maxTravelTimeMinutes,
  });

export type PoiRegionCondition = {
  category: string;
  travelMode: TravelMode;
  maxTravelTimeMinutes: number;
  origins: Coordinate[];
};

export const refinePoiRegion = (
  targets: Target[],
  conditions: PoiRegionCondition[],
): Promise<PoiRegionResponse> =>
  post('/api/pois/region', {
    constraints: targets.map(toConstraint),
    conditions,
  });

export const analyze = (targets: Target[]): Promise<AnalysisResponse> =>
  post('/api/analyze', { constraints: targets.map(toConstraint) });

/**
 * Alle geprüften Orte in einem Aufruf: Die Flächen liegen im Rumpf, und sie je
 * Ort erneut zu schicken wäre bei fünf Adressen fünfmal dieselbe Geometrie.
 */
export const checkLocations = (
  coordinates: Coordinate[],
  intersection: AreaFeature | null,
  poiRegion: AreaFeature | null,
): Promise<LocationCheckResponse> =>
  post('/api/locations/check', { coordinates, intersection, poiRegion });

/**
 * Fahrzeit und Strecke vom geprüften Ort zu den Zielen.
 *
 * Getrennt von checkLocation, weil nur dieser Aufruf den Provider kostet: Fällt
 * er aus, steht das Urteil "liegt in der Region" trotzdem.
 */
export const fetchTravelTimes = (
  origin: Coordinate,
  targets: Target[],
): Promise<TravelTimesResponse> =>
  post('/api/locations/travel-times', {
    origin,
    targets: targets
      .filter((target) => target.coordinate !== null)
      .map((target) => ({
        id: target.id,
        coordinate: target.coordinate,
        travelMode: target.travelMode,
      })),
  });

export type AppSettings = {
  mapStyleUrl: string;
  /** Für den Dunkelmodus -- siehe config.ts. */
  mapStyleUrlDark: string;
  maxTravelTimeMinutes: number;
};

export const fetchMapConfig = async (): Promise<AppSettings> => {
  const response = await fetch('/api/config');
  if (!response.ok)
    throw new ApiError('CONFIG_ERROR', 'Die App konnte ihre Konfiguration nicht laden.');
  return (await response.json()) as AppSettings;
};
