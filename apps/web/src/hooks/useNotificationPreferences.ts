import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationPreferences, UpdateNotificationPreferences } from '@the-drop/types';
import { api } from '../services/api';

/** GET/PATCH /users/me/notification-preferences. */
export function useNotificationPreferences() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => api.get<NotificationPreferences>('/users/me/notification-preferences'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: UpdateNotificationPreferences) =>
      api.patch<NotificationPreferences>('/users/me/notification-preferences', data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
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
