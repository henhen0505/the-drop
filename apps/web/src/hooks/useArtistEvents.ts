import { useInfiniteQuery } from '@tanstack/react-query';
import type { EventListItem } from '@the-drop/types';
import { api } from '../services/api';

export interface UseArtistEventsOptions {
  limit?: number;
}

/** Upcoming-events feed for an artist's profile page, via GET /artists/:idOrSlug/events. */
export function useArtistEvents(slug: string, options: UseArtistEventsOptions = {}) {
  return useInfiniteQuery({
    queryKey: ['artist-events', slug],
    queryFn: ({ pageParam }) =>
      api.cursor<EventListItem>(`/artists/${slug}/events`, {
        params: { limit: options.limit, cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    enabled: !!slug,
  });
}
