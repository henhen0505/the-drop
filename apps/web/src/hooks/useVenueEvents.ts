import { useInfiniteQuery } from '@tanstack/react-query';
import type { EventListItem } from '@the-drop/types';
import { api } from '../services/api';

export interface UseVenueEventsOptions {
  limit?: number;
}

/** Upcoming-events feed for a venue's profile page, via GET /venues/:idOrSlug/events. */
export function useVenueEvents(slug: string, options: UseVenueEventsOptions = {}) {
  return useInfiniteQuery({
    queryKey: ['venue-events', slug],
    queryFn: ({ pageParam }) =>
      api.cursor<EventListItem>(`/venues/${slug}/events`, {
        params: { limit: options.limit, cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    enabled: !!slug,
  });
}
