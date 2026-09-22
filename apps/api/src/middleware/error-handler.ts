import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { config } from '../config/index';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Global Express error handler. Formats every error into the standard
 * envelope from architecture/api-contracts.md:
 *   { error: { code, message, details? } }
 * Must be registered last, after all routes.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
): void {
  if (err instanceof AppError) {
    const body: ErrorEnvelope = {
      error: { code: err.code, message: err.message, details: err.details },
    };
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof ZodError) {
    const body: ErrorEnvelope = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.issues,
      },
    };
    res.status(400).json(body);
    return;
  }

  // Unexpected error: log full detail server-side, never leak internals
  // to the client.
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');

  const body: ErrorEnvelope = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: config.isProduction ? undefined : String(err),
    },
  };
  res.status(500).json(body);
}
