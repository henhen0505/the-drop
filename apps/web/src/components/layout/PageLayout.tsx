import { Outlet } from 'react-router-dom';
import { Footer } from './Footer';
import { Header } from './Header';
import styles from './PageLayout.module.css';

/** react-router-dom v6 layout-route component -- rendered by a parent
 * `<Route element={<PageLayout />}>` with child routes rendering into
 * `<Outlet />`. */
export function PageLayout() {
  return (
    <>
      <Header />
      <main className={styles.main}>
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
