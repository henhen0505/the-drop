import { Link } from 'react-router-dom';
import type { AutocompleteItem } from '@the-drop/types';
import { useAutocomplete } from '../../hooks/useAutocomplete';
import styles from './AutocompleteDropdown.module.css';

interface AutocompleteDropdownProps {
  query: string;
  onNavigate: () => void;
  onViewAll: () => void;
}

type AutocompleteType = AutocompleteItem['type'];

const SECTION_LABELS: Record<AutocompleteType, string> = {
  event: 'Events',
  artist: 'Artists',
  venue: 'Venues',
};

const TYPE_ORDER: AutocompleteType[] = ['event', 'artist', 'venue'];

function routeFor(item: AutocompleteItem): string {
  switch (item.type) {
    case 'event':
      return `/events/${item.slug}`;
    case 'artist':
      return `/artists/${item.slug}`;
    case 'venue':
      return `/venues/${item.slug}`;
  }
}

export function AutocompleteDropdown({ query, onNavigate, onViewAll }: AutocompleteDropdownProps) {
  const { data, isLoading } = useAutocomplete(query);

  if (isLoading) {
    return (
      <div className={styles.dropdown}>
        <p className={styles.status}>Searching...</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className={styles.dropdown}>
        <p className={styles.status}>No matches</p>
      </div>
    );
  }

  const groups: Record<AutocompleteType, AutocompleteItem[]> = {
    event: [],
    artist: [],
    venue: [],
  };
  for (const item of data) {
    groups[item.type].push(item);
  }

  return (
    <div className={styles.dropdown}>
      {TYPE_ORDER.filter((type) => groups[type].length > 0).map((type) => (
        <div key={type} className={styles.section}>
          <p className={styles.sectionHeader}>{SECTION_LABELS[type]}</p>
          {groups[type].map((item) => (
            <Link key={item.id} to={routeFor(item)} className={styles.item} onClick={onNavigate}>
              <span className={styles.name}>{item.name}</span>
              <span className={styles.subtitle}>{item.subtitle}</span>
            </Link>
          ))}
        </div>
      ))}
      <button type="button" className={styles.viewAll} onClick={onViewAll}>
        View all results
      </button>
    </div>
  );
}
