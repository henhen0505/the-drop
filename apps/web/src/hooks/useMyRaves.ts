import { useInfiniteQuery } from '@tanstack/react-query';
import type { MyRaveItem, UserEventState } from '@the-drop/types';
import { api } from '../services/api';

export interface UseMyRavesOptions {
  states?: UserEventState[];
  upcoming: boolean;
  limit?: number;
}

/** The signed-in user's saved events, via GET /users/me/raves. `states`
 * omitted means no state filter (used by the "All"/"Past" tabs). */
export function useMyRaves({ states, upcoming, limit }: UseMyRavesOptions) {
  return useInfiniteQuery({
    queryKey: ['my-raves', { states, upcoming }],
    queryFn: ({ pageParam }) =>
      api.cursor<MyRaveItem>('/users/me/raves', {
        params: {
          state: states && states.length > 0 ? states.join(',') : undefined,
          upcoming,
          limit,
          cursor: pageParam,
        },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
  });
}
