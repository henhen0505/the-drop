import { Link } from 'react-router-dom';
import styles from './NotFound.module.css';

export default function NotFound() {
  return (
    <div className={styles.wrapper}>
      <p className={styles.code}>404</p>
      <h1>Page not found</h1>
      <Link to="/">Go home</Link>
    </div>
  );
}
