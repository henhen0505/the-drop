import { z } from 'zod';
import { USER_EVENT_STATES } from '@the-drop/types';

const userEventStateEnum = z.enum(USER_EVENT_STATES);

export const setEventStateSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    state: userEventStateEnum,
  }),
};

export const removeEventStateSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
};

export const myRavesSchema = {
  query: z.object({
    state: z
      .string()
      .optional()
      .transform((raw) => (raw ? raw.split(',').map((part) => part.trim()) : undefined))
      .pipe(z.array(userEventStateEnum).min(1).optional()),
    upcoming: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  }),
};

export type MyRavesQuery = z.infer<typeof myRavesSchema.query>;
