import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { validate } from '../../../src/middleware/validate';

function makeReq(overrides: Partial<Request>): Request {
  return overrides as Request;
}

describe('validate middleware', () => {
  it('replaces req.body with the parsed/coerced result and calls next', () => {
    const middleware = validate({ body: z.object({ email: z.string().email() }) });
    const req = makeReq({ body: { email: 'user@example.com' } });
    const next = vi.fn();

    middleware(req, {} as Response, next);

    expect(req.body).toEqual({ email: 'user@example.com' });
    expect(next).toHaveBeenCalledOnce();
  });

  it('throws ZodError on an invalid body instead of calling next', () => {
    const middleware = validate({ body: z.object({ email: z.string().email() }) });
    const req = makeReq({ body: { email: 'not-an-email' } });
    const next = vi.fn();

    expect(() => middleware(req, {} as Response, next)).toThrow();
    expect(next).not.toHaveBeenCalled();
  });

  it('validates params and query independently of body', () => {
    const middleware = validate({ params: z.object({ id: z.string().uuid() }) });
    const req = makeReq({ params: { id: 'not-a-uuid' } });

    expect(() => middleware(req, {} as Response, vi.fn())).toThrow();
  });
});
