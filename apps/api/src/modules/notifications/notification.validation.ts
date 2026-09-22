import { z } from 'zod';

export const listNotificationsSchema = {
  query: z.object({
    // Not z.coerce.boolean(): Boolean("false") is true in JS, which would silently invert this filter.
    unreadOnly: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
  }),
};

export type ListNotificationsQuery = z.infer<typeof listNotificationsSchema.query>;

export const markReadSchema = {
  params: z.object({
    id: z.string().uuid(),
  }),
};
