import { useQuery } from '@tanstack/react-query';
import type { VenueListItem } from '@the-drop/types';
import { api } from '../services/api';

const MIN_QUERY_LENGTH = 2;
const RESULT_LIMIT = 10;

/** Venue lookup for the submission form's "search existing venue" mode, via
 * GET /venues?q=. */
export function useVenueSearch(query: string) {
  return useQuery({
    queryKey: ['venue-search', query],
    queryFn: async () => {
      const result = await api.cursor<VenueListItem>('/venues', {
        params: { q: query, limit: RESULT_LIMIT },
      });
      return result.data;
    },
    enabled: query.length >= MIN_QUERY_LENGTH,
  });
}
