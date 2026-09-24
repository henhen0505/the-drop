import type { EventFilters, SetFilterFn } from '../../hooks/useEventFilters';
import styles from './DateRangeFilter.module.css';

interface DateRangeFilterProps {
  filters: EventFilters;
  setFilter: SetFilterFn;
}

export function DateRangeFilter({ filters, setFilter }: DateRangeFilterProps) {
  return (
    <div className={styles.group}>
      <h3 className={styles.label}>Date</h3>
      <div className={styles.row}>
        <label className={styles.fieldLabel}>
          From
          <input
            type="date"
            value={filters.startsAfter?.slice(0, 10) ?? ''}
            onChange={(event) => setFilter('startsAfter', event.target.value || undefined)}
          />
        </label>
        <label className={styles.fieldLabel}>
          To
          <input
            type="date"
            value={filters.startsBefore?.slice(0, 10) ?? ''}
            onChange={(event) => setFilter('startsBefore', event.target.value || undefined)}
          />
        </label>
      </div>
    </div>
  );
}
