import { DomainError } from '../../domain/models/errors.js';

export const ORS_BASE_URL = 'https://api.openrouteservice.org';

/**
 * Mappt Transport- und HTTP-Fehler von OpenRouteService auf Domain-Fehler.
 * Provider-spezifische Formate verlassen diese Schicht nicht (Spec 6.1).
 */
export const orsFetch = async (
  url: string,
  init: RequestInit,
  apiKey: string,
): Promise<unknown> => {
  let response: Response;

  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json, application/geo+json',
        Authorization: apiKey,
        ...(init.headers ?? {}),
      },
    });
  } catch (cause) {
    throw new DomainError(
      'PROVIDER_UNAVAILABLE',
      'Die Berechnung konnte momentan nicht durchgeführt werden. Bitte versuche es erneut.',
      cause instanceof Error ? cause.message : undefined,
    );
  }

  if (response.status === 429) {
    throw new DomainError(
      'PROVIDER_RATE_LIMITED',
      'Das Anfragelimit des Kartendienstes ist erreicht. Bitte versuche es später erneut.',
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new DomainError(
      'CONFIGURATION_ERROR',
      'Der API-Key für OpenRouteService wurde abgelehnt.',
      'Prüfe OPENROUTESERVICE_API_KEY in deiner .env.',
    );
  }

  if (!response.ok) {
    throw new DomainError(
      'PROVIDER_UNAVAILABLE',
      'Die Berechnung konnte momentan nicht durchgeführt werden. Bitte versuche es erneut.',
      `HTTP ${response.status}`,
    );
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new DomainError(
      'PROVIDER_UNAVAILABLE',
      'Die Antwort des Kartendienstes war unlesbar. Bitte versuche es erneut.',
    );
  }
};
