import { useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useNotifications } from '../../hooks/useNotifications';
import { NotificationRow } from './NotificationRow';
import styles from './NotificationDropdown.module.css';

const RECENT_LIMIT = 10;

interface NotificationDropdownProps {
  onClose: () => void;
}

export function NotificationDropdown({ onClose }: NotificationDropdownProps) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement | null>(null);
  const { notifications, isLoading, markRead, markAllRead } = useNotifications({
    limit: RECENT_LIMIT,
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  function handleRowClick(id: string, readAt: string | null, data: Record<string, unknown> | null) {
    if (readAt === null) {
      markRead(id);
    }
    const eventId = data?.eventId;
    if (typeof eventId === 'string') {
      navigate(`/events/${eventId}`);
      onClose();
    }
  }

  return (
    <div className={styles.dropdown} ref={ref}>
      <div className={styles.header}>
        <span className={styles.headerTitle}>Notifications</span>
        <button type="button" className={styles.markAll} onClick={() => markAllRead()}>
          Mark all as read
        </button>
      </div>
      <div className={styles.list}>
        {isLoading && <p className={styles.status}>Loading...</p>}
        {!isLoading && notifications.length === 0 && (
          <p className={styles.status}>No notifications yet.</p>
        )}
        {notifications.map((notification) => (
          <NotificationRow
            key={notification.id}
            notification={notification}
            onClick={() => handleRowClick(notification.id, notification.readAt, notification.data)}
          />
        ))}
      </div>
      <Link to="/notifications" className={styles.viewAll} onClick={onClose}>
        View all
      </Link>
    </div>
  );
}
