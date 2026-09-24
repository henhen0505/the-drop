import type { EventFilters, SetFilterFn } from '../../hooks/useEventFilters';
import styles from './AgeFilter.module.css';

interface AgeFilterProps {
  filters: EventFilters;
  setFilter: SetFilterFn;
}

const AGE_OPTIONS = ['All Ages', '18+', '21+'];

export function AgeFilter({ filters, setFilter }: AgeFilterProps) {
  return (
    <div className={styles.group}>
      <h3 className={styles.label}>Age Restriction</h3>
      <select
        value={filters.ageRestriction ?? ''}
        onChange={(event) => setFilter('ageRestriction', event.target.value || undefined)}
      >
        <option value="">Any</option>
        {AGE_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
