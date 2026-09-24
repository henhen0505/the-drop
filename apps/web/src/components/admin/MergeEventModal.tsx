import { useState } from 'react';
import type { AdminEventListItem, MergeableEventField } from '@the-drop/types';
import { useMergeEvents } from '../../hooks/admin/useAdminEvents';
import { AdminEventPicker } from './AdminEventPicker';
import { ApiRequestError } from '../../services/api';
import styles from './MergeEventModal.module.css';

interface MergeEventModalProps {
  keepEvent: AdminEventListItem;
  onClose: () => void;
  onMerged: () => void;
}

const MERGEABLE_FIELDS: { field: MergeableEventField; label: string }[] = [
  { field: 'title', label: 'Title' },
  { field: 'description', label: 'Description' },
  { field: 'imageUrl', label: 'Image URL' },
  { field: 'startsAt', label: 'Starts at' },
  { field: 'endsAt', label: 'Ends at' },
  { field: 'venueId', label: 'Venue' },
  { field: 'ageRestriction', label: 'Age restriction' },
  { field: 'doorTime', label: 'Door time' },
  { field: 'reentryPolicy', label: 'Re-entry policy' },
  { field: 'bagPolicy', label: 'Bag policy' },
  { field: 'prohibitedItems', label: 'Prohibited items' },
  { field: 'dressCode', label: 'Dress code' },
];

/**
 * Merge a second event into `keepEvent`. Every mergeable field defaults to
 * "keep" (admin-event.validation.ts mergeEventsSchema comment); toggling a
 * field to "merge" takes that field's value from the event being merged in.
 */
export function MergeEventModal({ keepEvent, onClose, onMerged }: MergeEventModalProps) {
  const [target, setTarget] = useState<AdminEventListItem | null>(null);
  const [overrides, setOverrides] = useState<Partial<Record<MergeableEventField, 'keep' | 'merge'>>>({});
  const { mutate: mergeEvents, isPending, error } = useMergeEvents();

  function toggleField(field: MergeableEventField) {
    setOverrides((prev) => ({ ...prev, [field]: prev[field] === 'merge' ? 'keep' : 'merge' }));
  }

  function handleSubmit() {
    if (!target) return;
    const fieldOverrides = Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value === 'merge'),
    );
    mergeEvents(
      {
        keepEventId: keepEvent.id,
        mergeEventId: target.id,
        ...(Object.keys(fieldOverrides).length > 0 ? { fieldOverrides } : {}),
      },
      { onSuccess: onMerged },
    );
  }

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="merge-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="merge-modal-title" className={styles.title}>
          Merge into &quot;{keepEvent.title}&quot;
        </h3>

        {!target ? (
          <>
            <p className={styles.hint}>Search for the duplicate event to merge in.</p>
            <AdminEventPicker excludeId={keepEvent.id} onSelect={setTarget} />
          </>
        ) : (
          <>
            <p className={styles.hint}>
              Merging <strong>{target.title}</strong> into <strong>{keepEvent.title}</strong>. Toggle
              a field to take its value from the merged-in event instead.
            </p>
            <ul className={styles.fieldList}>
              {MERGEABLE_FIELDS.map(({ field, label }) => (
                <li key={field} className={styles.fieldRow}>
                  <span>{label}</span>
                  <button
                    type="button"
                    className={overrides[field] === 'merge' ? styles.mergeToggleActive : styles.mergeToggle}
                    onClick={() => toggleField(field)}
                  >
                    {overrides[field] === 'merge' ? 'Take from merged event' : 'Keep current'}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className={styles.changeTarget} onClick={() => setTarget(null)}>
              Choose a different event
            </button>
          </>
        )}

        {error && (
          <p className={styles.error}>
            {error instanceof ApiRequestError ? error.message : 'Merge failed. Please try again.'}
          </p>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.confirmButton}
            onClick={handleSubmit}
            disabled={!target || isPending}
          >
            {isPending ? 'Merging...' : 'Merge events'}
          </button>
        </div>
      </div>
    </div>
  );
}
