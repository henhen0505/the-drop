/**
 * Custom error classes mapping to the standard error codes defined in
 * architecture/api-contracts.md. The global error handler
 * (middleware/error-handler.ts) inspects `instanceof AppError` to build
 * the `{ error: { code, message, details } }` envelope; anything else is
 * treated as an unexpected 500.
 */

export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';
}

export class UnauthorizedError extends AppError {
  readonly statusCode = 401;
  readonly code = 'UNAUTHORIZED';

  constructor(message = 'Authentication required', details?: unknown) {
    super(message, details);
  }
}

export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';

  constructor(message = 'You do not have permission to perform this action', details?: unknown) {
    super(message, details);
  }
}

export class NotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';

  constructor(message = 'Resource not found', details?: unknown) {
    super(message, details);
  }
}

export class ConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = 'CONFLICT';
}

export class NotImplementedError extends AppError {
  readonly statusCode = 501;
  readonly code = 'NOT_IMPLEMENTED';

  constructor(message = 'This feature is not yet available', details?: unknown) {
    super(message, details);
  }
}
