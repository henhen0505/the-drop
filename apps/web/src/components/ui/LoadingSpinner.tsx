import styles from './LoadingSpinner.module.css';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
}

export function LoadingSpinner({ size = 'md' }: LoadingSpinnerProps) {
  return (
    <div className={styles.wrapper} role="status" aria-label="Loading">
      <span className={`${styles.spinner} ${styles[size]}`} />
    </div>
  );
}
