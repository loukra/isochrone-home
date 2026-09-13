import type { AreaFeature, BoundingBox, Coordinate } from './geo.js';

/**
 * Verkehrsmittel je Ziel. Fachliche Namen, keine Providerprofile -- die
 * Zuordnung auf `driving-car`, `cycling-electric` usw. gehört in den Adapter.
 * 'ebike' ist bewusst ein eigener Modus und kein Fahrrad mit Aufschlag: Ein
 * Pedelec hält am Berg und über die Distanz ein anderes Tempo, und genau das
 * verschiebt die erreichbare Fläche.
 */
export const TRAVEL_MODES = ['driving', 'cycling', 'ebike', 'walking'] as const;

export type TravelMode = (typeof TRAVEL_MODES)[number];

export const DEFAULT_TRAVEL_MODE: TravelMode = 'driving';

export const SUPPORTED_TRAVEL_MODES: readonly TravelMode[] = TRAVEL_MODES;

export type LocationConstraint = {
  id: string;
  name: string;
  address: string;
  travelMode: TravelMode;
  maxTravelTimeMinutes: number;
  /**
   * Bereits aufgelöste Koordinate aus einem vorherigen Geocoding-Schritt.
   * Wenn gesetzt, entfällt ein erneuter Geocoding-Call (Spec 10: keine
   * unnötigen API-Aufrufe).
   */
  coordinate?: Coordinate;
};

export type LocationAnalysisRequest = {
  constraints: LocationConstraint[];
};

export type MapLayerType = 'isochrone' | 'intersection';

export type MapLayer = {
  id: string;
  type: MapLayerType;
  name: string;
  /** Verweist bei type 'isochrone' auf die zugehörige Constraint-ID. */
  constraintId?: string;
  geometry: AreaFeature;
};

export type ResolvedTarget = {
  constraintId: string;
  name: string;
  address: string;
  coordinate: Coordinate;
  maxTravelTimeMinutes: number;
  travelMode: TravelMode;
};

export type LocationAnalysisResult = {
  layers: MapLayer[];
  /** null = keine gemeinsame Region. Kein Fehlerfall (Spec 8). */
  intersection: AreaFeature | null;
  targets: ResolvedTarget[];
  /** Umfasst alle Layer und Zielpunkte; null wenn nichts darzustellen ist. */
  bounds: BoundingBox | null;
};

export const MIN_TRAVEL_TIME_MINUTES = 1;
export const MAX_TRAVEL_TIME_MINUTES = 120;
