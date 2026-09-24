import { useParams } from 'react-router-dom';
import { EventCardGrid } from '../components/events/EventCardGrid';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useVenueEvents } from '../hooks/useVenueEvents';
import { useVenueProfile } from '../hooks/useVenueProfile';
import { ApiRequestError } from '../services/api';
import styles from './VenueProfile.module.css';

export default function VenueProfile() {
  const { slug } = useParams<{ slug: string }>();
  const { data: venue, isLoading, isError, error } = useVenueProfile(slug ?? '');
  const {
    data: eventsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useVenueEvents(slug ?? '');
  const { sentinelRef } = useInfiniteScroll({
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
  });

  if (isLoading) {
    return <LoadingSpinner size="lg" />;
  }

  if (isError) {
    const notFound = error instanceof ApiRequestError && error.code === 'NOT_FOUND';
    return (
      <EmptyState
        title={notFound ? 'Venue not found' : "Couldn't load this venue"}
        description={
          notFound ? "This venue doesn't exist or has been removed." : 'Please try again later.'
        }
      />
    );
  }

  if (!venue) {
    return <EmptyState title="Venue not found" />;
  }

  const events = eventsData?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.imageWrapper}>
          {venue.imageUrl ? (
            <img src={venue.imageUrl} alt="" className={styles.image} />
          ) : (
            <div className={styles.imagePlaceholder} aria-hidden="true" />
          )}
        </div>
        <div className={styles.heroBody}>
          <h1 className={styles.title}>{venue.name}</h1>
          <p className={styles.address}>
            {venue.address ? `${venue.address}, ` : ''}
            {venue.city}
            {venue.state ? `, ${venue.state}` : ''}
          </p>
          <div className={styles.keyInfo}>
            {venue.venueType && (
              <div className={styles.keyInfoItem}>
                <span className={styles.keyInfoLabel}>Venue Type</span>
                <span>{venue.venueType}</span>
              </div>
            )}
            {venue.capacity !== null && (
              <div className={styles.keyInfoItem}>
                <span className={styles.keyInfoLabel}>Capacity</span>
                <span>{venue.capacity.toLocaleString()}</span>
              </div>
            )}
            {venue.typicalAgeRestriction && (
              <div className={styles.keyInfoItem}>
                <span className={styles.keyInfoLabel}>Typical Age Restriction</span>
                <span>{venue.typicalAgeRestriction}</span>
              </div>
            )}
            {venue.typicalBagPolicy && (
              <div className={styles.keyInfoItem}>
                <span className={styles.keyInfoLabel}>Typical Bag Policy</span>
                <span>{venue.typicalBagPolicy}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Upcoming Events</h2>
        <EventCardGrid
          events={events}
          emptyTitle="No upcoming events"
          emptyDescription="Check back later for new dates."
        />
        {hasNextPage && <div ref={sentinelRef} className={styles.sentinel} />}
        {isFetchingNextPage && <LoadingSpinner size="sm" />}
      </section>
    </div>
  );
}
