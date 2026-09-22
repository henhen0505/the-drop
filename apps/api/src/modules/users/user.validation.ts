import { z } from 'zod';
import { httpUrl } from '../../utils/http-url';

export const updateProfileSchema = {
  body: z
    .object({
      displayName: z.string().min(1).max(100).optional(),
      avatarUrl: httpUrl.optional().nullable(),
      preferredCity: z.string().max(100).optional().nullable(),
      preferredState: z.string().max(2).optional().nullable(),
      travelRadiusKm: z.number().int().min(1).max(500).optional(),
      priceMin: z.number().int().min(0).optional().nullable(),
      priceMax: z.number().int().min(0).optional().nullable(),
    })
    .refine(
      (data) => {
        if (data.priceMin != null && data.priceMax != null) {
          return data.priceMin <= data.priceMax;
        }
        return true;
      },
      { message: 'priceMin must be less than or equal to priceMax' },
    ),
};

export const setGenrePreferencesSchema = {
  body: z.object({
    genreIds: z.array(z.string().uuid()).max(20),
  }),
};

export const updateNotificationPrefsSchema = {
  body: z.object({
    eventTomorrow: z.boolean().optional(),
    eventCancelled: z.boolean().optional(),
    eventRescheduled: z.boolean().optional(),
    artistNewEvent: z.boolean().optional(),
    submissionUpdates: z.boolean().optional(),
  }),
};
