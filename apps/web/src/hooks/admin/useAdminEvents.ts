import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminEventDetail,
  AdminEventListItem,
  CreateAdminEventInput,
  MergeEventsInput,
  UpdateAdminEventInput,
} from '@the-drop/types';
import { api, apiClient } from '../../services/api';

export interface UseAdminEventsOptions {
  q?: string;
  status?: string;
  stale?: boolean;
}

/** GET /admin/events -- paginated event list for the admin dashboard, filterable
 * by title (q), status, and stale-flag (admin-event.validation.ts listAdminEventsSchema). */
export function useAdminEvents(options: UseAdminEventsOptions = {}) {
  return useInfiniteQuery({
    queryKey: ['admin-events', options],
    queryFn: ({ pageParam }) =>
      api.cursor<AdminEventListItem>('/admin/events', {
        params: { ...options, cursor: pageParam },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.cursor ?? undefined,
  });
}

/** GET /admin/events/:id -- full event detail for the edit form
 * (admin-event.router.ts GET /:id -> admin-event.controller.ts getEvent). */
export function useAdminEvent(id: string | undefined) {
  return useQuery({
    queryKey: ['admin-event', id],
    queryFn: () => api.get<AdminEventDetail>(`/admin/events/${id}`),
    enabled: id !== undefined,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAdminEventInput) => api.post<AdminEventDetail>('/admin/events', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-events'] });
    },
  });
}

export function useUpdateEvent(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAdminEventInput) =>
      api.patch<AdminEventDetail>(`/admin/events/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-event', id] });
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    // 204 No Content -- call apiClient directly, not the api.* JSON-unwrapping helpers.
    mutationFn: (id: string) => apiClient.delete(`/admin/events/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-events'] });
    },
  });
}

export function useMergeEvents() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MergeEventsInput) => api.post<AdminEventDetail>('/admin/events/merge', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-events'] });
    },
  });
}
