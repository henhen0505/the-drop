import { useState } from 'react';
import { useEventFilters } from '../../hooks/useEventFilters';
import { AgeFilter } from './AgeFilter';
import { CityFilter } from './CityFilter';
import { DateRangeFilter } from './DateRangeFilter';
import { GenreFilter } from './GenreFilter';
import { PriceRangeFilter } from './PriceRangeFilter';
import styles from './FilterSidebar.module.css';

export function FilterSidebar() {
  const { filters, setFilter, clearFilters } = useEventFilters();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <aside className={styles.wrapper}>
      <button
        type="button"
        className={styles.mobileTrigger}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        Filters {isOpen ? '−' : '+'}
      </button>
      <div className={`${styles.panel} ${isOpen ? styles.panelOpen : ''}`}>
        <div className={styles.header}>
          <h2 className={styles.heading}>Filters</h2>
          <button type="button" className={styles.clearButton} onClick={clearFilters}>
            Clear All
          </button>
        </div>
        <DateRangeFilter filters={filters} setFilter={setFilter} />
        <GenreFilter filters={filters} setFilter={setFilter} />
        <CityFilter filters={filters} setFilter={setFilter} />
        <PriceRangeFilter filters={filters} setFilter={setFilter} />
        <AgeFilter filters={filters} setFilter={setFilter} />
      </div>
    </aside>
  );
}
