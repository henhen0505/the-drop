import { Router } from 'express';
import * as controller from './submission.controller';
import { validate } from '../../middleware/validate';
import { requireAuth } from '../../middleware/auth';
import { requireRole } from '../../middleware/require-role';
import { authenticatedRateLimit } from '../../middleware/rate-limit';
import { createSubmissionSchema } from './submission.validation';

const router = Router();

// api-contracts.md: "Auth: required (USER or PROMOTER)". Admins create events directly instead.
router.post(
  '/',
  requireAuth,
  requireRole('USER', 'PROMOTER'),
  authenticatedRateLimit,
  validate(createSubmissionSchema),
  controller.createSubmission,
);

export { router as submissionRouter };
