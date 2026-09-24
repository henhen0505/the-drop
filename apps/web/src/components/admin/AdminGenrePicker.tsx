import { useGenres } from '../../hooks/useGenres';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import styles from './AdminGenrePicker.module.css';

interface AdminGenrePickerProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

// admin-event.validation.ts idList(20) caps genreIds at 20.
const MAX_GENRES = 20;

/** Checkbox grid grouped by parent genre, for the admin event form. Unlike
 * GenrePreferencePicker (Profile page), this is a plain controlled
 * multi-select with no self-save -- the parent form submits it alongside
 * the rest of the event fields. */
export function AdminGenrePicker({ selectedIds, onChange }: AdminGenrePickerProps) {
  const { data: genres, isLoading } = useGenres();
  const atMax = selectedIds.length >= MAX_GENRES;

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((selectedId) => selectedId !== id));
    } else if (!atMax) {
      onChange([...selectedIds, id]);
    }
  }

  if (isLoading) return <LoadingSpinner size="sm" />;
  if (!genres) return <p className={styles.error}>Couldn&apos;t load genres.</p>;

  return (
    <div className={styles.wrapper}>
      <p className={styles.count}>
        {selectedIds.length} / {MAX_GENRES} selected
      </p>
      <div className={styles.groups}>
        {genres.map((group) => (
          <div key={group.id} className={styles.group}>
            <h4 className={styles.groupLabel}>{group.name}</h4>
            <div className={styles.checkboxGrid}>
              {group.children.length === 0 ? (
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(group.id)}
                    disabled={!selectedIds.includes(group.id) && atMax}
                    onChange={() => toggle(group.id)}
                  />
                  {group.name}
                </label>
              ) : (
                group.children.map((child) => (
                  <label key={child.id} className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(child.id)}
                      disabled={!selectedIds.includes(child.id) && atMax}
                      onChange={() => toggle(child.id)}
                    />
                    {child.name}
                  </label>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
