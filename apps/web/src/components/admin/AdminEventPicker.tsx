import { useState } from 'react';
import type { AdminEventListItem } from '@the-drop/types';
import { useDebounce } from '../../hooks/useDebounce';
import { useAdminEventSearch } from '../../hooks/admin/useAdminEventSearch';
import styles from './AdminEventPicker.module.css';

interface AdminEventPickerProps {
  excludeId?: string;
  onSelect: (event: AdminEventListItem) => void;
}

const DEBOUNCE_MS = 300;

// AdminEventListItem doesn't carry the event's timezone (unlike EventDetail),
// so this renders in the viewer's local time rather than formatEventDateTime's
// event-timezone convention.
function formatLocal(startsAt: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(startsAt));
}

/** Debounced search-and-select for a single admin event -- shared by the
 * events-list merge modal (target event to merge into) and the submissions
 * review merge action (event to attach a submission to). */
export function AdminEventPicker({ excludeId, onSelect }: AdminEventPickerProps) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, DEBOUNCE_MS);
  const { data: results, isLoading } = useAdminEventSearch(debouncedQuery.trim(), excludeId);

  return (
    <div className={styles.wrapper}>
      <input
        type="text"
        className={styles.input}
        placeholder="Search events by title"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {query.trim().length >= 2 && (
        <div className={styles.results}>
          {isLoading && <p className={styles.status}>Searching...</p>}
          {!isLoading && results?.length === 0 && <p className={styles.status}>No events found.</p>}
          {results?.map((event) => (
            <button
              key={event.id}
              type="button"
              className={styles.result}
              onClick={() => onSelect(event)}
            >
              <span className={styles.resultTitle}>{event.title}</span>
              <span className={styles.resultMeta}>
                {formatLocal(event.startsAt)}
                {event.venue ? ` · ${event.venue.name}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
