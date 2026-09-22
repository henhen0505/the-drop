import { pinoHttp } from 'pino-http';
import { logger } from '../utils/logger';

/**
 * Structured per-request logging (method, path, status, latency) via
 * pino-http, reusing the shared pino logger instance/level.
 */
export const requestLogger = pinoHttp({
  logger,
  autoLogging: true,
});
