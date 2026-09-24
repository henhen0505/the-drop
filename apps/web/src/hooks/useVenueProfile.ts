import { useQuery } from '@tanstack/react-query';
import type { VenueProfile } from '@the-drop/types';
import { api } from '../services/api';

/** GET /venues/:idOrSlug -- the frontend always calls it with the slug. */
export function useVenueProfile(slug: string) {
  return useQuery({
    queryKey: ['venue', slug],
    queryFn: () => api.get<VenueProfile>(`/venues/${slug}`),
    enabled: !!slug,
  });
}
