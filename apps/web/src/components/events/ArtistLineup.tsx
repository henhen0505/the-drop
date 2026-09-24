import { Link } from 'react-router-dom';
import type { ArtistDetail } from '@the-drop/types';
import styles from './ArtistLineup.module.css';

interface ArtistLineupProps {
  artists: ArtistDetail[];
}

export function ArtistLineup({ artists }: ArtistLineupProps) {
  if (artists.length === 0) return null;

  // Stable sort: headliners first, otherwise preserving the lineup's
  // existing (sortOrder-derived) order.
  const sorted = [...artists].sort((a, b) => Number(b.isHeadliner) - Number(a.isHeadliner));

  return (
    <ul className={styles.list}>
      {sorted.map((artist) => (
        <li key={artist.id} className={styles.item}>
          <Link to={`/artists/${artist.slug}`} className={styles.link}>
            {artist.imageUrl ? (
              <img src={artist.imageUrl} alt="" className={styles.image} />
            ) : (
              <div className={styles.imagePlaceholder} aria-hidden="true" />
            )}
            <div className={styles.info}>
              <div className={styles.nameRow}>
                <span className={styles.name}>{artist.name}</span>
                {artist.isHeadliner && <span className={styles.headlinerBadge}>HEADLINER</span>}
              </div>
              {artist.genres.length > 0 && (
                <div className={styles.genres}>
                  {artist.genres.map((genre) => (
                    <span key={genre.id} className={styles.genreTag}>
                      {genre.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
