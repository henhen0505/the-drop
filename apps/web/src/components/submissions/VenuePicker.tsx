import { useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { useVenueSearch } from '../../hooks/useVenueSearch';
import styles from './VenuePicker.module.css';

export type VenuePickerMode = 'search' | 'manual';

export interface VenuePickerValue {
  mode: VenuePickerMode;
  venueId: string | null;
  venueNameRaw: string;
  venueAddressRaw: string;
}

interface VenuePickerProps {
  value: VenuePickerValue;
  onChange: (value: VenuePickerValue) => void;
}

const DEBOUNCE_MS = 300;

export function VenuePicker({ value, onChange }: VenuePickerProps) {
  const [query, setQuery] = useState(value.venueId ? value.venueNameRaw : '');
  const debouncedQuery = useDebounce(query, DEBOUNCE_MS);
  const { data: results, isLoading } = useVenueSearch(debouncedQuery.trim());

  function switchMode(mode: VenuePickerMode) {
    onChange({ mode, venueId: null, venueNameRaw: '', venueAddressRaw: '' });
    setQuery('');
  }

  function selectVenue(id: string, name: string) {
    onChange({ mode: 'search', venueId: id, venueNameRaw: name, venueAddressRaw: '' });
    setQuery(name);
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.modeToggle}>
        <button
          type="button"
          className={`${styles.modeButton} ${value.mode === 'search' ? styles.activeMode : ''}`}
          onClick={() => switchMode('search')}
        >
          Search existing venue
        </button>
        <button
          type="button"
          className={`${styles.modeButton} ${value.mode === 'manual' ? styles.activeMode : ''}`}
          onClick={() => switchMode('manual')}
        >
          Enter manually
        </button>
      </div>

      {value.mode === 'search' ? (
        <div className={styles.searchField}>
          <input
            type="text"
            placeholder="Venue name"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (value.venueId) {
                onChange({ mode: 'search', venueId: null, venueNameRaw: '', venueAddressRaw: '' });
              }
            }}
          />
          {value.venueId && <p className={styles.selected}>Selected: {value.venueNameRaw}</p>}
          {!value.venueId && query.trim().length >= 2 && (
            <div className={styles.results}>
              {isLoading && <p className={styles.status}>Searching...</p>}
              {!isLoading && results?.length === 0 && (
                <p className={styles.status}>No venues found. Try entering manually.</p>
              )}
              {results?.map((venue) => (
                <button
                  key={venue.id}
                  type="button"
                  className={styles.result}
                  onClick={() => selectVenue(venue.id, venue.name)}
                >
                  {venue.name} &middot; {venue.city}
                  {venue.state ? `, ${venue.state}` : ''}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.manualFields}>
          <input
            type="text"
            placeholder="Venue name"
            maxLength={200}
            value={value.venueNameRaw}
            onChange={(event) =>
              onChange({ ...value, mode: 'manual', venueId: null, venueNameRaw: event.target.value })
            }
          />
          <input
            type="text"
            placeholder="Venue address (optional)"
            maxLength={300}
            value={value.venueAddressRaw}
            onChange={(event) =>
              onChange({ ...value, mode: 'manual', venueId: null, venueAddressRaw: event.target.value })
            }
          />
        </div>
      )}
    </div>
  );
}
