import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { DomainError, type DomainErrorCode } from '../domain/models/errors.js';

const STATUS_BY_CODE: Record<DomainErrorCode, number> = {
  INVALID_INPUT: 400,
  ADDRESS_NOT_FOUND: 404,
  PROVIDER_RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 502,
  CONFIGURATION_ERROR: 500,
};

export type ApiErrorBody = {
  error: { code: string; message: string };
};

export const errorHandler = (
  error: unknown,
  _request: Request,
  response: Response<ApiErrorBody>,
  next: NextFunction,
): void => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: 'INVALID_INPUT',
        message: error.issues[0]?.message ?? 'Die Eingabe ist ungültig.',
      },
    });
    return;
  }

  if (error instanceof DomainError) {
    // details bleiben serverseitig -- sie können Provider-Interna enthalten,
    // sind aber genau das, was man zur Diagnose braucht.
    if (error.details !== undefined) {
      console.error(`[${error.code}] ${error.message} -- ${error.details}`);
    }

    response.status(STATUS_BY_CODE[error.code]).json({
      error: { code: error.code, message: error.message },
    });
    return;
  }

  console.error('[unexpected]', error);

  response.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Es ist ein unerwarteter Fehler aufgetreten. Bitte versuche es erneut.',
    },
  });
};
