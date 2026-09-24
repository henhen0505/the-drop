import { useQuery } from '@tanstack/react-query';
import type { AdminEventListItem } from '@the-drop/types';
import { api } from '../../services/api';

const MIN_QUERY_LENGTH = 2;
const RESULT_LIMIT = 10;

/**
 * Event lookup for the merge-target pickers on AdminEvents and
 * AdminSubmissions, via GET /admin/events?q= (admin-event.validation.ts
 * listAdminEventsSchema.query). Not part of the useAdminEvents.ts plan --
 * added because both merge flows need a single-event search-select and
 * there was no existing admin event search hook to reuse.
 */
export function useAdminEventSearch(query: string, excludeId?: string) {
  return useQuery({
    queryKey: ['admin-event-search', query, excludeId],
    queryFn: async () => {
      const result = await api.cursor<AdminEventListItem>('/admin/events', {
        params: { q: query, limit: RESULT_LIMIT },
      });
      return result.data.filter((event) => event.id !== excludeId);
    },
    enabled: query.length >= MIN_QUERY_LENGTH,
  });
}
