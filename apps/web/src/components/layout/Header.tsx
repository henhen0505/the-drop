import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import { NotificationBell } from '../notifications/NotificationBell';
import { NotificationDropdown } from '../notifications/NotificationDropdown';
import { SearchBar } from '../search/SearchBar';
import { MobileNav } from './MobileNav';
import styles from './Header.module.css';

const NAV_LINKS = [{ to: '/events', label: 'Discover' }];

export function Header() {
  const { user, isAuthenticated, logout } = useAuth();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const { unreadCount } = useNotifications({ enabled: isAuthenticated });

  async function handleLogout() {
    await logout();
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link to="/" className={styles.brand}>
          The Drop
        </Link>
        <nav className={styles.nav}>
          {NAV_LINKS.map((link) => (
            <Link key={link.to} to={link.to} className={styles.navLink}>
              {link.label}
            </Link>
          ))}
          {isAuthenticated && (
            <>
              <Link to="/my-raves" className={styles.navLink}>
                My Raves
              </Link>
              <Link to="/submit" className={styles.navLink}>
                Submit Event
              </Link>
              {user?.role === 'ADMIN' && (
                <Link to="/admin/events" className={styles.navLink}>
                  Admin
                </Link>
              )}
            </>
          )}
        </nav>
        <div className={styles.center}>
          <SearchBar />
        </div>
        <div className={styles.right}>
          {isAuthenticated ? (
            <>
              <div className={styles.notifWrapper}>
                <NotificationBell
                  unreadCount={unreadCount}
                  isOpen={isNotifOpen}
                  onClick={() => setIsNotifOpen((open) => !open)}
                />
                {isNotifOpen && (
                  <NotificationDropdown onClose={() => setIsNotifOpen(false)} />
                )}
              </div>
              <Link to="/profile" className={styles.userName}>
                {user?.displayName}
              </Link>
              <button type="button" className={styles.logoutButton} onClick={handleLogout}>
                Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className={styles.authLink}>
                Log in
              </Link>
              <Link to="/register" className={styles.authLink}>
                Register
              </Link>
            </>
          )}
        </div>
        <button
          type="button"
          className={styles.hamburger}
          aria-label="Open menu"
          onClick={() => setIsMobileNavOpen(true)}
        >
          {'☰'}
        </button>
      </div>
      <MobileNav isOpen={isMobileNavOpen} onClose={() => setIsMobileNavOpen(false)} />
    </header>
  );
}
