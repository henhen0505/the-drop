import { useQuery } from '@tanstack/react-query';
import type { SearchResult } from '@the-drop/types';
import { api } from '../../services/api';

const MIN_QUERY_LENGTH = 2;
const RESULT_LIMIT = 10;

/** Artist lookup for AdminArtistPicker, via the unified GET /search?type=artist
 * (apps/api/src/modules/search/search.validation.ts -- `type` takes a
 * comma-separated SearchEntityType list; `q` requires min length 2). */
export function useArtistSearch(query: string) {
  return useQuery({
    queryKey: ['admin-artist-search', query],
    queryFn: async () => {
      const result = await api.get<SearchResult>('/search', {
        params: { q: query, type: 'artist', limit: RESULT_LIMIT },
      });
      return result.artists;
    },
    enabled: query.length >= MIN_QUERY_LENGTH,
  });
}
