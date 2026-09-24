import { useQuery } from '@tanstack/react-query';
import type { EventListItem } from '@the-drop/types';
import { api } from '../services/api';

/** GET /events/:id/similar -- requires the event's UUID `id`, not its slug. */
export function useSimilarEvents(eventId: string | undefined) {
  return useQuery({
    queryKey: ['events', eventId, 'similar'],
    queryFn: () => api.get<EventListItem[]>(`/events/${eventId}/similar`),
    enabled: !!eventId,
  });
}
