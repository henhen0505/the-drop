import { describe, expect, it } from 'vitest';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../../src/utils/errors';

describe('custom error classes', () => {
  it('maps each error to its api-contracts.md status code and error code', () => {
    expect(new ValidationError('bad input')).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(new UnauthorizedError()).toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' });
    expect(new ForbiddenError()).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    expect(new NotFoundError()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(new ConflictError('duplicate')).toMatchObject({ statusCode: 409, code: 'CONFLICT' });
  });

  it('carries optional details through to the instance', () => {
    const err = new ValidationError('bad field', { field: 'email' });
    expect(err.details).toEqual({ field: 'email' });
  });
});
