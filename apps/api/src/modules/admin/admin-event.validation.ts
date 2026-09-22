import { z } from 'zod';
import { EVENT_STATUSES } from '@the-drop/types';
import { httpUrl } from '../../utils/http-url';

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const text = (max: number) => z.string().trim().min(1).max(max);
const isoDateTime = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));
const timezone = z.string().refine(isValidTimeZone, { message: 'Unknown IANA time zone' });
const doorTime = z.string().regex(TIME_OF_DAY, 'Use HH:MM or HH:MM:SS');
const idList = (max: number) =>
  z
    .array(z.string().uuid())
    .max(max)
    .transform((ids) => [...new Set(ids)]);

const nullable = <T extends z.ZodTypeAny>(schema: T) => schema.nullable().optional();

export const listAdminEventsSchema = {
  query: z.object({
    q: text(100).optional(),
    status: z.enum(EVENT_STATUSES).optional(),
    // Not z.coerce.boolean(): Boolean("false") is true in JS, which would silently invert this filter.
    stale: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  }),
};

export type ListAdminEventsQuery = z.infer<typeof listAdminEventsSchema.query>;

export const createAdminEventSchema = {
  body: z
    .object({
      title: text(200),
      startsAt: isoDateTime,
      endsAt: isoDateTime.optional(),
      timezone: timezone.optional(),
      venueId: z.string().uuid().optional(),
      artistIds: idList(50).default([]),
      genreIds: idList(20).default([]),
      description: text(10000).optional(),
      imageUrl: httpUrl.optional(),
      ageRestriction: text(20).optional(),
      doorTime: doorTime.optional(),
      reentryPolicy: text(2000).optional(),
      bagPolicy: text(2000).optional(),
      prohibitedItems: text(2000).optional(),
      dressCode: text(2000).optional(),
      status: z.enum(['DRAFT', 'PUBLISHED']).default('PUBLISHED'),
    })
    .refine((body) => body.endsAt === undefined || body.endsAt > body.startsAt, {
      message: 'endsAt must be after startsAt',
      path: ['endsAt'],
    }),
};

export type CreateAdminEventInput = z.infer<typeof createAdminEventSchema.body>;

export const updateAdminEventSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z
    .object({
      title: text(200).optional(),
      startsAt: isoDateTime.optional(),
      endsAt: nullable(isoDateTime),
      timezone: timezone.optional(),
      venueId: nullable(z.string().uuid()),
      artistIds: idList(50).optional(),
      genreIds: idList(20).optional(),
      description: nullable(text(10000)),
      imageUrl: nullable(httpUrl),
      ageRestriction: nullable(text(20)),
      doorTime: nullable(doorTime),
      reentryPolicy: nullable(text(2000)),
      bagPolicy: nullable(text(2000)),
      prohibitedItems: nullable(text(2000)),
      dressCode: nullable(text(2000)),
      status: z.enum(EVENT_STATUSES).optional(),
    })
    .refine((body) => Object.values(body).some((value) => value !== undefined), {
      message: 'Provide at least one field to update',
    })
    .refine((body) => !(body.startsAt && body.endsAt && body.endsAt <= body.startsAt), {
      message: 'endsAt must be after startsAt',
      path: ['endsAt'],
    }),
};

export type UpdateAdminEventInput = z.infer<typeof updateAdminEventSchema.body>;

export const deleteAdminEventSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

export const MERGEABLE_EVENT_FIELDS = [
  'title',
  'description',
  'imageUrl',
  'startsAt',
  'endsAt',
  'venueId',
  'ageRestriction',
  'doorTime',
  'reentryPolicy',
  'bagPolicy',
  'prohibitedItems',
  'dressCode',
] as const;

export type MergeableEventField = (typeof MERGEABLE_EVENT_FIELDS)[number];

export const mergeEventsSchema = {
  body: z
    .object({
      keepEventId: z.string().uuid(),
      mergeEventId: z.string().uuid(),
      // Everything defaults to "keep"; "merge" takes that field's value from the event being merged in.
      fieldOverrides: z
        .record(z.enum(MERGEABLE_EVENT_FIELDS), z.enum(['keep', 'merge']))
        .optional(),
    })
    .refine((body) => body.keepEventId !== body.mergeEventId, {
      message: 'Cannot merge an event into itself',
      path: ['mergeEventId'],
    }),
};

export type MergeEventsInput = z.infer<typeof mergeEventsSchema.body>;
