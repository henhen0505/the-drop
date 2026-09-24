import { useQuery } from '@tanstack/react-query';
import type { SearchResult } from '@the-drop/types';
import { api } from '../services/api';

export type SearchEntityType = 'event' | 'artist' | 'venue';

// Matches search.validation.ts's searchSchema: q.min(2).
const MIN_QUERY_LENGTH = 2;

/** GET /search -- full search across events/artists/venues. */
export function useSearch(query: string, types?: SearchEntityType[]) {
  return useQuery({
    queryKey: ['search', query, types],
    queryFn: () =>
      api.get<SearchResult>('/search', {
        params: { q: query, type: types?.join(',') },
      }),
    enabled: query.length >= MIN_QUERY_LENGTH,
  });
}
