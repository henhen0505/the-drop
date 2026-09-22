import pino from 'pino';
import { config } from '../config/index';

/**
 * Structured logger shared across the API. In development, output is
 * pretty-printed for readability; in production/test it stays as plain
 * JSON lines so it can be shipped to log aggregation without a transform.
 */
export const logger = pino({
  level: config.isTest ? 'silent' : config.isProduction ? 'info' : 'debug',
  transport: config.isProduction
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
});
