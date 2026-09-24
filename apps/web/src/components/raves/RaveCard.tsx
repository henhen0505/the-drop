import { Link } from 'react-router-dom';
import type { MyRaveItem } from '@the-drop/types';
import { formatEventDateTime } from '../../utils/format';
import styles from './RaveCard.module.css';

interface RaveCardProps {
  rave: MyRaveItem;
}

const MAX_VISIBLE_ARTISTS = 3;

const STATE_LABELS: Record<string, string> = {
  DISCOVERED: 'Discovered',
  INTERESTED: 'Interested',
  GOING: 'Going',
  HAVE_TICKET: 'Have Ticket',
  ATTENDED: 'Attended',
  CANCELLED: 'Cancelled',
};

export function RaveCard({ rave }: RaveCardProps) {
  const { event, state } = rave;
  const visibleArtists = event.artists.slice(0, MAX_VISIBLE_ARTISTS);
  const remainingCount = event.artists.length - visibleArtists.length;

  return (
    <Link to={`/events/${event.slug}`} className={styles.card}>
      <div className={styles.imageWrapper}>
        {event.imageUrl ? (
          <img src={event.imageUrl} alt="" className={styles.image} />
        ) : (
          <div className={styles.imagePlaceholder} aria-hidden="true" />
        )}
        <span className={styles.stateBadge}>{STATE_LABELS[state] ?? state}</span>
      </div>
      <div className={styles.body}>
        <p className={styles.date}>{formatEventDateTime(event.startsAt, event.timezone)}</p>
        <h3 className={styles.title}>{event.title}</h3>
        {event.venue && (
          <p className={styles.venue}>
            {event.venue.name} &middot; {event.venue.city}
          </p>
        )}
        {visibleArtists.length > 0 && (
          <p className={styles.artists}>
            {visibleArtists.map((artist) => artist.name).join(', ')}
            {remainingCount > 0 && ` +${remainingCount} more`}
          </p>
        )}
      </div>
    </Link>
  );
}
