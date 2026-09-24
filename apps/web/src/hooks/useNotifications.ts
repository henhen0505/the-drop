import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  MarkAllReadResult,
  MarkReadResult,
  NotificationListResponse,
} from '@the-drop/types';
import { api, apiClient } from '../services/api';

const REFETCH_INTERVAL_MS = 60_000;

export interface UseNotificationsOptions {
  unreadOnly?: boolean;
  limit?: number;
  /** The endpoint requires auth; callers that might render while signed out
   * (e.g. the header) should pass `enabled: isAuthenticated`. */
  enabled?: boolean;
}

/**
 * GET /notifications -- non-standard envelope `{ data, cursor, unreadCount }`,
 * so this calls apiClient directly instead of `api.cursor` (which would
 * silently drop `unreadCount`). Paginated via useInfiniteQuery so both the
 * header dropdown (first page only) and the optional full /notifications
 * page (with scroll) can share one hook.
 */
export function useNotifications({ unreadOnly, limit, enabled = true }: UseNotificationsOptions = {}) {
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ['notifications', { unreadOnly, limit }],
    queryFn: async ({ pageParam }) => {
      const response = await apiClient.get<NotificationListResponse>('/notifications', {
        params: { unreadOnly, limit, cursor: pageParam },
      });
      return response.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
    refetchInterval: REFETCH_INTERVAL_MS,
    enabled,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.patch<MarkReadResult>(`/notifications/${id}/read`),
    onSuccess: invalidate,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.post<MarkAllReadResult>('/notifications/read-all'),
    onSuccess: invalidate,
  });

  return {
    notifications: query.data?.pages.flatMap((page) => page.data) ?? [],
    unreadCount: query.data?.pages[0]?.unreadCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
    markRead: markReadMutation.mutate,
    markAllRead: markAllReadMutation.mutate,
  };
}
