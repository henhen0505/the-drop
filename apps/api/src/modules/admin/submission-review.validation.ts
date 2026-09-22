import { z } from 'zod';
import { SUBMISSION_STATUSES } from '@the-drop/types';

export const listSubmissionsSchema = {
  query: z.object({
    status: z.enum(SUBMISSION_STATUSES).default('PENDING'),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  }),
};

export type ListSubmissionsQuery = z.infer<typeof listSubmissionsSchema.query>;

export const reviewSubmissionSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z
    .object({
      status: z.enum(['APPROVED', 'REJECTED', 'MERGED']),
      reviewNotes: z.string().trim().max(2000).optional(),
      mergedEventId: z.string().uuid().optional(),
    })
    .refine((body) => body.status !== 'MERGED' || body.mergedEventId !== undefined, {
      message: 'mergedEventId is required when status is MERGED',
      path: ['mergedEventId'],
    })
    .refine((body) => body.status === 'MERGED' || body.mergedEventId === undefined, {
      message: 'mergedEventId is only allowed when status is MERGED',
      path: ['mergedEventId'],
    }),
};

export type ReviewSubmissionInput = z.infer<typeof reviewSubmissionSchema.body>;
