import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@the-drop/types';
import { api } from '../services/api';
import { useAuth } from './useAuth';

/** GET/PATCH /users/me. On a successful save, also refreshes the auth
 * store's cached user so the header's displayName stays in sync. */
export function useProfile() {
  const queryClient = useQueryClient();
  const { refreshAuth } = useAuth();

  const query = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get<User>('/users/me'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<User>) => api.patch<User>('/users/me', data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      await refreshAuth();
    },
  });

  return {
    profile: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    update: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
  };
}
