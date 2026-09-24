import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SyncStatusItem, TriggerSyncResult } from '@the-drop/types';
import { api } from '../../services/api';

const POLL_INTERVAL_MS = 30_000;

/** GET /admin/sync-status -- one row per external source (sync.router.ts is
 * mounted at /admin, not /admin/sync). Polled while the page is open so a
 * triggered sync's progress shows up without a manual refresh. */
export function useSyncStatus() {
  return useQuery({
    queryKey: ['admin-sync-status'],
    queryFn: () => api.get<SyncStatusItem[]>('/admin/sync-status'),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

/** POST /admin/sync/trigger -- fire-and-forget Ticketmaster sync (202 Accepted). */
export function useTriggerSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<TriggerSyncResult>('/admin/sync/trigger', { sourceType: 'TICKETMASTER' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-sync-status'] });
    },
  });
}
