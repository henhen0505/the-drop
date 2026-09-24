import styles from './StreamingLinks.module.css';

interface StreamingLinksProps {
  spotifyUrl: string | null;
  soundcloudUrl: string | null;
  appleMusicUrl: string | null;
}

const LINKS: { key: keyof StreamingLinksProps; label: string }[] = [
  { key: 'spotifyUrl', label: 'Spotify' },
  { key: 'soundcloudUrl', label: 'SoundCloud' },
  { key: 'appleMusicUrl', label: 'Apple Music' },
];

export function StreamingLinks(props: StreamingLinksProps) {
  const links = LINKS.filter((link) => props[link.key]);
  if (links.length === 0) return null;

  return (
    <div className={styles.wrapper}>
      {links.map((link) => (
        <a
          key={link.key}
          href={props[link.key] ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.pill}
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}
