import type {
  AnalysisResponse,
  GeocodingCandidate,
  SingleIsochroneResponse,
  Target,
} from './types.js';

export class ApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

const post = async <T>(path: string, body: unknown): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      'NETWORK_ERROR',
      'Der Server ist nicht erreichbar. Läuft das Backend?',
    );
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | null)
      ?.error;
    throw new ApiError(
      error?.code ?? 'INTERNAL_ERROR',
      error?.message ?? 'Es ist ein unerwarteter Fehler aufgetreten.',
    );
  }

  return payload as T;
};

const toConstraint = (target: Target) => ({
  id: target.id,
  name: target.name.trim(),
  address: target.address.trim(),
  travelMode: 'driving' as const,
  maxTravelTimeMinutes: target.maxTravelTimeMinutes,
  ...(target.coordinate !== null ? { coordinate: target.coordinate } : {}),
});

export const geocode = (query: string): Promise<{ candidates: GeocodingCandidate[] }> =>
  post('/api/geocode', { query });

export const fetchIsochrone = (target: Target): Promise<SingleIsochroneResponse> =>
  post('/api/isochrone', toConstraint(target));

export const analyze = (targets: Target[]): Promise<AnalysisResponse> =>
  post('/api/analyze', { constraints: targets.map(toConstraint) });

export type AppSettings = {
  mapStyleUrl: string;
  maxTravelTimeMinutes: number;
};

export const fetchMapConfig = async (): Promise<AppSettings> => {
  const response = await fetch('/api/config');
  if (!response.ok) throw new ApiError('CONFIG_ERROR', 'Konfiguration nicht ladbar.');
  return (await response.json()) as AppSettings;
};
