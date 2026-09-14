import { z } from 'zod';
import {
  DEFAULT_TRAVEL_MODE,
  MAX_TRAVEL_TIME_MINUTES,
  MIN_TRAVEL_TIME_MINUTES,
  TRAVEL_MODES,
} from '../domain/models/analysis.js';
import { POI_CATEGORIES } from '../domain/models/poi.js';

const coordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const constraintSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Jedes Ziel braucht einen Namen.'),
  address: z.string().min(1, 'Bitte gib einen Ort oder eine Adresse ein.'),
  travelMode: z.enum(TRAVEL_MODES).default(DEFAULT_TRAVEL_MODE),
  maxTravelTimeMinutes: z
    .number()
    .int()
    .min(MIN_TRAVEL_TIME_MINUTES)
    .max(MAX_TRAVEL_TIME_MINUTES),
  coordinate: coordinateSchema.optional(),
});

export const analyzeRequestSchema = z.object({
  constraints: z
    .array(constraintSchema)
    .min(1, 'Mindestens ein Ziel muss vorhanden sein.'),
});

export const isochroneRequestSchema = constraintSchema;

export const poiSearchRequestSchema = z.object({
  constraints: z.array(constraintSchema).min(1),
  category: z.enum(POI_CATEGORIES),
  // Voreingestellt wie bei den Zielen: Ein vor dem Schalter gespeicherter
  // Stand meinte das Auto, und eine fehlende Angabe darf den Aufruf nicht
  // scheitern lassen.
  travelMode: z.enum(TRAVEL_MODES).default(DEFAULT_TRAVEL_MODE),
  maxTravelTimeMinutes: z.number().int().min(1).max(60),
});

/**
 * Jeder gewählte Ort kostet einen Isochronen-Call -- über alle Bedingungen
 * zusammen. Die Obergrenze schützt das Tageskontingent des Providers vor einem
 * versehentlichen "alle anhaken".
 */
const MAX_ORIGINS = 25;

export const poiRegionRequestSchema = z
  .object({
    constraints: z.array(constraintSchema).min(1),
    conditions: z
      .array(
        z.object({
          category: z.enum(POI_CATEGORIES),
          travelMode: z.enum(TRAVEL_MODES).default(DEFAULT_TRAVEL_MODE),
          maxTravelTimeMinutes: z
            .number()
            .int()
            .min(MIN_TRAVEL_TIME_MINUTES)
            .max(MAX_TRAVEL_TIME_MINUTES),
          origins: z.array(coordinateSchema),
        }),
      )
      .min(1, 'Wähle mindestens einen Ort aus.'),
  })
  .refine(
    (value) =>
      value.conditions.reduce((sum, condition) => sum + condition.origins.length, 0) <=
      MAX_ORIGINS,
    {
      message: `Höchstens ${MAX_ORIGINS} Orte auf einmal — sonst wird das Kontingent knapp.`,
    },
  );

export const geocodeRequestSchema = z.object({
  query: z.string().min(1, 'Bitte gib einen Ort oder eine Adresse ein.'),
  limit: z.number().int().min(1).max(10).optional(),
  /**
   * Das Land, in dem die App gerade benutzt wird (ISO 3166-1 alpha-2, aus der
   * Region des Browsers). Es entscheidet nur, ob der Ländername in der
   * Bezeichnung steht -- die Suche schränkt es **nicht** ein.
   *
   * Optional, weil die Region nicht immer feststellbar ist. Fehlt sie, wird
   * das Land genannt: eine Zeile zu lang ist besser als eine, die ein Land
   * verschweigt, das sehr wohl etwas unterschieden hätte.
   */
  homeCountry: z
    .string()
    .regex(/^[A-Za-z]{2}$/, 'Erwartet wird ein Ländercode wie "DE".')
    .optional(),
});

/**
 * Bereits vom Backend gelieferte Flächen dürfen zur reinen Punktprüfung
 * zurückgesendet werden. Die Geometrie wird dabei nicht verändert.
 */
const positionSchema = z.array(z.number()).min(2);
const ringSchema = z.array(positionSchema).min(4);
const areaGeometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(ringSchema).min(1) }),
  z.object({
    type: z.literal('MultiPolygon'),
    coordinates: z.array(z.array(ringSchema).min(1)).min(1),
  }),
]);

const areaFeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: areaGeometrySchema,
});

/**
 * Mehr Ziele zeigt die Seitenleiste ohnehin nicht sinnvoll an, und die
 * Matrix-API hat je Profil eine Obergrenze an Punkten.
 */
const MAX_MEASURED_TARGETS = 25;

/**
 * Die Ziele kommen hier bereits aufgelöst an: Gemessen wird nur zu Zielen, für
 * die schon eine Isochrone berechnet wurde. Ein erneutes Geocoding wäre ein
 * unnötiger Provider-Aufruf (Spec 10).
 */
export const travelTimesRequestSchema = z.object({
  origin: coordinateSchema,
  targets: z
    .array(
      z.object({
        id: z.string().min(1),
        coordinate: coordinateSchema,
        travelMode: z.enum(TRAVEL_MODES).default(DEFAULT_TRAVEL_MODE),
      }),
    )
    .max(MAX_MEASURED_TARGETS),
});

/** Eine Punkt-in-Fläche-Prüfung kostet nichts; die Grenze schützt nur den Rumpf. */
const MAX_CHECKED_PLACES = 50;

/**
 * Mehrere Orte in *einem* Aufruf: Die Flächen liegen im Rumpf, und sie je Ort
 * erneut zu schicken wäre bei fünf geprüften Adressen fünfmal dieselbe
 * Geometrie. Die Antwort kommt in der Reihenfolge der Anfrage.
 */
export const locationCheckRequestSchema = z.object({
  coordinates: z.array(coordinateSchema).max(MAX_CHECKED_PLACES),
  intersection: areaFeatureSchema.nullable(),
  poiRegion: areaFeatureSchema.nullable(),
});
