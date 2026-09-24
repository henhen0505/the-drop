import { useQuery } from '@tanstack/react-query';
import type { GenreNode } from '@the-drop/types';
import { api } from '../services/api';

/** GET /genres -- the full genre hierarchy as a tree. Genres change rarely
 * enough that this never needs to be refetched within a session. */
export function useGenres() {
  return useQuery({
    queryKey: ['genres'],
    queryFn: () => api.get<GenreNode[]>('/genres'),
    staleTime: Infinity,
  });
}
