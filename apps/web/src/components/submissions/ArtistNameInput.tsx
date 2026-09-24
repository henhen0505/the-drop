import { useState, type KeyboardEvent } from 'react';
import styles from './ArtistNameInput.module.css';

interface ArtistNameInputProps {
  names: string[];
  onChange: (names: string[]) => void;
  max: number;
}

export function ArtistNameInput({ names, onChange, max }: ArtistNameInputProps) {
  const [draft, setDraft] = useState('');

  function addTag() {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || names.length >= max || names.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...names, trimmed]);
    setDraft('');
  }

  function removeTag(name: string) {
    onChange(names.filter((n) => n !== name));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag();
    } else if (event.key === 'Backspace' && draft.length === 0 && names.length > 0) {
      const last = names[names.length - 1];
      if (last !== undefined) removeTag(last);
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.tags}>
        {names.map((name) => (
          <span key={name} className={styles.tag}>
            {name}
            <button
              type="button"
              className={styles.remove}
              aria-label={`Remove ${name}`}
              onClick={() => removeTag(name)}
            >
              {'×'}
            </button>
          </span>
        ))}
        <input
          type="text"
          className={styles.input}
          placeholder={names.length === 0 ? 'Artist name, press Enter to add' : ''}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={addTag}
          disabled={names.length >= max}
        />
      </div>
      <p className={styles.count}>
        {names.length} / {max}
      </p>
    </div>
  );
}
