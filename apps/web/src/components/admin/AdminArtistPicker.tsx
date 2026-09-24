import { useState } from 'react';
import { useDebounce } from '../../hooks/useDebounce';
import { useArtistSearch } from '../../hooks/admin/useArtistSearch';
import styles from './AdminArtistPicker.module.css';

export interface AdminArtistPickerValue {
  id: string;
  name: string;
}

interface AdminArtistPickerProps {
  selected: AdminArtistPickerValue[];
  onChange: (selected: AdminArtistPickerValue[]) => void;
  max?: number;
}

const DEBOUNCE_MS = 300;
const DEFAULT_MAX = 50; // matches admin-event.validation.ts idList(50) for artistIds

/** Debounced search-and-multi-select for an event's lineup. The first
 * selected artist is the headliner (billing order = selection order), per
 * admin-event.service.ts replaceArtists. */
export function AdminArtistPicker({ selected, onChange, max = DEFAULT_MAX }: AdminArtistPickerProps) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, DEBOUNCE_MS);
  const { data: results, isLoading } = useArtistSearch(debouncedQuery.trim());

  const selectedIds = new Set(selected.map((artist) => artist.id));
  const atMax = selected.length >= max;

  function addArtist(id: string, name: string) {
    if (selectedIds.has(id) || atMax) return;
    onChange([...selected, { id, name }]);
    setQuery('');
  }

  function removeArtist(id: string) {
    onChange(selected.filter((artist) => artist.id !== id));
  }

  return (
    <div className={styles.wrapper}>
      {selected.length > 0 && (
        <ol className={styles.tags}>
          {selected.map((artist, index) => (
            <li key={artist.id} className={styles.tag}>
              {index === 0 && <span className={styles.headliner}>Headliner</span>}
              {artist.name}
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove ${artist.name}`}
                onClick={() => removeArtist(artist.id)}
              >
                {'×'}
              </button>
            </li>
          ))}
        </ol>
      )}
      <input
        type="text"
        className={styles.input}
        placeholder={atMax ? `Max ${max} artists` : 'Search artists'}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        disabled={atMax}
      />
      {query.trim().length >= 2 && (
        <div className={styles.results}>
          {isLoading && <p className={styles.status}>Searching...</p>}
          {!isLoading && results?.length === 0 && <p className={styles.status}>No artists found.</p>}
          {results
            ?.filter((artist) => !selectedIds.has(artist.id))
            .map((artist) => (
              <button
                key={artist.id}
                type="button"
                className={styles.result}
                onClick={() => addArtist(artist.id, artist.name)}
              >
                {artist.name}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
