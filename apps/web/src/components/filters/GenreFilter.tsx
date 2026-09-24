import type { GenreNode } from '@the-drop/types';
import { useGenres } from '../../hooks/useGenres';
import type { EventFilters, SetFilterFn } from '../../hooks/useEventFilters';
import styles from './GenreFilter.module.css';

interface GenreFilterProps {
  filters: EventFilters;
  setFilter: SetFilterFn;
}

interface FlatGenre {
  id: string;
  name: string;
  depth: number;
}

// The backend's genreId filter is a single value, so the tree is flattened
// into one indented <select> rather than a nested picker.
function flattenGenres(nodes: GenreNode[], depth = 0): FlatGenre[] {
  return nodes.flatMap((node) => [
    { id: node.id, name: node.name, depth },
    ...flattenGenres(node.children, depth + 1),
  ]);
}

export function GenreFilter({ filters, setFilter }: GenreFilterProps) {
  const { data: genres, isLoading } = useGenres();
  const flat = genres ? flattenGenres(genres) : [];

  return (
    <div className={styles.group}>
      <h3 className={styles.label}>Genre</h3>
      <select
        value={filters.genreId ?? ''}
        onChange={(event) => setFilter('genreId', event.target.value || undefined)}
        disabled={isLoading}
      >
        <option value="">All genres</option>
        {flat.map((genre) => (
          <option key={genre.id} value={genre.id}>
            {'  '.repeat(genre.depth)}
            {genre.name}
          </option>
        ))}
      </select>
    </div>
  );
}
