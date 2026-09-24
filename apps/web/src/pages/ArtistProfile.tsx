import { useParams } from 'react-router-dom';
import { FollowButton } from '../components/artists/FollowButton';
import { StreamingLinks } from '../components/artists/StreamingLinks';
import { EventCardGrid } from '../components/events/EventCardGrid';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useArtistEvents } from '../hooks/useArtistEvents';
import { useArtistProfile } from '../hooks/useArtistProfile';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { ApiRequestError } from '../services/api';
import styles from './ArtistProfile.module.css';

export default function ArtistProfile() {
  const { slug } = useParams<{ slug: string }>();
  const { data: artist, isLoading, isError, error } = useArtistProfile(slug ?? '');
  const {
    data: eventsData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useArtistEvents(slug ?? '');
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
        title={notFound ? 'Artist not found' : "Couldn't load this artist"}
        description={
          notFound ? "This artist doesn't exist or has been removed." : 'Please try again later.'
        }
      />
    );
  }

  if (!artist) {
    return <EmptyState title="Artist not found" />;
  }

  const events = eventsData?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.imageWrapper}>
          {artist.imageUrl ? (
            <img src={artist.imageUrl} alt="" className={styles.image} />
          ) : (
            <div className={styles.imagePlaceholder} aria-hidden="true" />
          )}
        </div>
        <div className={styles.heroBody}>
          <h1 className={styles.title}>{artist.name}</h1>
          {artist.bio && <p className={styles.bio}>{artist.bio}</p>}
          {artist.genres.length > 0 && (
            <div className={styles.genres}>
              {artist.genres.map((genre) => (
                <span key={genre.id} className={styles.genreTag}>
                  {genre.name}
                </span>
              ))}
            </div>
          )}
          <StreamingLinks
            spotifyUrl={artist.spotifyUrl}
            soundcloudUrl={artist.soundcloudUrl}
            appleMusicUrl={artist.appleMusicUrl}
          />
          <FollowButton
            artistId={artist.id}
            slug={artist.slug}
            isFollowed={artist.isFollowed}
            followerCount={artist.followerCount}
          />
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
