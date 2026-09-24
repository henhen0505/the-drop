import type { NotificationItem } from '@the-drop/types';
import { formatRelativeTime } from '../../utils/format';
import styles from './NotificationRow.module.css';

interface NotificationRowProps {
  notification: NotificationItem;
  onClick: () => void;
}

export function NotificationRow({ notification, onClick }: NotificationRowProps) {
  const isUnread = notification.readAt === null;

  return (
    <button
      type="button"
      className={`${styles.row} ${isUnread ? styles.unread : ''}`}
      onClick={onClick}
    >
      {isUnread && <span className={styles.dot} aria-hidden="true" />}
      <div className={styles.body}>
        <p className={styles.title}>{notification.title}</p>
        {notification.body && <p className={styles.text}>{notification.body}</p>}
        <p className={styles.time}>{formatRelativeTime(notification.createdAt)}</p>
      </div>
    </button>
  );
}
