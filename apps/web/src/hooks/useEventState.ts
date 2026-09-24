import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { EventDetail, EventStateResponse, UserEventState } from '@the-drop/types';
import { api, apiClient } from '../services/api';

/** Finds any cached EventDetail (keyed `['event', slug]`) whose `id` matches,
 * to seed the toggle's initial displayed state without needing the slug. */
function findCachedUserState(
  queryClient: ReturnType<typeof useQueryClient>,
  eventId: string,
): UserEventState | null {
  const cached = queryClient.getQueriesData<EventDetail>({ queryKey: ['event'] });
  for (const [, data] of cached) {
    if (data && data.id === eventId) {
      return (data.userState as UserEventState | null) ?? null;
    }
  }
  return null;
}

/** Set/clear the signed-in user's saved state (INTERESTED/GOING/HAVE_TICKET)
 * for a single event, via PUT/DELETE /events/:id/state. */
export function useEventState(eventId: string) {
  const queryClient = useQueryClient();
  const [currentState, setCurrentState] = useState<UserEventState | null>(() =>
    findCachedUserState(queryClient, eventId),
  );

  function syncEventCache(nextState: UserEventState | null) {
    queryClient.setQueriesData<EventDetail>({ queryKey: ['event'] }, (old) =>
      old && old.id === eventId ? { ...old, userState: nextState } : old,
    );
    void queryClient.invalidateQueries({ queryKey: ['event'] });
    void queryClient.invalidateQueries({ queryKey: ['my-raves'] });
  }

  const setStateMutation = useMutation({
    mutationFn: (state: UserEventState) =>
      api.put<EventStateResponse>(`/events/${eventId}/state`, { state }),
    onSuccess: (result) => {
      setCurrentState(result.state);
      syncEventCache(result.state);
    },
  });

  const clearStateMutation = useMutation({
    // 204 No Content -- call apiClient directly, not the api.* JSON-unwrapping helpers.
    mutationFn: () => apiClient.delete(`/events/${eventId}/state`),
    onSuccess: () => {
      setCurrentState(null);
      syncEventCache(null);
    },
  });

  return {
    currentState,
    setState: setStateMutation.mutate,
    clearState: clearStateMutation.mutate,
    isPending: setStateMutation.isPending || clearStateMutation.isPending,
    isError: setStateMutation.isError || clearStateMutation.isError,
  };
}
