import styles from './NotificationBell.module.css';

interface NotificationBellProps {
  unreadCount: number;
  isOpen: boolean;
  onClick: () => void;
}

const MAX_DISPLAYED_COUNT = 99;

export function NotificationBell({ unreadCount, isOpen, onClick }: NotificationBellProps) {
  return (
    <button
      type="button"
      className={styles.bell}
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      aria-expanded={isOpen}
      onClick={onClick}
    >
      {'\u{1F514}'}
      {unreadCount > 0 && (
        <span className={styles.badge}>
          {unreadCount > MAX_DISPLAYED_COUNT ? `${MAX_DISPLAYED_COUNT}+` : unreadCount}
        </span>
      )}
    </button>
  );
}
