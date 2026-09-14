import { z } from 'zod';
import {
  POI_CATEGORIES,
  TRAVEL_MODES,
  type CheckedPlace,
  type Coordinate,
  type PoiCategory,
  type Target,
  type TravelMode,
} from './types.js';

const STORAGE_KEY = 'location-optimizer:state:v1';
// v2: Marke und Name teilen sich seit der Vereinheitlichung einen Namensraum
// ("place:"). Alte Schluessel wuerden nie wieder treffen -- lieber verwerfen.
const SELECTION_KEY = 'location-optimizer:poi-selection:v2';
const VIEWPORT_KEY = 'location-optimizer:viewport:v1';

/**
 * Notbremse gegen einen Ausreißer. Seit im Browser keine Geometrie mehr liegt,
 * wiegt ein Stand wenige Kilobyte statt hundertfünfzig -- erreichbar ist die
 * Grenze praktisch nicht mehr.
 */
const MAX_BYTES = 3_000_000;

const coordinateSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

/** Bewusst flach: die Koordinatenringe werden nicht Punkt fuer Punkt geprueft. */
const areaFeatureSchema = z.object({
  type: z.literal('Feature'),
  properties: z.unknown().optional(),
  geometry: z.object({
    type: z.enum(['Polygon', 'MultiPolygon']),
    coordinates: z.array(z.unknown()),
  }),
});

const persistedTargetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  address: z.string(),
  maxTravelTimeMinutes: z.number().int().positive(),
  // Vor dem Verkehrsmittel-Schalter gespeicherte Ziele kennen das Feld nicht --
  // sie waren alle mit dem Auto unterwegs.
  travelMode: z.enum(TRAVEL_MODES).default('driving'),
  // Aeltere Staende kennen das Feld nicht -- die waren alle sichtbar.
  visible: z.boolean().default(true),
  color: z.string(),
  coordinate: coordinateSchema.nullable(),
  resolvedLabel: z.string().nullable(),
});

// Aus der gemeinsamen Liste, nicht abgeschrieben: Eine hier vergessene
// Kategorie liesse den gespeicherten Stand beim Laden still durchfallen.
const categorySchema = z.enum(POI_CATEGORIES);

const persistedConditionSchema = z.object({
  category: categorySchema,
  // Vor dem Verkehrsmittel-Schalter gespeicherte Bedingungen kennen das Feld
  // nicht -- Schritt 3 rechnete damals ausnahmslos mit dem Auto.
  travelMode: z.enum(TRAVEL_MODES).default('driving'),
  minutes: z.number().int().positive(),
  open: z.boolean(),
  sortMode: z.enum(['relevance', 'distance']),
  /**
   * Ob hier schon einmal gesucht wurde. Die Trefferliste selbst wandert nicht
   * mit: Sie kommt beim Start aus dem Overpass-Cache des Backends und ist damit
   * höchstens einen Tag alt statt beliebig alt.
   */
  searched: z.boolean().optional(),
  /** Alter Stand, in dem die Liste noch im Browser lag. Nur zum Ableiten. */
  pois: z.array(z.unknown()).optional(),
});

/**
 * Schritt 3 überlebt den Reload -- als Auftrag, nicht als Ergebnis. `applied`
 * heißt "die verengte Region war berechnet, stell sie wieder her". Das
 * Nachrechnen kostet dank Plattencache kein Providerkontingent mehr, und die
 * Fläche passt danach garantiert zur aktuellen Auswahl.
 */
const persistedPoiStateSchema = z.object({
  conditions: z.array(persistedConditionSchema),
  applied: z.boolean().optional(),
  /** Alter Stand, in dem die Fläche selbst im Browser lag. Nur zum Ableiten. */
  region: areaFeatureSchema.nullable().optional(),
});

/**
 * Nur die geprüften Orte, nicht ihr Urteil: Ob einer in der Region liegt, hängt
 * von der aktuellen Region ab und wird beim Laden neu bestimmt.
 */
const checkedLocationSchema = z.object({
  label: z.string(),
  coordinate: coordinateSchema,
});

const checkedPlaceSchema = checkedLocationSchema.extend({
  id: z.string().min(1),
  open: z.boolean(),
});

const persistedStateSchema = z.object({
  version: z.literal(1),
  colorCursor: z.number().int().min(0),
  targets: z.array(persistedTargetSchema),
  /**
   * Nur die Notiz, dass analysiert war -- das Ergebnis wird beim Start neu
   * berechnet. Das ist reine Geometrie auf zwischengespeicherten Isochronen und
   * damit schnell und kostenlos.
   */
  analysisWasDone: z.boolean().optional(),
  /** Alter Stand mit eingebettetem Ergebnis. Nur zum Ableiten. */
  analysis: z.unknown().optional(),
  // Optional, damit ein vor dieser Erweiterung gespeicherter Stand weiterhin
  // laedt, statt beim Start verworfen zu werden.
  pois: persistedPoiStateSchema.nullable().optional(),
  checkedPlaces: z.array(checkedPlaceSchema).optional(),
  /** Stand von vor der Liste: genau ein Ort. Wird zur ersten Kachel. */
  checkedLocation: checkedLocationSchema.nullable().optional(),
});

export type PersistedPoiCondition = {
  category: PoiCategory;
  travelMode: TravelMode;
  minutes: number;
  open: boolean;
  sortMode: 'relevance' | 'distance';
  searched: boolean;
};

export type PersistedPoiState = {
  conditions: PersistedPoiCondition[];
  applied: boolean;
};

export type CheckedLocation = { label: string; coordinate: Coordinate };

export type RestoredState = {
  /** Immer ohne Geometrie -- die wird beim Start nachgeladen. */
  targets: Target[];
  colorCursor: number;
  analysisWasDone: boolean;
  pois: PersistedPoiState | null;
  checkedPlaces: CheckedPlace[];
};

export type PersistableState = {
  targets: Target[];
  colorCursor: number;
  analysisWasDone: boolean;
  pois: PersistedPoiState | null;
  /** Optional, damit Aufrufer ohne geprüfte Orte nichts mitschleppen müssen. */
  checkedPlaces?: CheckedPlace[];
};

const toPersistedTarget = (target: Target) => ({
  id: target.id,
  name: target.name,
  address: target.address,
  maxTravelTimeMinutes: target.maxTravelTimeMinutes,
  travelMode: target.travelMode,
  color: target.color,
  visible: target.visible,
  coordinate: target.coordinate,
  resolvedLabel: target.resolvedLabel,
});

const serialize = (state: PersistableState): string =>
  JSON.stringify({
    version: 1,
    colorCursor: state.colorCursor,
    targets: state.targets.map(toPersistedTarget),
    analysisWasDone: state.analysisWasDone,
    pois: state.pois,
    checkedPlaces: state.checkedPlaces ?? [],
  });

/**
 * Sichert den Eingabestand im Browser, damit ein Reload nicht alle Ziele
 * verwirft. Rein lokal -- kein Backend, keine Datenbank.
 */
export const saveState = (state: PersistableState): void => {
  try {
    const payload = serialize(state);

    // Nichts mehr, was sich sinnvoll opfern ließe -- der Stand besteht nur noch
    // aus Eingaben. Lieber den alten Stand behalten als einen halben schreiben.
    if (payload.length > MAX_BYTES) return;

    localStorage.setItem(STORAGE_KEY, payload);
  } catch {
    // Privater Modus oder Speicher voll: Persistenz ist optional, nie fatal.
  }
};

/**
 * Die POI-Auswahl lebt getrennt vom übrigen Zustand: Sie soll auch dann
 * erhalten bleiben, wenn alle Ziele gelöscht und neue gesetzt werden -- die
 * Entscheidung "McFit ja, Yogastudio nein" gilt ortsunabhängig.
 */
export const loadPoiSelection = (): string[] => {
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
};

export const savePoiSelection = (keys: string[]): void => {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify(keys));
  } catch {
    // bewusst ignoriert
  }
};

/**
 * Der Kartenausschnitt. Er liegt hier richtig: Wohin jemand geschaut hat, ist
 * eine *Eingabe* wie eine Reisezeit, kein gerechnetes Ergebnis -- und anders
 * als eine Geometrie altert eine Koordinate nicht. Ohne ihn faellt die Karte
 * bei jedem Reload auf die Deutschlanduebersicht zurueck, im Dev-Betrieb also
 * bei jedem Dateispeichern.
 *
 * Getrennt vom uebrigen Stand, weil er im Sekundentakt geschrieben wird
 * (jedes Ende einer Kartenbewegung) und nicht den ganzen Zustand mitschleppen
 * soll.
 */
export type Viewport = {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
};

const viewportSchema = z.object({
  center: z.tuple([z.number().finite(), z.number().finite()]),
  zoom: z.number().finite(),
  bearing: z.number().finite(),
  pitch: z.number().finite(),
});

export const saveViewport = (viewport: Viewport): void => {
  try {
    localStorage.setItem(VIEWPORT_KEY, JSON.stringify(viewport));
  } catch {
    // bewusst ignoriert
  }
};

export const loadViewport = (): Viewport | null => {
  try {
    const raw = localStorage.getItem(VIEWPORT_KEY);
    if (raw === null) return null;
    const result = viewportSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    // Kaputter Stand ist kein Grund, ohne Karte zu starten.
    return null;
  }
};

export const clearState = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // bewusst ignoriert
  }
};

/**
 * Liest den gespeicherten Stand. Ungueltige oder veraltete Daten werden
 * verworfen, statt die App beim Start scheitern zu lassen.
 */
export const loadState = (): RestoredState | null => {
  let raw: string | null;

  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }

  if (raw === null) return null;

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    clearState();
    return null;
  }

  const result = persistedStateSchema.safeParse(parsed);

  if (!result.success) {
    clearState();
    return null;
  }

  const targets: Target[] = result.data.targets.map((target) => ({
    ...target,
    isochrone: null,
    bounds: null,
    // Jedes Ziel startet ohne Geometrie und holt sie sich beim Start neu.
    status: 'loading',
    error: null,
  }));

  const stored = result.data.pois ?? null;

  return {
    targets,
    colorCursor: result.data.colorCursor,
    // Ein alter Stand trug das Ergebnis selbst; seine bloße Anwesenheit ist die
    // Notiz "war analysiert".
    analysisWasDone: result.data.analysisWasDone ?? result.data.analysis != null,
    pois:
      stored === null
        ? null
        : {
            conditions: stored.conditions.map((condition) => ({
              category: condition.category,
              travelMode: condition.travelMode,
              minutes: condition.minutes,
              open: condition.open,
              sortMode: condition.sortMode,
              searched: condition.searched ?? (condition.pois?.length ?? 0) > 0,
            })),
            applied: stored.applied ?? stored.region != null,
          },
    // Ein Stand von vor der Liste trug genau einen Ort; der wird zur ersten
    // Kachel, statt still verloren zu gehen.
    checkedPlaces:
      result.data.checkedPlaces ??
      (result.data.checkedLocation == null
        ? []
        : [
            {
              id: 'place-restored',
              label: result.data.checkedLocation.label,
              coordinate: result.data.checkedLocation.coordinate,
              open: true,
            },
          ]),
  };
};
