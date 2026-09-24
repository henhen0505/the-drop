import { Link } from 'react-router-dom';
import type { RecommendationItem } from '@the-drop/types';
import { formatEventDateTime } from '../../utils/format';
import styles from './RecommendationCard.module.css';

interface RecommendationCardProps {
  recommendation: RecommendationItem;
}

export function RecommendationCard({ recommendation }: RecommendationCardProps) {
  const { event, explanation } = recommendation;

  return (
    <Link to={`/events/${event.slug}`} className={styles.card}>
      <div className={styles.imageWrapper}>
        {event.imageUrl ? (
          <img src={event.imageUrl} alt="" className={styles.image} />
        ) : (
          <div className={styles.imagePlaceholder} aria-hidden="true" />
        )}
      </div>
      <div className={styles.body}>
        <p className={styles.date}>{formatEventDateTime(event.startsAt, event.timezone)}</p>
        <h3 className={styles.title}>{event.title}</h3>
        {event.venue && (
          <p className={styles.venue}>
            {event.venue.name} &middot; {event.venue.city}
          </p>
        )}
        <p className={styles.explanation}>{explanation}</p>
      </div>
    </Link>
  );
}
