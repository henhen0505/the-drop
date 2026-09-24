import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useArtistFollow } from '../../hooks/useArtistFollow';
import styles from './FollowButton.module.css';

interface FollowButtonProps {
  artistId: string;
  slug: string;
  isFollowed: boolean;
  followerCount: number;
}

export function FollowButton({ artistId, slug, isFollowed, followerCount }: FollowButtonProps) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { follow, unfollow, isPending, isError } = useArtistFollow(artistId, slug);

  function handleClick() {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (isFollowed) {
      unfollow();
    } else {
      follow();
    }
  }

  return (
    <div className={styles.wrapper}>
      <button
        type="button"
        className={`${styles.button} ${isFollowed ? styles.following : ''}`}
        aria-pressed={isFollowed}
        onClick={handleClick}
        disabled={isPending}
      >
        {isFollowed ? 'Following' : 'Follow'}
      </button>
      <span className={styles.count}>
        {followerCount} {followerCount === 1 ? 'follower' : 'followers'}
      </span>
      {isError && <p className={styles.error}>Couldn&apos;t save. Try again.</p>}
    </div>
  );
}
