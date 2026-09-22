import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config/index';
import { requestLogger } from './middleware/request-logger';
import { unauthenticatedRateLimit } from './middleware/rate-limit';
import { errorHandler } from './middleware/error-handler';
import { authRouter } from './modules/auth/auth.router';
import { userRouter } from './modules/users/user.router';
import { artistRouter } from './modules/artists/artist.router';
import { venueRouter } from './modules/venues/venue.router';
import { eventRouter } from './modules/events/event.router';
import { genreRouter } from './modules/genres/genre.router';
import { searchRouter } from './modules/search/search.router';
import { recommendationRouter } from './modules/recommendations/recommendation.router';
import { submissionRouter } from './modules/submissions/submission.router';
import { notificationRouter } from './modules/notifications/notification.router';
import { adminEventRouter } from './modules/admin/admin-event.router';
import { submissionReviewRouter } from './modules/admin/submission-review.router';
import { dedupRouter } from './modules/admin/dedup.router';
import { syncRouter } from './modules/admin/sync.router';

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors(config.frontendUrl ? { origin: config.frontendUrl, credentials: true } : undefined));
  app.use(express.json());
  app.use(cookieParser());
  app.use(requestLogger);
  app.use(unauthenticatedRateLimit);

  app.get('/api/v1/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/users', userRouter);
  app.use('/api/v1/artists', artistRouter);
  app.use('/api/v1/venues', venueRouter);
  app.use('/api/v1/events', eventRouter);
  app.use('/api/v1/genres', genreRouter);
  app.use('/api/v1/search', searchRouter);
  app.use('/api/v1/recommendations', recommendationRouter);
  app.use('/api/v1/submissions', submissionRouter);
  app.use('/api/v1/notifications', notificationRouter);
  app.use('/api/v1/admin/events', adminEventRouter);
  app.use('/api/v1/admin/submissions', submissionReviewRouter);
  app.use('/api/v1/admin/dedup', dedupRouter);
  // Mounted after the more specific /admin/* prefixes above so Express's registration-order matching
  // doesn't let this broader /admin prefix shadow them.
  app.use('/api/v1/admin', syncRouter);

  // Must be registered last: Express only treats a 4-arg middleware as
  // an error handler.
  app.use(errorHandler);

  return app;
}
