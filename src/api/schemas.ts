import { z } from 'zod';
import {
  MAX_TRAVEL_TIME_MINUTES,
  MIN_TRAVEL_TIME_MINUTES,
} from '../domain/models/analysis.js';

const coordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const constraintSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Jedes Ziel braucht einen Namen.'),
  address: z.string().min(1, 'Bitte gib einen Ort oder eine Adresse ein.'),
  travelMode: z.enum(['driving']).default('driving'),
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

export const geocodeRequestSchema = z.object({
  query: z.string().min(1, 'Bitte gib einen Ort oder eine Adresse ein.'),
  limit: z.number().int().min(1).max(10).optional(),
});
