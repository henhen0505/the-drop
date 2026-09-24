import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { AdminSubmissionView, ReviewedSubmission, ReviewSubmissionInput } from '@the-drop/types';
import { api } from '../../services/api';

export interface UseAdminSubmissionsOptions {
  status?: string;
}

/** GET /admin/submissions -- review queue, oldest first. Defaults to PENDING
 * server-side when status is omitted (submission-review.validation.ts). */
export function useAdminSubmissions(options: UseAdminSubmissionsOptions = {}) {
  return useInfiniteQuery({
    queryKey: ['admin-submissions', options],
    queryFn: ({ pageParam }) =>
      api.cursor<AdminSubmissionView>('/admin/submissions', {
        params: { ...options, cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
  });
}

/** PATCH /admin/submissions/:id -- approve/reject/merge a pending submission. */
export function useReviewSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ReviewSubmissionInput }) =>
      api.patch<ReviewedSubmission>(`/admin/submissions/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-submissions'] });
    },
  });
}
