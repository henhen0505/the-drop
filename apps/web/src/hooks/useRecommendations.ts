import { useInfiniteQuery } from '@tanstack/react-query';
import type { RecommendationItem } from '@the-drop/types';
import { api } from '../services/api';

export interface UseRecommendationsOptions {
  limit?: number;
  /** Recommendations require an authenticated user; the caller decides when
   * that's true so this hook doesn't have to know about auth state. */
  enabled?: boolean;
}

/** Personalized feed via GET /recommendations. Only meaningful when the
 * viewer is signed in -- pass `enabled: isAuthenticated`. */
export function useRecommendations(options: UseRecommendationsOptions = {}) {
  return useInfiniteQuery({
    queryKey: ['recommendations'],
    queryFn: ({ pageParam }) =>
      api.cursor<RecommendationItem>('/recommendations', {
        params: { limit: options.limit, cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    enabled: options.enabled ?? true,
  });
}
