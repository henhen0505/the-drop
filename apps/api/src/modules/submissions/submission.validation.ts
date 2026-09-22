import { z } from 'zod';
import { SUBMISSION_STATUSES } from '@the-drop/types';
import { httpUrl } from '../../utils/http-url';

const requiredText = (max: number) => z.string().trim().min(1).max(max);

export const createSubmissionSchema = {
  body: z
    .object({
      eventTitle: requiredText(200),
      // ISO 8601 with an explicit offset, per api-contracts.md, so the submitter's local time is unambiguous.
      eventStartsAt: z
        .string()
        .datetime({ offset: true })
        .transform((value) => new Date(value))
        .refine((date) => date.getTime() > Date.now(), { message: 'eventStartsAt must be in the future' }),
      venueId: z.string().uuid().optional(),
      venueNameRaw: requiredText(200).optional(),
      venueAddressRaw: requiredText(300).optional(),
      artistNames: z.array(requiredText(100)).max(30).default([]),
      description: requiredText(5000).optional(),
      posterImageUrl: httpUrl.optional(),
      ticketUrl: httpUrl.optional(),
      sourceUrl: httpUrl.optional(),
      ageRestriction: requiredText(20).optional(),
    })
    .refine((body) => body.venueId !== undefined || body.venueNameRaw !== undefined, {
      message: 'Provide either venueId or venueNameRaw',
      path: ['venueId'],
    }),
};

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema.body>;

export const mySubmissionsSchema = {
  query: z.object({
    status: z.enum(SUBMISSION_STATUSES).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  }),
};

export type MySubmissionsQuery = z.infer<typeof mySubmissionsSchema.query>;
