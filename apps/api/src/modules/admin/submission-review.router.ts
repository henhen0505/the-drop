import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/require-role';
import { validate } from '../../middleware/validate';
import * as controller from './submission-review.controller';
import { listSubmissionsSchema, reviewSubmissionSchema } from './submission-review.validation';

export const submissionReviewRouter = Router();

submissionReviewRouter.use(requireAuth, requireRole('ADMIN'));

submissionReviewRouter.get('/', validate(listSubmissionsSchema), controller.listSubmissions);
submissionReviewRouter.patch('/:id', validate(reviewSubmissionSchema), controller.reviewSubmission);
