import { z } from 'zod';

export const triggerSyncSchema = {
  body: z.object({
    sourceType: z.literal('TICKETMASTER'),
  }),
};
