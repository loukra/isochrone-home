import { Router } from 'express';
import type { Container } from '../../infrastructure/configuration/container.js';
import {
  analyzeRequestSchema,
  geocodeRequestSchema,
  isochroneRequestSchema,
  poiSearchRequestSchema,
} from '../schemas.js';

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

  // Schritt 2: Schnittmenge aller Ziele.
  router.post('/analyze', async (request, response) => {
    const analysisRequest = analyzeRequestSchema.parse(request.body);
    const result = await container.strategy.analyze(analysisRequest);
    response.json(result);
  });

  return router;
};
