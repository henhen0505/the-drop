import { useEffect, useState } from 'react';
import type { NotificationPreferences } from '@the-drop/types';
import { GenrePreferencePicker } from '../components/profile/GenrePreferencePicker';
import { NotificationToggles } from '../components/profile/NotificationToggles';
import { ProfileForm } from '../components/profile/ProfileForm';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { useGenrePreferences, MAX_GENRE_PREFERENCES } from '../hooks/useGenrePreferences';
import { useGenres } from '../hooks/useGenres';
import { useNotificationPreferences } from '../hooks/useNotificationPreferences';
import { useProfile } from '../hooks/useProfile';
import styles from './Profile.module.css';

export default function Profile() {
  const {
    profile,
    isLoading: isProfileLoading,
    update: updateProfile,
    isUpdating,
    updateError: profileUpdateError,
  } = useProfile();
  const { data: genreTree, isLoading: isGenreTreeLoading } = useGenres();
  const {
    preferences: genrePreferences,
    isLoading: isGenrePrefsLoading,
    update: updateGenrePreferences,
    isUpdating: isSavingGenres,
    updateError: genreUpdateError,
  } = useGenrePreferences();
  const {
    preferences: notificationPreferences,
    isLoading: isNotifPrefsLoading,
    update: updateNotificationPreferences,
    updateError: notificationUpdateError,
  } = useNotificationPreferences();

  const [selectedGenreIds, setSelectedGenreIds] = useState<string[]>([]);

  useEffect(() => {
    if (genrePreferences) {
      setSelectedGenreIds(genrePreferences.map((genre) => genre.id));
    }
  }, [genrePreferences]);

  function handleNotificationToggle(key: keyof NotificationPreferences, value: boolean) {
    updateNotificationPreferences({ [key]: value });
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Profile</h1>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Account</h2>
        {isProfileLoading ? (
          <LoadingSpinner />
        ) : profile ? (
          <ProfileForm user={profile} onSave={updateProfile} isSaving={isUpdating} />
        ) : (
          <p className={styles.error}>Couldn&apos;t load your profile.</p>
        )}
        {profileUpdateError && (
          <p className={styles.error}>Couldn&apos;t save your profile. Try again.</p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Genre Preferences</h2>
        {isGenreTreeLoading || isGenrePrefsLoading ? (
          <LoadingSpinner />
        ) : genreTree ? (
          <div className={styles.genreSection}>
            <GenrePreferencePicker
              genres={genreTree}
              selectedIds={selectedGenreIds}
              onChange={setSelectedGenreIds}
              max={MAX_GENRE_PREFERENCES}
            />
            <button
              type="button"
              className={styles.saveButton}
              onClick={() => updateGenrePreferences(selectedGenreIds)}
              disabled={isSavingGenres}
            >
              {isSavingGenres ? 'Saving...' : 'Save genre preferences'}
            </button>
          </div>
        ) : (
          <p className={styles.error}>Couldn&apos;t load genres.</p>
        )}
        {genreUpdateError && (
          <p className={styles.error}>Couldn&apos;t save genre preferences. Try again.</p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionHeading}>Notifications</h2>
        {isNotifPrefsLoading ? (
          <LoadingSpinner />
        ) : notificationPreferences ? (
          <NotificationToggles
            preferences={notificationPreferences}
            onChange={handleNotificationToggle}
          />
        ) : (
          <p className={styles.error}>Couldn&apos;t load notification preferences.</p>
        )}
        {notificationUpdateError && (
          <p className={styles.error}>Couldn&apos;t save notification preferences. Try again.</p>
        )}
      </section>
    </div>
  );
}
