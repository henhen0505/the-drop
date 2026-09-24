import { useInfiniteQuery } from '@tanstack/react-query';
import type { EventListItem } from '@the-drop/types';
import { api } from '../services/api';
import { useEventFilters } from './useEventFilters';

/** Event Discovery's filtered + infinite-scrolled feed via GET /events,
 * driven entirely by the URL-backed filters from useEventFilters(). */
export function useFilteredEvents() {
  const { filters } = useEventFilters();

  const query = useInfiniteQuery({
    queryKey: ['events', 'filtered', filters],
    queryFn: ({ pageParam }) =>
      api.cursor<EventListItem>('/events', {
        params: { ...filters, cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
  });

  return { ...query, filters };
}
