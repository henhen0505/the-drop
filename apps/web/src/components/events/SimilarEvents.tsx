import { useSimilarEvents } from '../../hooks/useSimilarEvents';
import { EventCard } from './EventCard';
import styles from './SimilarEvents.module.css';

interface SimilarEventsProps {
  eventId: string;
}

export function SimilarEvents({ eventId }: SimilarEventsProps) {
  const { data } = useSimilarEvents(eventId);

  if (!data || data.length === 0) return null;

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.heading}>Similar Events</h2>
      <div className={styles.row}>
        {data.map((event) => (
          <div key={event.id} className={styles.item}>
            <EventCard event={event} />
          </div>
        ))}
      </div>
    </div>
  );
}
