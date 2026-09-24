import { useQuery } from '@tanstack/react-query';
import type { AutocompleteItem } from '@the-drop/types';
import { api } from '../services/api';

// Matches search.validation.ts's autocompleteSchema: q.min(2).
const MIN_QUERY_LENGTH = 2;
const AUTOCOMPLETE_LIMIT = 10;

/** GET /search/autocomplete -- fuzzy-match suggestions as the user types. */
export function useAutocomplete(query: string) {
  return useQuery({
    queryKey: ['autocomplete', query],
    queryFn: () =>
      api.get<AutocompleteItem[]>('/search/autocomplete', {
        params: { q: query, limit: AUTOCOMPLETE_LIMIT },
      }),
    enabled: query.length >= MIN_QUERY_LENGTH,
  });
}
