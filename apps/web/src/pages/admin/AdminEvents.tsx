import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminEventListItem, EventStatus } from '@the-drop/types';
import { ConfirmDialog } from '../../components/admin/ConfirmDialog';
import { MergeEventModal } from '../../components/admin/MergeEventModal';
import { StatusBadge } from '../../components/admin/StatusBadge';
import { EmptyState } from '../../components/ui/EmptyState';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';
import { useAdminEvents, useDeleteEvent } from '../../hooks/admin/useAdminEvents';
import { useDebounce } from '../../hooks/useDebounce';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import { ApiRequestError } from '../../services/api';
import styles from './AdminEvents.module.css';

const DEBOUNCE_MS = 300;

// @the-drop/types ships a CommonJS build (packages/types/tsconfig.json module:
// "commonjs"); Rollup's CJS interop can only statically resolve named exports
// that are direct `exports.NAME = ...` assignments, not the dynamic
// __exportStar loop tsc emits for `export * from './enums'` -- so runtime
// enum arrays (as opposed to types, which are erased before bundling) can't
// be imported from '@the-drop/types' in apps/web. Mirrors admin-event.validation.ts EVENT_STATUSES.
const EVENT_STATUSES: EventStatus[] = ['DRAFT', 'PUBLISHED', 'CANCELLED', 'POSTPONED', 'COMPLETED'];

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function AdminEvents() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<EventStatus | ''>('');
  const [staleOnly, setStaleOnly] = useState(false);
  const debouncedQ = useDebounce(q, DEBOUNCE_MS);

  const [deletingEvent, setDeletingEvent] = useState<AdminEventListItem | null>(null);
  const [mergingEvent, setMergingEvent] = useState<AdminEventListItem | null>(null);

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useAdminEvents({
    q: debouncedQ.trim() || undefined,
    status: status || undefined,
    stale: staleOnly ? true : undefined,
  });
  const { mutate: deleteEvent, isPending: isDeleting, error: deleteError } = useDeleteEvent();
  const { sentinelRef } = useInfiniteScroll({
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
  });

  const events = data?.pages.flatMap((page) => page.data) ?? [];

  function confirmDelete() {
    if (!deletingEvent) return;
    deleteEvent(deletingEvent.id, { onSuccess: () => setDeletingEvent(null) });
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Events</h1>
        <Link to="/admin/events/new" className={styles.createButton}>
          Create Event
        </Link>
      </div>

      <div className={styles.filters}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search by title"
          value={q}
          onChange={(event) => setQ(event.target.value)}
        />
        <select
          className={styles.statusSelect}
          value={status}
          onChange={(event) => setStatus(event.target.value as EventStatus | '')}
        >
          <option value="">All statuses</option>
          {EVENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <label className={styles.staleToggle}>
          <input
            type="checkbox"
            checked={staleOnly}
            onChange={(event) => setStaleOnly(event.target.checked)}
          />
          Stale only
        </label>
      </div>

      {deleteError && (
        <p className={styles.error}>
          {deleteError instanceof ApiRequestError ? deleteError.message : 'Failed to delete event.'}
        </p>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <EmptyState title="Couldn't load events" description="Please try again later." />
      ) : events.length === 0 ? (
        <EmptyState title="No events found" description="Try widening your filters." />
      ) : (
        <>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Starts At</th>
                  <th>Venue</th>
                  <th>Artists</th>
                  <th>Primary Source</th>
                  <th>Confidence</th>
                  <th>Created At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>
                      <Link to={`/admin/events/${event.id}/edit`} className={styles.titleLink}>
                        {event.title}
                      </Link>
                    </td>
                    <td>
                      <StatusBadge status={event.status} variant="event" />
                    </td>
                    <td>{formatDate(event.startsAt)}</td>
                    <td>{event.venue ? `${event.venue.name}, ${event.venue.city}` : '-'}</td>
                    <td>{event.artistCount}</td>
                    <td>
                      <StatusBadge status={event.primarySource} variant="source" />
                    </td>
                    <td>
                      <StatusBadge status={event.confidence} variant="confidence" />
                    </td>
                    <td>{formatDate(event.createdAt)}</td>
                    <td className={styles.actionsCell}>
                      <Link to={`/admin/events/${event.id}/edit`} className={styles.actionLink}>
                        Edit
                      </Link>
                      <button
                        type="button"
                        className={styles.actionLink}
                        onClick={() => setMergingEvent(event)}
                      >
                        Merge
                      </button>
                      <button
                        type="button"
                        className={styles.deleteLink}
                        onClick={() => setDeletingEvent(event)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasNextPage && <div ref={sentinelRef} className={styles.sentinel} />}
          {isFetchingNextPage && <LoadingSpinner size="sm" />}
        </>
      )}

      {deletingEvent && (
        <ConfirmDialog
          title="Delete event"
          message={`Delete "${deletingEvent.title}"? Published events are cancelled rather than removed outright.`}
          confirmLabel="Delete"
          isConfirming={isDeleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeletingEvent(null)}
        />
      )}

      {mergingEvent && (
        <MergeEventModal
          keepEvent={mergingEvent}
          onClose={() => setMergingEvent(null)}
          onMerged={() => setMergingEvent(null)}
        />
      )}
    </div>
  );
}
