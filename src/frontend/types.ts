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

/**
 * Auftrag an die Karte, etwas zu zeigen -- ein Ereignis, kein Zustand.
 * Denselben Ort zweimal anzuklicken soll zweimal dorthin springen, und zwei
 * gleiche Aufträge hintereinander unterscheiden sich sonst in nichts; deshalb
 * trägt jeder eine laufende Nummer. Mehrere Punkte, weil eine Kettenzeile
 * *alle* Filialen meint -- die werden dann gemeinsam eingepasst.
 */
export type MapFocus = { points: Coordinate[]; stamp: number };

export type LocationCheckResult = {
  /** null, wenn noch keine helle gemeinsame Region berechnet wurde. */
  inIntersection: boolean | null;
  /** null, wenn noch keine dunkelgrüne, verengte Region berechnet wurde. */
  inPoiRegion: boolean | null;
};

/** In der Reihenfolge der angefragten Orte. */
export type LocationCheckResponse = { results: LocationCheckResult[] };

/**
 * Ein geprüfter Ort in der Liste. Gespeichert wird nur das hier -- das Urteil
 * und die Fahrzeiten haengen an der aktuellen Region und werden neu geholt.
 */
export type CheckedPlace = {
  id: string;
  label: string;
  coordinate: Coordinate;
  /** Aufgeklappt; erst dann werden die Fahrzeiten gemessen. */
  open: boolean;
};

export type TravelTimeLeg = {
  constraintId: string;
  /** null = der Kartendienst kennt dorthin keine Route. Kein Fehler. */
  durationMinutes: number | null;
  distanceKm: number | null;
};

export type TravelTimesResponse = { legs: TravelTimeLeg[] };

/** Muss zu POI_CATEGORIES in src/domain/models/poi.ts passen. */
export const POI_CATEGORIES = [
  'gym',
  'supermarket',
  'station',
  'kindergarten',
  'school',
  'pool',
  'doctor',
] as const;

export type PoiCategory = (typeof POI_CATEGORIES)[number];

/** Muss zu TRAVEL_MODES in src/domain/models/analysis.ts passen. */
export const TRAVEL_MODES = ['driving', 'cycling', 'ebike', 'walking'] as const;

export type TravelMode = (typeof TRAVEL_MODES)[number];

export type FoundPoi = {
  id: string;
  category: PoiCategory;
  /** `null`, wenn OSM keinen Namen führt -- die Oberfläche setzt den Text ein. */
  name: string | null;
  coordinate: Coordinate;
  brand: string | null;
  website: string | null;
  sport: string | null;
  areaSquareMeters: number | null;
  /** Luftlinie zur gemeinsamen Region; 0 = innerhalb. */
  distanceToRegionKm: number;
};

export type PoiSearchResponse = {
  category: PoiCategory;
  pois: FoundPoi[];
  searchArea: BoundingBox;
  regionBounds: BoundingBox;
};

export type PoiConditionResponse = {
  category: PoiCategory;
  /** Vereinigung der Isochronen um die gewählten Orte dieser Kategorie. */
  reachable: AreaFeature | null;
  /** Ob diese Bedingung allein etwas von der gemeinsamen Region übrig lässt. */
  satisfiable: boolean;
};

export type PoiRegionResponse = {
  conditions: PoiConditionResponse[];
  /** Alle Bedingungen erfüllt; null = nichts übrig (kein Fehler). */
  refined: AreaFeature | null;
};

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
  travelMode: TravelMode;
  color: string;
  /**
   * Nur die Darstellung auf der Karte. Ein ausgeblendetes Ziel zaehlt weiter
   * voll in Schnittmenge und Ortssuche -- sonst waere der Schalter ein
   * stilles Loeschen.
   */
  visible: boolean;
  status: TargetStatus;
  /** Bestätigte Koordinate aus dem Geocoding. */
  coordinate: Coordinate | null;
  /** Vom Provider normalisierte Adresse. */
  resolvedLabel: string | null;
  isochrone: AreaFeature | null;
  /** Vom Backend geliefert; nur fuer das Kartenfitting. */
  bounds: BoundingBox | null;
  error: string | null;
};
