import { z } from 'zod';

export const ingestBySpotifyIdSchema = {
  params: z.object({
    spotifyId: z.string().min(1),
  }),
};

export const searchAndIngestSchema = {
  body: z.object({
    query: z.string().min(1).max(200),
  }),
};
