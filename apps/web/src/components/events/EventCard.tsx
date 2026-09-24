import { Link } from 'react-router-dom';
import type { EventListItem } from '@the-drop/types';
import { formatEventDateTime, formatMinPrice } from '../../utils/format';
import styles from './EventCard.module.css';

interface EventCardProps {
  event: EventListItem;
}

export function EventCard({ event }: EventCardProps) {
  return (
    <Link to={`/events/${event.slug}`} className={styles.card}>
      <div className={styles.imageWrapper}>
        {event.imageUrl ? (
          <img src={event.imageUrl} alt="" className={styles.image} />
        ) : (
          <div className={styles.imagePlaceholder} aria-hidden="true" />
        )}
        {event.ageRestriction && <span className={styles.ageBadge}>{event.ageRestriction}</span>}
      </div>
      <div className={styles.body}>
        <p className={styles.date}>{formatEventDateTime(event.startsAt, event.timezone)}</p>
        <h3 className={styles.title}>{event.title}</h3>
        {event.venue && (
          <p className={styles.venue}>
            {event.venue.name} &middot; {event.venue.city}
          </p>
        )}
        {event.genres.length > 0 && (
          <div className={styles.genres}>
            {event.genres.map((genre) => (
              <span key={genre.id} className={styles.genreTag}>
                {genre.name}
              </span>
            ))}
          </div>
        )}
        <p className={styles.price}>{formatMinPrice(event.minPriceCents)}</p>
      </div>
    </Link>
  );
}
