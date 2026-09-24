import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NotificationRow } from '../components/notifications/NotificationRow';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useNotifications } from '../hooks/useNotifications';
import styles from './Notifications.module.css';

export default function Notifications() {
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const {
    notifications,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    markRead,
    markAllRead,
  } = useNotifications({ unreadOnly: unreadOnly || undefined });
  const { sentinelRef } = useInfiniteScroll({ fetchNextPage, hasNextPage, isFetchingNextPage });

  function handleRowClick(id: string, readAt: string | null, data: Record<string, unknown> | null) {
    if (readAt === null) {
      markRead(id);
    }
    const eventId = data?.eventId;
    if (typeof eventId === 'string') {
      navigate(`/events/${eventId}`);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Notifications</h1>
        <div className={styles.actions}>
          <label className={styles.filter}>
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(event) => setUnreadOnly(event.target.checked)}
            />
            Unread only
          </label>
          <button type="button" className={styles.markAll} onClick={() => markAllRead()}>
            Mark all as read
          </button>
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <EmptyState title="Couldn't load notifications" description="Please try again later." />
      ) : notifications.length === 0 ? (
        <EmptyState
          title="No notifications"
          description={unreadOnly ? "You're all caught up." : "You don't have any notifications yet."}
        />
      ) : (
        <>
          <div className={styles.list}>
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onClick={() =>
                  handleRowClick(notification.id, notification.readAt, notification.data)
                }
              />
            ))}
          </div>
          {hasNextPage && <div ref={sentinelRef} className={styles.sentinel} />}
          {isFetchingNextPage && <LoadingSpinner size="sm" />}
        </>
      )}
    </div>
  );
}
