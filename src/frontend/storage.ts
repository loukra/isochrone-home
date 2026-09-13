import { z } from 'zod';
import type { AnalysisResponse, Target } from './types.js';

const STORAGE_KEY = 'location-optimizer:state:v1';

/**
 * Schutz gegen ein volllaufendes localStorage. Eine Isochrone wiegt rund 45 KB,
 * das Budget reicht damit fuer deutlich mehr Ziele als realistisch gesetzt
 * werden. Wird es ueberschritten, speichern wir ohne Geometrien -- die Ziele
 * bleiben erhalten und die Isochronen werden beim Laden neu geholt.
 */
const MAX_BYTES = 3_000_000;

const coordinateSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
});

const boundsSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

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
  color: z.string(),
  coordinate: coordinateSchema.nullable(),
  resolvedLabel: z.string().nullable(),
  isochrone: areaFeatureSchema.nullable(),
  bounds: boundsSchema.nullable(),
});

const persistedStateSchema = z.object({
  version: z.literal(1),
  colorCursor: z.number().int().min(0),
  targets: z.array(persistedTargetSchema),
  analysis: z
    .object({
      result: z.object({
        layers: z.array(z.unknown()),
        intersection: areaFeatureSchema.nullable(),
        targets: z.array(z.unknown()),
        bounds: boundsSchema.nullable(),
      }),
      stale: z.boolean(),
    })
    .nullable(),
});

export type RestoredState = {
  targets: Target[];
  colorCursor: number;
  analysis: { result: AnalysisResponse; stale: boolean } | null;
};

export type PersistableState = {
  targets: Target[];
  colorCursor: number;
  analysis: { result: AnalysisResponse; stale: boolean } | null;
};

const toPersistedTarget = (target: Target, withGeometry: boolean) => ({
  id: target.id,
  name: target.name,
  address: target.address,
  maxTravelTimeMinutes: target.maxTravelTimeMinutes,
  color: target.color,
  coordinate: target.coordinate,
  resolvedLabel: target.resolvedLabel,
  isochrone: withGeometry ? target.isochrone : null,
  bounds: withGeometry ? target.bounds : null,
});

const serialize = (state: PersistableState, withGeometry: boolean): string =>
  JSON.stringify({
    version: 1,
    colorCursor: state.colorCursor,
    targets: state.targets.map((target) => toPersistedTarget(target, withGeometry)),
    analysis: withGeometry ? state.analysis : null,
  });

/**
 * Sichert den Eingabestand im Browser, damit ein Reload nicht alle Ziele
 * verwirft. Rein lokal -- kein Backend, keine Datenbank.
 */
export const saveState = (state: PersistableState): void => {
  try {
    let payload = serialize(state, true);

    if (payload.length > MAX_BYTES) {
      payload = serialize(state, false);
    }

    localStorage.setItem(STORAGE_KEY, payload);
  } catch {
    // Privater Modus oder Speicher voll: Persistenz ist optional, nie fatal.
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
    isochrone: (target.isochrone ?? null) as Target['isochrone'],
    // Ohne Geometrie muss die Isochrone neu geholt werden.
    status: target.isochrone !== null ? 'ready' : 'loading',
    error: null,
  }));

  return {
    targets,
    colorCursor: result.data.colorCursor,
    analysis: result.data.analysis as RestoredState['analysis'],
  };
};
