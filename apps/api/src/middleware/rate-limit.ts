import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

/**
 * Rate limiting per architecture/decisions.md #5:
 *   - Authenticated: 100 req/min per user
 *   - Unauthenticated: 20 req/min per IP
 */
function rateLimitHandler(_req: Request, res: Response): void {
  res.status(429).json({
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests, please try again later',
    },
  });
}

export const unauthenticatedRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: false,
  legacyHeaders: true, // emits X-RateLimit-Limit/Remaining/Reset per api-contracts.md
  handler: rateLimitHandler,
});

export const authenticatedRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  keyGenerator: (req: Request) => req.user?.id ?? req.ip ?? 'unknown',
  standardHeaders: false,
  legacyHeaders: true,
  handler: rateLimitHandler,
});
