import { EventCardGrid } from '../components/events/EventCardGrid';
import { EventCardSkeleton } from '../components/events/EventCardSkeleton';
import { FilterSidebar } from '../components/filters/FilterSidebar';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useFilteredEvents } from '../hooks/useFilteredEvents';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import styles from './EventDiscovery.module.css';

const SKELETON_COUNT = 6;

export default function EventDiscovery() {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useFilteredEvents();
  const { sentinelRef } = useInfiniteScroll({
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
  });

  const events = data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className={styles.layout}>
      <FilterSidebar />
      <div className={styles.content}>
        {isLoading ? (
          <div className={styles.skeletonGrid}>
            {Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <EventCardSkeleton key={index} />
            ))}
          </div>
        ) : isError ? (
          <EmptyState title="Couldn't load events" description="Please try again later." />
        ) : (
          <>
            <EventCardGrid
              events={events}
              emptyTitle="No events match your filters"
              emptyDescription="Try widening your date range or clearing a filter."
            />
            {hasNextPage && <div ref={sentinelRef} className={styles.sentinel} />}
            {isFetchingNextPage && <LoadingSpinner size="sm" />}
          </>
        )}
      </div>
    </div>
  );
}
