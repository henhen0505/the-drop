import type { RequestHandler } from 'express';
import type { UserRole } from '@the-drop/types';
import { UnauthorizedError } from '../utils/errors';
import { verifyAccessToken } from '../modules/auth/auth.service';

// Augment Express Request type. Express's own types are declared as a
// namespace, so augmenting them requires matching that shape -- there is
// no ES module equivalent for this kind of ambient declaration merging.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: UserRole;
      };
    }
  }
}

/**
 * Requires a valid `Authorization: Bearer <accessToken>` header. Populates
 * req.user from the token's claims for downstream handlers/requireRole.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or invalid Authorization header');
  }

  const token = header.slice(7);

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
};

/**
 * Populates req.user when a valid `Authorization: Bearer` header is present,
 * but never rejects the request -- unlike requireAuth, a missing or invalid
 * token simply proceeds as anonymous (req.user left undefined). For routes
 * that behave differently for logged-in vs. anonymous users without
 * requiring login.
 */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }

  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
  } catch {
    // Invalid token in optional auth -- proceed as anonymous
  }
  next();
};
