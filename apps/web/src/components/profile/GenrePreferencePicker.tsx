import type { GenreNode } from '@the-drop/types';
import styles from './GenrePreferencePicker.module.css';

interface GenrePreferencePickerProps {
  genres: GenreNode[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  max: number;
}

export function GenrePreferencePicker({
  genres,
  selectedIds,
  onChange,
  max,
}: GenrePreferencePickerProps) {
  const atMax = selectedIds.length >= max;

  function toggle(id: string) {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((selectedId) => selectedId !== id));
    } else if (!atMax) {
      onChange([...selectedIds, id]);
    }
  }

  return (
    <div className={styles.wrapper}>
      <p className={styles.count}>
        {selectedIds.length} / {max} selected
      </p>
      <div className={styles.groups}>
        {genres.map((group) => (
          <div key={group.id} className={styles.group}>
            <h4 className={styles.groupLabel}>{group.name}</h4>
            <div className={styles.checkboxGrid}>
              {/* Top-level genres with no children are selectable directly;
                  genres with children only expose their children (the
                  current dataset is at most 1-2 levels deep). */}
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
