import { Link, useSearchParams } from 'react-router-dom';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useSearch } from '../hooks/useSearch';
import styles from './SearchResults.module.css';

const MIN_QUERY_LENGTH = 2;

// search.service.ts's SearchEventResult doesn't include the event's
// timezone, so this falls back to the viewer's local timezone -- unlike
// EventCard/EventDetail, which always format in the event's own timezone.
function formatSearchResultDate(startsAt: string): string {
  return new Date(startsAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SearchResults() {
  const [searchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const { data, isLoading, isError } = useSearch(q);

  if (q.trim().length < MIN_QUERY_LENGTH) {
    return (
      <EmptyState title="Enter a search term" description="Type at least 2 characters to search." />
    );
  }

  if (isLoading) {
    return <LoadingSpinner size="lg" />;
  }

  if (isError) {
    return <EmptyState title="Search failed" description="Please try again later." />;
  }

  const events = data?.events ?? [];
  const artists = data?.artists ?? [];
  const venues = data?.venues ?? [];
  const hasAnyResults = events.length > 0 || artists.length > 0 || venues.length > 0;

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Search results for &quot;{q}&quot;</h1>

      {!hasAnyResults ? (
        <EmptyState title="No results found" description="Try a different search term." />
      ) : (
        <>
          <section className={styles.section}>
            <h2 className={styles.sectionHeading}>Events</h2>
            {events.length === 0 ? (
              <p className={styles.empty}>No matching events.</p>
            ) : (
              <ul className={styles.list}>
                {events.map((event) => (
                  <li key={event.id}>
                    <Link to={`/events/${event.slug}`} className={styles.item}>
                      <span className={styles.itemName}>{event.title}</span>
                      <span className={styles.itemSubtitle}>
                        {formatSearchResultDate(event.startsAt)}
                        {event.venue ? ` · ${event.venue.name}, ${event.venue.city}` : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionHeading}>Artists</h2>
            {artists.length === 0 ? (
              <p className={styles.empty}>No matching artists.</p>
            ) : (
              <ul className={styles.list}>
                {artists.map((artist) => (
                  <li key={artist.id}>
                    <Link to={`/artists/${artist.slug}`} className={styles.item}>
                      <span className={styles.itemName}>{artist.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionHeading}>Venues</h2>
            {venues.length === 0 ? (
              <p className={styles.empty}>No matching venues.</p>
            ) : (
              <ul className={styles.list}>
                {venues.map((venue) => (
                  <li key={venue.id}>
                    <Link to={`/venues/${venue.slug}`} className={styles.item}>
                      <span className={styles.itemName}>{venue.name}</span>
                      <span className={styles.itemSubtitle}>{venue.city}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
