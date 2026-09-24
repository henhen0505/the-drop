import { Link, NavLink } from 'react-router-dom';
import styles from './AdminSidebar.module.css';

const NAV_LINKS = [
  { to: '/admin/events', label: 'Events' },
  { to: '/admin/submissions', label: 'Submissions' },
  { to: '/admin/dedup', label: 'Dedup Review' },
  { to: '/admin/sync', label: 'Sync Status' },
];

interface AdminSidebarProps {
  /** Below the 900px breakpoint the sidebar is collapsed unless toggled
   * open (see AdminLayout). Ignored at/above the breakpoint, where it's
   * always visible. */
  isOpen: boolean;
}

export function AdminSidebar({ isOpen }: AdminSidebarProps) {
  return (
    <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : ''}`}>
      <div className={styles.brand}>Admin</div>
      <nav className={styles.nav}>
        {NAV_LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.activeLink : ''}`}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <Link to="/" className={styles.backLink}>
        Back to site
      </Link>
    </aside>
  );
}
