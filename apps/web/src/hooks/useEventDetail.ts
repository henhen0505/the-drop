import { useQuery } from '@tanstack/react-query';
import type { EventDetail } from '@the-drop/types';
import { api } from '../services/api';

/** GET /events/:idOrSlug -- the frontend always calls it with the slug. */
export function useEventDetail(slug: string) {
  return useQuery({
    queryKey: ['event', slug],
    queryFn: () => api.get<EventDetail>(`/events/${slug}`),
  });
}
