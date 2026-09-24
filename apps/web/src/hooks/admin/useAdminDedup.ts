import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { DedupCandidateItem, ResolvedCandidate } from '@the-drop/types';
import { api } from '../../services/api';

export interface UseDedupCandidatesOptions {
  status?: string;
}

/** GET /admin/dedup/candidates -- REVIEW-band match candidates. Defaults to
 * PENDING_REVIEW server-side when status is omitted (dedup.service.ts listCandidates). */
export function useDedupCandidates(options: UseDedupCandidatesOptions = {}) {
  return useInfiniteQuery({
    queryKey: ['admin-dedup', options],
    queryFn: ({ pageParam }) =>
      api.cursor<DedupCandidateItem>('/admin/dedup/candidates', {
        params: { ...options, cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
  });
}

/** PATCH /admin/dedup/candidates/:id -- merge into the matched event, or
 * reject to create a new canonical event from the incoming record. */
export function useResolveCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'merge' | 'reject' }) =>
      api.patch<ResolvedCandidate>(`/admin/dedup/candidates/${id}`, { action }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-dedup'] });
    },
  });
}
