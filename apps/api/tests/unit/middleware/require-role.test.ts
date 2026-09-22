import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { requireRole } from '../../../src/middleware/require-role';
import { ForbiddenError, UnauthorizedError } from '../../../src/utils/errors';

function makeReq(user?: Request['user']): Request {
  return { user } as Request;
}

describe('requireRole middleware', () => {
  it('throws UnauthorizedError when req.user is missing', () => {
    const middleware = requireRole('ADMIN');
    expect(() => middleware(makeReq(undefined), {} as Response, vi.fn())).toThrow(
      UnauthorizedError,
    );
  });

  it('throws ForbiddenError when the role does not match', () => {
    const middleware = requireRole('ADMIN');
    const req = makeReq({ id: 'u1', email: 'a@b.com', role: 'USER' });
    expect(() => middleware(req, {} as Response, vi.fn())).toThrow(ForbiddenError);
  });

  it('calls next when the role matches one of the allowed roles', () => {
    const middleware = requireRole('ADMIN', 'PROMOTER');
    const req = makeReq({ id: 'u1', email: 'a@b.com', role: 'PROMOTER' });
    const next = vi.fn();

    middleware(req, {} as Response, next);

    expect(next).toHaveBeenCalledOnce();
  });
});
