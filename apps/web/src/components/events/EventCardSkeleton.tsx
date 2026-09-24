import styles from './EventCardSkeleton.module.css';

/** Shimmer placeholder matching EventCard's dimensions, for the initial
 * loading state of event grids (see EventDiscovery). */
export function EventCardSkeleton() {
  return (
    <div className={styles.card} aria-hidden="true">
      <div className={styles.imageWrapper} />
      <div className={styles.body}>
        <div className={`${styles.line} ${styles.date}`} />
        <div className={`${styles.line} ${styles.title}`} />
        <div className={`${styles.line} ${styles.venue}`} />
        <div className={`${styles.line} ${styles.price}`} />
      </div>
    </div>
  );
}
