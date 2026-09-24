import type { NotificationPreferences } from '@the-drop/types';
import styles from './NotificationToggles.module.css';

interface NotificationTogglesProps {
  preferences: NotificationPreferences;
  onChange: (key: keyof NotificationPreferences, value: boolean) => void;
}

const FIELDS: { key: keyof NotificationPreferences; label: string }[] = [
  { key: 'eventTomorrow', label: 'Event tomorrow reminder' },
  { key: 'eventCancelled', label: 'Event cancelled' },
  { key: 'eventRescheduled', label: 'Event rescheduled' },
  { key: 'artistNewEvent', label: 'New event from followed artist' },
  { key: 'submissionUpdates', label: 'Submission status updates' },
];

export function NotificationToggles({ preferences, onChange }: NotificationTogglesProps) {
  return (
    <div className={styles.list}>
      {FIELDS.map((field) => (
        <label key={field.key} className={styles.row}>
          <span>{field.label}</span>
          <input
            type="checkbox"
            checked={preferences[field.key]}
            onChange={(event) => onChange(field.key, event.target.checked)}
          />
        </label>
      ))}
    </div>
  );
}
