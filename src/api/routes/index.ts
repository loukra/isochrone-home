import { Router } from 'express';
import type { Container } from '../../infrastructure/configuration/container.js';
import {
  analyzeRequestSchema,
  geocodeRequestSchema,
  isochroneRequestSchema,
  locationCheckRequestSchema,
  poiRegionRequestSchema,
  poiSearchRequestSchema,
  travelTimesRequestSchema,
} from '../schemas.js';
import { containsPoint } from '../../domain/services/geometry.js';
import type { AreaFeature } from '../../domain/models/geo.js';

/**
 * Transportschicht: validieren, an die Application delegieren, Ergebnis
 * durchreichen. Keine fachliche Logik, keine Provider-Details.
 */
export const createApiRouter = (container: Container): Router => {
  const router = Router();

  router.get('/config', (_request, response) => {
    // Nur öffentliche Werte -- niemals API-Keys.
    response.json({
      mapStyleUrl: container.config.mapStyleUrl,
      analysisStrategy: container.strategy.id,
      maxTravelTimeMinutes: container.isochrones.maxTravelTimeMinutes,
    });
  });

  // Schritt 1a: Adresse bestätigen.
  router.post('/geocode', async (request, response) => {
    const { query, limit } = geocodeRequestSchema.parse(request.body);
    const candidates = await container.geocoding.search(query, limit);
    response.json({ candidates });
  });

  // Prüft nur gegen bereits berechnete Backend-Geometrien, ohne Provider-Aufruf.
  router.post('/locations/check', (request, response) => {
    const { coordinates, intersection, poiRegion } = locationCheckRequestSchema.parse(
      request.body,
    );
    const inArea = (
      coordinate: (typeof coordinates)[number],
      area: typeof intersection,
    ): boolean | null =>
      area === null ? null : containsPoint(coordinate, area as AreaFeature);

    response.json({
      results: coordinates.map((coordinate) => ({
        inIntersection: inArea(coordinate, intersection),
        inPoiRegion: inArea(coordinate, poiRegion),
      })),
    });
  });

  /**
   * Fahrzeit und Strecke vom geprüften Ort zu den Zielen.
   *
   * Bewusst eine eigene Route neben /locations/check: Die Prüfung "liegt der
   * Ort in der Region" ist reine Geometrie und darf nie daran scheitern, dass
   * der Kartendienst gerade klemmt. Fällt die Messung aus, bleibt das Urteil
   * trotzdem stehen.
   */
  router.post('/locations/travel-times', async (request, response) => {
    const parsed = travelTimesRequestSchema.parse(request.body);
    response.json(await container.travelTimes.execute(parsed));
  });

  // Schritt 1b: Isochrone genau eines bestätigten Ziels.
  router.post('/isochrone', async (request, response) => {
    const constraint = isochroneRequestSchema.parse(request.body);
    const result = await container.isochroneQuery.execute(constraint);
    response.json(result);
  });

  // POI-Suche: sucht bewusst ueber die Region hinaus (siehe PoiSearch).
  router.post('/pois', async (request, response) => {
    const parsed = poiSearchRequestSchema.parse(request.body);
    response.json(await container.poiSearch.execute(parsed));
  });

  // Schritt 3: gemeinsame Region auf die gewaehlten Orte verengen.
  router.post('/pois/region', async (request, response) => {
    const parsed = poiRegionRequestSchema.parse(request.body);
    response.json(await container.poiRegion.execute(parsed));
  });

  // Schritt 2: Schnittmenge aller Ziele.
  router.post('/analyze', async (request, response) => {
    const analysisRequest = analyzeRequestSchema.parse(request.body);
    const result = await container.strategy.analyze(analysisRequest);
    response.json(result);
  });

  return router;
};
