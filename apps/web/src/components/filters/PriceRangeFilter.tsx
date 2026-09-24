import type { EventFilters, SetFilterFn } from '../../hooks/useEventFilters';
import styles from './PriceRangeFilter.module.css';

interface PriceRangeFilterProps {
  filters: EventFilters;
  setFilter: SetFilterFn;
}

function centsToDollars(cents: number | undefined): string {
  return cents !== undefined ? String(Math.round(cents / 100)) : '';
}

function dollarsToCents(dollars: string): number | undefined {
  if (dollars === '') return undefined;
  const parsed = Number(dollars);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
}

export function PriceRangeFilter({ filters, setFilter }: PriceRangeFilterProps) {
  return (
    <div className={styles.group}>
      <h3 className={styles.label}>Price</h3>
      <div className={styles.row}>
        <label className={styles.fieldLabel}>
          Min ($)
          <input
            type="number"
            min={0}
            value={centsToDollars(filters.priceMin)}
            onChange={(event) => setFilter('priceMin', dollarsToCents(event.target.value))}
          />
        </label>
        <label className={styles.fieldLabel}>
          Max ($)
          <input
            type="number"
            min={0}
            value={centsToDollars(filters.priceMax)}
            onChange={(event) => setFilter('priceMax', dollarsToCents(event.target.value))}
          />
        </label>
      </div>
    </div>
  );
}
