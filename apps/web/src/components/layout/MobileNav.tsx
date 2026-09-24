import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import styles from './MobileNav.module.css';

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileNav({ isOpen, onClose }: MobileNavProps) {
  const { user, isAuthenticated, logout } = useAuth();

  if (!isOpen) return null;

  async function handleLogout() {
    await logout();
    onClose();
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Close menu"
        >
          {'×'}
        </button>
        <nav className={styles.nav}>
          <Link to="/" onClick={onClose}>
            Home
          </Link>
          <Link to="/events" onClick={onClose}>
            Discover
          </Link>
          {isAuthenticated && (
            <>
              <Link to="/my-raves" onClick={onClose}>
                My Raves
              </Link>
              <Link to="/submit" onClick={onClose}>
                Submit Event
              </Link>
              <Link to="/profile" onClick={onClose}>
                Profile
              </Link>
            </>
          )}
        </nav>
        <div className={styles.auth}>
          {isAuthenticated ? (
            <>
              <span className={styles.userName}>{user?.displayName}</span>
              <button type="button" onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={onClose}>
                Log in
              </Link>
              <Link to="/register" onClick={onClose}>
                Register
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
