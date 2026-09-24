import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GenreDetail } from '@the-drop/types';
import { api } from '../services/api';

// Matches user.validation.ts's setGenrePreferencesSchema: genreIds.max(20).
export const MAX_GENRE_PREFERENCES = 20;

/** GET/PUT /users/me/genre-preferences. Saving invalidates recommendations
 * too, since genre affinity feeds the recommendation scorer. */
export function useGenrePreferences() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['genre-preferences'],
    queryFn: () => api.get<GenreDetail[]>('/users/me/genre-preferences'),
  });

  const updateMutation = useMutation({
    mutationFn: (genreIds: string[]) =>
      api.put<GenreDetail[]>('/users/me/genre-preferences', { genreIds }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['genre-preferences'] });
      await queryClient.invalidateQueries({ queryKey: ['recommendations'] });
    },
  });

  return {
    preferences: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    update: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
  };
}
