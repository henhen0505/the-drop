import { useQuery } from '@tanstack/react-query';
import type { ArtistProfile } from '@the-drop/types';
import { api } from '../services/api';

/** GET /artists/:idOrSlug -- the frontend always calls it with the slug. */
export function useArtistProfile(slug: string) {
  return useQuery({
    queryKey: ['artist', slug],
    queryFn: () => api.get<ArtistProfile>(`/artists/${slug}`),
    enabled: !!slug,
  });
}
