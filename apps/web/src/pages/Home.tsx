import { Link } from 'react-router-dom';
import { EventCardGrid } from '../components/events/EventCardGrid';
import { RecommendationCard } from '../components/recommendations/RecommendationCard';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import { useUpcomingEvents } from '../hooks/useEvents';
import { useRecommendations } from '../hooks/useRecommendations';
import styles from './Home.module.css';

export default function Home() {
  const { isAuthenticated, user } = useAuth();
  const recommendations = useRecommendations({ enabled: isAuthenticated });
  const upcoming = useUpcomingEvents();

  const recommendationItems = recommendations.data?.pages[0]?.data ?? [];
  const upcomingEvents = upcoming.data?.pages[0]?.data ?? [];

  return (
    <div className={styles.page}>
      {isAuthenticated ? (
        <section className={styles.section}>
          <h1 className={styles.heading}>Welcome back{user ? `, ${user.displayName}` : ''}</h1>
        </section>
      ) : (
        <section className={styles.hero}>
          <h1 className={styles.heroTitle}>Find your next rave</h1>
          <p className={styles.heroSubtitle}>
            Discover EDM events, lineups, and tickets in one place.
          </p>
          <Link to="/events" className={styles.heroCta}>
            Browse events
          </Link>
        </section>
      )}

      {isAuthenticated && (
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Recommended For You</h2>
          {recommendations.isLoading ? (
            <LoadingSpinner />
          ) : recommendations.isError ? (
            <EmptyState
              title="Couldn't load recommendations"
              description="Please try again later."
            />
          ) : recommendationItems.length === 0 ? (
            <EmptyState
              title="No recommendations yet"
              description="Follow artists and genres to get personalized picks."
            />
          ) : (
            <div className={styles.recommendationGrid}>
              {recommendationItems.map((item) => (
                <RecommendationCard key={item.event.id} recommendation={item} />
              ))}
            </div>
          )}
        </section>
      )}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionHeading}>Upcoming Events</h2>
          <Link to="/events" className={styles.viewAll}>
            View all
          </Link>
        </div>
        {upcoming.isLoading ? (
          <LoadingSpinner />
        ) : upcoming.isError ? (
          <EmptyState title="Couldn't load events" description="Please try again later." />
        ) : (
          <EventCardGrid events={upcomingEvents} emptyTitle="No upcoming events" />
        )}
      </section>
    </div>
  );
}
