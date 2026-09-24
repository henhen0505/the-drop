import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AdminSidebar } from './AdminSidebar';
import styles from './AdminLayout.module.css';

/** react-router-dom v6 layout-route component for the /admin route group --
 * rendered by `<Route element={<AdminRoute><AdminLayout /></AdminRoute>}>`,
 * child routes render into `<Outlet />`. Below 900px the sidebar is
 * collapsed behind a toggle, mirroring FilterSidebar's mobile-collapse
 * pattern. */
export function AdminLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className={styles.layout}>
      <button
        type="button"
        className={styles.mobileTrigger}
        onClick={() => setIsSidebarOpen((prev) => !prev)}
      >
        Menu {isSidebarOpen ? '−' : '+'}
      </button>
      <AdminSidebar isOpen={isSidebarOpen} />
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  );
}
