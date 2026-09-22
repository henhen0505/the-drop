import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';

interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Zod validation middleware factory. Parses/coerces the request against
 * the given schemas and replaces req.body/query/params with the validated
 * result. Throws ZodError on failure, which error-handler.ts formats as a
 * 400 VALIDATION_ERROR.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    if (schemas.body) req.body = schemas.body.parse(req.body);
    if (schemas.query) req.query = schemas.query.parse(req.query) as unknown as typeof req.query;
    if (schemas.params)
      req.params = schemas.params.parse(req.params) as unknown as typeof req.params;
    next();
  };
}
