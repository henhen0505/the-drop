import { useState } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useSyncStatus, useTriggerSync } from '../../hooks/admin/useSyncStatus';
import { ApiRequestError } from '../../services/api';
import styles from './AdminSyncStatus.module.css';

function formatDate(value: string | null): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function AdminSyncStatus() {
  const { data: statuses, isLoading, isError } = useSyncStatus();
  const { mutate: triggerSync, isPending, isSuccess, error, data: triggerResult } = useTriggerSync();
  const [expandedError, setExpandedError] = useState<string | null>(null);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Sync Status</h1>
        <button type="button" className={styles.triggerButton} onClick={() => triggerSync()} disabled={isPending}>
          {isPending ? 'Triggering...' : 'Trigger Sync'}
        </button>
      </div>

      {isPending && <p className={styles.status}>Sync job triggered, running in the background...</p>}
      {isSuccess && triggerResult && <p className={styles.status}>{triggerResult.message}</p>}
      {error && (
        <p className={styles.error}>
          {error instanceof ApiRequestError ? error.message : 'Failed to trigger sync.'}
        </p>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <EmptyState title="Couldn't load sync status" description="Please try again later." />
      ) : !statuses || statuses.length === 0 ? (
        <EmptyState title="No sync history yet" description="Trigger a sync to get started." />
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Source Type</th>
                <th>Last Success</th>
                <th>Last Failure</th>
                <th>Last Error</th>
                <th>Events Synced</th>
                <th>Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {statuses.map((sync) => (
                <tr key={sync.sourceType}>
                  <td>{sync.sourceType}</td>
                  <td>{formatDate(sync.lastSuccessAt)}</td>
                  <td>{formatDate(sync.lastFailureAt)}</td>
                  <td className={styles.errorCell}>
                    {sync.lastError ? (
                      <button
                        type="button"
                        className={styles.errorToggle}
                        onClick={() =>
                          setExpandedError((prev) => (prev === sync.sourceType ? null : sync.sourceType))
                        }
                      >
                        {expandedError === sync.sourceType
                          ? sync.lastError
                          : `${sync.lastError.slice(0, 60)}${sync.lastError.length > 60 ? '...' : ''}`}
                      </button>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>{sync.eventsSynced}</td>
                  <td>{formatDate(sync.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
