import { useInfiniteQuery } from '@tanstack/react-query';
import type { EventListItem } from '@the-drop/types';
import { api } from '../services/api';

export interface UseUpcomingEventsOptions {
  limit?: number;
}

/** First-page-and-beyond feed of upcoming (status=PUBLISHED, startsAt >= now)
 * events sorted by date, via GET /events. */
export function useUpcomingEvents(options: UseUpcomingEventsOptions = {}) {
  return useInfiniteQuery({
    queryKey: ['events', 'upcoming', options],
    queryFn: ({ pageParam }) =>
      api.cursor<EventListItem>('/events', {
        params: { sort: 'date', limit: options.limit, cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
  });
}
