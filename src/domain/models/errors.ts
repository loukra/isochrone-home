export type DomainErrorCode =
  | 'INVALID_INPUT'
  | 'ADDRESS_NOT_FOUND'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_RATE_LIMITED'
  | 'CONFIGURATION_ERROR';

/**
 * Fachlicher Fehler. Provider-spezifische Fehler werden in den Adaptern
 * hierauf gemappt, damit nichts Provider-Eigenes nach aussen leakt (Spec 6.1).
 */
export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: string;

  constructor(code: DomainErrorCode, message: string, details?: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

export const isDomainError = (error: unknown): error is DomainError =>
  error instanceof DomainError;
