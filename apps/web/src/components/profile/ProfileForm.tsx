import { useState, type FormEvent } from 'react';
import type { User } from '@the-drop/types';
import styles from './ProfileForm.module.css';

interface ProfileFormProps {
  user: User;
  onSave: (changes: Partial<User>) => void;
  isSaving: boolean;
}

function centsToDollarsInput(cents: number | null): string {
  return cents === null ? '' : String(cents / 100);
}

function dollarsInputToCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return Math.round(Number(trimmed) * 100);
}

export function ProfileForm({ user, onSave, isSaving }: ProfileFormProps) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [preferredCity, setPreferredCity] = useState(user.preferredCity ?? '');
  const [preferredState, setPreferredState] = useState(user.preferredState ?? '');
  const [travelRadiusKm, setTravelRadiusKm] = useState(
    user.travelRadiusKm !== null ? String(user.travelRadiusKm) : '',
  );
  const [priceMin, setPriceMin] = useState(centsToDollarsInput(user.priceMin));
  const [priceMax, setPriceMax] = useState(centsToDollarsInput(user.priceMax));

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const changes: Partial<User> = {};
    if (displayName !== user.displayName) changes.displayName = displayName;
    if (preferredCity !== (user.preferredCity ?? '')) changes.preferredCity = preferredCity || null;
    if (preferredState !== (user.preferredState ?? '')) {
      changes.preferredState = preferredState || null;
    }
    const radius = travelRadiusKm.trim().length > 0 ? Number(travelRadiusKm) : null;
    if (radius !== user.travelRadiusKm && radius !== null) changes.travelRadiusKm = radius;
    const minCents = dollarsInputToCents(priceMin);
    if (minCents !== user.priceMin) changes.priceMin = minCents;
    const maxCents = dollarsInputToCents(priceMax);
    if (maxCents !== user.priceMax) changes.priceMax = maxCents;

    if (Object.keys(changes).length > 0) {
      onSave(changes);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label htmlFor="displayName">Display name</label>
        <input
          id="displayName"
          type="text"
          maxLength={100}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
        />
      </div>
      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="preferredCity">Preferred city</label>
          <input
            id="preferredCity"
            type="text"
            maxLength={100}
            value={preferredCity}
            onChange={(event) => setPreferredCity(event.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="preferredState">State</label>
          <input
            id="preferredState"
            type="text"
            maxLength={2}
            value={preferredState}
            onChange={(event) => setPreferredState(event.target.value.toUpperCase())}
          />
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor="travelRadiusKm">Travel radius (km)</label>
        <input
          id="travelRadiusKm"
          type="number"
          min={1}
          max={500}
          value={travelRadiusKm}
          onChange={(event) => setTravelRadiusKm(event.target.value)}
        />
      </div>
      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="priceMin">Min price ($)</label>
          <input
            id="priceMin"
            type="number"
            min={0}
            value={priceMin}
            onChange={(event) => setPriceMin(event.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="priceMax">Max price ($)</label>
          <input
            id="priceMax"
            type="number"
            min={0}
            value={priceMax}
            onChange={(event) => setPriceMax(event.target.value)}
          />
        </div>
      </div>
      <button type="submit" className={styles.submit} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save profile'}
      </button>
    </form>
  );
}
