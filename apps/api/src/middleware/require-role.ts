import type { RequestHandler } from 'express';
import type { UserRole } from '@the-drop/types';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

/**
 * Restricts a route to the given role(s). Must run after requireAuth so
 * req.user is populated.
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw new UnauthorizedError();
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(`Required role: ${roles.join(' or ')}`);
    }
    next();
  };
}
