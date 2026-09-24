import type { EventListItem } from '@the-drop/types';
import { EmptyState } from '../ui/EmptyState';
import { EventCard } from './EventCard';
import styles from './EventCardGrid.module.css';

interface EventCardGridProps {
  events: EventListItem[];
  emptyTitle?: string;
  emptyDescription?: string;
}

export function EventCardGrid({
  events,
  emptyTitle = 'No events found',
  emptyDescription,
}: EventCardGridProps) {
  if (events.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className={styles.grid}>
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}
