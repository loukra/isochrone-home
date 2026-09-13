import type { Feature, MultiPolygon, Polygon } from 'geojson';

export type Coordinate = { latitude: number; longitude: number };
export type AreaFeature = Feature<Polygon | MultiPolygon>;
export type BoundingBox = [number, number, number, number];

export type MapLayer = {
  id: string;
  type: 'isochrone' | 'intersection';
  name: string;
  constraintId?: string;
  geometry: AreaFeature;
};

export type GeocodingCandidate = { label: string; coordinate: Coordinate };

export type SingleIsochroneResponse = {
  constraintId: string;
  coordinate: Coordinate;
  layer: MapLayer;
  bounds: BoundingBox | null;
};

export type AnalysisResponse = {
  layers: MapLayer[];
  intersection: AreaFeature | null;
  targets: Array<{
    constraintId: string;
    name: string;
    address: string;
    coordinate: Coordinate;
    maxTravelTimeMinutes: number;
  }>;
  bounds: BoundingBox | null;
};

/** Zustand eines Ziels im Formular (nur Frontend). */
export type TargetStatus = 'draft' | 'loading' | 'ready' | 'error';

export type Target = {
  id: string;
  name: string;
  address: string;
  maxTravelTimeMinutes: number;
  color: string;
  status: TargetStatus;
  /** Bestätigte Koordinate aus dem Geocoding. */
  coordinate: Coordinate | null;
  /** Vom Provider normalisierte Adresse. */
  resolvedLabel: string | null;
  isochrone: AreaFeature | null;
  error: string | null;
};
