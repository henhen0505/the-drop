import { useState } from 'react';
import type { UserEventState } from '@the-drop/types';
import { RaveCard } from '../components/raves/RaveCard';
import { RaveStateTabs, type RaveTab } from '../components/raves/RaveStateTabs';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useMyRaves } from '../hooks/useMyRaves';
import styles from './MyRaves.module.css';

const TAB_QUERY: Record<RaveTab, { states?: UserEventState[]; upcoming: boolean }> = {
  all: { upcoming: true },
  interested: { states: ['INTERESTED'], upcoming: true },
  going: { states: ['GOING'], upcoming: true },
  have_ticket: { states: ['HAVE_TICKET'], upcoming: true },
  past: { upcoming: false },
};

const EMPTY_MESSAGES: Record<RaveTab, string> = {
  all: 'Save events by tapping Interested, Going, or Have Ticket on an event page.',
  interested: "You haven't marked any upcoming events as Interested.",
  going: "You haven't marked any upcoming events as Going.",
  have_ticket: "You don't have tickets for any upcoming events.",
  past: 'Past events you saved will show up here.',
};

export default function MyRaves() {
  const [activeTab, setActiveTab] = useState<RaveTab>('all');
  const { states, upcoming } = TAB_QUERY[activeTab];

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMyRaves({ states, upcoming });
  const { sentinelRef } = useInfiniteScroll({
    fetchNextPage,
    hasNextPage: hasNextPage ?? false,
    isFetchingNextPage,
  });

  const raves = data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>My Raves</h1>
      <RaveStateTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <EmptyState title="Couldn't load your raves" description="Please try again later." />
      ) : raves.length === 0 ? (
        <EmptyState title="Nothing here yet" description={EMPTY_MESSAGES[activeTab]} />
      ) : (
        <>
          <div className={styles.grid}>
            {raves.map((rave) => (
              <RaveCard key={rave.event.id} rave={rave} />
            ))}
          </div>
          {hasNextPage && <div ref={sentinelRef} className={styles.sentinel} />}
          {isFetchingNextPage && <LoadingSpinner size="sm" />}
        </>
      )}
    </div>
  );
}
