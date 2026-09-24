import { Link, useParams } from 'react-router-dom';
import { ArtistLineup } from '../components/events/ArtistLineup';
import { EventStateToggle } from '../components/events/EventStateToggle';
import { SimilarEvents } from '../components/events/SimilarEvents';
import { TicketLinkList } from '../components/events/TicketLinkList';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useEventDetail } from '../hooks/useEventDetail';
import { ApiRequestError } from '../services/api';
import { formatEventDateTime } from '../utils/format';
import styles from './EventDetail.module.css';

const POLICY_SECTIONS: {
  key: 'reentryPolicy' | 'bagPolicy' | 'prohibitedItems' | 'dressCode';
  label: string;
}[] = [
  { key: 'reentryPolicy', label: 'Re-entry Policy' },
  { key: 'bagPolicy', label: 'Bag Policy' },
  { key: 'prohibitedItems', label: 'Prohibited Items' },
  { key: 'dressCode', label: 'Dress Code' },
];

export default function EventDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: event, isLoading, isError, error } = useEventDetail(slug ?? '');

  if (isLoading) {
    return <LoadingSpinner size="lg" />;
  }

  if (isError) {
    const notFound = error instanceof ApiRequestError && error.code === 'NOT_FOUND';
    return (
      <EmptyState
        title={notFound ? 'Event not found' : "Couldn't load this event"}
        description={
          notFound ? "This event doesn't exist or has been removed." : 'Please try again later.'
        }
      />
    );
  }

  if (!event) {
    return <EmptyState title="Event not found" />;
  }

  const isWarningStatus = event.status === 'CANCELLED' || event.status === 'POSTPONED';

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.imageWrapper}>
          {event.imageUrl ? (
            <img src={event.imageUrl} alt="" className={styles.image} />
          ) : (
            <div className={styles.imagePlaceholder} aria-hidden="true" />
          )}
        </div>
        <div className={styles.heroBody}>
          {isWarningStatus && <span className={styles.warningBadge}>{event.status}</span>}
          <h1 className={styles.title}>{event.title}</h1>
        </div>
      </section>

      <section className={styles.keyInfo}>
        <div className={styles.keyInfoItem}>
          <span className={styles.keyInfoLabel}>Date &amp; Time</span>
          <span>{formatEventDateTime(event.startsAt, event.timezone)}</span>
        </div>
        {event.doorTime && (
          <div className={styles.keyInfoItem}>
            <span className={styles.keyInfoLabel}>Doors</span>
            <span>{event.doorTime.slice(0, 5)}</span>
          </div>
        )}
        {event.ageRestriction && (
          <div className={styles.keyInfoItem}>
            <span className={styles.keyInfoLabel}>Age Restriction</span>
            <span>{event.ageRestriction}</span>
          </div>
        )}
      </section>

      <EventStateToggle eventId={event.id} />

      {event.venue && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Venue</h2>
          <Link to={`/venues/${event.venue.slug}`} className={styles.venueLink}>
            {event.venue.name}
          </Link>
          <p className={styles.venueAddress}>
            {event.venue.address ? `${event.venue.address}, ` : ''}
            {event.venue.city}
            {event.venue.state ? `, ${event.venue.state}` : ''}
          </p>
        </section>
      )}

      {event.description && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>About</h2>
          <p className={styles.description}>{event.description}</p>
        </section>
      )}

      {event.artists.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Lineup</h2>
          <ArtistLineup artists={event.artists} />
        </section>
      )}

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Tickets</h2>
        <TicketLinkList ticketLinks={event.ticketLinks} />
      </section>

      {POLICY_SECTIONS.filter((policy) => event[policy.key]).map((policy) => (
        <section key={policy.key} className={styles.section}>
          <h2 className={styles.sectionHeading}>{policy.label}</h2>
          <p className={styles.description}>{event[policy.key]}</p>
        </section>
      ))}

      <SimilarEvents eventId={event.id} />
    </div>
  );
}
