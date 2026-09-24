import styles from './ScoreBar.module.css';

interface ScoreBarProps {
  label: string;
  value: number;
}

/** Labeled percentage bar for a 0-1 score -- used 4x per dedup candidate
 * card (venue/date/title/artist factor scores) plus once for the overall
 * composite score. */
export function ScoreBar({ label, value }: ScoreBarProps) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={styles.wrapper}>
      <div className={styles.labelRow}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{pct}%</span>
      </div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
