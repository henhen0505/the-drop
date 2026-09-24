import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDebounce } from '../../hooks/useDebounce';
import { AutocompleteDropdown } from './AutocompleteDropdown';
import styles from './SearchBar.module.css';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
// Long enough to let a dropdown item's onClick fire before blur hides it.
const BLUR_CLOSE_DELAY_MS = 150;

export function SearchBar() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const debouncedQuery = useDebounce(query, DEBOUNCE_MS);

  function goToSearch(raw: string) {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return;
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    setIsFocused(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    goToSearch(query);
  }

  const trimmedDebounced = debouncedQuery.trim();
  const showDropdown = isFocused && trimmedDebounced.length >= MIN_QUERY_LENGTH;

  return (
    <form className={styles.wrapper} onSubmit={handleSubmit} role="search">
      <input
        type="search"
        className={styles.input}
        placeholder="Search events, artists, venues"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), BLUR_CLOSE_DELAY_MS)}
      />
      <button type="submit" className={styles.searchButton} aria-label="Search">
        {'\u{1F50D}'}
      </button>
      {showDropdown && (
        <AutocompleteDropdown
          query={trimmedDebounced}
          onNavigate={() => setIsFocused(false)}
          onViewAll={() => goToSearch(trimmedDebounced)}
        />
      )}
    </form>
  );
}
