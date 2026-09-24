import { useEffect, useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import type { EventFilters, SetFilterFn } from '../../hooks/useEventFilters';
import styles from './CityFilter.module.css';

const DEBOUNCE_MS = 300;

interface CityFilterProps {
  filters: EventFilters;
  setFilter: SetFilterFn;
}

export function CityFilter({ filters, setFilter }: CityFilterProps) {
  const [value, setValue] = useState(filters.city ?? '');
  const debounced = useDebounce(value, DEBOUNCE_MS);

  useEffect(() => {
    if (debounced !== (filters.city ?? '')) {
      setFilter('city', debounced || undefined);
    }
    // Only the debounced value should re-trigger this: filters.city and
    // setFilter are read fresh on each run without needing to be deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <div className={styles.group}>
      <h3 className={styles.label}>City</h3>
      <input
        type="text"
        placeholder="e.g. Brooklyn"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </div>
  );
}
